"use client";

import { Globe2, LockKeyhole, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { getWorkerUiLanguageLabel, isSupportedWorkerUiLocale } from "@/lib/i18n/locales";
import type { LanguageStoreLanguageCard as LanguageStoreLanguageCardPayload } from "@/lib/language-store/client-language-store";

type LanguageStoreLanguageCardProps = {
  language: LanguageStoreLanguageCardPayload;
  busyCode: string | null;
  onActivate: (languageCode: string) => void;
  onDeactivate: (languageCode: string) => void;
  variant?: "premium" | "legacy";
};

function stateMessageKey(language: LanguageStoreLanguageCardPayload) {
  if (language.is_default) {
    return "core";
  }

  switch (language.state) {
    case "active":
      return "active";
    case "available":
      return "available";
    case "slot_full":
      return "slotFull";
    case "locked":
    default:
      return "locked";
  }
}

export function LanguageStoreLanguageCard({
  language,
  busyCode,
  onActivate,
  onDeactivate,
  variant = "legacy",
}: LanguageStoreLanguageCardProps) {
  const t = useTranslations();
  const busy = busyCode === language.code;
  const displayLabel = isSupportedWorkerUiLocale(language.code) ? getWorkerUiLanguageLabel(language.code) : language.label;
  const nativeLabel = isSupportedWorkerUiLocale(language.code) && language.code !== "en" ? getWorkerUiLanguageLabel(language.code) : null;
  const statusKey = stateMessageKey(language);

  if (variant === "premium") {
    const isActive = language.state === "active";

    return (
      <article
        className={`rounded-2xl border p-5 backdrop-blur-sm transition ${
          isActive
            ? "border-violet-500/35 bg-gradient-to-br from-violet-950/40 to-zinc-950/80 shadow-[0_0_40px_rgba(139,92,246,0.08)]"
            : "border-zinc-800 bg-zinc-950/70"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/80">
              {language.state === "locked" || language.state === "slot_full"
                ? <LockKeyhole className="h-5 w-5 text-fuchsia-300" />
                : language.is_default
                  ? <Sparkles className="h-5 w-5 text-cyan-300" />
                  : <Globe2 className="h-5 w-5 text-violet-300" />}
            </div>
            <div>
              <p className="font-[family:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                {language.code}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">{language.label}</h2>
              {nativeLabel && nativeLabel !== language.label ? (
                <p className="mt-0.5 text-sm text-zinc-400">{nativeLabel}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full border border-zinc-700 px-2 py-0.5 font-[family:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                  {language.direction === "rtl" ? t("languageStore.direction.rtlShort") : t("languageStore.direction.ltrShort")}
                </span>
                {language.consumes_paid_slot ? (
                  <span className="rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-fuchsia-200">
                    Paid slot
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <span className="rounded-full border border-zinc-700 px-2.5 py-1 font-[family:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.14em] text-zinc-300">
            {t(`languageStore.state.${statusKey}`)}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {language.is_default ? (
            <p className="text-sm leading-6 text-zinc-400">{t("languageStore.englishAlwaysAvailable")}</p>
          ) : (
            <p className="text-sm leading-6 text-zinc-400">
              {language.consumes_paid_slot ? t("languageStore.consumesSlot") : t("languageStore.doesNotConsumeSlot")}
            </p>
          )}

          {language.locked_reason ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-sm text-zinc-400">
              {language.locked_reason}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {language.can_activate ? (
            <button
              type="button"
              onClick={() => onActivate(language.code)}
              disabled={busy}
              className="rounded-xl border border-violet-500/30 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:border-violet-400/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? t("common.actions.activating") : t("common.actions.activate")}
            </button>
          ) : null}

          {language.can_deactivate ? (
            <button
              type="button"
              onClick={() => onDeactivate(language.code)}
              disabled={busy}
              className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? t("common.actions.updating") : t("common.actions.deactivate")}
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="theme-control-surface-soft inline-flex h-12 w-12 items-center justify-center rounded-[18px] border">
            {language.state === "locked" || language.state === "slot_full"
              ? <LockKeyhole className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
              : language.is_default
                ? <Sparkles className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
                : <Globe2 className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-accent-primary)]">{language.code}</p>
            <h2 className="mt-1 text-xl font-semibold text-[color:var(--sem-text-primary)]">{displayLabel}</h2>
            <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">
              {language.direction === "rtl" ? t("languageStore.direction.rtl") : t("languageStore.direction.ltr")}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
          {t(`languageStore.state.${statusKey}`)}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {language.is_default ? (
          <p className="text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            {t("languageStore.englishAlwaysAvailable")}
          </p>
        ) : (
          <p className="text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            {language.consumes_paid_slot ? t("languageStore.consumesSlot") : t("languageStore.doesNotConsumeSlot")}
          </p>
        )}

        {language.locked_reason ? (
          <div className="theme-control-surface-soft rounded-[18px] border px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
            {language.locked_reason}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {language.can_activate ? (
          <button
            type="button"
            onClick={() => onActivate(language.code)}
            disabled={busy}
            className="rounded-full border border-[color:var(--cmp-border-accent)] bg-[color:var(--sem-accent-primary)] px-5 py-2 text-sm font-semibold text-[color:var(--cmp-surface-canvas)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? t("common.actions.activating") : t("common.actions.activate")}
          </button>
        ) : null}

        {language.can_deactivate ? (
          <button
            type="button"
            onClick={() => onDeactivate(language.code)}
            disabled={busy}
            className="theme-control-surface inline-flex items-center justify-center rounded-full border px-5 py-2 text-sm font-semibold transition hover:border-[color:var(--cmp-border-accent)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? t("common.actions.updating") : t("common.actions.deactivate")}
          </button>
        ) : null}
      </div>
    </article>
  );
}
