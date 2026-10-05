"use client";

import { Camera, Save, UserRound } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";

export type TechnicianPublicIdentity = {
  technicianId: string | null;
  internalDisplayName: string | null;
  customerFacingName: string | null;
  customerFacingTitle: string | null;
  customerFacingPhotoUrl: string | null;
  photoUploadSupported: boolean;
};

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
  };
};

async function technicianIdentityFetch<T>(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "The customer-facing technician name could not be saved.");
  }

  return payload?.data as T;
}

function valueOrEmpty(value: string | null) {
  return value ?? "";
}

export function TechnicianPublicIdentityPanel({
  initialIdentity,
}: {
  initialIdentity: TechnicianPublicIdentity;
}) {
  const t = useTranslations("settings");
  const [customerFacingName, setCustomerFacingName] = useState(valueOrEmpty(initialIdentity.customerFacingName));
  const [customerFacingTitle, setCustomerFacingTitle] = useState(valueOrEmpty(initialIdentity.customerFacingTitle));
  const [identity, setIdentity] = useState(initialIdentity);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const previewName = customerFacingName.trim() || t("profile.technicianPublic.previewEmpty");
  const previewTitle = customerFacingTitle.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const nextIdentity = await technicianIdentityFetch<TechnicianPublicIdentity>(
        "/api/settings/technician-public-identity",
        {
          method: "PUT",
          body: JSON.stringify({
            customerFacingName: customerFacingName.trim() || null,
            customerFacingTitle: customerFacingTitle.trim() || null,
          }),
        },
      );
      setIdentity(nextIdentity);
      setCustomerFacingName(valueOrEmpty(nextIdentity.customerFacingName));
      setCustomerFacingTitle(valueOrEmpty(nextIdentity.customerFacingTitle));
      setMessage(t("profile.technicianPublic.saved"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("profile.technicianPublic.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-5 rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
          <UserRound className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">
            {t("profile.technicianPublic.label")}
          </p>
          <h4 className="mt-2 text-xl font-semibold text-[color:var(--sem-display-headline)]">
            {t("profile.technicianPublic.title")}
          </h4>
          <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            {t("profile.technicianPublic.helper")}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">{t("profile.technicianPublic.nameLabel")}</span>
          <input
            value={customerFacingName}
            onChange={(event) => setCustomerFacingName(event.target.value)}
            className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
            placeholder={t("profile.technicianPublic.namePlaceholder")}
            maxLength={80}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">{t("profile.technicianPublic.titleLabel")}</span>
          <input
            value={customerFacingTitle}
            onChange={(event) => setCustomerFacingTitle(event.target.value)}
            className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
            placeholder={t("profile.technicianPublic.titlePlaceholder")}
            maxLength={80}
          />
        </label>
      </div>

      <div className="mt-4 rounded-2xl border border-dashed border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-subtle)] text-[color:var(--sem-text-muted)]">
            <Camera className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-[color:var(--sem-text-primary)]">
              {t("profile.technicianPublic.photoLabel")}
            </p>
            <p className="mt-1 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
              {t("profile.technicianPublic.photoHelper")}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-4 py-4">
        <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">
          {t("profile.technicianPublic.previewLabel")}
        </p>
        <p className="mt-2 text-sm font-medium text-[color:var(--sem-text-primary)]">{previewName}</p>
        {previewTitle ? (
          <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{previewTitle}</p>
        ) : null}
        {identity.internalDisplayName ? (
          <p className="mt-3 text-xs leading-5 text-[color:var(--sem-text-muted)]">
            {t("profile.technicianPublic.internalNameHelper", { name: identity.internalDisplayName })}
          </p>
        ) : null}
      </div>

      {message ? <p className="mt-4 text-sm text-[color:var(--sem-accent-primary)]">{message}</p> : null}
      {errorMessage ? <p className="mt-4 text-sm text-red-400">{errorMessage}</p> : null}

      <div className="mt-5">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] px-4 py-2 text-sm font-semibold text-[color:var(--sem-accent-primary)] transition hover:border-[color:var(--sem-accent-primary)] disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? t("profile.technicianPublic.saving") : t("profile.technicianPublic.save")}
        </button>
      </div>
    </form>
  );
}
