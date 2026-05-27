"use client";

import { ArrowRight, CheckCircle2, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";

import { getLeadSourceLabel, getServiceTypeLabel } from "@/lib/crm/statuses";

import { formatLeadAge, formatLeadLocation } from "./lead-card";
import type { LeadQueueItem } from "./leads-workspace";

type LeadTriagePanelProps = {
  selectedLead: LeadQueueItem | null;
  locale: string;
  isPending: boolean;
  onMarkContacted: (lead: LeadQueueItem) => void;
  onCreateJob: (lead: LeadQueueItem) => void;
  onEditLead: (lead: LeadQueueItem) => void;
};

export function LeadTriagePanel({
  selectedLead,
  locale,
  isPending,
  onMarkContacted,
  onCreateJob,
  onEditLead,
}: LeadTriagePanelProps) {
  const t = useTranslations("leads");

  return (
    <aside className="theme-surface-card h-fit rounded-2xl border p-5 xl:sticky xl:top-6">
      <div className="flex items-start justify-between gap-3 border-b border-[color:var(--cmp-border-subtle)] pb-4">
        <div>
          <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
            {t("commandCenter.triagePanel")}
          </span>
          <h2 className="mt-1 text-lg font-bold text-[color:var(--text-primary)]">
            {selectedLead?.full_name || t("commandCenter.selectLead")}
          </h2>
          {selectedLead ? <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{selectedLead.phone}</p> : null}
        </div>
        <Wrench className="h-5 w-5 text-cyan-600" />
      </div>

      {selectedLead ? (
        <div className="mt-5 space-y-4">
          <div className="theme-control-surface-soft rounded-xl border p-4">
            <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              {t("commandCenter.leadContext")}
            </span>
            <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
              {selectedLead.description || t("noAdditionalContextProvided")}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-[10px] text-[color:var(--text-muted)]">
              <InfoTile label={t("source")} value={getLeadSourceLabel(selectedLead.source, locale)} />
              <InfoTile label={t("serviceType")} value={getServiceTypeLabel(selectedLead.service_type, locale)} />
              <InfoTile label={t("commandCenter.location")} value={formatLeadLocation(selectedLead)} />
              <InfoTile label={t("commandCenter.updated")} value={formatLeadAge(selectedLead.updated_at, t)} />
            </div>
            {selectedLead.email ? (
              <p className="mt-3 text-xs text-[color:var(--text-muted)]">
                {t("contact")}: <span className="text-[color:var(--text-secondary)]">{selectedLead.email}</span>
              </p>
            ) : null}
          </div>

          <div className="theme-control-surface-soft rounded-xl border p-4">
            <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              {t("commandCenter.realActions")}
            </span>
            <div className="mt-3 grid gap-2">
              {selectedLead.status === "new_lead" ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onMarkContacted(selectedLead)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/10 px-4 text-xs font-bold text-fuchsia-800 transition hover:bg-fuchsia-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("commandCenter.markContacted")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {selectedLead.status !== "converted" ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onCreateJob(selectedLead)}
                  className="theme-btn-primary inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold"
                >
                  {t("commandCenter.createJob")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <div className="theme-status-success flex items-center gap-2 rounded-xl border px-3 py-3 text-xs">
                  <CheckCircle2 className="h-4 w-4" />
                  {t("commandCenter.convertedJob", { jobId: selectedLead.converted_job_id ?? "—" })}
                </div>
              )}
              <button
                type="button"
                disabled={isPending}
                onClick={() => onEditLead(selectedLead)}
                className="theme-btn-secondary inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold"
              >
                {t("commandCenter.editLeadDetails")}
              </button>
            </div>
          </div>

          <p className="theme-status-warning rounded-xl border p-3 text-xs leading-5">
            {t("commandCenter.honestyNote")}
          </p>
        </div>
      ) : (
        <p className="mt-5 text-sm text-[color:var(--text-secondary)]">{t("commandCenter.selectLeadHint")}</p>
      )}
    </aside>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="theme-control-surface rounded-lg border p-2">
      {label}
      <br />
      <span className="text-[color:var(--text-secondary)]">{value}</span>
    </div>
  );
}
