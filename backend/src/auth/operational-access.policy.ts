/**
 * Route policy for default-deny operational access on staff APIs.
 * Public, provider webhook, portal-customer, and pre-activation billing/auth routes are exempt.
 */

const PUBLIC_ROUTE_PREFIXES = [
  "/api/public/",
  "/api/billing/webhooks/",
  "/api/webhooks/",
  "/telephony/telnyx",
  "/telephony/twilio",
  "/api/marketing/oauth/",
] as const;

const PRE_ACTIVATION_ROUTE_PREFIXES = ["/api/auth/"] as const;

const PRE_ACTIVATION_EXACT_ROUTES = new Set([
  "/api/billing/summary",
  "/api/billing/checkout-session",
]);

function normalizePath(path: string) {
  const withoutQuery = path.split("?")[0]?.trim() ?? "";
  if (!withoutQuery) {
    return "/";
  }
  return withoutQuery.endsWith("/") && withoutQuery.length > 1
    ? withoutQuery.slice(0, -1)
    : withoutQuery;
}

export function isOperationalAccessPublicRoute(path: string) {
  const normalized = normalizePath(path);
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function isPortalCustomerRoute(path: string) {
  const normalized = normalizePath(path);
  return normalized.startsWith("/api/portal/") && !normalized.startsWith("/api/portal/staff");
}

export function isOperationalAccessPreActivationRoute(path: string) {
  const normalized = normalizePath(path);
  if (PRE_ACTIVATION_EXACT_ROUTES.has(normalized)) {
    return true;
  }
  return PRE_ACTIVATION_ROUTE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function requiresOperationalAccess(path: string) {
  const normalized = normalizePath(path);
  if (!normalized.startsWith("/api/")) {
    return false;
  }
  if (isOperationalAccessPublicRoute(normalized)) {
    return false;
  }
  if (isPortalCustomerRoute(normalized)) {
    return false;
  }
  if (isOperationalAccessPreActivationRoute(normalized)) {
    return false;
  }
  return true;
}

export const operationalAccessPolicyExports = {
  PUBLIC_ROUTE_PREFIXES,
  PRE_ACTIVATION_ROUTE_PREFIXES,
  PRE_ACTIVATION_EXACT_ROUTES: [...PRE_ACTIVATION_EXACT_ROUTES],
} as const;
