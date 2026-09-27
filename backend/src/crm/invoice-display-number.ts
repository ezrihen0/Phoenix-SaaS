import type { InvoiceEntity } from "../database/entities/invoice.entity";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "../database/workiz/workiz-invoice-upsert";

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

function isWorkizHistoricalImportProvenance(raw: string | null | undefined) {
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw) as { import_source?: string };
    return parsed.import_source === WORKIZ_HISTORICAL_IMPORT_SOURCE;
  } catch {
    return false;
  }
}

export function resolveInvoiceDisplayNumber(
  invoice: Pick<InvoiceEntity, "id" | "document_number" | "branding_snapshot_json" | "customer_facing_snapshot_json">,
) {
  if (invoice.document_number?.trim()) {
    return invoice.document_number.trim();
  }

  if (isWorkizHistoricalImportProvenance(invoice.branding_snapshot_json)) {
    const workizCode = parseWorkizInvoiceCodeFromBranding(invoice.branding_snapshot_json);
    if (workizCode) {
      return workizCode;
    }
  }

  return buildDraftInvoiceDisplayNumber(invoice);
}

/** Normalize user search input (e.g. INV-1042, #1042) to match stored document_number. */
export function normalizeInvoiceNumberSearchQuery(raw: string) {
  let value = raw.trim();
  if (!value) {
    return "";
  }

  value = value.replace(/^#+/, "");
  if (/^inv[-\s]/i.test(value)) {
    value = value.replace(/^inv[-\s]*/i, "");
  }

  return value.trim();
}
