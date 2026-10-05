import { DataSource } from "typeorm";

import { CustomerEntity } from "../entities/customer.entity";
import { normalizeName } from "../workiz/workiz-customer-csv-parser";
import { normalizeEmail } from "../workiz/workiz-invoice-parser";
import { loadJobberInvoicesCsv, type JobberInvoiceRow } from "./jobber-csv-parser";
import {
  buildJobberCsvProvenanceSnapshot,
  loadExistingJobberImportIndex,
  upsertHistoricalJobberInvoice,
  type JobberHistoricalInvoiceInput,
} from "./jobber-invoice-upsert";

export type JobberCustomerMatchOutcome =
  | { kind: "matched"; customerId: string; customerName: string; strategy: "email" | "phone" | "name" }
  | { kind: "ambiguous"; reason: string; candidateIds: string[] }
  | { kind: "unmatched"; reason: string };

export type JobberInvoiceImportAction =
  | "import"
  | "duplicate"
  | "ambiguous"
  | "unmatched"
  | "rejected";

export type JobberInvoiceImportRecord = {
  invoiceNumber: string;
  action: JobberInvoiceImportAction;
  customerMatch: JobberCustomerMatchOutcome | null;
  rejectedReason: string | null;
  source: JobberInvoiceRow;
  mapped: JobberHistoricalInvoiceInput | null;
};

export type JobberInvoiceImportReport = {
  mode: "preview" | "execute";
  sourceDirectory: string;
  sourceRows: number;
  import: number;
  duplicate: number;
  ambiguous: number;
  unmatched: number;
  rejected: number;
  stopReason: string | null;
  schemaErrors: string[];
  records: JobberInvoiceImportRecord[];
  importedInvoiceIds: string[];
  organizationId: string;
};

type CustomerIndexes = {
  byEmail: Map<string, CustomerEntity[]>;
  byPhone: Map<string, CustomerEntity[]>;
  byName: Map<string, CustomerEntity[]>;
};

function buildCustomerIndexes(customers: CustomerEntity[]): CustomerIndexes {
  const byEmail = new Map<string, CustomerEntity[]>();
  const byPhone = new Map<string, CustomerEntity[]>();
  const byName = new Map<string, CustomerEntity[]>();

  for (const customer of customers) {
    const email = customer.email?.trim().toLowerCase();
    if (email) {
      const group = byEmail.get(email) ?? [];
      group.push(customer);
      byEmail.set(email, group);
    }

    const phoneDigits = customer.phone.replace(/\D/g, "").slice(-10);
    if (phoneDigits.length === 10) {
      const group = byPhone.get(phoneDigits) ?? [];
      group.push(customer);
      byPhone.set(phoneDigits, group);
    }

    const nameKey = normalizeName(customer.full_name);
    if (nameKey) {
      const group = byName.get(nameKey) ?? [];
      group.push(customer);
      byName.set(nameKey, group);
    }
  }

  return { byEmail, byPhone, byName };
}

function matchCustomer(row: JobberInvoiceRow, indexes: CustomerIndexes): JobberCustomerMatchOutcome {
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
        reason: `Multiple customers share email ${row.email}`,
        candidateIds: emailMatches.map((customer) => customer.id),
      };
    }
  }

  if (row.phoneDigits) {
    const phoneMatches = indexes.byPhone.get(row.phoneDigits) ?? [];
    if (phoneMatches.length === 1) {
      return {
        kind: "matched",
        customerId: phoneMatches[0].id,
        customerName: phoneMatches[0].full_name,
        strategy: "phone",
      };
    }
    if (phoneMatches.length > 1) {
      return {
        kind: "ambiguous",
        reason: `Multiple customers share phone ${row.phoneDigits}`,
        candidateIds: phoneMatches.map((customer) => customer.id),
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
        reason: `Multiple customers share name ${row.clientName}`,
        candidateIds: nameMatches.map((customer) => customer.id),
      };
    }
  }

  return {
    kind: "unmatched",
    reason: row.email
      ? `No customer found for email ${row.email}`
      : `No unique customer found for ${row.clientName}`,
  };
}

function derivePaid(row: JobberInvoiceRow): boolean {
  const status = row.statusRaw.trim().toLowerCase();
  if (status === "paid") return true;
  if (row.balanceCents != null && row.balanceCents <= 0 && row.totalCents != null && row.totalCents > 0) {
    return status !== "draft";
  }
  return false;
}

function buildHistoricalInput(
  row: JobberInvoiceRow,
  sourceFilename: string,
  importedAt: string,
): JobberHistoricalInvoiceInput | null {
  const invoiceDate = row.issuedAt ?? row.createdAt;
  if (!invoiceDate || row.totalCents == null) return null;

  const paid = derivePaid(row);
  const subtotalCents = Math.max(0, row.totalCents - row.taxCents);
  const lineDescription = row.subject?.trim() || `Jobber invoice ${row.invoiceNumber}`;

  return {
    invoiceNumber: row.invoiceNumber,
    jobRef: row.jobRef,
    invoiceDate,
    dueDate: row.dueAt ?? invoiceDate,
    subtotalCents,
    taxCents: row.taxCents,
    taxRateBps: row.taxRateBps,
    totalCents: row.totalCents,
    paid,
    paidAt: paid ? (row.markedPaidAt ?? invoiceDate) : null,
    lineItems: [{
      description: lineDescription,
      quantity: 1,
      unitPriceCents: subtotalCents,
      amountCents: subtotalCents,
    }],
    provenance: JSON.parse(buildJobberCsvProvenanceSnapshot({
      invoiceNumber: row.invoiceNumber,
      jobRef: row.jobRef,
      sourceFilename,
      importedAt,
      statusRaw: row.statusRaw,
    })),
  };
}

