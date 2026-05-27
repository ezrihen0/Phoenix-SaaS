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
            ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] shadow-[0_0_40px_color-mix(in_srgb,var(--sem-accent-primary)_12%,transparent)]"
            : "theme-surface-card border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="theme-control-surface-soft inline-flex h-11 w-11 items-center justify-center rounded-xl border">
              {language.state === "locked" || language.state === "slot_full"
                ? <LockKeyhole className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
                : language.is_default
                  ? <Sparkles className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
                  : <Globe2 className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />}
            </div>
            <div>
              <p className="font-[family:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                {language.code}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[color:var(--sem-text-primary)]">{language.label}</h2>
              {nativeLabel && nativeLabel !== language.label ? (
                <p className="mt-0.5 text-sm text-[color:var(--sem-text-secondary)]">{nativeLabel}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full border border-[color:var(--cmp-border-subtle)] px-2 py-0.5 font-[family:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.14em] text-[color:var(--sem-text-muted)]">
                  {language.direction === "rtl" ? t("languageStore.direction.rtlShort") : t("languageStore.direction.ltrShort")}
                </span>
                {language.consumes_paid_slot ? (
                  <span className="rounded-full border border-[color:var(--cmp-border-accent)] bg-[color:color-mix(in_srgb,var(--sem-accent-primary)_12%,transparent)] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[color:var(--sem-accent-primary)]">
                    Paid slot
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <span className="rounded-full border border-[color:var(--cmp-border-subtle)] px-2.5 py-1 font-[family:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.14em] text-[color:var(--sem-text-secondary)]">
            {t(`languageStore.state.${statusKey}`)}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {language.is_default ? (
            <p className="text-sm leading-6 text-[color:var(--sem-text-secondary)]">{t("languageStore.englishAlwaysAvailable")}</p>
          ) : (
            <p className="text-sm leading-6 text-[color:var(--sem-text-secondary)]">
              {language.consumes_paid_slot ? t("languageStore.consumesSlot") : t("languageStore.doesNotConsumeSlot")}
            </p>
          )}

          {language.locked_reason ? (
            <div className="theme-control-surface-soft rounded-xl border px-3 py-2.5 text-sm text-[color:var(--sem-text-secondary)]">
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
              className="rounded-xl border border-[color:var(--cmp-border-accent)] bg-[color:color-mix(in_srgb,var(--sem-accent-primary)_14%,transparent)] px-4 py-2 text-sm font-semibold text-[color:var(--sem-accent-primary)] transition hover:border-[color:var(--cmp-border-accent)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? t("common.actions.activating") : t("common.actions.activate")}
            </button>
          ) : null}

          {language.can_deactivate ? (
            <button
              type="button"
              onClick={() => onDeactivate(language.code)}
              disabled={busy}
              className="theme-control-surface rounded-xl border px-4 py-2 text-sm font-semibold text-[color:var(--sem-text-primary)] transition hover:border-[color:var(--cmp-border-accent)] disabled:cursor-not-allowed disabled:opacity-40"
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
