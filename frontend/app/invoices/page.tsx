import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  Banknote,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
  WandSparkles,
} from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";
import { MetricTile } from "@/components/board/metric-tile";
import {
  MasterMobileList,
  MasterTable,
  MasterTablePagination,
  MasterTableRow,
  type MasterTableState,
} from "@/components/master-table";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerRoles } from "@/lib/auth/server-session";
import { formatLocalizedCurrency } from "@/lib/i18n/formatters";

const SHOW_LEGACY_INVOICES_INDEX = false;

type SearchParam = string | string[] | undefined;

type InvoiceLifecycleStatus = "sent" | "partial" | "paid" | "refunded" | "overpaid";
type PipelineFilter = "all" | "open" | "partial" | "paid" | "open-balances";
type CashSignalTone = "default" | "warning" | "success" | "error";

/** UI-only reference shape for a future backend payment intelligence payload. Not fetched in this slice. */
type InvoicePaymentInsight = {
  invoiceId: string;
  priority: "low" | "medium" | "high" | "urgent";
  label: string;
  summary: string;
  recommendedAction: "call" | "sms" | "email" | "wait" | "record_payment";
  confidence: number;
  generatedAt: string;
  source: "ai";
};

type InvoicePaymentAiReadyState = {
  mode: "standby" | "connected";
  insights: InvoicePaymentInsight[];
};

type InvoiceCashSignal = {
  label: string;
  detail: string;
  tone: CashSignalTone;
};

type InvoiceListItem = {
  id: string;
  job_id: string;
  document_number: string;
  total_cents: number;
  amount_paid_cents: number;
  refunded_cents?: number;
  balance_cents: number;
  lifecycle_status: InvoiceLifecycleStatus;
  status: "unpaid" | "paid";
  issued_at: string;
  customer_name: string;
  job_title: string;
};

type InvoiceCustomerListItem = {
  id: string;
  full_name: string;
};

type InvoicesPageContext = {
  searchParams: Promise<{
    page?: SearchParam;
    pageSize?: SearchParam;
    q?: SearchParam;
    lifecycleStatus?: SearchParam;
    pipeline?: SearchParam;
  }>;
};

const invoiceActionIconBaseClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)]";
const invoiceOpenIconClass = `${invoiceActionIconBaseClass} bg-amber-500 hover:bg-amber-600`;
const invoiceCustomerIconClass = `${invoiceActionIconBaseClass} bg-sky-600 hover:bg-sky-700`;
const invoiceJobIconClass = `${invoiceActionIconBaseClass} bg-orange-600 hover:bg-orange-700`;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function firstValue(value: SearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePipeline(value: string | undefined): PipelineFilter {
  if (value === "open" || value === "partial" || value === "paid" || value === "open-balances") {
    return value;
  }
  return "all";
}

function formatCurrency(cents: number, locale: string) {
  return formatLocalizedCurrency(cents / 100, locale as never, "USD");
}

function formatDate(value: string, locale: string) {
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

function invoiceStatusBadgeClass(status: InvoiceLifecycleStatus) {
  if (status === "paid" || status === "overpaid") {
    return "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }

  if (status === "partial" || status === "refunded") {
    return "theme-status-warning inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }

  return "theme-badge inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
}

function percentPaid(invoice: InvoiceListItem) {
  if (!invoice.total_cents) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((invoice.amount_paid_cents / invoice.total_cents) * 100)));
}

function progressTone(status: InvoiceLifecycleStatus) {
  if (status === "paid" || status === "overpaid") {
    return "bg-[color:var(--cmp-status-success-text)]";
  }

  if (status === "partial") {
    return "bg-[color:var(--cmp-status-warning-text)]";
  }

  return "bg-[color:var(--cmp-status-error-text)]";
}

function isFullyPaid(invoice: InvoiceListItem) {
  return invoice.lifecycle_status === "paid" || invoice.lifecycle_status === "overpaid";
}

function isUnpaidOpen(invoice: InvoiceListItem) {
  return invoice.balance_cents > 0 && invoice.lifecycle_status === "sent";
}

function canViewWarrantyCertificate(invoice: InvoiceListItem) {
  return invoice.balance_cents <= 0;
}

function getInvoicePaymentAiReadyState(insights: InvoicePaymentInsight[] = []): InvoicePaymentAiReadyState {
  if (insights.length > 0) {
    return { mode: "connected", insights };
  }

  return { mode: "standby", insights: [] };
}

function findInvoicePaymentInsight(invoiceId: string, insights: InvoicePaymentInsight[]) {
  return insights.find((insight) => insight.invoiceId === invoiceId) ?? null;
}

function getInvoiceCashSignal(invoice: InvoiceListItem, locale: string): InvoiceCashSignal {
  if (invoice.lifecycle_status === "refunded") {
    return {
      label: "Review refund status",
      detail: "Confirm whether this refunded invoice should stay closed in AR.",
      tone: "error",
    };
  }

  if (invoice.lifecycle_status === "overpaid") {
    return {
      label: "Review overpayment",
      detail: "Customer paid more than the invoice total. Confirm ledger handling.",
      tone: "warning",
    };
  }

  if (isFullyPaid(invoice) || invoice.balance_cents <= 0) {
    return {
      label: "Closed out",
      detail: "Invoice balance is settled in the current ledger view.",
      tone: "success",
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
    label: "Follow up on open invoice",
    detail: `Issued ${formatDate(invoice.issued_at, locale)}. No payment recorded yet.`,
    tone: "default",
  };
}

function cashSignalToneClass(tone: CashSignalTone) {
  if (tone === "success") {
    return "border-[color:var(--cmp-status-success-border)] bg-[color:var(--cmp-status-success-bg)] text-[color:var(--cmp-status-success-text)]";
  }
  if (tone === "warning") {
    return "border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)] text-[color:var(--cmp-status-warning-text)]";
  }
  if (tone === "error") {
    return "border-[color:var(--cmp-status-error-border)] bg-[color:var(--cmp-status-error-bg)] text-[color:var(--cmp-status-error-text)]";
  }
  return "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/80 text-[color:var(--sem-text-secondary)]";
}

function applyPipelineFilter(invoices: InvoiceListItem[], pipeline: PipelineFilter) {
  if (pipeline === "open") {
    return invoices.filter((invoice) => isUnpaidOpen(invoice));
  }

  if (pipeline === "partial") {
    return invoices.filter((invoice) => invoice.lifecycle_status === "partial");
  }

  if (pipeline === "paid") {
    return invoices.filter((invoice) => isFullyPaid(invoice));
  }

  if (pipeline === "open-balances") {
    return invoices.filter((invoice) => invoice.balance_cents > 0);
  }

  return invoices;
}

function buildOpenBalanceQueue(invoices: InvoiceListItem[]) {
  return invoices
    .filter((invoice) => invoice.balance_cents > 0)
    .sort((left, right) => {
      const leftTime = new Date(left.issued_at).getTime();
      const rightTime = new Date(right.issued_at).getTime();
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return right.balance_cents - left.balance_cents;
    })
    .slice(0, 3);
}

function deriveInvoiceMetrics(invoices: InvoiceListItem[]) {
  const outstandingCents = invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.balance_cents), 0);
  const partialInvoices = invoices.filter((invoice) => invoice.lifecycle_status === "partial");
  const depositsHeldCents = partialInvoices.reduce((sum, invoice) => sum + invoice.amount_paid_cents, 0);
  const paidInvoices = invoices.filter((invoice) => isFullyPaid(invoice));
  const paidValueCents = paidInvoices.reduce((sum, invoice) => sum + invoice.total_cents, 0);
  const openInvoices = invoices.filter((invoice) => invoice.balance_cents > 0);

  return {
    outstandingCents,
    depositsHeldCents,
    paidCount: paidInvoices.length,
    paidValueCents,
    openCount: openInvoices.length,
    openBalanceCents: outstandingCents,
  };
}

function buildQueryString(params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim()) {
      searchParams.set(key, value);
    }
  }

  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
}

