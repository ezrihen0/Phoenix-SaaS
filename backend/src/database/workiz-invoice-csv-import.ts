import "dotenv/config";
import "reflect-metadata";

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { normalizeName } from "./workiz/workiz-customer-csv-parser";
import {
  deriveInvoicePaidStatus,
  deriveTaxRateBps,
  getDiscountCents,
  loadUniqueWorkizInvoiceCsv,
  validateInvoiceFinancials,
  type WorkizInvoiceCsvRow,
} from "./workiz/workiz-invoice-csv-parser";
import {
  buildCsvProvenanceSnapshot,
  loadExistingWorkizImportIndex,
  upsertHistoricalWorkizInvoice,
  type WorkizHistoricalInvoiceInput,
} from "./workiz/workiz-invoice-upsert";
import {
  excludedWorkizCustomerReason,
  isExcludedWorkizCustomer,
  isExcludedWorkizCustomerEmail,
} from "./workiz/workiz-customer-exclusion";
import {
  assertWorkizProductionMutationAllowed,
  buildWorkizMutationGuardContext,
  PHOENIX_ORG_ID,
  PHOENIX_ORG_SLUG,
} from "./workiz/workiz-production-mutation-guard";
import type { ExistingWorkizImportIndex } from "./workiz/workiz-invoice-upsert";
const DEFAULT_SOURCE_DIR = "C:\\Users\\edenz\\OneDrive\\שולחן העבודה\\Business\\Workiz\\invoices";

export type CustomerMatchOutcome =
  | { kind: "matched"; customerId: string; customerName: string; strategy: "email" | "name" }
  | { kind: "ambiguous"; reason: string; candidateIds: string[] }
  | { kind: "unmatched"; reason: string };

export type InvoiceImportAction =
  | "import"
  | "duplicate"
  | "ambiguous"
  | "unmatched"
  | "rejected";

export type WorkizInvoiceImportRecord = {
  invoiceCode: string;
  action: InvoiceImportAction;
  customerMatch: CustomerMatchOutcome | null;
  financialMismatch: boolean;
  financialMismatchReason: string | null;
  rejectedReason: string | null;
  source: WorkizInvoiceCsvRow;
  mapped: WorkizHistoricalInvoiceInput | null;
};

export type WorkizInvoiceCsvImportReport = {
  mode: "preview" | "execute";
  sourceDirectory: string;
  sourceFiles: number;
  uniqueSourceFiles: number;
  skippedDuplicateFiles: string[];
  sourceFile: string;
  sourceRows: number;
  uniqueInvoices: number;
  duplicateSourceInvoices: number;
  matchedByPhone: number;
  matchedByEmail: number;
  matchedByNameAddress: number;
  customerAmbiguous: number;
  customerUnmatched: number;
  validInvoices: number;
  financialMismatch: number;
  malformedRejected: number;
  totalInvoicedValueCents: number;
  totalPaidCents: number;
  totalOutstandingCents: number;
  imported: number;
  skippedDuplicates: number;
  rejected: number;
  crossTenantWrites: number;
  preExistingForeignWorkizImports: number;
  phoenixOrganizationId: string;
  phoenixOrganizationName: string;
  schemaErrors: string[];
  stopReason: string | null;
  mappingExamples: Array<{
    label: string;
    workiz: Record<string, string | number | null>;
    customer: Record<string, string | null>;
    wizfield: Record<string, string | number | null>;
  }>;
  financialMismatchExamples: Array<{ invoiceCode: string; reason: string | null }>;
  suspiciousRecords: Array<{ invoiceCode: string; reason: string }>;
  records: WorkizInvoiceImportRecord[];
};

type CustomerIndexes = {
  byEmail: Map<string, CustomerEntity[]>;
  byName: Map<string, CustomerEntity[]>;
};

function buildCustomerIndexes(customers: CustomerEntity[]): CustomerIndexes {
  const byEmail = new Map<string, CustomerEntity[]>();
  const byName = new Map<string, CustomerEntity[]>();

  for (const customer of customers) {
    if (isExcludedWorkizCustomer(customer)) continue;
    const email = customer.email?.trim().toLowerCase();
    if (email) {
      const group = byEmail.get(email) ?? [];
      group.push(customer);
      byEmail.set(email, group);
    }

    const nameKey = normalizeName(customer.full_name);
    if (nameKey) {
      const group = byName.get(nameKey) ?? [];
      group.push(customer);
      byName.set(nameKey, group);
    }
  }

  return { byEmail, byName };
}

