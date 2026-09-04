import { getServiceTypeLabel, type ServiceType } from "./constants";

const WORKIZ_JOB_TITLE_PATTERN = /^Workiz\s+([A-Z0-9]+)\s*[—–-]\s*(.+)$/i;
const PROVENANCE_ONLY_NOTES_PATTERN =
  /^\s*Imported from Workiz(?:\s+customer export)?(?:\s+\([^)]+\))?\s*\.?\s*$/i;

export function sanitizeUserFacingText(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  let text = value;
  text = text.replace(/Imported from Workiz historical invoice\s+([A-Z0-9]+)/gi, "Historical invoice $1");
  text = text.replace(/Imported from Workiz(?:\s+customer export)?(?:\s+\([^)]+\))?\.?/gi, "");
  text = text.replace(/\bWorkiz Invoice\s*#/gi, "Invoice #");
  text = text.replace(/\bWorkiz PDF enrichment:\s*/gi, "PDF enrichment: ");
  text = text.replace(/\bWorkiz import:\s*/gi, "Import: ");
  text = text.replace(/\bImported Workiz invoice service total\b/gi, "Historical invoice service total");
  text = text.replace(/\bHistorical Workiz service\b/gi, "Historical service");
  text = text.replace(/\bMerged duplicate Workiz clients:/gi, "Merged duplicate clients:");
  text = text.replace(/\bWorkiz status:\s*/gi, "Status: ");
  text = text.replace(/\bNotes\s*\(\s*Workiz[^)]*\)/gi, "Notes");
  text = text.replace(/\bWorkiz\b/gi, "");
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]+([,.;:])/g, "$1");
  return text.trim();
}

export function isProvenanceOnlyCustomerNotes(notes: string | null | undefined): boolean {
  return Boolean(notes && PROVENANCE_ONLY_NOTES_PATTERN.test(notes));
}

export function sanitizeCustomerNotes(notes: string | null | undefined): string | null {
  if (isProvenanceOnlyCustomerNotes(notes)) {
    return null;
  }

  const sanitized = sanitizeUserFacingText(notes);
  return sanitized.length > 0 ? sanitized : null;
}

export function sanitizeJobTitle(
  title: string | null | undefined,
  options?: { customerName?: string | null; serviceType?: string | null },
): string {
  const raw = title?.trim() ?? "";
  const match = raw.match(WORKIZ_JOB_TITLE_PATTERN);
  const customerName = options?.customerName?.trim() || match?.[2]?.trim() || "";
  const serviceLabel = options?.serviceType
    ? getServiceTypeLabel(options.serviceType as ServiceType)
    : null;

  if (match) {
    if (serviceLabel && customerName) {
      return `${serviceLabel} — ${customerName}`;
    }
    if (customerName) {
      return customerName;
    }
    if (serviceLabel) {
      return serviceLabel;
    }
    return "Job";
  }

  return sanitizeUserFacingText(raw) || customerName || serviceLabel || "Job";
}

export function sanitizeInvoiceDescription(description: string | null | undefined): string {
  return sanitizeUserFacingText(description) || "Invoice";
}

export function sanitizePaymentReference(reference: string | null | undefined): string | null {
  if (reference == null) {
    return null;
  }

  const withoutPrefix = reference.replace(/^workiz:/i, "");
  return sanitizeUserFacingText(withoutPrefix) || withoutPrefix || reference;
}

export function sanitizeSkuSnapshot(sku: string | null | undefined): string | null {
  if (sku == null) {
    return null;
  }

  const withoutPrefix = sku.replace(/^WORKIZ-/i, "");
  return sanitizeUserFacingText(withoutPrefix) || withoutPrefix || sku;
}

export function invoiceDisplayLabel(code: string | null | undefined, fallback = "Invoice"): string {
  const trimmed = (code ?? "").trim();
  if (!trimmed) {
    return fallback;
  }

  const codeOnly = trimmed.replace(/^Workiz\s+/i, "").replace(/^Invoice\s*#\s*/i, "");
  return `Invoice #${codeOnly}`;
}
