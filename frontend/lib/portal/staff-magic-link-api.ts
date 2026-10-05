import { crmApiFetch } from "@/lib/crm/browser-api";

export type StaffPortalMagicLinkPayload = {
  raw_token: string;
  expires_at: string;
};

function resolveCustomerPortalBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_BASE_URL?.replace(/\/$/, "");
  if (configured) {
    return configured;
  }

  if (typeof window !== "undefined" && window.location.hostname.endsWith("phoenixfireplace.ca")) {
    return "https://portal.phoenixfireplace.ca";
  }

  return typeof window !== "undefined" ? window.location.origin : "https://portal.phoenixfireplace.ca";
}

export function customerPortalMagicLinkUrl(rawToken: string) {
  const token = rawToken.trim();
  const base = resolveCustomerPortalBaseUrl();
  if (!token) {
    return `${base}/portal/login`;
  }

  return `${base}/portal/auth/magic?token=${encodeURIComponent(token)}`;
}

/** @deprecated Use customerPortalMagicLinkUrl */
export function customerPortalAccessUrl(token: string) {
  return customerPortalMagicLinkUrl(token);
}

export async function mintStaffPortalMagicLink(customerId: string) {
  return crmApiFetch<StaffPortalMagicLinkPayload>(
    `/api/portal/staff/customers/${encodeURIComponent(customerId)}/magic-links`,
    { method: "POST", body: "{}" },
  );
}
