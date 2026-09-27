"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  FileText,
  LoaderCircle,
  Pencil,
  Receipt,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { CrmApiError, crmApiFetch } from "@/lib/crm/browser-api";
import { financeApiErrorMessage } from "@/lib/crm/finance-api-errors";
import {
  formatInvoiceLifecycleStatus,
  type InvoiceLifecycleStatus,
} from "@/lib/crm/invoice-lifecycle";
import { ESTIMATE_TO_INVOICE_CONVERT_CONFIRM } from "@/lib/crm/finance-owner-copy";
import InvoicePaymentForm from "@/lib/crm/invoice-payment-form";
import { formatCurrencyFromCents, formatDateTime } from "@/lib/crm/invoice-line-model";
import {
  buildQuoteLineItemPayload,
  quoteLinesFromPersistedSnapshot,
  type QuoteStatus,
} from "@/lib/crm/quote-line-model";

import type { JobInvoiceRecord } from "./job-invoice-section";
import type { JobQuoteRecord } from "./job-quote-section";

type ToastTone = "success" | "error" | "warning";

function invoiceBlocksEstimateConversion(invoice: JobInvoiceRecord | null | undefined) {
  if (!invoice) {
    return false;
  }

  const lineCount = invoice.line_items?.length;
  if (typeof lineCount === "number") {
    return lineCount > 0;
  }

  if (invoice.source_estimate_id) {
    return true;
  }

  return (invoice.total_cents ?? invoice.amount_cents ?? 0) > 0;
}

