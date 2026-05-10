"use client";

import { Building2, Save } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

export type OrganizationSettings = {
  businessName: string | null;
  displayInitials: string | null;
  companyDescription: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  website: string | null;
  companyEmail: string | null;
  phone: string | null;
  taxRateBps: number;
};

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
  };
};

type OrganizationProfilePanelProps = {
  initialSettings: OrganizationSettings;
};

async function organizationSettingsFetch<T>(input: string, init?: RequestInit) {
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
    throw new Error(payload?.error?.message ?? "The organization profile could not be saved.");
  }

  return payload?.data as T;
}

function valueOrEmpty(value: string | null) {
  return value ?? "";
}

export function OrganizationProfilePanel({ initialSettings }: OrganizationProfilePanelProps) {
  const [businessName, setBusinessName] = useState(valueOrEmpty(initialSettings.businessName));
  const [displayInitials, setDisplayInitials] = useState(valueOrEmpty(initialSettings.displayInitials));
  const [phone, setPhone] = useState(valueOrEmpty(initialSettings.phone));
  const [companyEmail, setCompanyEmail] = useState(valueOrEmpty(initialSettings.companyEmail));
  const [website, setWebsite] = useState(valueOrEmpty(initialSettings.website));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const settings = await organizationSettingsFetch<OrganizationSettings>("/api/settings/organization", {
        method: "PUT",
        body: JSON.stringify({
          businessName,
          displayInitials,
          phone,
          companyEmail,
          website,
        }),
      });

      setBusinessName(valueOrEmpty(settings.businessName));
      setDisplayInitials(valueOrEmpty(settings.displayInitials));
      setPhone(valueOrEmpty(settings.phone));
      setCompanyEmail(valueOrEmpty(settings.companyEmail));
      setWebsite(valueOrEmpty(settings.website));
      setMessage("Business profile saved. Invoices and estimates will use this header.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The organization profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
      <div className="flex items-start gap-3">
        <div className="theme-control-surface-soft inline-flex h-12 w-12 items-center justify-center rounded-[18px] border">
          <Building2 className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Business Profile</p>
          <h2 className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Invoice and estimate header</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            These fields power the company header on customer-facing invoices and estimates. Empty fields stay hidden on documents.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5 lg:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">Company name</span>
          <input
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
            className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
            placeholder="Phoenix Fireplace"
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">Display initials / short brand</span>
          <input
            value={displayInitials}
            onChange={(event) => setDisplayInitials(event.target.value.toUpperCase())}
            className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
            placeholder="PF"
            maxLength={16}
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">Phone</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
            placeholder="(555) 555-5555"
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">Email</span>
          <input
            value={companyEmail}
            type="email"
            onChange={(event) => setCompanyEmail(event.target.value)}
            className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
            placeholder="office@example.com"
          />
        </label>

        <label className="space-y-2 text-sm lg:col-span-2">
          <span className="text-[color:var(--sem-text-secondary)]">Website</span>
          <input
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
            placeholder="https://example.com"
          />
        </label>

        <div className="flex flex-col gap-3 lg:col-span-2 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={saving}
            className="theme-control-surface inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition hover:border-[color:var(--cmp-border-accent)] disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save business profile"}
          </button>
          {message ? <p className="text-sm text-[color:var(--sem-accent-primary)]">{message}</p> : null}
          {errorMessage ? <p className="text-sm text-red-400">{errorMessage}</p> : null}
        </div>
      </form>
    </section>
  );
}
