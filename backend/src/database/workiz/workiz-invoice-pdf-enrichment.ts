import { randomUUID } from "crypto";

import { DataSource, EntityManager, In } from "typeorm";

import type { WorkizPdfNormalizedInvoice } from "./workiz-invoice-pdf-normalizer";
import {
  buildAuthoritativePdfPaymentRowsFromNormalized,
  hasNativeOrManualPayments,
  reconcileAuthoritativePdfPayments,
} from "./workiz-import-payment-reconciliation";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "./workiz-invoice-upsert";
import { InvoiceEntity } from "../entities/invoice.entity";
import { InvoiceLineItemEntity } from "../entities/invoice-line-item.entity";
import { InvoicePaymentEntity } from "../entities/invoice-payment.entity";
import { JobEntity } from "../entities/job.entity";

export const PDF_ENRICHMENT_PARSER_VERSION = "1.0.0";

export type PdfEnrichmentResult =
  | { action: "enriched"; invoiceId: string; invoiceCode: string }
  | { action: "skipped_duplicate"; invoiceCode: string; reason: string }
  | { action: "skipped_already_enriched"; invoiceCode: string; reason: string }
  | { action: "excluded"; invoiceCode: string | null; reason: string };

type ExistingSnapshot = Record<string, unknown> & {
  import_source?: string;
  source_kind?: string;
  workiz_invoice_code?: string;
  enrichment_status?: string;
  pdf_enrichment?: {
    source_pdf_hash?: string;
    processed_at?: string;
    payments_snapshot?: Array<{
      occurred_at: string | null;
      method: string;
      amount_cents: number;
      status: string;
    }>;
  };
};

function parseSnapshot(raw: string | null): ExistingSnapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ExistingSnapshot;
  } catch {
    return null;
  }
}

function buildEnrichedSnapshot(input: {
  existing: ExistingSnapshot;
  normalized: WorkizPdfNormalizedInvoice;
  customerConflictReview: string;
  processedAt: string;
}): string {
  return JSON.stringify({
    ...input.existing,
    enrichment_status: "complete",
    pdf_enrichment: {
      source: "workiz_pdf",
      workiz_invoice_code: input.normalized.invoice_number,
      source_filename: input.normalized.extraction_meta.source_filename,
      source_pdf_hash: input.normalized.extraction_meta.file_hash,
      workiz_file_number: input.normalized.extraction_meta.workiz_file_number,
      processed_at: input.processedAt,
      parser_version: PDF_ENRICHMENT_PARSER_VERSION,
      customer_conflict_review: input.customerConflictReview,
      customer_snapshot: input.normalized.customer
        ? {
          name: input.normalized.customer.name,
          phone: input.normalized.customer.phone ?? null,
          email: input.normalized.customer.email,
          street: input.normalized.customer.street,
          city: input.normalized.customer.city,
          province: input.normalized.customer.province,
          postal_code: input.normalized.customer.postal_code,
        }
        : null,
      service_summary: input.normalized.service_summary,
      warranty: input.normalized.warranty,
      notes: input.normalized.notes,
      terms: input.normalized.terms,
      payments_snapshot: input.normalized.payments,
      operational_line_items: input.normalized.line_items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
        amount_cents: item.amount_cents,
        content_lines: item.content_lines,
        parts: item.parts,
      })),
    },
  });
}

function buildJobDescriptionAppend(normalized: WorkizPdfNormalizedInvoice): string {
  const sections: string[] = [];
  if (normalized.service_summary.length > 0) {
    sections.push(
      "Service Summary (Workiz PDF):",
      ...normalized.service_summary.map((block) => `${block.title}\n${block.body_lines.join("\n")}`),
    );
  }
  if (normalized.warranty) {
    sections.push(
      "Warranty (Workiz PDF):",
      ...normalized.warranty.duration_mentions,
      ...normalized.warranty.text_blocks,
      ...normalized.warranty.assurance_blocks,
    );
  }
  if (normalized.notes) {
    sections.push(`Notes (Workiz PDF): ${normalized.notes}`);
  }
  return sections.filter(Boolean).join("\n\n");
}