function matchCustomer(row: WorkizInvoiceCsvRow, indexes: CustomerIndexes): CustomerMatchOutcome {
  if (row.email) {
    const emailMatches = indexes.byEmail.get(row.email) ?? [];
    if (emailMatches.length === 1) {
      return {
        kind: "matched",
        customerId: emailMatches[0].id,
        customerName: emailMatches[0].full_name,
        strategy: "email",
      };
    }
    if (emailMatches.length > 1) {
      return {
        kind: "ambiguous",
        reason: `Multiple Phoenix customers share email ${row.email}`,
        candidateIds: emailMatches.map((customer) => customer.id),
      };
    }
  }

  const nameKey = normalizeName(row.clientName);
  if (nameKey) {
    const nameMatches = indexes.byName.get(nameKey) ?? [];
    if (nameMatches.length === 1) {
      return {
        kind: "matched",
        customerId: nameMatches[0].id,
        customerName: nameMatches[0].full_name,
        strategy: "name",
      };
    }
    if (nameMatches.length > 1) {
      return {
        kind: "ambiguous",
        reason: `Multiple Phoenix customers share name ${row.clientName}`,
        candidateIds: nameMatches.map((customer) => customer.id),
      };
    }
  }

  return {
    kind: "unmatched",
    reason: row.email
      ? `No Phoenix customer found for email ${row.email}`
      : `No unique Phoenix customer found for name ${row.clientName}`,
  };
}

function buildHistoricalInvoiceInput(
  row: WorkizInvoiceCsvRow,
  sourceFile: string,
  importedAt: string,
  financialMismatch: boolean,
  mismatchReason: string | null,
): WorkizHistoricalInvoiceInput | null {
  if (row.createdAt == null) return null;
  if (row.totalCents == null) return null;

  const subtotalCents = row.subtotalCents ?? row.totalCents;
  const taxCents = row.taxCents ?? 0;
  const paid = deriveInvoicePaidStatus(row);
  const lineDescription = row.jobName?.trim() || "Historical Workiz service";
  const payments = paid && row.totalCents > 0
    ? [{
      amountCents: row.totalCents,
      occurredAt: row.paidAtHint ?? row.createdAt,
      methodLabel: "derived_from_csv_balance",
    }]
    : [];

  return {
    invoiceCode: row.invoiceCode,
    jobCode: row.jobCode,
    invoiceDate: row.createdAt,
    dueDate: row.createdAt,
    subtotalCents,
    taxCents,
    taxRateBps: deriveTaxRateBps(row),
    totalCents: row.totalCents,
    paid,
    paidAt: paid ? (row.paidAtHint ?? row.createdAt) : null,
    lineItems: [{
      description: lineDescription,
      quantity: 1,
      unitPriceCents: subtotalCents,
      amountCents: subtotalCents,
    }],
    payments,
    notes: row.statusRaw ? `Workiz status: ${row.statusRaw}` : null,
    provenance: JSON.parse(buildCsvProvenanceSnapshot({
      invoiceCode: row.invoiceCode,
      jobCode: row.jobCode,
      sourceFilename: sourceFile,
      importedAt,
      financialMismatch,
      statusRaw: row.statusRaw,
      mismatchReason,
    })),
  };
}

