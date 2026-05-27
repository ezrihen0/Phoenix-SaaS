"use client";

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
}: MobileJobCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full rounded-[20px] border px-4 py-3 text-left transition",
        selected
          ? "theme-selected-card border-[color:var(--sem-accent-primary)] ring-1 ring-[color:var(--sem-accent-primary)]"
          : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[color:var(--sem-text-primary)]">{customerName}</p>
          <p className="mt-1 truncate text-xs text-[color:var(--sem-text-muted)]">
            {scheduledLabel} · {locationLabel}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusToneClass}`}>
          {statusLabel}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[color:var(--sem-text-muted)]">
        <span>{serviceLabel}</span>
        {technicianName ? <span>· {technicianName}</span> : <span>· Unassigned</span>}
      </div>

      {paymentSignal ? (
        <p className="mt-2 text-xs font-medium text-[color:var(--sem-text-secondary)]">{paymentSignal}</p>
      ) : null}
    </button>
  );
}
