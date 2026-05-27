"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Gauge,
  LoaderCircle,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  ShieldAlert,
  UserRound,
} from "lucide-react";

import { MobileScheduleDayView } from "@/app/schedule/mobile-schedule-day-view";
import { BoardShell } from "@/components/board/board-shell";
import { MetricTile } from "@/components/board/metric-tile";
import { formatAddress, buildAddressQuery, buildGoogleMapsSearchUrl } from "@/lib/crm/display";
import { crmApiFetch } from "@/lib/crm/browser-api";
import { getJobStatusLabel, getServiceTypeLabel, type JobStatus } from "@/lib/crm/statuses";

type CustomerRecord = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
};

type TechnicianRecord = {
  id: string;
  display_name: string;
  phone: string | null;
  specialties: string[];
  is_active: boolean;
  last_seen_at: string | null;
};

type ServiceRecord = {
  id: string;
  name: string;
  description: string | null;
  service_type: "inspection" | "cleaning" | "repair" | "rebuild";
  default_price_cents: number;
  duration_minutes: number;
};

type RelatedValue<T> = T | T[] | null;

type JobRecord = {
  id: string;
  assigned_technician_id: string | null;
  title: string;
  description: string | null;
  requested_service_type: ServiceRecord["service_type"];
  status: JobStatus;
  service_address_line_1: string;
  service_address_line_2: string | null;
  service_city: string;
  service_state_or_region: string | null;
  service_postal_code: string;
  scheduled_for: string | null;
  scheduled_window: string | null;
  created_at: string;
  updated_at: string;
  customer: RelatedValue<CustomerRecord>;
  service: RelatedValue<ServiceRecord>;
  technician: RelatedValue<TechnicianRecord>;
};

type ScheduleFormState = {
  assignedTechnicianId: string;
  scheduledDate: string;
  scheduledTime: string;
  scheduledEndTime: string;
};

type ViewMode = "day" | "week";

const SCHEDULE_ITEMS_PER_PAGE = 10;
const WORK_DAY_START_MINUTES = 8 * 60;
const WORK_DAY_END_MINUTES = 17 * 60;
const MIN_GAP_MINUTES = 30;
const DAY_CAPACITY_MINUTES = 8 * 60;

/** Reserved for future secondary calendar view toggle. */
const SHOW_LEGACY_WEEK_GRID = false;

const schedulePanelClass =
  "theme-surface-card rounded-[24px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] shadow-[0_18px_55px_color-mix(in_srgb,var(--bg-canvas)_72%,transparent)] backdrop-blur-md";

const scheduleEyebrowClass = "text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]";

type OpenWindowRecord = {
  id: string;
  timeLabel: string;
  area: string;
  technicianId: string;
  technicianName: string;
  durationMinutes: number;
  profitPotentialCents: number;
  routeImpactScore: number;
  techLoadPercent: number;
  useLabel: string;
};

type DispatchRiskRecord = {
  id: string;
  title: string;
  detail: string;
  tone: "danger" | "warning" | "success";
};

type TechnicianLoadRecord = {
  technicianId: string;
  name: string;
  jobs: number;
  loadPercent: number;
  tone: "danger" | "warning" | "primary" | "success";
};

function relationValue<T>(value: RelatedValue<T> | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-[18px] theme-control-surface px-4 py-3 text-sm text-[color:var(--sem-text-primary)] outline-none placeholder:text-[color:var(--sem-text-muted)] ${props.className ?? ""}`}
    />
  );
}

function FieldSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-[18px] theme-control-surface px-4 py-3 text-sm text-[color:var(--sem-text-primary)] outline-none ${props.className ?? ""}`}
    />
  );
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function getJobValueCents(job: JobRecord) {
  return relationValue(job.service)?.default_price_cents ?? 0;
}

function getJobDurationMinutes(job: JobRecord) {
  return relationValue(job.service)?.duration_minutes ?? 120;
}

function getJobEndDate(job: JobRecord) {
  if (!job.scheduled_for) {
    return null;
  }

  const start = new Date(job.scheduled_for);
  return new Date(start.getTime() + getJobDurationMinutes(job) * 60_000);
}

