"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { portalApiFetch } from "@/lib/portal/browser-api";

type PortalHomePayload = {
  active_inspection: { id: string; status: string } | null;
  active_quote: { id: string; status: string; price_cents: number } | null;
  payment_state: { invoice_id: string; invoice_status: string; paid_at: string | null } | null;
  invoices: Array<{
    id: string;
    invoice_number: string | null;
    status: string;
    total_cents: number;
    issued_at: string;
    source_pdf_url: string | null;
  }>;
  warranty_certificates: Array<{
    id: string;
    warranty_type: string;
    warranty_start_date: string;
    warranty_end_date: string;
    created_at: string;
    pdf_url: string;
  }>;
  contact: {
    office_phone: string | null;
    office_email: string | null;
    technician_name: string | null;
    technician_phone: string | null;
  };
};

export default function PortalHomePage() {
  const router = useRouter();
  const [data, setData] = useState<PortalHomePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const nextData = await portalApiFetch<PortalHomePayload>("/api/portal/home");
        if (active) {
          setData(nextData);
        }
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : "Portal data unavailable.");
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[color:var(--flat-canvas)] px-6 py-14 text-[color:var(--text-primary)]">
      <div className="mx-auto max-w-3xl space-y-7">
        <section className="theme-surface-modal rounded-[30px] border border-[color:rgba(212,175,55,0.2)] bg-[linear-gradient(170deg,rgba(8,8,8,0.96),rgba(19,19,19,0.9))] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.35)] sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--flat-gold)]">Portal Overview</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight">Customer Portal</h1>
          <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
            Review supported account documents, quote status, payment status, and service contact details.
          </p>
        </section>
        {error ? <p className="theme-alert-error rounded-[20px] border px-5 py-4 text-sm">{error}</p> : null}
        {data ? (
          <>
            {data.active_inspection ? (
              <section className="theme-surface-card rounded-[24px] border border-[color:var(--border-subtle)] bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(12,12,12,0.92))] p-6">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Inspection</p>
                <p className="mt-2 text-sm text-[color:var(--text-secondary)]">Status: {data.active_inspection.status}</p>
              </section>
            ) : null}
            <section className="theme-surface-card rounded-[24px] border border-[color:var(--border-subtle)] bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(12,12,12,0.92))] p-6">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Quote</p>
              <p className="mt-2 text-sm text-[color:var(--text-secondary)]">Status: {data.active_quote?.status ?? "No quote available"}</p>
              {data.active_quote ? (
                <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                  Estimated amount: {formatCurrency(data.active_quote.price_cents)}
                </p>
              ) : null}
            </section>
            <section className="theme-surface-card rounded-[24px] border border-[color:var(--border-subtle)] bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(12,12,12,0.92))] p-6">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Payment</p>
              {data.payment_state ? (
                <>
                  <p className="mt-2 text-sm text-[color:var(--text-secondary)]">Invoice status: {data.payment_state.invoice_status}</p>
                  <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                    {data.payment_state.paid_at
                      ? `Paid ${new Date(data.payment_state.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                      : "Payment has not been recorded yet."}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-[color:var(--text-secondary)]">No invoice is available in this portal yet.</p>
              )}
            </section>
            <section className="theme-surface-card rounded-[24px] border border-[color:var(--border-subtle)] bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(12,12,12,0.92))] p-6">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Support</p>
              <p className="mt-2 text-sm">Need help with your account?</p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                {data.contact.office_phone ? <a href={`tel:${data.contact.office_phone}`} className="theme-control-surface inline-flex items-center rounded-full px-3.5 py-2 text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(212,175,55,0.35)]">Call office</a> : null}
                {data.contact.office_email ? <a href={`mailto:${data.contact.office_email}`} className="theme-control-surface inline-flex items-center rounded-full px-3.5 py-2 text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(212,175,55,0.35)]">Email office</a> : null}
                {data.contact.technician_phone ? <a href={`tel:${data.contact.technician_phone}`} className="theme-control-surface inline-flex items-center rounded-full px-3.5 py-2 text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(212,175,55,0.35)]">Call technician</a> : null}
              </div>
            </section>
            <section className="theme-surface-card rounded-[24px] border border-[color:var(--border-subtle)] bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(12,12,12,0.92))] p-6">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Invoices</p>
              {(data.invoices ?? []).length > 0 ? (
                <div className="mt-3 space-y-3">
                  {data.invoices.map((invoice) => (
                    <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[color:var(--border-subtle)] px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-[color:var(--text-primary)]">
                          {invoice.invoice_number ? `Invoice #${invoice.invoice_number}` : `Invoice ${invoice.id.slice(0, 8).toUpperCase()}`}
                        </p>
                        <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                          {formatCurrency(invoice.total_cents)} • {invoice.status} • {new Date(invoice.issued_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      {invoice.source_pdf_url ? (
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={invoice.source_pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="theme-control-surface inline-flex items-center rounded-full px-3.5 py-2 text-sm text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
                          >
                            View Invoice
                          </a>
                          <a
                            href={`${invoice.source_pdf_url}?download=1`}
                            className="theme-control-surface inline-flex items-center rounded-full px-3.5 py-2 text-sm text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
                          >
                            Download PDF
                          </a>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[color:var(--text-secondary)]">No invoices available in this portal yet.</p>
              )}
            </section>
            <section className="theme-surface-card rounded-[24px] border border-[color:var(--border-subtle)] bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(12,12,12,0.92))] p-6">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Warranty Certificates</p>
              {(data.warranty_certificates ?? []).length > 0 ? (
                <div className="mt-3 space-y-3">
                  {data.warranty_certificates.map((certificate) => (
                    <div key={certificate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[color:var(--border-subtle)] px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-[color:var(--text-primary)]">WAR-{certificate.id.slice(0, 8).toUpperCase()}</p>
                        <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                          {certificate.warranty_type} • Ends {new Date(certificate.warranty_end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      <a
                        href={`${certificate.pdf_url}?download=1`}
                        className="theme-control-surface inline-flex items-center rounded-full px-3.5 py-2 text-sm text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
                      >
                        Download PDF
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[color:var(--text-secondary)]">No warranty certificates available yet.</p>
              )}
            </section>
            <section className="theme-surface-card rounded-[22px] border border-[color:var(--border-subtle)] bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(12,12,12,0.92))] px-4 py-3">
              <button
                type="button"
                className="theme-control-surface inline-flex items-center rounded-full px-4 py-2 text-sm text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(212,175,55,0.35)]"
                onClick={async () => {
                  await portalApiFetch("/api/portal/logout", { method: "POST" });
                  router.replace("/");
                }}
              >
                Logout
              </button>
            </section>
          </>
        ) : (
          <p className="theme-surface-card rounded-[20px] border border-[color:var(--border-subtle)] bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(12,12,12,0.92))] px-5 py-4 text-sm text-[color:var(--text-secondary)]">Loading portal data...</p>
        )}
      </div>
    </main>
  );
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
