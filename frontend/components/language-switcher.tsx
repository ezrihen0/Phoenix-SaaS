"use client";

import { Languages, Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import {
  getWorkerUiLanguageLabel,
  isSupportedWorkerUiLocale,
} from "@/lib/i18n/locales";
import {
  getClientLanguagePreference,
  updateClientLanguagePreference,
  type LanguagePreferencePayload,
} from "@/lib/language-store/client-language-preferences";

type LanguageSwitcherProps = {
  variant: "shell";
};

export function LanguageSwitcher({ variant }: LanguageSwitcherProps) {
  const t = useTranslations("shell.language");
  const pathname = usePathname();
  const [payload, setPayload] = useState<LanguagePreferencePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPreference = useCallback(async () => {
    setLoadError(null);
    try {
      const next = await getClientLanguagePreference();
      setPayload(next);
    } catch (error) {
      setPayload(null);
      setLoadError(error instanceof Error ? error.message : t("loadError"));
    }
  }, [t]);

  useEffect(() => {
    void loadPreference();
  }, [loadPreference, pathname]);

  const mutedClass = variant === "shell"
    ? "text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]"
    : "";

  const labelClass = variant === "shell"
    ? "text-sm font-medium text-[color:var(--sem-text-primary)]"
    : "";

  async function handleChange(nextLanguageCode: string) {
    setSaving(true);
    setLoadError(null);

    try {
      await updateClientLanguagePreference(nextLanguageCode);
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t("updateError"));
      setSaving(false);
    }
  }

  if (!payload) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-dashed border-[color:var(--cmp-border-subtle)] px-3 py-2 text-sm text-[color:var(--sem-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{t("loading")}</span>
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <p className={mutedClass}>{t("label")}</p>
      <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] px-3 py-2 text-left text-sm transition hover:border-[color:var(--cmp-border-accent)]">
        <Languages className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
        <select
          value={payload.effective_language_code}
          onChange={(event) => {
            void handleChange(event.target.value);
          }}
          disabled={saving}
          aria-label={t("label")}
          className={`${labelClass} bg-transparent outline-none`}
        >
          {payload.enabled_languages.map((language) => (
            <option key={language.code} value={language.code}>
              {isSupportedWorkerUiLocale(language.code) ? getWorkerUiLanguageLabel(language.code) : language.label}
            </option>
          ))}
        </select>
      </div>
      {payload.fallback_to_default ? (
        <p className="max-w-[14rem] text-xs text-amber-700 dark:text-amber-200">
          {t("fallback")}
        </p>
      ) : null}
      {loadError ? (
        <p className="max-w-[14rem] text-xs text-rose-600 dark:text-rose-300">{loadError}</p>
      ) : null}
    </div>
  );
}
