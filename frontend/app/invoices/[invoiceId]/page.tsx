import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  LockKeyhole,
  Receipt,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
} from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";
import { MetricTile } from "@/components/board/metric-tile";
import DocumentApprovalActions from "@/components/document-approval-actions";
import DocumentPreview from "@/components/document-preview";
import InvoiceHeaderActions from "./invoice-header-actions";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerRoles } from "@/lib/auth/server-session";
import { formatLocalizedCurrency } from "@/lib/i18n/formatters";
import { type PersistedInvoiceLineItem } from "@/lib/crm/invoice-line-model";
import { canViewWarrantyCertificate } from "@/lib/crm/warranty-eligibility";
import type { JobStatus } from "@/lib/crm/statuses";

const SHOW_LEGACY_INVOICE_DETAIL = false;

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
  due_at?: string | null;
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
  organization?: {
    business_name: string | null;
    company_email: string | null;
  } | null;
};

type CollectionSignalTone = "default" | "warning" | "success";

type InvoiceCollectionSignal = {
  label: string;
  detail: string;
  tone: CollectionSignalTone;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatCurrency(cents: number, locale: string) {
  return formatLocalizedCurrency(cents / 100, locale as never, "USD");
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

function formatDate(value: string | null, locale: string) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatPaymentMethod(method: InvoicePaymentRecord["method"]) {
  if (method === "card_manual") {
    return "Card";
  }

  if (method === "bank_transfer") {
    return "Bank transfer";
  }

  return method.charAt(0).toUpperCase() + method.slice(1);
}

function percentPaid(totalCents: number, amountPaidCents: number) {
  if (!totalCents) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((amountPaidCents / totalCents) * 100)));
}