function classifyRow(
  row: WorkizInvoiceCsvRow,
  customerMatch: CustomerMatchOutcome,
  sourceFile: string,
  importedAt: string,
): WorkizInvoiceImportRecord {
  const financial = validateInvoiceFinancials(row);
  const hardRejectReasons: string[] = [];

  if (!row.clientName.trim()) hardRejectReasons.push("missing client name");
  if (row.createdAt == null) hardRejectReasons.push("invalid created date");
  if (row.totalCents == null) hardRejectReasons.push("invalid total amount");
  if (financial.invalidTotal) hardRejectReasons.push("negative total");
  if (financial.invalidDue) hardRejectReasons.push("negative amount due");
  if (financial.dueExceedsTotal) hardRejectReasons.push("amount due exceeds total");

  if (hardRejectReasons.length > 0) {
    return {
      invoiceCode: row.invoiceCode,
      action: "rejected",
      customerMatch,
      financialMismatch: financial.financialMismatch,
      financialMismatchReason: financial.mismatchReason,
      rejectedReason: hardRejectReasons.join("; "),
      source: row,
      mapped: null,
    };
  }

  if (isExcludedWorkizCustomerEmail(row.email)) {
    return {
      invoiceCode: row.invoiceCode,
      action: "rejected",
      customerMatch: null,
      financialMismatch: financial.financialMismatch,
      financialMismatchReason: financial.mismatchReason,
      rejectedReason: excludedWorkizCustomerReason(row.email),
      source: row,
      mapped: null,
    };
  }

  if (customerMatch.kind === "ambiguous") {
    return {
      invoiceCode: row.invoiceCode,
      action: "ambiguous",
      customerMatch,
      financialMismatch: financial.financialMismatch,
      financialMismatchReason: financial.mismatchReason,
      rejectedReason: customerMatch.reason,
      source: row,
      mapped: null,
    };
  }

  if (customerMatch.kind === "unmatched") {
    return {
      invoiceCode: row.invoiceCode,
      action: "unmatched",
      customerMatch,
      financialMismatch: financial.financialMismatch,
      financialMismatchReason: financial.mismatchReason,
      rejectedReason: customerMatch.reason,
      source: row,
      mapped: null,
    };
  }

  const mapped = buildHistoricalInvoiceInput(
    row,
    sourceFile,
    importedAt,
    financial.financialMismatch,
    financial.mismatchReason,
  );

  if (!mapped) {
    return {
      invoiceCode: row.invoiceCode,
      action: "rejected",
      customerMatch,
      financialMismatch: financial.financialMismatch,
      financialMismatchReason: financial.mismatchReason,
      rejectedReason: "failed to map invoice payload",
      source: row,
      mapped: null,
    };
  }

  return {
    invoiceCode: row.invoiceCode,
    action: "import",
    customerMatch,
    financialMismatch: financial.financialMismatch,
    financialMismatchReason: financial.mismatchReason,
    rejectedReason: null,
    source: row,
    mapped,
  };
}

export function projectWorkizCsvImportExecuteOutcome(input: {
  records: WorkizInvoiceImportRecord[];
  existingIndex: ExistingWorkizImportIndex;
}) {
  let imported = 0;
  let skippedDuplicates = 0;

  for (const record of input.records) {
    if (record.action !== "import" || !record.mapped || !record.customerMatch || record.customerMatch.kind !== "matched") {
      continue;
    }

    if (input.existingIndex.has(record.invoiceCode)) {
      skippedDuplicates += 1;
      continue;
    }

    imported += 1;
  }

  return {
    imported,
    skippedDuplicates,
    crossTenantWrites: 0,
    preExistingForeignWorkizImports: 0,
  };
}

function buildMappingExamples(
  records: WorkizInvoiceImportRecord[],
): WorkizInvoiceCsvImportReport["mappingExamples"] {
  const examples: WorkizInvoiceCsvImportReport["mappingExamples"] = [];

  const add = (label: string, record: WorkizInvoiceImportRecord | undefined) => {
    if (!record?.mapped || !record.customerMatch || record.customerMatch.kind !== "matched") return;
    if (examples.some((example) => example.label === label)) return;

    examples.push({
      label,
      workiz: {
        invoiceCode: record.source.invoiceCode,
        client: record.source.clientName,
        email: record.source.email,
        created: record.source.createdAt?.toISOString() ?? null,
        subtotalCents: record.source.subtotalCents,
        discountCents: getDiscountCents(record.source.discount),
        taxCents: record.source.taxCents,
        totalCents: record.source.totalCents,
        amountDueCents: record.source.amountDueCents,
        status: record.source.statusRaw,
        jobName: record.source.jobName,
      },
      customer: {
        id: record.customerMatch.customerId,
        full_name: record.customerMatch.customerName,
        matchStrategy: record.customerMatch.strategy,
      },
      wizfield: {
        description: record.mapped.invoiceCode ? `Workiz Invoice #${record.mapped.invoiceCode}` : null,
        totalCents: record.mapped.totalCents,
        subtotalCents: record.mapped.subtotalCents,
        taxCents: record.mapped.taxCents,
        status: record.mapped.paid ? "paid" : "unpaid",
        lineItem: record.mapped.lineItems[0]?.description ?? null,
        paymentCents: record.mapped.payments[0]?.amountCents ?? null,
      },
    });
  };

  add("Standard paid invoice", records.find((record) => record.source.invoiceCode === "KMRQZK"));
  add("Invoice with job name", records.find((record) => Boolean(record.source.jobName)));
  add("Financial mismatch", records.find((record) => record.financialMismatch));
  add("Zero-total invoice", records.find((record) => (record.source.totalCents ?? 0) === 0));
  add("Name-only customer match", records.find((record) => record.customerMatch?.kind === "matched" && record.customerMatch.strategy === "name"));
  add("Outstanding balance", records.find((record) => (record.source.amountDueCents ?? 0) > 0));

  return examples.slice(0, 8);
}

