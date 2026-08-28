"use client";

import Link from "next/link";

import {
  formatLeadAddress,
  formatLeadReceivedLabel,
  getDispositionReasonLabel,
  getInboxStatusLabel,
  getLeadNeedLabel,
  getLeadSourceDisplayLabel,
  isLeadAddedToJob,
  isLeadNotBooked,
  isLeadOpen,
  type LeadQueueItem,
} from "@/lib/crm/leads-inbox-utils";

type LeadDetailsDialogProps = {
  lead: LeadQueueItem | null;
  locale: string;
  isPending: boolean;
  canManageLeads: boolean;
  canCreateJob: boolean;
  onClose: () => void;
  onMarkContacted: (lead: LeadQueueItem) => void;
  onAddToJob: (lead: LeadQueueItem) => void;
  onNotBooked: (lead: LeadQueueItem) => void;
  onEditLead?: (lead: LeadQueueItem) => void;
};

export function LeadDetailsDialog({
  lead,
  locale,
  isPending,
  canManageLeads,
  canCreateJob,
  onClose,
  onMarkContacted,
  onAddToJob,
  onNotBooked,
  onEditLead,
}: LeadDetailsDialogProps) {
  if (!lead) {
    return null;
  }

  const isConverted = isLeadAddedToJob(lead);
  const isClosed = isLeadNotBooked(lead);
  const canTakeAction = isLeadOpen(lead);

  return (
    <div
      className="theme-backdrop-scrim fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
    >
      <div
        className="theme-surface-modal max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] border p-6 sm:max-w-lg sm:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
              Lead Details
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">{lead.full_name}</h2>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-accent-primary)]">
              {getInboxStatusLabel(lead)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="theme-btn-secondary rounded-full px-3 py-1.5 text-xs"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <section>
            <p className="text-sm font-medium text-[color:var(--text-primary)]">{getLeadNeedLabel(lead, locale)}</p>
            <p className="mt-1 text-xs text-[color:var(--text-muted)]">
              {getLeadSourceDisplayLabel(lead.source, locale)} · {formatLeadReceivedLabel(lead)}
            </p>
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Contact</h3>
            <p className="mt-2 text-sm text-[color:var(--text-primary)]">{lead.phone}</p>
            {lead.email ? <p className="mt-1 text-sm text-[color:var(--text-secondary)]">{lead.email}</p> : null}
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Service Address</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[color:var(--text-secondary)]">
              {formatLeadAddress(lead)}
            </p>
          </section>

          {lead.description ? (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
                Customer Concern
              </h3>
              <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">{lead.description}</p>
            </section>
          ) : null}

          {isClosed && lead.disposition_reason ? (
            <section className="rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-muted)] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Not booked reason</p>
              <p className="mt-1 text-sm text-[color:var(--text-primary)]">
                {getDispositionReasonLabel(lead.disposition_reason)}
              </p>
              {lead.disposition_note ? (
                <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{lead.disposition_note}</p>
              ) : null}
            </section>
          ) : null}

          {isConverted && lead.converted_job_id ? (
            <section>
              <Link
                href={`/jobs/${lead.converted_job_id}`}
                className="theme-btn-secondary inline-flex rounded-full px-4 py-2 text-sm font-semibold"
              >
                View job
              </Link>
            </section>
          ) : null}
        </div>

        {canTakeAction ? (
          <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {canManageLeads ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => onNotBooked(lead)}
                className="theme-btn-secondary rounded-full px-5 py-2.5 text-sm font-semibold"
              >
                Not Booked
              </button>
            ) : null}
            {canCreateJob ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => onAddToJob(lead)}
                className="theme-btn-primary rounded-full px-5 py-2.5 text-sm font-semibold"
              >
                Add to Job
              </button>
            ) : null}
          </div>
        ) : null}

        {canTakeAction && canManageLeads && lead.status === "new_lead" ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => onMarkContacted(lead)}
              className="text-sm font-medium text-[color:var(--sem-accent-primary)] underline-offset-2 hover:underline"
            >
              Mark contacted
            </button>
            {onEditLead ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => onEditLead(lead)}
                className="text-sm text-[color:var(--text-muted)] underline-offset-2 hover:underline"
              >
                Edit lead
              </button>
            ) : null}
          </div>
        ) : null}

        {canTakeAction && canManageLeads && lead.status !== "new_lead" && onEditLead ? (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={isPending}
              onClick={() => onEditLead(lead)}
              className="text-sm text-[color:var(--text-muted)] underline-offset-2 hover:underline"
            >
              Edit lead
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
