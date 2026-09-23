import type { InvoiceEntity } from "../database/entities/invoice.entity";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "../database/workiz/workiz-invoice-upsert";
import { parseWorkizInvoiceCodeFromBranding } from "./invoice-display-number";

export type FinanceInvoiceOrigin = "native_wizfield" | "workiz_historical" | "unknown";

export function isWorkizHistoricalBrandingSnapshot(raw: string | null | undefined) {
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw) as { import_source?: string; workiz_invoice_code?: string };
    if (parsed.import_source === WORKIZ_HISTORICAL_IMPORT_SOURCE) {
      return true;
    }

    return Boolean(parseWorkizInvoiceCodeFromBranding(raw));
  } catch {
    return false;
  }
}

export function classifyFinanceInvoiceOrigin(
  invoice: Pick<InvoiceEntity, "branding_snapshot_json" | "customer_facing_snapshot_json">,
): FinanceInvoiceOrigin {
  if (isWorkizHistoricalBrandingSnapshot(invoice.branding_snapshot_json)) {
    return "workiz_historical";
  }

  if (invoice.customer_facing_snapshot_json?.trim()) {
    return "native_wizfield";
  }

  if (parseWorkizInvoiceCodeFromBranding(invoice.branding_snapshot_json)) {
    return "workiz_historical";
  }

  return "unknown";
}

export type StoredPdfDocumentOrigin = "native" | "workiz" | null;

export function resolveStoredPdfDocumentOrigin(document: {
  document_kind: string;
} | null | undefined): StoredPdfDocumentOrigin {
  if (!document) {
    return null;
  }

  if (document.document_kind === "native_customer_pdf") {
    return "native";
  }

  if (document.document_kind === "workiz_source_pdf") {
    return "workiz";
  }

  return null;
}
