"use client";

import { FileText, Plus, Trash2 } from "lucide-react";

import CustomerOutputTranslationControl from "@/components/customer-output-translation-control";
import {
  calculateInvoicePreviewTotals,
  formatCurrencyFromCents,
  type InvoiceBuilderLine,
  type InvoicePreviewTotals,
  type PersistedInvoiceLineItem,
} from "@/lib/crm/invoice-line-model";
import type { CustomerOutputTranslationStatus } from "@/lib/language-store/client-customer-output-translations";

type InvoiceLineItemsEditorProps = {
  lines: InvoiceBuilderLine[];
  taxRateInput?: string;
  onTaxRateInputChange?: (value: string) => void;
  onLineChange?: (clientId: string, field: keyof InvoiceBuilderLine, value: string) => void;
  onLineBooleanChange?: (clientId: string, field: "warrantyEnabled", value: boolean) => void;
  onLineTranslationChange?: (
    clientId: string,
    field: "name" | "description",
    value: {
      recordId: string | null;
      text: string | null;
      status: CustomerOutputTranslationStatus | null;
      sourceText: string | null;
      sourceLanguageCode: string | null;
    },
  ) => void;
  onRemoveLine?: (clientId: string) => void;
  onAddManualLine?: () => void;
  onOpenPricebook?: () => void;
  addCatalogLabel?: string;
  readOnly?: boolean;
  persistedLines?: PersistedInvoiceLineItem[];
  documentId?: string | null;
  sourceLanguageCode?: string | null;
};

