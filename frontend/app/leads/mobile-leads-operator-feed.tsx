"use client";

import Link from "next/link";
import { MessageSquare, Phone, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { getLeadSourceLabel, type LeadStatus } from "@/lib/crm/statuses";

import { formatLeadAge, formatLeadLocation, LeadCard } from "./lead-card";
import type { LeadQueueItem } from "./leads-workspace";

type MobileLeadFilter = LeadStatus | "all";

type MobileLeadsOperatorFeedProps = {
  leads: LeadQueueItem[];
  selectedLeadId: string | null;
  locale: string;
  isPending: boolean;
  onSelectLead: (lead: LeadQueueItem) => void;
  onMarkContacted: (lead: LeadQueueItem) => void;
  onCreateJob: (lead: LeadQueueItem) => void;
  onEditLead: (lead: LeadQueueItem) => void;
};

function normalizePhoneDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

function buildMessagingHref(phone: string) {
  const digits = normalizePhoneDigits(phone);

  if (!digits) {
    return null;
  }

  return `/messaging?lane=unknown&phoneKey=${encodeURIComponent(digits)}`;
}

export function MobileLeadsOperatorFeed({
  leads,
  selectedLeadId,
  locale,
  isPending,
  onSelectLead,
  onMarkContacted,
  onCreateJob,
  onEditLead,
}: MobileLeadsOperatorFeedProps) {
  const t = useTranslations("leads");
  const [statusFilter, setStatusFilter] = useState<MobileLeadFilter>("all");

  const filteredLeads = useMemo(() => {
    if (statusFilter === "all") {
      return leads;
    }

    return leads.filter((lead) => lead.status === statusFilter);
  }, [leads, statusFilter]);

  const selectedLead = filteredLeads.find((lead) => lead.id === selectedLeadId)
    ?? leads.find((lead) => lead.id === selectedLeadId)
    ?? null;
  const messagingHref = selectedLead ? buildMessagingHref(selectedLead.phone) : null;

  const filterOptions: Array<{ value: MobileLeadFilter; label: string }> = [
    { value: "all", label: t("commandCenter.filterAllStatuses") },
    { value: "new_lead", label: t("newLead") },
    { value: "contacted", label: t("contacted") },
    { value: "converted", label: t("converted") },
  ];

  return (
    <div className="lg:hidden">
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setStatusFilter(option.value)}
            className={[
              "rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] transition",
              statusFilter === option.value
                ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--text-primary)]"
                : "border-[color:var(--cmp-border-subtle)] text-[color:var(--text-secondary)]",
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className={`mt-4 space-y-3 ${selectedLead ? "pb-36" : ""}`}>
        {filteredLeads.length > 0 ? (
          filteredLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              selected={lead.id === selectedLeadId}
              locale={locale}
              onSelect={onSelectLead}
            />
          ))
        ) : (
          <div className="theme-control-surface-soft rounded-[24px] border border-dashed px-4 py-10 text-center text-sm text-[color:var(--text-muted)]">
            {leads.length === 0 ? t("noLeadsYet") : t("noMatches")}
          </div>
        )}
      </div>

      {selectedLead ? (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/95 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto max-w-lg">
            <div className="mb-3 min-w-0">
              <p className="truncate text-sm font-semibold text-[color:var(--text-primary)]">{selectedLead.full_name}</p>
              <p className="mt-0.5 truncate text-xs text-[color:var(--text-secondary)]">
                {getLeadSourceLabel(selectedLead.source, locale)} · {formatLeadLocation(selectedLead)} · {formatLeadAge(selectedLead.updated_at, t)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {selectedLead.status === "new_lead" ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onMarkContacted(selectedLead)}
                  className="theme-btn-secondary col-span-2 inline-flex h-11 items-center justify-center rounded-full px-4 text-xs font-semibold"
                >
                  {t("commandCenter.markContacted")}
                </button>
              ) : null}
              {selectedLead.status !== "converted" ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onCreateJob(selectedLead)}
                  className="theme-btn-primary inline-flex h-11 items-center justify-center rounded-full px-3 text-xs font-semibold"
                >
                  {t("commandCenter.createJob")}
                </button>
              ) : null}
              <a
                href={`tel:${selectedLead.phone}`}
                className="theme-btn-secondary inline-flex h-11 items-center justify-center gap-2 rounded-full px-3 text-xs font-semibold"
              >
                <Phone className="h-4 w-4" />
                {t("commandCenter.callLead")}
              </a>
              {messagingHref ? (
                <Link
                  href={messagingHref}
                  className="theme-btn-secondary inline-flex h-11 items-center justify-center gap-2 rounded-full px-3 text-xs font-semibold"
                >
                  <MessageSquare className="h-4 w-4" />
                  {t("commandCenter.messageLead")}
                </Link>
              ) : null}
              <button
                type="button"
                disabled={isPending}
                onClick={() => onEditLead(selectedLead)}
                className="theme-control-surface col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-full border px-3 text-xs font-semibold"
              >
                <Wrench className="h-4 w-4" />
                {t("commandCenter.editLeadDetails")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
