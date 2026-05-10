"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  LoaderCircle,
  MapPin,
  Phone,
  Receipt,
  Save,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import { formatAddress, formatDateTime } from "@/lib/crm/display";
import {
  canTransitionJobStatus,
  getJobStatusLabel,
  getServiceTypeLabel,
  jobStatuses,
  type JobStatus,
} from "@/lib/crm/statuses";
import type { Database } from "@/lib/types/database";

import JobInvoiceSection, { type JobInvoiceRecord } from "./job-invoice-section";
import JobQuoteSection, { type JobQuoteRecord } from "./job-quote-section";

type RelatedValue<T> = T | T[] | null;

type CustomerRecord = Pick<
  Database["public"]["Tables"]["customers"]["Row"],
  "id" | "full_name" | "phone" | "email"
>;

type TechnicianRecord = Pick<
  Database["public"]["Tables"]["technicians"]["Row"],
  "id" | "display_name" | "phone" | "specialties" | "is_active"
>;

type ServiceRecord = Pick<
  Database["public"]["Tables"]["services"]["Row"],
  "id" | "name" | "service_type" | "duration_minutes" | "default_price_cents"
>;

type JobNoteRecord = {
  id: number;
  job_id: string;
  author_profile_id: string | null;
  author_name: string | null;
  findings: string | null;
  recommendations: string | null;
  photo_urls: string[];
  created_at: string;
  updated_at: string;
};

type JobDetailRecord = Pick<
  Database["public"]["Tables"]["jobs"]["Row"],
  | "id"
  | "customer_id"
  | "assigned_technician_id"
  | "title"
  | "description"
  | "requested_service_type"
  | "status"
  | "service_address_line_1"
  | "service_address_line_2"
  | "service_city"
  | "service_state_or_region"
  | "service_postal_code"
  | "scheduled_for"
  | "scheduled_window"
  | "cancellation_reason"
  | "cancelled_at"
  | "cancelled_by"
  | "created_at"
  | "updated_at"
> & {
  customer: RelatedValue<CustomerRecord>;
  service: RelatedValue<ServiceRecord>;
  technician: RelatedValue<TechnicianRecord>;
  quote: RelatedValue<JobQuoteRecord>;
  invoice: RelatedValue<JobInvoiceRecord>;
  notes: JobNoteRecord[];
};

type JobListRecord = {
  id: string;
  title: string;
  status: JobStatus;
  scheduled_for: string | null;
  scheduled_window: string | null;
  customer: RelatedValue<CustomerRecord>;
};

type ToastTone = "success" | "error" | "warning";
type JobTab = "scheduling" | "notes" | "quote" | "invoice";
type ArrivalWindowOption = "30m" | "1h" | "2h";

type ScheduleFormState = {
  assignedTechnicianId: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  arrivalWindow: ArrivalWindowOption;
  syncCalendar: boolean;
};

type WorkspaceToast = {
  id: number;
  message: string;
  tone: ToastTone;
};

type JobDetailWorkspaceProps = {
  initialJob: JobDetailRecord;
  assignmentTechnicians: TechnicianRecord[];
  googleMapsUrl: string;
};

const ITEMS_PER_PAGE = 4;
const DEFAULT_DURATION_MINUTES = 120;
const EARLY_STAGE_STATUSES: JobStatus[] = ["new_lead", "contacted"];

function relationValue<T>(value: RelatedValue<T> | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatNoteDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function parsePage(value: string | null) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(1, page), totalPages);
}

function usePagedItems<T>(items: T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const currentPage = clampPage(page, totalPages);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;

  return {
    currentPage,
    totalPages,
    pageItems: items.slice(startIndex, startIndex + ITEMS_PER_PAGE),
  };
}

function localDateTimeParts(value: string | null) {
  if (!value) {
    return {
      date: "",
      time: "",
    };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      date: "",
      time: "",
    };
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  const [nextDate, nextTime] = localDate.toISOString().slice(0, 16).split("T");

  return {
    date: nextDate ?? "",
    time: nextTime ?? "",
  };
}

function combineDateTime(date: string, time: string) {
  if (!date || !time) {
    return null;
  }

  const nextDate = new Date(`${date}T${time}`);
  return Number.isNaN(nextDate.getTime()) ? null : nextDate;
}

