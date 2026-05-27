"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Filter,
  Flame,
  Hammer,
  LoaderCircle,
  MapPin,
  Phone,
  Receipt,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";

import { MobileJobsFieldCommand } from "@/app/jobs/mobile-jobs-field-command";
import { BoardShell } from "@/components/board/board-shell";
import { crmApiFetch } from "@/lib/crm/browser-api";
import { MetricTile } from "@/components/board/metric-tile";
import { SectionFrame } from "@/components/board/section-frame";
import { buildAddressQuery, buildGoogleMapsSearchUrl } from "@/lib/crm/display";
import {
  canTransitionJobStatus,
  dashboardStatuses,
  getDashboardBoardStatus,
  getDashboardStatusLabel,
  getJobStatusLabel,
  getServiceTypeLabel,
  type JobStatus,
} from "@/lib/crm/statuses";

type LeadRecord = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  service_address_line_1: string;
  service_address_line_2: string | null;
  service_city: string;
  service_state_or_region: string | null;
  service_postal_code: string;
  source: "phone" | "website" | "google" | "referral" | "repeat_customer" | "other";
  service_type: "inspection" | "cleaning" | "repair" | "rebuild";
  description: string | null;
  status: "new_lead" | "contacted" | "converted";
  converted_job_id: string | null;
  created_at: string;
  updated_at: string;
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
  sort_position: number;
  is_active: boolean;
};

type CustomerRecord = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
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
  author_profile?: {
    id: string;
    full_name: string;
  } | null;
};

type RelatedValue<T> = T | T[] | null;

type JobRecord = {
  id: string;
  assigned_technician_id: string | null;
  title: string;
  description: string | null;
  lead_source: LeadRecord["source"];
  requested_service_type: LeadRecord["service_type"];
  status: JobStatusEvent["status"];
  service_address_line_1: string;
  service_address_line_2: string | null;
  service_city: string;
  service_state_or_region: string | null;
  service_postal_code: string;
  scheduled_for: string | null;
  scheduled_window: string | null;
  requested_at: string;
  on_the_way_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  customer: RelatedValue<CustomerRecord>;
  service: RelatedValue<ServiceRecord>;
  technician: RelatedValue<TechnicianRecord>;
  quote: RelatedValue<QuoteRecord>;
  invoice: RelatedValue<InvoiceRecord>;
};

type JobDetail = JobRecord & {
  notes: JobNoteRecord[];
  status_events: JobStatusEvent[];
};

type DashboardResponse = {
  summary: {
    newLeads: number;
    contactedLeads: number;
    activeJobs: number;
    jobsScheduledToday: number;
    unpaidInvoices: number;
  };
  controls: {
    quotesWaitingApproval: DashboardControlItem[];
    unpaidInvoices: DashboardControlItem[];
    followUpsNeeded: DashboardControlItem[];
    todaysScheduledJobs: DashboardControlItem[];
    recentCompletedJobs: DashboardControlItem[];
  };
  leads: LeadRecord[];
  jobs: JobRecord[];
  technicians: TechnicianRecord[];
  services: ServiceRecord[];
};

type DashboardControlItem = {
  id: string;
  jobId: string | null;
  title: string;
  customerName: string;
  addressLabel: string;
  technicianName: string | null;
  amountCents: number | null;
  scheduledFor: string | null;
  occurredAt: string | null;
  statusLabel: string;
};

type LeadConversionFormState = {
  title: string;
  description: string;
  assignedTechnicianId: string;
  serviceId: string;
  scheduledFor: string;
  scheduledWindow: string;
};

type JobFormState = {
  title: string;
  description: string;
  assignedTechnicianId: string;
  serviceId: string;
  scheduledFor: string;
  scheduledWindow: string;
};

type QuoteFormState = {
  description: string;
  priceCents: string;
  status: QuoteRecord["status"];
};

type InvoiceFormState = {
  description: string;
  amountCents: string;
  status: InvoiceRecord["status"];
};

type NoteFormState = {
  findings: string;
  recommendations: string;
  photoUrls: string;
};

const emptyConversionForm: LeadConversionFormState = {
  title: "",
  description: "",
  assignedTechnicianId: "",
  serviceId: "",
  scheduledFor: "",
  scheduledWindow: "",
};

const emptyJobForm: JobFormState = {
  title: "",
  description: "",
  assignedTechnicianId: "",
  serviceId: "",
  scheduledFor: "",
  scheduledWindow: "",
};

const emptyQuoteForm: QuoteFormState = {
  description: "",
  priceCents: "",
  status: "draft",
};

const emptyInvoiceForm: InvoiceFormState = {
  description: "",
  amountCents: "",
  status: "unpaid",
};

const emptyNoteForm: NoteFormState = {
  findings: "",
  recommendations: "",
  photoUrls: "",
};

const QUEUE_ITEMS_PER_PAGE = 10;

/** Reserved for a future secondary view toggle — kanban stays mounted but hidden in Flight Deck mode. */
const SHOW_LEGACY_KANBAN = false;

type OperationalLaneKey = "unassigned" | "today" | "blocked" | "ready" | "upcoming";

const operationalLaneDefinitions: Array<{
  key: OperationalLaneKey;
  title: string;
  helper: string;
  tone: "danger" | "primary" | "warning" | "success" | "neutral";
}> = [
  { key: "unassigned", title: "Unassigned", helper: "Needs dispatch", tone: "danger" },
  { key: "today", title: "Today", helper: "Active schedule", tone: "primary" },
  { key: "blocked", title: "Blocked", helper: "Needs action", tone: "warning" },
  { key: "ready", title: "Ready", helper: "Can close / move", tone: "success" },
  { key: "upcoming", title: "Upcoming", helper: "Future work", tone: "neutral" },
];

const flightDeckPanelClass =
  "theme-surface-card rounded-[24px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] shadow-[0_18px_55px_color-mix(in_srgb,var(--bg-canvas)_72%,transparent)] backdrop-blur-md";

const flightDeckEyebrowClass = "text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]";

