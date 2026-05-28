"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, ClipboardList, Filter, LoaderCircle, RefreshCw } from "lucide-react";

import { MobileJobCard } from "@/components/jobs/mobile-job-card";
import { MobileJobDetailPane } from "@/components/jobs/mobile-job-detail-pane";
import { buildAddressQuery, buildGoogleMapsSearchUrl } from "@/lib/crm/display";
import {
  buildJobAddressLabel,
  buildJobServiceLabel,
  buildJobStatusLabel,
  formatJobCurrency,
  formatJobLocation,
  formatJobScheduleLabel,
  getJobPaymentSignal,
  jobStatusToneClass,
  relationValue,
} from "@/lib/crm/job-field-display";
import type { JobStatus } from "@/lib/crm/statuses";

type TechnicianOption = {
  id: string;
  display_name: string;
};

export type MobileJobsFieldJob = {
  id: string;
  title: string;
  status: JobStatus;
  requested_service_type: string;
  service_address_line_1: string;
  service_address_line_2: string | null;
  service_city: string;
  service_state_or_region: string | null;
  service_postal_code: string;
  scheduled_for: string | null;
  scheduled_window: string | null;
  customer: { full_name: string; phone: string } | { full_name: string; phone: string }[] | null;
  service: { name: string; default_price_cents: number } | { name: string; default_price_cents: number }[] | null;
  technician: { display_name: string } | { display_name: string }[] | null;
  quote: { price_cents: number; status: string } | { price_cents: number; status: string }[] | null;
  invoice: { amount_cents: number; status: string } | { amount_cents: number; status: string }[] | null;
};

type MobileJobsFieldCommandProps = {
  jobs: MobileJobsFieldJob[];
  technicians: TechnicianOption[];
  selectedJobId: string | null;
  mobileDetailJobId: string | null;
  queueTechnicianFilter: string;
  queueDateFilter: string;
  queuePage: number;
  queueTotalPages: number;
  queueStartIndex: number;
  queueFilterActive: boolean;
  isBooting: boolean;
  isRefreshing: boolean;
  errorMessage: string | null;
  statusMessage: string | null;
  displayedJob: MobileJobsFieldJob | null;
  operatorNextAction: { title: string; detail: string } | null;
  displayedJobMoneyCents: number | null;
  onSelectJob: (jobId: string) => void;
  onClearMobileDetail: () => void;
  onTechnicianFilterChange: (value: string) => void;
  onDateFilterChange: (value: string) => void;
  onClearFilters: () => void;
  onQueuePageChange: (page: number) => void;
  onRefresh: () => void;
};

function buildMapsUrl(job: MobileJobsFieldJob) {
  return buildGoogleMapsSearchUrl(
    buildAddressQuery(
      job.service_address_line_1,
      job.service_address_line_2,
      job.service_city,
      job.service_state_or_region,
      job.service_postal_code,
    ),
  );
}

