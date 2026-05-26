"use client";

import { Languages, LockKeyhole, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { LanguageStoreLanguageCard } from "@/components/language-store-language-card";
import type { SessionRole } from "@/lib/auth/server-session";
import type { CustomerOutputTranslationUsageSummary } from "@/lib/language-store/client-customer-output-translations";
import {
  activateOrganizationLanguage,
  deactivateOrganizationLanguage,
  type LanguageStoreSurfacePayload,
} from "@/lib/language-store/client-language-store";
import type { LanguagePreferencePayload } from "@/lib/language-store/client-language-preferences";

import { CustomerTranslationBoundaryPanel } from "./customer-translation-boundary-panel";
import { LanguageStoreCommandHeader } from "./language-store-command-header";
import { LanguageStoreLanguageGrid } from "./language-store-language-grid";
import { LanguageStorePremiumShell } from "./language-store-premium-shell";
import { TranslationUsagePanel } from "./translation-usage-panel";
import { WorkerLanguagePanel } from "./worker-language-panel";

export const SHOW_LEGACY_LANGUAGE_STORE = false;

type LanguageStoreWorkspaceProps = {
  initial: LanguageStoreSurfacePayload | null;
  initialPreference: LanguagePreferencePayload | null;
  initialUsage: CustomerOutputTranslationUsageSummary | null;
  loadError: string | null;
  preferenceLoadError: string | null;
  usageLoadError: string | null;
  role: SessionRole | null;
};

function formatRoleLabel(role: SessionRole | null) {
  return role ? role.replace("_", " ") : "unknown";
}

function LanguageStoreLegacyWorkspace({
  payload,
  role,
  message,
  errorMessage,
  busyCode,
  onActivate,
  onDeactivate,
}: {
  payload: LanguageStoreSurfacePayload;
  role: SessionRole | null;
  message: string | null;
  errorMessage: string | null;
  busyCode: string | null;
  onActivate: (languageCode: string) => void;
  onDeactivate: (languageCode: string) => void;
}) {
  const t = useTranslations("languageStore");

  const activeLanguages = payload.languages.filter((language) => language.state === "active").length;

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="theme-surface-modal rounded-[34px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] p-7 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">Language Store</p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                {t("title")}
              </h1>
              <p className="mt-4 text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                {t("description")}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="theme-control-surface-soft rounded-[20px] border px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{t("currentRole")}</p>
                <p className="mt-2 text-sm font-semibold capitalize text-[color:var(--sem-text-primary)]">{role ? formatRoleLabel(role) : t("roleUnknown")}</p>
              </div>
              <div className="theme-control-surface-soft rounded-[20px] border px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{t("languageAdmin")}</p>
                <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">
                  {payload.can_manage_languages ? t("controlsEnabled") : t("readOnly")}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{t("plan")}</p>
            <p className="mt-3 text-2xl font-semibold capitalize text-[color:var(--sem-text-primary)]">{payload.plan_key}</p>
          </article>

          <article className="theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{t("additionalSlots")}</p>
            <p className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">
              {payload.active_additional_language_count} / {payload.total_additional_language_slots}
            </p>
            <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
              {t("remaining", { count: payload.remaining_additional_language_slots })}
            </p>
          </article>

          <article className="theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{t("billingStatus")}</p>
            <p className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{payload.billing_status}</p>
          </article>

          <article className="theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{t("activeLanguages")}</p>
            <p className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{activeLanguages}</p>
          </article>
        </section>

        {payload.prompt.title ? (
          <section className="theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
            <div className="flex items-start gap-3">
              <div className="theme-control-surface-soft inline-flex h-12 w-12 items-center justify-center rounded-[18px] border">
                {payload.prompt.kind === "billing_attention"
                  ? <LockKeyhole className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
                  : <Sparkles className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-accent-primary)]">{t("workspacePrompt")}</p>
                <h2 className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{payload.prompt.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{payload.prompt.message}</p>
              </div>
            </div>
          </section>
        ) : null}

        {!payload.can_manage_languages ? (
          <section className="theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
            <div className="flex items-start gap-3">
              <div className="theme-control-surface-soft inline-flex h-12 w-12 items-center justify-center rounded-[18px] border">
                <Languages className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-accent-primary)]">{t("readOnlyLabel")}</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                  {t("readOnlyBody")}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {message ? (
          <section className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-5 py-4 text-sm text-[color:var(--sem-accent-primary)]">
            {message}
          </section>
        ) : null}

        {errorMessage ? (
          <section className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-5 py-4 text-sm text-red-400">
            {errorMessage}
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-2">
          {payload.languages.map((language) => (
            <LanguageStoreLanguageCard
              key={language.code}
              language={language}
              busyCode={busyCode}
              onActivate={onActivate}
              onDeactivate={onDeactivate}
              variant="legacy"
            />
          ))}
        </section>
      </div>
    </main>
  );
}

