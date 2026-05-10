import type { Database } from "@/lib/types/database";

type ProfileRole = Database["public"]["Enums"]["profile_role"];
type JobStatus = Database["public"]["Enums"]["job_status"];

export const openJobStatuses: JobStatus[] = [
  "new_lead",
  "contacted",
  "scheduled",
  "on_the_way",
  "in_progress",
  "waiting_for_approval",
];

export const crmLeadSelect = [
  "id",
  "full_name",
  "phone",
  "email",
  "service_address_line_1",
  "service_address_line_2",
  "service_city",
  "service_state_or_region",
  "service_postal_code",
  "source",
  "service_type",
  "description",
  "status",
  "converted_job_id",
  "created_at",
  "updated_at",
].join(", ");

export const crmCustomerSelect = [
  "id",
  "full_name",
  "phone",
  "email",
  "company_name",
  "service_address_line_1",
  "service_address_line_2",
  "service_city",
  "service_state_or_region",
  "service_postal_code",
  "source",
  "preferred_service_type",
  "notes",
  "created_at",
  "updated_at",
].join(", ");

export const crmCustomerJobSummarySelect = [
  "id",
  "customer_id",
  "title",
  "description",
  "requested_service_type",
  "status",
  "scheduled_for",
  "scheduled_window",
  "created_at",
  "updated_at",
].join(", ");

export const crmTechnicianSelect = [
  "id",
  "display_name",
  "phone",
  "specialties",
  "is_active",
  "last_seen_at",
].join(", ");

export const crmServiceSelect = [
  "id",
  "name",
  "description",
  "service_type",
  "default_price_cents",
  "duration_minutes",
  "sort_position",
  "is_active",
].join(", ");

export const crmJobWidgetSelect = [
  "id",
  "assigned_technician_id",
  "title",
  "description",
  "requested_service_type",
  "status",
  "service_address_line_1",
  "service_address_line_2",
  "service_city",
  "service_state_or_region",
  "service_postal_code",
  "scheduled_for",
  "scheduled_window",
  "completed_at",
  "created_at",
  "updated_at",
  "customer:customers(id, full_name, phone, email)",
  "technician:technicians(id, display_name, phone, specialties, is_active)",
].join(", ");

export const crmJobCardSelect = [
  "id",
  "customer_id",
  "service_id",
  "assigned_technician_id",
  "title",
  "description",
  "lead_source",
  "requested_service_type",
  "status",
  "service_address_line_1",
  "service_address_line_2",
  "service_city",
  "service_state_or_region",
  "service_postal_code",
  "scheduled_for",
  "scheduled_window",
  "requested_at",
  "on_the_way_at",
  "started_at",
  "completed_at",
  "paid_at",
  "cancellation_reason",
  "cancelled_at",
  "cancelled_by",
  "created_at",
  "updated_at",
  "customer:customers(id, full_name, phone, email)",
  "service:services(id, name, service_type, duration_minutes, default_price_cents)",
  "technician:technicians(id, display_name, phone, specialties, is_active)",
  "quote:quotes(id, description, price_cents, status, sent_at, approved_at)",
  "invoice:invoices(id, description, amount_cents, status, issued_at, paid_at)",
].join(", ");

export const crmQuoteWidgetSelect = [
  "id",
  "job_id",
  "description",
  "price_cents",
  "status",
  "sent_at",
  "approved_at",
  "created_at",
  "updated_at",
  `job:jobs(${crmJobWidgetSelect})`,
].join(", ");

export const crmInvoiceWidgetSelect = [
  "id",
  "job_id",
  "description",
  "amount_cents",
  "status",
  "issued_at",
  "paid_at",
  "created_at",
  "updated_at",
  `job:jobs(${crmJobWidgetSelect})`,
].join(", ");

export const crmJobDetailSelect = [
  crmJobCardSelect,
  "notes:job_notes(id, findings, recommendations, photo_urls, created_at, updated_at)",
  "status_events:job_status_events(id, status, note, created_at)",
].join(", ");

export function canAccessJob(
  role: ProfileRole | null,
  technicianId: string | null,
  assignedTechnicianId: string | null,
) {
  if (
    role === "owner"
    || role === "admin"
    || role === "office_admin"
    || role === "dispatcher"
    || role === "csr"
    || role === "viewer"
  ) {
    return true;
  }

  if (!technicianId || !assignedTechnicianId) {
    return false;
  }

  return technicianId === assignedTechnicianId;
}

export function getJobStatusTimestampUpdates(
  status: JobStatus,
  timestamp = new Date().toISOString(),
) {
  if (
    status === "new_lead"
    || status === "contacted"
    || status === "scheduled"
  ) {
    return {
      on_the_way_at: null,
      started_at: null,
      completed_at: null,
      paid_at: null,
    };
  }

  if (status === "on_the_way") {
    return {
      on_the_way_at: timestamp,
      started_at: null,
      completed_at: null,
      paid_at: null,
    };
  }

  if (status === "in_progress") {
    return {
      started_at: timestamp,
      on_the_way_at: timestamp,
      completed_at: null,
      paid_at: null,
    };
  }

  if (status === "waiting_for_approval") {
    return {
      completed_at: null,
      paid_at: null,
    };
  }

  if (status === "completed") {
    return {
      completed_at: timestamp,
      paid_at: null,
    };
  }

  if (status === "paid") {
    return {
      completed_at: timestamp,
      paid_at: timestamp,
    };
  }

  return {};
}