export function MobileJobsFieldCommand({
  jobs,
  technicians,
  selectedJobId,
  mobileDetailJobId,
  queueTechnicianFilter,
  queueDateFilter,
  queuePage,
  queueTotalPages,
  queueStartIndex,
  queueFilterActive,
  isBooting,
  isRefreshing,
  errorMessage,
  statusMessage,
  displayedJob,
  operatorNextAction,
  displayedJobMoneyCents,
  onSelectJob,
  onClearMobileDetail,
  onTechnicianFilterChange,
  onDateFilterChange,
  onClearFilters,
  onQueuePageChange,
  onRefresh,
}: MobileJobsFieldCommandProps) {
  const t = useTranslations("jobs.fieldCommand");
  const locale = useLocale();

  if (isBooting) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-5">
        <div className="inline-flex items-center gap-3 text-sm text-[color:var(--sem-text-secondary)]">
          <LoaderCircle className="h-4 w-4 animate-spin text-[color:var(--sem-accent-primary)]" />
          {t("loading")}
        </div>
      </div>
    );
  }

  if (mobileDetailJobId && displayedJob) {
    const customer = relationValue(displayedJob.customer);
    const service = relationValue(displayedJob.service);
    const technician = relationValue(displayedJob.technician);
    const quote = relationValue(displayedJob.quote);
    const invoice = relationValue(displayedJob.invoice);

    return (
      <div className="px-4 py-4 lg:hidden">
        <MobileJobDetailPane
          backLabel={t("backToJobs")}
          onBack={onClearMobileDetail}
          customerName={customer?.full_name ?? displayedJob.title}
          jobTitle={displayedJob.title}
          statusLabel={buildJobStatusLabel(displayedJob.status, locale)}
          statusToneClass={jobStatusToneClass(displayedJob.status)}
          nextActionTitle={operatorNextAction?.title}
          nextActionDetail={operatorNextAction?.detail}
          scheduledLabel={formatJobScheduleLabel(
            displayedJob.scheduled_for,
            displayedJob.scheduled_window,
            locale,
            t("notScheduled"),
          )}
          addressLabel={buildJobAddressLabel(
            displayedJob.service_address_line_1,
            displayedJob.service_address_line_2,
            displayedJob.service_city,
            displayedJob.service_state_or_region,
            displayedJob.service_postal_code,
          )}
          serviceLabel={buildJobServiceLabel(service?.name, displayedJob.requested_service_type, locale)}
          technicianName={technician?.display_name ?? null}
          paymentLabel={displayedJobMoneyCents !== null ? formatJobCurrency(displayedJobMoneyCents, locale) : null}
          paymentDetail={getJobPaymentSignal({ invoice, quote, service })}
          phone={customer?.phone ?? null}
          mapsUrl={buildMapsUrl(displayedJob)}
          jobId={displayedJob.id}
          openJobLabel={t("openJob")}
          callCustomerLabel={t("callCustomer")}
          mapsLabel={t("openMaps")}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-4 lg:hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">
            {t("eyebrow")}
          </p>
          <h1 className="mt-1 font-[family:var(--font-flat-display)] text-2xl tracking-tight text-[color:var(--sem-display-headline)]">
            {t("title")}
          </h1>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="theme-control-surface-soft inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
          aria-label={t("refresh")}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {errorMessage || statusMessage ? (
        <div className={`mt-4 rounded-[18px] border px-3 py-2.5 text-sm ${errorMessage ? "theme-alert-error" : "theme-alert-info"}`}>
          {errorMessage ?? statusMessage}
        </div>
      ) : null}

      <Link
        href="/jobs/new"
        className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--sem-accent-primary)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.99]"
      >
        <ClipboardList className="h-4 w-4" />
        New Job
      </Link>

      <div className="mt-4 grid gap-3">
        <label className="block space-y-1.5 text-sm text-[color:var(--sem-text-secondary)]">
          <span className="text-xs uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">{t("technicianFilter")}</span>
          <select
            value={queueTechnicianFilter}
            onChange={(event) => onTechnicianFilterChange(event.target.value)}
            className="theme-control-surface w-full rounded-xl border px-3 py-2.5 text-sm"
          >
            <option value="all">{t("allTechnicians")}</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>{technician.display_name}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm text-[color:var(--sem-text-secondary)]">
          <span className="text-xs uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">{t("dateFilter")}</span>
          <input
            type="date"
            value={queueDateFilter}
            onChange={(event) => onDateFilterChange(event.target.value)}
            className="theme-control-surface w-full rounded-xl border px-3 py-2.5 text-sm"
          />
        </label>
        {queueFilterActive ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="rounded-xl border border-[color:var(--cmp-border-subtle)] px-3 py-2 text-sm text-[color:var(--sem-text-secondary)]"
          >
            {t("clearFilters")}
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs text-[color:var(--sem-text-muted)]">
          <Filter className="h-3.5 w-3.5" />
          {t("jobCount", { count: jobs.length })}
        </span>
      </div>

      {jobs.length === 0 ? (
        <div className="theme-control-surface-soft mt-4 rounded-[20px] border border-dashed px-4 py-10 text-center text-sm text-[color:var(--sem-text-muted)]">
          {queueFilterActive ? t("emptyFiltered") : t("empty")}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {jobs.map((job) => {
            const customer = relationValue(job.customer);
            const service = relationValue(job.service);
            const technician = relationValue(job.technician);
            const quote = relationValue(job.quote);
            const invoice = relationValue(job.invoice);

            return (
              <MobileJobCard
                key={job.id}
                customerName={customer?.full_name ?? job.title}
                statusLabel={buildJobStatusLabel(job.status, locale)}
                statusToneClass={jobStatusToneClass(job.status)}
                scheduledLabel={formatJobScheduleLabel(job.scheduled_for, job.scheduled_window, locale, t("notScheduled"))}
                locationLabel={formatJobLocation(job.service_city, job.service_state_or_region)}
                serviceLabel={buildJobServiceLabel(service?.name, job.requested_service_type, locale)}
                technicianName={technician?.display_name ?? null}
                paymentSignal={getJobPaymentSignal({ invoice, quote, service })}
                selected={selectedJobId === job.id}
                onSelect={() => onSelectJob(job.id)}
                phone={customer?.phone ?? null}
                mapsUrl={buildMapsUrl(job)}
                jobId={job.id}
                openJobLabel={t("openJob")}
              />
            );
          })}
        </div>
      )}

      {jobs.length > 0 && queueTotalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[color:var(--sem-text-muted)]">
          <span>
            {queueStartIndex + 1}-{Math.min(queueStartIndex + jobs.length, queueStartIndex + jobs.length)} · {t("pageOf", { page: queuePage, total: queueTotalPages })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={queuePage <= 1}
              onClick={() => onQueuePageChange(queuePage - 1)}
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1.5 disabled:opacity-50"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {t("previous")}
            </button>
            <button
              type="button"
              disabled={queuePage >= queueTotalPages}
              onClick={() => onQueuePageChange(queuePage + 1)}
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1.5 disabled:opacity-50"
            >
              {t("next")}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
