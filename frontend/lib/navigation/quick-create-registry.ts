import {
  BriefcaseBusiness,
  ClipboardList,
  FileText,
  Receipt,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type QuickCreateActionId =
  | "job"
  | "invoice"
  | "estimate"
  | "inspection"
  | "lead"
  | "customer";

export type QuickCreateActionTier = "primary" | "secondary";

export type QuickCreateAction = {
  id: QuickCreateActionId;
  labelKey: `shell.quickCreate.actions.${QuickCreateActionId}`;
  icon: LucideIcon;
  requiredPermission: string;
  tier: QuickCreateActionTier;
  defaultHref: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const QUICK_CREATE_ACTIONS: readonly QuickCreateAction[] = [
  {
    id: "job",
    labelKey: "shell.quickCreate.actions.job",
    icon: BriefcaseBusiness,
    requiredPermission: "jobs.create",
    tier: "primary",
    defaultHref: "/jobs/new",
  },
  {
    id: "invoice",
    labelKey: "shell.quickCreate.actions.invoice",
    icon: Receipt,
    requiredPermission: "invoices.manage",
    tier: "primary",
    defaultHref: "/invoices/new",
  },
  {
    id: "estimate",
    labelKey: "shell.quickCreate.actions.estimate",
    icon: FileText,
    requiredPermission: "estimates.manage",
    tier: "primary",
    defaultHref: "/estimates/new",
  },
  {
    id: "inspection",
    labelKey: "shell.quickCreate.actions.inspection",
    icon: ShieldCheck,
    requiredPermission: "inspections.admin",
    tier: "primary",
    defaultHref: "/inspections/new",
  },
  {
    id: "lead",
    labelKey: "shell.quickCreate.actions.lead",
    icon: ClipboardList,
    requiredPermission: "leads.manage",
    tier: "secondary",
    defaultHref: "/leads?intake=1",
  },
  {
    id: "customer",
    labelKey: "shell.quickCreate.actions.customer",
    icon: Users,
    requiredPermission: "customers.manage",
    tier: "secondary",
    defaultHref: "/customers/new",
  },
] as const;

function extractRouteId(pathname: string, segment: "jobs" | "customers"): string | null {
  const match = pathname.match(new RegExp(`^/${segment}/([^/?#]+)`));

  if (!match?.[1] || !UUID_PATTERN.test(match[1])) {
    return null;
  }

  return match[1];
}

export function resolveQuickCreateHref(actionId: QuickCreateActionId, pathname: string): string {
  const jobId = extractRouteId(pathname, "jobs");
  const customerId = extractRouteId(pathname, "customers");

  switch (actionId) {
    case "job":
      return customerId
        ? `/jobs/new?customerId=${encodeURIComponent(customerId)}`
        : "/jobs/new";
    case "invoice":
      if (jobId) {
        return `/jobs/${jobId}?tab=invoice`;
      }

      return customerId
        ? `/invoices/new?customerId=${encodeURIComponent(customerId)}`
        : "/invoices/new";
    case "estimate":
      if (jobId) {
        return `/jobs/${jobId}?tab=quote`;
      }

      return customerId
        ? `/estimates/new?customerId=${encodeURIComponent(customerId)}`
        : "/estimates/new";
    case "inspection":
      return "/inspections/new";
    case "lead":
      return "/leads?intake=1";
    case "customer":
      return "/customers/new";
    default:
      return "/home";
  }
}

export function getQuickCreateAction(actionId: QuickCreateActionId) {
  return QUICK_CREATE_ACTIONS.find((action) => action.id === actionId) ?? null;
}

export function filterQuickCreateActions(permissions: string[]) {
  const permissionSet = new Set(permissions);

  return QUICK_CREATE_ACTIONS.filter((action) => permissionSet.has(action.requiredPermission));
}

export function buildQuickCreateMenuItems(permissions: string[], pathname: string) {
  return filterQuickCreateActions(permissions).map((action) => ({
    ...action,
    href: resolveQuickCreateHref(action.id, pathname),
  }));
}
