"use client";

import Link from "next/link";
import { Globe2, Languages, LockKeyhole, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import type { LanguageStoreSurfacePayload } from "@/lib/language-store/client-language-store";
import type { LanguagePreferencePayload } from "@/lib/language-store/client-language-preferences";
import { metricTileHoverClassName } from "@/components/board/metric-tile";

type LanguageStoreCommandHeaderProps = {
  payload: LanguageStoreSurfacePayload;
  preference: LanguagePreferencePayload | null;
  activeLanguageCount: number;
  roleLabel: string;
};

function scrollToBoundaries() {
  document.getElementById("translation-boundaries")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function LanguageStoreCommandHeader({
  payload,
  preference,
  activeLanguageCount,
  roleLabel,
}: LanguageStoreCommandHeaderProps) {
  const t = useTranslations("languageStore");

  const showBillingLink =
    payload.can_manage_languages
    && (!payload.language_store_enabled || payload.remaining_additional_language_slots <= 0);

  return (
    <header className="sem-ai-hud-bar border-b px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-[96rem]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--sem-ai-grid-text-accent)]">
              <Globe2 className="h-3.5 w-3.5" />
              {t("eyebrow")}
            </p>
            <h1 className="mt-2 font-[family:var(--font-flat-display)] text-3xl tracking-tight text-[color:var(--sem-ai-grid-text-primary)] sm:text-4xl">
              {t("premiumTitle")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--sem-ai-grid-text-secondary)]">
              {t("premiumDescription")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={scrollToBoundaries}
              className="theme-btn-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              <Languages className="h-4 w-4" />
              {t("reviewBoundaries")}
            </button>
            {showBillingLink ? (
              <Link
                href="/settings?topic=billing"
                className="theme-control-surface inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-[color:var(--sem-ai-grid-text-secondary)] transition hover:border-[color:var(--cmp-border-accent)]"
              >
                <Sparkles className="h-4 w-4 text-[color:var(--sem-ai-grid-text-accent)]" />
                {t("manageLanguageSlots")}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: t("plan"), value: payload.plan_key, helper: payload.language_store_enabled ? t("controlsEnabled") : t("readOnly") },
            { label: t("billingStatus"), value: payload.billing_status, helper: t("remaining", { count: payload.remaining_additional_language_slots }) },
            {
              label: t("additionalSlots"),
              value: `${payload.active_additional_language_count} / ${payload.total_additional_language_slots}`,
              helper: t("remaining", { count: payload.remaining_additional_language_slots }),
            },
            { label: t("activeLanguages"), value: String(activeLanguageCount), helper: payload.can_manage_languages ? t("controlsEnabled") : t("readOnly") },
            {
              label: t("workerUiLanguage"),
              value: preference?.effective_language_code?.toUpperCase() ?? "—",
              helper: preference?.fallback_to_default ? (preference.fallback_reason ?? t("readOnly")) : roleLabel,
            },
          ].map((metric) => (
            <article
              key={metric.label}
              className={`rounded-xl border border-[color:var(--sem-ai-node-border)] bg-[color:var(--sem-ai-node-bg)] px-4 py-3 ${metricTileHoverClassName}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-ai-grid-text-muted)]">{metric.label}</p>
              <p className="mt-1 font-[family:var(--font-geist-mono)] text-xl font-semibold capitalize text-[color:var(--sem-ai-grid-text-primary)]">{metric.value}</p>
              <p className="mt-1 text-[11px] text-[color:var(--sem-ai-grid-text-muted)]">{metric.helper}</p>
            </article>
          ))}
        </div>

        {payload.prompt.title ? (
          <div className="theme-alert-warning mt-4 flex items-start gap-3 rounded-xl px-4 py-3">
            {payload.prompt.kind === "billing_attention"
              ? <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
              : <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">{t("workspacePrompt")}</p>
              <p className="mt-1 text-sm font-semibold">{payload.prompt.title}</p>
              <p className="mt-1 text-sm opacity-90">{payload.prompt.message}</p>
            </div>
          </div>
        ) : null}

        {!payload.can_manage_languages ? (
          <div className="theme-alert-info mt-4 flex items-start gap-3 rounded-xl px-4 py-3">
            <Languages className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">{t("readOnlyLabel")}</p>
              <p className="mt-1 text-sm">{t("readOnlyBody")}</p>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
