/**
 * Mobile module expectations below the `lg` breakpoint.
 * UX-only labels and notices — route guards and permissions stay unchanged.
 */
export type MobileModulePolicy = "core" | "limited" | "desktopOnly";

const CORE_ROUTES = ["/home", "/leads", "/calls", "/messaging"] as const;

const DESKTOP_ONLY_PREFIXES = [
  "/automations",
  "/marketing",
  "/invoices",
  "/estimates",
  "/reports",
] as const;

const LIMITED_PREFIXES = [
  "/pricebook",
  "/inventory",
  "/inspections",
  "/settings",
  "/billing",
  "/customers",
  "/jobs",
  "/schedule",
] as const;

function normalizeHref(href: string) {
  const trimmed = href.trim();

  if (!trimmed || trimmed === "/") {
    return "/home";
  }

  return trimmed.endsWith("/") && trimmed.length > 1 ? trimmed.slice(0, -1) : trimmed;
}

function matchesPrefix(href: string, prefix: string) {
  return href === prefix || href.startsWith(`${prefix}/`);
}

export function getMobileModulePolicy(href: string): MobileModulePolicy {
  const normalized = normalizeHref(href);

  if (CORE_ROUTES.some((route) => matchesPrefix(normalized, route))) {
    return "core";
  }

  if (DESKTOP_ONLY_PREFIXES.some((prefix) => matchesPrefix(normalized, prefix))) {
    return "desktopOnly";
  }

  if (LIMITED_PREFIXES.some((prefix) => matchesPrefix(normalized, prefix))) {
    return "limited";
  }

  return "limited";
}

export function getMobileModulePolicyReason(href: string): string {
  const normalized = normalizeHref(href);

  if (matchesPrefix(normalized, "/automations")) {
    return "Workflow editing needs a wide canvas and precise controls.";
  }

  if (matchesPrefix(normalized, "/marketing")) {
    return "Growth Center analytics and multi-panel desks work best on desktop.";
  }

  if (matchesPrefix(normalized, "/pricebook")) {
    return "Catalog tables and bundle editing are easier on a larger screen.";
  }

  if (matchesPrefix(normalized, "/inventory")) {
    return "Stock and catalog desks are dense — desktop is recommended.";
  }

  if (matchesPrefix(normalized, "/inspections")) {
    return "Inspection authoring is desktop-weighted; mobile is best for quick lookups.";
  }

  if (matchesPrefix(normalized, "/invoices") || matchesPrefix(normalized, "/estimates")) {
    return "Billing tables and admin workflows are desktop-first.";
  }

  if (matchesPrefix(normalized, "/settings") || matchesPrefix(normalized, "/billing")) {
    return "Org and billing settings are easier to manage on desktop.";
  }

  return "This module is optimized for desktop use.";
}

export function getMobileModulePolicyBadge(policy: MobileModulePolicy): string | null {
  if (policy === "desktopOnly") {
    return "Desktop";
  }

  if (policy === "limited") {
    return "Best on desktop";
  }

  return null;
}
