import type { RoleModePermission } from "../auth/permissions";

export type PermissionGroupId =
  | "customers"
  | "leads"
  | "jobs"
  | "schedule"
  | "communication"
  | "estimates"
  | "invoices_payments"
  | "inspections"
  | "documents"
  | "marketing"
  | "reports"
  | "team"
  | "settings"
  | "integrations"
  | "billing";

export type PermissionRegistryEntry = {
  key: RoleModePermission;
  label: string;
  group: PermissionGroupId;
  sensitive?: boolean;
};

export const PERMISSION_REGISTRY: PermissionRegistryEntry[] = [
  { key: "dashboard.office.view", label: "Office dashboard", group: "reports" },
  { key: "search.global", label: "Global search", group: "reports" },
  { key: "customers.view", label: "View customers", group: "customers" },
  { key: "customers.manage", label: "Manage customers", group: "customers" },
  { key: "leads.view", label: "View leads", group: "leads" },
  { key: "leads.manage", label: "Manage leads", group: "leads" },
  { key: "jobs.view", label: "View all jobs", group: "jobs" },
  { key: "jobs.create", label: "Create jobs", group: "jobs" },
  { key: "jobs.update", label: "Update jobs", group: "jobs" },
  { key: "jobs.status.update", label: "Update job status", group: "jobs" },
  { key: "jobs.notes.create", label: "Add job notes", group: "jobs" },
  { key: "jobs.assigned.view", label: "View assigned jobs", group: "jobs" },
  { key: "jobs.assigned.status.update", label: "Update assigned job status", group: "jobs" },
  { key: "calls.view", label: "View calls", group: "communication" },
  { key: "calls.dial", label: "Place calls", group: "communication" },
  { key: "calls.callbacks.manage", label: "Manage callbacks", group: "communication" },
  { key: "calls.settings.manage", label: "Manage call settings", group: "integrations", sensitive: true },
  { key: "messaging.view", label: "View messages", group: "communication" },
  { key: "messaging.send", label: "Send messages", group: "communication" },
  { key: "estimates.view", label: "View estimates", group: "estimates" },
  { key: "estimates.manage", label: "Manage estimates", group: "estimates" },
  { key: "estimates.assigned.view", label: "View assigned estimates", group: "estimates" },
  { key: "invoices.view", label: "View invoices", group: "invoices_payments" },
  { key: "invoices.manage", label: "Manage invoices", group: "invoices_payments" },
  { key: "invoices.payment.manage", label: "Record payments & refunds", group: "invoices_payments", sensitive: true },
  { key: "invoices.assigned.view", label: "View assigned invoices", group: "invoices_payments" },
  { key: "pricebook.view", label: "View pricebook", group: "documents" },
  { key: "pricebook.manage", label: "Manage pricebook", group: "documents" },
  { key: "inventory.view", label: "View inventory", group: "documents" },
  { key: "inventory.manage", label: "Manage inventory", group: "documents" },
  { key: "inventory.assigned.view", label: "View assigned inventory", group: "documents" },
  { key: "inspections.admin", label: "Manage inspections", group: "inspections" },
  { key: "automations.view", label: "View marketing automations", group: "marketing" },
  { key: "automations.manage", label: "Manage marketing automations", group: "marketing" },
  { key: "automations.approve", label: "Approve marketing automations", group: "marketing" },
  { key: "automations.settings.manage", label: "Manage marketing settings", group: "marketing", sensitive: true },
  { key: "settings.view", label: "View settings", group: "settings" },
  { key: "settings.manage", label: "Manage settings", group: "settings", sensitive: true },
  { key: "team.view", label: "View team", group: "team" },
  { key: "team.invite", label: "Invite team members", group: "team" },
  { key: "team.manage", label: "Manage team access", group: "team", sensitive: true },
  { key: "billing.view", label: "View billing", group: "billing" },
  { key: "billing.manage", label: "Manage billing", group: "billing", sensitive: true },
  { key: "system.roles.manage", label: "Legacy role management", group: "team", sensitive: true },
  { key: "organizations.manage", label: "Manage organizations", group: "settings", sensitive: true },
];

export const PERMISSION_GROUP_LABELS: Record<PermissionGroupId, string> = {
  customers: "Customers",
  leads: "Leads",
  jobs: "Jobs",
  schedule: "Schedule",
  communication: "Communication",
  estimates: "Estimates",
  invoices_payments: "Invoices & Payments",
  inspections: "Inspections",
  documents: "Documents",
  marketing: "Marketing",
  reports: "Reports",
  team: "Team",
  settings: "Settings",
  integrations: "Integrations",
  billing: "Billing",
};

export function buildPermissionPreview(
  permissions: RoleModePermission[],
): Array<{ group: PermissionGroupId; label: string; level: string }> {
  const granted = new Set(permissions);
  const groups = new Map<PermissionGroupId, { label: string; level: string }>();

  for (const entry of PERMISSION_REGISTRY) {
    const current = groups.get(entry.group);
    const hasAccess = granted.has(entry.key);
    const nextLevel = hasAccess
      ? (entry.key.endsWith(".view") || entry.key.includes("assigned.view") ? "View" : "Full")
      : "No Access";

    if (!current) {
      groups.set(entry.group, { label: PERMISSION_GROUP_LABELS[entry.group], level: nextLevel });
      continue;
    }

    if (current.level === "Full" || nextLevel === "No Access") {
      continue;
    }

    if (nextLevel === "Full" || (current.level === "View" && nextLevel === "View")) {
      groups.set(entry.group, { label: PERMISSION_GROUP_LABELS[entry.group], level: nextLevel === "Full" ? "Full" : "View" });
    }
  }

  return [...groups.entries()].map(([group, value]) => ({
    group,
    label: value.label,
    level: value.level,
  }));
}

export function listPermissionRegistryGroups() {
  const grouped = new Map<PermissionGroupId, PermissionRegistryEntry[]>();

  for (const entry of PERMISSION_REGISTRY) {
    const bucket = grouped.get(entry.group) ?? [];
    bucket.push(entry);
    grouped.set(entry.group, bucket);
  }

  return [...grouped.entries()].map(([id, permissions]) => ({
    id,
    label: PERMISSION_GROUP_LABELS[id],
    permissions,
  }));
}