export function LanguageStoreWorkspace({
  initial,
  initialPreference,
  initialUsage,
  loadError,
  preferenceLoadError,
  usageLoadError,
  role,
}: LanguageStoreWorkspaceProps) {
  const t = useTranslations("languageStore");
  const [payload, setPayload] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(loadError);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const activeLanguages = useMemo(
    () => payload?.languages.filter((language) => language.state === "active").length ?? 0,
    [payload],
  );

  async function handleActivate(languageCode: string) {
    setBusyCode(languageCode);
    setErrorMessage(null);
    setMessage(null);

    try {
      const next = await activateOrganizationLanguage(languageCode);
      setPayload(next);
      setMessage(t("activated", { code: languageCode.toUpperCase() }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("activateError"));
    } finally {
      setBusyCode(null);
    }
  }

  async function handleDeactivate(languageCode: string) {
    setBusyCode(languageCode);
    setErrorMessage(null);
    setMessage(null);

    try {
      const next = await deactivateOrganizationLanguage(languageCode);
      setPayload(next);
      setMessage(t("deactivated", { code: languageCode.toUpperCase() }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("deactivateError"));
    } finally {
      setBusyCode(null);
    }
  }

  if (!payload) {
    if (SHOW_LEGACY_LANGUAGE_STORE) {
      return (
        <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
          <div className="mx-auto max-w-6xl">
            <section className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
              <p className="text-sm text-[color:var(--sem-text-secondary)]">{errorMessage ?? t("unavailable")}</p>
            </section>
          </div>
        </main>
      );
    }

    return (
      <LanguageStorePremiumShell>
        <div className="mx-auto max-w-[96rem] px-4 py-10 lg:px-8">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
            <p className="text-sm text-zinc-400">{errorMessage ?? t("unavailable")}</p>
          </section>
        </div>
      </LanguageStorePremiumShell>
    );
  }

  if (SHOW_LEGACY_LANGUAGE_STORE) {
    return (
      <LanguageStoreLegacyWorkspace
        payload={payload}
        role={role}
        message={message}
        errorMessage={errorMessage}
        busyCode={busyCode}
        onActivate={handleActivate}
        onDeactivate={handleDeactivate}
      />
    );
  }

  return (
    <LanguageStorePremiumShell>
      <LanguageStoreCommandHeader
        payload={payload}
        preference={initialPreference}
        activeLanguageCount={activeLanguages}
        roleLabel={role ? formatRoleLabel(role) : t("roleUnknown")}
      />

      <div className="mx-auto max-w-[96rem] space-y-5 px-4 py-6 lg:px-8">
        {message ? (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <LanguageStoreLanguageGrid
            languages={payload.languages}
            busyCode={busyCode}
            onActivate={handleActivate}
            onDeactivate={handleDeactivate}
          />

          <div className="space-y-5">
            <WorkerLanguagePanel
              initialPreference={initialPreference}
              initialLoadError={preferenceLoadError}
            />
            <TranslationUsagePanel
              payload={payload}
              usage={initialUsage}
              usageLoadError={usageLoadError}
            />
          </div>
        </div>

        <CustomerTranslationBoundaryPanel />
      </div>
    </LanguageStorePremiumShell>
  );
}
