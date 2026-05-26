"use client";

import { useEffect, useMemo, useState } from "react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import { mintStaffPortalMagicLink } from "@/lib/portal/staff-magic-link-api";

type WarrantyCertificateSummary = {
  id: string;
  certificate_number: string;
  pdf_url: string;
  portal_pdf_url: string;
};

export default function WarrantyCertificateActions({
  invoiceId,
  customerId,
  disabled,
}: {
  invoiceId: string;
  customerId: string | null;
  disabled: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copying, setCopying] = useState(false);
  const [certificate, setCertificate] = useState<WarrantyCertificateSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const existing = await crmApiFetch<WarrantyCertificateSummary | null>(`/api/warranty-certificates/by-invoice/${invoiceId}`);
        if (active) {
          setCertificate(existing);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Warranty certificate lookup failed.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [invoiceId]);

  const hasCertificate = useMemo(() => Boolean(certificate?.id), [certificate]);

  async function handleGenerate() {
    setGenerating(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const next = await crmApiFetch<WarrantyCertificateSummary>("/api/warranty-certificates", {
        method: "POST",
        body: JSON.stringify({ invoiceId }),
      });
      setCertificate(next);
      setMessage("Warranty certificate generated and frozen.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Warranty certificate could not be generated.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyPortalLink() {
    if (!customerId) {
      setErrorMessage("Customer record is required before a portal link can be copied.");
      return;
    }

    setCopying(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const minted = await mintStaffPortalMagicLink(customerId);
      const link = `${window.location.origin}/access/${minted.raw_token}`;
      await navigator.clipboard.writeText(link);
      setMessage("Customer portal link copied. Customer can open and download the warranty certificate.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Portal link could not be copied.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <section className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5 print:hidden">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Warranty Certificate PDF</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            void handleGenerate();
          }}
          disabled={disabled || generating || loading || hasCertificate}
          className="theme-control-surface rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {hasCertificate ? "Regenerate blocked (snapshot frozen)" : generating ? "Generating..." : "Generate Certificate"}
        </button>
        {certificate ? (
          <>
            <a
              href={certificate.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="theme-control-surface rounded-full border px-4 py-2 text-sm"
            >
              View PDF
            </a>
            <a
              href={`${certificate.pdf_url}?download=1`}
              className="theme-control-surface rounded-full border px-4 py-2 text-sm"
            >
              Download PDF
            </a>
            <a
              href={`/warranty-certificate/${certificate.id}`}
              className="theme-control-surface rounded-full border px-4 py-2 text-sm"
            >
              Open Certificate Page
            </a>
            <button
              type="button"
              onClick={() => {
                void handleCopyPortalLink();
              }}
              disabled={copying}
              className="theme-control-surface rounded-full border px-4 py-2 text-sm disabled:opacity-60"
            >
              {copying ? "Copying..." : "Copy Customer Portal Link"}
            </button>
          </>
        ) : null}
      </div>
      {message ? <p className="mt-3 text-sm text-[color:var(--sem-accent-primary)]">{message}</p> : null}
      {errorMessage ? <p className="mt-3 text-sm text-red-400">{errorMessage}</p> : null}
    </section>
  );
}
