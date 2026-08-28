import { requireLeadsRoute } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { getTranslations } from "next-intl/server";

import LeadsWorkspace from "./leads-workspace";
import type { LeadQueueItem } from "@/lib/crm/leads-inbox-utils";

type SearchParam = string | string[] | undefined;

type LeadsPageContext = {
  searchParams: Promise<{
    q?: SearchParam;
    leadId?: SearchParam;
    prefillFullName?: SearchParam;
    prefillPhone?: SearchParam;
    prefillDescription?: SearchParam;
    prefillSource?: SearchParam;
    recentCallId?: SearchParam;
  }>;
};

function firstValue(value: SearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

function includesQuery(query: string, lead: LeadQueueItem) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [
    lead.full_name,
    lead.phone,
    lead.email,
    lead.service_address_line_1,
    lead.service_city,
    lead.source,
    lead.service_type,
    lead.description,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

export default async function LeadsPage({ searchParams }: LeadsPageContext) {
  const t = await getTranslations("leads");
  const session = await requireLeadsRoute("/leads");
  const permissions = session.permissions ?? [];

  const resolvedSearchParams = await searchParams;
  const query = (firstValue(resolvedSearchParams.q) ?? "").trim();
  const leadId = (firstValue(resolvedSearchParams.leadId) ?? "").trim() || null;
  const prefillFullName = (firstValue(resolvedSearchParams.prefillFullName) ?? "").trim();
  const prefillPhone = (firstValue(resolvedSearchParams.prefillPhone) ?? "").trim();
  const prefillDescription = (firstValue(resolvedSearchParams.prefillDescription) ?? "").trim();
  const prefillSource = (firstValue(resolvedSearchParams.prefillSource) ?? "").trim();
  const recentCallId = (firstValue(resolvedSearchParams.recentCallId) ?? "").trim();

  let leads: LeadQueueItem[] = [];
  let loadError: string | null = null;

  try {
    const data = await serverApiFetch<LeadQueueItem[]>("/api/leads");
    leads = query ? data.filter((lead) => includesQuery(query, lead)) : data;
  } catch (error) {
    loadError = error instanceof Error ? error.message : t("loadError");
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[color:var(--cmp-surface-canvas)] px-4 py-8 text-[color:var(--text-primary)] sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto max-w-[920px]">
        {loadError ? (
          <div className="theme-alert-error rounded-[20px] border px-4 py-3 text-sm">{loadError}</div>
        ) : (
          <LeadsWorkspace
            initialLeads={leads}
            initialFocusLeadId={leadId}
            canManageLeads={permissions.includes("leads.manage")}
            canCreateJob={permissions.includes("jobs.create")}
            initialIntakePrefill={
              prefillFullName || prefillPhone || prefillDescription || prefillSource
                ? {
                  fullName: prefillFullName,
                  phone: prefillPhone,
                  description: prefillDescription,
                  recentCallId,
                  source: prefillSource === "website"
                    || prefillSource === "google"
                    || prefillSource === "facebook"
                    || prefillSource === "referral"
                    || prefillSource === "repeat_customer"
                    || prefillSource === "other"
                    ? prefillSource
                    : "phone",
                }
                : null
            }
          />
        )}
      </div>
    </main>
  );
}
