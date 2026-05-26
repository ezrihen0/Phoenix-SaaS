import { crmApiFetch } from "@/lib/crm/browser-api";

export type InspectionListRow = {
  id: string;
  customer_id?: string;
  client_name: string | null;
  address: string | null;
  report_type: string;
  workflow_type: string;
  status: string;
  country_code?: string | null;
  region_code?: string | null;
  province_code?: string | null;
  compliance_status: string | null;
  safety_score: number | null;
  updated_at: string;
  sent_to_customer_at: string | null;
  archived_at: string | null;
  archive_reason_code: string | null;
  archive_reason: string | null;
};

export type InspectionArchiveReasonCode =
  | "customer_repaired_issue"
  | "duplicate_report"
  | "created_by_mistake"
  | "superseded_by_new_inspection"
  | "internal_test"
  | "other";

export type InspectionActiveState = "active" | "archived" | "all";

export type InspectionWorkspacePayload = {
  inspectionMeta: {
    id: string;
    customer_id: string;
    job_id: string | null;
    report_type: string;
    workflow_type: string;
    status: string;
    country_code?: string | null;
    region_code?: string | null;
    province_code: string;
    site_address_snapshot: string | null;
    client_display_name_snapshot: string | null;
    report_version: string;
    report_generated_at: string | null;
    gas_license_number: string | null;
    gas_license_holder_name: string | null;
    generated_pdf_url: string | null;
    generated_pdf_at: string | null;
    sent_to_customer_at: string | null;
    locked_at: string | null;
    archived_at: string | null;
    archive_reason_code: string | null;
    archive_reason: string | null;
    public_job_code: string | null;
    quote_number: string | null;
    invoice_number: string | null;
    report_number: string | null;
    is_internal_draft: boolean;
    draft_action_label: string;
    created_at: string;
    updated_at: string;
  };
  sections: Array<{ key: string; completion_ratio: number; completed: number; total: number }>;
  items: Array<{
    id: string;
    section_key: string;
    item_key: string;
    item_label: string;
    assignment_type: "required_photo" | "unsatisfactory_evidence" | null;
    status: "satisfactory" | "unsatisfactory" | "na";
    is_required: boolean;
    is_legal_mandatory: boolean;
    recommendation_text: string | null;
    sort_order: number;
    photo_attached_count: number;
  }>;
  required_fields: Array<{
    id: string;
    field_key: string;
    field_label: string;
    field_value: string | null;
    is_mandatory: boolean;
    is_satisfied: boolean;
  }>;
  liveScoreOrCompliance: {
    score: number | null;
    score_max: number;
    compliance_status: string | null;
    can_generate: boolean;
    gate_errors: string[];
  };
  disclaimers: {
    main: string;
    limitations?: string;
    workflowSpecific?: string;
  };
  photoPool: Array<{
    id: string;
    photo_type: string;
    caption: string | null;
    thumbnail_url: string | null;
    asset_url: string | null;
    created_at: string;
    assignment_item_id: string | null;
    assignment_label: string | null;
    assignment_type: "required_photo" | "unsatisfactory_evidence" | null;
  }>;
  pdfPreviewUrl: string | null;
};

export function listInspections(input: {
  q?: string;
  reportType?: string;
  status?: string;
  customerId?: string;
  activeState?: InspectionActiveState;
}) {
  const params = new URLSearchParams();
  if (input.q?.trim()) params.set("q", input.q.trim());
  if (input.reportType?.trim()) params.set("reportType", input.reportType.trim());
  if (input.status?.trim()) params.set("status", input.status.trim());
  if (input.customerId?.trim()) params.set("customerId", input.customerId.trim());
  if (input.activeState && input.activeState !== "active") params.set("activeState", input.activeState);
  const query = params.toString();
  return crmApiFetch<InspectionListRow[]>(`/api/inspections${query ? `?${query}` : ""}`);
}

