"use client";

import { ClipboardCheck, LoaderCircle, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  buildInboxSummaryCounts,
  filterLeadsInbox,
  type InboxBucket,
  type InboxDateFilter,
  type LeadQueueItem,
} from "@/lib/crm/leads-inbox-utils";
import { getLeadSourceLabel, getServiceTypeLabel, type LeadSource } from "@/lib/crm/statuses";

import { LeadDetailsDialog } from "./lead-details-dialog";
import { LeadsCommandHeader } from "./leads-command-header";
import { LeadsInboxRow } from "./leads-inbox-row";
import { LeadsKpiStrip } from "./leads-kpi-strip";
import { NotBookedDialog } from "./not-booked-dialog";

export type { LeadQueueItem };

type LeadEditFormState = {
  fullName: string;
  phone: string;
  email: string;
  source: LeadSource;
  description: string;
};

type LeadIntakeFormState = {
  fullName: string;
  phone: string;
  email: string;
  serviceAddressLine1: string;
  serviceAddressLine2: string;
  serviceCity: string;
  serviceStateOrRegion: string;
  servicePostalCode: string;
  source: LeadSource;
  serviceType: LeadQueueItem["service_type"];
  description: string;
  recentCallId?: string;
};

type LeadsWorkspaceProps = {
  initialLeads: LeadQueueItem[];
  initialFocusLeadId?: string | null;
  initialIntakePrefill?: Partial<LeadIntakeFormState> | null;
  canManageLeads: boolean;
  canCreateJob: boolean;
};

const sourceOptions: LeadSource[] = [
  "phone",
  "website",
  "google",
  "facebook",
  "referral",
  "repeat_customer",
  "other",
];
const serviceTypeOptions: LeadQueueItem["service_type"][] = ["inspection", "cleaning", "repair", "rebuild"];

const emptyLeadIntakeForm: LeadIntakeFormState = {
  fullName: "",
  phone: "",
  email: "",
  serviceAddressLine1: "",
  serviceAddressLine2: "",
  serviceCity: "",
  serviceStateOrRegion: "",
  servicePostalCode: "",
  source: "phone",
  serviceType: "inspection",
  description: "",
};

const inputClass = "theme-input-control w-full rounded-xl px-3 py-2.5 text-sm";

function normalizeLead(row: LeadQueueItem): LeadQueueItem {
  return {
    ...row,
    disposition: row.disposition ?? null,
    disposition_reason: row.disposition_reason ?? null,
    disposition_note: row.disposition_note ?? null,
    disposition_at: row.disposition_at ?? null,
    disposition_by_auth_user_id: row.disposition_by_auth_user_id ?? null,
    customer_id: row.customer_id ?? null,
  };
}

function buildEditForm(lead: LeadQueueItem): LeadEditFormState {
  return {
    fullName: lead.full_name,
    phone: lead.phone,
    email: lead.email ?? "",
    source: lead.source,
    description: lead.description ?? "",
  };
}