function isSyntheticCsvLine(line: InvoiceLineItemEntity): boolean {
  const name = line.name_snapshot.toLowerCase();
  return name.includes("historical workiz") || name.includes("imported workiz");
}

function authoritativePdfPaymentsAlreadyApplied(
  existing: InvoicePaymentEntity[],
  invoiceCode: string,
  normalized: WorkizPdfNormalizedInvoice,
  defaultOccurredAt: Date,
) {
  if (normalized.payments.length === 0) {
    return false;
  }

  if (hasNativeOrManualPayments(existing, invoiceCode)) {
    return false;
  }

  const proposed = buildAuthoritativePdfPaymentRowsFromNormalized(invoiceCode, normalized, defaultOccurredAt);
  const importerRows = existing
    .filter((payment) => (payment.reference ?? "").startsWith(`workiz:${invoiceCode}:payment:`))
    .sort((left, right) => (left.reference ?? "").localeCompare(right.reference ?? ""));

  if (importerRows.length !== proposed.length) {
    return false;
  }

  return importerRows.every((payment, index) => {
    const row = proposed[index];
    return payment.reference === row.reference
      && payment.amount_cents === row.amountCents
      && payment.method === row.method
      && (payment.note ?? "") === row.note;
  });
}

async function enrichInvoiceFromPdfInTransaction(input: {
  manager: EntityManager;
  organizationId: string;
  invoiceId: string;
  jobId: string;
  normalized: WorkizPdfNormalizedInvoice;
  customerConflictReview: string;
}): Promise<PdfEnrichmentResult> {
  const invoiceCode = input.normalized.invoice_number;
  if (!invoiceCode) {
    return { action: "excluded", invoiceCode: null, reason: "Missing invoice number in PDF extraction" };
  }

  const invoiceRepo = input.manager.getRepository(InvoiceEntity);
  const jobRepo = input.manager.getRepository(JobEntity);
  const lineItemRepo = input.manager.getRepository(InvoiceLineItemEntity);

  const invoice = await invoiceRepo.findOne({
    where: { id: input.invoiceId, organization_id: input.organizationId },
  });
  if (!invoice) {
    return { action: "excluded", invoiceCode, reason: "Invoice not found in Phoenix org" };
  }

  const snapshot = parseSnapshot(invoice.branding_snapshot_json);
  if (snapshot?.import_source !== WORKIZ_HISTORICAL_IMPORT_SOURCE) {
    return { action: "excluded", invoiceCode, reason: "Invoice is not a Workiz historical import" };
  }

  const existingHash = snapshot?.pdf_enrichment?.source_pdf_hash;
  const alreadyComplete = snapshot?.enrichment_status === "complete";
  const paymentRepo = input.manager.getRepository(InvoicePaymentEntity);
  const existingPayments = await paymentRepo.find({
    where: {
      invoice_id: invoice.id,
      organization_id: input.organizationId,
    },
  });

  if (
    alreadyComplete
    && existingHash === input.normalized.extraction_meta.file_hash
    && authoritativePdfPaymentsAlreadyApplied(
      existingPayments,
      invoiceCode,
      input.normalized,
      invoice.issued_at,
    )
  ) {
    return {
      action: "skipped_already_enriched",
      invoiceCode,
      reason: "PDF enrichment already applied for this hash",
    };
  }

  const originalFinancials = {
    amount_cents: invoice.amount_cents,
    subtotal_cents: invoice.subtotal_cents,
    tax_cents: invoice.tax_cents,
    tax_rate_bps_snapshot: invoice.tax_rate_bps_snapshot,
    total_cents: invoice.total_cents,
    status: invoice.status,
  };

  const processedAt = new Date().toISOString();
  invoice.branding_snapshot_json = buildEnrichedSnapshot({
    existing: snapshot ?? {},
    normalized: input.normalized,
    customerConflictReview: input.customerConflictReview,
    processedAt,
  });
  await invoiceRepo.save(invoice);

  const job = await jobRepo.findOne({
    where: { id: input.jobId, organization_id: input.organizationId },
  });
  if (job) {
    const append = buildJobDescriptionAppend(input.normalized);
    const alreadyAppended = (job.description ?? "").includes("Service Summary (Workiz PDF)")
      || (job.description ?? "").includes("Warranty (Workiz PDF)")
      || (job.description ?? "").includes("Notes (Workiz PDF)");
    if (append && !alreadyAppended) {
      job.description = [job.description, append].filter(Boolean).join("\n\n");
      await jobRepo.save(job);
    }
  }

  const existingLines = await lineItemRepo.find({ where: { invoice_id: invoice.id } });
  const hasPdfLines = existingLines.some((line) => line.document_line_key?.includes(":pdf:line:"));
  const shouldReplaceLines = !hasPdfLines && (
    existingLines.length === 0
    || existingLines.every(isSyntheticCsvLine)
  );

  if (shouldReplaceLines && input.normalized.line_items.length > 0) {
    if (existingLines.length > 0) {
      await lineItemRepo.delete({ id: In(existingLines.map((line) => line.id)) });
    }

    await lineItemRepo.save(
      input.normalized.line_items.map((lineItem, index) => lineItemRepo.create({
        id: randomUUID(),
        invoice_id: invoice.id,
        pricebook_item_id: null,
        document_line_key: `workiz:${invoiceCode}:pdf:line:${index + 1}`,
        sku_snapshot: `WORKIZ-PDF-${invoiceCode}-${index + 1}`,
        name_snapshot: lineItem.description.slice(0, 255),
        description_snapshot: [
          lineItem.description,
          ...lineItem.content_lines.filter((line) => line !== lineItem.description),
          ...lineItem.parts.map((part) => part.part_number ? `Part: ${part.part_number}` : part.label),
        ].filter(Boolean).join("\n"),
        item_type_snapshot: "service",
        unit_of_measure_snapshot: "each",
        unit_price_cents_snapshot: lineItem.unit_price_cents,
        quantity: String(lineItem.quantity),
        line_subtotal_cents: lineItem.amount_cents,
        sort_order: index,
      })),
    );
  }

  if (input.normalized.payments.length > 0) {
    await reconcileAuthoritativePdfPayments({
      manager: input.manager,
      organizationId: input.organizationId,
      invoice,
      invoiceCode,
      defaultOccurredAt: invoice.issued_at,
      pdfPayments: input.normalized.payments.map((payment) => ({
        amountCents: payment.amount_cents,
        methodLabel: payment.method,
        statusLabel: payment.status,
        occurredAt: payment.occurred_at ? new Date(payment.occurred_at) : null,
      })),
    });
  }

  const refreshed = await invoiceRepo.findOneOrFail({ where: { id: invoice.id } });
  const financialsUnchanged =
    refreshed.amount_cents === originalFinancials.amount_cents
    && refreshed.subtotal_cents === originalFinancials.subtotal_cents
    && refreshed.tax_cents === originalFinancials.tax_cents
    && refreshed.tax_rate_bps_snapshot === originalFinancials.tax_rate_bps_snapshot
    && refreshed.total_cents === originalFinancials.total_cents
    && refreshed.status === originalFinancials.status;

  if (!financialsUnchanged) {
    throw new Error(`Financial invariant violated for invoice ${invoiceCode}`);
  }

  return { action: "enriched", invoiceId: invoice.id, invoiceCode };
}

export async function enrichInvoiceFromPdf(input: {
  dataSource: DataSource;
  organizationId: string;
  invoiceId: string;
  jobId: string;
  normalized: WorkizPdfNormalizedInvoice;
  customerConflictReview: string;
}): Promise<PdfEnrichmentResult> {
  return input.dataSource.transaction((manager) => enrichInvoiceFromPdfInTransaction({
    manager,
    organizationId: input.organizationId,
    invoiceId: input.invoiceId,
    jobId: input.jobId,
    normalized: input.normalized,
    customerConflictReview: input.customerConflictReview,
  }));
}
