import { requireServerRoles } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";

import LeadsWorkspace, { type LeadQueueItem } from "./leads-workspace";

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
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

export default async function LeadsPage({ searchParams }: LeadsPageContext) {
  await requireServerRoles("/leads", ["owner", "office_admin", "dispatcher"]);

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
    loadError = error instanceof Error ? error.message : "The lead queue could not be loaded.";
  }

  return (
    <main className="min-h-screen bg-[color:var(--flat-canvas)] text-[color:var(--text-primary)]">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <section className="theme-surface-modal rounded-[32px] border border-[color:rgba(212,175,55,0.2)] bg-[linear-gradient(170deg,rgba(8,8,8,0.96),rgba(19,19,19,0.9))] p-6 shadow-[0_36px_120px_rgba(0,0,0,0.4)]">
          {loadError ? (
            <div className="theme-alert-error rounded-[20px] border px-4 py-3 text-sm">
              {loadError}
            </div>
          ) : (
            <LeadsWorkspace
              initialLeads={leads}
              initialFocusLeadId={leadId}
              initialIntakePrefill={
                prefillFullName || prefillPhone || prefillDescription || prefillSource
                  ? {
                    fullName: prefillFullName,
                    phone: prefillPhone,
                    description: prefillDescription,
                    recentCallId,
                    source: prefillSource === "website"
                      || prefillSource === "google"
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
        </section>
      </div>
    </main>
  );
}
