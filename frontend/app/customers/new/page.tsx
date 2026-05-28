"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { ArrowLeft, UserRoundPlus, Loader2 } from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";

function backendBaseUrl() {
  return process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
}

type ApiEnvelope<T> = {
  data?: T;
  error?: { code?: string; message?: string };
};

export default function NewCustomerPage() {
  const t = useTranslations("customerCreate");
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [serviceAddressLine1, setServiceAddressLine1] = useState("");
  const [serviceAddressLine2, setServiceAddressLine2] = useState("");
  const [serviceCity, setServiceCity] = useState("");
  const [serviceStateOrRegion, setServiceStateOrRegion] = useState("");
  const [servicePostalCode, setServicePostalCode] = useState("");
  const [notes, setNotes] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function validate() {
    const errors: Record<string, string> = {};

    if (!fullName.trim()) {
      errors.fullName = t("requiredField");
    }

    if (!phone.trim()) {
      errors.phone = t("requiredField");
    }

    if (!serviceAddressLine1.trim()) {
      errors.serviceAddressLine1 = t("requiredField");
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`${backendBaseUrl()}/api/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          companyName: companyName.trim() || null,
          serviceAddressLine1: serviceAddressLine1.trim(),
          serviceAddressLine2: serviceAddressLine2.trim() || null,
          serviceCity: serviceCity.trim() || null,
          serviceStateOrRegion: serviceStateOrRegion.trim() || null,
          servicePostalCode: servicePostalCode.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      const payload = await response.json().catch(() => null) as ApiEnvelope<{ id: string }> | null;

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? t("createError"));
      }

      const createdId = payload?.data?.id;
      if (createdId) {
        router.push(`/customers/${createdId}`);
      } else {
        router.push("/customers");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createError"));
    } finally {
      setBusy(false);
    }
  }

  function fieldErrorClass(field: string) {
    return fieldErrors[field]
      ? "border-[color:var(--sem-danger)] focus:border-[color:var(--sem-danger)]"
      : "border-[color:var(--cmp-border-subtle)] focus:border-[color:var(--cmp-border-accent)]";
  }

  const inputClass =
    "theme-input-control h-11 w-full rounded-xl border px-3 text-sm transition focus:outline-none focus:ring-2 focus:ring-[color:var(--cmp-focus-ring)]";

  return (
    <BoardShell>
      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/customers"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-[color:var(--sem-text-muted)] transition hover:text-[color:var(--sem-text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backToCustomers")}
          </Link>
          <h1 className="text-2xl font-bold text-[color:var(--sem-text-primary)]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{t("description")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error ? (
            <div className="rounded-xl border border-[color:var(--sem-danger)] bg-[color:color-mix(in_srgb,var(--sem-danger)_8%,transparent)] px-4 py-3 text-sm text-[color:var(--sem-danger)]">
              {error}
            </div>
          ) : null}

          {/* Required fields */}
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
              {t("fullName")} <span className="text-[color:var(--sem-danger)]">*</span>
            </span>
            <input
              type="text"
              className={`${inputClass} ${fieldErrorClass("fullName")}`}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="John Smith"
              autoComplete="name"
              disabled={busy}
            />
            {fieldErrors.fullName ? (
              <span className="text-xs text-[color:var(--sem-danger)]">{fieldErrors.fullName}</span>
            ) : null}
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
              {t("phone")} <span className="text-[color:var(--sem-danger)]">*</span>
            </span>
            <input
              type="tel"
              className={`${inputClass} ${fieldErrorClass("phone")}`}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="(555) 000-0000"
              autoComplete="tel"
              disabled={busy}
            />
            {fieldErrors.phone ? (
              <span className="text-xs text-[color:var(--sem-danger)]">{fieldErrors.phone}</span>
            ) : null}
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
              {t("email")}
            </span>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="customer@example.com"
              autoComplete="email"
              disabled={busy}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
              {t("companyName")}
            </span>
            <input
              type="text"
              className={inputClass}
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="ABC Property LLC"
              autoComplete="organization"
              disabled={busy}
            />
          </label>

          {/* Address fields */}
          <fieldset className="space-y-4 rounded-2xl border border-[color:var(--cmp-border-subtle)] p-4">
            <legend className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
              Service Address
            </legend>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
                {t("serviceAddressLine1")} <span className="text-[color:var(--sem-danger)]">*</span>
              </span>
              <input
                type="text"
                className={`${inputClass} ${fieldErrorClass("serviceAddressLine1")}`}
                value={serviceAddressLine1}
                onChange={(event) => setServiceAddressLine1(event.target.value)}
                placeholder="123 Main St"
                autoComplete="address-line1"
                disabled={busy}
              />
              {fieldErrors.serviceAddressLine1 ? (
                <span className="text-xs text-[color:var(--sem-danger)]">{fieldErrors.serviceAddressLine1}</span>
              ) : null}
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
                {t("serviceAddressLine2")}
              </span>
              <input
                type="text"
                className={inputClass}
                value={serviceAddressLine2}
                onChange={(event) => setServiceAddressLine2(event.target.value)}
                placeholder="Apt 4B"
                autoComplete="address-line2"
                disabled={busy}
              />
            </label>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
                  {t("city")}
                </span>
                <input
                  type="text"
                  className={inputClass}
                  value={serviceCity}
                  onChange={(event) => setServiceCity(event.target.value)}
                  placeholder="Austin"
                  autoComplete="address-level2"
                  disabled={busy}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
                  {t("stateRegion")}
                </span>
                <input
                  type="text"
                  className={inputClass}
                  value={serviceStateOrRegion}
                  onChange={(event) => setServiceStateOrRegion(event.target.value)}
                  placeholder="TX"
                  autoComplete="address-level1"
                  disabled={busy}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
                  {t("postalCode")}
                </span>
                <input
                  type="text"
                  className={inputClass}
                  value={servicePostalCode}
                  onChange={(event) => setServicePostalCode(event.target.value)}
                  placeholder="78701"
                  autoComplete="postal-code"
                  disabled={busy}
                />
              </label>
            </div>
          </fieldset>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
              {t("notes")}
            </span>
            <textarea
              className={`${inputClass} min-h-[80px] resize-y`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes about this customer\u2026"
              disabled={busy}
              rows={3}
            />
          </label>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[color:var(--sem-accent-primary)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("saving")}
                </>
              ) : (
                <>
                  <UserRoundPlus className="h-4 w-4" />
                  {t("submit")}
                </>
              )}
            </button>

            <Link
              href="/customers"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--cmp-border-subtle)] px-5 py-3 text-sm font-medium text-[color:var(--sem-text-secondary)] transition hover:bg-[color:var(--cmp-hover-surface)] disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("backToCustomers")}
            </Link>
          </div>
        </form>
      </div>
    </BoardShell>
  );
}
