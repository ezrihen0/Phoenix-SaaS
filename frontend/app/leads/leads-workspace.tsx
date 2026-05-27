"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ClipboardCheck, Edit3, LoaderCircle, Plus, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { MasterTable, MasterTableRow } from "@/components/master-table";
import { crmApiFetch } from "@/lib/crm/browser-api";
import { formatDate } from "@/lib/crm/display";
import {
  getLeadSourceLabel,
  getServiceTypeLabel,
  type LeadSource,
  type LeadStatus,
} from "@/lib/crm/statuses";

import { LeadTriagePanel } from "./lead-triage-panel";
import { isStaleLead, leadMatchesSearch } from "./lead-card";
import { LeadsCommandHeader } from "./leads-command-header";
import { LeadsKpiStrip } from "./leads-kpi-strip";
import { LeadsPipelineBoard } from "./leads-pipeline-board";

export const SHOW_LEGACY_LEADS = false;

const leadActionIconButtonClass = "theme-control-surface inline-flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)]";

export type LeadQueueItem = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  service_address_line_1: string;
  service_address_line_2: string | null;
  service_city: string;
  service_state_or_region: string | null;
  service_postal_code: string;
  source: LeadSource;
  service_type: "inspection" | "cleaning" | "repair" | "rebuild";
  description: string | null;
  status: LeadStatus;
  converted_job_id: string | null;
  created_by_auth_user_id: string | null;
  created_at: string;
  updated_at: string;
  created_by_profile?: {
    id: string;
    full_name: string;
    role: "owner" | "admin" | "office_admin" | "dispatcher" | "csr" | "technician" | "viewer";
  } | null;
};

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
  recentCallId: string;
};

type LeadDisplayMode = "ledger" | "hybrid" | "grid";

type LeadDisplayPagination = {
  items: LeadQueueItem[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  startItem: number;
  endItem: number;
};

const editableStatusOptions: LeadStatus[] = ["new_lead", "contacted"];
const sourceOptions: LeadSource[] = ["phone", "website", "google", "referral", "repeat_customer", "other"];
const serviceTypeOptions: LeadQueueItem["service_type"][] = ["inspection", "cleaning", "repair", "rebuild"];
const leadPageSizeByMode: Record<LeadDisplayMode, number> = {
  ledger: 10,
  hybrid: 10,
  grid: 8,
};

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
  recentCallId: "",
};

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`theme-input-control w-full rounded-[18px] px-4 py-3 text-sm outline-none transition placeholder:text-[color:var(--text-muted)] ${props.className ?? ""}`.trim()}
    />
  );
}

function FieldSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`theme-input-control w-full rounded-[18px] px-4 py-3 text-sm outline-none transition ${props.className ?? ""}`.trim()}
    />
  );
}

function FieldTextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`theme-input-control min-h-[120px] w-full rounded-[18px] px-4 py-3 text-sm outline-none transition placeholder:text-[color:var(--text-muted)] ${props.className ?? ""}`.trim()}
    />
  );
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

function statusTone(status: LeadStatus) {
  switch (status) {
    case "contacted":
      return "theme-status-info";
    case "converted":
      return "theme-status-success";
    default:
      return "theme-status-warning";
  }
}

function getLeadStatusLabel(status: LeadStatus, t: ReturnType<typeof useTranslations<"leads">>) {
  if (status === "new_lead") {
    return t("newLead");
  }

  if (status === "contacted") {
    return t("contacted");
  }

  return t("converted");
}

type LeadsWorkspaceProps = {
  initialLeads: LeadQueueItem[];
  initialFocusLeadId?: string | null;
  initialIntakePrefill?: Partial<LeadIntakeFormState> | null;
};

