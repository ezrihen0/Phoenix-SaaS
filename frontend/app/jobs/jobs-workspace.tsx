"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Briefcase, CalendarDays, LoaderCircle, Plus, Search, UserRound } from "lucide-react";

import {
  MasterMobileList,
  MasterTable,
  MasterTableRow,
  type MasterTableState,
} from "@/components/master-table";
import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  buildJobServiceLabel,
  buildJobStatusLabel,
  formatJobCurrency,
  getJobTypeLabel,
  jobStatusToneClass,
  relationValue,
} from "@/lib/crm/job-field-display";
import {
  collectTechnicianOptions,
  filterJobsList,
  formatJobNumber,
  formatOperationalScheduleLabel,
  getJobBalanceCents,
  type JobListRecord,
  type JobsQuickFilter,
} from "@/lib/crm/jobs-list-utils";
import { jobStatuses, type JobStatus } from "@/lib/crm/statuses";

type JobsWorkspaceProps = {
  canViewAllJobs: boolean;
  canCreateJob: boolean;
  locale: string;
};

const PAGE_SIZE = 25;

const QUICK_FILTERS: Array<{ key: JobsQuickFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "unscheduled", label: "Unscheduled" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "unpaid", label: "Unpaid" },
];

const TABLE_COLUMNS = [
  { key: "status", label: "Status", align: "left" as const },
  { key: "jobNumber", label: "Job #", align: "left" as const },
  { key: "customer", label: "Customer", align: "left" as const },
  { key: "jobType", label: "Job Type", align: "left" as const },
  { key: "service", label: "Service", align: "left" as const },
  { key: "scheduled", label: "Scheduled", align: "left" as const },
  { key: "technician", label: "Technician", align: "left" as const },
  { key: "balance", label: "Balance", align: "right" as const },
];

function jobStatusBadgeClass(status: JobStatus) {
  return `${jobStatusToneClass(status)} inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]`;
}

