import "dotenv/config";
import "reflect-metadata";

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { DataSource } from "typeorm";

import {
  classifyFinanceInvoiceOrigin,
  isWorkizHistoricalBrandingSnapshot,
} from "../crm/finance-invoice-origin";
import { summarizeInvoiceLedger } from "../crm/invoice-financial-lifecycle.core";
import { InvoiceDocumentEntity } from "./entities/invoice-document.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { buildDataSourceOptions } from "./typeorm.config";

type Classification =
  | "historical_source_truth"
  | "import_mapping_issue"
  | "missing_source_evidence"
  | "native_model_incompatibility"
  | "safe_repair_candidate"
  | "do_not_repair";

function resolveOrgId() {
  return process.env.FINANCE_AUDIT_ORG_ID?.trim() || process.env.PHOENIX_ORG_ID?.trim() || "";
}

async function main() {
  const organizationId = resolveOrgId();
  if (!organizationId) {
    console.error("Set FINANCE_AUDIT_ORG_ID or PHOENIX_ORG_ID before running finance-part6:workiz-audit");
    process.exit(1);
  }

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  const invoiceRepo = dataSource.getRepository(InvoiceEntity);
  const documentRepo = dataSource.getRepository(InvoiceDocumentEntity);

  const invoices = await invoiceRepo.find({
    where: { organization_id: organizationId },
    relations: { payments: true, line_items: true },
  });

  const documents = await documentRepo.find({ where: { organization_id: organizationId } });
  const docsByInvoice = new Map<string, typeof documents>();
  for (const document of documents) {
    const list = docsByInvoice.get(document.invoice_id) ?? [];
    list.push(document);
    docsByInvoice.set(document.invoice_id, list);
  }

  const counts: Record<Classification, number> = {
    historical_source_truth: 0,
    import_mapping_issue: 0,
    missing_source_evidence: 0,
    native_model_incompatibility: 0,
    safe_repair_candidate: 0,
    do_not_repair: 0,
  };

  const rows: Array<Record<string, unknown>> = [];

  for (const invoice of invoices) {
    const origin = classifyFinanceInvoiceOrigin(invoice);
    const ledger = summarizeInvoiceLedger({
      totalCents: invoice.total_cents || invoice.amount_cents,
      legacyStatus: invoice.status,
      legacyPaidAt: invoice.paid_at,
      payments: invoice.payments ?? [],
      voidedAt: invoice.voided_at,
      cancelledAt: invoice.cancelled_at,
    });

    const invoiceDocs = docsByInvoice.get(invoice.id) ?? [];
    const hasWorkizPdf = invoiceDocs.some((doc) => doc.document_kind === "workiz_source_pdf");
    const hasNativePdf = invoiceDocs.some((doc) => doc.document_kind === "native_customer_pdf");
    const isHistorical = isWorkizHistoricalBrandingSnapshot(invoice.branding_snapshot_json) || origin === "workiz_historical";

    if (!isHistorical) {
      continue;
    }

    let classification: Classification = "historical_source_truth";

    if (invoice.customer_facing_snapshot_json?.trim()) {
      classification = "native_model_incompatibility";
    } else if (!hasWorkizPdf && !hasNativePdf) {
      classification = "missing_source_evidence";
    } else if (ledger.lifecycleStatus === "partial" && (invoice.payments?.length ?? 0) === 0) {
      classification = "safe_repair_candidate";
    } else if (ledger.overpaymentCents > 0) {
      classification = "do_not_repair";
    }

    counts[classification] += 1;
    rows.push({
      invoice_id: invoice.id,
      finance_origin: origin,
      classification,
      lifecycle_status: ledger.lifecycleStatus,
      balance_cents: ledger.balanceCents,
      overpayment_cents: ledger.overpaymentCents,
      has_workiz_pdf: hasWorkizPdf,
      has_native_pdf: hasNativePdf,
      payment_count: invoice.payments?.length ?? 0,
    });
  }

  const outputDir = join(process.cwd(), "_runtime_harness", "finance-part6-workiz-audit");
  mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(outputDir, `classification-${timestamp}.json`), JSON.stringify({ organizationId, counts, rows }, null, 2));

  console.log(JSON.stringify({ ok: true, organizationId, historicalInvoices: rows.length, counts }, null, 2));
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
