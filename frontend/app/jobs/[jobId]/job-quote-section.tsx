"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, LoaderCircle, Save, ShieldCheck } from "lucide-react";

import DocumentPricebookPicker from "@/components/document-pricebook-picker";
import QuoteLineItemsEditor from "@/components/quote-line-items-editor";
import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  bpsToTaxRateInput,
  buildQuoteLineItemPayload,
  calculateQuotePreviewTotals,
  createManualQuoteLine,
  formatCurrencyFromCents,
  formatDateTime,
  quoteLineFromPricebookItem,
  quoteLinesFromBundle,
  quoteLinesFromPersistedSnapshot,
  taxRateInputToBps,
  type PersistedQuoteLineItem,
  type QuoteBuilderLine,
  type QuoteStatus,
} from "@/lib/crm/quote-line-model";
import type { PricebookBundleDetail, PricebookItem } from "@/lib/crm/pricebook-model";

type ToastTone = "success" | "error" | "warning";

export type JobQuoteRecord = {
  id: string;
  description: string;
  price_cents: number;
  subtotal_cents?: number;
  tax_rate_bps_snapshot?: number;
  tax_cents?: number;
  total_cents?: number;
  status: QuoteStatus;
  sent_at: string | null;
  approved_at: string | null;
  signed_at?: string | null;
  line_items?: PersistedQuoteLineItem[];
};

type JobQuoteSectionProps = {
  jobId: string;
  quote: JobQuoteRecord | null;
  onQuoteChange?: (quote: JobQuoteRecord | null) => void;
  onToast?: (message: string, tone?: ToastTone) => void;
};

const quoteStatuses: Array<{ value: QuoteStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent for Approval" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function formatQuoteStatusLabel(status: QuoteStatus) {
  return quoteStatuses.find((option) => option.value === status)?.label ?? status;
}

