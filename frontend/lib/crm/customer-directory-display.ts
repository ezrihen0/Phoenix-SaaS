import { openJobStatuses } from "@/lib/crm/data";
import { formatAddress } from "@/lib/crm/display";
import type { Database } from "@/lib/types/database";

type CustomerRecord = Database["public"]["Tables"]["customers"]["Row"];
type CustomerLifecycleStatus = Database["public"]["Enums"]["customer_lifecycle_status"];
type CustomerJobSummary = Pick<
  Database["public"]["Tables"]["jobs"]["Row"],
  | "id"
  | "customer_id"
  | "title"
  | "description"
  | "requested_service_type"
  | "status"
  | "scheduled_for"
  | "scheduled_window"
  | "created_at"
  | "updated_at"
>;

export type CustomerListItem = CustomerRecord & {
  relatedJobs: CustomerJobSummary[];
};

export function hasCompanyOnFile(customer: CustomerListItem) {
  return Boolean(customer.company_name?.trim());
}

export function activeJobCount(customer: CustomerListItem) {
  return customer.relatedJobs.filter((job) => openJobStatuses.includes(job.status)).length;
}

export function isNewThisMonth(createdAt: string) {
  const created = new Date(createdAt);
  const now = new Date();
  return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
}

export function resolveCustomerLifecycleStatus(customer: CustomerListItem): CustomerLifecycleStatus {
  if (
    customer.lifecycle_status === "prospect" ||
    customer.lifecycle_status === "active" ||
    customer.lifecycle_status === "past" ||
    customer.lifecycle_status === "archived"
  ) {
    return customer.lifecycle_status;
  }

  return activeJobCount(customer) > 0 ? "active" : "past";
}

export function customerLifecycleBadgeClass(status: CustomerLifecycleStatus) {
  if (status === "prospect") {
    return "theme-status-warning inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }

  if (status === "active") {
    return "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }

  if (status === "past") {
    return "theme-control-surface inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]";
  }

  return "theme-alert-error inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
}

export function customerLifecycleLabel(status: CustomerLifecycleStatus) {
  if (status === "prospect") {
    return "Prospect";
  }

  if (status === "active") {
    return "Active";
  }

  if (status === "past") {
    return "Past";
  }

  return "Archived";
}

export function getCustomerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function companyBadgeClass(hasCompany: boolean) {
  return hasCompany
    ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]"
    : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/80 text-[color:var(--sem-text-secondary)]";
}

export function formatCustomerAddress(customer: CustomerListItem) {
  return formatAddress(
    customer.service_address_line_1,
    customer.service_address_line_2,
    customer.service_city,
    customer.service_state_or_region,
    customer.service_postal_code,
  );
}
