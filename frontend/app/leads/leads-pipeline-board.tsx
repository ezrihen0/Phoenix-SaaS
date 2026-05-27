"use client";

import { Layers } from "lucide-react";
import { useTranslations } from "next-intl";

import { LeadCard } from "./lead-card";
import type { LeadQueueItem } from "./leads-workspace";

const PIPELINE_COLUMNS = [
  {
    id: "new_lead" as const,
    titleKey: "commandCenter.newIntake",
    subtitleKey: "commandCenter.newIntakeSubtitle",
    color: "border-t-[color:var(--sem-accent-primary)]",
    glow: "from-[color:color-mix(in_srgb,var(--sem-accent-primary)_10%,transparent)]",
  },
  {
    id: "contacted" as const,
    titleKey: "commandCenter.contactedColumn",
    subtitleKey: "commandCenter.contactedSubtitle",
    color: "border-t-[color:var(--cmp-border-accent)]",
    glow: "from-[color:color-mix(in_srgb,var(--cmp-border-accent)_18%,transparent)]",
  },
  {
    id: "converted" as const,
    titleKey: "commandCenter.convertedColumn",
    subtitleKey: "commandCenter.convertedSubtitle",
    color: "border-t-emerald-500",
    glow: "from-[color:color-mix(in_srgb,#10b981_10%,transparent)]",
  },
];

type LeadsPipelineBoardProps = {
  leads: LeadQueueItem[];
  selectedLeadId: string | null;
  locale: string;
  onSelectLead: (lead: LeadQueueItem) => void;
};

export function LeadsPipelineBoard({
  leads,
  selectedLeadId,
  locale,
  onSelectLead,
}: LeadsPipelineBoardProps) {
  const t = useTranslations("leads");

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {PIPELINE_COLUMNS.map((column) => {
        const columnLeads = leads.filter((lead) => lead.status === column.id);

        return (
          <div
            key={column.id}
            className={[
              "flex min-h-[420px] flex-col gap-4 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-gradient-to-b p-4 backdrop-blur-sm",
              column.glow,
              "to-[color:color-mix(in_srgb,var(--cmp-surface-canvas)_82%,transparent)]",
              "border-t-2",
              column.color,
            ].join(" ")}
          >
            <div className="px-1 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-[color:var(--text-primary)]">
                  {t(column.titleKey)}
                </span>
                <span className="theme-badge rounded-full px-2 py-0.5 text-[10px] font-medium">
                  {columnLeads.length}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-5 text-[color:var(--text-muted)]">{t(column.subtitleKey)}</p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-0.5">
              {columnLeads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  selected={selectedLeadId === lead.id}
                  locale={locale}
                  onSelect={onSelectLead}
                />
              ))}

              {columnLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--cmp-border-subtle)] py-12 text-center font-mono text-[11px] text-[color:var(--text-muted)]">
                  <Layers className="h-4 w-4 opacity-40" />
                  <span>{t("commandCenter.noLeadsInColumn")}</span>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