export default function JobQuoteSection({
  jobId,
  quote,
  onQuoteChange,
  onToast,
}: JobQuoteSectionProps) {
  const [quoteDetail, setQuoteDetail] = useState<JobQuoteRecord | null>(quote);
  const [description, setDescription] = useState(quote?.description ?? "");
  const [status, setStatus] = useState<QuoteStatus>(quote?.status ?? "draft");
  const [lines, setLines] = useState<QuoteBuilderLine[]>(() =>
    quoteLinesFromPersistedSnapshot(quote?.line_items ?? [], quote?.price_cents),
  );
  const [taxRateInput, setTaxRateInput] = useState(() => bpsToTaxRateInput(quote?.tax_rate_bps_snapshot));
  const [showPricebookPicker, setShowPricebookPicker] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  const activeQuote = quoteDetail ?? quote;
  const isLocked = Boolean(activeQuote?.approved_at || activeQuote?.signed_at);
  const previewTotals = useMemo(
    () => calculateQuotePreviewTotals(lines, taxRateInputToBps(taxRateInput)),
    [lines, taxRateInput],
  );

  function publishQuote(nextQuote: JobQuoteRecord | null) {
    setQuoteDetail(nextQuote);
    onQuoteChange?.(nextQuote);
  }

  function applyQuoteDetail(nextQuote: JobQuoteRecord | null) {
    publishQuote(nextQuote);
    setDescription(nextQuote?.description ?? "");
    setStatus(nextQuote?.status ?? "draft");
    setTaxRateInput(bpsToTaxRateInput(nextQuote?.tax_rate_bps_snapshot));
    setLines(quoteLinesFromPersistedSnapshot(nextQuote?.line_items ?? [], nextQuote?.price_cents));
  }

  async function loadQuoteDetail(quoteId: string) {
    const response = await crmApiFetch<JobQuoteRecord>(`/api/estimates/${quoteId}`);
    applyQuoteDetail(response);
    return response;
  }

  useEffect(() => {
    if (!quote?.id) {
      return;
    }

    let ignore = false;

    const timeoutId = window.setTimeout(() => {
      setIsLoadingQuote(true);
      void loadQuoteDetail(quote.id)
        .catch((error: unknown) => {
          if (!ignore) {
            setErrorMessage(error instanceof Error ? error.message : "The quote could not be loaded.");
          }
        })
        .finally(() => {
          if (!ignore) {
            setIsLoadingQuote(false);
          }
        });
    }, 0);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [quote?.id]);

  async function saveQuote(nextStatus: QuoteStatus, successText: string) {
    if (isLocked) {
      const nextMessage =
        "This estimate is locked because it has already been approved or signed. Use a future revision, void, or duplicate flow to change customer-facing financial content.";
      setErrorMessage(nextMessage);
      onToast?.(nextMessage, "warning");
      return;
    }

    setErrorMessage(null);
    const lineItems = buildQuoteLineItemPayload(lines);
    const taxRateBps = taxRateInputToBps(taxRateInput);
    setIsSaving(true);

    try {
      const response = await crmApiFetch<{ id: string; status: QuoteStatus }>(`/api/jobs/${jobId}/quote`, {
        method: "PUT",
        body: JSON.stringify({
          description,
          priceCents: previewTotals.totalCents,
          status: nextStatus,
          lineItems,
          taxRateBps,
        }),
      });

      const detail = await loadQuoteDetail(response.id);
      setStatus(detail.status);
      onToast?.(successText, "success");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "The quote could not be saved.";
      setErrorMessage(nextMessage);
      onToast?.(nextMessage, "error");
    } finally {
      setIsSaving(false);
    }
  }

  function updateLine(clientId: string, field: keyof QuoteBuilderLine, value: string) {
    setLines((current) =>
      current.map((line) => (line.clientId === clientId ? { ...line, [field]: value } : line)),
    );
  }

  function removeLine(clientId: string) {
    setLines((current) => current.filter((line) => line.clientId !== clientId));
  }

  function addManualLine() {
    setLines((current) => [...current, createManualQuoteLine()]);
  }

  function addPricebookItem(item: PricebookItem) {
    setLines((current) => [...current, quoteLineFromPricebookItem(item)]);
    setShowPricebookPicker(false);
  }

  function addPricebookBundle(bundle: PricebookBundleDetail) {
    setLines((current) => [...current, ...quoteLinesFromBundle(bundle)]);
    setShowPricebookPicker(false);
  }

  const canApprove = description.trim().length > 0 && lines.length > 0 && status !== "approved";

  return (
    <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.94),rgba(12,12,12,0.92))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)] lg:p-6">
      <div className="flex items-center gap-2 text-white">
        <FileText className="h-4 w-4 text-[color:var(--flat-gold)]" />
        <h2 className="text-lg font-semibold text-[#f5ecd2]">Create Quote</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/58">
        Build the job quote from pricebook items or manual rows, then save it as the current estimate for this job.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.82fr)]">
        <div className="space-y-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          {isLocked ? (
            <div className="rounded-[18px] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              This estimate is locked because it has already been approved or signed. Quote details are now read-only on this job page.
            </div>
          ) : null}

          <label className="block space-y-2 text-sm text-white/66">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Work scope, parts, labor, and any approval notes."
              disabled={isLocked}
              className="min-h-[150px] w-full rounded-[18px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-[color:rgba(212,175,55,0.34)]"
            />
          </label>

          <QuoteLineItemsEditor
            lines={lines}
            taxRateInput={taxRateInput}
            onTaxRateInputChange={isLocked ? undefined : setTaxRateInput}
            onLineChange={isLocked ? undefined : updateLine}
            onRemoveLine={isLocked ? undefined : removeLine}
            onAddManualLine={isLocked ? undefined : addManualLine}
            onOpenPricebook={isLocked ? undefined : () => setShowPricebookPicker((current) => !current)}
            readOnly={isLocked}
            persistedLines={activeQuote?.line_items}
          />

          {showPricebookPicker && !isLocked ? (
            <DocumentPricebookPicker
              documentLabel="quote"
              onAddItem={addPricebookItem}
              onAddBundle={addPricebookBundle}
            />
          ) : null}

          <label className="block space-y-2 text-sm text-white/66">
            <span>Approval Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as QuoteStatus)}
              disabled={isLocked}
              className="w-full rounded-[18px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-[color:rgba(212,175,55,0.34)]"
            >
              {quoteStatuses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

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

          {errorMessage ? (
            <div className="rounded-[18px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={isSaving || isLocked}
              onClick={() => {
                void saveQuote(status, activeQuote ? "Quote updated." : "Quote created.");
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-[20px] border border-[color:rgba(212,175,55,0.24)] bg-[linear-gradient(135deg,rgba(212,175,55,0.24),rgba(212,175,55,0.08))] px-5 py-3 text-sm font-medium text-[#f7df97] transition hover:bg-[linear-gradient(135deg,rgba(212,175,55,0.3),rgba(212,175,55,0.12))] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {activeQuote ? "Save quote" : "Create quote"}
            </button>
            <button
              type="button"
              disabled={isSaving || isLocked || !canApprove}
              onClick={() => {
                void saveQuote("approved", "Quote marked approved.");
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-[20px] border border-white/10 bg-white/[0.06] px-5 py-3 text-sm text-white/76 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ShieldCheck className="h-4 w-4" />
              Mark approved
            </button>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/34">Current Quote</p>
          {activeQuote ? (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-white/34">Amount</p>
                <p className="mt-2 text-xl font-semibold text-white">{formatCurrencyFromCents(activeQuote.total_cents ?? activeQuote.price_cents)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-white/34">Approval Status</p>
                <p className="mt-2 text-white">{formatQuoteStatusLabel(activeQuote.status)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-white/34">Description</p>
                <p className="mt-2 whitespace-pre-line leading-6 text-white/72">{activeQuote.description}</p>
              </div>
              <div className="grid gap-3 rounded-[20px] border border-white/10 bg-black/20 p-4 text-xs text-white/48">
                <div className="flex items-center justify-between gap-3">
                  <span>Sent</span>
                  <span className="text-white/72">{formatDateTime(activeQuote.sent_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Approved</span>
                  <span className="text-white/72">{formatDateTime(activeQuote.approved_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Lines</span>
                  <span className="text-white/72">{activeQuote.line_items?.length ?? lines.length}</span>
                </div>
              </div>

              {isLoadingQuote ? (
                <div className="inline-flex items-center gap-2 text-xs text-white/48">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  Loading quote detail
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 leading-6 text-white/48">
              No quote has been created for this job yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
