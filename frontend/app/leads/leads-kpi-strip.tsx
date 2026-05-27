"use client";

import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";

type LeadsKpiStripProps = {
  newLeadCount: number;
  contactedCount: number;
  convertedCount: number;
  onAddLead: () => void;
};

export function LeadsKpiStrip({
  newLeadCount,
  contactedCount,
  convertedCount,
  onAddLead,
}: LeadsKpiStripProps) {
  const t = useTranslations("leads");

  return (
    <section className="grid gap-4 md:grid-cols-4">
      <Metric label={t("commandCenter.newCount")} value={newLeadCount} helper={t("newLead")} tone="cyan" />
      <Metric label={t("commandCenter.contactedCount")} value={contactedCount} helper={t("contacted")} tone="fuchsia" />
      <Metric label={t("commandCenter.convertedCount")} value={convertedCount} helper={t("converted")} tone="emerald" />
      <div className="theme-control-surface flex items-center justify-between gap-3 rounded-2xl border p-4">
        <div>
          <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
            {t("commandCenter.intakeAction")}
          </span>
          <p className="mt-2 text-sm font-semibold text-[color:var(--text-primary)]">{t("commandCenter.manualIntake")}</p>
          <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{t("commandCenter.manualIntakeHelper")}</p>
        </div>
        <button
          type="button"
          onClick={onAddLead}
          className="theme-btn-primary inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold"
        >
          <UserPlus className="h-3.5 w-3.5" />
          {t("commandCenter.addLead")}
        </button>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: number;
  helper: string;
  tone?: "default" | "cyan" | "fuchsia" | "emerald" | "rose";
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
