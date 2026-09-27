"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import PhoenixInvoiceDocumentTemplate from "@/components/phoenix-invoice-document-template";
import type { PhoenixInvoiceDocumentViewModel } from "@/lib/crm/phoenix-invoice-document.types";
import { portalApiFetch } from "@/lib/portal/browser-api";

type PortalInvoiceDocumentResponse = {
  invoice_id: string;
  document_view: PhoenixInvoiceDocumentViewModel;
  pdf_url: string;
};

export default function PortalInvoiceDocumentPage() {
  const params = useParams<{ invoiceId: string }>();
  const invoiceId = params.invoiceId;
  const [payload, setPayload] = useState<PortalInvoiceDocumentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await portalApiFetch<PortalInvoiceDocumentResponse>(
          `/api/portal/invoices/${encodeURIComponent(invoiceId)}/document-view`,
        );
        if (active) {
          setPayload(data);
        }
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : "Invoice document unavailable.");
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [invoiceId]);

  return (
    <main className="min-h-screen bg-[color:var(--flat-canvas)] px-4 py-10 text-[color:var(--text-primary)] sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link
          href="/portal"
          className="theme-control-surface inline-flex items-center rounded-full px-4 py-2 text-sm text-[color:var(--text-secondary)]"
        >
          Back to portal
        </Link>

        {error ? (
          <p className="theme-alert-error rounded-[20px] border px-5 py-4 text-sm">{error}</p>
        ) : null}

        {payload ? (
          <PhoenixInvoiceDocumentTemplate
            documentView={payload.document_view}
            pdfHref={payload.pdf_url}
          />
        ) : !error ? (
          <p className="text-sm text-[color:var(--text-secondary)]">Loading invoice…</p>
        ) : null}
      </div>
    </main>
  );
}
