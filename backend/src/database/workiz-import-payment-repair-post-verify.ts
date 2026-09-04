import "dotenv/config";
import "reflect-metadata";

import { DataSource } from "typeorm";

import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { planWorkizPaymentRepair, parseWorkizImportSnapshot } from "./workiz/workiz-import-payment-reconciliation";
import { PHOENIX_ORG_ID } from "./workiz/workiz-production-mutation-guard";
import { runWorkizImportPaymentRepairDryRun } from "./workiz-import-payment-repair-dry-run";

const SAMPLE_CODES = ["YELB9H", "EP3XN1", "UBFEWN", "1RN2FC"];

async function main() {
  const dryRun = await runWorkizImportPaymentRepairDryRun();
  const overpaid = dryRun.records.filter((r) => r.currentPaymentSumCents > r.invoiceTotalCents);

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  const ledger = new InvoicePaymentLedgerService();

  try {
    const samples = [];
    for (const code of SAMPLE_CODES) {
      const all = await dataSource.getRepository(InvoiceEntity).find({
        where: { organization_id: PHOENIX_ORG_ID },
      });
      const match = all.find((inv) => parseWorkizImportSnapshot(inv.branding_snapshot_json)?.workiz_invoice_code?.toUpperCase() === code);
      if (!match) {
        samples.push({ code, found: false });
        continue;
      }
      const payments = await dataSource.getRepository(InvoicePaymentEntity).find({
        where: { invoice_id: match.id, organization_id: PHOENIX_ORG_ID },
        order: { occurred_at: "ASC" },
      });
      const plan = planWorkizPaymentRepair({ invoice: match, payments });
      const summary = ledger.summarizeInvoice({
        totalCents: match.total_cents,
        legacyStatus: match.status,
        legacyPaidAt: match.paid_at,
        payments,
      });
      samples.push({
        code,
        invoiceId: match.id,
        totalCents: match.total_cents,
        eligibility: plan.eligibility,
        lifecycle: summary.lifecycleStatus,
        netPaidCents: summary.netPaidCents,
        payments: payments.map((p) => ({
          reference: p.reference,
          amountCents: p.amount_cents,
          idempotencyKey: p.idempotency_key,
          createdBy: p.created_by_auth_user_id,
        })),
      });
    }

    console.log(JSON.stringify({
      postDryRun: {
        autoEligible: dryRun.autoEligibleCount,
        noChange: dryRun.noChangeCount,
        manualReview: dryRun.manualReviewCount,
        overpaidCount: overpaid.length,
        overpaidInvoices: overpaid.map((r) => ({
          code: r.workizInvoiceCode,
          eligibility: r.eligibility,
          currentSum: r.currentPaymentSumCents,
          total: r.invoiceTotalCents,
        })),
      },
      samples,
    }, null, 2));
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
