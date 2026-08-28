"use client";

import {
  formatLeadAgeShort,
  formatLeadCity,
  getInboxStatusLabel,
  getInboxStatusToneClass,
  getLeadNeedLabel,
  getLeadSourceDisplayLabel,
  type LeadQueueItem,
} from "@/lib/crm/leads-inbox-utils";

type LeadsInboxRowProps = {
  lead: LeadQueueItem;
  selected: boolean;
  locale: string;
  onSelect: (lead: LeadQueueItem) => void;
};

export function LeadsInboxRow({ lead, selected, locale, onSelect }: LeadsInboxRowProps) {
  const statusLabel = getInboxStatusLabel(lead);
  const statusTone = getInboxStatusToneClass(lead);

  return (
    <button
      type="button"
      onClick={() => onSelect(lead)}
      className={[
        "w-full rounded-2xl border px-4 py-4 text-left transition",
        selected
          ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-selected-surface)]"
          : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] hover:border-[color:var(--cmp-border-accent)]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${statusTone}`}>
          {statusLabel}
        </span>
        <span className="text-xs text-[color:var(--text-muted)]">{formatLeadAgeShort(lead.created_at)}</span>
      </div>

      <div className="mt-3">
        <p className="text-base font-semibold text-[color:var(--text-primary)]">{lead.full_name}</p>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">{getLeadNeedLabel(lead, locale)}</p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[color:var(--text-muted)]">
        <span>{formatLeadCity(lead)}</span>
        <span>{getLeadSourceDisplayLabel(lead.source, locale)}</span>
      </div>
    </button>
  );
}
