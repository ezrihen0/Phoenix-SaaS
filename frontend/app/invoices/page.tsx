import Link from "next/link";
import { ArrowRight, Briefcase, Receipt, UserRound } from "lucide-react";

import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerRoles } from "@/lib/auth/server-session";
import {
  MasterMobileList,
  MasterTable,
  MasterTablePagination,
  MasterTableRow,
  type MasterTableState,
} from "@/components/master-table";

type SearchParam = string | string[] | undefined;

type InvoicesPageContext = {
  searchParams: Promise<{
    page?: SearchParam;
    pageSize?: SearchParam;
    q?: SearchParam;
    lifecycleStatus?: SearchParam;
  }>;
};

type InvoiceListItem = {
  id: string;
  job_id: string;
  document_number: string;
  total_cents: number;
  amount_paid_cents: number;
  refunded_cents?: number;
  balance_cents: number;
  lifecycle_status: "sent" | "partial" | "paid" | "refunded" | "overpaid";
  status: "unpaid" | "paid";
  issued_at: string;
  customer_name: string;
  job_title: string;
};

type InvoiceCustomerListItem = {
  id: string;
  full_name: string;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(value: string) {
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

function formatLifecycleStatus(status: InvoiceListItem["lifecycle_status"]) {
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

function invoiceStatusBadgeClass(status: InvoiceListItem["lifecycle_status"]) {
  if (status === "paid" || status === "overpaid") {
    return "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }

  if (status === "partial" || status === "refunded") {
    return "theme-status-warning inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }

  return "theme-badge inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
}

const invoiceActionIconBaseClass = "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)]";
const invoiceOpenIconClass = `${invoiceActionIconBaseClass} bg-amber-500 hover:bg-amber-600`;
const invoiceCustomerIconClass = `${invoiceActionIconBaseClass} bg-sky-600 hover:bg-sky-700`;
const invoiceJobIconClass = `${invoiceActionIconBaseClass} bg-orange-600 hover:bg-orange-700`;

function firstValue(value: SearchParam) {
  return Array.isArray(value) ? value[0] : value;
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

export default async function InvoicesPage({ searchParams }: InvoicesPageContext) {
  await requireServerRoles("/invoices", ["owner", "office_admin", "dispatcher", "technician"]);
  const resolvedSearchParams = await searchParams;
  const pageValue = Number.parseInt((firstValue(resolvedSearchParams.page) ?? "1").trim(), 10);
  const pageSizeValue = Number.parseInt((firstValue(resolvedSearchParams.pageSize) ?? "10").trim(), 10);
  const query = (firstValue(resolvedSearchParams.q) ?? "").trim().toLowerCase();
  const lifecycleStatus = (firstValue(resolvedSearchParams.lifecycleStatus) ?? "").trim();
  const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const pageSize = Number.isFinite(pageSizeValue) && [10, 25, 50, 100].includes(pageSizeValue) ? pageSizeValue : 10;

  let invoices: InvoiceListItem[] = [];
  let loadError: string | null = null;
  let customerHrefByName = new Map<string, string>();

  try {
    const response = await serverApiFetch<InvoiceListItem[]>("/api/invoices");
    invoices = Array.isArray(response) ? response : [];

    if (!Array.isArray(response)) {
      loadError = "The invoice list response was invalid.";
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The invoice list could not be loaded.";
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

  const filteredInvoices = invoices.filter((invoice) => {
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
    ].join(" ").toLowerCase();

    return haystack.includes(query);
  });

  const totalCount = filteredInvoices.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedInvoices = filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const previousPageHref = buildQueryString({
    page: String(Math.max(1, currentPage - 1)),
    pageSize: String(pageSize),
    q: query || null,
    lifecycleStatus: lifecycleStatus || null,
  });
  const nextPageHref = buildQueryString({
    page: String(Math.min(totalPages, currentPage + 1)),
    pageSize: String(pageSize),
    q: query || null,
    lifecycleStatus: lifecycleStatus || null,
  });

  const tableState: MasterTableState = loadError
    ? { status: "error", message: "Invoice list unavailable." }
    : totalCount === 0
      ? { status: "empty", message: "No invoices are available yet. Create an invoice from a job to populate this workspace." }
      : { status: "ready" };

  const paidCount = filteredInvoices.filter((invoice) => invoice.status === "paid").length;
  const openCount = filteredInvoices.length - paidCount;
  const openBalanceCents = filteredInvoices.reduce((sum, invoice) => sum + invoice.balance_cents, 0);

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_48%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_36%)]"
        />
        <div
          aria-hidden="true"
          className="absolute left-[-6rem] top-24 h-56 w-56 rounded-full bg-[color:var(--sem-accent-primary)]/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute right-[-3rem] top-14 h-64 w-64 rounded-full bg-[color:var(--sem-accent-primary)]/8 blur-3xl"
        />

        <div className="relative mx-auto max-w-[88rem] px-6 py-14 lg:px-10">
          <section className="theme-surface-modal relative overflow-hidden rounded-[40px] border border-[color:var(--cmp-border-subtle)] p-7 shadow-[0_32px_90px_rgba(15,23,42,0.08)] sm:p-8 lg:p-10">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(245,158,11,0.45),transparent)]"
            />

            <div className="relative space-y-10">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl">
                  <div className="inline-flex items-center gap-3 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/85 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)] backdrop-blur">
                    <span className="h-2 w-2 rounded-full bg-[color:var(--sem-accent-primary)]" />
                    Finance workspace
                  </div>
                  <h1 className="mt-6 font-[family:var(--font-flat-display)] text-4xl leading-[0.95] tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl lg:text-6xl">
                    Invoices
                  </h1>
                  <p className="mt-5 max-w-2xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                    Review issued invoices, track open balances, and move directly into the invoice workspace without leaving the finance lane.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3 text-xs text-[color:var(--sem-text-secondary)]">
                    <div className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2">
                      <span className="font-medium text-[color:var(--sem-text-primary)]">{totalCount}</span>
                      records in view
                    </div>
                    <div className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2">
                      <span className="font-medium text-[color:var(--sem-text-primary)]">{paidCount}</span>
                      already settled
                    </div>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-3 xl:max-w-sm xl:items-end">
                  <div className="theme-surface-card w-full rounded-[24px] border border-[color:var(--cmp-border-subtle)] px-5 py-4 text-sm text-[color:var(--sem-text-secondary)] xl:max-w-sm">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Primary action</p>
                    <p className="mt-2 leading-6">
                      New invoices still originate from the linked job workspace so billing stays attached to the correct service record.
                    </p>
                  </div>
                  <Link
                    href="/jobs"
                    className="theme-btn-secondary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)] xl:self-end"
                  >
                    Create from job
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="theme-surface-card relative overflow-hidden rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5 sm:p-6">
                  <div
                    aria-hidden="true"
                    className="absolute right-[-2rem] top-[-2rem] h-24 w-24 rounded-full bg-[color:var(--sem-accent-primary)]/10 blur-2xl"
                  />
                  <div className="relative">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Total invoices</p>
                      <div className="rounded-full border border-[color:var(--cmp-border-subtle)] p-2 text-[color:var(--sem-accent-primary)]">
                        <Receipt className="h-4 w-4" />
                      </div>
                    </div>
                    <p className="mt-5 text-4xl font-semibold leading-none text-[color:var(--sem-text-primary)]">{invoices.length}</p>
                    <p className="mt-3 text-sm text-[color:var(--sem-text-secondary)]">Full invoice ledger currently visible in this workspace.</p>
                  </div>
                </div>

                <div className="theme-surface-card relative overflow-hidden rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5 sm:p-6">
                  <div
                    aria-hidden="true"
                    className="absolute left-[-1rem] top-[-2rem] h-24 w-24 rounded-full bg-[color:var(--sem-accent-primary)]/10 blur-2xl"
                  />
                  <div className="relative">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Open invoices</p>
                      <div className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-accent-primary)]">
                        Action
                      </div>
                    </div>
                    <p className="mt-5 text-4xl font-semibold leading-none text-[color:var(--sem-text-primary)]">{openCount}</p>
                    <p className="mt-3 text-sm text-[color:var(--sem-text-secondary)]">Invoices still awaiting settlement or follow-up.</p>
                  </div>
                </div>

                <div className="theme-surface-card relative overflow-hidden rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5 sm:p-6">
                  <div
                    aria-hidden="true"
                    className="absolute bottom-[-2rem] right-[-1rem] h-24 w-24 rounded-full bg-[color:var(--sem-accent-primary)]/10 blur-2xl"
                  />
                  <div className="relative">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Open balance</p>
                      <div className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-secondary)]">
                        Outstanding
                      </div>
                    </div>
                    <p className="mt-5 text-4xl font-semibold leading-none text-[color:var(--sem-text-primary)]">
                      {formatCurrency(openBalanceCents)}
                    </p>
                    <p className="mt-3 text-sm text-[color:var(--sem-text-secondary)]">Current unpaid total across all invoice records.</p>
                  </div>
                </div>
              </div>

              {loadError ? (
                <div className="theme-alert-error rounded-[24px] border px-5 py-4 text-sm shadow-sm">
                  {loadError}
                </div>
              ) : null}

              <section className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">AR desk filters</p>
                <form className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.62fr)_auto]" method="GET">
                  <label className="space-y-2">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">Search</span>
                    <input
                      name="q"
                      defaultValue={query}
                      placeholder="Invoice #, customer, or job"
                      className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm outline-none"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">Lifecycle</span>
                    <select name="lifecycleStatus" defaultValue={lifecycleStatus} className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm outline-none">
                      <option value="">All lifecycles</option>
                      <option value="sent">Sent</option>
                      <option value="partial">Partial</option>
                      <option value="paid">Paid</option>
                      <option value="refunded">Refunded</option>
                      <option value="overpaid">Overpaid</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">Page size</span>
                    <select name="pageSize" defaultValue={String(pageSize)} className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm outline-none">
                      {[10, 25, 50, 100].map((size) => (
                        <option key={size} value={size}>{size} per page</option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-end">
                    <button type="submit" className="theme-btn-secondary inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm">
                      Apply
                    </button>
                  </div>
                </form>
              </section>

              {totalCount ? (
                <div className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/96 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.05)] sm:p-5">
                  <style
                    dangerouslySetInnerHTML={{
                      __html: `
                        .invoice-display-panel { display: none; }
                        .invoice-display-chip {
                          border-color: transparent;
                          color: var(--sem-text-secondary);
                        }
                        .invoice-display-chip:hover {
                          color: var(--sem-text-primary);
                        }
                        #invoice-display-ledger:checked ~ .invoice-display-toolbar label[for="invoice-display-ledger"],
                        #invoice-display-hybrid:checked ~ .invoice-display-toolbar label[for="invoice-display-hybrid"],
                        #invoice-display-grid:checked ~ .invoice-display-toolbar label[for="invoice-display-grid"] {
                          border-color: var(--cmp-border-subtle);
                          background: var(--cmp-surface-card);
                          color: var(--sem-text-primary);
                          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
                        }
                        #invoice-display-ledger:checked ~ .invoice-display-panels .invoice-display-panel-ledger,
                        #invoice-display-hybrid:checked ~ .invoice-display-panels .invoice-display-panel-hybrid,
                        #invoice-display-grid:checked ~ .invoice-display-panels .invoice-display-panel-grid {
                          display: block;
                        }
                        .invoice-display-panel-ledger .master-table {
                          table-layout: fixed;
                        }
                        .invoice-display-panel-ledger .master-table-header-cell,
                        .invoice-display-panel-ledger .master-table-cell {
                          border-right: 1px solid var(--cmp-border-subtle);
                          vertical-align: middle;
                        }
                        .invoice-display-panel-ledger .master-table-header-cell:nth-child(1),
                        .invoice-display-panel-ledger .master-table-cell:nth-child(1) {
                          width: 11rem;
                          text-align: center;
                        }
                        .invoice-display-panel-ledger .master-table-header-cell:nth-child(2),
                        .invoice-display-panel-ledger .master-table-cell:nth-child(2) {
                          text-align: center;
                        }
                        .invoice-display-panel-ledger .master-table-header-cell:nth-child(3),
                        .invoice-display-panel-ledger .master-table-cell:nth-child(3) {
                          width: 11rem;
                          text-align: center;
                        }
                        .invoice-display-panel-ledger .master-table-header-cell:nth-child(4),
                        .invoice-display-panel-ledger .master-table-cell:nth-child(4) {
                          width: 10rem;
                          text-align: center;
                        }
                        .invoice-display-panel-ledger .master-table-header-cell:nth-child(5),
                        .invoice-display-panel-ledger .master-table-cell:nth-child(5) {
                          width: 10rem;
                          text-align: center;
                        }
                        .invoice-display-panel-ledger .master-table-header-cell:nth-child(6),
                        .invoice-display-panel-ledger .master-table-cell:nth-child(6) {
                          width: 10rem;
                          text-align: center;
                        }
                        .invoice-display-panel-ledger .master-table-header-cell:nth-child(7),
                        .invoice-display-panel-ledger .master-table-cell:nth-child(7) {
                          width: 10rem;
                          text-align: center;
                        }
                        .invoice-display-panel-ledger .master-table-header-cell:last-child,
                        .invoice-display-panel-ledger .master-table-cell:last-child {
                          border-right: 0;
                        }
                      `,
                    }}
                  />
                  <div className="mb-5 flex flex-col gap-3 border-b border-[color:var(--cmp-border-subtle)] pb-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Invoice workspace</p>
                      <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                        Use the action icons to open the invoice or customer workspace while keeping the ledger read-only.
                      </p>
                    </div>
                    <div className="theme-control-surface inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-xs text-[color:var(--sem-text-secondary)] sm:self-auto">
                      <span className="font-medium text-[color:var(--sem-text-primary)]">{totalCount}</span>
                      total records
                    </div>
                  </div>
                  <div className="hidden lg:block">
                    <input
                      id="invoice-display-ledger"
                      className="sr-only"
                      type="radio"
                      name="invoice-display-mode"
                      defaultChecked
                    />
                    <input id="invoice-display-hybrid" className="sr-only" type="radio" name="invoice-display-mode" />
                    <input id="invoice-display-grid" className="sr-only" type="radio" name="invoice-display-mode" />

                    <div className="invoice-display-toolbar mb-5 flex flex-col gap-4 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)]/65 p-4 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Display</p>
                        <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                          Ledger for fast finance scanning, Hybrid for richer follow-up context, and Grid for quick portfolio review.
                        </p>
                      </div>
                      <fieldset className="flex flex-wrap gap-2">
                        <legend className="sr-only">Invoice display mode</legend>
                        <label
                          htmlFor="invoice-display-ledger"
                          className="invoice-display-chip cursor-pointer rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] transition"
                        >
                          Ledger
                        </label>
                        <label
                          htmlFor="invoice-display-hybrid"
                          className="invoice-display-chip cursor-pointer rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] transition"
                        >
                          Hybrid
                        </label>
                        <label
                          htmlFor="invoice-display-grid"
                          className="invoice-display-chip cursor-pointer rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] transition"
                        >
                          Grid
                        </label>
                      </fieldset>
                    </div>

                    <div className="invoice-display-panels">
                      <div className="invoice-display-panel invoice-display-panel-ledger">
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
                                <div className="flex items-center justify-center gap-2">
                                  <Link
                                    href={`/invoices/${invoice.id}`}
                                    title="Open invoice"
                                    aria-label="Open invoice"
                                    className={invoiceOpenIconClass}
                                  >
                                    <Receipt className="h-[0.8rem] w-[0.8rem]" />
                                  </Link>
                                  <Link
                                    href={customerHrefByName.get(invoice.customer_name.trim().toLowerCase()) ?? "/customers"}
                                    title="Open customer"
                                    aria-label="Open customer"
                                    className={invoiceCustomerIconClass}
                                  >
                                    <UserRound className="h-[0.8rem] w-[0.8rem]" />
                                  </Link>
                                  {invoice.job_id ? (
                                    <Link
                                      href={`/jobs/${invoice.job_id}`}
                                      title="Open related job"
                                      aria-label="Open related job"
                                      className={invoiceJobIconClass}
                                    >
                                      <Briefcase className="h-[0.8rem] w-[0.8rem]" />
                                    </Link>
                                  ) : null}
                                </div>
                              </td>
                              <td className="master-table-cell text-center">
                                <p className="font-semibold text-[color:var(--sem-text-primary)]">{invoice.customer_name}</p>
                              </td>
                              <td className="master-table-cell text-center">
                                <p className="font-medium text-[color:var(--sem-text-primary)] whitespace-nowrap">{invoice.document_number}</p>
                              </td>
                              <td className="master-table-cell text-center">
                                <span className={invoiceStatusBadgeClass(invoice.lifecycle_status)}>{formatLifecycleStatus(invoice.lifecycle_status)}</span>
                              </td>
                              <td className="master-table-cell text-center font-medium text-[color:var(--sem-text-primary)]">
                                <span className="whitespace-nowrap">{formatCurrency(invoice.total_cents)}</span>
                              </td>
                              <td className="master-table-cell text-center font-medium text-[color:var(--sem-text-primary)]">
                                <span className="whitespace-nowrap">{formatCurrency(invoice.balance_cents)}</span>
                              </td>
                              <td className="master-table-cell text-center">
                                <span className="whitespace-nowrap">{formatDate(invoice.issued_at)}</span>
                              </td>
                            </MasterTableRow>
                          ))}
                        </MasterTable>
                      </div>

                      <div className="invoice-display-panel invoice-display-panel-hybrid">
                        <div className="space-y-3">
                          {pagedInvoices.map((invoice) => (
                            <article
                              key={invoice.id}
                              className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] px-5 py-4 shadow-[0_16px_36px_rgba(15,23,42,0.05)]"
                            >
                              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(220px,0.8fr)] xl:items-start">
                                <div className="space-y-3">
                                  <div className="flex items-center gap-3">
                                    <Link
                                      href={`/invoices/${invoice.id}`}
                                      title="Open invoice"
                                      aria-label="Open invoice"
                                      className={invoiceOpenIconClass}
                                    >
                                      <Receipt className="h-[0.8rem] w-[0.8rem]" />
                                    </Link>
                                    <Link
                                      href={customerHrefByName.get(invoice.customer_name.trim().toLowerCase()) ?? "/customers"}
                                      title="Open customer"
                                      aria-label="Open customer"
                                      className={invoiceCustomerIconClass}
                                    >
                                      <UserRound className="h-[0.8rem] w-[0.8rem]" />
                                    </Link>
                                    {invoice.job_id ? (
                                      <Link
                                        href={`/jobs/${invoice.job_id}`}
                                        title="Open related job"
                                        aria-label="Open related job"
                                        className={invoiceJobIconClass}
                                      >
                                        <Briefcase className="h-[0.8rem] w-[0.8rem]" />
                                      </Link>
                                    ) : null}
                                    <span className={invoiceStatusBadgeClass(invoice.lifecycle_status)}>{formatLifecycleStatus(invoice.lifecycle_status)}</span>
                                  </div>
                                  <div>
                                    <p className="text-lg font-semibold text-[color:var(--sem-text-primary)]">{invoice.customer_name}</p>
                                    <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{invoice.document_number}</p>
                                  </div>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Issue date</p>
                                    <p className="mt-2 text-sm text-[color:var(--sem-text-primary)]">{formatDate(invoice.issued_at)}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Total</p>
                                    <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(invoice.total_cents)}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Balance</p>
                                    <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(invoice.balance_cents)}</p>
                                  </div>
                                </div>

                                <div className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)]/55 px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
                                  <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Job description</p>
                                  <p className="mt-2 text-[color:var(--sem-text-primary)]">{invoice.job_title}</p>
                                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--sem-text-muted)]">
                                    <span>Paid {formatCurrency(invoice.amount_paid_cents)}</span>
                                    <span>{invoice.balance_cents > 0 ? "Needs follow-up" : "Closed"}</span>
                                  </div>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>

                      <div className="invoice-display-panel invoice-display-panel-grid">
                        <div className="grid gap-4 xl:grid-cols-3 md:grid-cols-2">
                          {pagedInvoices.map((invoice) => (
                            <article
                              key={invoice.id}
                              className="theme-surface-card flex h-full flex-col rounded-[30px] border border-[color:var(--cmp-border-subtle)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)]"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <Link
                                  href={`/invoices/${invoice.id}`}
                                  title="Open invoice"
                                  aria-label="Open invoice"
                                  className={invoiceOpenIconClass}
                                >
                                  <Receipt className="h-[0.8rem] w-[0.8rem]" />
                                </Link>
                                <Link
                                  href={customerHrefByName.get(invoice.customer_name.trim().toLowerCase()) ?? "/customers"}
                                  title="Open customer"
                                  aria-label="Open customer"
                                  className={invoiceCustomerIconClass}
                                >
                                  <UserRound className="h-[0.8rem] w-[0.8rem]" />
                                </Link>
                                {invoice.job_id ? (
                                  <Link
                                    href={`/jobs/${invoice.job_id}`}
                                    title="Open related job"
                                    aria-label="Open related job"
                                    className={invoiceJobIconClass}
                                  >
                                    <Briefcase className="h-[0.8rem] w-[0.8rem]" />
                                  </Link>
                                ) : null}
                                <span className={invoiceStatusBadgeClass(invoice.lifecycle_status)}>{formatLifecycleStatus(invoice.lifecycle_status)}</span>
                              </div>

                              <div className="mt-5">
                                <p className="text-xl font-semibold text-[color:var(--sem-text-primary)]">{invoice.customer_name}</p>
                                <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{invoice.document_number}</p>
                              </div>

                              <div className="mt-5 grid gap-3 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)]/60 px-4 py-4 text-sm text-[color:var(--sem-text-secondary)]">
                                <div className="flex items-center justify-between gap-3">
                                  <span>Total</span>
                                  <span className="font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(invoice.total_cents)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span>Balance</span>
                                  <span className="font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(invoice.balance_cents)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span>Issued</span>
                                  <span className="text-[color:var(--sem-text-primary)]">{formatDate(invoice.issued_at)}</span>
                                </div>
                              </div>

                              <div className="mt-5 border-t border-[color:var(--cmp-border-subtle)] pt-4 text-sm text-[color:var(--sem-text-secondary)]">
                                <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Job description</p>
                                <p className="mt-2 text-[color:var(--sem-text-primary)]">{invoice.job_title}</p>
                                <p className="mt-3 text-xs text-[color:var(--sem-text-muted)]">
                                  Paid {formatCurrency(invoice.amount_paid_cents)} to date
                                </p>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:hidden">
                    <MasterMobileList
                      items={pagedInvoices}
                      emptyState="No invoices are available yet. Create an invoice from a job to populate this workspace."
                      renderItem={(invoice) => (
                        <article key={invoice.id} className="master-mobile-card theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] p-4 text-sm text-[color:var(--sem-text-secondary)] shadow-[0_18px_34px_rgba(15,23,42,0.04)]">
                          <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-[color:var(--sem-text-primary)]">{invoice.document_number}</p>
                                <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{invoice.job_title}</p>
                              </div>
                              <span className={invoiceStatusBadgeClass(invoice.lifecycle_status)}>{formatLifecycleStatus(invoice.lifecycle_status)}</span>
                            </div>
                            <p>{invoice.customer_name}</p>
                            <div className="flex items-center justify-between gap-3 border-t border-[color:var(--cmp-border-subtle)] pt-3 text-xs text-[color:var(--sem-text-muted)]">
                              <span>Issued {formatDate(invoice.issued_at)}</span>
                              <span className="text-[color:var(--sem-text-primary)]">{formatCurrency(invoice.balance_cents)}</span>
                            </div>
                            <div className="border-t border-[color:var(--cmp-border-subtle)] pt-3">
                              <div className="flex items-center justify-center gap-2">
                                <Link
                                  href={`/invoices/${invoice.id}`}
                                  title="Open invoice"
                                  aria-label="Open invoice"
                                  className={invoiceOpenIconClass}
                                >
                                  <Receipt className="h-[0.8rem] w-[0.8rem]" />
                                </Link>
                                <Link
                                  href={customerHrefByName.get(invoice.customer_name.trim().toLowerCase()) ?? "/customers"}
                                  title="Open customer"
                                  aria-label="Open customer"
                                  className={invoiceCustomerIconClass}
                                >
                                  <UserRound className="h-[0.8rem] w-[0.8rem]" />
                                </Link>
                                {invoice.job_id ? (
                                  <Link
                                    href={`/jobs/${invoice.job_id}`}
                                    title="Open related job"
                                    aria-label="Open related job"
                                    className={invoiceJobIconClass}
                                  >
                                    <Briefcase className="h-[0.8rem] w-[0.8rem]" />
                                  </Link>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </article>
                      )}
                    />
                  </div>
                </div>
            ) : loadError ? null : (
              <div className="theme-surface-card rounded-[30px] border border-dashed border-[color:var(--cmp-border-subtle)] px-6 py-10 text-center text-sm text-[color:var(--sem-text-secondary)]">
                <div className="mx-auto flex max-w-md flex-col items-center">
                  <div className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-3 text-[color:var(--sem-accent-primary)]">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Invoice workspace</p>
                  <p className="mt-3 text-base font-medium text-[color:var(--sem-text-primary)]">No invoices are available yet.</p>
                  <p className="mt-2 leading-7">
                    Create an invoice from a job to populate this workspace and begin tracking customer balances.
                  </p>
                </div>
              </div>
            )}

              <div className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3">
                <MasterTablePagination
                  page={currentPage}
                  pageSize={pageSize}
                  totalCount={totalCount}
                  totalPages={totalPages}
                  previousHref={previousPageHref}
                  nextHref={nextPageHref}
                />
              </div>

              {paidCount ? (
                <p className="text-xs text-[color:var(--sem-text-muted)]">{paidCount} invoices are already marked paid.</p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

