import type { ProfileRole } from "../crm/constants";

/** Product-facing labels for canonical backend role identifiers. */
export const SYSTEM_ROLE_LABELS: Record<ProfileRole, string> = {
  owner: "Owner",
  admin: "Admin",
  office_admin: "Office / CSR",
  dispatcher: "Dispatcher",
  csr: "CSR",
  technician: "Technician",
  viewer: "Viewer",
};

export const SYSTEM_ROLE_PRESETS = [
  "owner",
  "admin",
  "office_admin",
  "dispatcher",
  "technician",
] as const satisfies readonly ProfileRole[];

export type SystemRolePreset = (typeof SYSTEM_ROLE_PRESETS)[number];

export function isSystemRolePreset(role: ProfileRole): role is SystemRolePreset {
  return (SYSTEM_ROLE_PRESETS as readonly string[]).includes(role);
}

export function formatRoleLabel(role: ProfileRole | string | null | undefined): string {
  if (!role) {
    return "Unknown";
  }

  const normalized = role.trim().toLowerCase() as ProfileRole;
  return SYSTEM_ROLE_LABELS[normalized] ?? role.replace(/_/g, " ");
}

export function isProtectedOwnerRole(role: ProfileRole | null | undefined): boolean {
  return role === "owner";
}