export default function LeadsWorkspace({
  initialLeads,
  initialFocusLeadId = null,
  initialIntakePrefill = null,
  canManageLeads,
  canCreateJob,
}: LeadsWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("leads");
  const actionT = useTranslations("common.actions");

  const routeFocusLeadId = searchParams.get("leadId") ?? initialFocusLeadId;
  const intakeRequested = searchParams.get("intake") === "1";
  const hasInitialIntakePrefill = Boolean(initialIntakePrefill && Object.values(initialIntakePrefill).some(Boolean));

  const [leads, setLeads] = useState(() => initialLeads.map(normalizeLead));
  const [searchQuery, setSearchQuery] = useState("");
  const [bucketFilter, setBucketFilter] = useState<InboxBucket>("all");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [dateFilter, setDateFilter] = useState<InboxDateFilter>("all");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [notBookedLead, setNotBookedLead] = useState<LeadQueueItem | null>(null);
  const [isIntakeOpen, setIsIntakeOpen] = useState(hasInitialIntakePrefill || intakeRequested);
  const [intakeForm, setIntakeForm] = useState<LeadIntakeFormState>({
    ...emptyLeadIntakeForm,
    ...(initialIntakePrefill ?? {}),
  });
  const [editingLead, setEditingLead] = useState<LeadQueueItem | null>(null);
  const [editForm, setEditForm] = useState<LeadEditFormState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const summaryCounts = useMemo(() => buildInboxSummaryCounts(leads), [leads]);

  const filteredLeads = useMemo(
    () => filterLeadsInbox(leads, {
      search: searchQuery,
      bucket: bucketFilter,
      source: sourceFilter,
      dateFilter,
    }),
    [bucketFilter, dateFilter, leads, searchQuery, sourceFilter],
  );

  const selectedLead = selectedLeadId
    ? leads.find((lead) => lead.id === selectedLeadId) ?? null
    : null;

  function buildLeadRoute(leadId: string | null) {
    const params = new URLSearchParams(searchParams.toString());

    if (leadId) {
      params.set("leadId", leadId);
    } else {
      params.delete("leadId");
    }

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function openLeadDetails(lead: LeadQueueItem) {
    setSelectedLeadId(lead.id);
    setDetailsOpen(true);
    router.replace(buildLeadRoute(lead.id));
  }

  function closeLeadDetails() {
    setDetailsOpen(false);
    setSelectedLeadId(null);
    router.replace(buildLeadRoute(null));
  }

  function updateLeadInState(updatedLead: LeadQueueItem) {
    const normalized = normalizeLead(updatedLead);
    setLeads((current) => current.map((lead) => (lead.id === normalized.id ? normalized : lead)));
    setSelectedLeadId(normalized.id);
  }

  useEffect(() => {
    if (!routeFocusLeadId) {
      return;
    }

    const focusedLead = leads.find((lead) => lead.id === routeFocusLeadId);

    if (focusedLead) {
      setSelectedLeadId(focusedLead.id);
      setDetailsOpen(true);
    }
  }, [leads, routeFocusLeadId]);

  function markLeadContacted(lead: LeadQueueItem) {
    startTransition(() => {
      void (async () => {
        try {
          const updatedLead = await crmApiFetch<LeadQueueItem>(`/api/leads/${lead.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "contacted" }),
          });
          updateLeadInState(updatedLead);
          setStatusMessage(`Marked ${updatedLead.full_name} as contacted.`);
          setErrorMessage(null);
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "The lead could not be updated.");
        }
      })();
    });
  }

  function addLeadToJob(lead: LeadQueueItem) {
    router.push(`/jobs/new?leadId=${encodeURIComponent(lead.id)}`);
  }

  function openEditLead(lead: LeadQueueItem) {
    setEditingLead(lead);
    setEditForm(buildEditForm(lead));
    setDetailsOpen(false);
  }

  function renderIntakeModal() {
    if (!isIntakeOpen) {
      return null;
    }

    return (
      <div
        className="theme-backdrop-scrim fixed inset-0 z-[80] flex items-center justify-center p-4"
        onClick={() => {
          if (!isPending) {
            setIsIntakeOpen(false);
          }
        }}
      >
        <div
          className="theme-surface-modal max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border p-6"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-accent)]">{t("leadIntake")}</p>
              <h2 className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">{t("captureNewLead")}</h2>
            </div>
            <button type="button" onClick={() => setIsIntakeOpen(false)} className="theme-btn-secondary rounded-full px-3 py-1.5 text-xs">
              {actionT("close")}
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2 text-sm">
              <span>{t("customerName")}</span>
              <input className={inputClass} value={intakeForm.fullName} onChange={(e) => setIntakeForm((c) => ({ ...c, fullName: e.target.value }))} />
            </label>
            <label className="block space-y-2 text-sm">
              <span>Phone</span>
              <input className={inputClass} value={intakeForm.phone} onChange={(e) => setIntakeForm((c) => ({ ...c, phone: e.target.value }))} />
            </label>
            <label className="block space-y-2 text-sm">
              <span>Email</span>
              <input className={inputClass} type="email" value={intakeForm.email} onChange={(e) => setIntakeForm((c) => ({ ...c, email: e.target.value }))} />
            </label>
            <label className="block space-y-2 text-sm">
              <span>{t("source")}</span>
              <select className={inputClass} value={intakeForm.source} onChange={(e) => setIntakeForm((c) => ({ ...c, source: e.target.value as LeadSource }))}>
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>{getLeadSourceLabel(source, locale)}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-2 text-sm sm:col-span-2">
              <span>{t("streetAddress")}</span>
              <input className={inputClass} value={intakeForm.serviceAddressLine1} onChange={(e) => setIntakeForm((c) => ({ ...c, serviceAddressLine1: e.target.value }))} autoComplete="address-line1" />
            </label>
            <label className="block space-y-2 text-sm">
              <span>{t("suiteUnit")}</span>
              <input className={inputClass} value={intakeForm.serviceAddressLine2} onChange={(e) => setIntakeForm((c) => ({ ...c, serviceAddressLine2: e.target.value }))} autoComplete="address-line2" />
            </label>
            <label className="block space-y-2 text-sm">
              <span>{t("city")}</span>
              <input className={inputClass} value={intakeForm.serviceCity} onChange={(e) => setIntakeForm((c) => ({ ...c, serviceCity: e.target.value }))} autoComplete="address-level2" />
            </label>
            <label className="block space-y-2 text-sm">
              <span>{t("stateRegion")}</span>
              <input className={inputClass} value={intakeForm.serviceStateOrRegion} onChange={(e) => setIntakeForm((c) => ({ ...c, serviceStateOrRegion: e.target.value }))} />
            </label>
            <label className="block space-y-2 text-sm">
              <span>{t("postalCode")}</span>
              <input className={inputClass} value={intakeForm.servicePostalCode} onChange={(e) => setIntakeForm((c) => ({ ...c, servicePostalCode: e.target.value }))} autoComplete="postal-code" />
            </label>
            <label className="block space-y-2 text-sm">
              <span>{t("serviceType")}</span>
              <select className={inputClass} value={intakeForm.serviceType} onChange={(e) => setIntakeForm((c) => ({ ...c, serviceType: e.target.value as LeadQueueItem["service_type"] }))}>
                {serviceTypeOptions.map((serviceType) => (
                  <option key={serviceType} value={serviceType}>{getServiceTypeLabel(serviceType, locale)}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-4 block space-y-2 text-sm">
            <span>{t("problemSummary")}</span>
            <textarea className={`${inputClass} min-h-[96px]`} value={intakeForm.description} onChange={(e) => setIntakeForm((c) => ({ ...c, description: e.target.value }))} />
          </label>

          <div className="mt-6 flex justify-end gap-2">
            <button type="button" disabled={isPending} onClick={() => setIsIntakeOpen(false)} className="theme-btn-secondary rounded-full px-4 py-2 text-sm">
              {t("cancel")}
            </button>
            <button
              type="button"
              disabled={isPending || !canManageLeads}
              onClick={() => {
                startTransition(() => {
                  void (async () => {
                    const payload = {
                      fullName: intakeForm.fullName.trim(),
                      phone: intakeForm.phone.trim(),
                      email: intakeForm.email.trim() || null,
                      serviceAddressLine1: intakeForm.serviceAddressLine1.trim(),
                      serviceAddressLine2: intakeForm.serviceAddressLine2.trim() || null,
                      serviceCity: intakeForm.serviceCity.trim(),
                      serviceStateOrRegion: intakeForm.serviceStateOrRegion.trim() || null,
                      servicePostalCode: intakeForm.servicePostalCode.trim(),
                      source: intakeForm.source,
                      serviceType: intakeForm.serviceType,
                      description: intakeForm.description.trim() || null,
                    };

                    if (!payload.fullName || !payload.phone || !payload.serviceAddressLine1 || !payload.serviceCity || !payload.servicePostalCode) {
                      setErrorMessage("Name, phone, address, city, and postal code are required.");
                      return;
                    }

                    try {
                      const createdLead = await crmApiFetch<LeadQueueItem>("/api/leads", {
                        method: "POST",
                        body: JSON.stringify(payload),
                      });
                      const normalized = normalizeLead(createdLead);
                      setLeads((current) => [normalized, ...current]);
                      setIsIntakeOpen(false);
                      setIntakeForm(emptyLeadIntakeForm);
                      openLeadDetails(normalized);
                      setStatusMessage(t("leadCaptured"));
                      setErrorMessage(null);
                    } catch (error) {
                      setErrorMessage(error instanceof Error ? error.message : t("createError"));
                    }
                  })();
                });
              }}
              className="theme-btn-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
            >
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              {t("saveLead")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderEditModal() {
    if (!editingLead || !editForm) {
      return null;
    }

    return (
      <div className="theme-backdrop-scrim fixed inset-0 z-[85] flex items-center justify-center p-4" onClick={() => !isPending && setEditingLead(null)}>
        <div className="theme-surface-modal w-full max-w-2xl rounded-[28px] border p-6" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-xl font-semibold">Edit lead</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <input className={inputClass} value={editForm.fullName} onChange={(e) => setEditForm((c) => c ? { ...c, fullName: e.target.value } : c)} />
            <input className={inputClass} value={editForm.phone} onChange={(e) => setEditForm((c) => c ? { ...c, phone: e.target.value } : c)} />
            <input className={inputClass} type="email" value={editForm.email} onChange={(e) => setEditForm((c) => c ? { ...c, email: e.target.value } : c)} />
            <select className={inputClass} value={editForm.source} onChange={(e) => setEditForm((c) => c ? { ...c, source: e.target.value as LeadSource } : c)}>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>{getLeadSourceLabel(source, locale)}</option>
              ))}
            </select>
          </div>
          <textarea className={`${inputClass} mt-4 min-h-[96px]`} value={editForm.description} onChange={(e) => setEditForm((c) => c ? { ...c, description: e.target.value } : c)} />
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="theme-btn-secondary rounded-full px-4 py-2 text-sm" onClick={() => setEditingLead(null)}>Cancel</button>
            <button
              type="button"
              className="theme-btn-primary rounded-full px-4 py-2 text-sm"
              disabled={isPending}
              onClick={() => {
                startTransition(() => {
                  void (async () => {
                    try {
                      const updatedLead = await crmApiFetch<LeadQueueItem>(`/api/leads/${editingLead.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          fullName: editForm.fullName,
                          phone: editForm.phone,
                          email: editForm.email || null,
                          source: editForm.source,
                          description: editForm.description || null,
                        }),
                      });
                      updateLeadInState(updatedLead);
                      setEditingLead(null);
                      setDetailsOpen(true);
                    } catch (error) {
                      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                    }
                  })();
                });
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LeadsCommandHeader />

      <LeadsKpiStrip
        counts={summaryCounts}
        activeBucket={bucketFilter}
        onSelectBucket={setBucketFilter}
        onAddLead={() => setIsIntakeOpen(true)}
        canManageLeads={canManageLeads}
      />

      {errorMessage ? <div className="theme-alert-error rounded-xl px-4 py-3 text-sm">{errorMessage}</div> : null}
      {statusMessage ? <div className="theme-status-success rounded-xl px-4 py-3 text-sm">{statusMessage}</div> : null}

      <section className="grid gap-3 md:grid-cols-[1.4fr_auto_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-muted)]" />
          <input
            className={`${inputClass} pl-10`}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search name, phone, or email"
          />
        </label>
        <select className={inputClass} value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as LeadSource | "all")}>
          <option value="all">All sources</option>
          {sourceOptions.map((source) => (
            <option key={source} value={source}>{getLeadSourceLabel(source, locale)}</option>
          ))}
        </select>
        <select className={inputClass} value={dateFilter} onChange={(event) => setDateFilter(event.target.value as InboxDateFilter)}>
          <option value="all">All dates</option>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </section>

      <section className="space-y-3">
        {filteredLeads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--cmp-border-subtle)] px-6 py-12 text-center text-sm text-[color:var(--text-secondary)]">
            No leads match the current filters.
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <LeadsInboxRow
              key={lead.id}
              lead={lead}
              locale={locale}
              selected={selectedLeadId === lead.id && detailsOpen}
              onSelect={openLeadDetails}
            />
          ))
        )}
      </section>

      <LeadDetailsDialog
        lead={detailsOpen ? selectedLead : null}
        locale={locale}
        isPending={isPending}
        canManageLeads={canManageLeads}
        canCreateJob={canCreateJob}
        onClose={closeLeadDetails}
        onMarkContacted={markLeadContacted}
        onAddToJob={addLeadToJob}
        onNotBooked={setNotBookedLead}
        onEditLead={canManageLeads ? openEditLead : undefined}
      />

      <NotBookedDialog
        lead={notBookedLead}
        onClose={() => setNotBookedLead(null)}
        onSaved={(lead) => {
          updateLeadInState(lead);
          setStatusMessage(`${lead.full_name} marked not booked.`);
          setErrorMessage(null);
          closeLeadDetails();
        }}
        onError={setErrorMessage}
      />

      {renderIntakeModal()}
      {renderEditModal()}
    </div>
  );
}
