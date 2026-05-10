import type { Database } from "@/lib/types/database";

export type CustomerImportField =
  | "external_client_number"
  | "full_name"
  | "email"
  | "company_name"
  | "service_address_line_1"
  | "phone"
  | "legacy_created_at"
  | "notes"
  | "source";

export type CustomerImportSource = Database["public"]["Enums"]["lead_source"];

export type CustomerImportRowInput = {
  rowNumber: number;
} & Partial<Record<CustomerImportField, string | null>>;

export type CustomerImportDuplicateMatch = {
  kind: "existing_customer" | "import_row";
  reference: string;
  label: string;
  reasons: string[];
};

export type CustomerImportPreviewRow = {
  rowNumber: number;
  externalClientNumber: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  legacyCreatedAt: string | null;
  addressLabel: string;
  source: CustomerImportSource;
  notes: string | null;
  issues: string[];
  duplicateMatches: CustomerImportDuplicateMatch[];
  status: "ready" | "duplicate" | "invalid";
};

export type CustomerImportPreviewSummary = {
  totalRows: number;
  readyRows: number;
  duplicateRows: number;
  invalidRows: number;
};

export type CustomerImportPreviewResponse = {
  summary: CustomerImportPreviewSummary;
  rows: CustomerImportPreviewRow[];
};

export type CustomerImportResult = {
  summary: CustomerImportPreviewSummary & {
    importedRows: number;
    skippedRows: number;
  };
  rows: CustomerImportPreviewRow[];
  importedCustomers: Array<{
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
  }>;
};

export const customerImportFieldOrder: CustomerImportField[] = [
  "external_client_number",
  "full_name",
  "email",
  "company_name",
  "service_address_line_1",
  "phone",
  "legacy_created_at",
  "notes",
  "source",
];

export const customerImportMainFieldOrder: CustomerImportField[] = [
  "external_client_number",
  "full_name",
  "email",
  "company_name",
  "service_address_line_1",
  "phone",
  "legacy_created_at",
];

export const customerImportAdditionalFieldOrder: CustomerImportField[] = [
  "notes",
  "source",
];

export const customerImportRequiredFields: CustomerImportField[] = [
  "full_name",
  "phone",
  "service_address_line_1",
];

export const customerImportFieldLabels: Record<CustomerImportField, string> = {
  external_client_number: "Client #",
  full_name: "Full Name",
  email: "Email",
  company_name: "Company",
  service_address_line_1: "Address",
  phone: "Phone",
  legacy_created_at: "Created",
  notes: "Notes",
  source: "Lead Source",
};

export const customerImportSourceOptions: CustomerImportSource[] = [
  "phone",
  "website",
  "google",
  "referral",
  "repeat_customer",
  "other",
];
