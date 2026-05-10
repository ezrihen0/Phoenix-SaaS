import Link from "next/link";
import { ArrowRight, Briefcase, FileText, Search, UserRound } from "lucide-react";

import { requireServerRoles } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import {
  MasterMobileList,
  MasterRowLink,
  MasterTable,
  MasterTablePagination,
  MasterTableRow,
  type MasterTableState,
} from "@/components/master-table";

type EstimatesPageContext = {
  searchParams: Promise<{
    status?: string | string[];
    lifecycleStatus?: string | string[];
    q?: string | string[];
    customerId?: string | string[];
    jobId?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
  }>;
};

type EstimateStatus = "draft" | "sent" | "approved" | "rejected";
type EstimateLifecycleStatus = "draft" | "sent" | "approved" | "void" | "converted";

type EstimateListItem = {
  id: string;
  job_id: string;
  customer_id: string;
  customer_name: string;
  job_title: string;
  document_number: string;
  lifecycle_status: EstimateLifecycleStatus;
  description: string;
  price_cents: number;
  status: EstimateStatus;
  sent_at: string | null;
  approved_at: string | null;
};


function getPrimaryEstimateStatus(estimate: EstimateListItem) {
  if (estimate.lifecycle_status === "converted") {
    return {
      label: formatLifecycleStatus(estimate.lifecycle_status),
      className: lifecycleBadgeClass(estimate.lifecycle_status),
    };
  }

  return {
    label: formatPersistedStatus(estimate.status),
    className: estimateStatusBadgeClass(estimate.status),
  };
}

