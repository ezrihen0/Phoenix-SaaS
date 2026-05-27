"use client";

import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw } from "lucide-react";

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
  formatJobTimeOnly,
  getJobPaymentSignal,
  jobStatusToneClass,
  relationValue,
} from "@/lib/crm/job-field-display";
import type { JobStatus } from "@/lib/crm/statuses";

export type MobileScheduleDayJob = {
  id: string;
  title: string;
  status: JobStatus;
  assigned_technician_id: string | null;
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
};

type MobileScheduleDayViewProps = {
  dayJobs: MobileScheduleDayJob[];
  selectedDate: Date;
  mobileDetailJobId: string | null;
  isPending: boolean;
  errorMessage: string | null;
  statusMessage: string | null;
  onPreviousDay: () => void;
  onToday: () => void;
  onNextDay: () => void;
  onSelectJob: (jobId: string) => void;
  onClearMobileDetail: () => void;
  onRefresh: () => void;
  getNextDispatchMove: (job: MobileScheduleDayJob) => { title: string; detail: string } | null;
  getJobValueCents: (job: MobileScheduleDayJob) => number;
};

function buildMapsUrl(job: MobileScheduleDayJob) {
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

function formatDayHeading(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function MobileScheduleDayView({
  dayJobs,
  selectedDate,
  mobileDetailJobId,
  isPending,
  errorMessage,
  statusMessage,
  onPreviousDay,
  onToday,
  onNextDay,
  onSelectJob,
  onClearMobileDetail,
  onRefresh,
  getNextDispatchMove,
  getJobValueCents,
}: MobileScheduleDayViewProps) {
  const t = useTranslations("schedule.fieldCommand");
  const locale = useLocale();

  const selectedJob = mobileDetailJobId
    ? dayJobs.find((job) => job.id === mobileDetailJobId) ?? null
    : null;

  if (selectedJob) {
    const customer = relationValue(selectedJob.customer);
    const service = relationValue(selectedJob.service);
    const technician = relationValue(selectedJob.technician);
    const nextMove = getNextDispatchMove(selectedJob);
    const valueCents = getJobValueCents(selectedJob);

    return (
      <div className="px-4 py-4 lg:hidden">
        <MobileJobDetailPane
          backLabel={t("backToSchedule")}
          onBack={onClearMobileDetail}
          customerName={customer?.full_name ?? selectedJob.title}
          jobTitle={selectedJob.title}
          statusLabel={buildJobStatusLabel(selectedJob.status, locale)}
          statusToneClass={jobStatusToneClass(selectedJob.status)}
          nextActionTitle={nextMove?.title}
          nextActionDetail={nextMove?.detail}
          scheduledLabel={formatJobScheduleLabel(
            selectedJob.scheduled_for,
            selectedJob.scheduled_window,
            locale,
            t("timeNotSet"),
          )}
          addressLabel={buildJobAddressLabel(
            selectedJob.service_address_line_1,
            selectedJob.service_address_line_2,
            selectedJob.service_city,
            selectedJob.service_state_or_region,
            selectedJob.service_postal_code,
          )}
          serviceLabel={buildJobServiceLabel(service?.name, selectedJob.requested_service_type, locale)}
          technicianName={technician?.display_name ?? null}
          paymentLabel={valueCents ? formatJobCurrency(valueCents, locale) : null}
          paymentDetail={getJobPaymentSignal({ service })}
          phone={customer?.phone ?? null}
          mapsUrl={buildMapsUrl(selectedJob)}
          jobId={selectedJob.id}
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
            {formatDayHeading(selectedDate, locale)}
          </h1>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isPending}
          className="theme-control-surface-soft inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
          aria-label={t("refresh")}
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        </button>
      </div>

      {errorMessage || statusMessage ? (
        <div className={`mt-4 rounded-[18px] border px-3 py-2.5 text-sm ${errorMessage ? "theme-alert-error" : "theme-alert-info"}`}>
          {errorMessage ?? statusMessage}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onPreviousDay}
          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-2 text-sm text-[color:var(--sem-text-secondary)]"
        >
          <ChevronLeft className="h-4 w-4" />
          {t("previous")}
        </button>
        <button
          type="button"
          onClick={onToday}
          className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-2 text-sm text-[color:var(--sem-text-secondary)]"
        >
          {t("today")}
        </button>
        <button
          type="button"
          onClick={onNextDay}
          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-2 text-sm text-[color:var(--sem-text-secondary)]"
        >
          {t("next")}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-4 text-xs text-[color:var(--sem-text-muted)]">
        {t("jobCount", { count: dayJobs.length })}
      </p>

      {isPending && dayJobs.length === 0 ? (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm text-[color:var(--sem-text-secondary)]">
          <LoaderCircle className="h-4 w-4 animate-spin text-[color:var(--sem-accent-primary)]" />
          {t("loading")}
        </div>
      ) : dayJobs.length === 0 ? (
        <div className="theme-control-surface-soft mt-4 rounded-[20px] border border-dashed px-4 py-10 text-center text-sm text-[color:var(--sem-text-muted)]">
          {t("empty")}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {dayJobs.map((job) => {
            const customer = relationValue(job.customer);
            const service = relationValue(job.service);
            const technician = relationValue(job.technician);
            const valueCents = getJobValueCents(job);

            return (
              <MobileJobCard
                key={job.id}
                customerName={customer?.full_name ?? job.title}
                statusLabel={buildJobStatusLabel(job.status, locale)}
                statusToneClass={jobStatusToneClass(job.status)}
                scheduledLabel={formatJobTimeOnly(job.scheduled_for, locale, t("timeNotSet"))}
                locationLabel={formatJobLocation(job.service_city, job.service_state_or_region)}
                serviceLabel={buildJobServiceLabel(service?.name, job.requested_service_type, locale)}
                technicianName={technician?.display_name ?? null}
                paymentSignal={valueCents ? formatJobCurrency(valueCents, locale) : null}
                selected={mobileDetailJobId === job.id}
                onSelect={() => onSelectJob(job.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