export type CreateInspectionInput = {
  source: "new_customer" | "existing_customer" | "existing_job" | "internal_draft";
  report_type: string;
  customer_id?: string | null;
  job_id?: string | null;
  property_address?: string | null;
  new_customer?: {
    first_name: string;
    last_name: string;
    phone: string;
    email?: string | null;
    property_address: string;
  };
};

export type InspectionCustomerSearchRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
};

export type InspectionJobSearchRow = {
  id: string;
  job_code: string;
  customer_name: string;
  customer_phone: string;
  service_address: string;
  quote_number: string;
  invoice_number: string;
  report_number: string;
};

export function createInspection(input: CreateInspectionInput) {
  return crmApiFetch<InspectionWorkspacePayload>("/api/inspections", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function searchInspectionCustomers(q: string) {
  const query = q.trim();
  if (query.length < 2) {
    return Promise.resolve([] as InspectionCustomerSearchRow[]);
  }
  return crmApiFetch<InspectionCustomerSearchRow[]>(`/api/inspections/customers/search?q=${encodeURIComponent(query)}`);
}

export function searchInspectionJobs(q: string) {
  const query = q.trim();
  if (query.length < 2) {
    return Promise.resolve([] as InspectionJobSearchRow[]);
  }
  return crmApiFetch<InspectionJobSearchRow[]>(`/api/inspections/jobs/search?q=${encodeURIComponent(query)}`);
}

export function getInspectionWorkspace(inspectionId: string) {
  return crmApiFetch<InspectionWorkspacePayload>(`/api/inspections/${inspectionId}/workspace`);
}

export function patchInspectionItem(
  inspectionId: string,
  itemId: string,
  input: { status?: "satisfactory" | "unsatisfactory" | "na"; recommendation_text?: string | null },
) {
  return crmApiFetch<InspectionWorkspacePayload>(`/api/inspections/${inspectionId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function patchRequiredField(
  inspectionId: string,
  fieldId: string,
  input: { field_value?: string | null; is_satisfied?: boolean },
) {
  return crmApiFetch<InspectionWorkspacePayload>(`/api/inspections/${inspectionId}/required-fields/${fieldId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function patchInspectionMeta(
  inspectionId: string,
  input: { gas_license_number?: string | null; gas_license_holder_name?: string | null },
) {
  return crmApiFetch<InspectionWorkspacePayload>(`/api/inspections/${inspectionId}/meta`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function generateInspection(inspectionId: string) {
  return crmApiFetch<InspectionWorkspacePayload>(`/api/inspections/${inspectionId}/generate`, {
    method: "POST",
  });
}

export function sendInspection(inspectionId: string) {
  return crmApiFetch<InspectionWorkspacePayload>(`/api/inspections/${inspectionId}/send`, {
    method: "POST",
  });
}

export function unlockInspectionForCorrection(inspectionId: string) {
  return crmApiFetch<InspectionWorkspacePayload>(`/api/inspections/${inspectionId}/unlock`, {
    method: "POST",
  });
}

export function archiveInspection(
  inspectionId: string,
  input: { reasonCode: InspectionArchiveReasonCode; reasonText: string },
) {
  return crmApiFetch<InspectionWorkspacePayload>(`/api/inspections/${inspectionId}/archive`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function restoreInspection(inspectionId: string) {
  return crmApiFetch<InspectionWorkspacePayload>(`/api/inspections/${inspectionId}/restore`, {
    method: "POST",
  });
}

export function assignInspectionPhoto(
  inspectionId: string,
  input: { photo_id: string; item_id: string; assignment_type?: "required_photo" | "unsatisfactory_evidence" | null },
) {
  return crmApiFetch<InspectionWorkspacePayload>(`/api/inspections/${inspectionId}/photos/assign`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function uploadInspectionPhotos(inspectionId: string, files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  return crmApiFetch<InspectionWorkspacePayload>(`/api/inspections/${inspectionId}/photos/upload`, {
    method: "POST",
    body: formData,
    headers: {},
  });
}
