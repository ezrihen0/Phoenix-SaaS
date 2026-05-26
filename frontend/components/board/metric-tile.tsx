import type { LucideIcon } from "lucide-react";

type MetricTileProps = {
  icon: LucideIcon;
  label: string;
  value: number | string;
  helper?: string;
};

export function MetricTile({ icon: Icon, label, value, helper }: MetricTileProps) {
  return (
    <article className="theme-surface-card rounded-[24px] border border-[color:var(--sem-board-border)] bg-[color:var(--cmp-surface-card)] p-4">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl theme-control-surface-soft text-[color:var(--sem-accent-primary)]">
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-4 text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">{value}</p>
      {helper ? (
        <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">{helper}</p>
      ) : null}
    </article>
  );
}
