import type { ClientSession } from "@/lib/auth/client-auth";

/**
 * Mirrors server-side route guards on marketing pages (`requireServerRoles`, `requireOfficeCrmRoute`).
 * Update this module when those guards change.
 */
export type ShellNavRole = NonNullable<ClientSession["profile"]>["role"];

const ROLES_LEADS_CALLS: ReadonlySet<ShellNavRole> = new Set(["owner", "office_admin", "dispatcher"]);

const ROLES_MARKETING_AND_LEGACY_AUTOMATIONS: ReadonlySet<ShellNavRole> = new Set([
  "owner",
  "admin",
  "office_admin",
  "dispatcher",
]);

const ROLES_INVOICES: ReadonlySet<ShellNavRole> = new Set([
  "owner",
  "office_admin",
  "dispatcher",
  "technician",
]);

const ROLES_INVENTORY: ReadonlySet<ShellNavRole> = new Set([
  "owner",
  "office_admin",
  "dispatcher",
  "technician",
]);

const ROLES_ESTIMATES: ReadonlySet<ShellNavRole> = new Set(["owner", "office_admin", "technician"]);

/** Matches `requireOfficeCrmRoute`: technician is redirected away from office CRM list routes */
export function isOfficeCrmNavRole(role: ShellNavRole | null): boolean {
  return role !== null && role !== "technician";
}

/**
 * Whether the primary nav entry or quick link should render for this href.
 * When `roleResolved` is false, only safe always-allowed destinations are shown (avoids flashing
 * unreachable links before the session returns).
 */
export function isShellNavHrefVisible(
  href: string,
  role: ShellNavRole | null,
  roleResolved: boolean,
): boolean {
  if (!roleResolved || role === null) {
    return href === "/home" || href === "/settings";
  }

  switch (href) {
    case "/home":
    case "/settings":
    case "/pricebook":
    case "/inspections":
      return true;

    case "/jobs":
    case "/customers":
    case "/schedule":
    case "/dispatch":
      return isOfficeCrmNavRole(role);

    case "/leads":
    case "/calls":
      return ROLES_LEADS_CALLS.has(role);

    case "/messaging":
      return role !== "technician";

    case "/marketing":
    case "/automations":
      return ROLES_MARKETING_AND_LEGACY_AUTOMATIONS.has(role);

    case "/inventory":
      return ROLES_INVENTORY.has(role);

    case "/invoices":
      return ROLES_INVOICES.has(role);

    case "/estimates":
      return ROLES_ESTIMATES.has(role);

    default:
      return true;
  }
}

/** When role is known: would this href be shown in the shell (same as route access for listed paths). */
export function canAccessShellHref(href: string, role: ShellNavRole | null): boolean {
  if (role === null) {
    return false;
  }

  return isShellNavHrefVisible(href, role, true);
}
