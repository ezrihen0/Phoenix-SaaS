import { crmApiFetch } from "@/lib/crm/browser-api";

export type StaffPortalMagicLinkPayload = {
  raw_token: string;
  expires_at: string;
};

export async function mintStaffPortalMagicLink(customerId: string) {
  return crmApiFetch<StaffPortalMagicLinkPayload>(
    `/api/portal/staff/customers/${encodeURIComponent(customerId)}/magic-links`,
    { method: "POST", body: "{}" },
  );
}
