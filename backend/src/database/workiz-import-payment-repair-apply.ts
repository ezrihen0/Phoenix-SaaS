import "dotenv/config";
import "reflect-metadata";

import { createHash } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import {
  parseWorkizImportSnapshot,
  planWorkizPaymentRepair,
  reconcileAuthoritativePdfPayments,
  withinPaymentTolerance,
  type WorkizPaymentRepairPlan,
} from "./workiz/workiz-import-payment-reconciliation";
import {
  PHOENIX_ORG_ID,
  PHOENIX_ORG_SLUG,
} from "./workiz/workiz-production-mutation-guard";
import {
  runWorkizImportPaymentRepairDryRun,
  type WorkizPaymentRepairDryRunReport,
} from "./workiz-import-payment-repair-dry-run";

const OUTPUT_DIR = join(__dirname, "../../_runtime_harness/workiz-import-payment-repair");
const EXPECTED_BASELINE = {
  candidateCount: 379,
  autoEligibleCount: 89,
  noChangeCount: 237,
  manualReviewCount: 53,
  currentOverpaid: 92,
  proposedOverpaidAfterRepair: 0,
};

const FORBIDDEN_WORKIZ_CODES = new Set(["1RN2FC"]);

type RepairManifestEntry = {
  invoiceId: string;
  workizInvoiceCode: string;
  invoiceTotalCents: number;
  currentPaymentRowIds: string[];
  currentPaymentReferences: Array<string | null>;
  currentLedgerSumCents: number;
  authoritativePdfPayments: WorkizPaymentRepairPlan["authoritativePaymentRows"];
  authoritativePaymentSumCents: number;
  proposedRemovals: string[];
  proposedCreates: WorkizPaymentRepairPlan["proposedCreates"];
  proposedFinalLedgerSumCents: number;
  confidence: WorkizPaymentRepairPlan["confidence"];
  provenanceFingerprint: string;
  dryRunGeneratedAt: string;
};

type RepairManifest = {
  generatedAt: string;
  dryRunGeneratedAt: string;
  dryRunSha256: string;
  phoenixOrganizationId: string;
  invoiceCount: number;
  entries: RepairManifestEntry[];
};

type RepairAttemptResult = {
  invoiceId: string;
  workizInvoiceCode: string;
  beforeLedgerSumCents: number;
  removedPaymentIds: string[];
  removedReferences: Array<string | null>;
  insertedPayments: Array<{ reference: string; amountCents: number }>;
  afterLedgerSumCents: number;
  resultingLifecycle: string;
  transactionResult: "committed" | "rolled_back";
  error: string | null;
  timestamp: string;
};

