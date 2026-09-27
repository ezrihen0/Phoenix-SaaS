import type { CustomerFacingDocumentKind } from "./invoice-customer-facing-snapshot.types";
import type { HistoricalDocumentRenderMode } from "./historical-document-render.types";

export const PHOENIX_INVOICE_DOCUMENT_SECTION_ORDER = [
  "business_header",
  "document_meta",
  "bill_to",
  "service_location",
  "job_reference",
  "description",
  "line_items",
  "financial_summary",
  "payments_ledger",
  "balance_due",
  "copy_blocks",
  "footer",
] as const;

export type PhoenixInvoiceDocumentSectionId = (typeof PHOENIX_INVOICE_DOCUMENT_SECTION_ORDER)[number];

export type PhoenixInvoiceDocumentPaymentRow = {
  occurred_at: string;
  occurred_at_label: string;
  method: string;
  amount_cents: number;
  amount_label: string;
  reference: string | null;
};

export type PhoenixInvoiceDocumentLineItem = {
  id: string | null;
  name: string;
  description: string | null;
  quantity: string;
  unit_price_cents: number;
  line_subtotal_cents: number;
  unit_price_label: string;
  line_subtotal_label: string;
};

export type PhoenixInvoiceDocumentViewModel = {
  document_kind: CustomerFacingDocumentKind;
  render_mode: HistoricalDocumentRenderMode;
  show_draft_banner: boolean;
  snapshot_frozen: boolean;
  section_order: readonly PhoenixInvoiceDocumentSectionId[];
  business_header: {
    business_name: string | null;
    display_initials: string | null;
    logo_url: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    company_address: string | null;
    business_license: string | null;
    gst_number: string | null;
    accent_color: string | null;
  };
  document_meta: {
    document_number: string;
    lifecycle_status: string;
    issued_at: string;
    due_at: string | null;
    issued_at_label: string;
    due_at_label: string | null;
  };
  bill_to: {
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    address_lines: string[];
  };
  service_location: {
    address_lines: string[];
  };
  job_reference: {
    label: string | null;
    title: string | null;
    service_type: string | null;
  };
  description: string | null;
  line_items: PhoenixInvoiceDocumentLineItem[];
  financial_summary: {
    subtotal_cents: number;
    tax_rate_bps: number;
    tax_cents: number;
    total_cents: number;
    discount_cents: number;
    subtotal_label: string;
    tax_label: string;
    tax_amount_label: string;
    total_label: string;
    discount_label: string | null;
  };
  payments_ledger: {
    payments: PhoenixInvoiceDocumentPaymentRow[];
  };
  balance_due: {
    net_paid_cents: number;
    balance_cents: number;
    overpayment_cents: number;
    paid_label: string | null;
    balance_label: string | null;
    overpayment_label: string | null;
  };
  copy_blocks: {
    customer_notes: string | null;
    warranty_text: string | null;
    terms_text: string | null;
    payment_instructions: string | null;
    footer: string | null;
  };
  footer: {
    generated_at: string;
  };
};

/** @deprecated Use PhoenixInvoiceDocumentViewModel — kept for PDF adapter transition */
export type InvoicePdfViewModel = PhoenixInvoiceDocumentViewModel;
