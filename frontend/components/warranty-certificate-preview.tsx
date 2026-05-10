"use client";

import InvoiceCompanyHeader, { hasInvoiceCompanyHeaderContent } from "@/components/invoice-company-header";

type WarrantyCertificateCompanySettings = {
  businessName: string | null;
  displayInitials?: string | null;
  companyDescription: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  website: string | null;
  companyEmail: string | null;
  phone: string | null;
};

type WarrantyCertificateLineItem = {
  id: string;
  sku_snapshot: string;
  name_snapshot: string;
  description_snapshot: string | null;
  quantity: string;
  warranty_months_snapshot: number | null;
  sort_order: number;
};

type WarrantyCertificatePreviewProps = {
  certificateNumber: string;
  invoiceNumber: string;
  issuedAt: string | null;
  paidAt: string | null;
  customerName: string;
  customerCompanyName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddressLines: string[];
  jobTitle: string | null;
  companySettings: WarrantyCertificateCompanySettings;
  lineItems: WarrantyCertificateLineItem[];
};

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

function formatWarrantyTerm(months: number | null) {
  if (typeof months !== "number" || months <= 0) {
    return "No recorded warranty term";
  }

  return `${months} month${months === 1 ? "" : "s"}`;
}

function formatWarrantyExpiry(baseDate: string | null, months: number | null) {
  if (!baseDate || typeof months !== "number" || months <= 0) {
    return "-";
  }

  const parsed = new Date(baseDate);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  parsed.setMonth(parsed.getMonth() + months);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

export default function WarrantyCertificatePreview({
  certificateNumber,
  invoiceNumber,
  issuedAt,
  paidAt,
  customerName,
  customerCompanyName,
  customerEmail,
  customerPhone,
  customerAddressLines,
  jobTitle,
  companySettings,
  lineItems,
}: WarrantyCertificatePreviewProps) {
  const sortedLineItems = [...lineItems].sort((left, right) => left.sort_order - right.sort_order);
  const hasCompanyHeader = hasInvoiceCompanyHeaderContent(companySettings);
  const customerContactItems = [
    customerPhone?.trim() ? `Phone: ${customerPhone.trim()}` : null,
    customerEmail?.trim() ? `Email: ${customerEmail.trim()}` : null,
  ].filter(Boolean);

  return (
    <section className="rounded-[32px] border border-black/5 bg-white text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.08)] print:rounded-none print:border-0 print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-6 py-5 print:px-0">
        <div>
          <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">Warranty Certificate</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{certificateNumber}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Internal preview generated from the paid invoice snapshot. Warranty terms are shown per line item exactly as stored on the invoice.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
            Ready for print / PDF
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Print or save warranty certificate as PDF"
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
          {hasCompanyHeader ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
              <InvoiceCompanyHeader settings={companySettings} />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-[24px] border border-slate-200 p-5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Certificate Holder</p>
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
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Certificate Meta</p>
              <div className="mt-4 grid gap-3 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span>Certificate</span>
                  <span className="font-medium text-slate-950">{certificateNumber}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Invoice</span>
                  <span className="font-medium text-slate-950">{invoiceNumber}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Issued</span>
                  <span className="font-medium text-slate-950">{formatDate(issuedAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Paid</span>
                  <span className="font-medium text-slate-950">{formatDate(paidAt)}</span>
                </div>
              </div>
            </article>
          </div>

          <article className="rounded-[24px] border border-slate-200 p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Covered Work</p>
            <p className="mt-3 text-sm leading-7 text-slate-700">
              This certificate reflects the paid invoice snapshot for {jobTitle || "the completed service"}. Warranty terms vary by line item and are shown exactly as stored on the invoice at the time of billing.
            </p>
          </article>

          <article className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Per-Line Warranty Terms</p>
            </div>

            {sortedLineItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="document-line-table min-w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-5 py-3 font-medium">Item</th>
                      <th className="px-5 py-3 font-medium">Qty</th>
                      <th className="px-5 py-3 font-medium">Warranty Term</th>
                      <th className="px-5 py-3 font-medium">Warranty Through</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLineItems.map((lineItem) => (
                      <tr key={lineItem.id} className="border-t border-slate-200 align-top text-slate-700">
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-950">{lineItem.name_snapshot}</p>
                          <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                            {lineItem.sku_snapshot ? <span>{lineItem.sku_snapshot}</span> : null}
                          </div>
                          {lineItem.description_snapshot ? (
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{lineItem.description_snapshot}</p>
                          ) : null}
                        </td>
                        <td className="px-5 py-4 text-slate-950">{lineItem.quantity}</td>
                        <td className="px-5 py-4 text-slate-950">{formatWarrantyTerm(lineItem.warranty_months_snapshot)}</td>
                        <td className="px-5 py-4 font-medium text-slate-950">{formatWarrantyExpiry(paidAt, lineItem.warranty_months_snapshot)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-8 text-sm text-slate-500">
                No persisted invoice snapshot line items are available for this certificate.
              </div>
            )}
          </article>
        </div>

        <aside className="space-y-4">
          <article className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-700">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Certificate Notes</p>
            <div className="mt-4 space-y-3 leading-6">
              <p>This preview is available only after the invoice is fully paid or the balance reaches zero.</p>
              <p>No live Pricebook lookup is used. Every displayed warranty term comes from the stored invoice snapshot.</p>
              <p>Mixed warranty durations remain per-line and are not collapsed into a single global term.</p>
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}