function PaymentProgress({
  invoice,
  locale,
  collectedInFullLabel,
  remainingLabel,
}: {
  invoice: InvoiceListItem;
  locale: string;
  collectedInFullLabel: string;
  remainingLabel: string;
}) {
  const pct = percentPaid(invoice);

  return (
    <div className="min-w-[180px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[color:var(--sem-text-primary)]">
          {formatCurrency(invoice.amount_paid_cents, locale)} / {formatCurrency(invoice.total_cents, locale)}
        </span>
        <span className="text-xs text-[color:var(--sem-text-muted)]">{pct}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--cmp-surface-panel)]">
        <div className={cx("h-full rounded-full", progressTone(invoice.lifecycle_status))} style={{ width: `${pct}%` }} />
      </div>
      {invoice.balance_cents > 0 ? (
        <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">
          {remainingLabel}: {formatCurrency(invoice.balance_cents, locale)}
        </p>
      ) : (
        <p className="mt-2 text-xs text-[color:var(--cmp-status-success-text)]">{collectedInFullLabel}</p>
      )}
    </div>
  );
}

function InvoiceCashSignalCell({
  invoice,
  aiState,
  statusBasedLabel,
  locale,
}: {
  invoice: InvoiceListItem;
  aiState: InvoicePaymentAiReadyState;
  statusBasedLabel: string;
  locale: string;
}) {
  const aiInsight = aiState.mode === "connected" ? findInvoicePaymentInsight(invoice.id, aiState.insights) : null;

  if (aiInsight) {
    return (
      <div className="max-w-[310px] rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
          <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--sem-accent-primary)]">{aiInsight.label}</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-[color:var(--sem-text-secondary)]">{aiInsight.summary}</p>
      </div>
    );
  }

  const signal = getInvoiceCashSignal(invoice, locale);

  return (
    <div className={cx("max-w-[310px] rounded-2xl border px-3 py-2", cashSignalToneClass(signal.tone))}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">{statusBasedLabel}</span>
      <p className="mt-1 text-xs font-semibold">{signal.label}</p>
      <p className="mt-1 text-xs leading-5 opacity-80">{signal.detail}</p>
    </div>
  );
}

