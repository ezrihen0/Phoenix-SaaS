"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Receipt, Save, ShieldCheck, Sparkles } from "lucide-react";

import JobInvoiceCatalogPicker from "@/components/job-invoice-catalog-picker";
import InvoiceLineItemsEditor from "@/components/invoice-line-items-editor";
import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  applyDocumentLineTranslationState,
  createEmptyDocumentLineTranslationFields,
  hydrateDocumentTranslationsForSave,
  loadDocumentSourceLanguageCode,
} from "@/lib/crm/document-line-translations";
import {
  bpsToTaxRateInput,
  buildInvoiceLineItemPayload,
  calculateInvoicePreviewTotals,
  createManualInvoiceLine,
  emptyInvoiceLineBundleMetadata,
  formatCentsInput,
  formatCurrencyFromCents,
  formatDateTime,
  invoiceLinesFromPersistedSnapshot,
  normalizeQuantityInput,
  taxRateInputToBps,
  type InvoiceBuilderLine,
  type InvoiceStatus,
  type PersistedInvoiceLineItem,
} from "@/lib/crm/invoice-line-model";
import { getJobStatusLabel, type JobStatus } from "@/lib/crm/statuses";
import type { PersistedQuoteLineItem } from "@/lib/crm/quote-line-model";

type ToastTone = "success" | "error" | "warning";
type InvoiceLifecycleStatus = "sent" | "partial" | "paid" | "refunded" | "overpaid";

type InvoicePaymentRecord = {
  id: string;
  entry_type: "payment" | "refund" | "adjustment";
  amount_cents: number;
  method: "cash" | "check" | "card_manual" | "bank_transfer" | "other";
  reference: string | null;
  note: string | null;
  occurred_at: string;
};

export type JobInvoiceRecord = {
  id: string;
  description: string;
  amount_cents: number;
  subtotal_cents?: number;
  tax_rate_bps_snapshot?: number;
  tax_cents?: number;
  total_cents?: number;
  status: InvoiceStatus;
  lifecycle_status?: InvoiceLifecycleStatus;
  amount_paid_cents?: number;
  refunded_cents?: number;
  balance_cents?: number;
  issued_at: string;
  paid_at: string | null;
  line_items?: PersistedInvoiceLineItem[];
  payments?: InvoicePaymentRecord[];
};

type QuoteDetailRecord = {
  id: string;
  description: string;
  price_cents: number;
  subtotal_cents?: number;
  tax_rate_bps_snapshot?: number;
  tax_cents?: number;
  total_cents?: number;
  status: string;
  approved_at: string | null;
  sent_at: string | null;
  line_items?: PersistedQuoteLineItem[];
};

type JobInvoiceSectionProps = {
  jobId: string;
  invoice: JobInvoiceRecord | null;
  quoteId?: string | null;
  currentJobStatus: JobStatus;
  onInvoiceChange?: (invoice: JobInvoiceRecord | null) => void;
  onToast?: (message: string, tone?: ToastTone) => void;
};

const invoiceStatuses: Array<{ value: InvoiceStatus; label: string }> = [
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
];

function formatLifecycleLabel(status: InvoiceLifecycleStatus | undefined) {
  if (!status) {
    return "Sent";
  }

  if (status === "partial") {
    return "Partial";
  }

  if (status === "refunded") {
    return "Refunded";
  }

  if (status === "overpaid") {
    return "Overpaid";
  }

  return status === "paid" ? "Paid" : "Sent";
}