function lineSubtotalCents(line: InvoiceBuilderLine) {
  const quantity = Number(line.quantity || "0");
  return Number.isFinite(quantity) ? Math.round(quantity * line.unitPriceCents) : 0;
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-white/58">
      <span>{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

export default function InvoiceLineItemsEditor({
  lines,
  taxRateInput = "0",
  onTaxRateInputChange,
  onLineChange,
  onLineBooleanChange,
  onLineTranslationChange,
  onRemoveLine,
  onAddManualLine,
  onOpenPricebook,
  addCatalogLabel = "+ Add to Invoice",
  readOnly = false,
  persistedLines,
  documentId,
  sourceLanguageCode,
}: InvoiceLineItemsEditorProps) {
  const previewTotals: InvoicePreviewTotals = calculateInvoicePreviewTotals(
    lines,
    Number.isFinite(Number(taxRateInput)) ? Math.round(Number(taxRateInput || "0") * 100) : 0,
  );

  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/68">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-white">
          <FileText className="h-4 w-4 text-[color:var(--flat-gold)]" />
          <h3 className="text-base font-semibold text-[#f5ecd2]">Invoice Lines</h3>
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenPricebook}
              className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/74 transition hover:border-white/20 hover:text-white"
            >
              {addCatalogLabel}
            </button>
            <button
              type="button"
              onClick={onAddManualLine}
              className="inline-flex items-center gap-2 rounded-full border border-[color:rgba(212,175,55,0.24)] px-4 py-2 text-xs uppercase tracking-[0.18em] text-[#f7df97] transition hover:border-[color:rgba(212,175,55,0.34)] hover:text-[#fde8a5]"
            >
              <Plus className="h-3.5 w-3.5" />
              Manual line
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {lines.length > 0 ? lines.map((line) => (
          <article key={line.clientId} className="rounded-[20px] border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-white">{line.name || "Untitled line"}</p>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-white/42">
                  {line.sku ? <span>{line.sku}</span> : null}
                  {line.itemType ? <span>{line.itemType}</span> : null}
                  {line.unitOfMeasure ? <span>{line.unitOfMeasure}</span> : null}
                  {line.sourceLabel ? <span>Bundle: {line.sourceLabel}</span> : null}
                </div>
              </div>
              {!readOnly && onRemoveLine ? (
                <button
                  type="button"
                  onClick={() => onRemoveLine(line.clientId)}
                  className="rounded-full border border-white/10 p-2 text-white/60 transition hover:border-rose-400/30 hover:text-rose-200"
                  aria-label={`Remove ${line.name || "line"}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {!readOnly && onLineChange ? (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_140px_140px_140px]">
                  <label className="space-y-2 text-xs uppercase tracking-[0.18em] text-white/38">
                    <span>Name</span>
                    <input
                      type="text"
                      value={line.name}
                      onChange={(event) => onLineChange(line.clientId, "name", event.target.value)}
                      className="w-full rounded-[16px] border border-white/10 bg-black/35 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none transition focus:border-[color:rgba(212,175,55,0.34)]"
                    />
                  </label>
                  <label className="space-y-2 text-xs uppercase tracking-[0.18em] text-white/38">
                    <span>Description</span>
                    <input
                      type="text"
                      value={line.description}
                      onChange={(event) => onLineChange(line.clientId, "description", event.target.value)}
                      className="w-full rounded-[16px] border border-white/10 bg-black/35 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none transition focus:border-[color:rgba(212,175,55,0.34)]"
                    />
                  </label>
                  <label className="space-y-2 text-xs uppercase tracking-[0.18em] text-white/38">
                    <span>Qty</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) => onLineChange(line.clientId, "quantity", event.target.value)}
                      className="w-full rounded-[16px] border border-white/10 bg-black/35 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none transition focus:border-[color:rgba(212,175,55,0.34)]"
                    />
                  </label>
                  <label className="space-y-2 text-xs uppercase tracking-[0.18em] text-white/38">
                    <span>Unit Price</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.unitPriceInput}
                      onChange={(event) => onLineChange(line.clientId, "unitPriceInput", event.target.value)}
                      className="w-full rounded-[16px] border border-white/10 bg-black/35 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none transition focus:border-[color:rgba(212,175,55,0.34)]"
                    />
                    {line.originalUnitPriceCents !== null
                      && line.originalUnitPriceCents !== line.unitPriceCents ? (
                      <span className="block text-[11px] normal-case tracking-normal text-white/42">
                        Catalog price {formatCurrencyFromCents(line.originalUnitPriceCents)}
                      </span>
                    ) : null}
                  </label>
                  <div className="space-y-2 text-xs uppercase tracking-[0.18em] text-white/38">
                    <span>Line Total</span>
                    <div className="rounded-[16px] border border-white/10 bg-black/20 px-3 py-2.5 text-sm normal-case tracking-normal text-white">
                      {formatCurrencyFromCents(lineSubtotalCents(line))}
                    </div>
                  </div>
                </div>

                {onLineBooleanChange ? (
                  <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
                    <label className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-white/38">
                      <span>Warranty</span>
                      <input
                        type="checkbox"
                        checked={line.warrantyEnabled}
                        onChange={(event) =>
                          onLineBooleanChange(line.clientId, "warrantyEnabled", event.target.checked)
                        }
                        className="h-4 w-4"
                      />
                    </label>
                    {line.warrantyEnabled ? (
                      <label className="mt-3 block space-y-2 text-xs uppercase tracking-[0.18em] text-white/38">
                        <span>Months</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={line.warrantyMonthsInput}
                          onChange={(event) =>
                            onLineChange(line.clientId, "warrantyMonthsInput", event.target.value)
                          }
                          className="w-full rounded-[16px] border border-white/10 bg-black/35 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none transition focus:border-[color:rgba(212,175,55,0.34)]"
                          placeholder="e.g. 12"
                        />
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {onLineTranslationChange ? (
                  <div className="grid gap-3 xl:grid-cols-2">
                    <CustomerOutputTranslationControl
                      label="Customer English for Name"
                      currentText={line.name}
                      documentKind="invoice"
                      documentId={documentId ?? null}
                      documentLineKey={line.documentLineKey}
                      fieldKey="name"
                      surfaceKey={line.kind === "manual" ? "manual_line_text" : "invoice_line_item_name"}
                      sourceLanguageCode={sourceLanguageCode ?? null}
                      state={{
                        recordId: line.nameTranslationRecordId,
                        text: line.nameTranslationText,
                        status: line.nameTranslationStatus,
                        sourceText: line.nameTranslationSourceText,
                        sourceLanguageCode: line.nameTranslationSourceLanguageCode,
                      }}
                      onChange={(value) => onLineTranslationChange(line.clientId, "name", value)}
                    />
                    <CustomerOutputTranslationControl
                      label="Customer English for Description"
                      currentText={line.description}
                      documentKind="invoice"
                      documentId={documentId ?? null}
                      documentLineKey={line.documentLineKey}
                      fieldKey="description"
                      surfaceKey={line.kind === "manual" ? "manual_line_text" : "invoice_line_item_description"}
                      sourceLanguageCode={sourceLanguageCode ?? null}
                      state={{
                        recordId: line.descriptionTranslationRecordId,
                        text: line.descriptionTranslationText,
                        status: line.descriptionTranslationStatus,
                        sourceText: line.descriptionTranslationSourceText,
                        sourceLanguageCode: line.descriptionTranslationSourceLanguageCode,
                      }}
                      onChange={(value) => onLineTranslationChange(line.clientId, "description", value)}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 grid gap-3 rounded-[18px] border border-white/10 bg-black/20 p-4 sm:grid-cols-2 xl:grid-cols-4">
                <DetailValue label="Description" value={line.description || "-"} />
                <DetailValue label="Quantity" value={line.quantity} />
                <DetailValue label="Unit Price" value={formatCurrencyFromCents(line.unitPriceCents)} />
                <DetailValue label="Line Total" value={formatCurrencyFromCents(lineSubtotalCents(line))} />
                {line.warrantyEnabled && line.warrantyMonths ? (
                  <DetailValue label="Warranty" value={`${line.warrantyMonths} months`} />
                ) : null}
              </div>
            )}
          </article>
        )) : (
          <div className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-5 text-white/48">
            {readOnly
              ? "No persisted invoice lines are available for this invoice yet."
              : "No invoice lines added yet. Add a Pricebook item, add a bundle, or create a manual line."}
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-4 rounded-[20px] border border-white/10 bg-black/20 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          {!readOnly && onTaxRateInputChange ? (
            <label className="block space-y-2 text-xs uppercase tracking-[0.18em] text-white/38">
              <span>Tax Rate %</span>
              <input
                type="text"
                inputMode="decimal"
                value={taxRateInput}
                onChange={(event) => onTaxRateInputChange(event.target.value)}
                className="w-full max-w-[180px] rounded-[16px] border border-white/10 bg-black/35 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none transition focus:border-[color:rgba(212,175,55,0.34)]"
              />
            </label>
          ) : persistedLines && persistedLines.length > 0 ? (
            <DetailValue label="Persisted Lines" value={String(persistedLines.length)} />
          ) : null}
        </div>

        <div className="space-y-2 rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
          <DetailValue label="Subtotal" value={formatCurrencyFromCents(previewTotals.subtotalCents)} />
          <DetailValue label="Tax" value={formatCurrencyFromCents(previewTotals.taxCents)} />
          <DetailValue label="Total" value={formatCurrencyFromCents(previewTotals.totalCents)} />
        </div>
      </div>
    </section>
  );
}