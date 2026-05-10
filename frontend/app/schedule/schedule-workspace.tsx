"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  LogOut,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  UserRound,
} from "lucide-react";

import { handleLogout } from "@/lib/auth/logout";
import { formatAddress } from "@/lib/crm/display";
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

function relationValue<T>(value: RelatedValue<T> | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function SectionFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,12,12,0.94),rgba(18,18,18,0.88))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:p-6">
      <p className="text-[11px] uppercase tracking-[0.38em] text-white/36">{subtitle}</p>
      <h2 className="mt-3 font-[family:var(--font-flat-display)] text-3xl tracking-tight text-[#f5ecd2]">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[11px] uppercase tracking-[0.28em] text-white/38">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
    </article>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 text-sm text-white/66">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-[18px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-[color:rgba(212,175,55,0.34)] ${props.className ?? ""}`}
    />
  );
}

function FieldSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-[18px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-[color:rgba(212,175,55,0.34)] ${props.className ?? ""}`}
    />
  );
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

function formatDayHeading(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatVisibleRange(dates: Date[]) {
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  if (!firstDate || !lastDate) {
    return "";
  }

  if (isSameCalendarDay(firstDate, lastDate)) {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(firstDate);
  }

  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(firstDate)} - ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(lastDate)}`;
}

function formatTimeOnly(value: string | null) {
  if (!value) {
    return "Time not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatScheduleTimeRange(value: string | null, windowLabel: string | null) {
  if (windowLabel?.trim()) {
    return windowLabel.replace(/\s+/g, " ");
  }

  if (!value) {
    return "Time not set";
  }

  const start = new Date(value);

  if (Number.isNaN(start.getTime())) {
    return "Time not set";
  }

  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  return `${formatTimeOnly(value)} - ${new Intl.DateTimeFormat("en-US", {
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
}: {
  job: JobRecord;
  technicians: TechnicianRecord[];
  isPending: boolean;
  onSave: (form: ScheduleFormState) => void;
}) {
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(() => buildScheduleForm(job));

  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-[0.34em] text-white/34">Basic Scheduling</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldLabel label="Technician">
          <FieldSelect
            value={scheduleForm.assignedTechnicianId}
            onChange={(event) => setScheduleForm((current) => ({ ...current, assignedTechnicianId: event.target.value }))}
          >
            <option value="">Unassigned</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>{technician.display_name}</option>
            ))}
          </FieldSelect>
        </FieldLabel>
        <FieldLabel label="Service Type">
          <FieldInput value={getServiceTypeLabel(job.requested_service_type)} readOnly aria-readonly />
        </FieldLabel>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldLabel label="Scheduled Date">
          <FieldInput
            type="date"
            value={scheduleForm.scheduledDate}
            onChange={(event) => setScheduleForm((current) => ({ ...current, scheduledDate: event.target.value }))}
          />
        </FieldLabel>
        <FieldLabel label="Start Time">
          <FieldInput
            type="time"
            value={scheduleForm.scheduledTime}
            onChange={(event) => setScheduleForm((current) => ({ ...current, scheduledTime: event.target.value }))}
          />
        </FieldLabel>
      </div>
      <FieldLabel label="End Time">
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
        className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] border border-white/10 bg-white/[0.06] px-5 py-3 text-sm text-white/76 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save schedule
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
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRecord[]>(() => sortJobs(initialJobs));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [technicianFilter, setTechnicianFilter] = useState<string>("all");
  const [schedulePage, setSchedulePage] = useState(1);
  const [unscheduledPage, setUnscheduledPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleDays = viewMode === "day"
    ? [startOfDay(selectedDate)]
    : Array.from({ length: 7 }, (_, index) => addDays(getWeekStart(selectedDate), index));

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
  const scheduleTotalPages = Math.max(1, Math.ceil(visibleScheduledJobs.length / SCHEDULE_ITEMS_PER_PAGE));
  const safeSchedulePage = Math.min(schedulePage, scheduleTotalPages);
  const scheduleStartIndex = (safeSchedulePage - 1) * SCHEDULE_ITEMS_PER_PAGE;
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
    : (visibleScheduledJobs[0]?.id ?? unscheduledJobs[0]?.id ?? null);
  const selectedJob = filteredJobs.find((job) => job.id === effectiveSelectedJobId) ?? null;
  const selectedCustomer = relationValue(selectedJob?.customer);
  const selectedTechnician = relationValue(selectedJob?.technician);

  function shiftRange(direction: -1 | 1) {
    setSelectedDate((currentDate) => addDays(currentDate, viewMode === "day" ? direction : direction * 7));
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
      throw new Error("Choose a valid scheduled date, start time, and end time.");
    }

    if (new Date(scheduledEnd).getTime() <= new Date(scheduledFor).getTime()) {
      throw new Error("Choose an end time later than the start time.");
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
    setStatusMessage("Schedule updates were saved.");
    setErrorMessage(null);
    setSelectedJobId(updatedJob.id);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[color:var(--flat-canvas)] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(80,200,120,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_32%)]" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px]" />

      <div className="relative mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
        <header className="rounded-[34px] border border-[color:rgba(212,175,55,0.18)] bg-[linear-gradient(180deg,rgba(9,9,9,0.94),rgba(18,18,18,0.88))] p-6 shadow-[0_34px_120px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.42em] text-[color:var(--flat-gold)]">
                Phoenix Fireplace CRM
              </p>
              <h1 className="mt-4 max-w-3xl font-[family:var(--font-flat-display)] text-5xl leading-none tracking-tight text-[#f5ecd2] sm:text-6xl">
                Schedule board for dispatch, technician coverage, and upcoming service work.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/56 sm:text-base">
                Review jobs by day or week, see who is assigned, and make basic scheduling updates without leaving the calendar view.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/jobs"
                className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/72 transition hover:border-white/20 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to jobs
              </Link>
              <Link
                href="/dispatch"
                className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/72 transition hover:border-white/20 hover:text-white"
              >
                <MapPin className="h-4 w-4" />
                Dispatch view
              </Link>
              <button
                type="button"
                onClick={() => {
                  startTransition(() => {
                    void handleLogout(router);
                  });
                }}
                className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/72 transition hover:border-white/20 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Visible Jobs" value={visibleScheduledJobs.length} />
            <MetricCard label="Unscheduled" value={unscheduledJobs.length} />
            <MetricCard label="Active Technicians" value={technicians.length} />
            <MetricCard label="Selected Range" value={visibleDays.length} />
          </div>
        </header>

        {(errorMessage || statusMessage) && (
          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className={`rounded-[22px] border px-4 py-3 text-sm ${errorMessage ? "border-rose-500/30 bg-rose-500/10 text-rose-100" : "border-[color:rgba(212,175,55,0.24)] bg-[color:rgba(212,175,55,0.1)] text-[#f5d980]"}`}>
              {errorMessage ?? statusMessage}
            </div>
            <button
              type="button"
              onClick={() => {
                startTransition(() => {
                  void (async () => {
                    try {
                      await refreshJobs();
                      setStatusMessage("Schedule data was refreshed.");
                      setErrorMessage(null);
                    } catch (error) {
                      setErrorMessage(error instanceof Error ? error.message : "The schedule could not be refreshed.");
                    }
                  })();
                });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/72 transition hover:border-white/20 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
              Refresh schedule
            </button>
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_420px]">
          <div className="space-y-6">
            <SectionFrame title="Schedule View" subtitle="Calendar">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm text-white/46">{formatVisibleRange(visibleDays)}</p>
                  <p className="mt-2 text-sm text-white/38">
                    Review jobs by date, then select any item for a quick schedule edit.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => shiftRange(-1)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(startOfDay(new Date()))}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => shiftRange(1)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="inline-flex rounded-full border border-white/10 bg-black/25 p-1">
                    {(["day", "week"] as ViewMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setViewMode(mode)}
                        className={`rounded-full px-4 py-2 text-sm transition ${viewMode === mode ? "bg-[color:rgba(212,175,55,0.18)] text-[#f5d980]" : "text-white/56 hover:text-white"}`}
                      >
                        {mode === "day" ? "Day" : "Week"}
                      </button>
                    ))}
                  </div>
                  <FieldSelect value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)}>
                    <option value="all">All technicians</option>
                    {technicians.map((technician) => (
                      <option key={technician.id} value={technician.id}>
                        {technician.display_name}
                      </option>
                    ))}
                  </FieldSelect>
                </div>
              </div>

              <div className={`mt-6 grid gap-4 ${viewMode === "week" ? "xl:grid-cols-7" : "max-h-[680px] grid-cols-1 overflow-y-auto pr-1"}`}>
                {visibleDays.map((day) => {
                  const jobsForDay = groupJobsByDay(day);
                  const totalJobsForDay = countJobsByDay(day);

                  return (
                    <article key={day.toISOString()} className={`rounded-[24px] border border-white/10 bg-black/20 p-4 ${viewMode === "week" ? "flex min-h-[420px] flex-col" : ""}`}>
                      <div className="flex shrink-0 items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--flat-gold)]">{viewMode === "day" ? "Selected Day" : "Day"}</p>
                          <h3 className="mt-2 text-lg font-semibold text-[#f5ecd2]">{formatDayHeading(day)}</h3>
                        </div>
                        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/56">
                          {totalJobsForDay} job{totalJobsForDay === 1 ? "" : "s"}
                        </span>
                      </div>

                      <div className={`mt-4 space-y-3 ${viewMode === "week" ? "min-h-0 flex-1 overflow-y-auto pr-1" : ""}`}>
                        {jobsForDay.length > 0 ? jobsForDay.map((job) => {
                          const customer = relationValue(job.customer);
                          const technician = relationValue(job.technician);
                          const service = relationValue(job.service);
                          const scheduledDateLabel = job.scheduled_for ? formatDayHeading(new Date(job.scheduled_for)) : "Not scheduled";
                          const scheduledTimeLabel = formatScheduleTimeRange(job.scheduled_for, job.scheduled_window);

                          return (
                            <button
                              key={job.id}
                              type="button"
                              onClick={() => {
                                setSelectedJobId(job.id);
                                setStatusMessage(null);
                              }}
                              className={`w-full rounded-[20px] border text-left transition ${viewMode === "week" ? "p-3" : "p-4"} ${selectedJobId === job.id ? "border-[color:rgba(212,175,55,0.28)] bg-[color:rgba(212,175,55,0.08)]" : "border-white/10 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.05]"}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-white">{job.title}</p>
                                  <p className="mt-1 text-xs text-white/48">
                                    {viewMode === "week"
                                      ? (service?.name ?? getServiceTypeLabel(job.requested_service_type))
                                      : (customer?.full_name ?? "Customer pending")}
                                  </p>
                                </div>
                                {viewMode === "day" ? (
                                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-white/56">
                                    {getJobStatusLabel(job.status)}
                                  </span>
                                ) : null}
                              </div>

                              {viewMode === "week" ? (
                                <div className="mt-3 space-y-1 text-xs text-white/52">
                                  <p>{scheduledTimeLabel}</p>
                                  <p>{technician?.display_name ?? "Unassigned"}</p>
                                </div>
                              ) : (
                              <div className="mt-3 grid gap-2 rounded-[18px] border border-white/10 bg-black/20 p-3 text-xs text-white/52">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="uppercase tracking-[0.16em] text-white/34">Date</span>
                                  <span className="text-white/74">{scheduledDateLabel}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="uppercase tracking-[0.16em] text-white/34">Time</span>
                                  <span className="text-white/74">{scheduledTimeLabel}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="uppercase tracking-[0.16em] text-white/34">Customer</span>
                                  <span className="text-right text-white/74">{customer?.full_name ?? "Customer pending"}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="uppercase tracking-[0.16em] text-white/34">Technician</span>
                                  <span className="text-right text-white/74">{technician?.display_name ?? "Unassigned"}</span>
                                </div>
                              </div>
                              )}
                            </button>
                          );
                        }) : (
                          <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-white/42">
                            No jobs scheduled for this date.
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {viewMode === "day" && visibleScheduledJobs.length > 0 ? (
                <div className="mt-5 flex flex-col gap-3 rounded-[22px] border border-white/10 bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-white/52">
                    Showing {scheduleStartIndex + 1}-{Math.min(scheduleStartIndex + SCHEDULE_ITEMS_PER_PAGE, visibleScheduledJobs.length)} of {visibleScheduledJobs.length} scheduled jobs
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={safeSchedulePage <= 1}
                      onClick={() => setSchedulePage((current) => Math.max(1, current - 1))}
                      className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-white/52">
                      Page {safeSchedulePage} of {scheduleTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeSchedulePage >= scheduleTotalPages}
                      onClick={() => setSchedulePage((current) => Math.min(scheduleTotalPages, current + 1))}
                      className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </SectionFrame>

            <SectionFrame title="Unscheduled Jobs" subtitle="Overflow">
              {unscheduledJobs.length > 0 ? (
                <>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {pagedUnscheduledJobs.map((job) => {
                      const customer = relationValue(job.customer);
                      const technician = relationValue(job.technician);

                      return (
                        <button
                          key={job.id}
                          type="button"
                          onClick={() => setSelectedJobId(job.id)}
                          className={`rounded-[22px] border p-4 text-left transition ${selectedJobId === job.id ? "border-[color:rgba(212,175,55,0.28)] bg-[color:rgba(212,175,55,0.08)]" : "border-white/10 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.05]"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-white">{job.title}</p>
                              <p className="mt-1 text-sm text-white/52">{customer?.full_name ?? "Customer pending"}</p>
                            </div>
                            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-white/56">
                              {getJobStatusLabel(job.status)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/46">
                            <span className="inline-flex items-center gap-1.5">
                              <UserRound className="h-3.5 w-3.5 text-[color:var(--flat-gold)]" />
                              {technician?.display_name ?? "Unassigned"}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="h-3.5 w-3.5 text-[color:var(--flat-gold)]" />
                              Not scheduled
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5 flex flex-col gap-3 rounded-[22px] border border-white/10 bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-white/52">
                      Showing {unscheduledStartIndex + 1}-{Math.min(unscheduledStartIndex + SCHEDULE_ITEMS_PER_PAGE, unscheduledJobs.length)} of {unscheduledJobs.length} unscheduled jobs
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={safeUnscheduledPage <= 1}
                        onClick={() => setUnscheduledPage((current) => Math.max(1, current - 1))}
                        className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <span className="text-sm text-white/52">
                        Page {safeUnscheduledPage} of {unscheduledTotalPages}
                      </span>
                      <button
                        type="button"
                        disabled={safeUnscheduledPage >= unscheduledTotalPages}
                        onClick={() => setUnscheduledPage((current) => Math.min(unscheduledTotalPages, current + 1))}
                        className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-white/42">
                  Every visible job already has a scheduled date.
                </div>
              )}
            </SectionFrame>
          </div>

          <div className="space-y-6 xl:sticky xl:top-5 xl:self-start">
            <SectionFrame title="Selected Job" subtitle="Quick Edit">
              {selectedJob && selectedCustomer ? (
                <div className="space-y-6">
                  <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xl font-semibold tracking-tight text-white">{selectedJob.title}</p>
                        <p className="mt-1 text-sm text-white/52">{selectedCustomer.full_name}</p>
                      </div>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-white/60">
                        {getJobStatusLabel(selectedJob.status)}
                      </span>
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-white/56">
                      <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-[color:var(--flat-gold)]" />{formatAddress(selectedJob.service_address_line_1, selectedJob.service_address_line_2, selectedJob.service_city, selectedJob.service_state_or_region, selectedJob.service_postal_code)}</div>
                      <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-[color:var(--flat-gold)]" />{selectedCustomer.phone}</div>
                      <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[color:var(--flat-gold)]" />{selectedJob.scheduled_for ? formatDayHeading(new Date(selectedJob.scheduled_for)) : "No date selected"}</div>
                      <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[color:var(--flat-gold)]" />{formatScheduleTimeRange(selectedJob.scheduled_for, selectedJob.scheduled_window)}</div>
                      <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-[color:var(--flat-gold)]" />{selectedTechnician?.display_name ?? "Unassigned"}</div>
                    </div>
                  </div>

                    <ScheduleEditor
                      key={selectedJob.id}
                      job={selectedJob}
                      technicians={technicians}
                      isPending={isPending}
                      onSave={(form) => {
                        startTransition(() => {
                          void (async () => {
                            try {
                              await saveSchedule(selectedJob.id, form);
                            } catch (error) {
                              setErrorMessage(error instanceof Error ? error.message : "The schedule could not be updated.");
                              setStatusMessage(null);
                            }
                          })();
                        });
                      }}
                    />
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-white/42">
                  Select a job from the schedule to review the assignment and update its timing.
                </div>
              )}
            </SectionFrame>
          </div>
        </div>
      </div>
    </main>
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