export default function JobsWorkspace({
  canViewAllJobs,
  canCreateJob,
  locale,
}: JobsWorkspaceProps) {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobListRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<JobsQuickFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);
  const [, startRefresh] = useTransition();

  async function loadJobs() {
    setIsLoading(true);

    try {
      const data = await crmApiFetch<JobListRecord[]>("/api/jobs");
      setJobs(data);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The job board could not be loaded.");
      setJobs([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client fetch after mount
    void loadJobs();
  }, []);

  const technicianOptions = useMemo(() => collectTechnicianOptions(jobs), [jobs]);

  const filteredJobs = useMemo(
    () =>
      filterJobsList({
        jobs,
        quickFilter,
        searchQuery,
        statusFilter,
        technicianFilter,
        dateFilter,
      }),
    [jobs, quickFilter, searchQuery, statusFilter, technicianFilter, dateFilter],
  );

  const totalCount = filteredJobs.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedJobs = filteredJobs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function resetFiltersPage() {
    setPage(1);
  }

  const tableState: MasterTableState = isLoading
    ? { status: "loading", skeletonRows: 8 }
    : loadError
      ? { status: "error", message: loadError }
      : totalCount === 0
        ? { status: "empty", message: "No jobs match the current filters." }
        : { status: "ready" };

  function handleRefresh() {
    startRefresh(() => {
      void loadJobs();
    });
  }

  function openJob(jobId: string) {
    router.push(`/jobs/${jobId}`);
  }

  function renderDesktopRow(job: JobListRecord) {
    const customer = relationValue(job.customer);
    const service = relationValue(job.service);
    const technician = relationValue(job.technician);
    const serviceLabel = buildJobServiceLabel(service?.name, job.requested_service_type, locale);
    const balanceCents = getJobBalanceCents(job);
    const balanceLabel = balanceCents === null ? "—" : formatJobCurrency(balanceCents, locale) ?? "—";

    return (
      <MasterTableRow
        key={job.id}
        interactive
        tabIndex={0}
        onClick={() => openJob(job.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openJob(job.id);
          }
        }}
      >
        <td className="master-table-cell whitespace-nowrap">
          <span className={jobStatusBadgeClass(job.status)}>{buildJobStatusLabel(job.status, locale)}</span>
        </td>
        <td className="master-table-cell whitespace-nowrap font-medium text-[color:var(--sem-text-primary)]">
          {formatJobNumber(job.id)}
        </td>
        <td className="master-table-cell text-[color:var(--sem-text-primary)]">{customer?.full_name ?? "Customer"}</td>
        <td className="master-table-cell whitespace-nowrap">{getJobTypeLabel(job.job_type)}</td>
        <td className="master-table-cell text-[color:var(--sem-text-primary)]">{serviceLabel}</td>
        <td className="master-table-cell whitespace-nowrap">{formatOperationalScheduleLabel(job, locale)}</td>
        <td className="master-table-cell whitespace-nowrap">
          {technician?.display_name ?? "Unassigned"}
        </td>
        <td className="master-table-cell whitespace-nowrap text-right font-medium text-[color:var(--sem-text-primary)]">
          {balanceLabel}
        </td>
      </MasterTableRow>
    );
  }

  function renderMobileRow(job: JobListRecord) {
    const customer = relationValue(job.customer);
    const service = relationValue(job.service);
    const serviceLabel = buildJobServiceLabel(service?.name, job.requested_service_type, locale);
    const balanceCents = getJobBalanceCents(job);
    const balanceLabel = balanceCents === null ? "—" : formatJobCurrency(balanceCents, locale) ?? "—";

    return (
      <Link
        key={job.id}
        href={`/jobs/${job.id}`}
        className="master-mobile-row-link master-mobile-card master-mobile-operational-row"
      >
        <div className="flex items-start justify-between gap-3">
          <span className={jobStatusBadgeClass(job.status)}>{buildJobStatusLabel(job.status, locale)}</span>
          <span className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{balanceLabel}</span>
        </div>
        <p className="mt-3 text-base font-semibold text-[color:var(--sem-text-primary)]">{customer?.full_name ?? "Customer"}</p>
        <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{serviceLabel}</p>
        <p className="mt-2 text-sm text-[color:var(--sem-text-muted)]">{formatOperationalScheduleLabel(job, locale)}</p>
      </Link>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-[color:var(--cmp-border-subtle)] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
              <Briefcase className="h-5 w-5" />
            </span>
            <h1 className="font-[family:var(--font-flat-display)] text-3xl tracking-tight text-[color:var(--sem-display-headline)] md:text-4xl">
              Jobs
            </h1>
          </div>

          {canCreateJob ? (
            <Link
              href="/jobs/new"
              className="theme-btn-primary inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              New Job
            </Link>
          ) : null}
        </header>

        <div className="mt-5 flex flex-wrap gap-2">
          {QUICK_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => {
                setQuickFilter(filter.key);
                resetFiltersPage();
              }}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                quickFilter === filter.key
                  ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-selected-surface)] text-[color:var(--sem-accent-primary)]"
                  : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] hover:bg-[color:var(--cmp-surface-soft)] hover:text-[color:var(--sem-text-primary)]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.55fr))]">
          <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3 text-sm">
            <Search className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
            <input
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                resetFiltersPage();
              }}
              placeholder="Search customer, service, job #, technician"
              className="min-w-0 flex-1 bg-transparent text-[color:var(--sem-text-primary)] outline-none placeholder:text-[color:var(--sem-text-muted)]"
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3 text-sm">
            <span className="shrink-0 text-[color:var(--sem-text-muted)]">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as JobStatus | "all");
                resetFiltersPage();
              }}
              className="min-w-0 flex-1 bg-transparent text-[color:var(--sem-text-primary)] outline-none"
            >
              <option value="all">All statuses</option>
              {jobStatuses.map((status) => (
                <option key={status} value={status}>
                  {buildJobStatusLabel(status, locale)}
                </option>
              ))}
            </select>
          </label>

          {canViewAllJobs ? (
            <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3 text-sm">
              <UserRound className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
              <select
                value={technicianFilter}
                onChange={(event) => {
                  setTechnicianFilter(event.target.value);
                  resetFiltersPage();
                }}
                className="min-w-0 flex-1 bg-transparent text-[color:var(--sem-text-primary)] outline-none"
              >
                <option value="all">All technicians</option>
                <option value="unassigned">Unassigned</option>
                {technicianOptions.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.display_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3 text-sm">
            <CalendarDays className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => {
                setDateFilter(event.target.value);
                resetFiltersPage();
              }}
              className="min-w-0 flex-1 bg-transparent text-[color:var(--sem-text-primary)] outline-none"
            />
          </label>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-[color:var(--sem-text-muted)]">
          <p>
            {isLoading ? "Loading jobs..." : `${totalCount} job${totalCount === 1 ? "" : "s"}`}
          </p>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1.5 text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-strong)] hover:text-[color:var(--sem-text-primary)]"
          >
            Refresh
          </button>
        </div>

        <section className="mt-5 hidden lg:block">
          <MasterTable
            columns={TABLE_COLUMNS}
            state={tableState}
            wrapClassName="master-table-wrap-sticky"
          >
            {pagedJobs.map((job) => renderDesktopRow(job))}
          </MasterTable>
        </section>

        <section className="mt-5 lg:hidden">
          {isLoading ? (
            <div className="master-mobile-empty flex items-center justify-center gap-2 text-sm text-[color:var(--sem-text-secondary)]">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading jobs...
            </div>
          ) : loadError ? (
            <div className="theme-alert-error master-mobile-empty text-sm">{loadError}</div>
          ) : (
            <MasterMobileList
              items={pagedJobs}
              emptyState="No jobs match the current filters."
              renderItem={renderMobileRow}
            />
          )}
        </section>

        {!isLoading && !loadError && totalCount > 0 ? (
          <div className="mt-5 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/40 px-4 py-3">
            <JobsPagination
              page={currentPage}
              pageSize={PAGE_SIZE}
              totalCount={totalCount}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}

type JobsPaginationProps = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

function JobsPagination({
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
}: JobsPaginationProps) {
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div className="master-table-pagination">
      <p className="master-table-pagination-summary text-sm text-[color:var(--text-muted)]">
        Showing {start}–{end} of {totalCount}
      </p>
      <div className="master-table-pagination-controls">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
            page <= 1
              ? "pointer-events-none border-[color:var(--border-subtle)] text-[color:var(--text-muted)]"
              : "border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
          }`}
        >
          Prev
        </button>
        <span className="master-table-pagination-page text-sm text-[color:var(--text-secondary)]">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
            page >= totalPages
              ? "pointer-events-none border-[color:var(--border-subtle)] text-[color:var(--text-muted)]"
              : "border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
          }`}
        >
          Next
        </button>
      </div>
    </div>
  );
}