export default function LeadsWorkspace({
  initialLeads,
  initialFocusLeadId = null,
  initialIntakePrefill = null,
}: LeadsWorkspaceProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("leads");
  const actionT = useTranslations("common.actions");
  const paginationT = useTranslations("common.pagination");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeFocusLeadId = searchParams.get("leadId") ?? initialFocusLeadId;
  const initialFocusedLead = routeFocusLeadId
    ? initialLeads.find((lead) => lead.id === routeFocusLeadId) ?? null
    : null;
  const hasInitialIntakePrefill = Boolean(initialIntakePrefill && Object.values(initialIntakePrefill).some(Boolean));
  const initialIntakeState: LeadIntakeFormState = {
    ...emptyLeadIntakeForm,
    ...(initialIntakePrefill ?? {}),
  };

  const [leads, setLeads] = useState(initialLeads);
  const [isIntakeOpen, setIsIntakeOpen] = useState(hasInitialIntakePrefill);
  const [intakeForm, setIntakeForm] = useState<LeadIntakeFormState>(initialIntakeState);
  const [displayMode, setDisplayMode] = useState<LeadDisplayMode>("ledger");
  const [displayPageByMode, setDisplayPageByMode] = useState<Record<LeadDisplayMode, number>>({
    ledger: 1,
    hybrid: 1,
    grid: 1,
  });
  const [editingLeadId, setEditingLeadId] = useState<string | null>(initialFocusedLead?.id ?? null);
  const [editForm, setEditForm] = useState<LeadEditFormState | null>(
    initialFocusedLead ? buildEditForm(initialFocusedLead) : null,
  );
  const [statusDrafts, setStatusDrafts] = useState<Record<string, LeadStatus>>(
    Object.fromEntries(initialLeads.map((lead) => [lead.id, lead.status])),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(initialFocusedLead?.id ?? null);

  const editingLead = editingLeadId ? leads.find((lead) => lead.id === editingLeadId) ?? null : null;
  const selectedLead = selectedLeadId ? leads.find((lead) => lead.id === selectedLeadId) ?? null : null;
  const serializedSearchParams = searchParams.toString();

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (statusFilter !== "all" && lead.status !== statusFilter) {
        return false;
      }

      if (sourceFilter !== "all" && lead.source !== sourceFilter) {
        return false;
      }

      return leadMatchesSearch(lead, searchQuery);
    });
  }, [leads, searchQuery, sourceFilter, statusFilter]);

  const commandCounts = useMemo(() => ({
    total: filteredLeads.length,
    newLead: filteredLeads.filter((lead) => lead.status === "new_lead").length,
    contacted: filteredLeads.filter((lead) => lead.status === "contacted").length,
    converted: filteredLeads.filter((lead) => lead.status === "converted").length,
    stale: filteredLeads.filter(isStaleLead).length,
  }), [filteredLeads]);

  const currentRouteParams = useMemo(() => new URLSearchParams(serializedSearchParams), [serializedSearchParams]);
  const desktopLeadColumns = useMemo(() => [
    { key: "actions", label: t("actions") },
    { key: "name", label: t("name") },
    { key: "status", label: t("leadStatus") },
    { key: "source", label: t("source") },
    { key: "service-type", label: t("serviceType") },
    { key: "contact", label: t("contact") },
    { key: "created-at", label: t("createdDate") },
    { key: "assigned-user", label: t("assigned") },
  ], [t]);
  const paginatedLeadsByMode = useMemo<Record<LeadDisplayMode, LeadDisplayPagination>>(() => {
    return (["ledger", "hybrid", "grid"] as LeadDisplayMode[]).reduce((accumulator, mode) => {
      const totalCount = leads.length;
      const pageSize = leadPageSizeByMode[mode];
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      const currentPage = Math.min(displayPageByMode[mode], totalPages);
      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, totalCount);

      accumulator[mode] = {
        items: leads.slice(startIndex, endIndex),
        currentPage,
        totalPages,
        totalCount,
        startItem: totalCount === 0 ? 0 : startIndex + 1,
        endItem: endIndex,
      };

      return accumulator;
    }, {} as Record<LeadDisplayMode, LeadDisplayPagination>);
  }, [displayPageByMode, leads]);

  function buildLeadRoute(leadId: string | null) {
    const params = new URLSearchParams(currentRouteParams.toString());

    if (leadId) {
      params.set("leadId", leadId);
    } else {
      params.delete("leadId");
    }

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function openLeadRoute(lead: LeadQueueItem) {
    router.push(buildLeadRoute(lead.id));
    openEditModal(lead);
  }

  function closeLeadRoute() {
    router.replace(buildLeadRoute(null));
    setEditingLeadId(null);
    setEditForm(null);
  }

  function updateLeadInState(updatedLead: LeadQueueItem) {
    setLeads((currentLeads) => currentLeads.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead)));
    setStatusDrafts((currentDrafts) => ({
      ...currentDrafts,
      [updatedLead.id]: updatedLead.status,
    }));
  }

  function openEditModal(lead: LeadQueueItem) {
    setEditingLeadId(lead.id);
    setEditForm(buildEditForm(lead));
    setErrorMessage(null);
    setStatusMessage(null);
  }

  useEffect(() => {
    if (!routeFocusLeadId) {
      return;
    }

    const focusedLead = leads.find((lead) => lead.id === routeFocusLeadId);

    if (focusedLead) {
      setSelectedLeadId(focusedLead.id);
      openEditModal(focusedLead);
    }
  }, [leads, routeFocusLeadId]);

  useEffect(() => {
    if (selectedLeadId && filteredLeads.some((lead) => lead.id === selectedLeadId)) {
      return;
    }

    setSelectedLeadId(filteredLeads[0]?.id ?? null);
  }, [filteredLeads, selectedLeadId]);

  function markLeadContacted(lead: LeadQueueItem) {
    startTransition(() => {
      void (async () => {
        try {
          const updatedLead = await crmApiFetch<LeadQueueItem>(`/api/leads/${lead.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "contacted" }),
          });
          updateLeadInState(updatedLead);
          setStatusMessage(t("updated", { name: updatedLead.full_name }));
          setErrorMessage(null);
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : t("updatedError"));
          setStatusMessage(null);
        }
      })();
    });
  }

  function createJobFromLead(lead: LeadQueueItem) {
    router.push(`/jobs/new?leadId=${encodeURIComponent(lead.id)}`);
  }

  function renderLeadModals() {
    return (
      <>
        {editingLead && editForm ? (
          <div
            className="theme-backdrop-scrim fixed inset-0 z-[80] flex items-center justify-center p-4"
            onClick={() => {
              if (!isPending) {
                closeLeadRoute();
              }
            }}
          >
            <div
              className="theme-surface-modal w-full max-w-2xl rounded-[28px] border p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-accent)]">{t("leadDetails")}</p>
                  <h2 className="mt-3 text-2xl font-semibold text-[color:var(--text-primary)]">{editingLead.full_name}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => closeLeadRoute()}
                  className="theme-control-surface rounded-[14px] px-4 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)]"
                >
                  {actionT("close")}
                </button>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <span>{t("name")}</span>
                  <FieldInput
                    value={editForm.fullName}
                    onChange={(event) => setEditForm((current) => current ? { ...current, fullName: event.target.value } : current)}
                  />
                </label>
                <label className="block space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <span>{t("contact")}</span>
                  <FieldInput
                    value={editForm.phone}
                    onChange={(event) => setEditForm((current) => current ? { ...current, phone: event.target.value } : current)}
                  />
                </label>
                <label className="block space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <span>Email</span>
                  <FieldInput
                    type="email"
                    value={editForm.email}
                    onChange={(event) => setEditForm((current) => current ? { ...current, email: event.target.value } : current)}
                  />
                </label>
                <label className="block space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <span>{t("source")}</span>
                  <FieldSelect
                    value={editForm.source}
                    onChange={(event) => setEditForm((current) => current ? { ...current, source: event.target.value as LeadSource } : current)}
                  >
                    {sourceOptions.map((source) => (
                      <option key={source} value={source}>
                        {getLeadSourceLabel(source, locale)}
                      </option>
                    ))}
                  </FieldSelect>
                </label>
              </div>

              <label className="mt-4 block space-y-2 text-sm text-[color:var(--text-secondary)]">
                <span>{t("problemSummary")}</span>
                <FieldTextArea
                  value={editForm.description}
                  onChange={(event) => setEditForm((current) => current ? { ...current, description: event.target.value } : current)}
                />
              </label>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => closeLeadRoute()}
                  disabled={isPending}
                  className="theme-control-surface rounded-[14px] px-4 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)] disabled:opacity-45"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
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
                          setStatusMessage(t("leadSaved", { name: updatedLead.full_name }));
                          setErrorMessage(null);
                          closeLeadRoute();
                        } catch (error) {
                          setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                          setStatusMessage(null);
                        }
                      })();
                    });
                  }}
                  className="theme-btn-primary inline-flex min-w-[120px] items-center justify-center rounded-[14px] px-4 py-2 text-xs uppercase tracking-[0.2em] transition disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : t("saveChanges")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {isIntakeOpen ? (
          <div
            className="theme-backdrop-scrim fixed inset-0 z-[80] flex items-center justify-center p-4"
            onClick={() => {
              if (!isPending) {
                setIsIntakeOpen(false);
              }
            }}
          >
            <div
              className="theme-surface-modal w-full max-w-3xl rounded-[28px] border p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-accent)]">{t("leadIntake")}</p>
                  <h2 className="mt-3 text-2xl font-semibold text-[color:var(--text-primary)]">{t("captureNewLead")}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsIntakeOpen(false)}
                  disabled={isPending}
                  className="theme-control-surface rounded-[14px] px-4 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)] disabled:opacity-45"
                >
                  {actionT("close")}
                </button>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <span>{t("customerName")}</span>
                  <FieldInput
                    value={intakeForm.fullName}
                    onChange={(event) => setIntakeForm((current) => ({ ...current, fullName: event.target.value }))}
                    placeholder="Margaret Rhodes"
                  />
                </label>
                <label className="block space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <span>Phone</span>
                  <FieldInput
                    value={intakeForm.phone}
                    onChange={(event) => setIntakeForm((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="(602) 555-0187"
                  />
                </label>
                <label className="block space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <span>Email</span>
                  <FieldInput
                    type="email"
                    value={intakeForm.email}
                    onChange={(event) => setIntakeForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder={t("optionalEmailPlaceholder")}
                  />
                </label>
                <label className="block space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <span>{t("streetAddress")}</span>
                  <FieldInput
                    value={intakeForm.serviceAddressLine1}
                    onChange={(event) => setIntakeForm((current) => ({ ...current, serviceAddressLine1: event.target.value }))}
                    placeholder="1458 East Verde Lane"
                  />
                </label>
                <label className="block space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <span>{t("suiteUnit")}</span>
                  <FieldInput
                    value={intakeForm.serviceAddressLine2}
                    onChange={(event) => setIntakeForm((current) => ({ ...current, serviceAddressLine2: event.target.value }))}
                    placeholder={t("suiteOptionalPlaceholder")}
                  />
                </label>
                <label className="block space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <span>{t("city")}</span>
                  <FieldInput
                    value={intakeForm.serviceCity}
                    onChange={(event) => setIntakeForm((current) => ({ ...current, serviceCity: event.target.value }))}
                    placeholder="Calgary"
                  />
                </label>
                <label className="block space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <span>{t("stateRegion")}</span>
                  <FieldInput
                    value={intakeForm.serviceStateOrRegion}
                    onChange={(event) => setIntakeForm((current) => ({ ...current, serviceStateOrRegion: event.target.value }))}
                    placeholder="AZ"
                  />
                </label>
                <label className="block space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <span>{t("postalCode")}</span>
                  <FieldInput
                    value={intakeForm.servicePostalCode}
                    onChange={(event) => setIntakeForm((current) => ({ ...current, servicePostalCode: event.target.value }))}
                    placeholder="85016"
                  />
                </label>
                <label className="block space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <span>{t("leadSource")}</span>
                  <FieldSelect
                    value={intakeForm.source}
                    onChange={(event) => setIntakeForm((current) => ({ ...current, source: event.target.value as LeadSource }))}
                  >
                    {sourceOptions.map((source) => (
                      <option key={source} value={source}>
                        {getLeadSourceLabel(source, locale)}
                      </option>
                    ))}
                  </FieldSelect>
                </label>
                <label className="block space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <span>{t("requestedService")}</span>
                  <FieldSelect
                    value={intakeForm.serviceType}
                    onChange={(event) => setIntakeForm((current) => ({ ...current, serviceType: event.target.value as LeadQueueItem["service_type"] }))}
                  >
                    {serviceTypeOptions.map((serviceType) => (
                      <option key={serviceType} value={serviceType}>
                        {getServiceTypeLabel(serviceType, locale)}
                      </option>
                    ))}
                  </FieldSelect>
                </label>
              </div>

              <label className="mt-4 block space-y-2 text-sm text-[color:var(--text-secondary)]">
                <span>{t("problemSummary")}</span>
                <FieldTextArea
                  value={intakeForm.description}
                  onChange={(event) => setIntakeForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder={t("problemPlaceholder")}
                />
              </label>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsIntakeOpen(false)}
                  disabled={isPending}
                  className="theme-control-surface rounded-[14px] px-4 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)] disabled:opacity-45"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(() => {
                      void (async () => {
                        const fullName = intakeForm.fullName.trim();
                        const phone = intakeForm.phone.trim();
                        const email = intakeForm.email.trim();
                        const serviceAddressLine1 = intakeForm.serviceAddressLine1.trim();
                        const serviceAddressLine2 = intakeForm.serviceAddressLine2.trim();
                        const serviceCity = intakeForm.serviceCity.trim();
                        const serviceStateOrRegion = intakeForm.serviceStateOrRegion.trim();
                        const servicePostalCode = intakeForm.servicePostalCode.trim();
                        const description = intakeForm.description.trim();
                        const serviceType = intakeForm.serviceType;

                        if (
                          !fullName
                          || !phone
                          || !serviceAddressLine1
                          || !serviceCity
                          || !servicePostalCode
                          || !serviceType
                        ) {
                          setErrorMessage("Please fill customer name, phone, service address, city, postal code, and service type before creating the lead.");
                          setStatusMessage(null);
                          return;
                        }

                        try {
                          const createdLead = await crmApiFetch<LeadQueueItem>("/api/leads", {
                            method: "POST",
                            body: JSON.stringify({
                              fullName,
                              phone,
                              email: email || null,
                              serviceAddressLine1,
                              serviceAddressLine2: serviceAddressLine2 || null,
                              serviceCity,
                              serviceStateOrRegion: serviceStateOrRegion || null,
                              servicePostalCode,
                              source: intakeForm.source,
                              serviceType,
                              description: description || null,
                            }),
                          });

                          setLeads((currentLeads) => [createdLead, ...currentLeads]);
                          setStatusDrafts((currentDrafts) => ({ ...currentDrafts, [createdLead.id]: createdLead.status }));
                          setSelectedLeadId(createdLead.id);
                          setStatusMessage(t("leadCaptured"));
                          setErrorMessage(null);
                          setIsIntakeOpen(false);
                          setIntakeForm(emptyLeadIntakeForm);
                        } catch (error) {
                          setErrorMessage(error instanceof Error ? error.message : t("createError"));
                          setStatusMessage(null);
                        }
                      })();
                    });
                  }}
                  className="theme-btn-primary inline-flex min-w-[140px] items-center justify-center gap-2 rounded-[14px] px-4 py-2 text-xs uppercase tracking-[0.2em] transition disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                  {t("saveLead")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  function renderLeadActions(
    lead: LeadQueueItem,
    draftStatus: LeadStatus,
    canEditStatus: boolean,
    layout: "stacked" | "inline" = "stacked",
  ) {
    const isInline = layout === "inline";

    return (
      <div className={isInline ? "flex items-center justify-center gap-2" : "flex flex-col gap-3"}>
        <button
          type="button"
          onClick={() => openLeadRoute(lead)}
          title={t("openDetails", { name: lead.full_name })}
          aria-label={t("openDetails", { name: lead.full_name })}
          className={leadActionIconButtonClass}
        >
          <Edit3 className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <FieldSelect
            value={draftStatus}
            disabled={!canEditStatus || isPending}
            onChange={(event) => {
              const nextStatus = event.target.value as LeadStatus;
              setStatusDrafts((currentDrafts) => ({
                ...currentDrafts,
                [lead.id]: nextStatus,
              }));
            }}
          >
            {canEditStatus ? editableStatusOptions.map((status) => (
              <option key={status} value={status}>
                {status === "new_lead" ? t("newLead") : t("contacted")}
              </option>
            )) : (
              <option value="converted">{t("converted")}</option>
            )}
          </FieldSelect>
          <button
            type="button"
            disabled={!canEditStatus || draftStatus === lead.status || isPending}
            onClick={() => {
              startTransition(() => {
                void (async () => {
                  try {
                    const updatedLead = await crmApiFetch<LeadQueueItem>(`/api/leads/${lead.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        status: draftStatus,
                      }),
                    });
                    updateLeadInState(updatedLead);
                    setStatusMessage(t("updated", { name: updatedLead.full_name }));
                    setErrorMessage(null);
                  } catch (error) {
                    setErrorMessage(error instanceof Error ? error.message : t("updatedError"));
                    setStatusMessage(null);
                  }
                })();
              });
            }}
            title={t("saveStatus")}
            aria-label={t("saveStatus")}
            className="theme-control-surface inline-flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
          </button>
        </div>
        {!lead.converted_job_id && lead.status !== "converted" ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              router.push(`/jobs/new?leadId=${encodeURIComponent(lead.id)}`);
            }}
            className="theme-btn-secondary inline-flex items-center justify-center rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em] transition"
          >
            Create Job
          </button>
        ) : null}
      </div>
    );
  }

  function updateDisplayPage(mode: LeadDisplayMode, nextPage: number) {
    setDisplayPageByMode((currentPages) => ({
      ...currentPages,
      [mode]: Math.max(1, nextPage),
    }));
  }

  function renderDisplayPagination(mode: LeadDisplayMode) {
    const pagination = paginatedLeadsByMode[mode];

    if (pagination.totalCount === 0) {
      return null;
    }

    return (
      <div className="theme-control-surface mt-4 flex flex-col gap-3 rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[color:var(--text-secondary)]">
          {t("showingResults", {
            start: pagination.startItem,
            end: pagination.endItem,
            totalCount: pagination.totalCount,
          })}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pagination.currentPage <= 1}
            onClick={() => updateDisplayPage(mode, pagination.currentPage - 1)}
            className="theme-btn-secondary inline-flex min-w-[88px] items-center justify-center rounded-[14px] px-4 py-2 text-xs uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-45"
          >
            {actionT("prev")}
          </button>
          <span className="text-sm text-[color:var(--text-secondary)]">
            {paginationT("pageOf", { page: pagination.currentPage, totalPages: pagination.totalPages })}
          </span>
          <button
            type="button"
            disabled={pagination.currentPage >= pagination.totalPages}
            onClick={() => updateDisplayPage(mode, pagination.currentPage + 1)}
            className="theme-btn-secondary inline-flex min-w-[88px] items-center justify-center rounded-[14px] px-4 py-2 text-xs uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-45"
          >
            {actionT("next")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {!SHOW_LEGACY_LEADS ? (
        <>
        <div className="space-y-8">
            <LeadsCommandHeader inViewCount={commandCounts.total} staleCount={commandCounts.stale} />

            {errorMessage ? (
              <div className="theme-alert-error rounded-[20px] border px-4 py-3 text-sm">{errorMessage}</div>
            ) : null}

            {statusMessage ? (
              <div className="theme-alert-success rounded-[20px] border px-4 py-3 text-sm">{statusMessage}</div>
            ) : null}

            <LeadsKpiStrip
              newLeadCount={commandCounts.newLead}
              contactedCount={commandCounts.contacted}
              convertedCount={commandCounts.converted}
              onAddLead={() => {
                setErrorMessage(null);
                setStatusMessage(null);
                setIsIntakeOpen(true);
              }}
            />

            <section className="flex flex-col items-stretch justify-between gap-4 lg:flex-row lg:items-center">
              <div className="theme-control-surface flex w-full items-center gap-2 rounded-xl border px-3 py-2 lg:max-w-[420px]">
                <Search className="h-4 w-4 text-[color:var(--text-muted)]" />
                <input
                  type="text"
                  placeholder={t("commandCenter.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="theme-input-control w-full border-0 bg-transparent px-0 py-0 font-mono text-xs shadow-none focus:shadow-none"
                />
              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
                <FieldSelect
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as LeadStatus | "all")}
                  className="min-w-[160px] font-mono text-xs"
                >
                  <option value="all">{t("commandCenter.filterAllStatuses")}</option>
                  <option value="new_lead">{t("newLead")}</option>
                  <option value="contacted">{t("contacted")}</option>
                  <option value="converted">{t("converted")}</option>
                </FieldSelect>
                <FieldSelect
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value as LeadSource | "all")}
                  className="min-w-[160px] font-mono text-xs"
                >
                  <option value="all">{t("commandCenter.filterAllSources")}</option>
                  {sourceOptions.map((source) => (
                    <option key={source} value={source}>
                      {getLeadSourceLabel(source, locale)}
                    </option>
                  ))}
                </FieldSelect>
                <span className="theme-control-surface rounded-xl border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                  {t("commandCenter.statusLegend")}
                </span>
              </div>
            </section>

            {filteredLeads.length === 0 ? (
              <div className="theme-control-surface-soft rounded-[24px] border border-dashed px-4 py-12 text-center text-sm text-[color:var(--text-muted)]">
                {leads.length === 0 ? t("noLeadsYet") : t("noMatches")}
              </div>
            ) : (
              <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
                <LeadsPipelineBoard
                  leads={filteredLeads}
                  selectedLeadId={selectedLeadId}
                  locale={locale}
                  onSelectLead={(lead) => setSelectedLeadId(lead.id)}
                />
                <LeadTriagePanel
                  selectedLead={selectedLead}
                  locale={locale}
                  isPending={isPending}
                  onMarkContacted={markLeadContacted}
                  onCreateJob={createJobFromLead}
                  onEditLead={openEditModal}
                />
              </section>
            )}
        </div>

        {renderLeadModals()}
        </>
      ) : (
    <div className="mt-7 space-y-5">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .leads-display-ledger .master-table-header-cell,
            .leads-display-ledger .master-table-cell {
              border-right: 1px solid var(--cmp-border-subtle);
            }
            .leads-display-ledger .master-table-header-cell:last-child,
            .leads-display-ledger .master-table-cell:last-child {
              border-right: 0;
            }
          `,
        }}
      />
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">{t("display")}</p>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
            {t("displayDescription")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["ledger", "hybrid", "grid"] as LeadDisplayMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDisplayMode(mode)}
                className={`rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] transition ${
                  displayMode === mode
                    ? "theme-control-surface border-[color:var(--cmp-border-subtle)] text-[color:var(--text-primary)]"
                    : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                {mode === "ledger" ? t("ledger") : mode === "hybrid" ? t("hybrid") : t("grid")}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setStatusMessage(null);
            setIsIntakeOpen(true);
          }}
          className="theme-btn-secondary inline-flex items-center gap-2 rounded-[18px] px-5 py-3 text-sm transition"
        >
          <Plus className="h-4 w-4" />
          {t("newLeadIntake")}
        </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="theme-alert-error rounded-[20px] border px-4 py-3 text-sm">
          {errorMessage}
        </div>
      ) : null}

      {statusMessage ? (
        <div className="theme-alert-success rounded-[20px] border px-4 py-3 text-sm">
          {statusMessage}
        </div>
      ) : null}

      <div className="hidden lg:block">
        {displayMode === "ledger" ? (
          <>
            <div className="leads-display-ledger theme-control-surface overflow-hidden rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]">
              <MasterTable
                columns={desktopLeadColumns}
                state={
                  leads.length === 0
                    ? { status: "empty", message: t("noLeadsYet") }
                    : { status: "ready" }
                }
              >
                {paginatedLeadsByMode.ledger.items.map((lead) => {
                const draftStatus = statusDrafts[lead.id] ?? lead.status;
                const canEditStatus = lead.status !== "converted";

                return (
                  <MasterTableRow
                    key={lead.id}
                    interactive
                    selected={lead.id === editingLeadId}
                    className="align-top"
                    onClick={() => openLeadRoute(lead)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) {
                        return;
                      }

                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openLeadRoute(lead);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={t("openDetails", { name: lead.full_name })}
                  >
                    <td className="master-table-cell master-table-actions-cell align-middle" onClick={(event) => event.stopPropagation()}>
                      {renderLeadActions(lead, draftStatus, canEditStatus, "inline")}
                    </td>
                    <td className="master-table-cell">
                      <p className="font-medium text-[color:var(--text-primary)]">{lead.full_name}</p>
                      <p className="mt-1 text-xs text-[color:var(--text-muted)]">{lead.description ?? lead.email ?? t("noAdditionalContext")}</p>
                    </td>
                    <td className="master-table-cell">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${statusTone(lead.status)}`}>
                        {getLeadStatusLabel(lead.status, t)}
                      </span>
                    </td>
                    <td className="master-table-cell text-[color:var(--text-secondary)]">{getLeadSourceLabel(lead.source, locale)}</td>
                    <td className="master-table-cell text-[color:var(--text-secondary)]">{getServiceTypeLabel(lead.service_type, locale)}</td>
                    <td className="master-table-cell text-[color:var(--text-secondary)]">
                      <p>{lead.phone}</p>
                      <p className="mt-1 text-xs text-[color:var(--text-muted)]">{lead.email ?? t("noEmail")}</p>
                    </td>
                    <td className="master-table-cell text-[color:var(--text-secondary)]">{formatDate(lead.created_at, locale)}</td>
                    <td className="master-table-cell text-[color:var(--text-secondary)]">{lead.created_by_profile?.full_name ?? t("unassigned")}</td>
                  </MasterTableRow>
                );
                })}
              </MasterTable>
            </div>
            {renderDisplayPagination("ledger")}
          </>
        ) : null}

        {displayMode === "hybrid" ? (
          <>
            <div className="space-y-3">
              {leads.length > 0 ? paginatedLeadsByMode.hybrid.items.map((lead) => {
                const draftStatus = statusDrafts[lead.id] ?? lead.status;
                const canEditStatus = lead.status !== "converted";

                return (
                  <article
                    key={lead.id}
                    className={`theme-control-surface rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-5 py-4 shadow-[0_18px_36px_color-mix(in_srgb,var(--bg-canvas)_55%,transparent)] ${lead.id === editingLeadId ? "ring-1 ring-[color:var(--cmp-focus-ring)]" : ""}`}
                  >
                    <div
                      className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(240px,0.8fr)] xl:items-start"
                      onClick={() => openLeadRoute(lead)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) {
                          return;
                        }

                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openLeadRoute(lead);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={t("openDetails", { name: lead.full_name })}
                    >
                      <div className="space-y-3" onClick={(event) => event.stopPropagation()}>
                        {renderLeadActions(lead, draftStatus, canEditStatus)}
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-[color:var(--text-primary)]">{lead.full_name}</p>
                        <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{lead.phone}</p>
                        <p className="mt-2 text-sm text-[color:var(--text-muted)]">{lead.description ?? lead.email ?? t("noAdditionalContextProvided")}</p>
                      </div>
                      <div className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                        <div className="flex flex-wrap gap-2">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${statusTone(lead.status)}`}>
                            {getLeadStatusLabel(lead.status, t)}
                          </span>
                        </div>
                        <div className="mt-4 grid gap-2">
                          <p>{t("source")}: {getLeadSourceLabel(lead.source, locale)}</p>
                          <p>{t("serviceType")}: {getServiceTypeLabel(lead.service_type, locale)}</p>
                          <p>{t("created")}: {formatDate(lead.created_at, locale)}</p>
                          <p>{t("assigned")}: {lead.created_by_profile?.full_name ?? t("unassigned")}</p>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              }) : (
                <div className="theme-control-surface-soft rounded-[24px] border border-dashed border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
                  {t("noLeadsYet")}
                </div>
              )}
            </div>
            {renderDisplayPagination("hybrid")}
          </>
        ) : null}

        {displayMode === "grid" ? (
          <>
            <div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-4">
              {leads.length > 0 ? paginatedLeadsByMode.grid.items.map((lead) => {
                const draftStatus = statusDrafts[lead.id] ?? lead.status;
                const canEditStatus = lead.status !== "converted";

                return (
                  <article
                    key={lead.id}
                    className={`theme-control-surface flex h-full flex-col rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5 shadow-[0_18px_36px_color-mix(in_srgb,var(--bg-canvas)_55%,transparent)] ${lead.id === editingLeadId ? "ring-1 ring-[color:var(--cmp-focus-ring)]" : ""}`}
                  >
                    <div className="space-y-3" onClick={(event) => event.stopPropagation()}>
                      {renderLeadActions(lead, draftStatus, canEditStatus)}
                    </div>
                    <button
                      type="button"
                      onClick={() => openLeadRoute(lead)}
                      className="mt-5 text-left"
                    >
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${statusTone(lead.status)}`}>
                        {getLeadStatusLabel(lead.status, t)}
                      </span>
                      <p className="mt-4 text-xl font-semibold text-[color:var(--text-primary)]">{lead.full_name}</p>
                      <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{getServiceTypeLabel(lead.service_type, locale)}</p>
                    </button>
                    <div className="mt-5 grid gap-3 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                      <div className="flex items-center justify-between gap-3">
                        <span>{t("source")}</span>
                        <span className="text-[color:var(--text-primary)]">{getLeadSourceLabel(lead.source, locale)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>{t("contact")}</span>
                        <span className="text-[color:var(--text-primary)]">{lead.phone}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>{t("created")}</span>
                        <span className="text-[color:var(--text-primary)]">{formatDate(lead.created_at, locale)}</span>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-[color:var(--text-muted)]">{lead.description ?? lead.email ?? t("noAdditionalContextProvided")}</p>
                  </article>
                );
              }) : (
                <div className="theme-control-surface-soft col-span-full rounded-[24px] border border-dashed border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
                  {t("noLeadsYet")}
                </div>
              )}
            </div>
            {renderDisplayPagination("grid")}
          </>
        ) : null}
      </div>

      <div className="grid gap-4 lg:hidden">
        {leads.length > 0 ? leads.map((lead) => (
          <article key={lead.id} className="theme-control-surface-soft rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-[color:var(--text-primary)]">{lead.full_name}</p>
                <p className="mt-1 text-sm text-[color:var(--text-secondary)]">{lead.phone}</p>
              </div>
              <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${statusTone(lead.status)}`}>
                {getLeadStatusLabel(lead.status, t)}
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-[color:var(--text-secondary)]">
              <p>{t("source")}: {getLeadSourceLabel(lead.source, locale)}</p>
              <p>{t("created")}: {formatDate(lead.created_at, locale)}</p>
              <p>{t("assigned")}: {lead.created_by_profile?.full_name ?? t("unassigned")}</p>
            </div>
            <button
              type="button"
              onClick={() => openLeadRoute(lead)}
              title={t("openDetails", { name: lead.full_name })}
              aria-label={t("openDetails", { name: lead.full_name })}
              className={`${leadActionIconButtonClass} mt-4`}
            >
              <Edit3 className="h-4 w-4" />
            </button>
          </article>
        )) : (
          <div className="theme-control-surface-soft rounded-[24px] border border-dashed border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
            {t("noLeadsYet")}
          </div>
        )}
      </div>

      {renderLeadModals()}
    </div>
      )}
    </>
  );
}
