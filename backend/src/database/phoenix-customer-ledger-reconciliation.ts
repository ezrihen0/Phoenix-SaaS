import "dotenv/config";
import "reflect-metadata";

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { DataSource, In } from "typeorm";

import { isProvenanceOnlyCustomerNotes } from "../crm/user-facing-text";
import { openJobStatuses } from "../crm/constants";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceDocumentEntity } from "./entities/invoice-document.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceServiceIntelligenceEntity } from "./entities/invoice-service-intelligence.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { loadUniqueWorkizCustomerCsv } from "./workiz/workiz-customer-csv-parser";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "./workiz/workiz-invoice-upsert";

const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const PHOENIX_ORG_SLUG = "phoenix-fireplace";
const DEFAULT_SOURCE_DIR = "C:\\Users\\edenz\\OneDrive\\שולחן העבודה\\Business\\Workiz\\cusomers";
const OUTPUT_DIR = join(__dirname, "../../_runtime_harness/phoenix-customer-ledger");

type HistoryClassification = "CUSTOMER_WITH_HISTORY" | "CUSTOMER_WITHOUT_HISTORY";
type ProvenanceClassification = "historical_migrated" | "native_wizfield";

type CustomerReconciliationRow = {
  customer_id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  current_created_at: string;
  legacy_created_at: string | null;
  external_client_number: string | null;
  invoice_count: number;
  job_count: number;
  open_job_count: number;
  earliest_historical_invoice_date: string | null;
  latest_historical_invoice_date: string | null;
  invoice_document_count: number;
  has_service_intelligence: boolean;
  history_classification: HistoryClassification;
  provenance_classification: ProvenanceClassification;
  has_historical_import_invoice: boolean;
  source_csv_created_at: string | null;
};

type CreatedAtBackfillRow = {
  customer_id: string;
  name: string;
  provenance_classification: ProvenanceClassification;
  history_classification: HistoryClassification;
  old_created_at: string;
  proposed_created_at: string | null;
  evidence_source: string | null;
  evidence_date: string | null;
  action: "update" | "skip_native" | "skip_unavailable" | "unchanged";
  skip_reason: string | null;
};

function writeJson(path: string, payload: unknown): void {
  writeFileSync(path, JSON.stringify(payload, null, 2));
}

function writeText(path: string, content: string): void {
  writeFileSync(path, content);
}

