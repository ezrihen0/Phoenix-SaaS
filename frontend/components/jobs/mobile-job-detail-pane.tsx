"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, CircleDollarSign, ExternalLink, MapPin, Phone, UserRound, Wrench } from "lucide-react";

type MobileJobDetailPaneProps = {
  backLabel: string;
  onBack: () => void;
  customerName: string;
  jobTitle: string;
  statusLabel: string;
  statusToneClass: string;
  nextActionTitle?: string | null;
  nextActionDetail?: string | null;
  scheduledLabel: string;
  addressLabel: string;
  serviceLabel: string;
  technicianName: string | null;
  paymentLabel: string | null;
  paymentDetail?: string | null;
  phone?: string | null;
  mapsUrl?: string | null;
  jobId: string;
  openJobLabel: string;
  callCustomerLabel: string;
  mapsLabel: string;
};

export function MobileJobDetailPane({
  backLabel,
  onBack,
  customerName,
  jobTitle,
  statusLabel,
  statusToneClass,
  nextActionTitle,
  nextActionDetail,
  scheduledLabel,
  addressLabel,
  serviceLabel,
  technicianName,
  paymentLabel,
  paymentDetail,
  phone,
  mapsUrl,
  jobId,
  openJobLabel,
  callCustomerLabel,
  mapsLabel,
}: MobileJobDetailPaneProps) {
  return (
    <div className="space-y-4 pb-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--sem-accent-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </button>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">{customerName}</h2>
          <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{jobTitle}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusToneClass}`}>
          {statusLabel}
        </span>
      </div>

      {nextActionTitle ? (
        <div className="rounded-[20px] border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">Next action</p>
          <p className="mt-2 text-base font-semibold text-[color:var(--sem-text-primary)]">{nextActionTitle}</p>
          {nextActionDetail ? (
            <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{nextActionDetail}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3">
        <div className="rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
            <UserRound className="h-3.5 w-3.5 text-[color:var(--sem-accent-primary)]" />
            Customer
          </div>
          <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{customerName}</p>
          {phone ? (
            <a href={`tel:${phone}`} className="mt-2 inline-flex items-center gap-2 text-sm text-[color:var(--sem-accent-primary)]">
              <Phone className="h-3.5 w-3.5" />
              {phone}
            </a>
          ) : null}
          <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--sem-accent-primary)]" />
            {addressLabel}
          </p>
        </div>

        <div className="rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
            <CalendarDays className="h-3.5 w-3.5 text-[color:var(--sem-accent-primary)]" />
            Schedule
          </div>
          <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{scheduledLabel}</p>
          <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{technicianName ?? "Unassigned technician"}</p>
        </div>

        <div className="rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
            <Wrench className="h-3.5 w-3.5 text-[color:var(--sem-accent-primary)]" />
            Service
          </div>
          <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{serviceLabel}</p>
        </div>

        {paymentLabel ? (
          <div className="rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
              <CircleDollarSign className="h-3.5 w-3.5 text-[color:var(--sem-accent-primary)]" />
              Money
            </div>
            <p className="mt-2 font-[family:var(--font-geist-mono)] text-xl font-semibold text-[color:var(--sem-display-headline)]">{paymentLabel}</p>
            {paymentDetail ? (
              <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{paymentDetail}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Link
          href={`/jobs/${jobId}`}
          className="theme-btn-primary inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold"
        >
          {openJobLabel}
        </Link>
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-4 py-2.5 text-sm font-medium text-[color:var(--sem-text-primary)]"
          >
            <Phone className="h-4 w-4" />
            {callCustomerLabel}
          </a>
        ) : null}
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-4 py-2.5 text-sm font-medium text-[color:var(--sem-text-primary)]"
          >
            <ExternalLink className="h-4 w-4" />
            {mapsLabel}
          </a>
        ) : null}
      </div>
    </div>
  );
}