function relationValue<T>(value: RelatedValue<T> | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatAddress(
  line1: string,
  line2: string | null,
  city: string,
  stateOrRegion: string | null,
  postalCode: string,
) {
  return [line1, line2, [city, stateOrRegion].filter(Boolean).join(", "), postalCode]
    .filter(Boolean)
    .join(" - ");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCurrency(cents: number | null | undefined) {
  if (cents === null || cents === undefined) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatLifecycleStatus(
  status: QuoteRecord["status"] | InvoiceRecord["status"] | string | null | undefined,
) {
  if (!status) {
    return "Unavailable";
  }

  return status
    .split("_")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function toDateTimeLocal(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function statusTone(status: string) {
  if (status === "cancelled") {
    return "theme-status-error";
  }

  if (status === "new_lead") {
    return "theme-status-warning";
  }

  if (status === "contacted") {
    return "theme-status-warning";
  }

  if (status === "scheduled") {
    return "theme-status-info";
  }

  if (status === "on_the_way") {
    return "theme-status-info";
  }

  if (status === "in_progress") {
    return "theme-status-info";
  }

  if (status === "waiting_for_approval") {
    return "theme-status-warning";
  }

  if (status === "completed" || status === "paid") {
    return "theme-status-success";
  }

  return "theme-control-surface-soft text-[color:var(--sem-text-secondary)]";
}

function getOfficeQuickStatusActions(status: JobStatus) {
  if (status === "new_lead") {
    return ["contacted", "scheduled"] satisfies JobStatus[];
  }

  if (status === "contacted") {
    return ["scheduled"] satisfies JobStatus[];
  }

  if (status === "scheduled") {
    return ["on_the_way", "in_progress", "completed"] satisfies JobStatus[];
  }

  if (status === "on_the_way") {
    return ["in_progress", "completed"] satisfies JobStatus[];
  }

  if (status === "in_progress") {
    return ["waiting_for_approval", "completed"] satisfies JobStatus[];
  }

  if (status === "waiting_for_approval") {
    return ["scheduled", "completed"] satisfies JobStatus[];
  }

  if (status === "completed") {
    return ["paid"] satisfies JobStatus[];
  }

  return [] satisfies JobStatus[];
}

function isScheduledToday(value: string | null) {
  if (!value) {
    return false;
  }

  const scheduled = new Date(value);
  const today = new Date();
  return scheduled.toDateString() === today.toDateString();
}

function isScheduledFuture(value: string | null) {
  if (!value) {
    return false;
  }

  const scheduled = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return scheduled > today;
}

function isTerminalJobStatus(status: JobStatus) {
  return status === "completed" || status === "paid" || status === "cancelled";
}

function getOperationalLane(job: JobRecord): OperationalLaneKey {
  if (job.status === "completed" || job.status === "paid") {
    return "ready";
  }

  if (job.status === "waiting_for_approval") {
    return "blocked";
  }

  if (!job.assigned_technician_id && !isTerminalJobStatus(job.status)) {
    return "unassigned";
  }

  if (isScheduledToday(job.scheduled_for)) {
    return "today";
  }

  if (isScheduledFuture(job.scheduled_for)) {
    return "upcoming";
  }

  if (
    job.status === "scheduled"
    || job.status === "on_the_way"
    || job.status === "in_progress"
    || job.status === "contacted"
    || job.status === "new_lead"
  ) {
    return "today";
  }

  return "upcoming";
}

function getJobMoneyCents(job: JobRecord) {
  const invoice = relationValue(job.invoice);
  const quote = relationValue(job.quote);
  const service = relationValue(job.service);

  if (invoice?.amount_cents) {
    return invoice.amount_cents;
  }

  if (quote?.price_cents) {
    return quote.price_cents;
  }

  if (service?.default_price_cents) {
    return service.default_price_cents;
  }

  return null;
}

function getOperatorNextAction(
  job: JobRecord,
  quote: QuoteRecord | null,
  invoice: InvoiceRecord | null,
  technician: TechnicianRecord | null,
) {
  if (!technician && !isTerminalJobStatus(job.status)) {
    return {
      title: "Assign technician",
      detail: "Dispatch this job before the customer window slips.",
    };
  }

  if (job.status === "waiting_for_approval") {
    return {
      title: "Resolve approval hold",
      detail: quote
        ? `Quote is ${formatLifecycleStatus(quote.status)} — contact the customer or adjust the estimate.`
        : "Office approval is blocking field progress.",
    };
  }

  if (invoice?.status === "unpaid") {
    return {
      title: "Collect payment",
      detail: `${formatCurrency(invoice.amount_cents)} invoice is still open.`,
    };
  }

  if (job.status === "completed" && !invoice) {
    return {
      title: "Close out revenue",
      detail: "Job is complete — generate or send the invoice.",
    };
  }

  if (!quote && (job.status === "scheduled" || job.status === "contacted" || job.status === "new_lead")) {
    return {
      title: "Send estimate",
      detail: "No quote on file yet — confirm scope and pricing with the customer.",
    };
  }

  if (quote && quote.status === "draft") {
    return {
      title: "Send quote to customer",
      detail: `${formatCurrency(quote.price_cents)} draft is ready to go out.`,
    };
  }

  if (quote && quote.status === "sent") {
    return {
      title: "Follow up on quote",
      detail: "Waiting on customer approval — call or text to keep momentum.",
    };
  }

  const quickActions = getOfficeQuickStatusActions(job.status).filter((nextStatus) =>
    canTransitionJobStatus(job.status, nextStatus),
  );

  if (quickActions.length > 0) {
    const nextStatus = quickActions[0];
    return {
      title: `Move to ${getJobStatusLabel(nextStatus)}`,
      detail: `Current status: ${getJobStatusLabel(job.status)}.`,
    };
  }

  return {
    title: "Monitor job progress",
    detail: `${getJobStatusLabel(job.status)} — no immediate office action required.`,
  };
}

function laneToneClass(tone: (typeof operationalLaneDefinitions)[number]["tone"]) {
  if (tone === "danger") {
    return "theme-status-error";
  }

  if (tone === "warning") {
    return "theme-status-warning";
  }

  if (tone === "success") {
    return "theme-status-success";
  }

  if (tone === "primary") {
    return "theme-status-info";
  }

  return "theme-control-surface-soft text-[color:var(--sem-text-secondary)]";
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
      className={`w-full rounded-[18px] theme-control-surface px-4 py-3 text-sm text-[color:var(--sem-text-primary)] outline-none transition placeholder:text-[color:var(--sem-text-muted)]  ${props.className ?? ""}`}
    />
  );
}

function FieldTextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-[110px] w-full rounded-[18px] theme-control-surface px-4 py-3 text-sm text-[color:var(--sem-text-primary)] outline-none transition placeholder:text-[color:var(--sem-text-muted)]  ${props.className ?? ""}`}
    />
  );
}

function FieldSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-[18px] theme-control-surface px-4 py-3 text-sm text-[color:var(--sem-text-primary)] outline-none transition  ${props.className ?? ""}`}
    />
  );
}

function ControlWidget({
  icon: Icon,
  title,
  items,
  emptyLabel,
  selectedJobId,
  onSelectJob,
}: {
  icon: typeof Flame;
  title: string;
  items: DashboardControlItem[];
  emptyLabel: string;
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
}) {
  return (
    <article className="theme-control-surface-soft rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl theme-control-surface-soft text-[color:var(--sem-accent-primary)]">
          <Icon className="h-4 w-4" />
        </span>
        <span className="rounded-full theme-control-surface-soft px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-secondary)]">
          {items.length}
        </span>
      </div>

      <h3 className="mt-4 text-lg font-semibold text-[color:var(--sem-text-primary)]">{title}</h3>

      <div className="mt-4 space-y-3">
        {items.length > 0 ? items.map((item) => {
          const metaParts = [
            item.amountCents !== null ? formatCurrency(item.amountCents) : null,
            item.technicianName,
            item.scheduledFor ? formatDateTime(item.scheduledFor) : item.occurredAt ? formatDateTime(item.occurredAt) : null,
          ].filter(Boolean);

          return (
            <button
              key={item.id}
              type="button"
              disabled={!item.jobId}
              onClick={() => onSelectJob(item.jobId)}
              className={`block w-full rounded-[18px] border px-3 py-3 text-left text-sm transition ${selectedJobId === item.jobId ? "theme-selected-card" : "theme-control-surface border-[color:var(--cmp-border-subtle)] hover:bg-[color:var(--cmp-hover-surface)]"} disabled:cursor-default disabled:hover:border-[color:var(--cmp-border-subtle)]`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[color:var(--sem-text-primary)]">{item.title}</p>
                  <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{item.customerName}</p>
                </div>
                <span className="rounded-full border border-[color:var(--cmp-border-subtle)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-text-secondary)]">
                  {item.statusLabel}
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-[color:var(--sem-text-secondary)]">{item.addressLabel}</p>
              {metaParts.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">
                  {metaParts.map((part) => (
                    <span key={part} className="rounded-full border border-[color:var(--cmp-border-subtle)] px-2 py-1">
                      {part}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          );
        }) : (
          <div className="rounded-[18px] theme-control-surface-soft border-dashed px-3 py-6 text-center text-xs text-[color:var(--sem-text-muted)]">
            {emptyLabel}
          </div>
        )}
      </div>
    </article>
  );
}

function CompactControlTile({
  icon: Icon,
  title,
  count,
  tone,
  onActivate,
}: {
  icon: typeof Flame;
  title: string;
  count: number;
  tone: "warning" | "danger" | "primary" | "success";
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className={`${flightDeckPanelClass} w-full p-4 text-left transition hover:border-[color:var(--cmp-border-accent)]`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)] ${laneToneClass(tone)}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="rounded-full theme-control-surface-soft px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-secondary)]">
          Queue
        </span>
      </div>
      <p className={`mt-4 ${flightDeckEyebrowClass}`}>{title}</p>
      <p className="mt-2 font-[family:var(--font-geist-mono)] text-3xl font-semibold tabular-nums text-[color:var(--sem-display-headline)]">
        {count}
      </p>
    </button>
  );
}

function HiddenLegacyKanbanBoard({
  boardColumns,
  operationalLaneColumns,
  selectedJobId,
  selectedLeadId,
  onSelectJob,
  onSelectLead,
}: {
  boardColumns: Array<{
    status: (typeof dashboardStatuses)[number];
    leads: LeadRecord[];
    jobs: JobRecord[];
  }>;
  operationalLaneColumns: Array<(typeof operationalLaneDefinitions)[number] & { jobs: JobRecord[] }>;
  selectedJobId: string | null;
  selectedLeadId: string | null;
  onSelectJob: (jobId: string) => void;
  onSelectLead: (lead: LeadRecord) => void;
}) {
  const legacyBoard = (
    <>
      <SectionFrame title="Main Dashboard" subtitle="Status Board">
        <div className="grid gap-4 xl:grid-cols-8">
          {boardColumns.map(({ status, leads, jobs }) => (
            <section
              key={status}
              className="theme-control-surface-soft flex max-h-[560px] min-h-[360px] flex-col rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4"
            >
              <div className="flex items-center justify-between gap-3 border-b border-[color:var(--cmp-border-subtle)] pb-3">
                <div>
                  <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">
                    {getDashboardStatusLabel(status)}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">
                    {leads.length + jobs.length} item{leads.length + jobs.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {leads.map((lead) => (
                  <button
                    type="button"
                    key={lead.id}
                    onClick={() => onSelectLead(lead)}
                    className={`block w-full rounded-[18px] border px-3 py-3 text-left text-sm transition ${selectedLeadId === lead.id ? "theme-selected-card" : "theme-control-surface border-[color:var(--cmp-border-subtle)] hover:bg-[color:var(--cmp-hover-surface)]"}`}
                  >
                    <p className="font-medium text-[color:var(--sem-text-primary)]">{lead.full_name}</p>
                    <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">
                      Lead - {getServiceTypeLabel(lead.service_type)}
                    </p>
                    <p className="mt-2 text-xs text-[color:var(--sem-text-secondary)]">{lead.phone}</p>
                  </button>
                ))}

                {jobs.map((job) => {
                  const customer = relationValue(job.customer);
                  const technician = relationValue(job.technician);

                  return (
                    <button
                      type="button"
                      key={job.id}
                      onClick={() => onSelectJob(job.id)}
                      className={`block w-full rounded-[18px] border px-3 py-3 text-left text-sm transition ${selectedJobId === job.id ? "theme-selected-card" : "theme-control-surface border-[color:var(--cmp-border-subtle)] hover:bg-[color:var(--cmp-hover-surface)]"}`}
                    >
                      <p className="font-medium text-[color:var(--sem-text-primary)]">{job.title}</p>
                      <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">
                        {customer?.full_name ?? "Customer pending"}
                      </p>
                      <p className="mt-2 text-xs text-[color:var(--sem-text-secondary)]">
                        {formatDateTime(job.scheduled_for)}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-[color:var(--sem-text-secondary)]">
                        <UserRound className="h-3.5 w-3.5 text-[color:var(--sem-accent-primary)]" />
                        <span>{technician?.display_name ?? "Unassigned"}</span>
                      </p>
                    </button>
                  );
                })}

                {leads.length === 0 && jobs.length === 0 ? (
                  <div className="rounded-[18px] theme-control-surface-soft border-dashed px-3 py-6 text-center text-xs text-[color:var(--sem-text-muted)]">
                    No items
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </SectionFrame>

      <SectionFrame title="Operational Lanes" subtitle="Derived Board">
        <div className="grid gap-4 xl:grid-cols-5">
          {operationalLaneColumns.map((lane) => (
            <section
              key={lane.key}
              className="theme-control-surface-soft min-h-[240px] rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4"
            >
              <div className="border-b border-[color:var(--cmp-border-subtle)] pb-3">
                <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{lane.title}</p>
                <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">{lane.helper}</p>
              </div>
              <p className="mt-4 text-sm text-[color:var(--sem-text-secondary)]">{lane.jobs.length} jobs</p>
            </section>
          ))}
        </div>
      </SectionFrame>
    </>
  );

  if (SHOW_LEGACY_KANBAN) {
    return legacyBoard;
  }

  return (
    <div className="hidden" aria-hidden="true" data-flight-deck-legacy-board="true">
      {legacyBoard}
    </div>
  );
}

export default function JobsWorkspace() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [, setConversionForm] = useState<LeadConversionFormState>(emptyConversionForm);
  const [jobForm, setJobForm] = useState<JobFormState>(emptyJobForm);
  const [, setQuoteForm] = useState<QuoteFormState>(emptyQuoteForm);
  const [, setInvoiceForm] = useState<InvoiceFormState>(emptyInvoiceForm);
  const [noteForm, setNoteForm] = useState<NoteFormState>(emptyNoteForm);
  const [statusNote, setStatusNote] = useState("");
  const [isBooting, setIsBooting] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [queueTechnicianFilter, setQueueTechnicianFilter] = useState<string>("all");
  const [queueDateFilter, setQueueDateFilter] = useState<string>("");
  const [queuePage, setQueuePage] = useState(1);
  const [mobileDetailJobId, setMobileDetailJobId] = useState<string | null>(null);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedJobCard = dashboard?.jobs.find((job) => job.id === selectedJobId) ?? null;
  const displayedJob = jobDetail ?? selectedJobCard;
  const displayedCustomer = relationValue(displayedJob?.customer);
  const displayedService = relationValue(displayedJob?.service);
  const displayedTechnician = relationValue(displayedJob?.technician);
  const displayedQuote = relationValue(displayedJob?.quote);
  const displayedInvoice = relationValue(displayedJob?.invoice);
  const queueJobs = (dashboard?.jobs ?? []).filter((job) => {
    if (queueTechnicianFilter !== "all" && job.assigned_technician_id !== queueTechnicianFilter) {
      return false;
    }

    if (queueDateFilter && (!job.scheduled_for || job.scheduled_for.slice(0, 10) !== queueDateFilter)) {
      return false;
    }

    return true;
  });
  const queueFilterActive = queueTechnicianFilter !== "all" || Boolean(queueDateFilter);
  const queueTotalPages = Math.max(1, Math.ceil(queueJobs.length / QUEUE_ITEMS_PER_PAGE));
  const safeQueuePage = Math.min(queuePage, queueTotalPages);
  const queueStartIndex = (safeQueuePage - 1) * QUEUE_ITEMS_PER_PAGE;
  const pagedQueueJobs = queueJobs.slice(queueStartIndex, queueStartIndex + QUEUE_ITEMS_PER_PAGE);
  const displayedJobGoogleMapsUrl = displayedJob
    ? buildGoogleMapsSearchUrl(
      buildAddressQuery(
        displayedJob.service_address_line_1,
        displayedJob.service_address_line_2,
        displayedJob.service_city,
        displayedJob.service_state_or_region,
        displayedJob.service_postal_code,
      ),
    )
    : null;
  const quoteActionLabel = displayedQuote
    ? (displayedQuote.status === "approved" ? "Convert to Invoice" : "Edit Quote")
    : "Create Quote";
  const invoiceActionLabel = displayedInvoice ? "Edit Invoice" : "Generate Invoice";
  const canGenerateInvoice = Boolean(
    displayedInvoice
    || displayedQuote?.status === "approved"
    || displayedJob?.status === "completed"
    || displayedJob?.status === "paid",
  );

  function buildActionContextQuery() {
    const params = new URLSearchParams();

    if (displayedJob) {
      params.set("id", displayedJob.id);
      params.set("service", displayedService?.name ?? getServiceTypeLabel(displayedJob.requested_service_type));
    }

    if (displayedCustomer) {
      params.set("customer", displayedCustomer.full_name);
    }

    const query = params.toString();
    return query ? `?${query}` : "";
  }

  const boardColumns = dashboardStatuses.map((status) => ({
    status,
    leads: (dashboard?.leads ?? []).filter((lead) => {
      const normalizedStatus = lead.status === "converted" ? "contacted" : lead.status;
      return getDashboardBoardStatus(normalizedStatus) === status;
    }),
    jobs: (dashboard?.jobs ?? []).filter((job) => getDashboardBoardStatus(job.status) === status),
  }));
  const groupedJobSections = dashboardStatuses
    .map((status) => ({
      status,
      jobs: pagedQueueJobs.filter((job) => getDashboardBoardStatus(job.status) === status),
    }))
    .filter((section) => section.jobs.length > 0);
  const operationalLaneColumns = useMemo(
    () => operationalLaneDefinitions.map((lane) => ({
      ...lane,
      jobs: (dashboard?.jobs ?? []).filter((job) => getOperationalLane(job) === lane.key),
    })),
    [dashboard?.jobs],
  );
  const fleetCounts = useMemo(() => {
    const jobs = dashboard?.jobs ?? [];
    const boardValueCents = jobs.reduce((sum, job) => sum + (getJobMoneyCents(job) ?? 0), 0);

    return {
      boardValueCents,
      unassigned: jobs.filter((job) => getOperationalLane(job) === "unassigned").length,
      blocked: jobs.filter((job) => getOperationalLane(job) === "blocked").length,
      ready: jobs.filter((job) => getOperationalLane(job) === "ready").length,
      today: jobs.filter((job) => getOperationalLane(job) === "today").length,
      upcoming: jobs.filter((job) => getOperationalLane(job) === "upcoming").length,
    };
  }, [dashboard?.jobs]);
  const intakeLeads = (dashboard?.leads ?? []).filter((lead) => lead.status !== "converted");
  const selectedQuickActions = displayedJob
    ? getOfficeQuickStatusActions(displayedJob.status).filter((nextStatus) =>
      canTransitionJobStatus(displayedJob.status, nextStatus),
    )
    : [];
  const operatorNextAction = displayedJob
    ? getOperatorNextAction(
      displayedJob,
      displayedQuote,
      displayedInvoice,
      displayedTechnician,
    )
    : null;
  const displayedJobMoneyCents = displayedJob ? getJobMoneyCents(displayedJob) : null;

  useEffect(() => {
    setQueuePage(1);
  }, [queueDateFilter, queueTechnicianFilter]);

  useEffect(() => {
    if (queuePage > queueTotalPages) {
      setQueuePage(queueTotalPages);
    }
  }, [queuePage, queueTotalPages]);

  function selectJobFromWidget(jobId: string | null) {
    if (!jobId) {
      return;
    }

    startTransition(() => {
      setSelectedJobId(jobId);
      setJobDetail(null);
    });
  }

  function buildConversionForm(lead: LeadRecord | null, services: ServiceRecord[]) {
    if (!lead) {
      return emptyConversionForm;
    }

    const defaultService = services.find(
      (service) => service.service_type === lead.service_type,
    );

    return {
      title: `${getServiceTypeLabel(lead.service_type)} for ${lead.full_name}`,
      description: lead.description ?? "",
      assignedTechnicianId: "",
      serviceId: defaultService?.id ?? "",
      scheduledFor: "",
      scheduledWindow: "",
    } satisfies LeadConversionFormState;
  }

  async function refreshDashboard(preferredJobId?: string | null, preferredLeadId?: string | null) {
    const data = await crmApiFetch<DashboardResponse>("/api/dashboard");

    startTransition(() => {
      setDashboard(data);

      const nextJobId = preferredJobId
        ?? (selectedJobId && data.jobs.some((job) => job.id === selectedJobId)
          ? selectedJobId
          : data.jobs[0]?.id ?? null);
      const nextLeadId = preferredLeadId
        ?? (selectedLeadId && data.leads.some((lead) => lead.id === selectedLeadId)
          ? selectedLeadId
          : data.leads[0]?.id ?? null);
      const nextLead = data.leads.find((lead) => lead.id === nextLeadId) ?? null;

      setSelectedJobId(nextJobId);
      setSelectedLeadId(nextLeadId);
      setConversionForm(buildConversionForm(nextLead, data.services));

      if (!nextJobId) {
        setJobDetail(null);
        setJobForm(emptyJobForm);
        setQuoteForm(emptyQuoteForm);
        setInvoiceForm(emptyInvoiceForm);
        setNoteForm(emptyNoteForm);
        setStatusNote("");
      }
    });
  }

  async function refreshJobDetail(jobId: string | null) {
    if (!jobId) {
      startTransition(() => {
        setJobDetail(null);
        setJobForm(emptyJobForm);
        setQuoteForm(emptyQuoteForm);
        setInvoiceForm(emptyInvoiceForm);
        setNoteForm(emptyNoteForm);
        setStatusNote("");
      });
      return;
    }

    const data = await crmApiFetch<JobDetail>(`/api/jobs/${jobId}`);
    const service = relationValue(data.service);
    const quote = relationValue(data.quote);
    const invoice = relationValue(data.invoice);

    startTransition(() => {
      setJobDetail(data);
      setJobForm({
        title: data.title,
        description: data.description ?? "",
        assignedTechnicianId: data.assigned_technician_id ?? "",
        serviceId: service?.id ?? "",
        scheduledFor: toDateTimeLocal(data.scheduled_for),
        scheduledWindow: data.scheduled_window ?? "",
      });
      setQuoteForm({
        description: quote?.description ?? "",
        priceCents: quote?.price_cents?.toString() ?? "",
        status: quote?.status ?? "draft",
      });
      setInvoiceForm({
        description: invoice?.description ?? "",
        amountCents: invoice?.amount_cents?.toString() ?? "",
        status: invoice?.status ?? "unpaid",
      });
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
      setErrorMessage(error instanceof Error ? error.message : "The action could not be completed.");
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function initializeBoard() {
      try {
        const data = await crmApiFetch<DashboardResponse>("/api/dashboard");

        if (!isMounted) {
          return;
        }

        const nextJobId = data.jobs[0]?.id ?? null;
        const nextLeadId = data.leads[0]?.id ?? null;
        const nextLead = data.leads.find((lead) => lead.id === nextLeadId) ?? null;

        startTransition(() => {
          setDashboard(data);
          setSelectedJobId(nextJobId);
          setSelectedLeadId(nextLeadId);
          setConversionForm(buildConversionForm(nextLead, data.services));
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "The office board could not be loaded.");
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
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsTimelineOpen(false);

    let isMounted = true;

    async function loadSelectedJob() {
      try {
        const data = await crmApiFetch<JobDetail>(`/api/jobs/${selectedJobId}`);
        const service = relationValue(data.service);
        const quote = relationValue(data.quote);
        const invoice = relationValue(data.invoice);

        if (!isMounted) {
          return;
        }

        startTransition(() => {
          setJobDetail(data);
          setJobForm({
            title: data.title,
            description: data.description ?? "",
            assignedTechnicianId: data.assigned_technician_id ?? "",
            serviceId: service?.id ?? "",
            scheduledFor: toDateTimeLocal(data.scheduled_for),
            scheduledWindow: data.scheduled_window ?? "",
          });
          setQuoteForm({
            description: quote?.description ?? "",
            priceCents: quote?.price_cents?.toString() ?? "",
            status: quote?.status ?? "draft",
          });
          setInvoiceForm({
            description: invoice?.description ?? "",
            amountCents: invoice?.amount_cents?.toString() ?? "",
            status: invoice?.status ?? "unpaid",
          });
          setNoteForm(emptyNoteForm);
          setStatusNote("");
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "The selected job could not be loaded.");
      }
    }

    void loadSelectedJob();

    return () => {
      isMounted = false;
    };
  }, [selectedJobId]);

  if (isBooting && !dashboard) {
    return (
      <BoardShell gridOpacity="subtle">
        <MobileJobsFieldCommand
          jobs={[]}
          technicians={[]}
          selectedJobId={null}
          mobileDetailJobId={null}
          queueTechnicianFilter={queueTechnicianFilter}
          queueDateFilter={queueDateFilter}
          queuePage={1}
          queueTotalPages={1}
          queueStartIndex={0}
          queueFilterActive={false}
          isBooting
          isRefreshing={false}
          errorMessage={errorMessage}
          statusMessage={statusMessage}
          displayedJob={null}
          operatorNextAction={null}
          displayedJobMoneyCents={null}
          onSelectJob={() => {}}
          onClearMobileDetail={() => {}}
          onTechnicianFilterChange={setQueueTechnicianFilter}
          onDateFilterChange={setQueueDateFilter}
          onClearFilters={() => {
            setQueueTechnicianFilter("all");
            setQueueDateFilter("");
          }}
          onQueuePageChange={setQueuePage}
          onRefresh={() => {}}
        />
        <div className="hidden min-h-screen items-center justify-center lg:flex">
          <div className="inline-flex items-center gap-3 text-sm text-[color:var(--sem-text-secondary)]">
            <LoaderCircle className="h-4 w-4 animate-spin text-[color:var(--sem-accent-primary)]" />
            Loading the jobs command board...
          </div>
        </div>
      </BoardShell>
    );
  }

  function selectLead(lead: LeadRecord) {
    startTransition(() => {
      setSelectedLeadId(lead.id);
      setConversionForm(buildConversionForm(lead, dashboard?.services ?? []));
    });
  }

  function selectJob(jobId: string) {
    startTransition(() => {
      setSelectedJobId(jobId);
      setJobDetail(null);
    });
  }

  function selectJobMobile(jobId: string) {
    setMobileDetailJobId(jobId);
    selectJob(jobId);
  }

  function clearMobileJobDetail() {
    setMobileDetailJobId(null);
  }

  function activateControlQueue(items: DashboardControlItem[]) {
    const firstJobId = items.find((item) => item.jobId)?.jobId ?? null;
    if (firstJobId) {
      selectJobFromWidget(firstJobId);
    }
  }

  return (
    <BoardShell gridOpacity="subtle">
      <MobileJobsFieldCommand
        jobs={pagedQueueJobs}
        technicians={dashboard?.technicians ?? []}
        selectedJobId={selectedJobId}
        mobileDetailJobId={mobileDetailJobId}
        queueTechnicianFilter={queueTechnicianFilter}
        queueDateFilter={queueDateFilter}
        queuePage={safeQueuePage}
        queueTotalPages={queueTotalPages}
        queueStartIndex={queueStartIndex}
        queueFilterActive={queueFilterActive}
        isBooting={false}
        isRefreshing={busyAction === "refresh" || isPending}
        errorMessage={errorMessage}
        statusMessage={statusMessage}
        displayedJob={displayedJob}
        operatorNextAction={operatorNextAction}
        displayedJobMoneyCents={displayedJobMoneyCents}
        onSelectJob={selectJobMobile}
        onClearMobileDetail={clearMobileJobDetail}
        onTechnicianFilterChange={setQueueTechnicianFilter}
        onDateFilterChange={setQueueDateFilter}
        onClearFilters={() => {
          setQueueTechnicianFilter("all");
          setQueueDateFilter("");
        }}
        onQueuePageChange={setQueuePage}
        onRefresh={() => {
          void runAction(
            "refresh",
            async () => {
              await Promise.all([
                refreshDashboard(selectedJobId, selectedLeadId),
                refreshJobDetail(selectedJobId),
              ]);
            },
            "The board was refreshed.",
          );
        }}
      />
      <div className="hidden lg:block">
      <div className="mx-auto max-w-[1720px] px-5 py-6 lg:px-8">
        <header className={`${flightDeckPanelClass} px-6 py-5`}>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className={flightDeckEyebrowClass}>Jobs Control · Dispatch + Revenue</p>
              <h1 className="mt-2 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] sm:text-5xl">
                Jobs Command Board
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                What needs assignment, what moves today, what is blocked, and what can be closed.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void runAction(
                  "refresh",
                  async () => {
                    await Promise.all([
                      refreshDashboard(selectedJobId, selectedLeadId),
                      refreshJobDetail(selectedJobId),
                    ]);
                  },
                  "The board was refreshed.",
                );
              }}
              className="theme-btn-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
            >
              <RefreshCw className={`h-4 w-4 ${busyAction === "refresh" || isPending ? "animate-spin" : ""}`} />
              Refresh board
            </button>
          </div>
        </header>

        {errorMessage || statusMessage ? (
          <div className={`mt-5 rounded-[22px] border px-4 py-3 text-sm ${errorMessage ? "theme-alert-error" : "theme-alert-info"}`}>
            {errorMessage ?? statusMessage}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricTile icon={Flame} label="New Leads" value={dashboard?.summary.newLeads ?? 0} />
          <MetricTile icon={Hammer} label="Active Jobs" value={dashboard?.summary.activeJobs ?? 0} />
          <MetricTile icon={Receipt} label="Unpaid Invoices" value={dashboard?.summary.unpaidInvoices ?? 0} />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            icon={CircleDollarSign}
            label="Board Value"
            value={formatCurrency(fleetCounts.boardValueCents)}
            helper="Visible jobs in current board"
          />
          <MetricTile
            icon={UserRound}
            label="Unassigned"
            value={fleetCounts.unassigned}
            helper="Needs dispatch now"
          />
          <MetricTile
            icon={Wrench}
            label="Blocked"
            value={fleetCounts.blocked}
            helper="Approval / office action"
          />
          <MetricTile
            icon={ShieldCheck}
            label="Ready to Close"
            value={fleetCounts.ready}
            helper="Move revenue forward"
          />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <CompactControlTile
            icon={FileText}
            title="Quotes Waiting"
            count={dashboard?.controls.quotesWaitingApproval.length ?? 0}
            tone="warning"
            onActivate={() => activateControlQueue(dashboard?.controls.quotesWaitingApproval ?? [])}
          />
          <CompactControlTile
            icon={Receipt}
            title="Unpaid Invoices"
            count={dashboard?.controls.unpaidInvoices.length ?? 0}
            tone="danger"
            onActivate={() => activateControlQueue(dashboard?.controls.unpaidInvoices ?? [])}
          />
          <CompactControlTile
            icon={ClipboardCheck}
            title="Follow-Ups"
            count={dashboard?.controls.followUpsNeeded.length ?? 0}
            tone="primary"
            onActivate={() => activateControlQueue(dashboard?.controls.followUpsNeeded ?? [])}
          />
        </div>

        <section className={`${flightDeckPanelClass} mt-5 p-4`}>
          <p className={flightDeckEyebrowClass}>Job Flow</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {operationalLaneColumns.map((lane) => (
              <div
                key={lane.key}
                className="rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{lane.title}</p>
                    <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{lane.helper}</p>
                  </div>
                  <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${laneToneClass(lane.tone)}`}>
                    {lane.jobs.length}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(280px,0.95fr)_minmax(0,1.35fr)_minmax(260px,0.85fr)]">
          <aside className={`${flightDeckPanelClass} flex min-h-[520px] flex-col p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={flightDeckEyebrowClass}>Daily Queue</p>
                <h2 className="mt-2 text-xl font-semibold text-[color:var(--sem-display-headline)]">Scan list</h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-1.5 text-xs text-[color:var(--sem-text-muted)]">
                <Filter className="h-3.5 w-3.5" />
                {queueJobs.length} jobs
              </span>
            </div>

            {intakeLeads.length > 0 ? (
              <div className="mt-4 rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className={flightDeckEyebrowClass}>Intake</p>
                  <button
                    type="button"
                    onClick={() => router.push("/leads")}
                    className="text-xs font-medium text-[color:var(--sem-accent-primary)]"
                  >
                    Open Leads
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {intakeLeads.slice(0, 4).map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => selectLead(lead)}
                      className={`block w-full rounded-[16px] border px-3 py-2 text-left text-sm transition ${selectedLeadId === lead.id ? "theme-selected-card" : "theme-control-surface border-[color:var(--cmp-border-subtle)] hover:bg-[color:var(--cmp-hover-surface)]"}`}
                    >
                      <p className="font-medium text-[color:var(--sem-text-primary)]">{lead.full_name}</p>
                      <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">
                        {getServiceTypeLabel(lead.service_type)} · {lead.phone}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3">
              <FieldLabel label="Filter by Technician">
                <FieldSelect value={queueTechnicianFilter} onChange={(event) => setQueueTechnicianFilter(event.target.value)}>
                  <option value="all">All technicians</option>
                  {dashboard?.technicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.display_name}
                    </option>
                  ))}
                </FieldSelect>
              </FieldLabel>
              <FieldLabel label="Filter by Date">
                <FieldInput type="date" value={queueDateFilter} onChange={(event) => setQueueDateFilter(event.target.value)} />
              </FieldLabel>
              <button
                type="button"
                onClick={() => {
                  setQueueTechnicianFilter("all");
                  setQueueDateFilter("");
                }}
                className="rounded-[18px] theme-control-surface border border-[color:var(--cmp-border-subtle)] px-4 py-2.5 text-sm text-[color:var(--sem-text-secondary)] transition hover:bg-[color:var(--cmp-hover-surface)] hover:text-[color:var(--sem-text-primary)]"
              >
                Clear filters
              </button>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-[20px] border border-[color:var(--cmp-border-subtle)]">
              {pagedQueueJobs.length > 0 ? (
                <div className="max-h-[520px] overflow-y-auto">
                  {pagedQueueJobs.map((job) => {
                    const customer = relationValue(job.customer);
                    const technician = relationValue(job.technician);
                    const moneyLabel = formatCurrency(getJobMoneyCents(job));

                    return (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => selectJob(job.id)}
                        className={`grid w-full grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[color:var(--cmp-border-subtle)] px-3 py-3 text-left last:border-b-0 ${selectedJobId === job.id ? "theme-selected-card" : "bg-[color:var(--cmp-surface-panel)] hover:bg-[color:var(--cmp-hover-surface)]"}`}
                      >
                        <span className="font-[family:var(--font-geist-mono)] text-xs text-[color:var(--sem-accent-primary)]">
                          {job.scheduled_for
                            ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(job.scheduled_for))
                            : "—"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[color:var(--sem-text-primary)]">{customer?.full_name ?? job.title}</p>
                          <p className="truncate text-xs text-[color:var(--sem-text-muted)]">
                            {technician?.display_name ?? "Unassigned"} · {getJobStatusLabel(job.status)}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-10 text-center text-sm text-[color:var(--sem-text-secondary)]">
                  {queueFilterActive
                    ? "No jobs match the current technician and date filters."
                    : "No jobs are active yet. Start in Leads, then convert a lead to create the first service ticket."}
                  {!queueFilterActive ? (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => router.push("/leads")}
                        className="inline-flex items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:bg-[color:var(--cmp-hover-surface)] hover:text-[color:var(--sem-text-primary)]"
                      >
                        Open Leads
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {pagedQueueJobs.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[color:var(--sem-text-muted)]">
                  {queueStartIndex + 1}-{Math.min(queueStartIndex + QUEUE_ITEMS_PER_PAGE, queueJobs.length)} of {queueJobs.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safeQueuePage <= 1}
                    onClick={() => setQueuePage((current) => Math.max(1, current - 1))}
                    className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1.5 text-xs text-[color:var(--sem-text-secondary)] disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-[color:var(--sem-text-muted)]">{safeQueuePage}/{queueTotalPages}</span>
                  <button
                    type="button"
                    disabled={safeQueuePage >= queueTotalPages}
                    onClick={() => setQueuePage((current) => Math.min(queueTotalPages, current + 1))}
                    className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1.5 text-xs text-[color:var(--sem-text-secondary)] disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </aside>

          <section className={`${flightDeckPanelClass} p-5`}>
            {displayedJob && operatorNextAction ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={flightDeckEyebrowClass}>Selected Job</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">
                      {displayedCustomer?.full_name ?? "Customer pending"}
                    </h2>
                    <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                      {displayedJob.title}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusTone(displayedJob.status)}`}>
                    {getJobStatusLabel(displayedJob.status)}
                  </span>
                </div>

                <div className="mt-5 rounded-[22px] border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] p-4">
                  <p className={flightDeckEyebrowClass}>Next Action</p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--sem-text-primary)]">{operatorNextAction.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{operatorNextAction.detail}</p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-[color:var(--sem-text-muted)]">
                      <UserRound className="h-3.5 w-3.5 text-[color:var(--sem-accent-primary)]" />
                      Customer
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">
                      {displayedCustomer?.full_name ?? "Customer pending"}
                    </p>
                    {displayedCustomer?.phone ? (
                      <a href={`tel:${displayedCustomer.phone}`} className="mt-2 inline-flex items-center gap-2 text-sm text-[color:var(--sem-accent-primary)]">
                        <Phone className="h-3.5 w-3.5" />
                        {displayedCustomer.phone}
                      </a>
                    ) : null}
                    <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--sem-accent-primary)]" />
                      {formatAddress(
                        displayedJob.service_address_line_1,
                        displayedJob.service_address_line_2,
                        displayedJob.service_city,
                        displayedJob.service_state_or_region,
                        displayedJob.service_postal_code,
                      )}
                    </p>
                  </div>

                  <div className="rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-[color:var(--sem-text-muted)]">
                      <CalendarDays className="h-3.5 w-3.5 text-[color:var(--sem-accent-primary)]" />
                      Schedule
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">
                      {formatDateTime(displayedJob.scheduled_for)}
                      {displayedJob.scheduled_window ? ` · ${displayedJob.scheduled_window}` : ""}
                    </p>
                    <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                      {displayedTechnician?.display_name ?? "Unassigned technician"}
                    </p>
                  </div>

                  <div className="rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4 sm:col-span-2">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-[color:var(--sem-text-muted)]">
                      <CircleDollarSign className="h-3.5 w-3.5 text-[color:var(--sem-accent-primary)]" />
                      Money
                    </div>
                    <div className="mt-2 flex flex-wrap items-end gap-4">
                      <p className="font-[family:var(--font-geist-mono)] text-2xl font-semibold tabular-nums text-[color:var(--sem-display-headline)]">
                        {formatCurrency(displayedJobMoneyCents)}
                      </p>
                      <div className="text-sm text-[color:var(--sem-text-secondary)]">
                        {displayedQuote ? (
                          <span>Quote · {formatLifecycleStatus(displayedQuote.status)} · {formatCurrency(displayedQuote.price_cents)}</span>
                        ) : (
                          <span>No quote on file</span>
                        )}
                        {displayedInvoice ? (
                          <span className="ml-3">
                            Invoice · {formatLifecycleStatus(displayedInvoice.status)} · {formatCurrency(displayedInvoice.amount_cents)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
                  <p className={flightDeckEyebrowClass}>Service</p>
                  <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                    {displayedService?.name ?? getServiceTypeLabel(displayedJob.requested_service_type)}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <p className={flightDeckEyebrowClass}>Selected Job</p>
                <p className="mt-3 text-lg font-semibold text-[color:var(--sem-text-primary)]">Select a job from the queue</p>
                <p className="mt-2 max-w-sm text-sm text-[color:var(--sem-text-secondary)]">
                  The focus panel shows customer, next action, schedule, and revenue for the active ticket.
                </p>
              </div>
            )}
          </section>

          <aside className={`${flightDeckPanelClass} p-5`}>
            <p className={flightDeckEyebrowClass}>Actions</p>
            <h2 className="mt-2 text-xl font-semibold text-[color:var(--sem-display-headline)]">Move work forward</h2>

            {displayedJob ? (
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={() => router.push(`/jobs/${displayedJob.id}`)}
                  className="theme-btn-primary w-full rounded-full px-4 py-2.5 text-sm font-semibold"
                >
                  Open Job
                </button>

                {displayedCustomer?.phone ? (
                  <a
                    href={`tel:${displayedCustomer.phone}`}
                    className="flex w-full items-center justify-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-4 py-2.5 text-sm font-medium text-[color:var(--sem-text-primary)] transition hover:bg-[color:var(--cmp-hover-surface)]"
                  >
                    <Phone className="h-4 w-4" />
                    Call Customer
                  </a>
                ) : null}

                {displayedJobGoogleMapsUrl ? (
                  <a
                    href={displayedJobGoogleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-4 py-2.5 text-sm font-medium text-[color:var(--sem-text-primary)] transition hover:bg-[color:var(--cmp-hover-surface)]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Google Maps
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={() => router.push(`/jobs/${displayedJob.id}${buildActionContextQuery()}#quote`)}
                  className="w-full rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-4 py-2.5 text-sm font-medium text-[color:var(--sem-text-primary)] transition hover:bg-[color:var(--cmp-hover-surface)]"
                >
                  {quoteActionLabel}
                </button>

                {canGenerateInvoice ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/jobs/${displayedJob.id}${buildActionContextQuery()}#invoice`)}
                    className="w-full rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-4 py-2.5 text-sm font-medium text-[color:var(--sem-text-primary)] transition hover:bg-[color:var(--cmp-hover-surface)]"
                  >
                    {invoiceActionLabel}
                  </button>
                ) : null}

                <div className="rounded-[20px] border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] p-4">
                  <p className={flightDeckEyebrowClass}>Quick Status</p>
                  <div className="mt-3 grid gap-2">
                    {selectedQuickActions.length > 0 ? selectedQuickActions.map((nextStatus) => {
                      const actionKey = `focus-status-${displayedJob.id}-${nextStatus}`;

                      return (
                        <button
                          key={nextStatus}
                          type="button"
                          disabled={Boolean(busyAction)}
                          onClick={() => {
                            void runAction(
                              actionKey,
                              async () => {
                                await crmApiFetch(`/api/jobs/${displayedJob.id}/status`, {
                                  method: "POST",
                                  body: JSON.stringify({ status: nextStatus, note: statusNote || null }),
                                });
                                await Promise.all([
                                  refreshDashboard(displayedJob.id, selectedLeadId),
                                  refreshJobDetail(displayedJob.id),
                                ]);
                              },
                              `${displayedCustomer?.full_name ?? "Job"} moved to ${getJobStatusLabel(nextStatus)}.`,
                            );
                          }}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm font-medium text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)] disabled:opacity-60"
                        >
                          {busyAction === actionKey ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                          {getJobStatusLabel(nextStatus)}
                        </button>
                      );
                    }) : (
                      <span className="text-sm text-[color:var(--sem-text-muted)]">No quick status moves available.</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[color:var(--sem-text-secondary)]">
                Select a job to unlock dispatch, customer, and billing actions.
              </p>
            )}
          </aside>
        </div>

        <HiddenLegacyKanbanBoard
          boardColumns={boardColumns}
          operationalLaneColumns={operationalLaneColumns}
          selectedJobId={selectedJobId}
          selectedLeadId={selectedLeadId}
          onSelectJob={selectJob}
          onSelectLead={selectLead}
        />

        <div className="hidden" aria-hidden="true" data-flight-deck-legacy-widgets="true">
          <ControlWidget
            icon={FileText}
            title="Quotes Waiting Approval"
            items={dashboard?.controls.quotesWaitingApproval ?? []}
            emptyLabel="No quotes are waiting approval."
            selectedJobId={selectedJobId}
            onSelectJob={selectJobFromWidget}
          />
          <ControlWidget
            icon={ShieldCheck}
            title="Recent Completed Jobs"
            items={dashboard?.controls.recentCompletedJobs ?? []}
            emptyLabel="No recent completed jobs are available."
            selectedJobId={selectedJobId}
            onSelectJob={selectJobFromWidget}
          />
          {groupedJobSections.map(({ status, jobs }) => (
            <div key={status}>{getDashboardStatusLabel(status)} · {jobs.length}</div>
          ))}
        </div>
      </div>
      </div>
    </BoardShell>
  );
}

