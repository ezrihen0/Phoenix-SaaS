"use client";

import { Building2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type BranchRecord = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressLine: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  logoUrl: string | null;
  taxLabel: string | null;
  defaultTaxRateBps: number;
  taxNumber: string | null;
  invoicePrefix: string;
  estimatePrefix: string;
};

type ApiEnvelope<T> = {
  data?: T;
  error?: { message?: string };
};

async function branchFetch<T>(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, { ...init, headers, credentials: "include" });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Branch settings could not be saved.");
  }

  return payload?.data as T;
}

function BranchCard({
  branch,
  onSaved,
}: {
  branch: BranchRecord;
  onSaved: (next: BranchRecord) => void;
}) {
  const [phone, setPhone] = useState(branch.phone ?? "");
  const [email, setEmail] = useState(branch.email ?? "");
  const [website, setWebsite] = useState(branch.website ?? "");
  const [addressLine, setAddressLine] = useState(branch.addressLine ?? "");
  const [city, setCity] = useState(branch.city ?? "");
  const [province, setProvince] = useState(branch.province ?? branch.code);
  const [postalCode, setPostalCode] = useState(branch.postalCode ?? "");
  const [taxNumber, setTaxNumber] = useState(branch.taxNumber ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setPhone(branch.phone ?? "");
    setEmail(branch.email ?? "");
    setWebsite(branch.website ?? "");
    setAddressLine(branch.addressLine ?? "");
    setCity(branch.city ?? "");
    setProvince(branch.province ?? branch.code);
    setPostalCode(branch.postalCode ?? "");
    setTaxNumber(branch.taxNumber ?? "");
  }, [branch]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await branchFetch<BranchRecord>(`/api/branches/${encodeURIComponent(branch.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          phone: phone.trim() || null,
          email: email.trim() || null,
          website: website.trim() || null,
          addressLine: addressLine.trim() || null,
          city: city.trim() || null,
          province: province.trim() || null,
          postalCode: postalCode.trim() || null,
          taxNumber: taxNumber.trim() || null,
        }),
      });
      onSaved(saved);
      setMessage("Branch profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Branch profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-text-secondary)]">
            {branch.code}
          </p>
          <h3 className="mt-1 text-xl font-semibold text-[color:var(--sem-text-primary)]">{branch.name}</h3>
          <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
            Business identity for issued documents. Customer service addresses stay on each job.
          </p>
        </div>
        <span className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1 text-xs font-medium text-[color:var(--sem-text-secondary)]">
          {branch.taxLabel} {branch.defaultTaxRateBps / 100}%
        </span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">Phone</span>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">Email</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm md:col-span-2">
          <span className="text-[color:var(--sem-text-secondary)]">Website</span>
          <input value={website} onChange={(event) => setWebsite(event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm md:col-span-2">
          <span className="text-[color:var(--sem-text-secondary)]">Business address</span>
          <input value={addressLine} onChange={(event) => setAddressLine(event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">Home city</span>
          <input value={city} onChange={(event) => setCity(event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">Province</span>
          <input value={province} onChange={(event) => setProvince(event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">Postal code</span>
          <input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-[color:var(--sem-text-secondary)]">Tax number</span>
          <input value={taxNumber} onChange={(event) => setTaxNumber(event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-[14px] bg-[color:var(--sem-accent-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save branch profile"}
        </button>
        {message ? <p className="text-sm text-[color:var(--sem-text-secondary)]">{message}</p> : null}
      </div>
    </article>
  );
}

export function BranchSettingsPanel() {
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void branchFetch<BranchRecord[]>("/api/branches")
      .then((rows) => {
        if (!cancelled) {
          setBranches(rows);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Branch settings could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedBranches = useMemo(
    () => [...branches].sort((left, right) => left.code.localeCompare(right.code)),
    [branches],
  );

  if (loading) {
    return <p className="text-sm text-[color:var(--sem-text-secondary)]">Loading branch profiles...</p>;
  }

  if (error) {
    return <p className="text-sm text-[color:var(--sem-status-danger)]">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-5">
        <div className="flex items-start gap-3">
          <Building2 className="mt-1 h-5 w-5 text-[color:var(--sem-accent-primary)]" />
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Branch business profiles</h2>
            <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">
              Alberta jobs use the Calgary-area Phoenix identity. Ontario jobs use the Ottawa-area identity. Draft documents read these live profiles; issued documents keep a frozen snapshot.
            </p>
          </div>
        </div>
      </div>

      {sortedBranches.map((branch) => (
        <BranchCard
          key={branch.id}
          branch={branch}
          onSaved={(next) => {
            setBranches((current) => current.map((row) => (row.id === next.id ? next : row)));
          }}
        />
      ))}
    </div>
  );
}
