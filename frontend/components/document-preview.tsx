"use client";

type DocumentLineItem = {
  id: string;
  sku_snapshot: string;
  name_snapshot: string;
  description_snapshot: string | null;
  item_type_snapshot: string;
  unit_of_measure_snapshot: string | null;
  unit_price_cents_snapshot: number;
  quantity: string;
  line_subtotal_cents: number;
  sort_order: number;
};

type DocumentPreviewProps = {
  documentKind: "invoice" | "estimate";
  documentNumber: string;
  description: string;
  primaryStatusLabel: string;
  primaryStatusValue: string;
  issuedLabel: string;
  issuedAt: string | null;
  secondaryDateLabel: string;
  secondaryDateValue: string | null;
  customerName: string;
  customerCompanyName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddressLines: string[];
  lineItems: DocumentLineItem[];
  subtotalCents: number;
  taxRateBpsSnapshot?: number | null;
  taxCents?: number | null;
  totalCents: number;
  compatibilityTotalLabel: string;
  compatibilityTotalCents: number;
};

function formatCurrencyFromCents(cents: number | null | undefined) {
  if (typeof cents !== "number") {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatTaxRate(bps: number | null | undefined) {
  if (typeof bps !== "number" || bps <= 0) {
    return "0%";
  }

  return `${(bps / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1")}%`;
}

export default function DocumentPreview({
  documentKind,
  documentNumber,
  description,
  primaryStatusLabel,
  primaryStatusValue,
  issuedLabel,
  issuedAt,
  secondaryDateLabel,
  secondaryDateValue,
  customerName,
  customerCompanyName,
  customerEmail,
  customerPhone,
  customerAddressLines,
  lineItems,
  subtotalCents,
  taxRateBpsSnapshot,
  taxCents,
  totalCents,
  compatibilityTotalLabel,
  compatibilityTotalCents,
}: DocumentPreviewProps) {
  const sortedLineItems = [...lineItems].sort((left, right) => left.sort_order - right.sort_order);
  const documentLabel = documentKind === "invoice" ? "Invoice" : "Estimate";
  const customerContactItems = [
    customerPhone?.trim() ? `Phone: ${customerPhone.trim()}` : null,
    customerEmail?.trim() ? `Email: ${customerEmail.trim()}` : null,
  ].filter(Boolean);

  return (
    <section className="rounded-[32px] border border-black/5 bg-white text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.08)] print:rounded-none print:border-0 print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-6 py-5 print:px-0">
        <div>
          <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">{documentLabel} Preview</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{documentNumber}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Immutable snapshot preview for browser print and PDF save workflows.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
            Ready for print / PDF
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            aria-label={`Print or save ${documentLabel.toLowerCase()} as PDF`}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
          >
            Print / Save as PDF
          </button>
          <p className="text-xs text-slate-500">
            Opens the browser print dialog so you can print or use Save as PDF.
          </p>
        </div>
      </div>

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.05fr)_320px] print:px-0">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-[24px] border border-slate-200 p-5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Bill To</p>
              <p className="mt-3 text-lg font-semibold text-slate-950">{customerName}</p>
              {customerCompanyName ? <p className="mt-1 text-sm text-slate-600">{customerCompanyName}</p> : null}
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                {customerAddressLines.length > 0 ? customerAddressLines.map((line) => (
                  <p key={line}>{line}</p>
                )) : <p>No service address on file.</p>}
              </div>
              {customerContactItems.length ? (
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                  {customerContactItems.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              ) : null}
            </article>

            <article className="rounded-[24px] border border-slate-200 p-5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Document Meta</p>
              <div className="mt-4 grid gap-3 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span>{primaryStatusLabel}</span>
                  <span className="font-medium text-slate-950">{primaryStatusValue}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{issuedLabel}</span>
                  <span className="font-medium text-slate-950">{formatDate(issuedAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{secondaryDateLabel}</span>
                  <span className="font-medium text-slate-950">{formatDate(secondaryDateValue)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{compatibilityTotalLabel}</span>
                  <span className="font-medium text-slate-950">{formatCurrencyFromCents(compatibilityTotalCents)}</span>
                </div>
              </div>
            </article>
          </div>

          <article className="rounded-[24px] border border-slate-200 p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Scope</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {description || "No description provided."}
            </p>
          </article>

          <article className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Snapshot Line Items</p>
            </div>

            {sortedLineItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="document-line-table min-w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-5 py-3 font-medium">Item</th>
                      <th className="px-5 py-3 font-medium">Qty</th>
                      <th className="px-5 py-3 font-medium">Unit</th>
                      <th className="px-5 py-3 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLineItems.map((lineItem) => (
                      <tr key={lineItem.id} className="border-t border-slate-200 align-top text-slate-700">
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-950">{lineItem.name_snapshot}</p>
                          <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                            {lineItem.sku_snapshot ? <span>{lineItem.sku_snapshot}</span> : null}
                            {lineItem.item_type_snapshot ? <span>{lineItem.item_type_snapshot}</span> : null}
                            {lineItem.unit_of_measure_snapshot ? <span>{lineItem.unit_of_measure_snapshot}</span> : null}
                          </div>
                          {lineItem.description_snapshot ? (
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{lineItem.description_snapshot}</p>
                          ) : null}
                        </td>
                        <td className="px-5 py-4 text-slate-950">{lineItem.quantity}</td>
                        <td className="px-5 py-4 text-slate-950">{formatCurrencyFromCents(lineItem.unit_price_cents_snapshot)}</td>
                        <td className="px-5 py-4 font-medium text-slate-950">{formatCurrencyFromCents(lineItem.line_subtotal_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-8 text-sm text-slate-500">
                No persisted snapshot line items are available for this document. Compatibility totals are shown from the stored document record.
              </div>
            )}
          </article>
        </div>

        <aside className="space-y-4">
          <article className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Totals</p>
            <div className="mt-4 grid gap-3 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span>Subtotal</span>
                <span className="font-medium text-slate-950">{formatCurrencyFromCents(subtotalCents)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Tax Rate</span>
                <span className="font-medium text-slate-950">{formatTaxRate(taxRateBpsSnapshot)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Tax</span>
                <span className="font-medium text-slate-950">{formatCurrencyFromCents(taxCents ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3 text-base">
                <span className="font-semibold text-slate-950">Total</span>
                <span className="font-semibold text-slate-950">{formatCurrencyFromCents(totalCents)}</span>
              </div>
            </div>
          </article>

          <article className="rounded-[24px] border border-slate-200 p-5 text-sm text-slate-600">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Readiness</p>
            <p className="mt-3 leading-6">
              This document is ready for browser print and PDF save flows. Send actions stay deferred until a later package adds real delivery behavior.
            </p>
          </article>
        </aside>
      </div>
    </section>
  );
}