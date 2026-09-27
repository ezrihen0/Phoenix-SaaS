"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, LoaderCircle } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";

type InvoiceDocumentRow = {
  id: string;
  document_kind: string;
  generation_sequence: number;
  document_number_at_generation: string | null;
  sent_via: string | null;
  created_at: string;
};

type DocumentsResponse = {
  documents: InvoiceDocumentRow[];
};

export default function InvoiceDocumentHistoryPanel({ invoiceId }: { invoiceId: string }) {
  const [documents, setDocuments] = useState<InvoiceDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const payload = await crmApiFetch<DocumentsResponse>(
          `/api/invoices/${encodeURIComponent(invoiceId)}/documents`,
        );
        if (active) {
          setDocuments(payload.documents ?? []);
        }
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : "Document history unavailable.");
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

  return (
    <section className="rounded-[30px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)]">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
        <h3 className="text-lg font-semibold tracking-tight text-[color:var(--sem-display-headline)]">Sent copies</h3>
      </div>
      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-[color:var(--sem-text-secondary)]">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading sent copies…
        </p>
      ) : null}
      {error ? <p className="theme-alert-error mt-4 rounded-2xl border px-3 py-2 text-sm">{error}</p> : null}
      {!loading && !error && documents.length === 0 ? (
        <p className="mt-4 text-sm text-[color:var(--sem-text-secondary)]">No stored PDF generations yet.</p>
      ) : null}
      {!loading && documents.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-[color:var(--sem-text-primary)]">
                  {document.document_kind.replace(/_/g, " ")}
                  {document.document_number_at_generation ? ` · #${document.document_number_at_generation}` : ""}
                </p>
                <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">
                  {new Date(document.created_at).toLocaleString()}
                  {document.sent_via ? ` · ${document.sent_via}` : ""}
                </p>
              </div>
              <Link
                href={`/api/invoices/${encodeURIComponent(invoiceId)}/documents/${encodeURIComponent(document.id)}/pdf?download=1`}
                className="theme-btn-secondary rounded-full px-3 py-1.5 text-xs"
              >
                Download PDF
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-4 text-xs text-[color:var(--sem-text-muted)]">
        Current invoice PDF:{" "}
        <Link href={`/api/invoices/${encodeURIComponent(invoiceId)}/pdf`} className="underline">
          open latest
        </Link>
      </p>
    </section>
  );
}
