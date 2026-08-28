"use client";

import { Plus } from "lucide-react";

import type { InboxBucket, InboxSummaryCounts } from "@/lib/crm/leads-inbox-utils";

type LeadsKpiStripProps = {
  counts: InboxSummaryCounts;
  activeBucket: InboxBucket;
  onSelectBucket: (bucket: InboxBucket) => void;
  onAddLead: () => void;
  canManageLeads: boolean;
};

const BUCKETS: Array<{ key: InboxBucket; label: string; countKey: keyof InboxSummaryCounts | null }> = [
  { key: "new", label: "New", countKey: "new" },
  { key: "contacted", label: "Contacted", countKey: "contacted" },
  { key: "added_to_job", label: "Added to Job", countKey: "addedToJob" },
  { key: "not_booked", label: "Not Booked", countKey: "notBooked" },
];

export function LeadsKpiStrip({
  counts,
  activeBucket,
  onSelectBucket,
  onAddLead,
  canManageLeads,
}: LeadsKpiStripProps) {
  return (
    <section className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onSelectBucket("all")}
        className={chipClass(activeBucket === "all")}
      >
        All
      </button>
      {BUCKETS.map((bucket) => (
        <button
          key={bucket.key}
          type="button"
          onClick={() => onSelectBucket(bucket.key)}
          className={chipClass(activeBucket === bucket.key)}
        >
          {bucket.label}
          <span className="ml-1 opacity-70">
            {bucket.countKey ? counts[bucket.countKey] : 0}
          </span>
        </button>
      ))}
      {canManageLeads ? (
        <button
          type="button"
          onClick={onAddLead}
          className="theme-btn-primary ml-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          New Lead
        </button>
      ) : null}
    </section>
  );
}

function chipClass(active: boolean) {
  return [
    "rounded-full border px-3 py-1.5 text-sm font-medium transition",
    active
      ? "border-[color:var(--sem-accent-primary)] bg-[color:color-mix(in_srgb,var(--sem-accent-primary)_12%,transparent)] text-[color:var(--sem-accent-primary)]"
      : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] text-[color:var(--text-secondary)] hover:border-[color:var(--cmp-border-accent)]",
  ].join(" ");
}
