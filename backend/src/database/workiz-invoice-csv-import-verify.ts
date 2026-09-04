import "dotenv/config";
import "reflect-metadata";

import { DataSource } from "typeorm";

import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import {
  loadUniqueWorkizInvoiceCsv,
} from "./workiz/workiz-invoice-csv-parser";
import { normalizeName } from "./workiz/workiz-customer-csv-parser";
import {
  projectWorkizCsvImportExecuteOutcome,
  runWorkizInvoiceCsvImport,
} from "./workiz-invoice-csv-import";
import { loadExistingWorkizImportIndex, WORKIZ_HISTORICAL_IMPORT_SOURCE } from "./workiz/workiz-invoice-upsert";
import { PHOENIX_ORG_ID, PHOENIX_ORG_SLUG } from "./workiz/workiz-production-mutation-guard";

const DEFAULT_SOURCE_DIR = "C:\\Users\\edenz\\OneDrive\\שולחן העבודה\\Business\\Workiz\\invoices";

type Snapshot = {
  import_source?: string;
  source_kind?: string;
  workiz_invoice_code?: string;
  financial_mismatch?: boolean;
};

type SampleCheck = {
  invoiceCode: string;
  field: string;
  sourceValue: string | number | null;
  dbValue: string | number | null;
  match: boolean;
};

function parseSnapshot(invoice: InvoiceEntity): Snapshot | null {
  if (!invoice.branding_snapshot_json) return null;
  try {
    return JSON.parse(invoice.branding_snapshot_json) as Snapshot;
  } catch {
    return null;
  }
}

function pickSampleCodes(codes: string[], sampleSize: number): string[] {
  if (codes.length <= sampleSize) return codes;
  const picked = new Set<string>();
  while (picked.size < sampleSize) {
    picked.add(codes[Math.floor(Math.random() * codes.length)]);
  }
  return Array.from(picked);
}

