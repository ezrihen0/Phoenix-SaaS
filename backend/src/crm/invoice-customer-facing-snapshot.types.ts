export const INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION = 1 as const;

export type InvoiceCustomerFacingSnapshotV1 = {
  schema_version: typeof INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION;
  frozen_at: string;
  frozen_via: "email" | "sms" | "portal";
  invoice_id: string;
  document_number: string;
  issued_at: string;
  due_at: string | null;
  description: string | null;
  business: {
    businessName: string | null;
    displayInitials: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    logoUrl: string | null;
    accentColor: string | null;
    paymentInstructions: string | null;
    businessLicense: string | null;
    gstNumber: string | null;
    warrantyMessage: string | null;
    invoicePdfFooter: string | null;
    companyAddress: string | null;
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
    job_id: string;
    title: string;
    service_type: string | null;
  };
  financial: {
    subtotal_cents: number;
    tax_rate_bps: number;
    tax_cents: number;
    total_cents: number;
    discount_cents: number;
  };
  lines: Array<{
    id: string;
    name: string;
    description: string | null;
    quantity: string;
    unit_price_cents: number;
    line_subtotal_cents: number;
    warranty_months: number | null;
  }>;
};

export type InvoiceCustomerFacingSnapshot = InvoiceCustomerFacingSnapshotV1;
