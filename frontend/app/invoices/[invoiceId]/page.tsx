import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Receipt, ShieldCheck } from "lucide-react";

import DocumentApprovalActions from "@/components/document-approval-actions";
import DocumentPreview from "@/components/document-preview";
import InvoiceHeaderActions from "./invoice-header-actions";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerRoles } from "@/lib/auth/server-session";
import {
  type PersistedInvoiceLineItem,
} from "@/lib/crm/invoice-line-model";
import type { JobStatus } from "@/lib/crm/statuses";

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


type InvoiceDetailRecord = {
  id: string;
  job_id: string;
  invoice_id: string;
  document_number: string;
  description: string;
  amount_cents: number;
  subtotal_cents?: number;
  tax_rate_bps_snapshot?: number;
  tax_cents?: number;
  total_cents: number;
  amount_paid_cents: number;
  refunded_cents?: number;
  balance_cents: number;
  lifecycle_status: InvoiceLifecycleStatus;
  status: "unpaid" | "paid";
  issued_at: string;
  paid_at: string | null;
  approval_requested_at?: string | null;
  approved_at?: string | null;
  signature_requested_at?: string | null;
  signature_requested?: boolean;
  signed_at?: string | null;
  signed_by_name?: string | null;
  is_locked?: boolean;
  line_items?: PersistedInvoiceLineItem[];
  payments?: InvoicePaymentRecord[];
  customer_name: string;
  job_title: string;
  job: {
    id: string;
    title: string;
    status: JobStatus;
    assigned_technician_id: string | null;
  } | null;
  customer: {
    id: string;
    full_name: string;
    company_name: string | null;
    email: string | null;
    phone: string;
    service_address_line_1: string;
    service_address_line_2: string | null;
    service_city: string;
    service_state_or_region: string | null;
    service_postal_code: string;
    notes: string | null;
  } | null;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatLifecycleStatus(status: InvoiceLifecycleStatus) {
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

function canViewWarrantyCertificate(invoice: InvoiceDetailRecord) {
  return Boolean(invoice.paid_at) || invoice.balance_cents <= 0;
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;

  const session = await requireServerRoles(`/invoices/${invoiceId}`, [
    "owner",
    "office_admin",
    "dispatcher",
    "technician",
  ]);

  let invoice: InvoiceDetailRecord | null = null;

  try {
    invoice = await serverApiFetch<InvoiceDetailRecord>(`/api/invoices/${invoiceId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The invoice could not be loaded.";

    if (message.toLowerCase().includes("could not be found")) {
      notFound();
    }

    throw error;
  }

  if (!invoice) {
    notFound();
  }

  const warrantyCertificateAvailable = canViewWarrantyCertificate(invoice);

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 print:max-w-none print:px-0 print:py-0">
        <section className="theme-surface-modal rounded-[36px] p-7 sm:p-8 print:rounded-none print:bg-transparent print:p-0 print:shadow-none">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/invoices"
              className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)] print:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to invoices
            </Link>
            <Link
              href={`/jobs/${invoice.job_id}`}
              className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)] print:hidden"
            >
              <Receipt className="h-4 w-4" />
              View job
            </Link>
            {warrantyCertificateAvailable ? (
              <Link
                href={`/invoices/${invoice.id}/warranty-certificate`}
                className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)] print:hidden"
              >
                <ShieldCheck className="h-4 w-4" />
                Warranty certificate
              </Link>
            ) : null}
          </div>

          <div className="mt-4 print:hidden">
            <InvoiceHeaderActions
              invoiceId={invoice.id}
              initialInvoice={{
                id: invoice.id,
                invoice_id: invoice.invoice_id,
                document_number: invoice.document_number,
                total_cents: invoice.total_cents,
                issued_at: invoice.issued_at,
                signature_requested: invoice.signature_requested,
                customer: invoice.customer
                  ? { full_name: invoice.customer.full_name, email: invoice.customer.email }
                  : null,
              }}
              organizationEmail={invoice.customer?.email ?? null}
              businessName={null}
              hasInvoiceLineItems={(invoice.line_items?.length ?? 0) > 0}
            />
          </div>

          <div className="mt-6">
            <DocumentPreview
              documentKind="invoice"
              documentNumber={invoice.document_number}
              description={invoice.description}
              primaryStatusLabel="Status"
              primaryStatusValue={formatLifecycleStatus(invoice.lifecycle_status)}
              issuedLabel="Issued"
              issuedAt={invoice.issued_at}
              secondaryDateLabel="Paid"
              secondaryDateValue={invoice.paid_at}
              customerName={invoice.customer?.full_name ?? invoice.customer_name}
              customerCompanyName={invoice.customer?.company_name ?? null}
              customerEmail={invoice.customer?.email ?? null}
              customerPhone={invoice.customer?.phone ?? null}
              customerAddressLines={[
                invoice.customer?.service_address_line_1 ?? "",
                invoice.customer?.service_address_line_2 ?? "",
                [invoice.customer?.service_city, invoice.customer?.service_state_or_region].filter(Boolean).join(", ")
                  + (invoice.customer?.service_postal_code ? ` ${invoice.customer.service_postal_code}` : ""),
              ].map((line) => line.trim()).filter(Boolean)}
              lineItems={invoice.line_items ?? []}
              subtotalCents={invoice.subtotal_cents ?? invoice.amount_cents}
              taxRateBpsSnapshot={invoice.tax_rate_bps_snapshot}
              taxCents={invoice.tax_cents ?? 0}
              totalCents={invoice.total_cents}
              compatibilityTotalLabel="Stored Amount"
              compatibilityTotalCents={invoice.amount_cents}
            />

            <DocumentApprovalActions
              documentKind="invoice"
              documentId={invoice.id}
              approvalRequestedAt={invoice.approval_requested_at ?? null}
              approvedAt={invoice.approved_at ?? null}
              signatureRequestedAt={invoice.signature_requested_at ?? null}
              signedAt={invoice.signed_at ?? null}
              signedByName={invoice.signed_by_name ?? null}
              isLocked={Boolean(invoice.is_locked)}
              canOpenLockedDocument={["owner", "admin", "office_admin"].includes(session.profile?.role ?? "")}
            />

            <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] print:hidden">
              <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Payment Ledger</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                    <p className="text-xs text-[color:var(--sem-text-muted)]">Paid to date</p>
                    <p className="mt-2 text-lg font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(invoice.amount_paid_cents)}</p>
                  </div>
                  <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                    <p className="text-xs text-[color:var(--sem-text-muted)]">Refunded</p>
                    <p className="mt-2 text-lg font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(invoice.refunded_cents ?? 0)}</p>
                  </div>
                  <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                    <p className="text-xs text-[color:var(--sem-text-muted)]">Balance due</p>
                    <p className="mt-2 text-lg font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(invoice.balance_cents)}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {(invoice.payments ?? []).length ? (
                    invoice.payments?.map((payment) => (
                      <div key={payment.id} className="flex items-start justify-between gap-4 rounded-[20px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-[color:var(--sem-text-primary)]">{payment.entry_type}</p>
                          <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">
                            {formatDate(payment.occurred_at)}
                            {payment.reference ? ` • ${payment.reference}` : ""}
                          </p>
                          {payment.note ? (
                            <p className="mt-2 text-xs text-[color:var(--sem-text-secondary)]">{payment.note}</p>
                          ) : null}
                        </div>
                        <span className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(payment.amount_cents)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[20px] border border-dashed border-[color:var(--cmp-border-subtle)] px-4 py-6 text-sm text-[color:var(--sem-text-secondary)]">
                      No payment ledger records exist yet for this invoice.
                    </div>
                  )}
                </div>
              </div>

              <aside className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Compatibility</p>
                <div className="mt-4 space-y-3 text-sm text-[color:var(--sem-text-secondary)]">
                  <div className="flex items-center justify-between gap-3">
                    <span>Legacy invoice status</span>
                    <span className="font-medium text-[color:var(--sem-text-primary)]">{invoice.status}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Derived lifecycle</span>
                    <span className="font-medium text-[color:var(--sem-text-primary)]">{formatLifecycleStatus(invoice.lifecycle_status)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Paid at</span>
                    <span className="font-medium text-[color:var(--sem-text-primary)]">{formatDate(invoice.paid_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Approved at</span>
                    <span className="font-medium text-[color:var(--sem-text-primary)]">{formatDate(invoice.approved_at ?? null)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Signed at</span>
                    <span className="font-medium text-[color:var(--sem-text-primary)]">{formatDate(invoice.signed_at ?? null)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Warranty certificate</span>
                    <span className="font-medium text-[color:var(--sem-text-primary)]">
                      {warrantyCertificateAvailable ? "Available" : "Blocked until paid"}
                    </span>
                  </div>
                </div>
              </aside>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
