"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Flame,
  LoaderCircle,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wrench,
} from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import { formatAddress, formatDateTime } from "@/lib/crm/display";
import {
  canTransitionJobStatus,
  getJobStatusLabel,
  getServiceTypeLabel,
  technicianJobStatuses,
  type JobStatus,
} from "@/lib/crm/statuses";

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

type QuoteRecord = {
  id: string;
  description: string;
  price_cents: number;
  status: "draft" | "sent" | "approved" | "rejected";
  sent_at: string | null;
  approved_at: string | null;
};

type InvoiceRecord = {
  id: string;
  description: string;
  amount_cents: number;
  status: "unpaid" | "paid";
  issued_at: string;
  paid_at: string | null;
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
  customer: RelatedValue<CustomerRecord>;
  service: RelatedValue<ServiceRecord>;
  technician: RelatedValue<TechnicianRecord>;
  quote: RelatedValue<QuoteRecord>;
  invoice: RelatedValue<InvoiceRecord>;
};

type JobNoteRecord = {
  id: number;
  findings: string | null;
  recommendations: string | null;
  photo_urls: string[];
  created_at: string;
  updated_at: string;
};

type JobStatusEvent = {
  id: number;
  status: JobStatus;
  note: string | null;
  created_at: string;
};

type JobDetail = JobRecord & {
  notes: JobNoteRecord[];
  status_events: JobStatusEvent[];
};

type TechnicianDashboardResponse = {
  technician: {
    id: string;
    displayName: string;
    phone: string | null;
    specialties: string[];
    lastSeenAt: string | null;
    fullName: string;
  };
  summary: {
    openJobs: number;
    inProgressJobs: number;
    waitingForApprovalJobs: number;
    completedToday: number;
  };
  jobs: JobRecord[];
};

type NoteFormState = {
  findings: string;
  recommendations: string;
};

const emptyNoteForm: NoteFormState = {
  findings: "",
  recommendations: "",
};

function relationValue<T>(value: RelatedValue<T> | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function statusTone(status: string) {
  if (status === "cancelled") {
    return "border-rose-500/30 bg-rose-500/12 text-rose-100";
  }

  if (status === "new_lead") {
    return "border-rose-400/25 bg-rose-400/12 text-rose-100";
  }

  if (status === "contacted") {
    return "border-yellow-400/25 bg-yellow-400/12 text-yellow-100";
  }

  if (status === "scheduled") {
    return "border-sky-400/25 bg-sky-400/12 text-sky-100";
  }

  if (status === "on_the_way") {
    return "border-amber-400/25 bg-amber-400/12 text-amber-100";
  }

  if (status === "in_progress") {
    return "border-orange-400/25 bg-orange-400/12 text-orange-100";
  }

  if (status === "waiting_for_approval") {
    return "border-violet-400/25 bg-violet-400/12 text-violet-100";
  }

  if (status === "completed" || status === "paid") {
    return "border-emerald-400/25 bg-emerald-400/12 text-emerald-100";
  }

  return "border-white/10 bg-white/5 text-white/72";
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 text-sm text-white/66">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FieldTextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-[110px] w-full rounded-[18px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-[color:rgba(212,175,55,0.34)] ${props.className ?? ""}`}
    />
  );
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

function MetricCard({ icon: Icon, label, value }: { icon: typeof Flame; label: string; value: number }) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:rgba(212,175,55,0.18)] bg-[color:rgba(212,175,55,0.1)] text-[color:var(--flat-gold)]">
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-4 text-[11px] uppercase tracking-[0.28em] text-white/38">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</p>
    </article>
  );
}

