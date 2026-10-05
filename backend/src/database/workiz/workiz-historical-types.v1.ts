export const WORKIZ_HISTORICAL_PARSER_VERSION = "workiz-historical-parser-v1.1";
export const WORKIZ_HISTORICAL_PIPELINE_VERSION = "workiz-historical-preproduction-v1.1";

export const WORKIZ_PROVENANCE_TAGS = ["WORKIZ", "HISTORICAL_IMPORT"] as const;
export const WORKIZ_CALGARY_TAG = "CALGARY";

export type WorkizFinancialGate = "PASS" | "MANUAL_REVIEW";

export type WorkizIdentityClassification =
  | "CONFIRMED_NEW_CUSTOMER"
  | "CONFIRMED_EXISTING_CUSTOMER"
  | "CONFIRMED_REPEAT_CUSTOMER"
  | "POSSIBLE_DUPLICATE"
  | "MANUAL_REVIEW";

export type WorkizHistoricalSourceEvidence = {
  filename: string;
  source_path: string;
  sha256: string;
  bytes: number;
  workiz_file_number: string | null;
  parser_version: string;
  import_batch_id: string;
  is_canonical_for_invoice: boolean;
  duplicate_export_siblings: string[];
};

export type WorkizHistoricalCustomerEvidence = {
  name: string;
  company: string | null;
  email: string | null;
  normalized_email: string | null;
  phone: string;
  normalized_phone: string | null;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  province: string | null;
  postal_code: string;
  normalized_city: string;
};

export type WorkizHistoricalJobEvidence = {
  service_date: string | null;
  completion_date: string | null;
  service_category: string | null;
  system: string | null;
  work_performed_raw: string[];
  historical_notes: string | null;
  related_invoice_number: string | null;
};

export type WorkizHistoricalInvoiceEvidence = {
  workiz_invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  subtotal_cents: number | null;
  discount_cents: number | null;
  tax_cents: number | null;
  tax_rate_bps: number | null;
  total_cents: number | null;
  balance_due_cents: number | null;
  original_source_system: "WORKIZ";
};

export type WorkizHistoricalInvoiceLine = {
  raw_description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  structured: {
    system: string | null;
    component: string | null;
    work_action: string | null;
    is_labor: boolean;
  };
};

export type WorkizHistoricalPayment = {
  occurred_at: string | null;
  amount_cents: number;
  method_label: string;
  status_label: string;
  source_wording: string[];
};

export type WorkizWarrantyEvidenceSourceLocation =
  | "INVOICE_LINE"
  | "WARRANTY_SECTION"
  | "NOTES"
  | "TERMS";

export type WorkizWarrantyProvenance =
  | "DOCUMENTED"
  | "PHOENIX_DEFAULT_POLICY"
  | "AMBIGUOUS_WARRANTY"
  | "UNKNOWN";

export type WorkizWarrantyEvidenceItem = {
  scope: "PARTS" | "LABOR" | "GENERIC" | "UNKNOWN";
  raw_text: string;
  explicit_duration: string | null;
  source_location: WorkizWarrantyEvidenceSourceLocation;
  source_line_index: number | null;
};

export type WorkizServiceIntelligence = {
  system: string | null;
  primary_service: string | null;
  service_detail: string | null;
  component: string | null;
  work_action: string | null;
  labor: boolean;
  findings: string[];
  raw_evidence: string[];
};

export type WorkizWarrantyScopeReconstruction = {
  scope: "PARTS" | "LABOR";
  duration_months: number | null;
  start_date: string | null;
  end_date: string | null;
  provenance: WorkizWarrantyProvenance;
  status: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "UNKNOWN";
  source_text: string | null;
  source_location: WorkizWarrantyEvidenceSourceLocation | null;
};

export type WorkizWarrantyReconstruction = {
  parts: WorkizWarrantyScopeReconstruction;
  labor: WorkizWarrantyScopeReconstruction;
};

export type WorkizHistoricalParseCandidate = {
  source: WorkizHistoricalSourceEvidence;
  customer: WorkizHistoricalCustomerEvidence | null;
  job: WorkizHistoricalJobEvidence;
  invoice: WorkizHistoricalInvoiceEvidence | null;
  invoice_lines: WorkizHistoricalInvoiceLine[];
  payments: WorkizHistoricalPayment[];
  warranty_evidence: WorkizWarrantyEvidenceItem[];
  service_intelligence: WorkizServiceIntelligence;
  warranty_reconstruction: WorkizWarrantyReconstruction | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  review_flags: string[];
  financial_gate: WorkizFinancialGate;
  financial_reasons: string[];
  identity: {
    cluster_id: string | null;
    classification: WorkizIdentityClassification | null;
  };
};

export type WorkizCustomerCluster = {
  cluster_id: string;
  classification: WorkizIdentityClassification;
  invoice_numbers: string[];
  filenames: string[];
  matched_by: string[];
  review_flags: string[];
  customer_snapshot: WorkizHistoricalCustomerEvidence | null;
};
