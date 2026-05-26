import type { LucideIcon } from "lucide-react";

type MetricTileProps = {
  icon: LucideIcon;
  label: string;
  value: number | string;
  helper?: string;
};

export function MetricTile({ icon: Icon, label, value, helper }: MetricTileProps) {
  return (
    <article className="theme-surface-card rounded-[24px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-4 shadow-[0_0_0_1px_color-mix(in_srgb,var(--sem-accent-primary)_8%,transparent),0_18px_40px_color-mix(in_srgb,var(--sem-board-glow)_72%,transparent)] backdrop-blur-md">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)] shadow-[0_0_18px_color-mix(in_srgb,var(--sem-accent-primary)_22%,transparent)]">
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
