export const INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION = 1 as const;

export type CustomerFacingSnapshotFreezeVia =
  | "email"
  | "sms"
  | "portal"
  | "sent"
  | "approved"
  | "signed";

export type CustomerFacingSnapshotCopyBlock = {
  description: string | null;
  customer_notes: string | null;
  terms_text: string | null;
  warranty_text: string | null;
  payment_instructions: string | null;
  footer: string | null;
};

export type CustomerFacingSnapshotProvenance = {
  organization_id: string;
};

export type CustomerFacingSnapshotSignatureBlock = {
  approved_at: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
};

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

export const INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V2 = 2 as const;

export type BranchSnapshotBlock = {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal: string | null;
  tax_label: string | null;
  tax_number: string | null;
  logo: string | null;
  template_version: string;
};

export type InvoiceCustomerFacingSnapshotV2 = Omit<InvoiceCustomerFacingSnapshotV1, "schema_version"> & {
  schema_version: typeof INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V2;
  branch: BranchSnapshotBlock;
};

export const INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V3 = 3 as const;

export type CustomerFacingDocumentKind = "invoice" | "estimate";

export type InvoiceCustomerFacingSnapshotV3 = Omit<
  InvoiceCustomerFacingSnapshotV1,
  "schema_version" | "frozen_via" | "description" | "invoice_id"
> & {
  schema_version: typeof INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V3;
  document_kind: CustomerFacingDocumentKind;
  document_id: string;
  invoice_id?: string;
  estimate_id?: string;
  frozen_via: CustomerFacingSnapshotFreezeVia;
  copy: CustomerFacingSnapshotCopyBlock;
  provenance: CustomerFacingSnapshotProvenance;
  signature: CustomerFacingSnapshotSignatureBlock;
  branch?: BranchSnapshotBlock;
};

export type InvoiceCustomerFacingSnapshot = InvoiceCustomerFacingSnapshotV1;
export type InvoiceCustomerFacingSnapshotAny =
  | InvoiceCustomerFacingSnapshotV1
  | InvoiceCustomerFacingSnapshotV2
  | InvoiceCustomerFacingSnapshotV3;

const SUPPORTED_SCHEMA_VERSIONS = new Set<number>([
  INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION,
  INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V2,
  INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V3,
]);

export function isSupportedCustomerFacingSnapshot(
  value: unknown,
): value is InvoiceCustomerFacingSnapshotAny {
  if (!value || typeof value !== "object") {
    return false;
  }

  const schemaVersion = (value as { schema_version?: unknown }).schema_version;
  return typeof schemaVersion === "number" && SUPPORTED_SCHEMA_VERSIONS.has(schemaVersion);
}

export function isInvoiceCustomerFacingSnapshotV2(
  snapshot: InvoiceCustomerFacingSnapshotAny,
): snapshot is InvoiceCustomerFacingSnapshotV2 {
  return snapshot.schema_version === INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V2;
}

export function isInvoiceCustomerFacingSnapshotV3(
  snapshot: InvoiceCustomerFacingSnapshotAny,
): snapshot is InvoiceCustomerFacingSnapshotV3 {
  return snapshot.schema_version === INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V3;
}

export function snapshotDescription(snapshot: InvoiceCustomerFacingSnapshotAny): string | null {
  if (isInvoiceCustomerFacingSnapshotV3(snapshot)) {
    return snapshot.copy.description;
  }

  return snapshot.description;
}