function resolveFinanceErrorMessage(error: unknown, fallback: string) {
  if (error instanceof CrmApiError) {
    return financeApiErrorMessage(error.code, error.message || fallback);
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

type JobEstimateTabPanelProps = {
  jobId: string;
  quote: JobQuoteRecord | null;
  onQuoteChange?: (quote: JobQuoteRecord | null) => void;
  onToast?: (message: string, tone?: ToastTone) => void;
};

export function JobEstimateTabPanel({ jobId, quote, onQuoteChange, onToast }: JobEstimateTabPanelProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLocked = Boolean(quote?.approved_at || quote?.signed_at);
  const canMarkApproved = Boolean(quote?.id) && !isLocked && quote?.status !== "approved";

  async function markApproved() {
    if (!quote?.id || isBusy || !canMarkApproved) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const detail = await crmApiFetch<JobQuoteRecord>(`/api/estimates/${quote.id}`);
      const lines = quoteLinesFromPersistedSnapshot(detail.line_items ?? [], detail.price_cents);
      const lineItems = buildQuoteLineItemPayload(lines);

      const response = await crmApiFetch<{ id: string; status: QuoteStatus }>(`/api/jobs/${jobId}/quote`, {
        method: "PUT",
        body: JSON.stringify({
          description: detail.description,
          priceCents: detail.total_cents ?? detail.price_cents,
          status: "approved",
          lineItems,
          taxRateBps: detail.tax_rate_bps_snapshot ?? 0,
        }),
      });

      const refreshed = await crmApiFetch<JobQuoteRecord>(`/api/estimates/${response.id}`);
      onQuoteChange?.(refreshed);
      onToast?.("Estimate marked approved.", "success");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "The quote could not be approved.";
      setErrorMessage(nextMessage);
      onToast?.(nextMessage, "error");
    } finally {
      setIsBusy(false);
    }
  }

  const composerHref = `/estimates/create/${jobId}`;
  const detailHref = quote?.id ? `/estimates/${quote.id}` : null;

  return (
    <section className="rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5 lg:p-6">
      <div className="flex items-center gap-2 text-[color:var(--sem-text-primary)]">
        <FileText className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
        <h2 className="text-lg font-semibold">Estimate</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
        Open the owner composer to build or edit this job&apos;s estimate. One estimate per job is enforced.
      </p>

      {quote ? (
        <div className="mt-5 space-y-4 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Current total</p>
            <p className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">
              {formatCurrencyFromCents(quote.total_cents ?? quote.price_cents)}
            </p>
          </div>
          <div className="grid gap-3 text-xs text-[color:var(--sem-text-secondary)] sm:grid-cols-2">
            <div>
              <p className="uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Status</p>
              <p className="mt-1 text-sm text-[color:var(--sem-text-primary)]">{quote.status}</p>
            </div>
            <div>
              <p className="uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Approved</p>
              <p className="mt-1 text-sm text-[color:var(--sem-text-primary)]">{formatDateTime(quote.approved_at)}</p>
            </div>
          </div>
          {quote.description ? (
            <p className="text-sm leading-6 text-[color:var(--sem-text-secondary)]">{quote.description}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 rounded-[24px] border border-dashed border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-8 text-sm text-[color:var(--sem-text-muted)]">
          No estimate has been created for this job yet.
        </div>
      )}

      {errorMessage ? (
        <div className="theme-alert-error mt-4 rounded-[18px] px-4 py-3 text-sm">{errorMessage}</div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {quote && detailHref ? (
          <>
            <Link
              href={detailHref}
              className="theme-btn-primary inline-flex flex-1 items-center justify-center gap-2 rounded-[20px] px-5 py-3 text-sm font-semibold sm:min-w-[180px] sm:flex-none"
            >
              <ExternalLink className="h-4 w-4" />
              Open Estimate
            </Link>
            <Link
              href={composerHref}
              className="theme-btn-secondary inline-flex flex-1 items-center justify-center gap-2 rounded-[20px] px-5 py-3 text-sm font-semibold sm:min-w-[180px] sm:flex-none"
            >
              <Pencil className="h-4 w-4" />
              Edit Estimate
            </Link>
          </>
        ) : (
          <Link
            href={composerHref}
            className="theme-btn-primary inline-flex flex-1 items-center justify-center gap-2 rounded-[20px] px-5 py-3 text-sm font-semibold sm:min-w-[220px] sm:flex-none"
          >
            <FileText className="h-4 w-4" />
            Create Estimate
          </Link>
        )}

        {canMarkApproved ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              void markApproved();
            }}
            className="theme-btn-secondary inline-flex flex-1 items-center justify-center gap-2 rounded-[20px] px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[200px] sm:flex-none"
          >
            {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Mark approved
          </button>
        ) : null}
      </div>
    </section>
  );
}

type JobInvoiceTabPanelProps = {
  jobId: string;
  invoice: JobInvoiceRecord | null;
  quoteId?: string | null;
  quoteApprovedAt?: string | null;
  quoteSignedAt?: string | null;
  canRecordPayment?: boolean;
  onInvoiceChange?: (invoice: JobInvoiceRecord | null) => void;
  onToast?: (message: string, tone?: ToastTone) => void;
};

export function JobInvoiceTabPanel({
  jobId,
  invoice,
  quoteId,
  quoteApprovedAt,
  quoteSignedAt,
  canRecordPayment = false,
  onInvoiceChange,
  onToast,
}: JobInvoiceTabPanelProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canConvertFromEstimate = Boolean(
    quoteId && (quoteApprovedAt || quoteSignedAt) && !invoiceBlocksEstimateConversion(invoice),
  );
  const balanceCents = invoice?.balance_cents ?? 0;

  async function reloadInvoice(invoiceId: string) {
    const response = await crmApiFetch<JobInvoiceRecord>(`/api/invoices/${invoiceId}`);
    onInvoiceChange?.(response);
    return response;
  }

  async function convertFromEstimate() {
    if (!quoteId || isBusy) {
      return;
    }

    if (!canConvertFromEstimate) {
      const nextMessage =
        "Convert is available for approved or signed estimates when this job has no invoice lines yet.";
      setErrorMessage(nextMessage);
      onToast?.(nextMessage, "warning");
      return;
    }

    const confirmed = window.confirm(ESTIMATE_TO_INVOICE_CONVERT_CONFIRM);

    if (!confirmed) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const response = await crmApiFetch<{ id: string }>(`/api/jobs/${jobId}/invoice/convert-from-estimate`, {
        method: "POST",
        body: JSON.stringify({ estimateId: quoteId }),
      });

      await reloadInvoice(response.id);
      onToast?.("Invoice created from estimate.", "success");
    } catch (error) {
      const nextMessage = resolveFinanceErrorMessage(error, "The estimate could not be converted.");
      setErrorMessage(nextMessage);
      onToast?.(nextMessage, "error");
    } finally {
      setIsBusy(false);
    }
  }

  const composerHref = `/invoices/create/${jobId}`;
  const detailHref = invoice?.id ? `/invoices/${invoice.id}` : null;

  return (
    <section className="rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5 lg:p-6">
      <div className="flex items-center gap-2 text-[color:var(--sem-text-primary)]">
        <Receipt className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
        <h2 className="text-lg font-semibold">Invoice</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
        Use the owner composer to create or edit billing lines. Job-tab shortcuts stay here for conversion and payments.
      </p>

      {invoice ? (
        <div className="mt-5 space-y-4 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Balance due</p>
            <p className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">
              {formatCurrencyFromCents(invoice.balance_cents ?? 0)}
            </p>
          </div>
          <div className="grid gap-3 text-xs text-[color:var(--sem-text-secondary)] sm:grid-cols-2">
            <div>
              <p className="uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Payment status</p>
              <p className="mt-1 text-sm text-[color:var(--sem-text-primary)]">
                {formatInvoiceLifecycleStatus((invoice.lifecycle_status ?? "sent") as InvoiceLifecycleStatus, {
                  snapshotFrozen: Boolean(invoice.last_sent_at),
                })}
              </p>
            </div>
            <div>
              <p className="uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Total</p>
              <p className="mt-1 text-sm text-[color:var(--sem-text-primary)]">
                {formatCurrencyFromCents(invoice.total_cents ?? invoice.amount_cents)}
              </p>
            </div>
          </div>
          {invoice.id ? (
            <div className="mt-4 border-t border-[color:var(--cmp-border-subtle)] pt-4">
              <InvoicePaymentForm
                invoiceId={invoice.id}
                balanceCents={balanceCents}
                canRecordPayment={canRecordPayment}
                variant="compact"
                notePrefix="Recorded from job invoice tab."
                onPaymentRecorded={async () => {
                  await reloadInvoice(invoice.id);
                  onToast?.("Payment recorded.", "success");
                }}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 rounded-[24px] border border-dashed border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-8 text-sm text-[color:var(--sem-text-muted)]">
          No invoice has been created for this job yet.
        </div>
      )}

      {errorMessage ? (
        <div className="theme-alert-error mt-4 rounded-[18px] px-4 py-3 text-sm">{errorMessage}</div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {invoice && detailHref ? (
          <>
            <Link
              href={detailHref}
              className="theme-btn-primary inline-flex flex-1 items-center justify-center gap-2 rounded-[20px] px-5 py-3 text-sm font-semibold sm:min-w-[180px] sm:flex-none"
            >
              <ExternalLink className="h-4 w-4" />
              Open Invoice
            </Link>
            <Link
              href={composerHref}
              className="theme-btn-secondary inline-flex flex-1 items-center justify-center gap-2 rounded-[20px] px-5 py-3 text-sm font-semibold sm:min-w-[180px] sm:flex-none"
            >
              <Pencil className="h-4 w-4" />
              Edit Invoice
            </Link>
          </>
        ) : (
          <Link
            href={composerHref}
            className="theme-btn-primary inline-flex flex-1 items-center justify-center gap-2 rounded-[20px] px-5 py-3 text-sm font-semibold sm:min-w-[220px] sm:flex-none"
          >
            <Receipt className="h-4 w-4" />
            Create Invoice
          </Link>
        )}

        {canConvertFromEstimate ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              void convertFromEstimate();
            }}
            className="theme-btn-secondary inline-flex flex-1 items-center justify-center gap-2 rounded-[20px] px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[220px] sm:flex-none"
          >
            {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Convert from estimate
          </button>
        ) : null}

      </div>
    </section>
  );
}