function PaymentAssistantPanel({
  invoices,
  aiState,
  customerHrefByName,
  locale,
  labels,
}: {
  invoices: InvoiceListItem[];
  aiState: InvoicePaymentAiReadyState;
  customerHrefByName: Map<string, string>;
  locale: string;
  labels: {
    title: string;
    readyTitle: string;
    readyBody: string;
    noAutonomy: string;
    standby: string;
    queueTitle: string;
    queueHelper: string;
    openInvoice: string;
    openCustomer: string;
    emptyQueue: string;
  };
}) {
  const queue = buildOpenBalanceQueue(invoices);

  return (
    <aside
      id="invoice-payment-assistant"
      className="rounded-[30px] border border-[color:var(--cmp-status-error-border)] bg-[color:var(--cmp-status-error-bg)]/30 p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)]"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--cmp-status-error-border)] bg-[color:var(--cmp-status-error-bg)] text-[color:var(--cmp-status-error-text)]">
          <WandSparkles className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--cmp-status-error-text)]">{labels.title}</p>
          <h3 className="mt-1 text-xl font-semibold text-[color:var(--sem-text-primary)]">{labels.readyTitle}</h3>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/60 p-4">
        <p className="text-sm leading-6 text-[color:var(--sem-text-secondary)]">{labels.readyBody}</p>
        <p className="mt-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{labels.noAutonomy}</p>
        {aiState.mode === "standby" ? (
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">{labels.standby}</p>
        ) : null}
      </div>

      <div className="mt-5">
        <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">{labels.queueTitle}</p>
        <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{labels.queueHelper}</p>
        <div className="mt-4 space-y-3">
          {queue.length === 0 ? (
            <div className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
              {labels.emptyQueue}
            </div>
          ) : (
            queue.map((invoice, index) => (
              <div key={invoice.id} className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Queue #{index + 1}</p>
                    <h4 className="mt-1 truncate font-semibold text-[color:var(--sem-text-primary)]">{invoice.document_number}</h4>
                    <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{invoice.customer_name}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--sem-text-muted)]">{invoice.job_title}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[color:var(--cmp-status-error-border)] bg-[color:var(--cmp-status-error-bg)] px-3 py-1 text-xs font-semibold text-[color:var(--cmp-status-error-text)]">
                    {formatCurrency(invoice.balance_cents, locale)}
                  </span>
                </div>
                <p className="mt-3 text-xs text-[color:var(--sem-text-muted)]">
                  Issued {formatDate(invoice.issued_at, locale)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/invoices/${invoice.id}`} className="theme-btn-secondary rounded-xl px-3 py-2 text-xs font-semibold">
                    {labels.openInvoice}
                  </Link>
                  <Link
                    href={customerHrefByName.get(invoice.customer_name.trim().toLowerCase()) ?? "/customers"}
                    className="theme-btn-secondary rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    {labels.openCustomer}
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

export default async function InvoicesPage({ searchParams }: InvoicesPageContext) {
  await requireServerRoles("/invoices", ["owner", "office_admin", "dispatcher", "technician"]);
  const locale = await getLocale();
  const t = await getTranslations("invoicesPage");

  const resolvedSearchParams = await searchParams;
  const pageValue = Number.parseInt((firstValue(resolvedSearchParams.page) ?? "1").trim(), 10);
  const pageSizeValue = Number.parseInt((firstValue(resolvedSearchParams.pageSize) ?? "10").trim(), 10);
  const query = (firstValue(resolvedSearchParams.q) ?? "").trim().toLowerCase();
  const lifecycleStatusRaw = (firstValue(resolvedSearchParams.lifecycleStatus) ?? "").trim();
  const lifecycleStatus =
    lifecycleStatusRaw === "sent" ||
    lifecycleStatusRaw === "partial" ||
    lifecycleStatusRaw === "paid" ||
    lifecycleStatusRaw === "refunded" ||
    lifecycleStatusRaw === "overpaid"
      ? lifecycleStatusRaw
      : "";
  const pipeline = parsePipeline((firstValue(resolvedSearchParams.pipeline) ?? "").trim().toLowerCase());
  const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const pageSize = Number.isFinite(pageSizeValue) && [10, 25, 50, 100].includes(pageSizeValue) ? pageSizeValue : 10;

  let invoices: InvoiceListItem[] = [];
  let loadError: string | null = null;
  let customerHrefByName = new Map<string, string>();

  try {
    const response = await serverApiFetch<InvoiceListItem[]>("/api/invoices");
    invoices = Array.isArray(response) ? response : [];

    if (!Array.isArray(response)) {
      loadError = t("listUnavailable");
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : t("listUnavailable");
  }

  try {
    const customers = await serverApiFetch<InvoiceCustomerListItem[]>("/api/customers");
    customerHrefByName = new Map(
      (Array.isArray(customers) ? customers : []).map((customer) => [
        customer.full_name.trim().toLowerCase(),
        `/customers/${customer.id}`,
      ]),
    );
  } catch {
    customerHrefByName = new Map();
  }

  const filteredInvoices = applyPipelineFilter(
    invoices.filter((invoice) => {
      if (lifecycleStatus && invoice.lifecycle_status !== lifecycleStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        invoice.document_number,
        invoice.customer_name,
        invoice.job_title,
        invoice.lifecycle_status,
        invoice.status,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    }),
    pipeline,
  );

  const aiState = getInvoicePaymentAiReadyState();
  const metrics = deriveInvoiceMetrics(filteredInvoices);
  const totalCount = filteredInvoices.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedInvoices = filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function listQuery(overrides: Record<string, string | null | undefined> = {}) {
    return buildQueryString({
      q: query || null,
      pageSize: String(pageSize),
      pipeline: pipeline === "all" ? null : pipeline,
      lifecycleStatus: lifecycleStatus || null,
      ...overrides,
    });
  }

  const previousPageHref = listQuery({ page: currentPage > 1 ? String(currentPage - 1) : null });
  const nextPageHref = listQuery({ page: currentPage < totalPages ? String(currentPage + 1) : null });

  const tableState: MasterTableState = loadError
    ? { status: "error", message: t("listUnavailable") }
    : totalCount === 0
      ? { status: "empty", message: t("noInvoices") }
      : { status: "ready" };

  const pipelineFilters: Array<{ key: PipelineFilter; label: string }> = [
    { key: "all", label: t("segmentAll") },
    { key: "open", label: t("segmentOpen") },
    { key: "partial", label: t("segmentPartial") },
    { key: "paid", label: t("segmentPaid") },
    { key: "open-balances", label: t("segmentOpenBalances") },
  ];

  const assistantLabels = {
    title: t("paymentAssistant"),
    readyTitle: t("paymentReadyTitle"),
    readyBody: t("paymentReadyBody"),
    noAutonomy: t("paymentNoAutonomy"),
    standby: t("paymentStandby"),
    queueTitle: t("openBalanceQueue"),
    queueHelper: t("openBalanceQueueHelper"),
    openInvoice: t("openInvoice"),
    openCustomer: t("openCustomer"),
    emptyQueue: t("emptyQueue"),
  };

  function renderInvoiceActions(invoice: InvoiceListItem) {
    const customerHref = customerHrefByName.get(invoice.customer_name.trim().toLowerCase()) ?? "/customers";

    return (
      <div className="flex items-center justify-end gap-2 opacity-85 transition group-hover:opacity-100">
        <Link
          href={`/invoices/${invoice.id}`}
          title={t("openInvoice")}
          aria-label={t("openInvoice")}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-accent)] hover:text-[color:var(--sem-accent-primary)]"
        >
          <Receipt className="h-4 w-4" />
        </Link>
        <Link
          href={customerHref}
          title={t("openCustomer")}
          aria-label={t("openCustomer")}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-accent)] hover:text-[color:var(--sem-accent-primary)]"
        >
          <UserRound className="h-4 w-4" />
        </Link>
        {invoice.job_id ? (
          <Link
            href={`/jobs/${invoice.job_id}`}
            title={t("openJob")}
            aria-label={t("openJob")}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-accent)] hover:text-[color:var(--sem-accent-primary)]"
          >
            <Briefcase className="h-4 w-4" />
          </Link>
        ) : null}
        <Link
          href={`/api/invoices/${invoice.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          title={t("downloadPdf")}
          aria-label={t("downloadPdf")}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-accent)] hover:text-[color:var(--sem-accent-primary)]"
        >
          <Download className="h-4 w-4" />
        </Link>
        {canViewWarrantyCertificate(invoice) ? (
          <Link
            href={`/invoices/${invoice.id}/warranty-certificate`}
            title={t("warrantyCertificate")}
            aria-label={t("warrantyCertificate")}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)] text-[color:var(--cmp-status-warning-text)] transition hover:brightness-110"
          >
            <ShieldCheck className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    );
  }

  function renderInvoiceTableRow(invoice: InvoiceListItem) {
    return (
      <tr key={invoice.id} className="group border-b border-[color:var(--cmp-border-subtle)] transition hover:bg-[color:var(--cmp-surface-soft)]">
        <td className="py-4 pl-5 pr-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
              <Receipt className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-[color:var(--sem-text-primary)]">{invoice.document_number}</p>
              <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">
                {t("issued")} {formatDate(invoice.issued_at, locale)}
              </p>
            </div>
          </div>
        </td>
        <td className="px-4 py-4">
          <p className="font-medium text-[color:var(--sem-text-primary)]">{invoice.customer_name}</p>
          <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{invoice.job_title}</p>
        </td>
        <td className="px-4 py-4">
          <p className="text-lg font-semibold tracking-tight text-[color:var(--sem-text-primary)]">{formatCurrency(invoice.total_cents, locale)}</p>
          <span className={cx("mt-2 inline-flex", invoiceStatusBadgeClass(invoice.lifecycle_status))}>
            {formatLifecycleStatus(invoice.lifecycle_status)}
          </span>
        </td>
        <td className="px-4 py-4">
          <PaymentProgress
            invoice={invoice}
            locale={locale}
            collectedInFullLabel={t("collectedInFull")}
            remainingLabel={t("remaining")}
          />
        </td>
        <td className="px-4 py-4">
          <InvoiceCashSignalCell invoice={invoice} aiState={aiState} statusBasedLabel={t("statusBased")} locale={locale} />
        </td>
        <td className="py-4 pl-4 pr-5">{renderInvoiceActions(invoice)}</td>
      </tr>
    );
  }

  function renderInvoiceMobileCard(invoice: InvoiceListItem) {
    const customerHref = customerHrefByName.get(invoice.customer_name.trim().toLowerCase()) ?? "/customers";

    return (
      <article key={invoice.id} className="rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/80 p-4 shadow-[0_20px_60px_color-mix(in_srgb,var(--sem-board-glow)_22%,transparent)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[color:var(--sem-text-muted)]">
              {invoice.document_number} · {t("issued")} {formatDate(invoice.issued_at, locale)}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-[color:var(--sem-text-primary)]">{invoice.customer_name}</h3>
            <p className="text-sm text-[color:var(--sem-text-secondary)]">{invoice.job_title}</p>
          </div>
          <span className={invoiceStatusBadgeClass(invoice.lifecycle_status)}>{formatLifecycleStatus(invoice.lifecycle_status)}</span>
        </div>

        <p className="mt-3 text-2xl font-semibold tracking-tight text-[color:var(--sem-text-primary)]">{formatCurrency(invoice.total_cents, locale)}</p>

        <div className="mt-4 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/40 p-3">
          <PaymentProgress
            invoice={invoice}
            locale={locale}
            collectedInFullLabel={t("collectedInFull")}
            remainingLabel={t("remaining")}
          />
        </div>

        <div className="mt-4">
          <InvoiceCashSignalCell invoice={invoice} aiState={aiState} statusBasedLabel={t("statusBased")} locale={locale} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Link href={`/invoices/${invoice.id}`} className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 px-3 py-2 text-center text-sm font-medium text-[color:var(--sem-text-secondary)]">
            {t("openInvoice")}
          </Link>
          <Link href={customerHref} className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 px-3 py-2 text-center text-sm font-medium text-[color:var(--sem-text-secondary)]">
            {t("openCustomer")}
          </Link>
          {invoice.job_id ? (
            <Link href={`/jobs/${invoice.job_id}`} className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 px-3 py-2 text-center text-sm font-medium text-[color:var(--sem-text-secondary)]">
              {t("openJob")}
            </Link>
          ) : null}
          <Link
            href={`/api/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 px-3 py-2 text-center text-sm font-medium text-[color:var(--sem-text-secondary)]"
          >
            {t("downloadPdf")}
          </Link>
          {canViewWarrantyCertificate(invoice) ? (
            <Link
              href={`/invoices/${invoice.id}/warranty-certificate`}
              className="rounded-2xl border border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)] px-3 py-2 text-center text-sm font-semibold text-[color:var(--cmp-status-warning-text)]"
            >
              {t("warrantyCertificate")}
            </Link>
          ) : null}
        </div>
      </article>
    );
  }

  if (SHOW_LEGACY_INVOICES_INDEX) {
    const paidCount = filteredInvoices.filter((invoice) => invoice.status === "paid").length;

    return (
      <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
        <div className="relative mx-auto max-w-[88rem] px-6 py-14 lg:px-10">
          <section className="theme-surface-modal rounded-[40px] border border-[color:var(--cmp-border-subtle)] p-7">
            <h1 className="font-[family:var(--font-flat-display)] text-4xl tracking-tight">Invoices</h1>
            <form className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.62fr)_auto]" method="GET">
              <input name="q" defaultValue={query} placeholder="Invoice #, customer, or job" className="theme-input-control rounded-[18px] px-4 py-3 text-sm" />
              <select name="lifecycleStatus" defaultValue={lifecycleStatus} className="theme-input-control rounded-[18px] px-4 py-3 text-sm">
                <option value="">{t("allLifecycles")}</option>
                <option value="sent">Sent</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
                <option value="refunded">Refunded</option>
                <option value="overpaid">Overpaid</option>
              </select>
              <select name="pageSize" defaultValue={String(pageSize)} className="theme-input-control rounded-[18px] px-4 py-3 text-sm">
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <button type="submit" className="theme-btn-secondary rounded-[18px] px-5 py-3 text-sm">{t("applyFilters")}</button>
            </form>
            {loadError ? <div className="theme-alert-error mt-6 rounded-[22px] border px-5 py-4 text-sm">{loadError}</div> : null}
            <div className="mt-6">
              <MasterTable
                columns={[
                  { key: "actions", label: "Actions", align: "center" },
                  { key: "customer", label: "Customer Name", align: "center" },
                  { key: "invoice", label: "Invoice #", align: "center" },
                  { key: "status", label: "Status", align: "center" },
                  { key: "total", label: "Total", align: "center" },
                  { key: "balance", label: "Balance", align: "center" },
                  { key: "issued", label: "Issue Date", align: "center" },
                ]}
                state={tableState}
              >
                {pagedInvoices.map((invoice) => (
                  <MasterTableRow key={invoice.id}>
                    <td className="master-table-cell master-table-actions-cell align-middle">
                      <div className="inline-flex items-center justify-center gap-2">
                        <Link href={`/invoices/${invoice.id}`} className={invoiceOpenIconClass}><Receipt className="h-[0.8rem] w-[0.8rem]" /></Link>
                        <Link href={customerHrefByName.get(invoice.customer_name.trim().toLowerCase()) ?? "/customers"} className={invoiceCustomerIconClass}><UserRound className="h-[0.8rem] w-[0.8rem]" /></Link>
                        {invoice.job_id ? <Link href={`/jobs/${invoice.job_id}`} className={invoiceJobIconClass}><Briefcase className="h-[0.8rem] w-[0.8rem]" /></Link> : null}
                      </div>
                    </td>
                    <td className="master-table-cell text-center">{invoice.customer_name}</td>
                    <td className="master-table-cell text-center">{invoice.document_number}</td>
                    <td className="master-table-cell text-center"><span className={invoiceStatusBadgeClass(invoice.lifecycle_status)}>{formatLifecycleStatus(invoice.lifecycle_status)}</span></td>
                    <td className="master-table-cell text-center">{formatCurrency(invoice.total_cents, locale)}</td>
                    <td className="master-table-cell text-center">{formatCurrency(invoice.balance_cents, locale)}</td>
                    <td className="master-table-cell text-center">{formatDate(invoice.issued_at, locale)}</td>
                  </MasterTableRow>
                ))}
              </MasterTable>
            </div>
            <div className="mt-6">
              <MasterTablePagination page={currentPage} pageSize={pageSize} totalCount={totalCount} totalPages={totalPages} previousHref={previousPageHref} nextHref={nextPageHref} />
            </div>
            {paidCount ? <p className="mt-4 text-xs text-[color:var(--sem-text-muted)]">{paidCount} invoices are already marked paid.</p> : null}
          </section>
        </div>
      </main>
    );
  }

  return (
    <BoardShell gridOpacity="subtle">
      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8">
        <header className="rounded-[34px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
                  <WalletCards className="h-5 w-5" />
                </span>
                <p className="text-xs uppercase tracking-[0.34em] text-[color:var(--sem-accent-primary)]">{t("cashEngine")}</p>
              </div>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] md:text-5xl">
                {t("title")}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">{t("description")}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="#invoice-payment-assistant"
                className="flex items-center gap-2 rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] px-4 py-3 text-sm font-semibold text-[color:var(--sem-accent-primary)] shadow-[0_0_35px_color-mix(in_srgb,var(--sem-accent-primary)_14%,transparent)] transition hover:bg-[color:var(--cmp-surface-soft)]"
              >
                <Sparkles className="h-4 w-4" />
                {t("paymentAssistant")}
              </Link>
              <Link href="/invoices/new" className="theme-btn-primary flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
                <Plus className="h-4 w-4" />
                {t("newInvoice")}
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile icon={AlertTriangle} label={t("totalOutstanding")} value={formatCurrency(metrics.outstandingCents, locale)} helper={t("totalOutstandingHelper")} />
          <MetricTile icon={Banknote} label={t("depositsHeld")} value={formatCurrency(metrics.depositsHeldCents, locale)} helper={t("depositsHeldHelper")} />
          <MetricTile icon={CheckCircle2} label={t("paidInvoices")} value={formatCurrency(metrics.paidValueCents, locale)} helper={t("paidInvoicesHelper")} />
          <MetricTile
            icon={Clock3}
            label={t("openInvoices")}
            value={`${metrics.openCount} · ${formatCurrency(metrics.openBalanceCents, locale)}`}
            helper={t("openInvoicesHelper")}
          />
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="rounded-[34px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 border-b border-[color:var(--cmp-border-subtle)] pb-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--sem-text-muted)]">{t("commandBar")}</p>
                <h2 className="mt-2 font-[family:var(--font-flat-display)] text-2xl tracking-tight text-[color:var(--sem-display-headline)]">{t("controlCenter")}</h2>
              </div>

              <form className="flex min-w-0 flex-1 flex-col gap-3 xl:max-w-2xl xl:flex-row" method="GET">
                {pipeline !== "all" ? <input type="hidden" name="pipeline" value={pipeline} /> : null}
                <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3 text-sm">
                  <Search className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
                  <input
                    name="q"
                    defaultValue={query}
                    placeholder={t("searchPlaceholder")}
                    className="min-w-0 flex-1 bg-transparent text-[color:var(--sem-text-primary)] outline-none placeholder:text-[color:var(--sem-text-muted)]"
                  />
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3 text-sm">
                  <span className="shrink-0 text-[color:var(--sem-text-muted)]">{t("lifecycle")}</span>
                  <select name="lifecycleStatus" defaultValue={lifecycleStatus} className="bg-transparent text-[color:var(--sem-text-primary)] outline-none">
                    <option value="">{t("allLifecycles")}</option>
                    <option value="sent">Sent</option>
                    <option value="partial">Partial</option>
                    <option value="paid">Paid</option>
                    <option value="refunded">Refunded</option>
                    <option value="overpaid">Overpaid</option>
                  </select>
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3 text-sm">
                  <span className="shrink-0 text-[color:var(--sem-text-muted)]">{t("pageSize")}</span>
                  <select name="pageSize" defaultValue={String(pageSize)} className="bg-transparent text-[color:var(--sem-text-primary)] outline-none">
                    {[10, 25, 50, 100].map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="theme-btn-primary rounded-2xl px-4 py-3 text-sm font-semibold">{t("applyFilters")}</button>
              </form>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {pipelineFilters.map((filter) => (
                <Link
                  key={filter.key}
                  href={listQuery({ pipeline: filter.key === "all" ? null : filter.key, page: null })}
                  className={cx(
                    "rounded-full border px-4 py-2 text-sm font-medium transition",
                    pipeline === filter.key
                      ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-selected-surface)] text-[color:var(--sem-accent-primary)] shadow-[0_0_24px_color-mix(in_srgb,var(--sem-accent-primary)_15%,transparent)]"
                      : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] hover:bg-[color:var(--cmp-surface-soft)] hover:text-[color:var(--sem-text-primary)]",
                  )}
                >
                  {filter.label}
                </Link>
              ))}
            </div>

            {loadError ? <div className="theme-alert-error mt-6 rounded-[20px] border px-4 py-3 text-sm">{loadError}</div> : null}

            {totalCount > 0 ? (
              <>
                <div className="mt-6 hidden overflow-hidden rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/30 2xl:block">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">
                      <tr>
                        <th className="py-4 pl-5 pr-4 font-medium">Invoice</th>
                        <th className="px-4 py-4 font-medium">Customer</th>
                        <th className="px-4 py-4 font-medium">Total</th>
                        <th className="px-4 py-4 font-medium">{t("paymentStatus")}</th>
                        <th className="px-4 py-4 font-medium">{t("cashSignal")}</th>
                        <th className="py-4 pl-4 pr-5 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>{pagedInvoices.map((invoice) => renderInvoiceTableRow(invoice))}</tbody>
                  </table>
                </div>

                <div className="mt-6 grid gap-4 2xl:hidden">
                  <MasterMobileList items={pagedInvoices} emptyState={t("noInvoices")} renderItem={renderInvoiceMobileCard} />
                </div>
              </>
            ) : loadError ? null : (
              <div className="theme-surface-card mt-6 rounded-[28px] border border-dashed border-[color:var(--cmp-border-subtle)] px-6 py-10 text-center text-sm text-[color:var(--sem-text-secondary)]">
                {t("emptyWorkspace")}
              </div>
            )}

            <div className="mt-5 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/40 px-4 py-3">
              <MasterTablePagination
                page={currentPage}
                pageSize={pageSize}
                totalCount={totalCount}
                totalPages={totalPages}
                previousHref={previousPageHref}
                nextHref={nextPageHref}
              />
            </div>
          </section>

          <PaymentAssistantPanel
            invoices={filteredInvoices}
            aiState={aiState}
            customerHrefByName={customerHrefByName}
            locale={locale}
            labels={assistantLabels}
          />
        </div>
      </div>
    </BoardShell>
  );
}
