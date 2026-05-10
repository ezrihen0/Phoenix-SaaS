"use client";

import { FormEvent, useState } from "react";

type ServiceType = "inspection" | "cleaning" | "repair" | "rebuild";

type BookingForm = {
  fullName: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateOrRegion: string;
  postalCode: string;
  serviceType: ServiceType;
  notes: string;
};

const initialForm: BookingForm = {
  fullName: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  stateOrRegion: "",
  postalCode: "",
  serviceType: "inspection",
  notes: "",
};

export default function BookPage() {
  const [form, setForm] = useState<BookingForm>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/public/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone,
          email: form.email || null,
          serviceAddressLine1: form.addressLine1,
          serviceAddressLine2: form.addressLine2 || null,
          serviceCity: form.city,
          serviceStateOrRegion: form.stateOrRegion || null,
          servicePostalCode: form.postalCode,
          serviceType: form.serviceType,
          description: form.notes || null,
          source: "website",
        }),
      });

      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Booking request failed.");
      }

      setSuccess("Booking request received. Our office will contact you shortly.");
      setForm(initialForm);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Booking request failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[color:var(--flat-canvas)] text-[color:var(--text-primary)]">
      <div className="mx-auto max-w-3xl px-6 py-12 lg:px-10">
        <section className="theme-surface-modal rounded-[36px] border border-[color:rgba(212,175,55,0.2)] bg-[linear-gradient(170deg,rgba(8,8,8,0.96),rgba(19,19,19,0.9))] p-7 shadow-[0_36px_120px_rgba(0,0,0,0.4)] sm:p-9">
          <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--flat-gold)]">Online Booking</p>
          <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--text-primary)] sm:text-5xl">
            Book fireplace service online.
          </h1>
          <p className="mt-4 text-sm leading-7 text-[color:var(--text-secondary)] sm:text-base">
            Submit your request and the Phoenix office will follow up with scheduling confirmation.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(255,255,255,0.01)] p-5 sm:p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                <span>Full Name</span>
                <input
                  required
                  value={form.fullName}
                  onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                  className="theme-input-control w-full rounded-[16px] px-4 py-3 text-sm"
                />
              </label>
              <label className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                <span>Phone</span>
                <input
                  required
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  className="theme-input-control w-full rounded-[16px] px-4 py-3 text-sm"
                />
              </label>
            </div>

            <label className="space-y-2 text-sm text-[color:var(--text-secondary)]">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                className="theme-input-control w-full rounded-[16px] px-4 py-3 text-sm"
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-[color:var(--text-secondary)] sm:col-span-2">
                <span>Address Line 1</span>
                <input
                  required
                  value={form.addressLine1}
                  onChange={(event) => setForm((current) => ({ ...current, addressLine1: event.target.value }))}
                  className="theme-input-control w-full rounded-[16px] px-4 py-3 text-sm"
                />
              </label>
              <label className="space-y-2 text-sm text-[color:var(--text-secondary)] sm:col-span-2">
                <span>Address Line 2</span>
                <input
                  value={form.addressLine2}
                  onChange={(event) => setForm((current) => ({ ...current, addressLine2: event.target.value }))}
                  className="theme-input-control w-full rounded-[16px] px-4 py-3 text-sm"
                />
              </label>
              <label className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                <span>City</span>
                <input
                  required
                  value={form.city}
                  onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                  className="theme-input-control w-full rounded-[16px] px-4 py-3 text-sm"
                />
              </label>
              <label className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                <span>State / Region</span>
                <input
                  value={form.stateOrRegion}
                  onChange={(event) => setForm((current) => ({ ...current, stateOrRegion: event.target.value }))}
                  className="theme-input-control w-full rounded-[16px] px-4 py-3 text-sm"
                />
              </label>
              <label className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                <span>Postal Code</span>
                <input
                  required
                  value={form.postalCode}
                  onChange={(event) => setForm((current) => ({ ...current, postalCode: event.target.value }))}
                  className="theme-input-control w-full rounded-[16px] px-4 py-3 text-sm"
                />
              </label>
              <label className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                <span>Service Type</span>
                <select
                  value={form.serviceType}
                  onChange={(event) => setForm((current) => ({ ...current, serviceType: event.target.value as ServiceType }))}
                  className="theme-input-control w-full rounded-[16px] px-4 py-3 text-sm"
                >
                  <option value="inspection">Inspection</option>
                  <option value="cleaning">Cleaning</option>
                  <option value="repair">Repair</option>
                  <option value="rebuild">Rebuild</option>
                </select>
              </label>
            </div>

            <label className="space-y-2 text-sm text-[color:var(--text-secondary)]">
              <span>Notes</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                className="theme-input-control min-h-[120px] w-full rounded-[16px] px-4 py-3 text-sm"
              />
            </label>

            {error ? <p className="theme-alert-error rounded-[16px] border px-4 py-3 text-sm">{error}</p> : null}
            {success ? <p className="theme-alert-success rounded-[16px] border px-4 py-3 text-sm">{success}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="theme-btn-secondary inline-flex min-w-[180px] items-center justify-center rounded-[18px] px-5 py-3 text-sm font-medium disabled:opacity-60"
            >
              {isSubmitting ? "Submitting..." : "Submit Booking"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