function inferArrivalWindow(value: string | null): ArrivalWindowOption {
  if (!value) {
    return "1h";
  }

  if (value.includes("30m")) {
    return "30m";
  }

  if (value.includes("2h")) {
    return "2h";
  }

  return "1h";
}

function parseTimeLabelToInput(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);

  if (!match) {
    return "";
  }

  const [, hourPart, minutePart, meridiemRaw] = match;
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

function deriveEndTimeInput(scheduledFor: string | null, scheduledWindow: string | null) {
  const fromWindow = scheduledWindow?.match(/-\s*([0-9]{1,2}:[0-9]{2}\s*[AP]M)/i)?.[1];

  if (fromWindow) {
    return parseTimeLabelToInput(fromWindow);
  }

  const startDate = scheduledFor ? new Date(scheduledFor) : null;

  if (!startDate || Number.isNaN(startDate.getTime())) {
    return "";
  }

  const endDate = new Date(startDate.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
  return localDateTimeParts(endDate.toISOString()).time;
}

function formatTimeLabel(value: string) {
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

function buildScheduledWindow(startTime: string, endTime: string, arrivalWindow: ArrivalWindowOption) {
  if (!startTime || !endTime) {
    return null;
  }

  return `${formatTimeLabel(startTime)} - ${formatTimeLabel(endTime)} • Arrival ${arrivalWindow}`;
}

function buildScheduleForm(job: JobDetailRecord): ScheduleFormState {
  const scheduledParts = localDateTimeParts(job.scheduled_for);

  return {
    assignedTechnicianId: job.assigned_technician_id ?? "",
    scheduledDate: scheduledParts.date,
    startTime: scheduledParts.time,
    endTime: deriveEndTimeInput(job.scheduled_for, job.scheduled_window),
    arrivalWindow: inferArrivalWindow(job.scheduled_window),
    syncCalendar: false,
  };
}

function technicianInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function statusBadgeClass(status: JobStatus) {
  if (status === "cancelled") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (status === "new_lead") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  if (status === "contacted") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "scheduled" || status === "on_the_way") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (status === "in_progress" || status === "waiting_for_approval") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function toastClass(tone: ToastTone) {
  if (tone === "error") {
    return "border-rose-200 bg-white text-rose-700";
  }

  if (tone === "warning") {
    return "border-amber-200 bg-white text-amber-700";
  }

  return "border-emerald-200 bg-white text-emerald-700";
}

function noteDraftKey(jobId: string) {
  return `phoenix-job-note-draft:${jobId}`;
}

function isActiveTab(value: string | null): value is JobTab {
  return value === "scheduling" || value === "notes" || value === "quote" || value === "invoice";
}

function buildComparisonWindow(job: JobListRecord) {
  if (!job.scheduled_for) {
    return null;
  }

  const start = new Date(job.scheduled_for);

  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const endTimeInput = deriveEndTimeInput(job.scheduled_for, job.scheduled_window);
  const localParts = localDateTimeParts(job.scheduled_for);
  const derivedEnd = combineDateTime(localParts.date, endTimeInput);
  const end = derivedEnd && derivedEnd.getTime() > start.getTime()
    ? derivedEnd
    : new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);

  return { start, end };
}

function windowsOverlap(leftStart: Date, leftEnd: Date, rightStart: Date, rightEnd: Date) {
  return leftStart.getTime() < rightEnd.getTime() && leftEnd.getTime() > rightStart.getTime();
}

function PaginationFooter({
  page,
  totalPages,
  totalCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  if (totalCount <= ITEMS_PER_PAGE) {
    return null;
  }

  const start = (page - 1) * ITEMS_PER_PAGE + 1;
  const end = Math.min(page * ITEMS_PER_PAGE, totalCount);

  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-[color:var(--cmp-border-subtle)] pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[color:var(--sem-text-muted)]">
        Showing {start}-{end} of {totalCount}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="theme-btn-secondary rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm text-[color:var(--sem-text-secondary)]">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="theme-btn-secondary rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function JobDetailWorkspace({
  initialJob,
  assignmentTechnicians,
  googleMapsUrl,
}: JobDetailWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [job, setJob] = useState<JobDetailRecord>(initialJob);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(() => buildScheduleForm(initialJob));
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelComposer, setShowCancelComposer] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [conflicts, setConflicts] = useState<JobListRecord[]>([]);
  const [noteFindingsDraft, setNoteFindingsDraft] = useState("");
  const [noteRecommendationsDraft, setNoteRecommendationsDraft] = useState("");
  const [toast, setToast] = useState<WorkspaceToast | null>(null);

  const activeTabParam = searchParams.get("tab");
  const activeTab: JobTab = isActiveTab(activeTabParam) ? activeTabParam : "scheduling";
  const notesPage = parsePage(searchParams.get("notesPage"));
  const customer = relationValue(job.customer);
  const technician = relationValue(job.technician);
  const quote = relationValue(job.quote);
  const invoice = relationValue(job.invoice);
  const invoiceBalanceCents = invoice?.balance_cents ?? invoice?.amount_cents ?? 0;
  const sortedNotes = useMemo(
    () => [...job.notes].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()),
    [job.notes],
  );
  const pagedNotes = usePagedItems(sortedNotes, notesPage);
  const availableStatuses = useMemo(
    () => jobStatuses.filter((status) => status === job.status || canTransitionJobStatus(job.status, status)),
    [job.status],
  );
  const selectedTechnician =
    assignmentTechnicians.find((candidate) => candidate.id === scheduleForm.assignedTechnicianId) ?? null;
  const nextScheduledStart = combineDateTime(scheduleForm.scheduledDate, scheduleForm.startTime);
  const nextScheduledEnd = combineDateTime(scheduleForm.scheduledDate, scheduleForm.endTime);
  const hasValidScheduleWindow = Boolean(
    nextScheduledStart && nextScheduledEnd && nextScheduledEnd.getTime() > nextScheduledStart.getTime(),
  );
  const hasScheduleChanges =
    scheduleForm.assignedTechnicianId !== (job.assigned_technician_id ?? "")
    || scheduleForm.scheduledDate !== localDateTimeParts(job.scheduled_for).date
    || scheduleForm.startTime !== localDateTimeParts(job.scheduled_for).time
    || scheduleForm.endTime !== deriveEndTimeInput(job.scheduled_for, job.scheduled_window)
    || buildScheduledWindow(scheduleForm.startTime, scheduleForm.endTime, scheduleForm.arrivalWindow) !== (job.scheduled_window ?? null);

  const tabs = useMemo(
    () => [
      { id: "scheduling" as const, label: "Scheduling", count: null, icon: CalendarDays },
      { id: "notes" as const, label: "Job Notes", count: job.notes.length, icon: FileText },
      { id: "quote" as const, label: "Create Quote", count: quote ? 1 : 0, icon: FileText },
      { id: "invoice" as const, label: "Create Invoice", count: invoice ? 1 : 0, icon: Receipt },
    ],
    [invoice, job.notes.length, quote],
  );

  function pushToast(message: string, tone: ToastTone = "success") {
    setToast({
      id: Date.now(),
      message,
      tone,
    });
  }

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 3200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toast]);

  useEffect(() => {
    setScheduleForm(buildScheduleForm(job));
  }, [job.assigned_technician_id, job.id, job.scheduled_for, job.scheduled_window]);

  useEffect(() => {
    const storedDraft = window.localStorage.getItem(noteDraftKey(job.id));

    if (!storedDraft) {
      setNoteFindingsDraft("");
      setNoteRecommendationsDraft("");
      return;
    }

    try {
      const parsed = JSON.parse(storedDraft) as {
        findings?: string;
        recommendations?: string;
      };

      setNoteFindingsDraft(parsed.findings ?? "");
      setNoteRecommendationsDraft(parsed.recommendations ?? "");
    } catch {
      setNoteFindingsDraft("");
      setNoteRecommendationsDraft("");
    }
  }, [job.id]);

  useEffect(() => {
    const trimmedFindings = noteFindingsDraft.trim();
    const trimmedRecommendations = noteRecommendationsDraft.trim();

    if (!trimmedFindings && !trimmedRecommendations) {
      window.localStorage.removeItem(noteDraftKey(job.id));
      return;
    }

    window.localStorage.setItem(
      noteDraftKey(job.id),
      JSON.stringify({
        findings: noteFindingsDraft,
        recommendations: noteRecommendationsDraft,
      }),
    );
  }, [job.id, noteFindingsDraft, noteRecommendationsDraft]);

  useEffect(() => {
    if (!scheduleForm.assignedTechnicianId || !hasValidScheduleWindow || scheduleForm.scheduledDate === "") {
      setConflicts([]);
      return;
    }

    let ignore = false;
    setIsCheckingConflicts(true);

    void crmApiFetch<JobListRecord[]>(`/api/jobs?technicianId=${encodeURIComponent(scheduleForm.assignedTechnicianId)}`)
      .then((jobs) => {
        if (ignore || !nextScheduledStart || !nextScheduledEnd) {
          return;
        }

        const overlapping = jobs.filter((candidate) => {
          if (candidate.id === job.id || candidate.status === "cancelled") {
            return false;
          }

          const comparisonWindow = buildComparisonWindow(candidate);

          if (!comparisonWindow) {
            return false;
          }

          return windowsOverlap(
            nextScheduledStart,
            nextScheduledEnd,
            comparisonWindow.start,
            comparisonWindow.end,
          );
        });

        setConflicts(overlapping);
      })
      .catch(() => {
        if (!ignore) {
          setConflicts([]);
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsCheckingConflicts(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [
    hasValidScheduleWindow,
    job.id,
    nextScheduledEnd,
    nextScheduledStart,
    scheduleForm.assignedTechnicianId,
    scheduleForm.scheduledDate,
  ]);

  function updateQuery(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(next)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }

    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  function setTab(tab: JobTab) {
    updateQuery({
      tab: tab === "scheduling" ? null : tab,
    });
  }

  function setPage(key: string, page: number) {
    updateQuery({
      [key]: page <= 1 ? null : String(page),
    });
  }

  async function applyStatusChange(nextStatus: JobStatus, note: string | null) {
    const previousJob = job;
    const optimisticJob: JobDetailRecord = {
      ...job,
      status: nextStatus,
      cancellation_reason: nextStatus === "cancelled" ? note : null,
    };

    setJob(optimisticJob);
    setIsUpdatingStatus(true);
    setShowCancelComposer(false);

    try {
      const response = await crmApiFetch<JobDetailRecord>(`/api/jobs/${job.id}/status`, {
        method: "POST",
        body: JSON.stringify({
          status: nextStatus,
          note,
        }),
      });

      setJob(response);
      setCancelReason("");
      pushToast(
        nextStatus === "cancelled"
          ? "Job cancelled and timeline updated."
          : `Job moved to ${getJobStatusLabel(nextStatus)}.`,
      );
    } catch (error) {
      setJob(previousJob);
      pushToast(error instanceof Error ? error.message : "The job status could not be updated.", "error");
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  async function saveSchedule() {
    if (!nextScheduledStart || !nextScheduledEnd) {
      pushToast("Choose a valid date, start time, and end time before saving the schedule.", "warning");
      return;
    }

    if (nextScheduledEnd.getTime() <= nextScheduledStart.getTime()) {
      pushToast("The end time must be later than the start time.", "warning");
      return;
    }

    setIsSavingSchedule(true);

    try {
      const response = await crmApiFetch<JobDetailRecord>(`/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          assignedTechnicianId: scheduleForm.assignedTechnicianId || null,
          scheduledFor: nextScheduledStart.toISOString(),
          scheduledWindow: buildScheduledWindow(
            scheduleForm.startTime,
            scheduleForm.endTime,
            scheduleForm.arrivalWindow,
          ),
        }),
      });

      let nextJob = response;
      setJob(response);

      if (EARLY_STAGE_STATUSES.includes(job.status)) {
        try {
          setJob((current) => ({ ...current, status: "scheduled" }));
          nextJob = await crmApiFetch<JobDetailRecord>(`/api/jobs/${job.id}/status`, {
            method: "POST",
            body: JSON.stringify({
              status: "scheduled",
              note: "Status advanced automatically after schedule confirmation.",
            }),
          });
          setJob(nextJob);
          pushToast("Schedule saved and job moved to Scheduled.");
        } catch (error) {
          setJob(response);
          pushToast(
            error instanceof Error
              ? `Schedule saved, but the status update failed: ${error.message}`
              : "Schedule saved, but the status update failed.",
            "warning",
          );
          return;
        }
      } else {
        pushToast("Scheduling details saved.");
      }

      if (scheduleForm.syncCalendar) {
        pushToast("Scheduling details saved. Calendar sync is ready for future integration.", "success");
      }

      setScheduleForm(buildScheduleForm(nextJob));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "The schedule could not be saved.", "error");
    } finally {
      setIsSavingSchedule(false);
    }
  }

  async function saveNote() {
    const findings = noteFindingsDraft.trim();
    const recommendations = noteRecommendationsDraft.trim();

    if (!findings && !recommendations) {
      pushToast("Add findings or recommendations before saving a note.", "warning");
      return;
    }

    setIsSavingNote(true);

    try {
      const nextNote = await crmApiFetch<JobNoteRecord>(`/api/jobs/${job.id}/notes`, {
        method: "POST",
        body: JSON.stringify({
          findings: findings || null,
          recommendations: recommendations || null,
          photoUrls: [],
        }),
      });

      setJob((current) => ({
        ...current,
        notes: [nextNote, ...current.notes],
      }));
      setNoteFindingsDraft("");
      setNoteRecommendationsDraft("");
      window.localStorage.removeItem(noteDraftKey(job.id));
      setPage("notesPage", 1);
      pushToast("Job note saved.");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "The job note could not be saved.", "error");
    } finally {
      setIsSavingNote(false);
    }
  }

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      {toast ? (
        <div className="pointer-events-none fixed right-4 top-4 z-50">
          <div className={`pointer-events-auto min-w-[280px] rounded-[20px] border px-4 py-3 shadow-[0_24px_60px_rgba(15,23,42,0.12)] ${toastClass(toast.tone)}`}>
            <div className="flex items-start gap-3">
              {toast.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4" />
              ) : toast.tone === "warning" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4" />
              ) : (
                <ShieldCheck className="mt-0.5 h-4 w-4" />
              )}
              <p className="text-sm">{toast.message}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-6 py-6 lg:px-10">
        <section className="theme-surface-modal overflow-hidden rounded-[36px] border border-[color:var(--cmp-border-subtle)] shadow-[0_32px_90px_rgba(15,23,42,0.08)]">
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap gap-3">
              <Link
                href="/jobs"
                className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to jobs
              </Link>
              {customer ? (
                <Link
                  href={`/customers/${customer.id}`}
                  className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
                >
                  <UserRound className="h-4 w-4" />
                  Customer record
                </Link>
              ) : null}
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-2 text-sm text-[color:var(--sem-accent-primary)] transition hover:border-[color:var(--sem-accent-primary)]"
              >
                <ExternalLink className="h-4 w-4" />
                Open in Google Maps
              </a>
            </div>

            <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">Job Detail</p>
                <h1 className="mt-3 max-w-3xl font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                  {job.title}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                  Keep scheduling, field notes, quote creation, and invoice work in one place without leaving the job record.
                </p>
              </div>

              <div className="grid min-w-[280px] gap-3">
                <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Status Flow</p>
                  <div className="mt-3 flex flex-col gap-3">
                    <div className={`inline-flex w-fit rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${statusBadgeClass(job.status)}`}>
                      {getJobStatusLabel(job.status)}
                    </div>
                    <label className="block space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
                      <span>Update status</span>
                      <select
                        value={showCancelComposer ? "cancelled" : job.status}
                        onChange={(event) => {
                          const nextStatus = event.target.value as JobStatus;

                          if (nextStatus === job.status) {
                            setShowCancelComposer(false);
                            return;
                          }

                          if (nextStatus === "cancelled") {
                            setShowCancelComposer(true);
                            return;
                          }

                          setShowCancelComposer(false);
                          void applyStatusChange(nextStatus, null);
                        }}
                        disabled={isUpdatingStatus || availableStatuses.length <= 1}
                        className="w-full rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-3 text-sm text-[color:var(--sem-text-primary)] outline-none transition focus:border-[color:var(--sem-accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {availableStatuses.map((status) => (
                          <option key={status} value={status}>
                            {getJobStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </label>

                    {showCancelComposer ? (
                      <div className="rounded-[18px] border border-rose-200 bg-rose-50 p-4">
                        <label className="block space-y-2 text-sm text-rose-700">
                          <span>Cancellation reason</span>
                          <textarea
                            value={cancelReason}
                            onChange={(event) => setCancelReason(event.target.value)}
                            placeholder="Why is this job being cancelled?"
                            className="min-h-[110px] w-full rounded-[16px] border border-rose-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-rose-300"
                          />
                        </label>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            disabled={isUpdatingStatus}
                            onClick={() => {
                              if (!cancelReason.trim()) {
                                pushToast("A cancellation reason is required.", "warning");
                                return;
                              }

                              void applyStatusChange("cancelled", cancelReason.trim());
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isUpdatingStatus ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                            Confirm cancellation
                          </button>
                          <button
                            type="button"
                            disabled={isUpdatingStatus}
                            onClick={() => {
                              setShowCancelComposer(false);
                              setCancelReason("");
                            }}
                            className="theme-btn-secondary inline-flex items-center justify-center rounded-full px-4 py-2 text-sm"
                          >
                            Keep job active
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <article className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Scheduled</p>
                <p className="mt-2 text-xl font-semibold text-[color:var(--sem-text-primary)]">{formatDateTime(job.scheduled_for)}</p>
                <p className="mt-1 text-sm text-[color:var(--sem-text-muted)]">{job.scheduled_window ?? "Arrival window not set"}</p>
              </article>
              <article className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Assigned Technician</p>
                <p className="mt-2 text-xl font-semibold text-[color:var(--sem-text-primary)]">{technician?.display_name ?? "Unassigned"}</p>
                <p className="mt-1 text-sm text-[color:var(--sem-text-muted)]">{technician?.phone ?? "No technician phone on file"}</p>
              </article>
              <article className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Balance Due</p>
                <p className="mt-2 text-xl font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(invoiceBalanceCents)}</p>
                <p className="mt-1 text-sm text-[color:var(--sem-text-muted)]">{invoice ? "Live from the current invoice" : "Invoice has not been generated yet"}</p>
              </article>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto border-t border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/70 px-5 py-4 backdrop-blur-xl sm:px-7">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTab(tab.id)}
                  className={[
                    "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition",
                    active
                      ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-selected-surface)] text-[color:var(--sem-accent-primary)]"
                      : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] hover:text-[color:var(--sem-text-primary)]",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {tab.count !== null ? (
                    <span className="rounded-full bg-[color:var(--cmp-surface-panel)] px-2 py-0.5 text-xs">{tab.count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="theme-surface-modal mt-4 overflow-hidden rounded-[32px] border border-[color:var(--cmp-border-subtle)]">
          <div className="p-5 sm:p-6">
            {activeTab === "scheduling" ? (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(280px,0.92fr)]">
                <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                    <h2 className="text-xl font-semibold text-[color:var(--sem-text-primary)]">Scheduling</h2>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
                    Set the visit time, assign the field technician, and save the next dispatch-ready version of this job.
                  </p>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label className="block space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
                      <span>Date</span>
                      <input
                        type="date"
                        value={scheduleForm.scheduledDate}
                        onChange={(event) => setScheduleForm((current) => ({ ...current, scheduledDate: event.target.value }))}
                        className="w-full rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-3 text-sm text-[color:var(--sem-text-primary)] outline-none transition focus:border-[color:var(--sem-accent-primary)]"
                      />
                    </label>
                    <label className="block space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
                      <span>Assign Technician</span>
                      <select
                        value={scheduleForm.assignedTechnicianId}
                        onChange={(event) => setScheduleForm((current) => ({ ...current, assignedTechnicianId: event.target.value }))}
                        className="w-full rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-3 text-sm text-[color:var(--sem-text-primary)] outline-none transition focus:border-[color:var(--sem-accent-primary)]"
                      >
                        <option value="">Unassigned</option>
                        {assignmentTechnicians.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.display_name}
                            {candidate.is_active ? "" : " (Inactive)"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
                      <span>Start Time</span>
                      <input
                        type="time"
                        value={scheduleForm.startTime}
                        onChange={(event) => setScheduleForm((current) => ({ ...current, startTime: event.target.value }))}
                        className="w-full rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-3 text-sm text-[color:var(--sem-text-primary)] outline-none transition focus:border-[color:var(--sem-accent-primary)]"
                      />
                    </label>
                    <label className="block space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
                      <span>End Time</span>
                      <input
                        type="time"
                        value={scheduleForm.endTime}
                        onChange={(event) => setScheduleForm((current) => ({ ...current, endTime: event.target.value }))}
                        className="w-full rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-3 text-sm text-[color:var(--sem-text-primary)] outline-none transition focus:border-[color:var(--sem-accent-primary)]"
                      />
                    </label>
                  </div>

                  <div className="mt-5">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Arrival Window</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["30m", "1h", "2h"] as ArrivalWindowOption[]).map((option) => {
                        const active = scheduleForm.arrivalWindow === option;

                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setScheduleForm((current) => ({ ...current, arrivalWindow: option }))}
                            className={[
                              "rounded-full border px-4 py-2 text-sm transition",
                              active
                                ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-selected-surface)] text-[color:var(--sem-accent-primary)]"
                                : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] text-[color:var(--sem-text-secondary)] hover:text-[color:var(--sem-text-primary)]",
                            ].join(" ")}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="mt-5 flex items-start gap-3 rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
                    <input
                      type="checkbox"
                      checked={scheduleForm.syncCalendar}
                      onChange={(event) => setScheduleForm((current) => ({ ...current, syncCalendar: event.target.checked }))}
                      className="mt-1 h-4 w-4 rounded border-[color:var(--cmp-border-subtle)] text-[color:var(--sem-accent-primary)]"
                    />
                    <span>
                      Sync to Google/Outlook
                      <span className="mt-1 block text-xs text-[color:var(--sem-text-muted)]">
                        UI placeholder only for now. This setting is saved only in the current browser session.
                      </span>
                    </span>
                  </label>

                  {conflicts.length > 0 ? (
                    <div className="mt-5 rounded-[20px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4" />
                        <div>
                          <p className="font-medium">Potential scheduling conflict</p>
                          <div className="mt-2 space-y-2">
                            {conflicts.map((conflict) => (
                              <p key={conflict.id}>
                                {conflict.title} for {relationValue(conflict.customer)?.full_name ?? "Customer pending"} at {formatDateTime(conflict.scheduled_for)}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      disabled={isSavingSchedule || isUpdatingStatus || !hasScheduleChanges}
                      onClick={() => {
                        void saveSchedule();
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[color:var(--sem-accent-primary)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingSchedule ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save schedule
                    </button>
                    {isCheckingConflicts ? (
                      <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Checking conflicts
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Job Snapshot</p>
                  <div className="mt-5 grid gap-4 text-sm text-[color:var(--sem-text-secondary)]">
                    <div className="flex items-start gap-3">
                      <UserRound className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                      <div>
                        <p className="text-[color:var(--sem-text-primary)]">{customer?.full_name ?? "Customer pending"}</p>
                        <p className="mt-1">{customer?.phone ?? "No phone on file"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                      <span>{formatAddress(job.service_address_line_1, job.service_address_line_2, job.service_city, job.service_state_or_region, job.service_postal_code)}</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <Wrench className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                      <span>{getServiceTypeLabel(job.requested_service_type)}</span>
                    </div>
                    <div className="rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Assigned Technician</p>
                      {selectedTechnician ? (
                        <div className="mt-3 flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--cmp-selected-surface)] text-sm font-semibold text-[color:var(--sem-accent-primary)]">
                            {technicianInitials(selectedTechnician.display_name)}
                          </div>
                          <div>
                            <p className="font-medium text-[color:var(--sem-text-primary)]">{selectedTechnician.display_name}</p>
                            <p className="text-sm text-[color:var(--sem-text-muted)]">
                              {selectedTechnician.phone ?? "No phone on file"}
                              {selectedTechnician.is_active ? "" : " • Inactive"}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-[color:var(--sem-text-muted)]">This job is currently unassigned.</p>
                      )}
                    </div>
                    <div className="rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Current Internal Notes</p>
                      <p className="mt-3 whitespace-pre-line leading-7 text-[color:var(--sem-text-secondary)]">
                        {job.description?.trim() || "No internal notes on the base job record yet."}
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === "notes" ? (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.95fr)]">
                <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                    <h2 className="text-xl font-semibold text-[color:var(--sem-text-primary)]">Job Notes</h2>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
                    Capture service findings and recommendations. Drafts auto-save locally so you can switch tabs without losing field notes.
                  </p>

                  <div className="mt-5 space-y-4">
                    <label className="block space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
                      <span>Findings</span>
                      <textarea
                        value={noteFindingsDraft}
                        onChange={(event) => setNoteFindingsDraft(event.target.value)}
                        placeholder="Observed fireplace condition, parts issues, safety concerns, or visit details."
                        className="min-h-[150px] w-full rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-3 text-sm text-[color:var(--sem-text-primary)] outline-none transition placeholder:text-[color:var(--sem-text-muted)] focus:border-[color:var(--sem-accent-primary)]"
                      />
                    </label>
                    <label className="block space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
                      <span>Recommendations</span>
                      <textarea
                        value={noteRecommendationsDraft}
                        onChange={(event) => setNoteRecommendationsDraft(event.target.value)}
                        placeholder="Recommended repair, approval step, return visit, or office follow-up."
                        className="min-h-[150px] w-full rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-3 text-sm text-[color:var(--sem-text-primary)] outline-none transition placeholder:text-[color:var(--sem-text-muted)] focus:border-[color:var(--sem-accent-primary)]"
                      />
                    </label>

                    <button
                      type="button"
                      disabled={isSavingNote}
                      onClick={() => {
                        void saveNote();
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[color:var(--sem-accent-primary)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingNote ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Add note
                    </button>
                  </div>
                </section>

                <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Timeline</p>
                  {sortedNotes.length ? (
                    <>
                      <div className="mt-5 space-y-4">
                        {pagedNotes.pageItems.map((note) => (
                          <article
                            key={note.id}
                            className="rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-[color:var(--sem-text-primary)]">
                                  {note.author_name?.trim() || "Phoenix Team"}
                                </p>
                                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                                  {formatNoteDateTime(note.created_at)}
                                </p>
                              </div>
                              <span className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
                                Note #{note.id}
                              </span>
                            </div>
                            {note.findings ? (
                              <p className="mt-4 whitespace-pre-line text-sm leading-7 text-[color:var(--sem-text-secondary)]">
                                <span className="font-medium text-[color:var(--sem-text-primary)]">Findings:</span> {note.findings}
                              </p>
                            ) : null}
                            {note.recommendations ? (
                              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[color:var(--sem-text-secondary)]">
                                <span className="font-medium text-[color:var(--sem-text-primary)]">Recommendations:</span> {note.recommendations}
                              </p>
                            ) : null}
                          </article>
                        ))}
                      </div>
                      <PaginationFooter
                        page={pagedNotes.currentPage}
                        totalPages={pagedNotes.totalPages}
                        totalCount={sortedNotes.length}
                        onPageChange={(page) => setPage("notesPage", page)}
                      />
                    </>
                  ) : (
                    <div className="mt-5 rounded-[22px] border border-dashed border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-8 text-sm text-[color:var(--sem-text-muted)]">
                      No job notes have been added yet.
                    </div>
                  )}
                </section>
              </div>
            ) : null}

            {activeTab === "quote" ? (
              <JobQuoteSection
                key={`${quote?.id ?? "new"}:${quote?.status ?? "draft"}:${quote?.price_cents ?? 0}:${quote?.approved_at ?? ""}`}
                jobId={job.id}
                quote={quote}
                onQuoteChange={(nextQuote) => {
                  setJob((current) => ({
                    ...current,
                    quote: nextQuote,
                  }));
                }}
                onToast={pushToast}
              />
            ) : null}

            {activeTab === "invoice" ? (
              <JobInvoiceSection
                key={`${invoice?.id ?? "new"}:${invoice?.status ?? "unpaid"}:${invoice?.amount_cents ?? 0}:${invoice?.paid_at ?? ""}:${job.status}`}
                jobId={job.id}
                invoice={invoice}
                quoteId={quote?.id ?? null}
                currentJobStatus={job.status}
                onInvoiceChange={(nextInvoice) => {
                  setJob((current) => ({
                    ...current,
                    invoice: nextInvoice,
                  }));
                }}
                onToast={pushToast}
              />
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
