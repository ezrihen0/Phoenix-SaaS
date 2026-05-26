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
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 font-[family:var(--font-geist-mono)] text-[11px] text-zinc-500">
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
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 backdrop-blur-md">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{t("panels.usage")}</p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-100">{t("translationUnits")}</h2>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{t("usage.slotCapacity")}</p>
          <CapacityBar used={slotUsed} total={slotTotal} />
        </div>

        {usage && !usageLoadError ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{t("usage.consumed")}</p>
                <p className="mt-1 font-[family:var(--font-geist-mono)] text-lg font-semibold text-white">
                  {usage.consumed_translation_units}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{t("usage.remaining")}</p>
                <p className="mt-1 font-[family:var(--font-geist-mono)] text-lg font-semibold text-white">
                  {usage.remaining_translation_units}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{t("usage.total")}</p>
                <p className="mt-1 font-[family:var(--font-geist-mono)] text-lg font-semibold text-white">
                  {usage.total_translation_units}
                </p>
              </div>
            </div>

            <CapacityBar used={usage.consumed_translation_units} total={usage.total_translation_units} />

            <p className="text-xs text-zinc-500">
              {t("usage.billingPeriod")}
              {": "}
              {formatPeriodDate(usage.billing_period_start)}
              {" → "}
              {formatPeriodDate(usage.billing_period_end)}
            </p>
          </>
        ) : payload.total_translation_units > 0 ? (
          <p className="text-sm text-zinc-400">
            {t("usage.unavailable", { total: payload.total_translation_units })}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">{t("usage.noUnits")}</p>
        )}
      </div>
    </section>
  );
}
