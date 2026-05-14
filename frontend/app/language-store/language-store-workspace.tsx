"use client";

import { Languages, LockKeyhole, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { LanguageStoreLanguageCard } from "@/components/language-store-language-card";
import {
  activateOrganizationLanguage,
  deactivateOrganizationLanguage,
  type LanguageStoreSurfacePayload,
} from "@/lib/language-store/client-language-store";
import type { SessionRole } from "@/lib/auth/server-session";

type LanguageStoreWorkspaceProps = {
  initial: LanguageStoreSurfacePayload | null;
  loadError: string | null;
  role: SessionRole | null;
};

function formatRoleLabel(role: SessionRole | null) {
  return role ? role.replace("_", " ") : "unknown";
}

export function LanguageStoreWorkspace({ initial, loadError, role }: LanguageStoreWorkspaceProps) {
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
      setMessage(`${languageCode.toUpperCase()} is now active for this workspace.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The language could not be activated.");
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
      setMessage(`${languageCode.toUpperCase()} was removed from this workspace.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The language could not be deactivated.");
    } finally {
      setBusyCode(null);
    }
  }

  if (!payload) {
    return (
      <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
        <div className="mx-auto max-w-6xl">
          <section className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
            <p className="text-sm text-[color:var(--sem-text-secondary)]">{errorMessage ?? "Language Store is unavailable right now."}</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="theme-surface-modal rounded-[34px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] p-7 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">Language Store</p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                Workspace languages
              </h1>
              <p className="mt-4 text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                Enable the worker languages available for the active workspace. Customer-facing document translation is not part of this page yet.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="theme-control-surface-soft rounded-[20px] border px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Current Role</p>
                <p className="mt-2 text-sm font-semibold capitalize text-[color:var(--sem-text-primary)]">{formatRoleLabel(role)}</p>
              </div>
              <div className="theme-control-surface-soft rounded-[20px] border px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Language Admin</p>
                <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">
                  {payload.can_manage_languages ? "Owner/admin controls enabled" : "Read-only"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Plan</p>
            <p className="mt-3 text-2xl font-semibold capitalize text-[color:var(--sem-text-primary)]">{payload.plan_key}</p>
          </article>

          <article className="theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Additional slots</p>
            <p className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">
              {payload.active_additional_language_count} / {payload.total_additional_language_slots}
            </p>
            <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
              {payload.remaining_additional_language_slots} remaining
            </p>
          </article>

          <article className="theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Billing status</p>
            <p className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{payload.billing_status}</p>
          </article>

          <article className="theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Languages active</p>
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
                <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-accent-primary)]">Workspace prompt</p>
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
                <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-accent-primary)]">Read-only</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                  Owners and admins can activate or deactivate organization languages. This workspace view is read-only for your current role.
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
              onActivate={handleActivate}
              onDeactivate={handleDeactivate}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
