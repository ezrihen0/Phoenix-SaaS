"use client";

import { Clock, Flame, PhoneCall } from "lucide-react";
import { useTranslations } from "next-intl";

import { getLeadSourceLabel, getServiceTypeLabel } from "@/lib/crm/statuses";

import type { LeadQueueItem } from "./leads-workspace";

const STALE_DAYS = 3;

export function isStaleLead(lead: LeadQueueItem) {
  if (lead.status === "converted") {
    return false;
  }

  const updatedAt = new Date(lead.updated_at).getTime();
  const days = (Date.now() - updatedAt) / (1000 * 60 * 60 * 24);

  return days >= STALE_DAYS;
}

export function formatLeadAge(value: string, t: ReturnType<typeof useTranslations<"leads">>) {
  const diffMs = Math.max(0, Date.now() - new Date(value).getTime());
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) {
    return t("commandCenter.ageRecent");
  }

  if (diffHours < 24) {
    return t("commandCenter.ageHours", { count: diffHours });
  }

  return t("commandCenter.ageDays", { count: Math.floor(diffHours / 24) });
}

export function leadMatchesSearch(lead: LeadQueueItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [
    lead.full_name,
    lead.phone,
    lead.email,
    lead.description,
    lead.service_city,
    lead.service_state_or_region,
    lead.source,
    lead.service_type,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

export function formatLeadLocation(lead: LeadQueueItem) {
  const parts = [lead.service_city, lead.service_state_or_region].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return "—";
}

type LeadCardProps = {
  lead: LeadQueueItem;
  selected: boolean;
  locale: string;
  onSelect: (lead: LeadQueueItem) => void;
};

export function LeadCard({ lead, selected, locale, onSelect }: LeadCardProps) {
  const t = useTranslations("leads");
  const stale = isStaleLead(lead);
  const isNewLead = lead.status === "new_lead";

  return (
    <button
      type="button"
      onClick={() => onSelect(lead)}
      className={[
        "group relative w-full overflow-hidden rounded-xl border p-4 text-left transition",
        selected
          ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)]"
          : "theme-control-surface hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]",
      ].join(" ")}
    >
      <div
        className={[
          "absolute bottom-0 left-0 top-0 w-[3px]",
          stale
            ? "bg-rose-500"
            : isNewLead
              ? "bg-[color:var(--sem-accent-primary)]"
              : lead.status === "converted"
                ? "bg-emerald-500"
                : "bg-fuchsia-500",
        ].join(" ")}
      />

      <div className="flex items-start justify-between gap-2 pl-1">
        <div>
          <span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            {lead.id.slice(0, 8)}
          </span>
          <h3 className="mt-1 text-sm font-bold tracking-tight text-[color:var(--text-primary)]">{lead.full_name}</h3>
          <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{lead.phone}</p>
        </div>

        <div
          className={[
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase",
            stale
              ? "border-rose-500/20 bg-rose-500/10 text-rose-700"
              : isNewLead
                ? "border-[color:var(--cmp-border-accent)] bg-[color:color-mix(in_srgb,var(--sem-accent-primary)_12%,transparent)] text-[color:var(--sem-accent-primary)]"
                : "theme-badge",
          ].join(" ")}
        >
          {stale ? <Flame className="h-2.5 w-2.5 fill-current" /> : <Clock className="h-2.5 w-2.5" />}
          {stale ? t("commandCenter.stale") : getLeadStatusShortLabel(lead.status, t)}
        </div>
      </div>

      <div className="theme-control-surface-soft mt-4 rounded-lg border p-3 pl-4">
        <span className="block font-mono text-[9px] uppercase tracking-wider text-[color:var(--text-muted)]">
          {t("commandCenter.requestedService")}
        </span>
        <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[color:var(--text-secondary)]">
          {getServiceTypeLabel(lead.service_type, locale)} · {lead.description || t("noAdditionalContextProvided")}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[color:var(--cmp-border-subtle)] pt-3 font-mono text-[10px]">
        <div className="flex items-center gap-2 text-[color:var(--text-muted)]">
          <PhoneCall className="h-3.5 w-3.5 text-cyan-600" />
          <span>{getLeadSourceLabel(lead.source, locale)}</span>
        </div>
        <span className="text-[color:var(--text-muted)]">{formatLeadAge(lead.updated_at, t)}</span>
      </div>
    </button>
  );
}

function getLeadStatusShortLabel(
  status: LeadQueueItem["status"],
  t: ReturnType<typeof useTranslations<"leads">>,
) {
  if (status === "new_lead") {
    return t("newLead");
  }

  if (status === "contacted") {
    return t("contacted");
  }

  return t("converted");
}
