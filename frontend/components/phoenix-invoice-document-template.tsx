"use client";

import { useMemo, useState } from "react";

import type { PhoenixInvoiceDocumentViewModel } from "@/lib/crm/phoenix-invoice-document.types";

function buildInitials(businessName: string | null, displayInitials: string | null) {
  const initials = displayInitials?.trim();
  if (initials) {
    return initials.slice(0, 3).toUpperCase();
  }

  const words = (businessName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!words.length) {
    return "CO";
  }

  return words.map((word) => word[0]?.toUpperCase() ?? "").join("") || "CO";
}

function BusinessHeaderLogo({
  logoUrl,
  businessName,
  displayInitials,
}: {
  logoUrl: string | null;
  businessName: string | null;
  displayInitials: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const initials = useMemo(
    () => buildInitials(businessName, displayInitials),
    [businessName, displayInitials],
  );

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={businessName ? `${businessName} logo` : "Business logo"}
        className="h-12 w-12 rounded-full border border-slate-200 object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
      {initials}
    </span>
  );
}

export default function PhoenixInvoiceDocumentTemplate({
  documentView,
  pdfHref,
  showPrintActions = true,
}: {
  documentView: PhoenixInvoiceDocumentViewModel;
  pdfHref?: string | null;
  showPrintActions?: boolean;
}) {
  const header = documentView.business_header;
  const meta = documentView.document_meta;

  return (
    <section className="rounded-[32px] border border-black/5 bg-white text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.08)] print:rounded-none print:border-0 print:shadow-none">
      {documentView.show_draft_banner ? (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm font-medium text-amber-900 print:hidden">
          DRAFT — This invoice has not been issued to the customer yet. Totals and customer details may change until send.
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 px-6 py-5 print:px-0">
        <div className="flex items-start gap-4">
          <BusinessHeaderLogo
            logoUrl={header.logo_url}
            businessName={header.business_name}
            displayInitials={header.display_initials}
          />
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">Invoice</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{header.business_name ?? "Service Business"}</h2>
            <div className="mt-2 space-y-0.5 text-xs text-slate-600">
              {header.company_address ? <p>{header.company_address}</p> : null}
              {header.phone ? <p>{header.phone}</p> : null}
              {header.email ? <p>{header.email}</p> : null}
              {header.website ? <p>{header.website}</p> : null}
            </div>
          </div>
        </div>

        <div className="text-right text-sm text-slate-700">
          <p className="text-3xl font-semibold tracking-tight text-slate-950">#{meta.document_number}</p>
          <p className="mt-2">Status: {meta.lifecycle_status}</p>
          <p>Issued: {meta.issued_at_label}</p>
          {meta.due_at_label ? <p>Due: {meta.due_at_label}</p> : null}
        </div>
      </div>

      {showPrintActions ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200/80 px-6 py-4 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
          >
            Print / Save as PDF
          </button>
          {pdfHref ? (
            <a
              href={pdfHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
            >
              Download PDF
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.05fr)_320px] print:px-0">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-[24px] border border-slate-200 p-5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Bill To</p>
              <p className="mt-3 text-lg font-semibold text-slate-950">{documentView.bill_to.name}</p>
              {documentView.bill_to.company ? <p className="mt-1 text-sm text-slate-600">{documentView.bill_to.company}</p> : null}
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                {documentView.bill_to.address_lines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </article>

            <article className="rounded-[24px] border border-slate-200 p-5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Service Location</p>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                {documentView.service_location.address_lines.length ? (
                  documentView.service_location.address_lines.map((line) => <p key={line}>{line}</p>)
                ) : (
                  <p>No service location on file.</p>
                )}
              </div>
            </article>
          </div>

          {documentView.job_reference.label ? (
            <article className="rounded-[24px] border border-slate-200 p-5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Job / Service</p>
              <p className="mt-3 text-sm text-slate-700">{documentView.job_reference.label}</p>
            </article>
          ) : null}

          {documentView.description ? (
            <article className="rounded-[24px] border border-slate-200 p-5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Summary</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{documentView.description}</p>
            </article>
          ) : null}

          <article className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Line Items</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-5 py-3 font-medium">Item</th>
                    <th className="px-5 py-3 font-medium">Qty</th>
                    <th className="px-5 py-3 font-medium">Rate</th>
                    <th className="px-5 py-3 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {documentView.line_items.map((line) => (
                    <tr key={line.id ?? `${line.name}-${line.quantity}`} className="border-t border-slate-200 align-top text-slate-700">
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-950">{line.name}</p>
                        {line.description ? <p className="mt-2 text-sm text-slate-600">{line.description}</p> : null}
                      </td>
                      <td className="px-5 py-4">{line.quantity}</td>
                      <td className="px-5 py-4">{line.unit_price_label}</td>
                      <td className="px-5 py-4 font-medium text-slate-950">{line.line_subtotal_label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          {documentView.payments_ledger.payments.length ? (
            <article className="rounded-[24px] border border-slate-200 p-5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Payments</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                {documentView.payments_ledger.payments.map((payment) => (
                  <p key={`${payment.occurred_at}-${payment.amount_cents}-${payment.method}`}>
                    {payment.occurred_at_label} · {payment.method} · {payment.amount_label}
                    {payment.reference ? ` · ${payment.reference}` : ""}
                  </p>
                ))}
              </div>
            </article>
          ) : null}

          {(documentView.copy_blocks.warranty_text
            || documentView.copy_blocks.terms_text
            || documentView.copy_blocks.payment_instructions
            || documentView.copy_blocks.customer_notes) ? (
            <article className="rounded-[24px] border border-slate-200 p-5 text-sm text-slate-700">
              {documentView.copy_blocks.customer_notes ? (
                <div className="mb-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Customer Notes</p>
                  <p className="mt-2 whitespace-pre-wrap">{documentView.copy_blocks.customer_notes}</p>
                </div>
              ) : null}
              {documentView.copy_blocks.payment_instructions ? (
                <div className="mb-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Payment Instructions</p>
                  <p className="mt-2 whitespace-pre-wrap">{documentView.copy_blocks.payment_instructions}</p>
                </div>
              ) : null}
              {documentView.copy_blocks.warranty_text ? (
                <div className="mb-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Warranty</p>
                  <p className="mt-2 whitespace-pre-wrap">{documentView.copy_blocks.warranty_text}</p>
                </div>
              ) : null}
              {documentView.copy_blocks.terms_text ? (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Terms</p>
                  <p className="mt-2 whitespace-pre-wrap">{documentView.copy_blocks.terms_text}</p>
                </div>
              ) : null}
            </article>
          ) : null}
        </div>

        <aside className="space-y-4">
          <article className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Totals</p>
            <div className="mt-4 grid gap-3 text-sm text-slate-700">
              <div className="flex justify-between gap-3">
                <span>Subtotal</span>
                <span className="font-medium text-slate-950">{documentView.financial_summary.subtotal_label}</span>
              </div>
              {documentView.financial_summary.discount_label ? (
                <div className="flex justify-between gap-3">
                  <span>Discount</span>
                  <span className="font-medium text-slate-950">{documentView.financial_summary.discount_label}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <span>{documentView.financial_summary.tax_label}</span>
                <span className="font-medium text-slate-950">{documentView.financial_summary.tax_amount_label}</span>
              </div>
              <div className="flex justify-between gap-3 border-t border-slate-200 pt-3 text-base">
                <span className="font-semibold text-slate-950">Total</span>
                <span className="font-semibold text-slate-950">{documentView.financial_summary.total_label}</span>
              </div>
              {documentView.balance_due.paid_label ? (
                <div className="flex justify-between gap-3">
                  <span>Paid</span>
                  <span className="font-medium text-slate-950">{documentView.balance_due.paid_label}</span>
                </div>
              ) : null}
              {documentView.balance_due.balance_label ? (
                <div className="flex justify-between gap-3">
                  <span>Balance Due</span>
                  <span className="font-semibold text-slate-950">{documentView.balance_due.balance_label}</span>
                </div>
              ) : null}
              {documentView.balance_due.overpayment_label ? (
                <div className="flex justify-between gap-3">
                  <span>Overpayment</span>
                  <span className="font-semibold text-slate-950">{documentView.balance_due.overpayment_label}</span>
                </div>
              ) : null}
            </div>
          </article>

          {documentView.copy_blocks.footer ? (
            <article className="rounded-[24px] border border-slate-200 p-5 text-sm text-slate-600">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Footer</p>
              <p className="mt-3 leading-6">{documentView.copy_blocks.footer}</p>
            </article>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