async function verifyPhoenixOrganization(dataSource: DataSource) {
  const organization = await dataSource.getRepository(OrganizationEntity).findOne({
    where: { id: PHOENIX_ORG_ID },
  });

  if (!organization) {
    throw new Error(`Phoenix organization not found for id ${PHOENIX_ORG_ID}`);
  }

  if (organization.slug !== PHOENIX_ORG_SLUG) {
    throw new Error(`Phoenix organization slug mismatch: expected ${PHOENIX_ORG_SLUG}, found ${organization.slug}`);
  }

  return organization;
}

export async function runWorkizInvoiceCsvImport(options: {
  execute: boolean;
  allowProductionMutation?: boolean;
}): Promise<WorkizInvoiceCsvImportReport> {
  const sourceDirectory = process.env.WORKIZ_INVOICE_CSV_SOURCE_DIR ?? DEFAULT_SOURCE_DIR;
  const parsedSource = loadUniqueWorkizInvoiceCsv(sourceDirectory);
  const importedAt = new Date().toISOString();

  const report: WorkizInvoiceCsvImportReport = {
    mode: options.execute ? "execute" : "preview",
    sourceDirectory,
    sourceFiles: parsedSource.filesDiscovered,
    uniqueSourceFiles: parsedSource.uniqueFiles,
    skippedDuplicateFiles: parsedSource.skippedDuplicateFiles,
    sourceFile: parsedSource.sourceFile,
    sourceRows: parsedSource.rows.length,
    uniqueInvoices: parsedSource.rows.length,
    duplicateSourceInvoices: parsedSource.duplicateInvoiceCodes.length,
    matchedByPhone: 0,
    matchedByEmail: 0,
    matchedByNameAddress: 0,
    customerAmbiguous: 0,
    customerUnmatched: 0,
    validInvoices: 0,
    financialMismatch: 0,
    malformedRejected: 0,
    totalInvoicedValueCents: 0,
    totalPaidCents: 0,
    totalOutstandingCents: 0,
    imported: 0,
    skippedDuplicates: 0,
    rejected: 0,
    crossTenantWrites: 0,
    preExistingForeignWorkizImports: 0,
    phoenixOrganizationId: PHOENIX_ORG_ID,
    phoenixOrganizationName: "",
    schemaErrors: parsedSource.schemaErrors,
    stopReason: null,
    mappingExamples: [],
    financialMismatchExamples: [],
    suspiciousRecords: [],
    records: [],
  };

  if (parsedSource.schemaErrors.length > 0) {
    report.stopReason = parsedSource.schemaErrors.join("; ");
    return report;
  }

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const organization = await verifyPhoenixOrganization(dataSource);
    report.phoenixOrganizationName = organization.name;

    const customers = await dataSource.getRepository(CustomerEntity).find({
      where: { organization_id: PHOENIX_ORG_ID },
    });
    const indexes = buildCustomerIndexes(customers);
    const existingIndex = await loadExistingWorkizImportIndex(dataSource, PHOENIX_ORG_ID);

    const records = parsedSource.rows.map((row) => {
      const customerMatch = matchCustomer(row, indexes);
      return classifyRow(row, customerMatch, parsedSource.sourceFile, importedAt);
    });
    report.records = records;

    for (const record of records) {
      if (record.customerMatch?.kind === "matched") {
        if (record.customerMatch.strategy === "email") report.matchedByEmail += 1;
        if (record.customerMatch.strategy === "name") report.matchedByNameAddress += 1;
      }
      if (record.action === "ambiguous") report.customerAmbiguous += 1;
      if (record.action === "unmatched") report.customerUnmatched += 1;
      if (record.action === "rejected") report.malformedRejected += 1;
      if (record.financialMismatch) {
        report.financialMismatch += 1;
        if (report.financialMismatchExamples.length < 10) {
          report.financialMismatchExamples.push({
            invoiceCode: record.invoiceCode,
            reason: record.financialMismatchReason,
          });
        }
      }

      if (record.action === "import") {
        if (!record.financialMismatch) report.validInvoices += 1;
        if (record.source.totalCents != null) {
          report.totalInvoicedValueCents += record.source.totalCents;
          report.totalPaidCents += record.source.amountPaidCents ?? 0;
          report.totalOutstandingCents += record.source.amountDueCents ?? 0;
        }
        if (record.financialMismatch) {
          report.suspiciousRecords.push({
            invoiceCode: record.invoiceCode,
            reason: record.financialMismatchReason ?? "financial mismatch",
          });
        }
        if (record.source.discount.kind === "invalid") {
          report.suspiciousRecords.push({
            invoiceCode: record.invoiceCode,
            reason: `Unparseable discount: ${record.source.discount.rawValue}`,
          });
        }
      }
    }

    report.mappingExamples = buildMappingExamples(records);

    if (!options.execute) {
      report.imported = records.filter((record) => record.action === "import").length;
      return report;
    }

    assertWorkizProductionMutationAllowed(buildWorkizMutationGuardContext({
      dataSourceOptions: dataSource.options as MysqlConnectionOptions,
      organizationId: PHOENIX_ORG_ID,
      organizationSlug: organization.slug,
      allowProductionMutation: options.allowProductionMutation,
      commandLabel: "workiz-invoice-csv-import",
    }));

    const importedInvoiceIds: string[] = [];

    for (const record of records) {
      if (record.action !== "import" || !record.mapped || !record.customerMatch || record.customerMatch.kind !== "matched") {
        if (record.action === "rejected") report.rejected += 1;
        continue;
      }

      const existing = existingIndex.get(record.invoiceCode);
      if (existing) {
        report.skippedDuplicates += 1;
        continue;
      }

      const result = await upsertHistoricalWorkizInvoice({
        dataSource,
        organizationId: PHOENIX_ORG_ID,
        historical: record.mapped,
        customerId: record.customerMatch.customerId,
      });

      existingIndex.set(record.invoiceCode, {
        invoiceId: result.invoiceId,
        jobId: result.jobId,
        invoiceCode: record.invoiceCode,
      });

      if (result.created) {
        report.imported += 1;
        importedInvoiceIds.push(result.invoiceId);
      } else {
        report.skippedDuplicates += 1;
      }
    }

    if (importedInvoiceIds.length > 0) {
      const crossTenantCreated = await dataSource.getRepository(InvoiceEntity)
        .createQueryBuilder("invoice")
        .where("invoice.id IN (:...ids)", { ids: importedInvoiceIds })
        .andWhere("invoice.organization_id <> :organizationId", { organizationId: PHOENIX_ORG_ID })
        .getCount();
      report.crossTenantWrites = crossTenantCreated;
      if (crossTenantCreated > 0) {
        throw new Error(`Cross-tenant write detected: ${crossTenantCreated} invoices created outside Phoenix org`);
      }
    }

    report.preExistingForeignWorkizImports = await dataSource.getRepository(InvoiceEntity)
      .createQueryBuilder("invoice")
      .where("invoice.organization_id <> :organizationId", { organizationId: PHOENIX_ORG_ID })
      .andWhere("invoice.branding_snapshot_json LIKE :source", { source: "%workiz_historical_import%" })
      .getCount();
  } finally {
    await dataSource.destroy();
  }

  return report;
}