function shouldShowLifecycleBadge(estimate: EstimateListItem) {
  return estimate.lifecycle_status !== "converted" && estimate.lifecycle_status !== estimate.status;
}
function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatCurrency(cents: number) {
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

function formatLifecycleStatus(status: EstimateLifecycleStatus) {
  if (status === "void") {
    return "Voided";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function lifecycleBadgeClass(status: EstimateLifecycleStatus) {
  if (status === "approved" || status === "converted") {
    return "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
  }

  if (status === "sent") {
    return "theme-status-warning inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
  }

  if (status === "void") {
    return "theme-status-error inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
  }

  return "theme-badge inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
}

function formatPersistedStatus(status: EstimateStatus) {
  if (status === "rejected") {
    return "Rejected";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function estimateStatusBadgeClass(status: EstimateStatus) {
  if (status === "approved") {
    return "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
  }

  if (status === "sent") {
    return "theme-status-warning inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
  }

  if (status === "rejected") {
    return "theme-status-error inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
  }

  return "theme-badge inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
}

const estimateActionIconBaseClass = "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)]";
const estimateOpenIconClass = `${estimateActionIconBaseClass} bg-amber-500 hover:bg-amber-600`;
const estimateCustomerIconClass = `${estimateActionIconBaseClass} bg-sky-600 hover:bg-sky-700`;
const estimateJobIconClass = `${estimateActionIconBaseClass} bg-orange-600 hover:bg-orange-700`;

export default async function EstimatesPage({ searchParams }: EstimatesPageContext) {
  await requireServerRoles("/estimates", ["owner", "office_admin", "technician"]);

  const resolvedSearchParams = await searchParams;
  const query = (firstValue(resolvedSearchParams.q) ?? "").trim();
  const statusValue = firstValue(resolvedSearchParams.status);
  const lifecycleValue = firstValue(resolvedSearchParams.lifecycleStatus);
  const status = statusValue === "draft"
    || statusValue === "sent"
    || statusValue === "approved"
    || statusValue === "rejected"
    ? statusValue
    : "";
  const lifecycleStatus = lifecycleValue === "draft"
    || lifecycleValue === "sent"
    || lifecycleValue === "approved"
    || lifecycleValue === "void"
    || lifecycleValue === "converted"
    ? lifecycleValue
    : "";
  const customerId = (firstValue(resolvedSearchParams.customerId) ?? "").trim();
  const jobId = (firstValue(resolvedSearchParams.jobId) ?? "").trim();
  const pageValue = Number.parseInt((firstValue(resolvedSearchParams.page) ?? "1").trim(), 10);
  const pageSizeValue = Number.parseInt((firstValue(resolvedSearchParams.pageSize) ?? "10").trim(), 10);
  const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const pageSize = Number.isFinite(pageSizeValue) && [10, 25, 50, 100].includes(pageSizeValue) ? pageSizeValue : 10;

  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }

  if (status) {
    params.set("status", status);
  }

  if (lifecycleStatus) {
    params.set("lifecycleStatus", lifecycleStatus);
  }

  if (customerId) {
    params.set("customerId", customerId);
  }

  if (jobId) {
    params.set("jobId", jobId);
  }

  const endpoint = `/api/estimates${params.toString() ? `?${params.toString()}` : ""}`;

  let estimates: EstimateListItem[] = [];
  let loadError: string | null = null;

  try {
    const response = await serverApiFetch<EstimateListItem[]>(endpoint);
    estimates = Array.isArray(response) ? response : [];

    if (!Array.isArray(response)) {
      loadError = "The estimates list response was invalid.";
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The estimates list could not be loaded.";
  }

  const totalCount = estimates.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedEstimates = estimates.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const baseQueryParams = new URLSearchParams();

  if (query) {
    baseQueryParams.set("q", query);
  }

  if (status) {
    baseQueryParams.set("status", status);
  }

  if (lifecycleStatus) {
    baseQueryParams.set("lifecycleStatus", lifecycleStatus);
  }

  if (customerId) {
    baseQueryParams.set("customerId", customerId);
  }

  if (jobId) {
    baseQueryParams.set("jobId", jobId);
  }

  const previousParams = new URLSearchParams(baseQueryParams.toString());
  previousParams.set("page", String(Math.max(1, currentPage - 1)));
  previousParams.set("pageSize", String(pageSize));
  const previousPageHref = `?${previousParams.toString()}`;

  const nextParams = new URLSearchParams(baseQueryParams.toString());
  nextParams.set("page", String(Math.min(totalPages, currentPage + 1)));
  nextParams.set("pageSize", String(pageSize));
  const nextPageHref = `?${nextParams.toString()}`;

  const tableState: MasterTableState = loadError
    ? { status: "error", message: "Estimates unavailable." }
    : totalCount === 0
      ? { status: "empty", message: "No estimates matched this filter." }
      : { status: "ready" };

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_46%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_34%)]"
        />
        <div
          aria-hidden="true"
          className="absolute left-[-5rem] top-24 h-56 w-56 rounded-full bg-[color:var(--sem-accent-primary)]/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute right-[-3rem] top-12 h-64 w-64 rounded-full bg-[color:var(--sem-accent-primary)]/8 blur-3xl"
        />

        <div className="relative mx-auto max-w-[88rem] px-6 py-14 lg:px-10">
          <section className="theme-surface-modal relative overflow-hidden rounded-[40px] border border-[color:var(--cmp-border-subtle)] p-7 shadow-[0_32px_90px_rgba(15,23,42,0.08)] sm:p-8 lg:p-10">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(245,158,11,0.45),transparent)]"
            />

            <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-3 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/85 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)] backdrop-blur">
                  <span className="h-2 w-2 rounded-full bg-[color:var(--sem-accent-primary)]" />
                  Estimates
                </div>
                <h1 className="mt-6 max-w-3xl font-[family:var(--font-flat-display)] text-4xl leading-[0.96] tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl lg:text-6xl">
                  Estimate List
                </h1>
                <p className="mt-5 max-w-2xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                  Track estimate documents by customer, job, lifecycle, and approval activity.
                </p>
              </div>

              <div className="flex flex-col items-stretch gap-4 sm:items-start">
                <div className="theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] p-5 shadow-[0_20px_40px_rgba(15,23,42,0.05)]">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Estimates</p>
                  <p className="mt-3 text-4xl font-semibold leading-none text-[color:var(--sem-text-primary)]">{estimates.length}</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">Visible in current filter.</p>
                </div>
                <Link
                  href="/estimates/new"
                  className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs uppercase tracking-[0.18em] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)]"
                >
                  Create Estimate
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </section>

          <section className="theme-surface-modal mt-8 rounded-[34px] border border-[color:var(--cmp-border-subtle)] p-6 shadow-[0_26px_70px_rgba(15,23,42,0.05)] sm:p-7">
            <div className="mb-6 flex flex-col gap-3 border-b border-[color:var(--cmp-border-subtle)] pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Filters</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                  Narrow the visible estimate set by search, status, lifecycle, and page size.
                </p>
              </div>
              <div className="theme-control-surface inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-xs text-[color:var(--sem-text-secondary)] sm:self-auto">
                <span className="font-medium text-[color:var(--sem-text-primary)]">{totalCount}</span>
                total results
              </div>
            </div>

          <form className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_190px_220px_160px_auto] lg:items-end" method="get">
            {customerId ? <input type="hidden" name="customerId" value={customerId} /> : null}
            {jobId ? <input type="hidden" name="jobId" value={jobId} /> : null}
            <input type="hidden" name="page" value="1" />
            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Search name / customer</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--sem-text-muted)]" />
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Customer or job"
                  className="theme-input-control w-full rounded-[18px] py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-[color:var(--sem-text-muted)]"
                />
              </div>
            </label>

            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Status</span>
              <select
                name="status"
                defaultValue={status}
                className="theme-input-control h-[46px] w-full rounded-[18px] px-4 text-sm outline-none transition"
              >
                <option value="">All</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Lifecycle</span>
              <select
                name="lifecycleStatus"
                defaultValue={lifecycleStatus}
                className="theme-input-control h-[46px] w-full rounded-[18px] px-4 text-sm outline-none transition"
              >
                <option value="">All</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="approved">Approved</option>
                <option value="void">Voided</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Page Size</span>
              <select
                name="pageSize"
                defaultValue={String(pageSize)}
                className="theme-input-control h-[46px] w-full rounded-[18px] px-4 text-sm outline-none transition"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </label>

            <button
              type="submit"
              className="theme-btn-secondary h-[46px] rounded-[18px] px-5 text-sm font-medium transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)]"
            >
              Apply
            </button>
          </form>

          {loadError ? (
            <div className="theme-alert-error mt-6 rounded-[22px] border px-5 py-4 text-sm">
              {loadError}
            </div>
          ) : null}

          <div className="theme-surface-card mt-7 rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/96 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.05)] sm:p-5">
            <style
              dangerouslySetInnerHTML={{
                __html: `
                  .estimate-display-panel { display: none; }
                  .estimate-display-chip {
                    border-color: transparent;
                    color: var(--sem-text-secondary);
                  }
                  .estimate-display-chip:hover {
                    color: var(--sem-text-primary);
                  }
                  #estimate-display-ledger:checked ~ .estimate-display-toolbar label[for="estimate-display-ledger"],
                  #estimate-display-hybrid:checked ~ .estimate-display-toolbar label[for="estimate-display-hybrid"],
                  #estimate-display-grid:checked ~ .estimate-display-toolbar label[for="estimate-display-grid"] {
                    border-color: var(--cmp-border-subtle);
                    background: var(--cmp-surface-card);
                    color: var(--sem-text-primary);
                    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
                  }
                  #estimate-display-ledger:checked ~ .estimate-display-panels .estimate-display-panel-ledger,
                  #estimate-display-hybrid:checked ~ .estimate-display-panels .estimate-display-panel-hybrid,
                  #estimate-display-grid:checked ~ .estimate-display-panels .estimate-display-panel-grid {
                    display: block;
                  }
                  .estimate-display-panel-ledger .master-table {
                    table-layout: fixed;
                  }
                  .estimate-display-panel-ledger .master-table-header-cell,
                  .estimate-display-panel-ledger .master-table-cell {
                    border-right: 1px solid var(--cmp-border-subtle);
                    vertical-align: middle;
                  }
                  .estimate-display-panel-ledger .master-table-header-cell:nth-child(1),
                  .estimate-display-panel-ledger .master-table-cell:nth-child(1) {
                    width: 12rem;
                    text-align: center;
                  }
                  .estimate-display-panel-ledger .master-table-header-cell:nth-child(2),
                  .estimate-display-panel-ledger .master-table-cell:nth-child(2) {
                    text-align: center;
                  }
                  .estimate-display-panel-ledger .master-table-header-cell:nth-child(3),
                  .estimate-display-panel-ledger .master-table-cell:nth-child(3) {
                    width: 11rem;
                    text-align: center;
                  }
                  .estimate-display-panel-ledger .master-table-header-cell:nth-child(4),
                  .estimate-display-panel-ledger .master-table-cell:nth-child(4) {
                    width: 14rem;
                    text-align: center;
                  }
                  .estimate-display-panel-ledger .master-table-header-cell:nth-child(5),
                  .estimate-display-panel-ledger .master-table-cell:nth-child(5) {
                    width: 10rem;
                    text-align: center;
                  }
                  .estimate-display-panel-ledger .master-table-header-cell:nth-child(6),
                  .estimate-display-panel-ledger .master-table-cell:nth-child(6) {
                    width: 9rem;
                    text-align: center;
                  }
                  .estimate-display-panel-ledger .master-table-header-cell:last-child,
                  .estimate-display-panel-ledger .master-table-cell:last-child {
                    border-right: 0;
                  }
                `,
              }}
            />
            <div className="mb-5 flex flex-col gap-3 border-b border-[color:var(--cmp-border-subtle)] pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Estimate workspace</p>
                <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                  Review customer, job, amount, lifecycle, and approval history in one place.
                </p>
              </div>
              <p className="text-xs text-[color:var(--sem-text-secondary)]">{totalCount} total</p>
            </div>
            <div className="hidden lg:block">
              <input
                id="estimate-display-ledger"
                className="sr-only"
                type="radio"
                name="estimate-display-mode"
                defaultChecked
              />
              <input id="estimate-display-hybrid" className="sr-only" type="radio" name="estimate-display-mode" />
              <input id="estimate-display-grid" className="sr-only" type="radio" name="estimate-display-mode" />

              <div className="estimate-display-toolbar mb-5 flex flex-col gap-4 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)]/65 p-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Display</p>
                  <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                    Ledger for operational review, Hybrid for sales follow-up context, and Grid for quick portfolio scanning.
                  </p>
                </div>
                <fieldset className="flex flex-wrap gap-2">
                  <legend className="sr-only">Estimate display mode</legend>
                  <label
                    htmlFor="estimate-display-ledger"
                    className="estimate-display-chip cursor-pointer rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] transition"
                  >
                    Ledger
                  </label>
                  <label
                    htmlFor="estimate-display-hybrid"
                    className="estimate-display-chip cursor-pointer rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] transition"
                  >
                    Hybrid
                  </label>
                  <label
                    htmlFor="estimate-display-grid"
                    className="estimate-display-chip cursor-pointer rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] transition"
                  >
                    Grid
                  </label>
                </fieldset>
              </div>

              <div className="estimate-display-panels">
                <div className="estimate-display-panel estimate-display-panel-ledger">
                  <MasterTable
                    columns={[
                      { key: "actions", label: "Actions", align: "center" },
                      { key: "customer", label: "Customer Name", align: "center" },
                      { key: "estimate", label: "Estimate #", align: "center" },
                      { key: "status", label: "Status", align: "center" },
                      { key: "total", label: "Total", align: "center" },
                      { key: "sent", label: "Sent", align: "center" },
                    ]}
                    colSpan={6}
                    state={tableState}
                  >
                    {pagedEstimates.length ? pagedEstimates.map((estimate) => (
                      <MasterTableRow key={estimate.id}>
                        <td className="master-table-cell master-table-actions-cell align-middle">
                          <div className="inline-flex items-center justify-center gap-2">
                            <Link
                              href={`/estimates/${estimate.id}`}
                              title="Open estimate"
                              aria-label="Open estimate"
                              className={estimateOpenIconClass}
                            >
                              <FileText className="h-[0.9rem] w-[0.9rem]" />
                            </Link>
                            <Link
                              href={`/customers/${estimate.customer_id}`}
                              title="Open customer"
                              aria-label="Open customer"
                              className={estimateCustomerIconClass}
                            >
                              <UserRound className="h-[0.9rem] w-[0.9rem]" />
                            </Link>
                            <Link
                              href={`/jobs/${estimate.job_id}`}
                              title="Open related job"
                              aria-label="Open related job"
                              className={estimateJobIconClass}
                            >
                              <Briefcase className="h-[0.9rem] w-[0.9rem]" />
                            </Link>
                          </div>
                        </td>
                        <td className="master-table-cell align-middle text-center">
                          <p className="font-semibold text-[color:var(--sem-text-primary)]">{estimate.customer_name}</p>
                        </td>
                        <td className="master-table-cell align-middle text-center">
                          <p className="font-medium text-[color:var(--sem-text-primary)] whitespace-nowrap">{estimate.document_number}</p>
                        </td>
                        <td className="master-table-cell align-middle text-center">
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <span className={getPrimaryEstimateStatus(estimate).className}>{getPrimaryEstimateStatus(estimate).label}</span>
                            {shouldShowLifecycleBadge(estimate) ? (
                              <span className={lifecycleBadgeClass(estimate.lifecycle_status)}>{formatLifecycleStatus(estimate.lifecycle_status)}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="master-table-cell align-middle text-center font-medium text-[color:var(--sem-text-primary)]">
                          <span className="whitespace-nowrap">{formatCurrency(estimate.price_cents)}</span>
                        </td>
                        <td className="master-table-cell align-middle text-center">
                          <span className="whitespace-nowrap">{formatDate(estimate.sent_at)}</span>
                        </td>
                      </MasterTableRow>
                    )) : null}
                  </MasterTable>
                </div>

                <div className="estimate-display-panel estimate-display-panel-hybrid">
                  <div className="space-y-3">
                    {pagedEstimates.map((estimate) => (
                      <article
                        key={estimate.id}
                        className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] px-5 py-4 shadow-[0_16px_36px_rgba(15,23,42,0.05)]"
                      >
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.9fr)_minmax(220px,0.8fr)] xl:items-start">
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                              <Link
                                href={`/estimates/${estimate.id}`}
                                title="Open estimate"
                                aria-label="Open estimate"
                                className={estimateOpenIconClass}
                              >
                                <FileText className="h-[0.9rem] w-[0.9rem]" />
                              </Link>
                              <Link
                                href={`/customers/${estimate.customer_id}`}
                                title="Open customer"
                                aria-label="Open customer"
                                className={estimateCustomerIconClass}
                              >
                                <UserRound className="h-[0.9rem] w-[0.9rem]" />
                              </Link>
                              <Link
                                href={`/jobs/${estimate.job_id}`}
                                title="Open related job"
                                aria-label="Open related job"
                                className={estimateJobIconClass}
                              >
                                <Briefcase className="h-[0.9rem] w-[0.9rem]" />
                              </Link>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-[color:var(--sem-text-primary)]">{estimate.customer_name}</p>
                              <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{estimate.document_number}</p>
                            </div>
                            <p className="text-sm text-[color:var(--sem-text-secondary)]">{estimate.description || estimate.job_title}</p>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Total</p>
                              <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(estimate.price_cents)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Sent</p>
                              <p className="mt-2 text-sm text-[color:var(--sem-text-primary)]">{formatDate(estimate.sent_at)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Approved</p>
                              <p className="mt-2 text-sm text-[color:var(--sem-text-primary)]">{formatDate(estimate.approved_at)}</p>
                            </div>
                          </div>

                          <div className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)]/55 px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
                            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Job description</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className={getPrimaryEstimateStatus(estimate).className}>{getPrimaryEstimateStatus(estimate).label}</span>
                              {shouldShowLifecycleBadge(estimate) ? (
                                <span className={lifecycleBadgeClass(estimate.lifecycle_status)}>{formatLifecycleStatus(estimate.lifecycle_status)}</span>
                              ) : null}
                            </div>
                            <p className="mt-3 text-[color:var(--sem-text-primary)]">{estimate.job_title}</p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="estimate-display-panel estimate-display-panel-grid">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {pagedEstimates.map((estimate) => (
                      <article
                        key={estimate.id}
                        className="theme-surface-card flex h-full flex-col rounded-[30px] border border-[color:var(--cmp-border-subtle)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/estimates/${estimate.id}`}
                              title="Open estimate"
                              aria-label="Open estimate"
                              className={estimateOpenIconClass}
                            >
                              <FileText className="h-[0.9rem] w-[0.9rem]" />
                            </Link>
                            <Link
                              href={`/customers/${estimate.customer_id}`}
                              title="Open customer"
                              aria-label="Open customer"
                              className={estimateCustomerIconClass}
                            >
                              <UserRound className="h-[0.9rem] w-[0.9rem]" />
                            </Link>
                            <Link
                              href={`/jobs/${estimate.job_id}`}
                              title="Open related job"
                              aria-label="Open related job"
                              className={estimateJobIconClass}
                            >
                              <Briefcase className="h-[0.9rem] w-[0.9rem]" />
                            </Link>
                          </div>
                          <span className={getPrimaryEstimateStatus(estimate).className}>{getPrimaryEstimateStatus(estimate).label}</span>
                        </div>

                        <div className="mt-5">
                          <p className="text-xl font-semibold text-[color:var(--sem-text-primary)]">{estimate.customer_name}</p>
                          <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{estimate.document_number}</p>
                        </div>

                        <div className="mt-5 grid gap-3 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)]/60 px-4 py-4 text-sm text-[color:var(--sem-text-secondary)]">
                          <div className="flex items-center justify-between gap-3">
                            <span>Total</span>
                            <span className="font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(estimate.price_cents)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Lifecycle</span>
                            <span className={lifecycleBadgeClass(estimate.lifecycle_status)}>{formatLifecycleStatus(estimate.lifecycle_status)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Sent</span>
                            <span className="text-[color:var(--sem-text-primary)]">{formatDate(estimate.sent_at)}</span>
                          </div>
                        </div>

                        <div className="mt-5 border-t border-[color:var(--cmp-border-subtle)] pt-4 text-sm text-[color:var(--sem-text-secondary)]">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Related job</p>
                          <p className="mt-2 text-[color:var(--sem-text-primary)]">{estimate.job_title}</p>
                          <p className="mt-3 text-xs text-[color:var(--sem-text-muted)]">Approved {formatDate(estimate.approved_at)}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:hidden">
            <MasterMobileList
              items={pagedEstimates}
              emptyState={loadError ? "Estimates unavailable." : "No estimates matched this filter."}
              renderItem={(estimate) => (
                <article key={estimate.id} className="master-mobile-card theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] p-4 text-sm text-[color:var(--sem-text-secondary)] shadow-[0_18px_34px_rgba(15,23,42,0.04)]">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[color:var(--sem-text-primary)]">{estimate.customer_name}</p>
                        <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{estimate.document_number}</p>
                      </div>
                      <span className={lifecycleBadgeClass(estimate.lifecycle_status)}>
                        {formatLifecycleStatus(estimate.lifecycle_status)}
                      </span>
                    </div>
                    <p className="text-[color:var(--sem-text-primary)]">{estimate.job_title}</p>
                    <div className="grid gap-1 border-t border-[color:var(--cmp-border-subtle)] pt-3 text-xs text-[color:var(--sem-text-muted)]">
                      <p>Amount: <span className="text-[color:var(--sem-text-primary)]">{formatCurrency(estimate.price_cents)}</span></p>
                      <p>Status: {getPrimaryEstimateStatus(estimate).label}</p>
                      <p>Sent: {formatDate(estimate.sent_at)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 border-t border-[color:var(--cmp-border-subtle)] pt-3">
                      <Link
                        href={`/estimates/${estimate.id}`}
                        title="Open estimate"
                        aria-label="Open estimate"
                        className={estimateOpenIconClass}
                      >
                        <FileText className="h-[0.9rem] w-[0.9rem]" />
                      </Link>
                      <Link
                        href={`/customers/${estimate.customer_id}`}
                        title="Open customer"
                        aria-label="Open customer"
                        className={estimateCustomerIconClass}
                      >
                        <UserRound className="h-[0.9rem] w-[0.9rem]" />
                      </Link>
                      <Link
                        href={`/jobs/${estimate.job_id}`}
                        title="Open related job"
                        aria-label="Open related job"
                        className={estimateJobIconClass}
                      >
                        <Briefcase className="h-[0.9rem] w-[0.9rem]" />
                      </Link>
                    </div>
                  </div>
                </article>
              )}
            />
          </div>

            <div className="mt-6 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3">
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
        </div>
      </div>
    </main>
  );
}