export default function TechnicianHomeBoard() {
  const locale = useLocale();
  const t = useTranslations("home.tech");
  const [dashboard, setDashboard] = useState<TechnicianDashboardResponse | null>(null);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [noteForm, setNoteForm] = useState<NoteFormState>(emptyNoteForm);
  const [statusNote, setStatusNote] = useState("");
  const [isBooting, setIsBooting] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedJobCard = dashboard?.jobs.find((job) => job.id === selectedJobId) ?? null;
  const displayedJob = jobDetail ?? selectedJobCard;
  const displayedCustomer = relationValue(displayedJob?.customer);
  const displayedService = relationValue(displayedJob?.service);
  const sortedNotes = [...(jobDetail?.notes ?? [])].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
  const sortedStatusEvents = [...(jobDetail?.status_events ?? [])].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );

  async function refreshDashboard(preferredJobId?: string | null) {
    const data = await crmApiFetch<TechnicianDashboardResponse>("/api/technician/dashboard");

    startTransition(() => {
      setDashboard(data);

      const nextJobId = preferredJobId
        ?? (selectedJobId && data.jobs.some((job) => job.id === selectedJobId)
          ? selectedJobId
          : data.jobs[0]?.id ?? null);

      setSelectedJobId(nextJobId);

      if (!nextJobId) {
        setJobDetail(null);
        setNoteForm(emptyNoteForm);
        setStatusNote("");
      }
    });
  }

  async function refreshJobDetail(jobId: string | null) {
    if (!jobId) {
      startTransition(() => {
        setJobDetail(null);
        setNoteForm(emptyNoteForm);
        setStatusNote("");
      });
      return;
    }

    const data = await crmApiFetch<JobDetail>(`/api/jobs/${jobId}`);

    startTransition(() => {
      setJobDetail(data);
      setNoteForm(emptyNoteForm);
      setStatusNote("");
    });
  }

  async function runAction(actionKey: string, onRun: () => Promise<void>, successMessage: string) {
    setBusyAction(actionKey);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await onRun();
      setStatusMessage(successMessage);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("actionError"));
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function initializeBoard() {
      try {
        const data = await crmApiFetch<TechnicianDashboardResponse>("/api/technician/dashboard");

        if (!isMounted) {
          return;
        }

        startTransition(() => {
          setDashboard(data);
          setSelectedJobId(data.jobs[0]?.id ?? null);
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : t("loadError"));
      } finally {
        if (isMounted) {
          setIsBooting(false);
        }
      }
    }

    void initializeBoard();

    return () => {
      isMounted = false;
    };
  }, [t]);

  useEffect(() => {
    if (!selectedJobId) {
      return;
    }

    let isMounted = true;

    async function loadSelectedJob() {
      try {
        const data = await crmApiFetch<JobDetail>(`/api/jobs/${selectedJobId}`);

        if (!isMounted) {
          return;
        }

        startTransition(() => {
          setJobDetail(data);
          setNoteForm(emptyNoteForm);
          setStatusNote("");
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : t("selectedJobError"));
      }
    }

    void loadSelectedJob();

    return () => {
      isMounted = false;
    };
  }, [selectedJobId, t]);

  if (isBooting && !dashboard) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-[34px] bg-[color:var(--flat-canvas)] text-white">
        <div className="inline-flex items-center gap-3 text-sm text-white/62">
          <LoaderCircle className="h-4 w-4 animate-spin text-[color:var(--flat-gold)]" />
          {t("loading")}
        </div>
      </div>
    );
  }

  const boardBody = (
    <div className="relative mx-auto max-w-none px-5 py-6 lg:px-8">
      <header className="rounded-[34px] border border-[color:rgba(212,175,55,0.18)] bg-[linear-gradient(180deg,rgba(9,9,9,0.94),rgba(18,18,18,0.88))] p-6 shadow-[0_34px_120px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="max-w-3xl font-[family:var(--font-flat-display)] text-4xl leading-none tracking-tight text-[#f5ecd2] sm:text-5xl">
              {t("heroTitle")}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/56 sm:text-base">
              {t("heroBody")}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Wrench} label={t("summary.openJobs")} value={dashboard?.summary.openJobs ?? 0} />
          <MetricCard icon={Flame} label={t("summary.inProgress")} value={dashboard?.summary.inProgressJobs ?? 0} />
          <MetricCard icon={ShieldCheck} label={t("summary.waitingApproval")} value={dashboard?.summary.waitingForApprovalJobs ?? 0} />
          <MetricCard icon={CheckCircle2} label={t("summary.completedToday")} value={dashboard?.summary.completedToday ?? 0} />
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
              void runAction(
                "refresh",
                async () => {
                  await Promise.all([
                    refreshDashboard(selectedJobId),
                    refreshJobDetail(selectedJobId),
                  ]);
                },
                t("refreshed"),
              );
            }}
            className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/72 transition hover:border-white/20 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${busyAction === "refresh" || isPending ? "animate-spin" : ""}`} />
            {t("refreshBoard")}
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <SectionFrame title={t("assignedJobs")} subtitle={t("fieldQueue")}>
          <div className="grid gap-4 lg:grid-cols-2">
            {dashboard?.jobs.length ? dashboard.jobs.map((job) => {
              const customer = relationValue(job.customer);
              const service = relationValue(job.service);

              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => {
                    startTransition(() => {
                      setSelectedJobId(job.id);
                      setJobDetail(null);
                      setNoteForm(emptyNoteForm);
                      setStatusNote("");
                    });
                  }}
                  className={`rounded-[28px] border p-5 text-left transition ${selectedJobId === job.id ? "border-[color:rgba(212,175,55,0.3)] bg-[color:rgba(212,175,55,0.08)]" : "border-white/10 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.05]"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold tracking-tight text-white">{job.title}</p>
                      <p className="mt-1 text-sm text-white/46">{customer?.full_name ?? t("customerPending")}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.24em] ${statusTone(job.status)}`}>
                      {getJobStatusLabel(job.status, locale)}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-white/56">
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 text-[color:var(--flat-gold)]" />
                      <span>{formatAddress(job.service_address_line_1, job.service_address_line_2, job.service_city, job.service_state_or_region, job.service_postal_code)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-[color:var(--flat-gold)]" />
                      <span>{customer?.phone ?? t("noPhone")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-[color:var(--flat-gold)]" />
                      <span>
                        {formatDateTime(job.scheduled_for, locale, "Not scheduled")}
                        {job.scheduled_window ? ` | ${job.scheduled_window}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[color:var(--flat-gold)]" />
                      <span>{service?.name ?? getServiceTypeLabel(job.requested_service_type, locale)}</span>
                    </div>
                  </div>
                </button>
              );
            }) : (
              <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] px-5 py-10 text-center text-sm text-white/46 lg:col-span-2">
                {t("noAssignedJobs")}
              </div>
            )}
          </div>
        </SectionFrame>

        <div className="space-y-6 xl:sticky xl:top-5 xl:self-start">
          <SectionFrame title={t("selectedJob")} subtitle={t("fieldDetail")}>
            {displayedJob && displayedCustomer ? (
              <div className="space-y-6">
                <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xl font-semibold tracking-tight text-white">{displayedJob.title}</p>
                      <p className="mt-1 text-sm text-white/52">{displayedCustomer.full_name}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.24em] ${statusTone(displayedJob.status)}`}>
                      {getJobStatusLabel(displayedJob.status, locale)}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-white/56">
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 text-[color:var(--flat-gold)]" />
                      {formatAddress(displayedJob.service_address_line_1, displayedJob.service_address_line_2, displayedJob.service_city, displayedJob.service_state_or_region, displayedJob.service_postal_code)}
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-[color:var(--flat-gold)]" />
                      <a href={`tel:${displayedCustomer.phone}`} className="transition hover:text-white">
                        {displayedCustomer.phone}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-[color:var(--flat-gold)]" />
                      {formatDateTime(displayedJob.scheduled_for, locale, "Not scheduled")}
                      {displayedJob.scheduled_window ? ` | ${displayedJob.scheduled_window}` : ""}
                    </div>
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-[color:var(--flat-gold)]" />
                      {displayedService?.name ?? getServiceTypeLabel(displayedJob.requested_service_type, locale)}
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-[color:var(--flat-gold)]" />
                      {t("currentStatus", { status: getJobStatusLabel(displayedJob.status, locale) })}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.34em] text-white/34">{t("statusActions")}</p>
                  <FieldLabel label={t("statusNote")}>
                    <FieldTextArea
                      value={statusNote}
                      onChange={(event) => setStatusNote(event.target.value)}
                      placeholder={t("statusNotePlaceholder")}
                      className="min-h-[90px]"
                    />
                  </FieldLabel>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {technicianJobStatuses.map((typedStatus) => {
                      const isCurrentStatus = displayedJob.status === typedStatus;
                      const canTransition = !isCurrentStatus && canTransitionJobStatus(displayedJob.status, typedStatus);

                      return (
                        <button
                          key={typedStatus}
                          type="button"
                          disabled={!selectedJobId || Boolean(busyAction) || !canTransition}
                          onClick={() => {
                            if (!selectedJobId) {
                              return;
                            }

                            void runAction(
                              `status-${selectedJobId}-${typedStatus}`,
                              async () => {
                                await crmApiFetch(`/api/jobs/${selectedJobId}/status`, {
                                  method: "POST",
                                  body: JSON.stringify({ status: typedStatus, note: statusNote || null }),
                                });
                                await Promise.all([
                                  refreshDashboard(selectedJobId),
                                  refreshJobDetail(selectedJobId),
                                ]);
                              },
                              t("markedStatus", { status: getJobStatusLabel(typedStatus, locale) }),
                            );
                          }}
                          className={`rounded-[18px] border px-4 py-4 text-xs uppercase tracking-[0.24em] transition ${isCurrentStatus ? `${statusTone(typedStatus)} border-[color:rgba(212,175,55,0.28)]` : "border-white/10 bg-black/20 text-white/66 hover:border-white/20 hover:text-white"} disabled:cursor-not-allowed disabled:opacity-45`}
                        >
                          {getJobStatusLabel(typedStatus, locale)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.34em] text-white/34">{t("fieldNotes")}</p>
                  <FieldLabel label={t("findings")}>
                    <FieldTextArea value={noteForm.findings} onChange={(event) => setNoteForm((current) => ({ ...current, findings: event.target.value }))} />
                  </FieldLabel>
                  <FieldLabel label={t("recommendations")}>
                    <FieldTextArea value={noteForm.recommendations} onChange={(event) => setNoteForm((current) => ({ ...current, recommendations: event.target.value }))} />
                  </FieldLabel>
                  <button
                    type="button"
                    disabled={!selectedJobId || Boolean(busyAction)}
                    onClick={() => {
                      if (!selectedJobId) {
                        return;
                      }

                      void runAction(
                        `note-${selectedJobId}`,
                        async () => {
                          await crmApiFetch(`/api/jobs/${selectedJobId}/notes`, {
                            method: "POST",
                            body: JSON.stringify({
                              findings: noteForm.findings || null,
                              recommendations: noteForm.recommendations || null,
                              photoUrls: [],
                            }),
                          });
                          setNoteForm(emptyNoteForm);
                          await refreshJobDetail(selectedJobId);
                        },
                        t("fieldNoteSaved"),
                      );
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] border border-white/10 bg-white/[0.06] px-5 py-3 text-sm text-white/76 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyAction === `note-${selectedJobId}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    {t("saveFieldNote")}
                  </button>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.34em] text-white/34">{t("recentNotes")}</p>
                  {sortedNotes.length ? sortedNotes.map((note) => (
                    <article key={note.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/58">
                      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.24em] text-white/34">
                        <span>{t("noteLabel", { id: note.id })}</span>
                        <span>{formatDateTime(note.created_at, locale, "Not scheduled")}</span>
                      </div>
                      {note.findings ? <p className="mt-3"><span className="text-white/84">{t("noteFindings")}</span> {note.findings}</p> : null}
                      {note.recommendations ? <p className="mt-2"><span className="text-white/84">{t("noteRecommendations")}</span> {note.recommendations}</p> : null}
                    </article>
                  )) : (
                    <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-white/42">
                      {t("noFieldNotes")}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.34em] text-white/34">{t("statusTimeline")}</p>
                  {sortedStatusEvents.length ? sortedStatusEvents.map((event) => (
                    <div key={event.id} className="flex gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/56">
                      <span className={`mt-0.5 h-3 w-3 rounded-full border ${statusTone(event.status)}`} />
                      <div>
                        <p className="text-white/84">{getJobStatusLabel(event.status, locale)}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.24em] text-white/32">{formatDateTime(event.created_at, locale, "Not scheduled")}</p>
                        {event.note ? <p className="mt-2">{event.note}</p> : null}
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-white/42">
                      {t("noStatusTimeline")}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-[26px] border border-dashed border-white/10 bg-white/[0.03] px-5 py-14 text-center text-sm text-white/44">
                {t("selectJob")}
              </div>
            )}
          </SectionFrame>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative overflow-hidden rounded-[34px] text-white">
      <div className="absolute inset-0 bg-[color:var(--flat-canvas)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.15),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(80,200,120,0.16),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_32%)]" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative">{boardBody}</div>
    </div>
  );
}