function printPreviewSummary(report: WorkizInvoiceCsvImportReport) {
  console.log("SOURCE FILES:", `${report.sourceFiles} (${report.uniqueSourceFiles} unique, ${report.skippedDuplicateFiles.length} skipped as identical)`);
  console.log("SOURCE ROWS:", report.sourceRows);
  console.log("UNIQUE INVOICES:", report.uniqueInvoices);
  console.log("DUPLICATE SOURCE INVOICES:", report.duplicateSourceInvoices);
  console.log("MATCHED BY PHONE:", report.matchedByPhone);
  console.log("MATCHED BY EMAIL:", report.matchedByEmail);
  console.log("MATCHED BY NAME+ADDRESS:", report.matchedByNameAddress, "(name-only; address unavailable in CSV)");
  console.log("CUSTOMER AMBIGUOUS:", report.customerAmbiguous);
  console.log("CUSTOMER UNMATCHED:", report.customerUnmatched);
  console.log("VALID INVOICES:", report.validInvoices);
  console.log("FINANCIAL_MISMATCH:", report.financialMismatch);
  console.log("MALFORMED/REJECTED:", report.malformedRejected);
  console.log("TOTAL INVOICED VALUE:", (report.totalInvoicedValueCents / 100).toFixed(2));
  console.log("TOTAL PAID:", (report.totalPaidCents / 100).toFixed(2));
  console.log("TOTAL OUTSTANDING:", (report.totalOutstandingCents / 100).toFixed(2));

  if (report.mappingExamples.length > 0) {
    console.log("\nMAPPING EXAMPLES:");
    for (const example of report.mappingExamples) {
      console.log(JSON.stringify(example, null, 2));
    }
  }

  if (report.financialMismatchExamples.length > 0) {
    console.log("\nFINANCIAL_MISMATCH EXAMPLES:");
    for (const example of report.financialMismatchExamples.slice(0, 5)) {
      console.log(`- ${example.invoiceCode}: ${example.reason}`);
    }
  }

  if (report.stopReason) {
    console.log("\nSTOP REASON:", report.stopReason);
  }
}