type GlobalMetrics = {
  invoiceCount: number;
  paymentRowCount: number;
  invoiceTotalSumCents: number;
  paymentLedgerSumCents: number;
  overpaidImportedInvoices: number;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function provenanceFingerprint(raw: string | null | undefined) {
  const snapshot = parseWorkizImportSnapshot(raw) as {
    workiz_invoice_code?: string;
    pdf_enrichment?: {
      source_pdf_hash?: string;
      payments_snapshot?: unknown[];
    };
  } | null;
  const paymentsSnapshot = snapshot?.pdf_enrichment?.payments_snapshot ?? [];
  const pdfHash = snapshot?.pdf_enrichment?.source_pdf_hash ?? null;
  return sha256(JSON.stringify({
    workizInvoiceCode: snapshot?.workiz_invoice_code ?? null,
    pdfHash,
    paymentsSnapshot,
  }));
}

function summarizeDryRun(report: WorkizPaymentRepairDryRunReport) {
  return {
    candidateCount: report.candidateCount,
    autoEligibleCount: report.autoEligibleCount,
    noChangeCount: report.noChangeCount,
    manualReviewCount: report.manualReviewCount,
    currentOverpaid: report.records.filter((record) => record.currentPaymentSumCents > record.invoiceTotalCents).length,
    proposedOverpaidAfterRepair: report.records.filter((record) => record.proposedLedgerSumCents > record.invoiceTotalCents).length,
  };
}

function assertBaseline(report: WorkizPaymentRepairDryRunReport) {
  const summary = summarizeDryRun(report);
  const mismatches = Object.entries(EXPECTED_BASELINE).filter(([key, expected]) => summary[key as keyof typeof summary] !== expected);
  if (mismatches.length > 0) {
    throw new Error(`Dry-run baseline mismatch: ${JSON.stringify({ expected: EXPECTED_BASELINE, actual: summary, mismatches: Object.fromEntries(mismatches) })}`);
  }
  return summary;
}

function buildManifest(report: WorkizPaymentRepairDryRunReport): RepairManifest {
  const eligible = report.records.filter((record) => record.eligibility === "AUTO_ELIGIBLE" && record.confidence === "high");
  if (eligible.length !== EXPECTED_BASELINE.autoEligibleCount) {
    throw new Error(`Expected ${EXPECTED_BASELINE.autoEligibleCount} AUTO_ELIGIBLE/high records, found ${eligible.length}`);
  }

  const dryRunBody = JSON.stringify(report);
  return {
    generatedAt: new Date().toISOString(),
    dryRunGeneratedAt: report.generatedAt,
    dryRunSha256: sha256(dryRunBody),
    phoenixOrganizationId: report.phoenixOrganizationId,
    invoiceCount: eligible.length,
    entries: eligible.map((record) => {
      if (!record.workizInvoiceCode) {
        throw new Error(`Missing workiz code for invoice ${record.invoiceId}`);
      }
      if (FORBIDDEN_WORKIZ_CODES.has(record.workizInvoiceCode)) {
        throw new Error(`Forbidden invoice code in repair set: ${record.workizInvoiceCode}`);
      }
      return {
        invoiceId: record.invoiceId,
        workizInvoiceCode: record.workizInvoiceCode,
        invoiceTotalCents: record.invoiceTotalCents,
        currentPaymentRowIds: record.currentPaymentRows.map((row) => row.paymentId),
        currentPaymentReferences: record.currentPaymentRows.map((row) => row.reference),
        currentLedgerSumCents: record.currentPaymentSumCents,
        authoritativePdfPayments: record.authoritativePaymentRows,
        authoritativePaymentSumCents: record.authoritativePaymentSumCents,
        proposedRemovals: record.proposedRemovals,
        proposedCreates: record.proposedCreates,
        proposedFinalLedgerSumCents: record.proposedLedgerSumCents,
        confidence: record.confidence,
        provenanceFingerprint: "",
        dryRunGeneratedAt: report.generatedAt,
      };
    }),
  };
}

async function enrichManifestFingerprints(dataSource: DataSource, manifest: RepairManifest) {
  for (const entry of manifest.entries) {
    const invoice = await dataSource.getRepository(InvoiceEntity).findOneByOrFail({ id: entry.invoiceId });
    entry.provenanceFingerprint = provenanceFingerprint(invoice.branding_snapshot_json);
  }
}

async function loadPayments(dataSource: DataSource, invoiceId: string) {
  return dataSource.getRepository(InvoicePaymentEntity).find({
    where: { invoice_id: invoiceId, organization_id: PHOENIX_ORG_ID },
    order: { occurred_at: "ASC" },
  });
}

function plansEquivalent(frozen: RepairManifestEntry, live: WorkizPaymentRepairPlan) {
  return live.eligibility === "AUTO_ELIGIBLE"
    && live.confidence === "high"
    && live.proposedRemovals.length === frozen.proposedRemovals.length
    && live.proposedRemovals.every((id) => frozen.proposedRemovals.includes(id))
    && live.proposedCreates.length === frozen.proposedCreates.length
    && live.proposedLedgerSumCents === frozen.proposedFinalLedgerSumCents
    && live.authoritativePaymentSumCents === frozen.authoritativePaymentSumCents;
}

async function validateManifestPreconditions(dataSource: DataSource, manifest: RepairManifest) {
  const organization = await dataSource.getRepository(OrganizationEntity).findOneByOrFail({ id: PHOENIX_ORG_ID });
  if (organization.slug !== PHOENIX_ORG_SLUG) {
    throw new Error("Phoenix organization slug mismatch.");
  }

  for (const entry of manifest.entries) {
    const invoice = await dataSource.getRepository(InvoiceEntity).findOne({
      where: { id: entry.invoiceId, organization_id: PHOENIX_ORG_ID },
    });
    if (!invoice) {
      throw new Error(`Invoice missing or wrong org: ${entry.invoiceId}`);
    }
    if (provenanceFingerprint(invoice.branding_snapshot_json) !== entry.provenanceFingerprint) {
      throw new Error(`Provenance fingerprint changed for ${entry.workizInvoiceCode}`);
    }
    const payments = await loadPayments(dataSource, entry.invoiceId);
    const livePlan = planWorkizPaymentRepair({ invoice, payments });
    if (!plansEquivalent(entry, livePlan)) {
      throw new Error(`Live plan no longer matches manifest for ${entry.workizInvoiceCode}: ${JSON.stringify({
        frozenRemovals: entry.proposedRemovals.length,
        liveEligibility: livePlan.eligibility,
        liveRemovals: livePlan.proposedRemovals.length,
        liveProposedSum: livePlan.proposedLedgerSumCents,
      })}`);
    }
  }
}

async function createBackup(options: MysqlConnectionOptions) {
  mkdirSync(join(OUTPUT_DIR, "backup"), { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const connection = await mysql.createConnection({
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 3306,
    user: options.username ?? "root",
    password: options.password ?? "",
    database: options.database,
  });

  try {
    const [payments] = await connection.query(
      `SELECT id, organization_id, invoice_id, entry_type, amount_cents, method, reference, idempotency_key,
              note, occurred_at, created_by_auth_user_id, created_at, updated_at
       FROM invoice_payments
       WHERE organization_id = ?
       ORDER BY invoice_id, occurred_at, id`,
      [PHOENIX_ORG_ID],
    ) as [Array<Record<string, unknown>>, unknown];
    const [invoices] = await connection.query(
      `SELECT id, organization_id, total_cents, subtotal_cents, tax_cents, amount_cents, status, branding_snapshot_json
       FROM invoices
       WHERE organization_id = ?
       ORDER BY id`,
      [PHOENIX_ORG_ID],
    ) as [Array<Record<string, unknown>>, unknown];

    const payload = {
      createdAt: new Date().toISOString(),
      purpose: "pre-workiz-payment-repair-backup",
      phoenixOrganizationId: PHOENIX_ORG_ID,
      invoicePayments: payments,
      invoices,
    };
    const jsonBody = JSON.stringify(payload, null, 2);
    const jsonPath = join(OUTPUT_DIR, "backup", `phoenix-pre-payment-repair-${timestamp}.json`);
    writeFileSync(jsonPath, jsonBody);
    const manifestPath = join(OUTPUT_DIR, "backup", `phoenix-pre-payment-repair-${timestamp}.manifest.json`);
    writeFileSync(manifestPath, JSON.stringify({
      createdAt: payload.createdAt,
      jsonPath,
      sha256: sha256(jsonBody),
      invoicePaymentRowCount: payments.length,
      invoiceRowCount: invoices.length,
      rollbackNotes: [
        "Restore invoice_payments rows for affected invoices from this JSON backup.",
        "Use manifest frozen before-state per invoice for surgical rollback.",
      ],
    }, null, 2));
    return { jsonPath, manifestPath, sha256: sha256(jsonBody), invoicePaymentRowCount: payments.length, invoiceRowCount: invoices.length };
  } finally {
    await connection.end();
  }
}

async function collectGlobalMetrics(dataSource: DataSource): Promise<GlobalMetrics> {
  const [{ invoiceCount }] = await dataSource.query(
    "SELECT COUNT(*) AS invoiceCount FROM invoices WHERE organization_id = ?",
    [PHOENIX_ORG_ID],
  ) as [{ invoiceCount: number }];
  const [{ paymentRowCount }] = await dataSource.query(
    "SELECT COUNT(*) AS paymentRowCount FROM invoice_payments WHERE organization_id = ?",
    [PHOENIX_ORG_ID],
  ) as [{ paymentRowCount: number }];
  const [{ invoiceTotalSumCents }] = await dataSource.query(
    "SELECT COALESCE(SUM(total_cents), 0) AS invoiceTotalSumCents FROM invoices WHERE organization_id = ?",
    [PHOENIX_ORG_ID],
  ) as [{ invoiceTotalSumCents: number }];
  const [{ paymentLedgerSumCents }] = await dataSource.query(
    `SELECT COALESCE(SUM(CASE
      WHEN entry_type IN ('payment', 'adjustment') THEN amount_cents
      WHEN entry_type = 'refund' THEN -amount_cents
      ELSE 0 END), 0) AS paymentLedgerSumCents
     FROM invoice_payments WHERE organization_id = ?`,
    [PHOENIX_ORG_ID],
  ) as [{ paymentLedgerSumCents: number }];

  const invoices = await dataSource.getRepository(InvoiceEntity).find({
    where: { organization_id: PHOENIX_ORG_ID },
  });
  let overpaidImportedInvoices = 0;
  for (const invoice of invoices) {
    if (!invoice.branding_snapshot_json?.includes("workiz_historical_import")) continue;
    const payments = await loadPayments(dataSource, invoice.id);
    const sum = payments.reduce((total, payment) => {
      if (payment.entry_type === "payment" || payment.entry_type === "adjustment") return total + payment.amount_cents;
      if (payment.entry_type === "refund") return total - payment.amount_cents;
      return total;
    }, 0);
    if (sum > invoice.total_cents) overpaidImportedInvoices += 1;
  }

  return {
    invoiceCount: Number(invoiceCount),
    paymentRowCount: Number(paymentRowCount),
    invoiceTotalSumCents: Number(invoiceTotalSumCents),
    paymentLedgerSumCents: Number(paymentLedgerSumCents),
    overpaidImportedInvoices,
  };
}

async function repairInvoice(
  dataSource: DataSource,
  entry: RepairManifestEntry,
): Promise<RepairAttemptResult> {
  const timestamp = new Date().toISOString();
  const beforePayments = await loadPayments(dataSource, entry.invoiceId);
  const beforeLedgerSumCents = beforePayments.reduce((total, payment) => {
    if (payment.entry_type === "payment" || payment.entry_type === "adjustment") return total + payment.amount_cents;
    if (payment.entry_type === "refund") return total - payment.amount_cents;
    return total;
  }, 0);

  try {
    const result = await dataSource.transaction(async (manager) => {
      const invoice = await manager.getRepository(InvoiceEntity).findOne({
        where: { id: entry.invoiceId, organization_id: PHOENIX_ORG_ID },
        lock: { mode: "pessimistic_write" },
      });
      if (!invoice) {
        throw new Error("Invoice not found during repair transaction.");
      }
      if (provenanceFingerprint(invoice.branding_snapshot_json) !== entry.provenanceFingerprint) {
        throw new Error("Provenance fingerprint changed inside transaction.");
      }

      const payments = await manager.getRepository(InvoicePaymentEntity).find({
        where: { invoice_id: entry.invoiceId, organization_id: PHOENIX_ORG_ID },
        order: { occurred_at: "ASC" },
      });
      const livePlan = planWorkizPaymentRepair({ invoice, payments });
      if (!plansEquivalent(entry, livePlan)) {
        throw new Error("Live eligibility/plan mismatch inside transaction.");
      }

      const snapshot = parseWorkizImportSnapshot(invoice.branding_snapshot_json);
      const paymentsSnapshot = snapshot?.pdf_enrichment?.payments_snapshot ?? [];
      const reconcileResult = await reconcileAuthoritativePdfPayments({
        manager,
        organizationId: PHOENIX_ORG_ID,
        invoice,
        invoiceCode: entry.workizInvoiceCode,
        defaultOccurredAt: invoice.issued_at,
        pdfPayments: paymentsSnapshot.map((payment) => ({
          amountCents: payment.amount_cents,
          methodLabel: payment.method,
          statusLabel: payment.status,
          occurredAt: payment.occurred_at ? new Date(payment.occurred_at) : null,
        })),
      });

      const afterPayments = await manager.getRepository(InvoicePaymentEntity).find({
        where: { invoice_id: entry.invoiceId, organization_id: PHOENIX_ORG_ID },
        order: { occurred_at: "ASC" },
      });
      const afterLedgerSumCents = afterPayments.reduce((total, payment) => {
        if (payment.entry_type === "payment" || payment.entry_type === "adjustment") return total + payment.amount_cents;
        if (payment.entry_type === "refund") return total - payment.amount_cents;
        return total;
      }, 0);

      if (!withinPaymentTolerance(afterLedgerSumCents, entry.proposedFinalLedgerSumCents)) {
        throw new Error(`Post-repair sum mismatch: expected ${entry.proposedFinalLedgerSumCents}, got ${afterLedgerSumCents}`);
      }

      const ledger = new InvoicePaymentLedgerService().summarizeInvoice({
        totalCents: invoice.total_cents,
        legacyStatus: invoice.status,
        legacyPaidAt: invoice.paid_at,
        payments: afterPayments,
      });
      if (ledger.lifecycleStatus === "overpaid") {
        throw new Error(`Resulting lifecycle is overpaid for ${entry.workizInvoiceCode}`);
      }
      if (!withinPaymentTolerance(ledger.netPaidCents, entry.authoritativePaymentSumCents)) {
        throw new Error(`Ledger net paid mismatch for ${entry.workizInvoiceCode}`);
      }

      const afterPlan = planWorkizPaymentRepair({ invoice, payments: afterPayments });
      if (afterPlan.eligibility !== "NO_CHANGE") {
        throw new Error(`Expected NO_CHANGE after repair, got ${afterPlan.eligibility}`);
      }

      return {
        reconcileResult,
        afterPayments,
        afterLedgerSumCents,
        resultingLifecycle: ledger.lifecycleStatus,
      };
    });

    return {
      invoiceId: entry.invoiceId,
      workizInvoiceCode: entry.workizInvoiceCode,
      beforeLedgerSumCents,
      removedPaymentIds: entry.proposedRemovals,
      removedReferences: entry.currentPaymentReferences.filter((_ref, index) => entry.currentPaymentRowIds[index] && entry.proposedRemovals.includes(entry.currentPaymentRowIds[index])),
      insertedPayments: entry.proposedCreates.map((row) => ({ reference: row.reference, amountCents: row.amountCents })),
      afterLedgerSumCents: result.afterLedgerSumCents,
      resultingLifecycle: result.resultingLifecycle,
      transactionResult: "committed",
      error: null,
      timestamp,
    };
  } catch (error) {
    return {
      invoiceId: entry.invoiceId,
      workizInvoiceCode: entry.workizInvoiceCode,
      beforeLedgerSumCents,
      removedPaymentIds: [],
      removedReferences: [],
      insertedPayments: [],
      afterLedgerSumCents: beforeLedgerSumCents,
      resultingLifecycle: "unknown",
      transactionResult: "rolled_back",
      error: error instanceof Error ? error.message : String(error),
      timestamp,
    };
  }
}

export async function runWorkizImportPaymentRepairApply(options: { apply: boolean }) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const mysqlOptions = buildDataSourceOptions() as MysqlConnectionOptions;

  const backup = await createBackup(mysqlOptions);
  const dryRun = await runWorkizImportPaymentRepairDryRun();
  writeFileSync(join(OUTPUT_DIR, "dry-run-report-pre-apply.json"), JSON.stringify(dryRun, null, 2));
  const baseline = assertBaseline(dryRun);

  const manifest = buildManifest(dryRun);
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  try {
    await enrichManifestFingerprints(dataSource, manifest);
    const manifestBody = JSON.stringify(manifest, null, 2);
    const manifestPath = join(OUTPUT_DIR, `repair-manifest-${manifest.generatedAt.replace(/[:.]/g, "-")}.json`);
    writeFileSync(manifestPath, manifestBody);
    const manifestSha256 = sha256(manifestBody);

    await validateManifestPreconditions(dataSource, manifest);
    const metricsBefore = await collectGlobalMetrics(dataSource);

    const preApplyReport = {
      phase: "pre-apply",
      backup,
      baseline,
      manifestPath,
      manifestSha256,
      metricsBefore,
      applyRequested: options.apply,
    };

    if (!options.apply) {
      writeFileSync(join(OUTPUT_DIR, "apply-pre-check.json"), JSON.stringify(preApplyReport, null, 2));
      return { ...preApplyReport, repairedCount: 0, failedCount: 0, attempts: [] as RepairAttemptResult[] };
    }

    const attempts: RepairAttemptResult[] = [];
    let repairedCount = 0;
    let failedInvoice: RepairAttemptResult | null = null;

    for (const entry of manifest.entries) {
      const attempt = await repairInvoice(dataSource, entry);
      attempts.push(attempt);
      if (attempt.transactionResult === "committed") {
        repairedCount += 1;
        continue;
      }
      failedInvoice = attempt;
      break;
    }

    const metricsAfter = await collectGlobalMetrics(dataSource);
    const postDryRun = await runWorkizImportPaymentRepairDryRun();
    const postSummary = summarizeDryRun(postDryRun);

    const applyReport = {
      ...preApplyReport,
      repairedCount,
      failedCount: failedInvoice ? 1 : 0,
      stoppedEarly: Boolean(failedInvoice),
      failedInvoice,
      attempts,
      metricsAfter,
      postDryRunSummary: postSummary,
      ledgerDeltaCents: metricsBefore.paymentLedgerSumCents - metricsAfter.paymentLedgerSumCents,
      approvedLedgerDeltaCents: manifest.entries.reduce(
        (sum, entry) => sum + (entry.currentLedgerSumCents - entry.proposedFinalLedgerSumCents),
        0,
      ),
    };

    writeFileSync(join(OUTPUT_DIR, "apply-result.json"), JSON.stringify(applyReport, null, 2));
    writeFileSync(join(OUTPUT_DIR, "apply-audit-log.json"), JSON.stringify({
      generatedAt: new Date().toISOString(),
      attempts,
    }, null, 2));

    if (failedInvoice) {
      throw new Error(`Repair stopped after failure on ${failedInvoice.workizInvoiceCode}: ${failedInvoice.error}`);
    }
    if (repairedCount !== EXPECTED_BASELINE.autoEligibleCount) {
      throw new Error(`Expected ${EXPECTED_BASELINE.autoEligibleCount} repairs, completed ${repairedCount}`);
    }

    return applyReport;
  } finally {
    await dataSource.destroy();
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const report = await runWorkizImportPaymentRepairApply({ apply });
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