function classifyRow(
  row: JobberInvoiceRow,
  customerMatch: JobberCustomerMatchOutcome,
  existingNumbers: Set<string>,
  sourceFilename: string,
  importedAt: string,
): JobberInvoiceImportRecord {
  if (!row.clientName.trim()) {
    return {
      invoiceNumber: row.invoiceNumber,
      action: "rejected",
      customerMatch,
      rejectedReason: "missing client name",
      source: row,
      mapped: null,
    };
  }

  if (row.totalCents == null || row.totalCents < 0) {
    return {
      invoiceNumber: row.invoiceNumber,
      action: "rejected",
      customerMatch,
      rejectedReason: "invalid total",
      source: row,
      mapped: null,
    };
  }

  if (customerMatch.kind === "ambiguous") {
    return {
      invoiceNumber: row.invoiceNumber,
      action: "ambiguous",
      customerMatch,
      rejectedReason: customerMatch.reason,
      source: row,
      mapped: null,
    };
  }

  if (customerMatch.kind === "unmatched") {
    return {
      invoiceNumber: row.invoiceNumber,
      action: "unmatched",
      customerMatch,
      rejectedReason: customerMatch.reason,
      source: row,
      mapped: null,
    };
  }

  if (existingNumbers.has(row.invoiceNumber)) {
    return {
      invoiceNumber: row.invoiceNumber,
      action: "duplicate",
      customerMatch,
      rejectedReason: null,
      source: row,
      mapped: buildHistoricalInput(row, sourceFilename, importedAt),
    };
  }

  const mapped = buildHistoricalInput(row, sourceFilename, importedAt);
  if (!mapped) {
    return {
      invoiceNumber: row.invoiceNumber,
      action: "rejected",
      customerMatch,
      rejectedReason: "could not map invoice row",
      source: row,
      mapped: null,
    };
  }

  return {
    invoiceNumber: row.invoiceNumber,
    action: "import",
    customerMatch,
    rejectedReason: null,
    source: row,
    mapped,
  };
}

export async function runJobberInvoiceImport(input: {
  dataSource: DataSource;
  organizationId: string;
  exportDir: string;
  execute: boolean;
  sourceFilename?: string;
  maxUnmatchedRate?: number;
}): Promise<JobberInvoiceImportReport> {
  const { rows, schemaErrors } = loadJobberInvoicesCsv(input.exportDir);
  const importedAt = new Date().toISOString();
  const sourceFilename = input.sourceFilename ?? "invoices.csv";
  const maxUnmatchedRate = input.maxUnmatchedRate ?? 0;

  const report: JobberInvoiceImportReport = {
    mode: input.execute ? "execute" : "preview",
    sourceDirectory: input.exportDir,
    sourceRows: rows.length,
    import: 0,
    duplicate: 0,
    ambiguous: 0,
    unmatched: 0,
    rejected: 0,
    stopReason: null,
    schemaErrors,
    records: [],
    importedInvoiceIds: [],
    organizationId: input.organizationId,
  };

  if (schemaErrors.length > 0) {
    report.stopReason = "Schema errors in Jobber invoices CSV";
    return report;
  }

  const customers = await input.dataSource.getRepository(CustomerEntity).find({
    where: { organization_id: input.organizationId },
  });
  const indexes = buildCustomerIndexes(customers);
  const existingIndex = await loadExistingJobberImportIndex(input.dataSource, input.organizationId);
  const existingNumbers = new Set(existingIndex.keys());

  const records = rows.map((row) => {
    const customerMatch = matchCustomer(row, indexes);
    return classifyRow(row, customerMatch, existingNumbers, sourceFilename, importedAt);
  });
  report.records = records;

  for (const record of records) {
    if (record.action === "import") report.import += 1;
    if (record.action === "duplicate") report.duplicate += 1;
    if (record.action === "ambiguous") report.ambiguous += 1;
    if (record.action === "unmatched") report.unmatched += 1;
    if (record.action === "rejected") report.rejected += 1;
  }

  const blockingCount = report.ambiguous + report.unmatched + report.rejected;
  const blockingRate = rows.length === 0 ? 0 : blockingCount / rows.length;
  if (blockingRate > maxUnmatchedRate) {
    report.stopReason = `Blocking invoice rate ${Math.round(blockingRate * 1000) / 10}% exceeds ${Math.round(maxUnmatchedRate * 1000) / 10}% threshold`;
  }

  if (!input.execute || report.stopReason) {
    return report;
  }

  for (const record of records) {
    if (record.action !== "import") continue;
    if (!record.mapped || record.customerMatch?.kind !== "matched") continue;

    const existing = existingIndex.get(record.invoiceNumber);
    const result = await upsertHistoricalJobberInvoice({
      dataSource: input.dataSource,
      organizationId: input.organizationId,
      customerId: record.customerMatch.customerId,
      historical: record.mapped,
      existing: existing ? { invoiceId: existing.invoiceId, jobId: existing.jobId } : undefined,
    });

    if (result.created) {
      report.importedInvoiceIds.push(result.invoiceId);
      existingIndex.set(record.invoiceNumber, {
        invoiceId: result.invoiceId,
        jobId: result.jobId,
        invoiceNumber: record.invoiceNumber,
      });
    }
  }

  return report;
}
