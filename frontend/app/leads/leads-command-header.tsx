"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

type LeadsCommandHeaderProps = {
  inViewCount: number;
  staleCount: number;
};

export function LeadsCommandHeader({ inViewCount, staleCount }: LeadsCommandHeaderProps) {
  const t = useTranslations("leads");

  return (
    <header className="flex flex-col gap-6 border-b border-[color:var(--cmp-border-subtle)] pb-6 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--cmp-border-accent)] bg-[color:color-mix(in_srgb,var(--sem-accent-primary)_12%,transparent)] px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--sem-accent-primary)]">
          <ShieldCheck className="h-3 w-3" />
          {t("commandCenter.eyebrow")}
        </div>
        <h1 className="mt-3 font-mono text-3xl font-bold tracking-tight text-[color:var(--text-primary)]">
          {t("commandCenter.title")}
        </h1>
        <p className="mt-1.5 max-w-xl text-xs leading-6 text-[color:var(--text-secondary)]">
          {t("commandCenter.subtitle")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[520px]">
        <MetricCard label={t("commandCenter.inView")} value={inViewCount} helper={t("commandCenter.inViewHelper")} />
        <MetricCard
          label={t("commandCenter.needsAttention")}
          value={staleCount}
          helper={t("commandCenter.needsAttentionHelper")}
          tone={staleCount > 0 ? "rose" : "default"}
        />
      </div>
    </header>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: number;
  helper: string;
  tone?: "default" | "rose" | "cyan" | "fuchsia" | "emerald";
}) {
  const toneClass =
    tone === "cyan"
      ? "text-cyan-700"
      : tone === "fuchsia"
        ? "text-fuchsia-700"
        : tone === "emerald"
          ? "text-emerald-700"
          : tone === "rose"
            ? "text-rose-700"
            : "text-[color:var(--text-primary)]";

  return (
    <div className="theme-control-surface rounded-2xl border p-4">
      <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">{label}</span>
      <span className={`mt-2 block font-mono text-2xl font-bold ${toneClass}`}>{value}</span>
      <p className="mt-2 text-xs leading-5 text-[color:var(--text-secondary)]">{helper}</p>
    </div>
  );
}
