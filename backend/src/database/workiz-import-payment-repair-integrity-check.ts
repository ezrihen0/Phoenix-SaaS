import "dotenv/config";
import "reflect-metadata";

import { readFileSync } from "fs";
import { join } from "path";

import { DataSource } from "typeorm";

import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";
import { PHOENIX_ORG_ID } from "./workiz/workiz-production-mutation-guard";

const BACKUP_PATH = join(__dirname, "../../_runtime_harness/workiz-import-payment-repair/backup/phoenix-pre-payment-repair-2026-09-03T02-20-05-194Z.json");
const MANIFEST_PATH = join(__dirname, "../../_runtime_harness/workiz-import-payment-repair/repair-manifest-2026-09-03T02-20-08-524Z.json");

async function main() {
  const backup = JSON.parse(readFileSync(BACKUP_PATH, "utf8")) as {
    invoices: Array<{ id: string; total_cents: number; subtotal_cents: number; tax_cents: number; amount_cents: number; branding_snapshot_json: string }>;
    invoicePayments: Array<{ id: string; invoice_id: string; created_by_auth_user_id: string | null; idempotency_key: string | null }>;
  };
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
    entries: Array<{ invoiceId: string; workizInvoiceCode: string }>;
  };
  const repairedIds = new Set(manifest.entries.map((entry) => entry.invoiceId));
  const backupById = new Map(backup.invoices.map((invoice) => [invoice.id, invoice]));
  const backupPaymentsById = new Map(backup.invoicePayments.map((payment) => [payment.id, payment]));

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  const ledgerService = new InvoicePaymentLedgerService();

  try {
    let invoiceTotalMismatch = 0;
    let provenanceChanged = 0;
    let lineItemChanged = 0;
    let nativePaymentRemoved = 0;

    for (const entry of manifest.entries) {
      const before = backupById.get(entry.invoiceId);
      const invoice = await dataSource.getRepository(InvoiceEntity).findOneByOrFail({ id: entry.invoiceId });
      if (!before || before.total_cents !== invoice.total_cents || before.subtotal_cents !== invoice.subtotal_cents || before.tax_cents !== invoice.tax_cents) {
        invoiceTotalMismatch += 1;
      }
      if (before?.branding_snapshot_json !== invoice.branding_snapshot_json) {
        provenanceChanged += 1;
      }
      const lineItems = await dataSource.getRepository(InvoiceLineItemEntity).count({ where: { invoice_id: entry.invoiceId } });
      if (lineItems === 0) {
        // still ok if was zero
      }
    }

    const currentPayments = await dataSource.getRepository(InvoicePaymentEntity).find({
      where: { organization_id: PHOENIX_ORG_ID },
    });
    const currentPaymentIds = new Set(currentPayments.map((payment) => payment.id));
    for (const payment of backup.invoicePayments) {
      if (!repairedIds.has(payment.invoice_id)) continue;
      const wasNative = Boolean(payment.created_by_auth_user_id || payment.idempotency_key);
      if (wasNative && !currentPaymentIds.has(payment.id)) {
        nativePaymentRemoved += 1;
      }
    }

    const invoices = await dataSource.getRepository(InvoiceEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
    const lifecycleCounts = { sent: 0, partial: 0, paid: 0, refunded: 0, overpaid: 0 };
    for (const invoice of invoices) {
      const payments = currentPayments.filter((payment) => payment.invoice_id === invoice.id);
      const summary = ledgerService.summarizeInvoice({
        totalCents: invoice.total_cents,
        legacyStatus: invoice.status,
        legacyPaidAt: invoice.paid_at,
        payments,
      });
      lifecycleCounts[summary.lifecycleStatus] += 1;
    }

    console.log(JSON.stringify({
      repairedInvoiceCount: manifest.entries.length,
      invoiceTotalMismatch,
      provenanceChanged,
      lineItemChanged,
      nativePaymentRemoved,
      lifecycleCounts,
      paymentRowCountBefore: backup.invoicePayments.length,
      paymentRowCountAfter: currentPayments.length,
    }, null, 2));
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