function formatAddress(customer: CustomerEntity): string {
  return [
    customer.service_address_line_1,
    customer.service_address_line_2,
    customer.service_city,
    customer.service_state_or_region,
    customer.service_postal_code,
  ]
    .filter((part) => part && part.trim())
    .join(", ");
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function sameCalendarInstant(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

function parseHistoricalImportFlag(invoice: InvoiceEntity): boolean {
  if (!invoice.branding_snapshot_json) return false;
  try {
    const snapshot = JSON.parse(invoice.branding_snapshot_json) as { import_source?: string };
    return snapshot.import_source === WORKIZ_HISTORICAL_IMPORT_SOURCE;
  } catch {
    return false;
  }
}

function startOfLocalMonth(reference = new Date()) {
  const date = new Date(reference);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfNextLocalMonth(reference = new Date()) {
  const date = startOfLocalMonth(reference);
  date.setMonth(date.getMonth() + 1);
  return date;
}

function isHistoricalMigrated(input: {
  customer: CustomerEntity;
  hasHistoricalImportInvoice: boolean;
}): boolean {
  if (input.customer.external_client_number?.trim()) return true;
  if (isProvenanceOnlyCustomerNotes(input.customer.notes)) return true;
  if (input.hasHistoricalImportInvoice) return true;
  return false;
}

function buildCreatedAtBackfillRow(input: {
  customer: CustomerEntity;
  row: CustomerReconciliationRow;
  earliestInvoiceDate: Date | null;
  sourceCsvCreatedAt: Date | null;
}): CreatedAtBackfillRow {
  const { customer, row, earliestInvoiceDate, sourceCsvCreatedAt } = input;
  const oldCreatedAt = customer.created_at;

  if (row.provenance_classification === "native_wizfield") {
    return {
      customer_id: customer.id,
      name: customer.full_name,
      provenance_classification: row.provenance_classification,
      history_classification: row.history_classification,
      old_created_at: oldCreatedAt.toISOString(),
      proposed_created_at: null,
      evidence_source: null,
      evidence_date: null,
      action: "skip_native",
      skip_reason: "Native WizField customer — created_at preserved",
    };
  }

  if (row.invoice_count > 0 && earliestInvoiceDate) {
    const proposed = earliestInvoiceDate;
    return {
      customer_id: customer.id,
      name: customer.full_name,
      provenance_classification: row.provenance_classification,
      history_classification: row.history_classification,
      old_created_at: oldCreatedAt.toISOString(),
      proposed_created_at: proposed.toISOString(),
      evidence_source: "earliest_invoice_issued_at",
      evidence_date: proposed.toISOString(),
      action: sameCalendarInstant(oldCreatedAt, proposed) ? "unchanged" : "update",
      skip_reason: null,
    };
  }

  if (customer.legacy_created_at) {
    const proposed = customer.legacy_created_at;
    return {
      customer_id: customer.id,
      name: customer.full_name,
      provenance_classification: row.provenance_classification,
      history_classification: row.history_classification,
      old_created_at: oldCreatedAt.toISOString(),
      proposed_created_at: proposed.toISOString(),
      evidence_source: "legacy_created_at",
      evidence_date: proposed.toISOString(),
      action: sameCalendarInstant(oldCreatedAt, proposed) ? "unchanged" : "update",
      skip_reason: null,
    };
  }

  if (sourceCsvCreatedAt) {
    return {
      customer_id: customer.id,
      name: customer.full_name,
      provenance_classification: row.provenance_classification,
      history_classification: row.history_classification,
      old_created_at: oldCreatedAt.toISOString(),
      proposed_created_at: sourceCsvCreatedAt.toISOString(),
      evidence_source: "workiz_source_csv_created",
      evidence_date: sourceCsvCreatedAt.toISOString(),
      action: sameCalendarInstant(oldCreatedAt, sourceCsvCreatedAt) ? "unchanged" : "update",
      skip_reason: null,
    };
  }

  return {
    customer_id: customer.id,
    name: customer.full_name,
    provenance_classification: row.provenance_classification,
    history_classification: row.history_classification,
    old_created_at: oldCreatedAt.toISOString(),
    proposed_created_at: null,
    evidence_source: null,
    evidence_date: null,
    action: "skip_unavailable",
    skip_reason: "No deterministic historical created date available",
  };
}

async function main() {
  const executeMode = process.argv.includes("--execute");
  const sourceDirectory = process.env.WORKIZ_CUSTOMER_SOURCE_DIR ?? DEFAULT_SOURCE_DIR;

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const parsedSource = existsSync(sourceDirectory)
    ? loadUniqueWorkizCustomerCsv(sourceDirectory)
    : { rows: [], sourceDirectory, filesDiscovered: 0, uniqueFiles: 0, skippedDuplicateFiles: [], sourceFile: "", schemaErrors: ["Source directory not found"] };
  const sourceByClientNumber = new Map(parsedSource.rows.map((row) => [row.clientNumber, row]));

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const organization = await dataSource.getRepository(OrganizationEntity).findOne({
      where: { id: PHOENIX_ORG_ID },
    });
    if (!organization) {
      throw new Error(`Phoenix organization not found for id ${PHOENIX_ORG_ID}`);
    }
    if (organization.slug !== PHOENIX_ORG_SLUG) {
      throw new Error(`Phoenix organization slug mismatch: expected ${PHOENIX_ORG_SLUG}, found ${organization.slug}`);
    }

    const customers = await dataSource.getRepository(CustomerEntity).find({
      where: { organization_id: PHOENIX_ORG_ID },
      order: { full_name: "ASC" },
    });

    const orgNullCustomers = await dataSource.getRepository(CustomerEntity).find({
      where: { organization_id: null as unknown as string },
    });

    const customerIds = customers.map((customer) => customer.id);

    const jobs = customerIds.length === 0
      ? []
      : await dataSource.getRepository(JobEntity).find({
        where: { organization_id: PHOENIX_ORG_ID, customer_id: In(customerIds) },
      });

    const jobIds = jobs.map((job) => job.id);
    const invoices = jobIds.length === 0
      ? []
      : await dataSource.getRepository(InvoiceEntity).find({
        where: { organization_id: PHOENIX_ORG_ID, job_id: In(jobIds) },
      });

    const invoiceIds = invoices.map((invoice) => invoice.id);

    const [documents, serviceIntelligenceRows] = await Promise.all([
      customerIds.length === 0
        ? []
        : dataSource.getRepository(InvoiceDocumentEntity).find({
          where: { organization_id: PHOENIX_ORG_ID, customer_id: In(customerIds) },
        }),
      invoiceIds.length === 0
        ? []
        : dataSource.getRepository(InvoiceServiceIntelligenceEntity).find({
          where: { organization_id: PHOENIX_ORG_ID, invoice_id: In(invoiceIds) },
        }),
    ]);

    const jobsByCustomer = new Map<string, JobEntity[]>();
    for (const job of jobs) {
      const bucket = jobsByCustomer.get(job.customer_id) ?? [];
      bucket.push(job);
      jobsByCustomer.set(job.customer_id, bucket);
    }

    const invoicesByJob = new Map<string, InvoiceEntity[]>();
    for (const invoice of invoices) {
      const bucket = invoicesByJob.get(invoice.job_id) ?? [];
      bucket.push(invoice);
      invoicesByJob.set(invoice.job_id, bucket);
    }

    const documentsByCustomer = new Map<string, number>();
    for (const document of documents) {
      documentsByCustomer.set(document.customer_id, (documentsByCustomer.get(document.customer_id) ?? 0) + 1);
    }

    const siInvoiceIds = new Set(serviceIntelligenceRows.map((row) => row.invoice_id));
    const siByCustomer = new Map<string, boolean>();
    for (const job of jobs) {
      const jobInvoices = invoicesByJob.get(job.id) ?? [];
      if (jobInvoices.some((invoice) => siInvoiceIds.has(invoice.id))) {
        siByCustomer.set(job.customer_id, true);
      }
    }

    const reconciliationRows: CustomerReconciliationRow[] = customers.map((customer) => {
      const customerJobs = jobsByCustomer.get(customer.id) ?? [];
      const customerInvoices = customerJobs.flatMap((job) => invoicesByJob.get(job.id) ?? []);
      const issuedDates = customerInvoices
        .map((invoice) => invoice.issued_at)
        .filter((value): value is Date => Boolean(value))
        .sort((left, right) => left.getTime() - right.getTime());

      const hasHistoricalImportInvoice = customerInvoices.some(parseHistoricalImportFlag);
      const provenance = isHistoricalMigrated({ customer, hasHistoricalImportInvoice })
        ? "historical_migrated"
        : "native_wizfield";
      const historyClassification: HistoryClassification =
        customerInvoices.length > 0 || customerJobs.length > 0
          ? "CUSTOMER_WITH_HISTORY"
          : "CUSTOMER_WITHOUT_HISTORY";

      const sourceCsvRow = customer.external_client_number
        ? sourceByClientNumber.get(customer.external_client_number.trim()) ?? null
        : null;

      return {
        customer_id: customer.id,
        name: customer.full_name,
        phone: customer.phone,
        email: customer.email,
        address: formatAddress(customer),
        current_created_at: customer.created_at.toISOString(),
        legacy_created_at: toIso(customer.legacy_created_at),
        external_client_number: customer.external_client_number,
        invoice_count: customerInvoices.length,
        job_count: customerJobs.length,
        open_job_count: customerJobs.filter((job) => openJobStatuses.includes(job.status)).length,
        earliest_historical_invoice_date: toIso(issuedDates[0] ?? null),
        latest_historical_invoice_date: toIso(issuedDates[issuedDates.length - 1] ?? null),
        invoice_document_count: documentsByCustomer.get(customer.id) ?? 0,
        has_service_intelligence: siByCustomer.get(customer.id) ?? false,
        history_classification: historyClassification,
        provenance_classification: provenance,
        has_historical_import_invoice: hasHistoricalImportInvoice,
        source_csv_created_at: toIso(sourceCsvRow?.legacyCreatedAt ?? null),
      };
    });

    const withHistory = reconciliationRows.filter((row) => row.history_classification === "CUSTOMER_WITH_HISTORY");
    const withoutHistory = reconciliationRows.filter((row) => row.history_classification === "CUSTOMER_WITHOUT_HISTORY");

    const backfillRows = customers.map((customer) => {
      const row = reconciliationRows.find((entry) => entry.customer_id === customer.id)!;
      const customerJobs = jobsByCustomer.get(customer.id) ?? [];
      const customerInvoices = customerJobs.flatMap((job) => invoicesByJob.get(job.id) ?? []);
      const issuedDates = customerInvoices
        .map((invoice) => invoice.issued_at)
        .filter((value): value is Date => Boolean(value))
        .sort((left, right) => left.getTime() - right.getTime());
      const sourceCsvRow = customer.external_client_number
        ? sourceByClientNumber.get(customer.external_client_number.trim()) ?? null
        : null;

      return buildCreatedAtBackfillRow({
        customer,
        row,
        earliestInvoiceDate: issuedDates[0] ?? null,
        sourceCsvCreatedAt: sourceCsvRow?.legacyCreatedAt ?? null,
      });
    });

    const monthStart = startOfLocalMonth();
    const nextMonthStart = startOfNextLocalMonth();

    const newThisMonthCurrent = customers.filter(
      (customer) => customer.created_at >= monthStart && customer.created_at < nextMonthStart,
    ).length;

    const newThisMonthCorrected = backfillRows.filter((row) => {
      if (row.action === "skip_native") {
        const customer = customers.find((entry) => entry.id === row.customer_id);
        if (!customer) return false;
        return customer.created_at >= monthStart && customer.created_at < nextMonthStart;
      }
      if (!row.proposed_created_at) return false;
      const proposed = new Date(row.proposed_created_at);
      return proposed >= monthStart && proposed < nextMonthStart;
    }).length;

    const nativeCustomers = backfillRows.filter((row) => row.action === "skip_native");
    const deterministicHistorical = backfillRows.filter(
      (row) => row.provenance_classification === "historical_migrated" && row.proposed_created_at !== null,
    );
    const unavailableHistorical = backfillRows.filter((row) => row.action === "skip_unavailable");

    const proposedDates = backfillRows
      .map((row) => row.proposed_created_at)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value));

    const earliestCustomerDate = proposedDates.length > 0
      ? new Date(Math.min(...proposedDates.map((date) => date.getTime()))).toISOString()
      : null;

    const latestHistoricalInvoiceDate = reconciliationRows
      .map((row) => row.latest_historical_invoice_date)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .sort((left, right) => right.getTime() - left.getTime())[0]?.toISOString() ?? null;

    const summary = {
      generatedAt: new Date().toISOString(),
      phoenixOrganizationId: PHOENIX_ORG_ID,
      phoenixOrganizationSlug: PHOENIX_ORG_SLUG,
      dbCustomerMasterCount: customers.length,
      expectedCustomerMasterCount: 591,
      countMatchesExpected: customers.length === 591,
      customersWithHistory: withHistory.length,
      customersWithoutHistory: withoutHistory.length,
      nativeWizfieldCustomers: nativeCustomers.length,
      historicalMigratedCustomers: reconciliationRows.filter((row) => row.provenance_classification === "historical_migrated").length,
      historicalDeterministicCreatedDate: deterministicHistorical.length,
      historicalWithoutDeterministicCreatedDate: unavailableHistorical.length,
      createdAtBackfillUpdates: backfillRows.filter((row) => row.action === "update").length,
      createdAtBackfillUnchanged: backfillRows.filter((row) => row.action === "unchanged").length,
      newThisMonthCurrent,
      newThisMonthCorrected,
      earliestCustomerDate,
      latestHistoricalInvoiceDate,
      orgNullCustomerCount: orgNullCustomers.length,
      sourceCsvRows: parsedSource.rows.length,
      sourceCsvSchemaErrors: parsedSource.schemaErrors,
    };

    writeJson(join(OUTPUT_DIR, "reconciliation-report.json"), {
      summary,
      customers: reconciliationRows,
    });
    writeJson(join(OUTPUT_DIR, "customers-with-history.json"), {
      generatedAt: summary.generatedAt,
      count: withHistory.length,
      records: withHistory,
    });
    writeJson(join(OUTPUT_DIR, "customers-without-history.json"), {
      generatedAt: summary.generatedAt,
      count: withoutHistory.length,
      records: withoutHistory,
    });
    writeJson(join(OUTPUT_DIR, "org-null-customers.json"), {
      generatedAt: summary.generatedAt,
      count: orgNullCustomers.length,
      records: orgNullCustomers.map((customer) => ({
        customer_id: customer.id,
        name: customer.full_name,
        phone: customer.phone,
        email: customer.email,
      })),
    });
    writeJson(join(OUTPUT_DIR, "created-at-backfill-dry-run.json"), {
      generatedAt: summary.generatedAt,
      mode: executeMode ? "execute" : "dry-run",
      summary: {
        updates: backfillRows.filter((row) => row.action === "update").length,
        unchanged: backfillRows.filter((row) => row.action === "unchanged").length,
        skipNative: backfillRows.filter((row) => row.action === "skip_native").length,
        skipUnavailable: backfillRows.filter((row) => row.action === "skip_unavailable").length,
      },
      records: backfillRows,
    });

    const summaryMarkdown = [
      "# Phoenix Customer Ledger Reconciliation",
      "",
      `Generated: ${summary.generatedAt}`,
      "",
      "## Customer Master",
      `- DB customer master count: **${summary.dbCustomerMasterCount}**`,
      `- Expected count: **${summary.expectedCustomerMasterCount}** (${summary.countMatchesExpected ? "MATCH" : "MISMATCH"})`,
      `- CUSTOMER_WITH_HISTORY: **${summary.customersWithHistory}**`,
      `- CUSTOMER_WITHOUT_HISTORY: **${summary.customersWithoutHistory}**`,
      "",
      "## Provenance",
      `- Historical migrated: **${summary.historicalMigratedCustomers}**`,
      `- Native WizField: **${summary.nativeWizfieldCustomers}**`,
      `- Org-null customers (diagnostic): **${summary.orgNullCustomerCount}**`,
      "",
      "## Historical Created Date (dry run)",
      `- Deterministic proposed dates: **${summary.historicalDeterministicCreatedDate}**`,
      `- No deterministic date: **${summary.historicalWithoutDeterministicCreatedDate}**`,
      `- Proposed updates: **${summary.createdAtBackfillUpdates}**`,
      `- Already aligned: **${summary.createdAtBackfillUnchanged}**`,
      "",
      "## Date Range",
      `- Earliest proposed customer date: ${summary.earliestCustomerDate ?? "n/a"}`,
      `- Latest historical invoice date: ${summary.latestHistoricalInvoiceDate ?? "n/a"}`,
      "",
      "## New This Month",
      `- Current (import timestamp): **${summary.newThisMonthCurrent}**`,
      `- Corrected (after backfill): **${summary.newThisMonthCorrected}**`,
      "",
    ].join("\n");

    const backfillSummaryMarkdown = [
      "# Created At Backfill Dry Run",
      "",
      `Mode: ${executeMode ? "EXECUTE" : "DRY RUN"}`,
      "",
      `- Updates pending: **${backfillRows.filter((row) => row.action === "update").length}**`,
      `- Unchanged: **${backfillRows.filter((row) => row.action === "unchanged").length}**`,
      `- Skipped (native): **${backfillRows.filter((row) => row.action === "skip_native").length}**`,
      `- Skipped (unavailable): **${backfillRows.filter((row) => row.action === "skip_unavailable").length}**`,
      "",
      executeMode
        ? "Execute mode requested — see console for result."
        : "**STOP:** Review `created-at-backfill-dry-run.json` before running with `--execute`.",
      "",
    ].join("\n");

    writeText(join(OUTPUT_DIR, "reconciliation-summary.md"), summaryMarkdown);
    writeText(join(OUTPUT_DIR, "created-at-backfill-summary.md"), backfillSummaryMarkdown);

    if (executeMode) {
      const confirm = process.env.PHOENIX_CREATED_AT_BACKFILL_CONFIRM === "1";
      if (!confirm) {
        throw new Error(
          "Refusing to execute created_at backfill without PHOENIX_CREATED_AT_BACKFILL_CONFIRM=1",
        );
      }

      const updates = backfillRows.filter((row) => row.action === "update" && row.proposed_created_at);
      for (const row of updates) {
        await dataSource.getRepository(CustomerEntity).update(
          { id: row.customer_id, organization_id: PHOENIX_ORG_ID },
          { created_at: new Date(row.proposed_created_at!) },
        );
      }

      writeJson(join(OUTPUT_DIR, "created-at-backfill-execute-result.json"), {
        generatedAt: new Date().toISOString(),
        updatedCount: updates.length,
        customerIds: updates.map((row) => row.customer_id),
      });
      console.log(`EXECUTE: updated created_at for ${updates.length} historical customers.`);
    } else {
      console.log("DRY RUN complete — no created_at changes written.");
    }

    console.log(JSON.stringify(summary, null, 2));
    if (!summary.countMatchesExpected) {
      process.exitCode = 1;
    }
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