function invoiceLinesFromQuoteDetail(
  lines: PersistedQuoteLineItem[] | undefined,
  fallbackAmountCents?: number,
): InvoiceBuilderLine[] {
  if (lines && lines.length > 0) {
    return [...lines]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((line) => ({
        clientId: `quote-${line.id}`,
        documentLineKey: `invoice-from-quote-${line.id}-${Math.random().toString(36).slice(2, 8)}`,
        kind: line.pricebook_item_id ? "pricebook_item" : "manual",
        pricebookItemId: line.pricebook_item_id,
        sourceLabel: null,
        sku: line.sku_snapshot,
        name: line.name_snapshot,
        originalName: line.pricebook_item_id ? line.name_snapshot : null,
        description: line.description_snapshot ?? "",
        quantity: normalizeQuantityInput(line.quantity, "Quantity"),
        unitPriceInput: formatCentsInput(line.unit_price_cents_snapshot),
        unitPriceCents: line.unit_price_cents_snapshot,
        originalUnitPriceCents: line.pricebook_item_id ? line.unit_price_cents_snapshot : null,
        originalDescription: line.pricebook_item_id ? line.description_snapshot : null,
        itemType: line.item_type_snapshot,
        unitOfMeasure: line.unit_of_measure_snapshot,
        ...createEmptyDocumentLineTranslationFields(),
        ...emptyInvoiceLineBundleMetadata(),
      }));
  }

  if (typeof fallbackAmountCents === "number" && fallbackAmountCents > 0) {
    return [
      {
        ...createManualInvoiceLine(),
        name: "Quote amount",
        unitPriceInput: formatCentsInput(fallbackAmountCents),
        unitPriceCents: fallbackAmountCents,
      },
    ];
  }

  return [];
}

