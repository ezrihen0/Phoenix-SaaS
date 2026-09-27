import type { InvoiceCustomerFacingSnapshotAny } from "./invoice-customer-facing-snapshot.types";
import { isInvoiceCustomerFacingSnapshotV3, snapshotDescription } from "./invoice-customer-facing-snapshot.types";

export type HistoricalSnapshotAiReadModel = {
  document_kind: "invoice" | "estimate" | "unknown";
  document_number: string | null;
  issued_at: string | null;
  service_location_lines: string[];
  job_title: string | null;
  service_type: string | null;
  warranty_text: string | null;
  terms_text: string | null;
  payment_instructions: string | null;
  description: string | null;
  total_cents: number | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
};

export function snapshotPortalLineItems(snapshot: InvoiceCustomerFacingSnapshotAny) {
  return snapshot.lines.map((line) => ({
    name: line.name,
    quantity: line.quantity,
    unit_price_cents: line.unit_price_cents,
    line_subtotal_cents: line.line_subtotal_cents,
  }));
}

export function buildHistoricalSnapshotAiReadModel(
  snapshot: InvoiceCustomerFacingSnapshotAny | null | undefined,
): HistoricalSnapshotAiReadModel | null {
  if (!snapshot) {
    return null;
  }

  const copy = isInvoiceCustomerFacingSnapshotV3(snapshot) ? snapshot.copy : null;

  return {
    document_kind: isInvoiceCustomerFacingSnapshotV3(snapshot)
      ? snapshot.document_kind
      : snapshot.invoice_id
        ? "invoice"
        : "unknown",
    document_number: snapshot.document_number ?? null,
    issued_at: snapshot.issued_at ?? null,
    service_location_lines: snapshot.service_location.address_lines,
    job_title: snapshot.job_reference.title ?? null,
    service_type: snapshot.job_reference.service_type ?? null,
    warranty_text: copy?.warranty_text ?? snapshot.business.warrantyMessage,
    terms_text: copy?.terms_text ?? snapshot.business.invoicePdfFooter,
    payment_instructions: copy?.payment_instructions ?? snapshot.business.paymentInstructions,
    description: snapshotDescription(snapshot),
    total_cents: snapshot.financial.total_cents,
    subtotal_cents: snapshot.financial.subtotal_cents,
    tax_cents: snapshot.financial.tax_cents,
  };
}
