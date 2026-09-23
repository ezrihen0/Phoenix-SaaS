import type { InvoiceEntity } from "../database/entities/invoice.entity";

export function parseWorkizInvoiceCodeFromBranding(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { workiz_invoice_code?: string; invoiceCode?: string };
    const code = parsed.workiz_invoice_code ?? parsed.invoiceCode;
    return typeof code === "string" && code.trim() ? code.trim() : null;
  } catch {
    return null;
  }
}

export function buildDraftInvoiceDisplayNumber(invoice: Pick<InvoiceEntity, "id">) {
  return `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
}

export function resolveInvoiceDisplayNumber(invoice: Pick<InvoiceEntity, "id" | "document_number" | "branding_snapshot_json">) {
  if (invoice.document_number?.trim()) {
    return invoice.document_number.trim();
  }

  const workizCode = parseWorkizInvoiceCodeFromBranding(invoice.branding_snapshot_json);
  if (workizCode) {
    return workizCode;
  }

  return buildDraftInvoiceDisplayNumber(invoice);
}
