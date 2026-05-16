import { getTranslations } from "next-intl/server";

import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerSession } from "@/lib/auth/server-session";
import type { SessionRole } from "@/lib/auth/server-session";

import type { BillingSummaryPayload } from "./billing-panel";
import type { OrganizationSettings } from "./organization-profile-panel";
import { SettingsWorkspace } from "./settings-workspace";

type StaffProfile = {
  id: string;
  auth_user_id: string;
  full_name: string;
  phone: string | null;
  role: SessionRole;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    email: string;
    is_active: boolean;
  } | null;
};

const defaultOrganizationSettings: OrganizationSettings = {
  businessName: null,
  displayInitials: null,
  companyDescription: null,
  address: null,
  city: null,
  zip: null,
  website: null,
  companyEmail: null,
  phone: null,
  taxRateBps: 0,
};

export default async function SettingsPage() {
  const session = await requireServerSession("/settings");
  const t = await getTranslations("settings");
  const role = session.profile?.role ?? "technician";
  const ownerMode = role === "owner" && Boolean(session.profile?.id);
  let staffProfiles: StaffProfile[] = [];
  let staffLoadError: string | null = null;
  let organizationSettings = defaultOrganizationSettings;

  try {
    organizationSettings = await serverApiFetch<OrganizationSettings>("/api/settings/organization");
  } catch {
    organizationSettings = defaultOrganizationSettings;
  }

  if (ownerMode) {
    try {
      staffProfiles = await serverApiFetch<StaffProfile[]>("/api/auth/staff");
    } catch (error) {
      staffLoadError = error instanceof Error ? error.message : t("pageLoadError");
    }
  }

  let billingSummary: BillingSummaryPayload | null = null;
  let billingLoadError: string | null = null;

  if (ownerMode) {
    try {
      billingSummary = await serverApiFetch<BillingSummaryPayload>("/api/billing/summary");
    } catch (error) {
      billingLoadError = error instanceof Error ? error.message : t("billing.loadError");
    }
  }

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
      <SettingsWorkspace
        role={role}
        ownerMode={ownerMode}
        currentProfileId={session.profile?.id ?? null}
        staffProfiles={staffProfiles}
        staffLoadError={staffLoadError}
        organizationSettings={organizationSettings}
        billingSummary={billingSummary}
        billingLoadError={billingLoadError}
      />
    </main>
  );
}
