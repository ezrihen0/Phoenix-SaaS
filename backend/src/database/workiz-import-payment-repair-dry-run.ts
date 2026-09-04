import "dotenv/config";
import "reflect-metadata";

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { DataSource } from "typeorm";

import type { InvoicePaymentEntryType, InvoicePaymentMethod } from "../crm/constants";
import { InvoiceEntity } from "./entities/invoice.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import {
  planWorkizPaymentRepair,
  sumPaymentRowsCents,
} from "./workiz/workiz-import-payment-reconciliation";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "./workiz/workiz-invoice-upsert";

const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const PHOENIX_ORG_SLUG = "phoenix-fireplace";
const OUTPUT_DIR = join(__dirname, "../../_runtime_harness/workiz-import-payment-repair");

type DryRunPaymentRow = {
  id: string;
  reference: string | null;
  note: string | null;
  amount_cents: number;
  created_by_auth_user_id: string | null;
  idempotency_key: string | null;
  entry_type: InvoicePaymentEntryType;
  method: InvoicePaymentMethod;
};

function deriveLifecycleFromSum(totalCents: number, netPaidCents: number) {
  if (netPaidCents <= 0) return "sent";
  if (netPaidCents > totalCents) return "overpaid";
  if (netPaidCents >= totalCents) return "paid";
  return "partial";
}

async function loadPaymentsForDryRun(
  dataSource: DataSource,
  invoiceId: string,
  organizationId: string,
): Promise<DryRunPaymentRow[]> {
  const rows = await dataSource.query(
    `SELECT id, reference, note, amount_cents, created_by_auth_user_id, entry_type, method
     FROM invoice_payments
     WHERE invoice_id = ? AND organization_id = ?
     ORDER BY occurred_at ASC`,
    [invoiceId, organizationId],
  ) as Array<{
    id: string;
    reference: string | null;
    note: string | null;
    amount_cents: number;
    created_by_auth_user_id: string | null;
    entry_type: DryRunPaymentRow["entry_type"];
    method: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    note: row.note,
    amount_cents: row.amount_cents,
    created_by_auth_user_id: row.created_by_auth_user_id,
    entry_type: row.entry_type as InvoicePaymentEntryType,
    method: row.method as InvoicePaymentMethod,
    idempotency_key: null,
  }));
}

function formatLedgerRows(
  rows: Array<{ reference: string | null; amountCents: number; note?: string | null; kind?: string }>,
) {
  return rows.map((row) => ({
    reference: row.reference,
    amountCents: row.amountCents,
    note: row.note ?? undefined,
    kind: row.kind,
  }));
}

export type WorkizPaymentRepairDryRunReport = {
  mode: "dry-run";
  generatedAt: string;
  phoenixOrganizationId: string;
  candidateCount: number;
  autoEligibleCount: number;
  noChangeCount: number;
  manualReviewCount: number;
  records: Array<ReturnType<typeof planWorkizPaymentRepair>>;
};

export async function runWorkizImportPaymentRepairDryRun(): Promise<WorkizPaymentRepairDryRunReport> {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const organization = await dataSource.getRepository(OrganizationEntity).findOne({
      where: { id: PHOENIX_ORG_ID },
    });
    if (!organization || organization.slug !== PHOENIX_ORG_SLUG) {
      throw new Error(`Phoenix organization verification failed for ${PHOENIX_ORG_ID}.`);
    }

    const invoices = await dataSource.getRepository(InvoiceEntity).find({
      where: { organization_id: PHOENIX_ORG_ID },
    });

    const records: WorkizPaymentRepairDryRunReport["records"] = [];
    for (const invoice of invoices) {
      if (!invoice.branding_snapshot_json?.includes(WORKIZ_HISTORICAL_IMPORT_SOURCE)) {
        continue;
      }

      const payments = await loadPaymentsForDryRun(dataSource, invoice.id, PHOENIX_ORG_ID);

      records.push(planWorkizPaymentRepair({ invoice, payments }));
    }

    return {
      mode: "dry-run",
      generatedAt: new Date().toISOString(),
      phoenixOrganizationId: PHOENIX_ORG_ID,
      candidateCount: records.length,
      autoEligibleCount: records.filter((record) => record.eligibility === "AUTO_ELIGIBLE").length,
      noChangeCount: records.filter((record) => record.eligibility === "NO_CHANGE").length,
      manualReviewCount: records.filter((record) => record.eligibility === "MANUAL_REVIEW").length,
      records,
    };
  } finally {
    await dataSource.destroy();
  }
}

async function main() {
  const report = await runWorkizImportPaymentRepairDryRun();
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, "dry-run-report.json"), JSON.stringify(report, null, 2));

  const sampleCodes = ["YELB9H", "EP3XN1", "UBFEWN"];
  const samples = sampleCodes.map((code) => {
    const record = report.records.find((entry) => entry.workizInvoiceCode === code);
    if (!record) return { workizInvoiceCode: code, found: false };
    return {
      workizInvoiceCode: code,
      found: true,
      invoiceId: record.invoiceId,
      invoiceTotalCents: record.invoiceTotalCents,
      currentPaymentSumCents: record.currentPaymentSumCents,
      authoritativePaymentSumCents: record.authoritativePaymentSumCents,
      proposedLedgerSumCents: record.proposedLedgerSumCents,
      currentLifecycleStatus: deriveLifecycleFromSum(record.invoiceTotalCents, record.currentPaymentSumCents),
      proposedLifecycleStatus: record.proposedLifecycleStatus,
      eligibility: record.eligibility,
      skipReason: record.skipReason,
      currentLedger: formatLedgerRows(record.currentPaymentRows),
      proposedLedger: record.eligibility === "AUTO_ELIGIBLE"
        ? formatLedgerRows(record.proposedCreates)
        : record.eligibility === "NO_CHANGE"
          ? formatLedgerRows(record.currentPaymentRows)
          : formatLedgerRows(record.authoritativePaymentRows),
      proposedRemovals: record.proposedRemovals.length,
    };
  });

  console.log(JSON.stringify({
    summary: {
      candidateCount: report.candidateCount,
      autoEligibleCount: report.autoEligibleCount,
      noChangeCount: report.noChangeCount,
      manualReviewCount: report.manualReviewCount,
      totalCurrentOverageInvoices: report.records.filter((record) => record.currentPaymentSumCents > record.invoiceTotalCents).length,
      totalProposedOverageInvoices: report.records.filter((record) => record.proposedLedgerSumCents > record.invoiceTotalCents).length,
    },
    samples,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export function summarizeRepairDryRun(report: WorkizPaymentRepairDryRunReport) {
  return {
    candidateCount: report.candidateCount,
    autoEligibleCount: report.autoEligibleCount,
    noChangeCount: report.noChangeCount,
    manualReviewCount: report.manualReviewCount,
    proposedSumByEligibility: {
      autoEligible: sumPaymentRowsCents(
        report.records
          .filter((record) => record.eligibility === "AUTO_ELIGIBLE")
          .flatMap((record) => record.proposedCreates),
      ),
    },
  };
}