async function main() {
  const execute = process.argv.includes("--execute");
  const report = await runWorkizInvoiceCsvImport({
    execute,
    allowProductionMutation: execute,
  });

  printPreviewSummary(report);

  const reportDir = join(process.cwd(), "_runtime_harness");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    join(reportDir, execute ? "workiz-invoice-csv-import-execute.json" : "workiz-invoice-csv-import-preview.json"),
    JSON.stringify({
      ...report,
      records: report.records.map((record) => ({
        invoiceCode: record.invoiceCode,
        action: record.action,
        customerMatch: record.customerMatch,
        financialMismatch: record.financialMismatch,
        financialMismatchReason: record.financialMismatchReason,
        rejectedReason: record.rejectedReason,
      })),
    }, null, 2),
  );

  console.log("\nFULL REPORT JSON:");
  console.log(JSON.stringify({
    mode: report.mode,
    sourceDirectory: report.sourceDirectory,
    sourceFiles: report.sourceFiles,
    uniqueSourceFiles: report.uniqueSourceFiles,
    skippedDuplicateFiles: report.skippedDuplicateFiles,
    sourceRows: report.sourceRows,
    uniqueInvoices: report.uniqueInvoices,
    duplicateSourceInvoices: report.duplicateSourceInvoices,
    matchedByPhone: report.matchedByPhone,
    matchedByEmail: report.matchedByEmail,
    matchedByNameAddress: report.matchedByNameAddress,
    customerAmbiguous: report.customerAmbiguous,
    customerUnmatched: report.customerUnmatched,
    validInvoices: report.validInvoices,
    financialMismatch: report.financialMismatch,
    malformedRejected: report.malformedRejected,
    totalInvoicedValueCents: report.totalInvoicedValueCents,
    totalPaidCents: report.totalPaidCents,
    totalOutstandingCents: report.totalOutstandingCents,
    imported: report.imported,
    skippedDuplicates: report.skippedDuplicates,
    rejected: report.rejected,
    crossTenantWrites: report.crossTenantWrites,
    preExistingForeignWorkizImports: report.preExistingForeignWorkizImports,
    phoenixOrganizationId: report.phoenixOrganizationId,
    phoenixOrganizationName: report.phoenixOrganizationName,
    mappingExamples: report.mappingExamples,
    financialMismatchExamples: report.financialMismatchExamples,
    suspiciousRecords: report.suspiciousRecords,
    stopReason: report.stopReason,
  }, null, 2));

  if (report.stopReason) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