export default function JobInvoiceSection({
  jobId,
  invoice,
  quoteId,
  currentJobStatus,
  onInvoiceChange,
  onToast,
}: JobInvoiceSectionProps) {
  const [status, setStatus] = useState<InvoiceStatus>(invoice?.status ?? "unpaid");
  const [invoiceDetail, setInvoiceDetail] = useState<JobInvoiceRecord | null>(invoice ?? null);
  const [lines, setLines] = useState<InvoiceBuilderLine[]>(() =>
    invoiceLinesFromPersistedSnapshot(invoice?.line_items ?? [], invoice?.amount_cents),
  );
  const [taxRateInput, setTaxRateInput] = useState(() => bpsToTaxRateInput(invoice?.tax_rate_bps_snapshot));
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);
  const paymentIdempotencyKeyRef = useRef<string | null>(null);
  const [sourceLanguageCode, setSourceLanguageCode] = useState<string | null>(null);

  const canReflectPaidOnJob = currentJobStatus === "completed" || currentJobStatus === "paid";
  const previewTotals = useMemo(
    () => calculateInvoicePreviewTotals(lines, taxRateInputToBps(taxRateInput)),
    [lines, taxRateInput],
  );
  const outstandingBalanceCents = invoiceDetail?.balance_cents ?? previewTotals.totalCents;

  function publishInvoice(nextInvoice: JobInvoiceRecord | null) {
    setInvoiceDetail(nextInvoice);
    onInvoiceChange?.(nextInvoice);
  }

  function applyInvoiceDetail(nextInvoice: JobInvoiceRecord | null, nextLines?: InvoiceBuilderLine[]) {
    publishInvoice(nextInvoice);
    setStatus(nextInvoice?.status ?? "unpaid");
    setTaxRateInput(bpsToTaxRateInput(nextInvoice?.tax_rate_bps_snapshot));
    setLines(nextLines ?? invoiceLinesFromPersistedSnapshot(nextInvoice?.line_items ?? [], nextInvoice?.amount_cents));
  }

  async function loadInvoiceDetailById(invoiceId: string) {
    const response = await crmApiFetch<JobInvoiceRecord>(`/api/invoices/${invoiceId}`);
    const baseLines = invoiceLinesFromPersistedSnapshot(response?.line_items ?? [], response?.amount_cents);
    const hydratedLines = await hydrateDocumentTranslationsForSave("invoice", invoiceId, baseLines);
    applyInvoiceDetail(response, hydratedLines);
    return response;
  }

  useEffect(() => {
    let ignore = false;

    void loadDocumentSourceLanguageCode().then((nextSourceLanguageCode) => {
      if (!ignore) {
        setSourceLanguageCode(nextSourceLanguageCode);
      }
    });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!invoice?.id) {
      return;
    }

    let ignore = false;
    const timeoutId = window.setTimeout(() => {
      setIsLoadingInvoice(true);
      void loadInvoiceDetailById(invoice.id)
        .catch((error: unknown) => {
          if (!ignore) {
            setErrorMessage(error instanceof Error ? error.message : "The invoice could not be loaded.");
          }
        })
        .finally(() => {
          if (!ignore) {
            setIsLoadingInvoice(false);
          }
        });
    }, 0);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [invoice?.id]);

  async function saveInvoice(nextStatus: InvoiceStatus, successText: string) {
    if (previewTotals.totalCents === 0) {
      const confirmed = window.confirm(
        "This invoice total is $0.00. Save anyway?",
      );

      if (!confirmed) {
        return;
      }
    }

    setErrorMessage(null);
    setIsSaving(true);

    try {
      const lineItems = buildInvoiceLineItemPayload(lines);
      const taxRateBps = taxRateInputToBps(taxRateInput);
      const response = await crmApiFetch<{ id: string; status: InvoiceStatus }>(`/api/jobs/${jobId}/invoice`, {
        method: "PUT",
        body: JSON.stringify({
          amountCents: previewTotals.totalCents,
          status: nextStatus,
          lineItems,
          taxRateBps,
        }),
      });

      const detail = await loadInvoiceDetailById(response.id);
      setStatus(detail.status);
      onToast?.(successText, "success");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "The invoice could not be saved.";
      setErrorMessage(nextMessage);
      onToast?.(nextMessage, "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function recordFullPayment() {
    setErrorMessage(null);
    const targetInvoiceId = invoiceDetail?.id;

    if (!targetInvoiceId) {
      const nextMessage = "Save the invoice before recording a payment.";
      setErrorMessage(nextMessage);
      onToast?.(nextMessage, "warning");
      return;
    }

    const remainingBalanceCents = invoiceDetail.balance_cents ?? 0;

    if (remainingBalanceCents <= 0) {
      onToast?.("Invoice already shows no balance due.", "success");
      return;
    }

    setIsSaving(true);

    const idempotencyKey = paymentIdempotencyKeyRef.current ?? crypto.randomUUID();
    paymentIdempotencyKeyRef.current = idempotencyKey;

    try {
      await crmApiFetch(`/api/invoices/${targetInvoiceId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey,
          entryType: "payment",
          amountCents: remainingBalanceCents,
          method: "other",
          note: "Recorded from job invoice workflow.",
        }),
      });

      paymentIdempotencyKeyRef.current = null;

      const finalInvoice = await loadInvoiceDetailById(targetInvoiceId);
      setStatus(finalInvoice.status);
      onToast?.("Full payment recorded.", "success");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "The payment could not be recorded.";
      setErrorMessage(nextMessage);
      onToast?.(nextMessage, "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function pullFromQuote() {
    if (!quoteId) {
      const nextMessage = "Create a quote before pulling quote lines into the invoice.";
      setErrorMessage(nextMessage);
      onToast?.(nextMessage, "warning");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const quoteDetail = await crmApiFetch<QuoteDetailRecord>(`/api/estimates/${quoteId}`);
      setLines(invoiceLinesFromQuoteDetail(quoteDetail.line_items, quoteDetail.total_cents ?? quoteDetail.price_cents));
      setTaxRateInput(bpsToTaxRateInput(quoteDetail.tax_rate_bps_snapshot));
      onToast?.("Invoice draft pulled from quote.", "success");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "The quote could not be loaded.";
      setErrorMessage(nextMessage);
      onToast?.(nextMessage, "error");
    } finally {
      setIsSaving(false);
    }
  }

  function updateLine(clientId: string, field: keyof InvoiceBuilderLine, value: string) {
    setLines((current) =>
      current.map((line) => {
        if (line.clientId !== clientId) {
          return line;
        }

        if (field === "unitPriceInput") {
          return {
            ...line,
            unitPriceInput: value,
            unitPriceCents: value.trim() ? Math.round(Number(value || "0") * 100) || 0 : 0,
          };
        }

        if (field === "warrantyMonthsInput") {
          const trimmed = value.trim();
          const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : null;

          return {
            ...line,
            warrantyMonthsInput: value,
            warrantyMonths: parsed && parsed > 0 ? parsed : null,
          };
        }

        return { ...line, [field]: value };
      }),
    );
  }

  function updateLineTranslation(
    clientId: string,
    field: "name" | "description",
    value: {
      recordId: string | null;
      text: string | null;
      status: "draft" | "final" | null;
      sourceText: string | null;
      sourceLanguageCode: string | null;
    },
  ) {
    setLines((current) =>
      current.map((line) => {
        if (line.clientId !== clientId) {
          return line;
        }

        return applyDocumentLineTranslationState(line, field, value);
      }),
    );
  }

  function updateLineBoolean(clientId: string, field: "warrantyEnabled", value: boolean) {
    setLines((current) =>
      current.map((line) => {
        if (line.clientId !== clientId) {
          return line;
        }

        if (field === "warrantyEnabled") {
          return {
            ...line,
            warrantyEnabled: value,
            warrantyMonthsInput: value ? line.warrantyMonthsInput : "",
            warrantyMonths: value ? line.warrantyMonths : null,
          };
        }

        return line;
      }),
    );
  }

  function removeLine(clientId: string) {
    setLines((current) => current.filter((line) => line.clientId !== clientId));
  }

  function addManualLine() {
    setLines((current) => [...current, createManualInvoiceLine()]);
  }

  function addCatalogLines(nextLines: InvoiceBuilderLine[]) {
    setLines((current) => [...current, ...nextLines]);
    setShowCatalogPicker(false);
  }

  const canMarkPaid = Boolean(invoiceDetail?.id) && outstandingBalanceCents > 0;

  return (
    <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.94),rgba(12,12,12,0.92))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)] lg:p-6">
      <div className="flex items-center gap-2 text-white">
        <Receipt className="h-4 w-4 text-[color:var(--flat-gold)]" />
        <h2 className="text-lg font-semibold text-[#f5ecd2]">Create Invoice</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/58">
        Build the invoice for this job, edit line items as needed, and keep the outstanding balance visible as work moves to payment.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.82fr)]">
        <div className="space-y-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                void pullFromQuote();
              }}
              className="inline-flex items-center gap-2 rounded-[18px] border border-white/10 bg-white/[0.06] px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/76 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Pull from quote
            </button>
          </div>

          <InvoiceLineItemsEditor
            lines={lines}
            taxRateInput={taxRateInput}
            onTaxRateInputChange={setTaxRateInput}
            onLineChange={updateLine}
            onLineBooleanChange={updateLineBoolean}
            onLineTranslationChange={updateLineTranslation}
            onRemoveLine={removeLine}
            onAddManualLine={addManualLine}
            onOpenPricebook={() => setShowCatalogPicker(true)}
            persistedLines={invoiceDetail?.line_items}
            documentId={invoiceDetail?.id ?? null}
            sourceLanguageCode={sourceLanguageCode}
          />

          {showCatalogPicker ? (
            <JobInvoiceCatalogPicker
              onAddLines={addCatalogLines}
              onClose={() => setShowCatalogPicker(false)}
            />
          ) : null}

          <label className="block space-y-2 text-sm text-white/66">
            <span>Legacy Invoice Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as InvoiceStatus)}
              className="w-full rounded-[18px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-[color:rgba(212,175,55,0.34)]"
            >
              {invoiceStatuses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/54">
            {canReflectPaidOnJob
              ? "Ledger-recorded full payment will also move the job to Paid when the balance reaches zero."
              : `Ledger-recorded full payment will keep the job at ${getJobStatusLabel(currentJobStatus)} until the work is completed.`}
          </div>

          {errorMessage ? (
            <div className="rounded-[18px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          <div className="grid gap-3 rounded-[20px] border border-white/10 bg-black/20 p-4 text-xs text-white/48">
            <div className="flex items-center justify-between gap-3">
              <span>Subtotal Preview</span>
              <span className="text-white/72">{formatCurrencyFromCents(previewTotals.subtotalCents)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Tax Preview</span>
              <span className="text-white/72">{formatCurrencyFromCents(previewTotals.taxCents)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Total Preview</span>
              <span className="text-white/72">{formatCurrencyFromCents(previewTotals.totalCents)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                void saveInvoice(status, invoiceDetail ? "Invoice updated." : "Invoice generated.");
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-[20px] border border-[color:rgba(212,175,55,0.24)] bg-[linear-gradient(135deg,rgba(212,175,55,0.24),rgba(212,175,55,0.08))] px-5 py-3 text-sm font-medium text-[#f7df97] transition hover:bg-[linear-gradient(135deg,rgba(212,175,55,0.3),rgba(212,175,55,0.12))] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {invoiceDetail ? "Save invoice" : "Generate invoice"}
            </button>
            <button
              type="button"
              disabled={isSaving || !canMarkPaid}
              onClick={() => {
                void recordFullPayment();
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-[20px] border border-white/10 bg-white/[0.06] px-5 py-3 text-sm text-white/76 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ShieldCheck className="h-4 w-4" />
              Record full payment
            </button>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/34">Current Invoice</p>
          {invoiceDetail ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-[20px] border border-[color:rgba(212,175,55,0.24)] bg-[color:rgba(212,175,55,0.08)] p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-white/38">Balance Due</p>
                <p className="mt-2 text-3xl font-semibold text-white">{formatCurrencyFromCents(invoiceDetail.balance_cents ?? 0)}</p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-white/34">Ledger Status</p>
                <p className="mt-2 text-white">{formatLifecycleLabel(invoiceDetail.lifecycle_status)}</p>
              </div>
              <div className="grid gap-3 rounded-[20px] border border-white/10 bg-black/20 p-4 text-xs text-white/48">
                <div className="flex items-center justify-between gap-3">
                  <span>Total</span>
                  <span className="text-white/72">{formatCurrencyFromCents(invoiceDetail.total_cents ?? invoiceDetail.amount_cents)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Paid To Date</span>
                  <span className="text-white/72">{formatCurrencyFromCents(invoiceDetail.amount_paid_cents ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Refunded</span>
                  <span className="text-white/72">{formatCurrencyFromCents(invoiceDetail.refunded_cents ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Issued</span>
                  <span className="text-white/72">{formatDateTime(invoiceDetail.issued_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Paid</span>
                  <span className="text-white/72">{formatDateTime(invoiceDetail.paid_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Lines</span>
                  <span className="text-white/72">{invoiceDetail.line_items?.length ?? lines.length}</span>
                </div>
              </div>

              {invoiceDetail.payments?.length ? (
                <div className="rounded-[20px] border border-white/10 bg-black/20 p-4 text-xs text-white/52">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/34">Payment Ledger</p>
                  <div className="mt-3 space-y-2">
                    {invoiceDetail.payments.map((payment) => (
                      <div key={payment.id} className="flex items-start justify-between gap-3 rounded-[16px] border border-white/8 px-3 py-2">
                        <div>
                          <p className="text-white/78">{payment.entry_type}</p>
                          <p>{formatDateTime(payment.occurred_at)}</p>
                        </div>
                        <span className="text-white/78">{formatCurrencyFromCents(payment.amount_cents)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {isLoadingInvoice ? (
                <div className="inline-flex items-center gap-2 text-xs text-white/48">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  Loading invoice detail
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 leading-6 text-white/48">
              No invoice has been created for this job yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
