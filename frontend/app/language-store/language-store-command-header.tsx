"use client";

import Link from "next/link";
import { Globe2, Languages, LockKeyhole, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import type { LanguageStoreSurfacePayload } from "@/lib/language-store/client-language-store";
import type { LanguagePreferencePayload } from "@/lib/language-store/client-language-preferences";

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
    <header className="border-b border-zinc-800 bg-zinc-950/80 px-4 py-6 backdrop-blur-md lg:px-8">
      <div className="mx-auto max-w-[96rem]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-300">
              <Globe2 className="h-3.5 w-3.5" />
              {t("eyebrow")}
            </p>
            <h1 className="mt-2 font-[family:var(--font-flat-display)] text-3xl tracking-tight text-white sm:text-4xl">
              {t("premiumTitle")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
              {t("premiumDescription")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={scrollToBoundaries}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-sm font-medium text-violet-100 transition hover:border-violet-400/40 hover:bg-violet-500/15"
            >
              <Languages className="h-4 w-4" />
              {t("reviewBoundaries")}
            </button>
            {showBillingLink ? (
              <Link
                href="/settings?topic=billing"
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-600"
              >
                <Sparkles className="h-4 w-4 text-fuchsia-400" />
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
            <article key={metric.label} className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{metric.label}</p>
              <p className="mt-1 font-[family:var(--font-geist-mono)] text-xl font-semibold capitalize text-white">{metric.value}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{metric.helper}</p>
            </article>
          ))}
        </div>

        {payload.prompt.title ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            {payload.prompt.kind === "billing_attention"
              ? <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              : <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-300" />}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">{t("workspacePrompt")}</p>
              <p className="mt-1 text-sm font-semibold text-zinc-100">{payload.prompt.title}</p>
              <p className="mt-1 text-sm text-zinc-400">{payload.prompt.message}</p>
            </div>
          </div>
        ) : null}

        {!payload.can_manage_languages ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <Languages className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">{t("readOnlyLabel")}</p>
              <p className="mt-1 text-sm text-zinc-400">{t("readOnlyBody")}</p>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
