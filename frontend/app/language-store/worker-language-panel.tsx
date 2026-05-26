"use client";

import { Loader2 } from "lucide-react";
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

type WorkerLanguagePanelProps = {
  initialPreference: LanguagePreferencePayload | null;
  initialLoadError: string | null;
};

export function WorkerLanguagePanel({ initialPreference, initialLoadError }: WorkerLanguagePanelProps) {
  const t = useTranslations("languageStore");
  const [payload, setPayload] = useState<LanguagePreferencePayload | null>(initialPreference);
  const [selectedCode, setSelectedCode] = useState(initialPreference?.effective_language_code ?? "en");
  const [loadError, setLoadError] = useState<string | null>(initialLoadError);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPreference = useCallback(async () => {
    setLoadError(null);
    try {
      const next = await getClientLanguagePreference();
      setPayload(next);
      setSelectedCode(next.effective_language_code);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t("worker.loadError"));
    }
  }, [t]);

  useEffect(() => {
    if (!initialPreference) {
      void loadPreference();
    }
  }, [initialPreference, loadPreference]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);

    try {
      await updateClientLanguagePreference(selectedCode);
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("worker.saveError"));
      setSaving(false);
    }
  }

  const effectiveDirection = payload?.effective_language.direction ?? "ltr";
  const hasChanges = payload ? selectedCode !== payload.effective_language_code : false;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 backdrop-blur-md">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{t("panels.workerUi")}</p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-100">{t("workerUiLanguage")}</h2>

      {!payload && !loadError ? (
        <div className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading…</span>
        </div>
      ) : null}

      {loadError ? (
        <p className="mt-4 text-sm text-rose-300">{loadError}</p>
      ) : null}

      {payload ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{t("worker.effectiveLanguage")}</p>
              <p className="mt-1 font-[family:var(--font-geist-mono)] text-sm font-semibold text-white">
                {payload.effective_language_code.toUpperCase()}
                {" · "}
                {isSupportedWorkerUiLocale(payload.effective_language_code)
                  ? getWorkerUiLanguageLabel(payload.effective_language_code)
                  : payload.effective_language.label}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{t("worker.direction")}</p>
              <p className="mt-1 font-[family:var(--font-geist-mono)] text-sm font-semibold text-white">
                {effectiveDirection === "rtl" ? t("direction.rtlShort") : t("direction.ltrShort")}
              </p>
            </div>
          </div>

          {payload.fallback_to_default ? (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
              {payload.fallback_reason ?? t("readOnly")}
            </p>
          ) : null}

          <div>
            <label htmlFor="worker-language-select" className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {t("worker.storedPreference")}
            </label>
            <select
              id="worker-language-select"
              value={selectedCode}
              onChange={(event) => setSelectedCode(event.target.value)}
              disabled={saving}
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500/40"
            >
              {payload.enabled_languages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.code.toUpperCase()}
                  {" · "}
                  {isSupportedWorkerUiLocale(language.code) ? getWorkerUiLanguageLabel(language.code) : language.label}
                </option>
              ))}
            </select>
            {!payload.stored_language_code ? (
              <p className="mt-2 text-xs text-zinc-500">{t("worker.noneStored")}</p>
            ) : null}
          </div>

          <p className="text-xs leading-5 text-zinc-500">{t("worker.reloadNotice")}</p>

          {saveError ? (
            <p className="text-xs text-rose-300">{saveError}</p>
          ) : null}

          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={saving || !hasChanges}
            className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:border-violet-400/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? t("worker.saving") : t("worker.savePreference")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