export async function runWorkizInvoiceCsvImportVerify(): Promise<Record<string, unknown>> {
  const sourceDirectory = process.env.WORKIZ_INVOICE_CSV_SOURCE_DIR ?? DEFAULT_SOURCE_DIR;
  const parsedSource = loadUniqueWorkizInvoiceCsv(sourceDirectory);
  const sourceByCode = new Map(parsedSource.rows.map((row) => [row.invoiceCode, row]));

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const organization = await dataSource.getRepository(OrganizationEntity).findOne({
      where: { id: PHOENIX_ORG_ID },
    });
    if (!organization) throw new Error(`Phoenix organization not found: ${PHOENIX_ORG_ID}`);
    if (organization.slug !== PHOENIX_ORG_SLUG) {
      throw new Error(`Phoenix slug mismatch: expected ${PHOENIX_ORG_SLUG}, found ${organization.slug}`);
    }

    const invoiceRepo = dataSource.getRepository(InvoiceEntity);
    const jobRepo = dataSource.getRepository(JobEntity);
    const customerRepo = dataSource.getRepository(CustomerEntity);
    const paymentRepo = dataSource.getRepository(InvoicePaymentEntity);

    const phoenixInvoices = await invoiceRepo.find({ where: { organization_id: PHOENIX_ORG_ID } });
    const csvImported = phoenixInvoices.filter((invoice) => {
      const snapshot = parseSnapshot(invoice);
      return snapshot?.import_source === WORKIZ_HISTORICAL_IMPORT_SOURCE && snapshot.source_kind === "csv";
    });

    const importedCodes = csvImported
      .map((invoice) => parseSnapshot(invoice)?.workiz_invoice_code)
      .filter((code): code is string => Boolean(code));

    const duplicateCodes = new Map<string, number>();
    for (const code of importedCodes) {
      duplicateCodes.set(code, (duplicateCodes.get(code) ?? 0) + 1);
    }
    const duplicateInvoiceNumbers = Array.from(duplicateCodes.values()).filter((count) => count > 1).length;

    let linkedToCustomers = 0;
    let withoutCustomer = 0;
    let financialMismatchCount = 0;
    let totalHistoricalValueCents = 0;
    let totalPaidCents = 0;
    let totalOutstandingCents = 0;

    for (const invoice of csvImported) {
      totalHistoricalValueCents += invoice.total_cents;
      const job = await jobRepo.findOne({ where: { id: invoice.job_id, organization_id: PHOENIX_ORG_ID } });
      if (!job) {
        withoutCustomer += 1;
        continue;
      }
      const customer = await customerRepo.findOne({ where: { id: job.customer_id, organization_id: PHOENIX_ORG_ID } });
      if (customer) linkedToCustomers += 1;
      else withoutCustomer += 1;

      const payments = await paymentRepo.find({ where: { invoice_id: invoice.id } });
      totalPaidCents += payments.reduce((sum, payment) => sum + payment.amount_cents, 0);
      totalOutstandingCents += Math.max(invoice.total_cents - payments.reduce((sum, payment) => sum + payment.amount_cents, 0), 0);

      const snapshot = parseSnapshot(invoice);
      if (snapshot?.financial_mismatch) financialMismatchCount += 1;
    }

    const preview = await runWorkizInvoiceCsvImport({ execute: false });
    const existingIndex = await loadExistingWorkizImportIndex(dataSource, PHOENIX_ORG_ID);
    const projectedSecondRun = projectWorkizCsvImportExecuteOutcome({
      records: preview.records,
      existingIndex,
    });

    const sampleCodes = pickSampleCodes(importedCodes, 10);
    const sampleChecks: SampleCheck[] = [];
    for (const invoiceCode of sampleCodes) {
      const source = sourceByCode.get(invoiceCode);
      const invoice = csvImported.find((row) => parseSnapshot(row)?.workiz_invoice_code === invoiceCode);
      if (!source || !invoice) continue;

      const job = await jobRepo.findOne({ where: { id: invoice.job_id, organization_id: PHOENIX_ORG_ID } });
      const customer = job
        ? await customerRepo.findOne({ where: { id: job.customer_id, organization_id: PHOENIX_ORG_ID } })
        : null;

      const comparisons: Array<[string, string | number | null, string | number | null]> = [
        ["invoiceCode", source.invoiceCode, parseSnapshot(invoice)?.workiz_invoice_code ?? null],
        ["customerName", source.clientName, customer?.full_name ?? null],
        ["issuedAt", source.createdAt?.toISOString() ?? null, invoice.issued_at?.toISOString() ?? null],
        ["totalCents", source.totalCents, invoice.total_cents],
        ["amountDueCents", source.amountDueCents, Math.max(invoice.total_cents - (source.amountPaidCents ?? 0), 0)],
        ["status", source.statusRaw.includes("Paid") || (source.amountDueCents ?? 0) === 0 ? "paid" : "unpaid", invoice.status],
      ];

      for (const [field, sourceValue, dbValue] of comparisons) {
        let match = String(sourceValue ?? "") === String(dbValue ?? "");
        if (field === "customerName") {
          match = normalizeName(String(sourceValue ?? "")) === normalizeName(String(dbValue ?? ""));
        }
        if (field === "amountDueCents" && sourceValue == null && (source.totalCents ?? 0) === 0) {
          match = (dbValue ?? 0) === 0;
        }
        sampleChecks.push({
          invoiceCode,
          field,
          sourceValue,
          dbValue,
          match,
        });
      }
    }

    const sampleMismatchCount = sampleChecks.filter((check) => !check.match).length;

    return {
      mode: "read-only-verify",
      ok: projectedSecondRun.crossTenantWrites === 0 && projectedSecondRun.imported === 0 && sampleMismatchCount === 0,
      imported: csvImported.length,
      customerMatched: preview.matchedByEmail + preview.matchedByNameAddress,
      customerUnmatched: preview.customerUnmatched,
      skippedDuplicates: projectedSecondRun.skippedDuplicates,
      rejected: preview.customerAmbiguous + preview.customerUnmatched,
      financialMismatch: financialMismatchCount,
      phoenixTotalInvoices: phoenixInvoices.length,
      totalHistoricalInvoicedValueCents: totalHistoricalValueCents,
      totalPaidCents,
      totalOutstandingCents,
      invoicesLinkedToCustomers: linkedToCustomers,
      invoicesWithoutCustomer: withoutCustomer,
      duplicateInvoiceNumbers,
      crossTenantWrites: projectedSecondRun.crossTenantWrites,
      preExistingForeignWorkizImports: projectedSecondRun.preExistingForeignWorkizImports,
      secondRunNewRecords: projectedSecondRun.imported,
      projectedSecondRunImportedCodes: preview.records
        .filter((record) => record.action === "import"
          && record.customerMatch?.kind === "matched"
          && !existingIndex.has(record.invoiceCode))
        .map((record) => record.invoiceCode),
      sampleChecks,
      sampleMismatchCount,
      phoenixOrganizationId: PHOENIX_ORG_ID,
      phoenixOrganizationName: organization.name,
    };
  } finally {
    await dataSource.destroy();
  }
}

async function main() {
  const report = await runWorkizInvoiceCsvImportVerify();

  console.log("IMPORTED:", report.imported);
  console.log("CUSTOMER MATCHED:", report.customerMatched);
  console.log("CUSTOMER UNMATCHED:", report.customerUnmatched);
  console.log("SKIPPED/DUPLICATES:", report.skippedDuplicates);
  console.log("REJECTED:", report.rejected);
  console.log("UNMATCHED CUSTOMER:", report.customerUnmatched);
  console.log("FINANCIAL_MISMATCH:", report.financialMismatch);
  console.log("PHOENIX TOTAL INVOICES:", report.phoenixTotalInvoices);
  console.log("TOTAL HISTORICAL INVOICED VALUE:", ((report.totalHistoricalInvoicedValueCents as number) / 100).toFixed(2));
  console.log("TOTAL PAID:", ((report.totalPaidCents as number) / 100).toFixed(2));
  console.log("TOTAL OUTSTANDING:", ((report.totalOutstandingCents as number) / 100).toFixed(2));
  console.log("INVOICES LINKED TO CUSTOMERS:", report.invoicesLinkedToCustomers);
  console.log("INVOICES WITHOUT CUSTOMER:", report.invoicesWithoutCustomer);
  console.log("DUPLICATE INVOICE NUMBERS:", report.duplicateInvoiceNumbers);
  console.log("CROSS-TENANT WRITES:", report.crossTenantWrites);
  console.log("SECOND-RUN NEW RECORDS (PROJECTED):", report.secondRunNewRecords);
  console.log("\nSAMPLE CHECKS:");
  console.log(JSON.stringify(report.sampleChecks, null, 2));
  console.log("\nFULL VERIFY REPORT:");
  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
