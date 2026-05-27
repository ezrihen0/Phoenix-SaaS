"use client";

import { useTranslations } from "next-intl";

import type { CustomerOutputTranslationUsageSummary } from "@/lib/language-store/client-customer-output-translations";
import type { LanguageStoreSurfacePayload } from "@/lib/language-store/client-language-store";

type TranslationUsagePanelProps = {
  payload: LanguageStoreSurfacePayload;
  usage: CustomerOutputTranslationUsageSummary | null;
  usageLoadError: string | null;
};

function formatPeriodDate(value: string | null) {
  if (!value) {
    return "—";
  }

  try {
    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return value;
  }
}

function CapacityBar({ used, total }: { used: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return (
    <div className="mt-2">
      <div className="h-2 overflow-hidden rounded-full bg-[color:var(--sem-ai-node-border)]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--sem-ai-connector-trigger),var(--sem-ai-connector-output))] transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 font-[family:var(--font-geist-mono)] text-[11px] text-[color:var(--sem-ai-grid-text-muted)]">
        {used} / {total}
      </p>
    </div>
  );
}

export function TranslationUsagePanel({ payload, usage, usageLoadError }: TranslationUsagePanelProps) {
  const t = useTranslations("languageStore");

  const slotUsed = payload.active_additional_language_count;
  const slotTotal = payload.total_additional_language_slots;

  return (
    <section className="sem-ai-inspector-surface rounded-2xl p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-ai-grid-text-muted)]">{t("panels.usage")}</p>
      <h2 className="mt-1 text-lg font-semibold text-[color:var(--sem-ai-grid-text-primary)]">{t("translationUnits")}</h2>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">{t("usage.slotCapacity")}</p>
          <CapacityBar used={slotUsed} total={slotTotal} />
        </div>

        {usage && !usageLoadError ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="theme-control-surface-soft rounded-xl border px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">{t("usage.consumed")}</p>
                <p className="mt-1 font-[family:var(--font-geist-mono)] text-lg font-semibold text-[color:var(--sem-ai-grid-text-primary)]">
                  {usage.consumed_translation_units}
                </p>
              </div>
              <div className="theme-control-surface-soft rounded-xl border px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">{t("usage.remaining")}</p>
                <p className="mt-1 font-[family:var(--font-geist-mono)] text-lg font-semibold text-[color:var(--sem-ai-grid-text-primary)]">
                  {usage.remaining_translation_units}
                </p>
              </div>
              <div className="theme-control-surface-soft rounded-xl border px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">{t("usage.total")}</p>
                <p className="mt-1 font-[family:var(--font-geist-mono)] text-lg font-semibold text-[color:var(--sem-ai-grid-text-primary)]">
                  {usage.total_translation_units}
                </p>
              </div>
            </div>

            <CapacityBar used={usage.consumed_translation_units} total={usage.total_translation_units} />

            <p className="text-xs text-[color:var(--sem-ai-grid-text-muted)]">
              {t("usage.billingPeriod")}
              {": "}
              {formatPeriodDate(usage.billing_period_start)}
              {" → "}
              {formatPeriodDate(usage.billing_period_end)}
            </p>
          </>
        ) : payload.total_translation_units > 0 ? (
          <p className="text-sm text-[color:var(--sem-ai-grid-text-secondary)]">
            {t("usage.unavailable", { total: payload.total_translation_units })}
          </p>
        ) : (
          <p className="text-sm text-[color:var(--sem-ai-grid-text-muted)]">{t("usage.noUnits")}</p>
        )}
      </div>
    </section>
  );
}
