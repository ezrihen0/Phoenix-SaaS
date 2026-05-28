"use client";

import Link from "next/link";
import { ChevronRight, MapPin, Phone } from "lucide-react";

type MobileJobCardProps = {
  customerName: string;
  statusLabel: string;
  statusToneClass: string;
  scheduledLabel: string;
  locationLabel: string;
  serviceLabel: string;
  technicianName: string | null;
  paymentSignal: string | null;
  selected: boolean;
  onSelect: () => void;
  phone?: string | null;
  mapsUrl?: string | null;
  jobId?: string;
  openJobLabel?: string;
};

export function MobileJobCard({
  customerName,
  statusLabel,
  statusToneClass,
  scheduledLabel,
  locationLabel,
  serviceLabel,
  technicianName,
  paymentSignal,
  selected,
  onSelect,
  phone,
  mapsUrl,
  jobId,
  openJobLabel = "Open",
}: MobileJobCardProps) {
  return (
    <div
      className={[
        "w-full rounded-[20px] border text-left transition overflow-hidden",
        selected
          ? "theme-selected-card border-[color:var(--sem-accent-primary)] ring-1 ring-[color:var(--sem-accent-primary)]"
          : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] hover:border-[color:var(--cmp-border-accent)]",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full px-4 py-3 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[color:var(--sem-text-primary)]">{customerName}</p>
            <p className="mt-0.5 truncate text-xs text-[color:var(--sem-text-muted)]">
              {scheduledLabel} · {locationLabel}
            </p>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusToneClass}`}>
            {statusLabel}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-[color:var(--sem-text-muted)]">
          <span>{serviceLabel}</span>
          {technicianName ? <span>· {technicianName}</span> : <span>· Unassigned</span>}
        </div>

        {paymentSignal ? (
          <p className="mt-1.5 text-xs font-medium text-[color:var(--sem-text-secondary)]">{paymentSignal}</p>
        ) : null}
      </button>

      {/* Quick actions */}
      <div className="flex items-center gap-1 border-t border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)]/30 px-3 py-2">
        {phone ? (
          <a
            href={`tel:${phone}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--cmp-border-subtle)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-state-success)] hover:border-[color:var(--sem-state-success)]/40 active:scale-95"
          >
            <Phone className="h-3 w-3" />
            Call
          </a>
        ) : null}
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--cmp-border-subtle)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-state-info)] hover:border-[color:var(--sem-state-info)]/40 active:scale-95"
          >
            <MapPin className="h-3 w-3" />
            Route
          </a>
        ) : null}
        {jobId ? (
        <Link
          href={`/jobs/${jobId}`}
          onClick={(e) => e.stopPropagation()}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[color:var(--cmp-border-subtle)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-accent-primary)] hover:border-[color:var(--sem-accent-primary)]/40 active:scale-95"
        >
          {openJobLabel}
          <ChevronRight className="h-3 w-3" />
        </Link>
        ) : null}
      </div>
    </div>
  );
}