function isPastDue(dueAt: string | null | undefined, balanceCents: number) {
  if (!dueAt || balanceCents <= 0) {
    return false;
  }

  const due = new Date(dueAt);

  if (Number.isNaN(due.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function getInvoiceCollectionSignal(invoice: InvoiceDetailRecord, locale: string): InvoiceCollectionSignal {
  if (invoice.balance_cents <= 0 || invoice.lifecycle_status === "paid" || invoice.lifecycle_status === "overpaid") {
    return {
      label: "Closed out",
      detail: "Invoice balance is settled in the current ledger view.",
      tone: "success",
    };
  }

  if (isPastDue(invoice.due_at, invoice.balance_cents)) {
    return {
      label: "Follow up on open balance",
      detail: `Due ${formatDate(invoice.due_at ?? null, locale)}. ${formatCurrency(invoice.balance_cents, locale)} remains open.`,
      tone: "warning",
    };
  }

  if (invoice.lifecycle_status === "partial") {
    return {
      label: "Collect remaining balance",
      detail: `${formatCurrency(invoice.balance_cents, locale)} remains after ${formatCurrency(invoice.amount_paid_cents, locale)} collected.`,
      tone: "warning",
    };
  }

  return {
    label: "Invoice awaiting payment",
    detail: "No payment recorded yet against this invoice total.",
    tone: "default",
  };
}

function lifecycleCapsuleTone(status: InvoiceLifecycleStatus) {
  if (status === "paid" || status === "overpaid") {
    return "border-[color:var(--cmp-status-success-border)] bg-[color:var(--cmp-status-success-bg)] text-[color:var(--cmp-status-success-text)]";
  }

  if (status === "partial") {
    return "border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)] text-[color:var(--cmp-status-warning-text)]";
  }

  if (status === "refunded") {
    return "border-[color:var(--cmp-status-error-border)] bg-[color:var(--cmp-status-error-bg)] text-[color:var(--cmp-status-error-text)]";
  }

  return "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)]";
}

function collectionSignalToneClass(tone: CollectionSignalTone) {
  if (tone === "success") {
    return "border-[color:var(--cmp-status-success-border)] bg-[color:var(--cmp-status-success-bg)]/40 text-[color:var(--cmp-status-success-text)]";
  }

  if (tone === "warning") {
    return "border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)]/40 text-[color:var(--cmp-status-warning-text)]";
  }

  return "border-[color:var(--cmp-border-violet)] bg-violet-500/[0.08] text-violet-100";
}

function progressTone(status: InvoiceLifecycleStatus) {
  if (status === "paid" || status === "overpaid") {
    return "bg-gradient-to-r from-emerald-500 to-emerald-300";
  }

  if (status === "partial") {
    return "bg-gradient-to-r from-amber-500 to-amber-300";
  }

  return "bg-gradient-to-r from-indigo-500 to-indigo-300";
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const locale = await getLocale();
  const t = await getTranslations("invoiceDetailPage");

  const session = await requireServerRoles(`/invoices/${invoiceId}`, [
    "owner",
    "admin",
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
  const pastDue = isPastDue(invoice.due_at, invoice.balance_cents);
  const paidPercent = percentPaid(invoice.total_cents, invoice.amount_paid_cents);
  const collectionSignal = getInvoiceCollectionSignal(invoice, locale);
  const customerName = invoice.customer?.full_name ?? invoice.customer_name;
  const jobTitle = invoice.job?.title ?? invoice.job_title;
  const dueLabel = invoice.due_at ? formatDate(invoice.due_at, locale) : t("noDueDate");
  const dueHelper = !invoice.due_at
    ? t("noDueDate")
    : pastDue
      ? t("pastDueHelper")
      : invoice.balance_cents > 0
        ? t("outstandingHelper")
        : t("clearedHelper");

  const documentPreviewProps = {
    documentKind: "invoice" as const,
    documentNumber: invoice.document_number,
    description: invoice.description,
    primaryStatusLabel: "Status",
    primaryStatusValue: formatLifecycleStatus(invoice.lifecycle_status),
    issuedLabel: "Issued",
    issuedAt: invoice.issued_at,
    secondaryDateLabel: "Paid",
    secondaryDateValue: invoice.paid_at,
    customerName,
    customerCompanyName: invoice.customer?.company_name ?? null,
    customerEmail: invoice.customer?.email ?? null,
    customerPhone: invoice.customer?.phone ?? null,
    customerAddressLines: [
      invoice.customer?.service_address_line_1 ?? "",
      invoice.customer?.service_address_line_2 ?? "",
      [invoice.customer?.service_city, invoice.customer?.service_state_or_region].filter(Boolean).join(", ")
        + (invoice.customer?.service_postal_code ? ` ${invoice.customer.service_postal_code}` : ""),
    ]
      .map((line) => line.trim())
      .filter(Boolean),
    lineItems: invoice.line_items ?? [],
    subtotalCents: invoice.subtotal_cents ?? invoice.amount_cents,
    taxRateBpsSnapshot: invoice.tax_rate_bps_snapshot,
    taxCents: invoice.tax_cents ?? 0,
    totalCents: invoice.total_cents,
    compatibilityTotalLabel: "Stored Amount",
    compatibilityTotalCents: invoice.amount_cents,
  };

  const headerActionsProps = {
    invoiceId: invoice.id,
    initialInvoice: {
      id: invoice.id,
      invoice_id: invoice.invoice_id,
      document_number: invoice.document_number,
      total_cents: invoice.total_cents,
      issued_at: invoice.issued_at,
      due_at: invoice.due_at ?? null,
      signature_requested: invoice.signature_requested,
      customer: invoice.customer
        ? { full_name: invoice.customer.full_name, email: invoice.customer.email }
        : null,
    },
    businessName: invoice.organization?.business_name ?? null,
    organizationEmail: invoice.organization?.company_email ?? null,
    hasInvoiceLineItems: (invoice.line_items?.length ?? 0) > 0,
  };

  const approvalActionsProps = {
    documentKind: "invoice" as const,
    documentId: invoice.id,
    approvalRequestedAt: invoice.approval_requested_at ?? null,
    approvedAt: invoice.approved_at ?? null,
    signatureRequestedAt: invoice.signature_requested_at ?? null,
    signedAt: invoice.signed_at ?? null,
    signedByName: invoice.signed_by_name ?? null,
    isLocked: Boolean(invoice.is_locked),
    canOpenLockedDocument: ["owner", "admin", "office_admin"].includes(session.profile?.role ?? ""),
  };

  if (SHOW_LEGACY_INVOICE_DETAIL) {
    return (
      <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
        <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 print:max-w-none print:px-0 print:py-0">
          <section className="theme-surface-modal rounded-[36px] p-7 sm:p-8 print:rounded-none print:bg-transparent print:p-0 print:shadow-none">
            <div className="flex flex-wrap gap-3 print:hidden">
              <Link href="/invoices" className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm">
                <ArrowLeft className="h-4 w-4" />
                Back to invoices
              </Link>
              <Link href={`/jobs/${invoice.job_id}`} className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm">
                <Receipt className="h-4 w-4" />
                View job
              </Link>
            </div>
            <div className="mt-4 print:hidden">
              <InvoiceHeaderActions {...headerActionsProps} />
            </div>
            <div className="mt-6">
              <DocumentPreview {...documentPreviewProps} />
              <DocumentApprovalActions {...approvalActionsProps} />
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <BoardShell gridOpacity="subtle">
      <div className="mx-auto max-w-[1640px] px-5 py-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
        <header className="rounded-[36px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] backdrop-blur-xl print:hidden">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/invoices"
                  className="flex items-center gap-2 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-3 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:bg-[color:var(--cmp-surface-soft)] hover:text-[color:var(--sem-text-primary)]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("backToInvoices")}
                </Link>
                <span className={cx("rounded-full border px-3 py-1 text-xs font-semibold", lifecycleCapsuleTone(invoice.lifecycle_status))}>
                  {formatLifecycleStatus(invoice.lifecycle_status)}
                </span>
                {invoice.balance_cents > 0 ? (
                  <span className="rounded-full border border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)] px-3 py-1 text-xs font-semibold text-[color:var(--cmp-status-warning-text)]">
                    {t("balanceOpen")}
                  </span>
                ) : (
                  <span className="rounded-full border border-[color:var(--cmp-status-success-border)] bg-[color:var(--cmp-status-success-bg)] px-3 py-1 text-xs font-semibold text-[color:var(--cmp-status-success-text)]">
                    {t("balanceCleared")}
                  </span>
                )}
                {pastDue ? (
                  <span className="rounded-full border border-[color:var(--cmp-status-error-border)] bg-[color:var(--cmp-status-error-bg)] px-3 py-1 text-xs font-semibold text-[color:var(--cmp-status-error-text)]">
                    {t("pastDueHelper")}
                  </span>
                ) : null}
              </div>
              <p className="mt-5 text-xs uppercase tracking-[0.34em] text-[color:var(--sem-accent-primary)]">{t("executiveSuite")}</p>
              <h1 className="mt-3 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] md:text-5xl">
                #{invoice.document_number}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[color:var(--sem-text-secondary)]">
                {invoice.customer?.id ? (
                  <Link href={`/customers/${invoice.customer.id}`} className="flex items-center gap-2 font-medium text-[color:var(--sem-text-primary)] transition hover:text-[color:var(--sem-accent-primary)]">
                    <UserRound className="h-4 w-4" />
                    {customerName}
                  </Link>
                ) : (
                  <span className="flex items-center gap-2 text-[color:var(--sem-text-primary)]">
                    <UserRound className="h-4 w-4" />
                    {customerName}
                  </span>
                )}
                <span>·</span>
                {invoice.job_id ? (
                  <Link href={`/jobs/${invoice.job_id}`} className="transition hover:text-[color:var(--sem-accent-primary)]">
                    {jobTitle}
                  </Link>
                ) : (
                  <span>{jobTitle}</span>
                )}
                <span>·</span>
                <span>
                  {t("issued")} {formatDate(invoice.issued_at, locale)}
                </span>
              </div>
            </div>
            <InvoiceHeaderActions {...headerActionsProps} />
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4 print:hidden">
          <MetricTile icon={CircleDollarSign} label={t("total")} value={formatCurrency(invoice.total_cents, locale)} helper={t("totalHelper")} />
          <MetricTile icon={CheckCircle2} label={t("paid")} value={formatCurrency(invoice.amount_paid_cents, locale)} helper={t("paidHelper")} />
          <MetricTile
            icon={AlertTriangle}
            label={t("openBalance")}
            value={formatCurrency(invoice.balance_cents, locale)}
            helper={invoice.balance_cents > 0 ? t("openBalanceHelper") : t("openBalanceClearedHelper")}
          />
          <MetricTile
            icon={CalendarClock}
            label={t("dueDate")}
            value={dueLabel}
            helper={dueHelper}
          />
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
          <section className="relative print:col-span-full">
            <div
              aria-hidden="true"
              className="absolute -inset-5 rounded-[44px] bg-gradient-to-br from-indigo-500/10 via-emerald-500/10 to-violet-500/10 blur-2xl print:hidden"
            />
            <div className="relative overflow-hidden rounded-[38px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-4 shadow-[0_40px_120px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] print:rounded-none print:border-0 print:bg-transparent print:p-0 print:shadow-none">
              <DocumentPreview {...documentPreviewProps} />
            </div>
          </section>

          <aside className="space-y-5 print:hidden">
            <section className="rounded-[30px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">{t("cashLifecycle")}</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">
                    {t("percentPaid", { percent: paidPercent })}
                  </h3>
                </div>
                <WalletCards className="h-6 w-6 text-[color:var(--cmp-status-success-text)]" />
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-[color:var(--cmp-surface-panel)]">
                <div className={cx("h-full rounded-full", progressTone(invoice.lifecycle_status))} style={{ width: `${paidPercent}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[color:var(--cmp-status-success-border)] bg-[color:var(--cmp-status-success-bg)]/40 p-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--cmp-status-success-text)]/70">{t("collected")}</p>
                  <p className="mt-1 font-semibold text-[color:var(--cmp-status-success-text)]">{formatCurrency(invoice.amount_paid_cents, locale)}</p>
                </div>
                <div className="rounded-2xl border border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)]/40 p-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--cmp-status-warning-text)]/70">{t("open")}</p>
                  <p className="mt-1 font-semibold text-[color:var(--cmp-status-warning-text)]">{formatCurrency(invoice.balance_cents, locale)}</p>
                </div>
              </div>
            </section>

            <section className="rounded-[30px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)]">
              <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">{t("paymentLedger")}</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">{t("transactionHistory")}</h3>
              <div className="mt-5 space-y-3">
                {(invoice.payments ?? []).length ? (
                  invoice.payments?.map((payment) => (
                    <div key={payment.id} className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/80 p-4">
                      <div className="flex justify-between gap-3">
                        <span className="font-semibold text-[color:var(--sem-text-primary)]">
                          {formatPaymentMethod(payment.method)} · {payment.entry_type}
                        </span>
                        <span className="text-[color:var(--cmp-status-success-text)]">{formatCurrency(payment.amount_cents, locale)}</span>
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">
                        {formatDate(payment.occurred_at, locale)}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </p>
                      {payment.note ? <p className="mt-2 text-xs text-[color:var(--sem-text-secondary)]">{payment.note}</p> : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-[color:var(--cmp-border-subtle)] px-4 py-6 text-sm text-[color:var(--sem-text-secondary)]">
                    {t("noPayments")}
                  </div>
                )}
              </div>
            </section>

            {warrantyCertificateAvailable ? (
              <section className="rounded-[30px] border border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)]/30 p-5 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_40%,transparent)]">
                <div className="flex items-start gap-4">
                  <ShieldCheck className="mt-1 h-6 w-6 text-[color:var(--cmp-status-warning-text)]" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--cmp-status-warning-text)]/70">{t("warrantyStatus")}</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">{t("warrantyReady")}</h3>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{t("warrantyReadyBody")}</p>
                    <Link
                      href={`/invoices/${invoice.id}/warranty-certificate`}
                      className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--cmp-status-warning-text)] transition hover:brightness-110"
                    >
                      {t("openWarrantyCertificate")}
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-[30px] border border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)]/20 p-5 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_40%,transparent)]">
                <div className="flex items-start gap-4">
                  <LockKeyhole className="mt-1 h-6 w-6 text-[color:var(--cmp-status-warning-text)]" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--cmp-status-warning-text)]/70">{t("warrantyStatus")}</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">{t("warrantyLocked")}</h3>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{t("warrantyLockedBody")}</p>
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-[30px] border border-violet-400/20 bg-violet-500/[0.08] p-5 shadow-[0_24px_70px_rgba(109,40,217,0.12)]">
              <div className="flex items-start gap-4">
                <Sparkles className="mt-1 h-6 w-6 text-violet-200" />
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-violet-100/70">{t("aiCollectionDesk")}</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">{t("aiReadyTitle")}</h3>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{t("aiReadyBody")}</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{t("aiNoAutonomy")}</p>
                  <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">{t("aiStandby")}</p>
                  <div className={cx("mt-4 rounded-2xl border px-3 py-2", collectionSignalToneClass(collectionSignal.tone))}>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">{t("statusBased")}</span>
                    <p className="mt-1 text-sm font-semibold">{collectionSignal.label}</p>
                    <p className="mt-1 text-xs leading-5 opacity-80">{collectionSignal.detail}</p>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>

        <section className="mt-8 rounded-[30px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-2 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] print:hidden">
          <DocumentApprovalActions {...approvalActionsProps} />
        </section>
      </div>
    </BoardShell>
  );
}