function minutesFromDate(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatMinutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(mins).padStart(2, "0")} ${period}`;
}

function computeLoadPercent(totalMinutes: number) {
  return Math.min(100, Math.round((totalMinutes / DAY_CAPACITY_MINUTES) * 100));
}

function loadTone(loadPercent: number): TechnicianLoadRecord["tone"] {
  if (loadPercent >= 85) {
    return "danger";
  }

  if (loadPercent >= 70) {
    return "warning";
  }

  if (loadPercent >= 45) {
    return "primary";
  }

  return "success";
}

function statusTone(status: JobStatus) {
  if (status === "waiting_for_approval" || status === "new_lead" || status === "contacted") {
    return "theme-status-warning";
  }

  if (status === "completed" || status === "paid") {
    return "theme-status-success";
  }

  if (status === "cancelled") {
    return "theme-status-error";
  }

  return "theme-status-info";
}

function getNextDispatchMove(
  job: Pick<JobRecord, "assigned_technician_id" | "scheduled_for" | "status">,
  t: ReturnType<typeof useTranslations<"schedule">>,
) {
  if (!job.assigned_technician_id) {
    return {
      title: t("moveAssignTechnician"),
      detail: t("moveAssignTechnicianDetail"),
    };
  }

  if (!job.scheduled_for) {
    return {
      title: t("moveSetSchedule"),
      detail: t("moveSetScheduleDetail"),
    };
  }

  if (job.status === "waiting_for_approval") {
    return {
      title: t("moveResolveApproval"),
      detail: t("moveResolveApprovalDetail"),
    };
  }

  return {
    title: t("moveConfirmProgress"),
    detail: t("moveConfirmProgressDetail", { status: getJobStatusLabel(job.status) }),
  };
}

function buildOpenWindows(
  technicians: TechnicianRecord[],
  dayJobs: JobRecord[],
  avgValueCents: number,
  unscheduledJobs: JobRecord[],
  technicianLoads: TechnicianLoadRecord[],
  labels: { fillHighValue: string; followUp: string },
): OpenWindowRecord[] {
  const loadByTechId = new Map(technicianLoads.map((entry) => [entry.technicianId, entry.loadPercent]));
  const windows: OpenWindowRecord[] = [];

  for (const technician of technicians) {
    const techJobs = dayJobs
      .filter((job) => job.assigned_technician_id === technician.id && job.scheduled_for)
      .sort((left, right) => new Date(left.scheduled_for!).getTime() - new Date(right.scheduled_for!).getTime());

    const techCities = new Set(techJobs.map((job) => job.service_city));
    const techLoadPercent = loadByTechId.get(technician.id) ?? 0;
    const gaps: Array<{ startMin: number; endMin: number; area: string }> = [];

    if (techJobs.length === 0) {
      gaps.push({ startMin: WORK_DAY_START_MINUTES, endMin: WORK_DAY_END_MINUTES, area: "Flexible" });
    } else {
      const firstStart = minutesFromDate(new Date(techJobs[0].scheduled_for!));
      if (firstStart - WORK_DAY_START_MINUTES >= MIN_GAP_MINUTES) {
        gaps.push({ startMin: WORK_DAY_START_MINUTES, endMin: firstStart, area: techJobs[0].service_city });
      }

      for (let index = 0; index < techJobs.length - 1; index += 1) {
        const currentEnd = getJobEndDate(techJobs[index]);
        const nextStart = new Date(techJobs[index + 1].scheduled_for!);

        if (!currentEnd) {
          continue;
        }

        const gapStart = minutesFromDate(currentEnd);
        const gapEnd = minutesFromDate(nextStart);

        if (gapEnd - gapStart >= MIN_GAP_MINUTES) {
          gaps.push({ startMin: gapStart, endMin: gapEnd, area: techJobs[index].service_city });
        }
      }

      const lastJob = techJobs[techJobs.length - 1];
      const lastEnd = getJobEndDate(lastJob);

      if (lastEnd) {
        const gapStart = minutesFromDate(lastEnd);
        if (WORK_DAY_END_MINUTES - gapStart >= MIN_GAP_MINUTES) {
          gaps.push({ startMin: gapStart, endMin: WORK_DAY_END_MINUTES, area: lastJob.service_city });
        }
      }
    }

    for (const gap of gaps) {
      const durationMinutes = gap.endMin - gap.startMin;
      if (durationMinutes < MIN_GAP_MINUTES) {
        continue;
      }

      const bestUnscheduledValue = unscheduledJobs
        .filter((job) => getJobDurationMinutes(job) <= durationMinutes)
        .reduce((max, job) => Math.max(max, getJobValueCents(job)), 0);

      const hourlyValue = avgValueCents > 0 ? avgValueCents : 15_000;
      const profitPotentialCents = Math.max(
        bestUnscheduledValue,
        Math.round((durationMinutes / 60) * hourlyValue),
      );

      let routeImpactScore = 50;
      if (gap.area === "Flexible") {
        routeImpactScore = 70;
      } else if (techCities.size <= 1) {
        routeImpactScore = 100;
      } else if (techCities.has(gap.area)) {
        routeImpactScore = 80;
      }

      windows.push({
        id: `${technician.id}-${gap.startMin}-${gap.endMin}`,
        timeLabel: `${formatMinutesLabel(gap.startMin)} - ${formatMinutesLabel(gap.endMin)}`,
        area: gap.area,
        technicianId: technician.id,
        technicianName: technician.display_name,
        durationMinutes,
        profitPotentialCents,
        routeImpactScore,
        techLoadPercent,
        useLabel: bestUnscheduledValue > 0 ? labels.fillHighValue : labels.followUp,
      });
    }
  }

  return windows.sort((left, right) => {
    if (right.profitPotentialCents !== left.profitPotentialCents) {
      return right.profitPotentialCents - left.profitPotentialCents;
    }

    if (left.techLoadPercent !== right.techLoadPercent) {
      return left.techLoadPercent - right.techLoadPercent;
    }

    return right.routeImpactScore - left.routeImpactScore;
  });
}

function buildDispatchRisks(
  dayJobs: JobRecord[],
  unscheduledJobs: JobRecord[],
  technicianLoads: TechnicianLoadRecord[],
  openWindows: OpenWindowRecord[],
  locale: string,
  t: ReturnType<typeof useTranslations<"schedule">>,
): DispatchRiskRecord[] {
  const risks: DispatchRiskRecord[] = [];

  const unassignedDayJobs = dayJobs.filter((job) => !job.assigned_technician_id);
  const highestUnassigned = [...unassignedDayJobs, ...unscheduledJobs]
    .sort((left, right) => getJobValueCents(right) - getJobValueCents(left))[0];

  if (highestUnassigned) {
    const customer = relationValue(highestUnassigned.customer);
    risks.push({
      id: `unassigned-${highestUnassigned.id}`,
      title: t("riskUnassignedHighValue"),
      detail: `${customer?.full_name ?? highestUnassigned.title} · ${formatCurrency(getJobValueCents(highestUnassigned))}`,
      tone: "danger",
    });
  }

  const overloaded = technicianLoads
    .filter((entry) => entry.technicianId !== "unassigned")
    .find((entry) => entry.loadPercent >= 85);

  if (overloaded) {
    risks.push({
      id: `overload-${overloaded.technicianId}`,
      title: t("riskTechnicianOverload"),
      detail: t("riskTechnicianOverloadDetail", { name: overloaded.name, load: overloaded.loadPercent }),
      tone: "warning",
    });
  }

  const bestWindow = openWindows[0];
  if (bestWindow) {
    risks.push({
      id: `window-${bestWindow.id}`,
      title: t("riskOpenWindow"),
      detail: `${bestWindow.technicianName} · ${bestWindow.timeLabel} · ${formatCurrency(bestWindow.profitPotentialCents)}`,
      tone: "success",
    });
  }

  for (const job of dayJobs.filter((entry) => entry.status === "waiting_for_approval").slice(0, 2)) {
    risks.push({
      id: `approval-${job.id}`,
      title: t("riskApprovalHold"),
      detail: `${job.title} · ${getJobStatusLabel(job.status, locale)}`,
      tone: "warning",
    });
  }

  return risks.slice(0, 5);
}

function emptyFormState(): ScheduleFormState {
  return {
    assignedTechnicianId: "",
    scheduledDate: "",
    scheduledTime: "",
    scheduledEndTime: "",
  };
}

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getWeekStart(date: Date) {
  const nextDate = startOfDay(date);
  const dayIndex = nextDate.getDay();
  const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
  return addDays(nextDate, mondayOffset);
}

function isSameCalendarDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function formatDayHeading(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatVisibleRange(dates: Date[], locale: string) {
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  if (!firstDate || !lastDate) {
    return "";
  }

  if (isSameCalendarDay(firstDate, lastDate)) {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(firstDate);
  }

  return `${new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(firstDate)} - ${new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(lastDate)}`;
}

function formatTimeOnly(value: string | null, locale: string, emptyLabel: string) {
  if (!value) {
    return emptyLabel;
  }

  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatScheduleTimeRange(value: string | null, windowLabel: string | null, locale: string, emptyLabel: string) {
  if (windowLabel?.trim()) {
    return windowLabel.replace(/\s+/g, " ");
  }

  if (!value) {
    return emptyLabel;
  }

  const start = new Date(value);

  if (Number.isNaN(start.getTime())) {
    return emptyLabel;
  }

  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  return `${formatTimeOnly(value, locale, emptyLabel)} - ${new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(end)}`;
}

function splitScheduledDateTime(value: string | null) {
  if (!value) {
    return {
      scheduledDate: "",
      scheduledTime: "",
    };
  }

  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  const [scheduledDate, scheduledTime] = localDate.toISOString().slice(0, 16).split("T");

  return {
    scheduledDate,
    scheduledTime: scheduledTime ?? "",
  };
}

function combineScheduledDateTime(date: string, time: string) {
  if (!date || !time) {
    return null;
  }

  const combined = new Date(`${date}T${time}`);

  if (Number.isNaN(combined.getTime())) {
    return null;
  }

  return combined.toISOString();
}

function buildScheduleForm(job: JobRecord | null): ScheduleFormState {
  if (!job) {
    return emptyFormState();
  }

  const { scheduledDate, scheduledTime } = splitScheduledDateTime(job.scheduled_for);

  return {
    assignedTechnicianId: job.assigned_technician_id ?? "",
    scheduledDate,
    scheduledTime,
    scheduledEndTime: deriveScheduledEndTime(job, scheduledTime),
  };
}

function sortJobs(jobs: JobRecord[]) {
  return [...jobs].sort((left, right) => {
    if (left.scheduled_for && right.scheduled_for) {
      return new Date(left.scheduled_for).getTime() - new Date(right.scheduled_for).getTime();
    }

    if (left.scheduled_for) {
      return -1;
    }

    if (right.scheduled_for) {
      return 1;
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function ScheduleEditor({
  job,
  technicians,
  isPending,
  onSave,
  locale,
  t,
}: {
  job: JobRecord;
  technicians: TechnicianRecord[];
  isPending: boolean;
  onSave: (form: ScheduleFormState) => void;
  locale: string;
  t: ReturnType<typeof useTranslations<"schedule">>;
}) {
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(() => buildScheduleForm(job));

  return (
    <div className="space-y-3">
      <p className={scheduleEyebrowClass}>{t("basicScheduling")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldLabel label={t("technicianField")}>
          <FieldSelect
            value={scheduleForm.assignedTechnicianId}
            onChange={(event) => setScheduleForm((current) => ({ ...current, assignedTechnicianId: event.target.value }))}
          >
            <option value="">{t("unassigned")}</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>{technician.display_name}</option>
            ))}
          </FieldSelect>
        </FieldLabel>
        <FieldLabel label={t("serviceTypeField")}>
          <FieldInput value={getServiceTypeLabel(job.requested_service_type, locale)} readOnly aria-readonly />
        </FieldLabel>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldLabel label={t("scheduledDate")}>
          <FieldInput
            type="date"
            value={scheduleForm.scheduledDate}
            onChange={(event) => setScheduleForm((current) => ({ ...current, scheduledDate: event.target.value }))}
          />
        </FieldLabel>
        <FieldLabel label={t("startTime")}>
          <FieldInput
            type="time"
            value={scheduleForm.scheduledTime}
            onChange={(event) => setScheduleForm((current) => ({ ...current, scheduledTime: event.target.value }))}
          />
        </FieldLabel>
      </div>
      <FieldLabel label={t("endTime")}>
        <FieldInput
          type="time"
          value={scheduleForm.scheduledEndTime}
          onChange={(event) => setScheduleForm((current) => ({ ...current, scheduledEndTime: event.target.value }))}
        />
      </FieldLabel>
      <button
        type="button"
        disabled={isPending || technicians.length === 0}
        onClick={() => onSave(scheduleForm)}
        className="theme-btn-primary inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {t("saveSchedule")}
      </button>
    </div>
  );
}

export default function ScheduleWorkspace({
  initialJobs,
  technicians,
  initialErrorMessage,
}: {
  initialJobs: JobRecord[];
  technicians: TechnicianRecord[];
  initialErrorMessage: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations("schedule");
  const [jobs, setJobs] = useState<JobRecord[]>(() => sortJobs(initialJobs));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [mobileDetailJobId, setMobileDetailJobId] = useState<string | null>(null);
  const [technicianFilter, setTechnicianFilter] = useState<string>("all");
  const [schedulePage, setSchedulePage] = useState(1);
  const [unscheduledPage, setUnscheduledPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeDay = startOfDay(selectedDate);
  const weekStripDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(getWeekStart(selectedDate), index)),
    [selectedDate],
  );
  const visibleDays = viewMode === "day"
    ? [activeDay]
    : weekStripDays;

  const filteredJobs = jobs.filter((job) => {
    if (technicianFilter === "all") {
      return true;
    }

    return job.assigned_technician_id === technicianFilter;
  });

  const scheduledJobs = filteredJobs.filter((job) => job.scheduled_for);
  const unscheduledJobs = filteredJobs.filter((job) => !job.scheduled_for);
  const visibleScheduledJobs = scheduledJobs.filter((job) => {
    if (!job.scheduled_for) {
      return false;
    }

    const jobDate = new Date(job.scheduled_for);
    return visibleDays.some((day) => isSameCalendarDay(jobDate, day));
  });
  const dayJobs = useMemo(
    () => scheduledJobs.filter((job) => job.scheduled_for && isSameCalendarDay(new Date(job.scheduled_for), activeDay)),
    [scheduledJobs, activeDay],
  );
  const mobileDayJobs = useMemo(
    () => [...dayJobs].sort(
      (left, right) => new Date(left.scheduled_for!).getTime() - new Date(right.scheduled_for!).getTime(),
    ),
    [dayJobs],
  );
  const scheduleTotalPages = Math.max(1, Math.ceil(dayJobs.length / SCHEDULE_ITEMS_PER_PAGE));
  const safeSchedulePage = Math.min(schedulePage, scheduleTotalPages);
  const scheduleStartIndex = (safeSchedulePage - 1) * SCHEDULE_ITEMS_PER_PAGE;
  const timelineJobs = useMemo(() => {
    const sorted = [...dayJobs].sort(
      (left, right) => new Date(left.scheduled_for!).getTime() - new Date(right.scheduled_for!).getTime(),
    );
    return viewMode === "day" ? sorted.slice(scheduleStartIndex, scheduleStartIndex + SCHEDULE_ITEMS_PER_PAGE) : sorted;
  }, [dayJobs, viewMode, scheduleStartIndex]);
  const pagedVisibleScheduledJobs = visibleScheduledJobs.slice(
    scheduleStartIndex,
    scheduleStartIndex + SCHEDULE_ITEMS_PER_PAGE,
  );
  const calendarScheduledJobs = viewMode === "day" ? pagedVisibleScheduledJobs : visibleScheduledJobs;
  const unscheduledTotalPages = Math.max(1, Math.ceil(unscheduledJobs.length / SCHEDULE_ITEMS_PER_PAGE));
  const safeUnscheduledPage = Math.min(unscheduledPage, unscheduledTotalPages);
  const unscheduledStartIndex = (safeUnscheduledPage - 1) * SCHEDULE_ITEMS_PER_PAGE;
  const pagedUnscheduledJobs = unscheduledJobs.slice(
    unscheduledStartIndex,
    unscheduledStartIndex + SCHEDULE_ITEMS_PER_PAGE,
  );

  const visibleJobIds = new Set([
    ...visibleScheduledJobs.map((job) => job.id),
    ...unscheduledJobs.map((job) => job.id),
  ]);
  const effectiveSelectedJobId = selectedJobId && visibleJobIds.has(selectedJobId)
    ? selectedJobId
    : (dayJobs[0]?.id ?? unscheduledJobs[0]?.id ?? null);
  const selectedJob = filteredJobs.find((job) => job.id === effectiveSelectedJobId) ?? null;
  const selectedCustomer = relationValue(selectedJob?.customer);
  const selectedTechnician = relationValue(selectedJob?.technician);
  const selectedJobMapsUrl = selectedJob
    ? buildGoogleMapsSearchUrl(
      buildAddressQuery(
        selectedJob.service_address_line_1,
        selectedJob.service_address_line_2,
        selectedJob.service_city,
        selectedJob.service_state_or_region,
        selectedJob.service_postal_code,
      ),
    )
    : null;

  const controlMetrics = useMemo(() => {
    const unassignedCount = dayJobs.filter((job) => !job.assigned_technician_id).length + unscheduledJobs.length;
    const totalMinutes = dayJobs.reduce((sum, job) => sum + getJobDurationMinutes(job), 0);
    const loadIndex = dayJobs.length > 0
      ? Math.round(totalMinutes / Math.max(technicians.length, 1) / DAY_CAPACITY_MINUTES * 100)
      : 0;
    const scheduleValueCents = dayJobs.reduce((sum, job) => sum + getJobValueCents(job), 0);
    const routeZones = new Set(dayJobs.map((job) => job.service_city).filter(Boolean));

    return {
      jobsToday: dayJobs.length,
      unassignedCount,
      loadIndex,
      scheduleValueCents,
      routeZones: routeZones.size,
    };
  }, [dayJobs, unscheduledJobs.length, technicians.length]);

  const weekPressure = useMemo(
    () => weekStripDays.map((day) => {
      const jobsForDay = scheduledJobs.filter(
        (job) => job.scheduled_for && isSameCalendarDay(new Date(job.scheduled_for), day),
      );
      const minutes = jobsForDay.reduce((sum, job) => sum + getJobDurationMinutes(job), 0);
      const load = computeLoadPercent(minutes);
      const tone = loadTone(load);

      return {
        day,
        jobs: jobsForDay.length,
        load,
        tone,
        active: isSameCalendarDay(day, activeDay),
      };
    }),
    [weekStripDays, scheduledJobs, activeDay],
  );

  const technicianLoads = useMemo(() => {
    const loads: TechnicianLoadRecord[] = technicians.map((technician) => {
      const techJobs = dayJobs.filter((job) => job.assigned_technician_id === technician.id);
      const totalMinutes = techJobs.reduce((sum, job) => sum + getJobDurationMinutes(job), 0);
      const loadPercent = computeLoadPercent(totalMinutes);

      return {
        technicianId: technician.id,
        name: technician.display_name,
        jobs: techJobs.length,
        loadPercent,
        tone: loadTone(loadPercent),
      };
    });

    const unassignedDayCount = dayJobs.filter((job) => !job.assigned_technician_id).length;
    if (unassignedDayCount > 0) {
      loads.push({
        technicianId: "unassigned",
        name: t("unassigned"),
        jobs: unassignedDayCount,
        loadPercent: 0,
        tone: "danger",
      });
    }

    return loads.sort((left, right) => right.loadPercent - left.loadPercent);
  }, [technicians, dayJobs, t]);

  const avgJobValueCents = useMemo(() => {
    const values = [...dayJobs, ...unscheduledJobs].map(getJobValueCents).filter((value) => value > 0);
    if (values.length === 0) {
      return 0;
    }

    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [dayJobs, unscheduledJobs]);

  const openWindows = useMemo(
    () => buildOpenWindows(
      technicians,
      dayJobs,
      avgJobValueCents,
      unscheduledJobs,
      technicianLoads,
      { fillHighValue: t("windowFillHighValue"), followUp: t("windowFollowUp") },
    ),
    [technicians, dayJobs, avgJobValueCents, unscheduledJobs, technicianLoads, t],
  );

  const dispatchRisks = useMemo(
    () => buildDispatchRisks(dayJobs, unscheduledJobs, technicianLoads, openWindows, locale, t),
    [dayJobs, unscheduledJobs, technicianLoads, openWindows, locale, t],
  );

  const nextDispatchMove = selectedJob ? getNextDispatchMove(selectedJob, t) : null;

  function shiftRange(direction: -1 | 1) {
    setSelectedDate((currentDate) => addDays(currentDate, viewMode === "day" ? direction : direction * 7));
  }

  function selectJobMobile(jobId: string) {
    setMobileDetailJobId(jobId);
    setSelectedJobId(jobId);
  }

  function clearMobileScheduleDetail() {
    setMobileDetailJobId(null);
  }

  function groupJobsByDay(day: Date) {
    return calendarScheduledJobs.filter((job) => job.scheduled_for && isSameCalendarDay(new Date(job.scheduled_for), day));
  }

  function countJobsByDay(day: Date) {
    return visibleScheduledJobs.filter((job) => job.scheduled_for && isSameCalendarDay(new Date(job.scheduled_for), day)).length;
  }

  useEffect(() => {
    setSchedulePage(1);
    setUnscheduledPage(1);
  }, [selectedDate, technicianFilter, viewMode]);

  useEffect(() => {
    if (schedulePage > scheduleTotalPages) {
      setSchedulePage(scheduleTotalPages);
    }
  }, [schedulePage, scheduleTotalPages]);

  useEffect(() => {
    if (unscheduledPage > unscheduledTotalPages) {
      setUnscheduledPage(unscheduledTotalPages);
    }
  }, [unscheduledPage, unscheduledTotalPages]);

  async function refreshJobs() {
    const nextJobs = await crmApiFetch<JobRecord[]>("/api/jobs");
    setJobs(sortJobs(nextJobs));
  }

  async function saveSchedule(jobId: string, scheduleForm: ScheduleFormState) {
    if (!jobId) {
      return;
    }

    const scheduledFor = combineScheduledDateTime(scheduleForm.scheduledDate, scheduleForm.scheduledTime);
    const scheduledEnd = combineScheduledDateTime(scheduleForm.scheduledDate, scheduleForm.scheduledEndTime);

    if (!scheduledFor || !scheduledEnd) {
      throw new Error(t("validDateTimeError"));
    }

    if (new Date(scheduledEnd).getTime() <= new Date(scheduledFor).getTime()) {
      throw new Error(t("endAfterStartError"));
    }

    const updatedJob = await crmApiFetch<JobRecord>(`/api/jobs/${jobId}`, {
      method: "PATCH",
      body: JSON.stringify({
        assignedTechnicianId: scheduleForm.assignedTechnicianId || null,
        scheduledFor,
        scheduledWindow: buildScheduledWindow(scheduleForm.scheduledTime, scheduleForm.scheduledEndTime),
      }),
    });

    setJobs((currentJobs) => sortJobs(currentJobs.map((job) => (job.id === updatedJob.id ? { ...job, ...updatedJob } : job))));
    setStatusMessage(t("scheduleSaved"));
    setErrorMessage(null);
    setSelectedJobId(updatedJob.id);
  }

  function handleRefresh() {
    startTransition(() => {
      void (async () => {
        try {
          await refreshJobs();
          setStatusMessage(t("refreshed"));
          setErrorMessage(null);
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : t("refreshError"));
        }
      })();
    });
  }

  function riskToneClass(tone: DispatchRiskRecord["tone"]) {
    if (tone === "danger") {
      return "theme-status-error";
    }

    if (tone === "warning") {
      return "theme-status-warning";
    }

    return "theme-status-success";
  }

  return (
    <BoardShell gridOpacity="subtle">
      <MobileScheduleDayView
        dayJobs={mobileDayJobs}
        selectedDate={activeDay}
        mobileDetailJobId={mobileDetailJobId}
        isPending={isPending}
        errorMessage={errorMessage}
        statusMessage={statusMessage}
        onPreviousDay={() => {
          setSelectedDate((currentDate) => addDays(currentDate, -1));
          setMobileDetailJobId(null);
        }}
        onToday={() => {
          setSelectedDate(startOfDay(new Date()));
          setMobileDetailJobId(null);
        }}
        onNextDay={() => {
          setSelectedDate((currentDate) => addDays(currentDate, 1));
          setMobileDetailJobId(null);
        }}
        onSelectJob={selectJobMobile}
        onClearMobileDetail={clearMobileScheduleDetail}
        onRefresh={handleRefresh}
        getNextDispatchMove={(job) => getNextDispatchMove(job, t)}
        getJobValueCents={(job) => relationValue(job.service)?.default_price_cents ?? 0}
      />
      <div className="hidden lg:block">
      <div className="mx-auto max-w-[1720px] px-5 py-6 lg:px-8">
        <header className={`${schedulePanelClass} px-6 py-5`}>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className={scheduleEyebrowClass}>{t("controlRoomEyebrow")}</p>
              <h1 className="mt-2 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] sm:text-5xl">
                {t("controlRoomTitle")}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                {t("controlRoomDescription")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/jobs"
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] hover:text-[color:var(--sem-text-primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("backToJobs")}
              </Link>
              <button
                type="button"
                onClick={handleRefresh}
                className="theme-btn-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
              >
                <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
                {t("refreshSchedule")}
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-4 border-t border-[color:var(--cmp-border-subtle)] pt-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => shiftRange(-1)} className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-2 text-sm text-[color:var(--sem-text-secondary)]">
                <ChevronLeft className="h-4 w-4" />
                {t("previous")}
              </button>
              <button type="button" onClick={() => setSelectedDate(startOfDay(new Date()))} className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-2 text-sm text-[color:var(--sem-text-secondary)]">
                {t("today")}
              </button>
              <button type="button" onClick={() => shiftRange(1)} className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-2 text-sm text-[color:var(--sem-text-secondary)]">
                {t("next")}
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="px-2 text-sm text-[color:var(--sem-text-muted)]">{formatVisibleRange(visibleDays, locale)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-1">
                {(["day", "week"] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`rounded-full px-4 py-2 text-sm ${viewMode === mode ? "theme-selected-card" : "text-[color:var(--sem-text-secondary)]"}`}
                  >
                    {mode === "day" ? t("day") : t("week")}
                  </button>
                ))}
              </div>
              <div className="min-w-[180px]">
                <FieldSelect value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)}>
                  <option value="all">{t("allTechnicians")}</option>
                  {technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>{technician.display_name}</option>
                  ))}
                </FieldSelect>
              </div>
            </div>
          </div>
        </header>

        {errorMessage || statusMessage ? (
          <div className={`mt-5 rounded-[22px] border px-4 py-3 text-sm ${errorMessage ? "theme-alert-error" : "theme-alert-info"}`}>
            {errorMessage ?? statusMessage}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile icon={CalendarDays} label={t("jobsToday")} value={controlMetrics.jobsToday} helper={t("jobsTodayHelper")} />
          <MetricTile icon={AlertTriangle} label={t("unscheduled")} value={controlMetrics.unassignedCount} helper={t("dispatchRiskHelper")} />
          <MetricTile icon={Clock3} label={t("openWindows")} value={openWindows.length} helper={t("sellableSlotsHelper")} />
          <MetricTile icon={Gauge} label={t("loadIndex")} value={`${controlMetrics.loadIndex}%`} helper={t("fieldCapacityHelper")} />
        </div>

        <section className={`${schedulePanelClass} mt-5 p-4`}>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className={scheduleEyebrowClass}>{t("weekPressure")}</p>
              <p className="mt-1 text-sm text-[color:var(--sem-text-muted)]">{t("weekPressureHelper")}</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-7">
            {weekPressure.map(({ day, jobs: jobCount, load, tone, active }) => (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setSelectedDate(startOfDay(day))}
                className={`rounded-[20px] border p-3 text-left ${active ? "theme-selected-card" : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]"}`}
              >
                <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">
                  {new Intl.DateTimeFormat(locale, { weekday: "short" }).format(day)}
                </p>
                <p className="font-[family:var(--font-geist-mono)] text-2xl font-semibold text-[color:var(--sem-display-headline)]">
                  {day.getDate()}
                </p>
                <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">{jobCount} {t("jobsShort")} · {load}%</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--cmp-surface-soft)]">
                  <div className={`h-full rounded-full ${tone === "danger" ? "bg-[color:var(--sem-state-error)]" : tone === "warning" ? "bg-[color:var(--sem-state-warning)]" : tone === "primary" ? "bg-[color:var(--sem-accent-primary)]" : "bg-[color:var(--sem-state-success)]"}`} style={{ width: `${load}%` }} />
                </div>
              </button>
            ))}
          </div>
        </section>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile icon={CircleDollarSign} label={t("scheduleValue")} value={formatCurrency(controlMetrics.scheduleValueCents)} helper={t("scheduleValueHelper")} />
          <MetricTile icon={MapPin} label={t("routePressure")} value={controlMetrics.routeZones} helper={t("routePressureHelper")} />
          <MetricTile icon={ShieldAlert} label={t("dispatchRisk")} value={dispatchRisks.length} helper={t("dispatchRiskCountHelper")} />
          <MetricTile icon={Clock3} label={t("sellableWindows")} value={openWindows.length} helper={t("sellableWindowsHelper")} />
        </div>

        <div className="mt-6 xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start xl:gap-6">
          <div className="min-h-0 space-y-4">
            <section className={`${schedulePanelClass} p-5`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className={scheduleEyebrowClass}>{t("todayTimeline")}</p>
                  <h2 className="mt-2 text-xl font-semibold text-[color:var(--sem-display-headline)]">{formatDayHeading(activeDay, locale)}</h2>
                </div>
                <span className="text-xs text-[color:var(--sem-text-muted)]">{dayJobs.length} {t("jobsShort")}</span>
              </div>

              <div className="mt-4 max-h-[42vh] overflow-y-auto rounded-[20px] border border-[color:var(--cmp-border-subtle)]">
                {timelineJobs.length > 0 ? timelineJobs.map((job) => {
                  const customer = relationValue(job.customer);
                  const technician = relationValue(job.technician);
                  const timeLabel = formatTimeOnly(job.scheduled_for, locale, t("timeNotSet"));
                  const endLabel = formatScheduleTimeRange(job.scheduled_for, job.scheduled_window, locale, t("timeNotSet")).split(" - ")[1] ?? "";

                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => {
                        setSelectedJobId(job.id);
                        setStatusMessage(null);
                      }}
                      className={`grid w-full grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[color:var(--cmp-border-subtle)] px-3 py-3 text-left last:border-b-0 ${effectiveSelectedJobId === job.id ? "theme-selected-card" : "bg-[color:var(--cmp-surface-panel)] hover:bg-[color:var(--cmp-hover-surface)]"}`}
                    >
                      <div>
                        <p className="font-[family:var(--font-geist-mono)] text-xs text-[color:var(--sem-accent-primary)]">{timeLabel}</p>
                        {endLabel ? <p className="text-[10px] text-[color:var(--sem-text-muted)]">{endLabel}</p> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[color:var(--sem-text-primary)]">{job.title}</p>
                        <p className="truncate text-xs text-[color:var(--sem-text-muted)]">
                          {customer?.full_name ?? t("customerPending")} · {job.service_city} · {technician?.display_name ?? t("unassigned")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-[family:var(--font-geist-mono)] text-xs font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(getJobValueCents(job))}</p>
                        <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase ${statusTone(job.status)}`}>
                          {getJobStatusLabel(job.status, locale)}
                        </span>
                      </div>
                    </button>
                  );
                }) : (
                  <div className="px-4 py-10 text-center text-sm text-[color:var(--sem-text-secondary)]">{t("noJobsForDate")}</div>
                )}
              </div>

              {viewMode === "day" && dayJobs.length > SCHEDULE_ITEMS_PER_PAGE ? (
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[color:var(--sem-text-muted)]">
                  <span>{t("showingScheduled", { start: scheduleStartIndex + 1, end: Math.min(scheduleStartIndex + SCHEDULE_ITEMS_PER_PAGE, dayJobs.length), totalCount: dayJobs.length })}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={safeSchedulePage <= 1} onClick={() => setSchedulePage((current) => Math.max(1, current - 1))} className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1 disabled:opacity-50">{t("previous")}</button>
                    <span>{t("pageOf", { page: safeSchedulePage, totalPages: scheduleTotalPages })}</span>
                    <button type="button" disabled={safeSchedulePage >= scheduleTotalPages} onClick={() => setSchedulePage((current) => Math.min(scheduleTotalPages, current + 1))} className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1 disabled:opacity-50">{t("next")}</button>
                  </div>
                </div>
              ) : null}
            </section>

            {unscheduledJobs.length > 0 ? (
              <section className={`${schedulePanelClass} p-4`}>
                <p className={scheduleEyebrowClass}>{t("unscheduledJobs")}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {pagedUnscheduledJobs.map((job) => {
                    const customer = relationValue(job.customer);
                    return (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => setSelectedJobId(job.id)}
                        className={`rounded-[16px] border px-3 py-2 text-left ${effectiveSelectedJobId === job.id ? "theme-selected-card" : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]"}`}
                      >
                        <p className="text-sm font-medium text-[color:var(--sem-text-primary)]">{job.title}</p>
                        <p className="text-xs text-[color:var(--sem-text-muted)]">{customer?.full_name ?? t("customerPending")}</p>
                      </button>
                    );
                  })}
                </div>
                {unscheduledJobs.length > SCHEDULE_ITEMS_PER_PAGE ? (
                  <div className="mt-3 flex items-center justify-between text-xs text-[color:var(--sem-text-muted)]">
                    <span>{t("showingUnscheduled", { start: unscheduledStartIndex + 1, end: Math.min(unscheduledStartIndex + SCHEDULE_ITEMS_PER_PAGE, unscheduledJobs.length), totalCount: unscheduledJobs.length })}</span>
                    <div className="flex gap-2">
                      <button type="button" disabled={safeUnscheduledPage <= 1} onClick={() => setUnscheduledPage((p) => Math.max(1, p - 1))} className="rounded-full border px-2 py-1 disabled:opacity-50">{t("previous")}</button>
                      <button type="button" disabled={safeUnscheduledPage >= unscheduledTotalPages} onClick={() => setUnscheduledPage((p) => Math.min(unscheduledTotalPages, p + 1))} className="rounded-full border px-2 py-1 disabled:opacity-50">{t("next")}</button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <aside className="mt-6 xl:sticky xl:top-4 xl:mt-0 xl:max-h-[calc(100vh-1.5rem)] xl:self-start xl:overflow-y-auto">
            <section className={`${schedulePanelClass} p-5`}>
              <p className={scheduleEyebrowClass}>{t("selectedAppointment")}</p>
              {selectedJob && selectedCustomer && nextDispatchMove ? (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold text-[color:var(--sem-display-headline)]">{selectedCustomer.full_name}</h2>
                    <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{selectedJob.title}</p>
                    <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] uppercase ${statusTone(selectedJob.status)}`}>
                      {getJobStatusLabel(selectedJob.status, locale)}
                    </span>
                  </div>

                  <div className="rounded-[20px] border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] p-4">
                    <p className={scheduleEyebrowClass}>{t("nextDispatchMove")}</p>
                    <p className="mt-2 font-semibold text-[color:var(--sem-text-primary)]">{nextDispatchMove.title}</p>
                    <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{nextDispatchMove.detail}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
                      <p className={scheduleEyebrowClass}>{t("customer")}</p>
                      <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{selectedCustomer.full_name}</p>
                      {selectedCustomer.phone ? (
                        <a href={`tel:${selectedCustomer.phone}`} className="mt-1 inline-flex items-center gap-1 text-sm text-[color:var(--sem-accent-primary)]">
                          <Phone className="h-3.5 w-3.5" />
                          {selectedCustomer.phone}
                        </a>
                      ) : null}
                    </div>
                    <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
                      <p className={scheduleEyebrowClass}>{t("time")}</p>
                      <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">
                        {formatScheduleTimeRange(selectedJob.scheduled_for, selectedJob.scheduled_window, locale, t("timeNotSet"))}
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{selectedTechnician?.display_name ?? t("unassigned")}</p>
                    </div>
                    <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3 sm:col-span-2">
                      <p className={scheduleEyebrowClass}>{t("scheduleValue")}</p>
                      <p className="mt-2 font-[family:var(--font-geist-mono)] text-xl font-semibold text-[color:var(--sem-display-headline)]">{formatCurrency(getJobValueCents(selectedJob))}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Link href={`/jobs/${selectedJob.id}`} className="theme-btn-primary inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-semibold">{t("openJob")}</Link>
                    {selectedJobMapsUrl ? (
                      <a href={selectedJobMapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-2 text-sm text-[color:var(--sem-text-primary)]">
                        <ExternalLink className="h-4 w-4" />
                        {t("mapRoute")}
                      </a>
                    ) : null}
                  </div>

                  <ScheduleEditor
                    key={selectedJob.id}
                    job={selectedJob}
                    technicians={technicians}
                    isPending={isPending}
                    locale={locale}
                    t={t}
                    onSave={(form) => {
                      startTransition(() => {
                        void (async () => {
                          try {
                            await saveSchedule(selectedJob.id, form);
                          } catch (error) {
                            setErrorMessage(error instanceof Error ? error.message : t("updateError"));
                            setStatusMessage(null);
                          }
                        })();
                      });
                    }}
                  />
                </div>
              ) : (
                <p className="mt-4 text-sm text-[color:var(--sem-text-secondary)]">{t("selectJob")}</p>
              )}
            </section>
          </aside>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <section className={`${schedulePanelClass} p-5`}>
            <p className={scheduleEyebrowClass}>{t("technicianLoad")}</p>
            <div className="mt-4 space-y-3">
              {technicianLoads.map((entry) => (
                <div key={entry.technicianId} className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{entry.name}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${entry.tone === "danger" ? "theme-status-error" : entry.tone === "warning" ? "theme-status-warning" : entry.tone === "primary" ? "theme-status-info" : "theme-status-success"}`}>{entry.loadPercent}%</span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{entry.jobs} {t("jobsShort")}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--cmp-surface-soft)]">
                    <div className="h-full rounded-full bg-[color:var(--sem-accent-primary)]" style={{ width: `${entry.loadPercent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={`${schedulePanelClass} p-5`}>
            <p className={scheduleEyebrowClass}>{t("openWindowsTitle")}</p>
            <div className="mt-4 space-y-3">
              {openWindows.length > 0 ? openWindows.slice(0, 6).map((window) => (
                <div key={window.id} className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-[family:var(--font-geist-mono)] text-sm font-semibold text-[color:var(--sem-text-primary)]">{window.timeLabel}</p>
                    <span className="text-xs font-semibold text-[color:var(--sem-accent-primary)]">{formatCurrency(window.profitPotentialCents)}</span>
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--sem-text-primary)]">{window.area}</p>
                  <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{window.technicianName} · {window.useLabel}</p>
                </div>
              )) : (
                <p className="text-sm text-[color:var(--sem-text-secondary)]">{t("noOpenWindows")}</p>
              )}
            </div>
          </section>

          <section className={`${schedulePanelClass} p-5`}>
            <div className="flex items-center justify-between gap-2">
              <p className={scheduleEyebrowClass}>{t("dispatchRisks")}</p>
              <ShieldAlert className="h-4 w-4 text-[color:var(--sem-state-warning)]" />
            </div>
            <div className="mt-4 space-y-3">
              {dispatchRisks.length > 0 ? dispatchRisks.map((risk) => (
                <div key={risk.id} className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
                  <p className={`text-sm font-semibold ${riskToneClass(risk.tone)}`}>{risk.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--sem-text-secondary)]">{risk.detail}</p>
                </div>
              )) : (
                <p className="text-sm text-[color:var(--sem-text-secondary)]">{t("noDispatchRisks")}</p>
              )}
            </div>
          </section>
        </div>

        {!SHOW_LEGACY_WEEK_GRID ? (
          <div className="hidden" aria-hidden="true" data-schedule-legacy-week-grid="true">
            {visibleDays.map((day) => (
              <div key={day.toISOString()}>{formatDayHeading(day, locale)} · {countJobsByDay(day)} · {groupJobsByDay(day).length}</div>
            ))}
          </div>
        ) : null}
      </div>
      </div>
    </BoardShell>
  );
}

function formatTimeInputLabel(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(`2000-01-01T${value}`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function parseTimeLabelToInput(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i);

  if (!match) {
    return "";
  }

  const [, hourPart, minutePart = "00", meridiemRaw] = match;
  const meridiem = meridiemRaw.toUpperCase();
  let hours = Number.parseInt(hourPart, 10);

  if (meridiem === "PM" && hours < 12) {
    hours += 12;
  }

  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }

  return `${String(hours).padStart(2, "0")}:${minutePart}`;
}

function deriveScheduledEndTime(job: JobRecord | null, scheduledTime: string) {
  const windowEnd = job?.scheduled_window?.match(/-\s*([0-9]{1,2}(?::[0-9]{2})?\s*[AP]M)/i)?.[1];

  if (windowEnd) {
    return parseTimeLabelToInput(windowEnd);
  }

  if (!scheduledTime) {
    return "";
  }

  const start = new Date(`2000-01-01T${scheduledTime}`);

  if (Number.isNaN(start.getTime())) {
    return "";
  }

  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return end.toTimeString().slice(0, 5);
}

function buildScheduledWindow(startTime: string, endTime: string) {
  if (!startTime || !endTime) {
    return null;
  }

  return `${formatTimeInputLabel(startTime)} - ${formatTimeInputLabel(endTime)}`;
}
