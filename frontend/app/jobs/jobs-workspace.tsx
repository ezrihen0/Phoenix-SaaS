"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  CalendarDays,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Flame,
  FolderOpen,
  Hammer,
  LoaderCircle,
  MapPin,
  Phone,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wrench,
} from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import { buildAddressQuery, buildGoogleMapsSearchUrl } from "@/lib/crm/display";
import {
  canTransitionJobStatus,
  dashboardStatuses,
  getDashboardBoardStatus,
  getDashboardStatusLabel,
  getJobStatusLabel,
  getServiceTypeLabel,
  jobStatuses,
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

function SectionFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5 sm:p-6">
      <p className="text-[11px] uppercase tracking-[0.38em] text-[color:var(--sem-text-muted)]">{subtitle}</p>
      <h2 className="mt-3 font-[family:var(--font-flat-display)] text-3xl tracking-tight text-[color:var(--sem-text-primary)]">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Flame;
  label: string;
  value: number;
}) {
  return (
    <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl theme-control-surface-soft text-[color:var(--sem-accent-primary)]">
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-4 text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--sem-text-primary)]">{value}</p>
    </article>
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
      <main className="flex min-h-screen items-center justify-center bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
        <div className="inline-flex items-center gap-3 text-sm text-[color:var(--sem-text-secondary)]">
          <LoaderCircle className="h-4 w-4 animate-spin text-[color:var(--sem-accent-primary)]" />
          Loading the office operations board...
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="absolute inset-0 theme-overlay-atmosphere" />
      <div className="absolute inset-0 theme-overlay-grid opacity-20" />

      <div className="relative mx-auto max-w-[1600px] px-5 py-7 lg:px-8">
        <header className="theme-surface-modal rounded-[34px] p-6 sm:p-7">
          <div>
            <h1 className="max-w-4xl font-[family:var(--font-flat-display)] text-5xl leading-none tracking-tight text-[color:var(--sem-text-primary)] sm:text-6xl">
              Office board for lead intake, dispatch, estimates, and payment follow-through.
            </h1>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard icon={Flame} label="New Leads" value={dashboard?.summary.newLeads ?? 0} />
            <MetricCard icon={Sparkles} label="Contacted Leads" value={dashboard?.summary.contactedLeads ?? 0} />
            <MetricCard icon={Hammer} label="Active Jobs" value={dashboard?.summary.activeJobs ?? 0} />
            <MetricCard icon={CalendarDays} label="Scheduled Today" value={dashboard?.summary.jobsScheduledToday ?? 0} />
            <MetricCard icon={Receipt} label="Unpaid Invoices" value={dashboard?.summary.unpaidInvoices ?? 0} />
          </div>
        </header>

        <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          {errorMessage || statusMessage ? (
            <div className={`rounded-[22px] border px-4 py-3 text-sm ${errorMessage ? "theme-alert-error" : "theme-alert-info"}`}>
              {errorMessage ?? statusMessage}
            </div>
          ) : (
            <div />
          )}
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
            className="inline-flex items-center justify-center gap-2 rounded-[22px] theme-control-surface px-4 py-3 text-sm text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-subtle)] hover:text-[color:var(--sem-text-primary)]"
          >
            <RefreshCw className={`h-4 w-4 ${busyAction === "refresh" || isPending ? "animate-spin" : ""}`} />
            Refresh board
          </button>
        </div>

        <div className="mt-7">
          <SectionFrame title="Control Widgets" subtitle="Office Overview">
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
              <ControlWidget
                icon={FileText}
                title="Quotes Waiting Approval"
                items={dashboard?.controls.quotesWaitingApproval ?? []}
                emptyLabel="No quotes are waiting approval."
                selectedJobId={selectedJobId}
                onSelectJob={selectJobFromWidget}
              />
              <ControlWidget
                icon={Receipt}
                title="Unpaid Invoices"
                items={dashboard?.controls.unpaidInvoices ?? []}
                emptyLabel="No unpaid invoices are in the queue."
                selectedJobId={selectedJobId}
                onSelectJob={selectJobFromWidget}
              />
              <ControlWidget
                icon={ClipboardCheck}
                title="Follow-Ups Needed"
                items={dashboard?.controls.followUpsNeeded ?? []}
                emptyLabel="No follow-ups are waiting for office action."
                selectedJobId={selectedJobId}
                onSelectJob={selectJobFromWidget}
              />
              <ControlWidget
                icon={CalendarDays}
                title="Today's Scheduled Jobs"
                items={dashboard?.controls.todaysScheduledJobs ?? []}
                emptyLabel="No jobs are scheduled today."
                selectedJobId={selectedJobId}
                onSelectJob={selectJobFromWidget}
              />
              <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-muted)]">
                Includes non-cancelled jobs scheduled for today, including completed/paid.
              </p>
              <ControlWidget
                icon={ShieldCheck}
                title="Recent Completed Jobs"
                items={dashboard?.controls.recentCompletedJobs ?? []}
                emptyLabel="No recent completed jobs are available."
                selectedJobId={selectedJobId}
                onSelectJob={selectJobFromWidget}
              />
            </div>
          </SectionFrame>
        </div>

        <div className="mt-7">
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
                      onClick={() => {
                        startTransition(() => {
                          setSelectedLeadId(lead.id);
                          setConversionForm(buildConversionForm(lead, dashboard?.services ?? []));
                        });
                      }}
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
                        onClick={() => {
                          startTransition(() => {
                            setSelectedJobId(job.id);
                            setJobDetail(null);
                          });
                        }}
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
        </div>

        <div className="mt-7">

          <SectionFrame title="Daily Job Queue" subtitle="Office Control">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
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
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setQueueTechnicianFilter("all");
                    setQueueDateFilter("");
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] theme-control-surface border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)] transition hover:bg-[color:var(--cmp-hover-surface)] hover:text-[color:var(--sem-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)]"
                >
                  Clear filters
                </button>
              </div>
            </div>

            {groupedJobSections.length ? (
              <div className="mt-6 space-y-5">
                {groupedJobSections.map(({ status, jobs }) => (
                  <section key={status} className="theme-control-surface-soft rounded-[24px] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--cmp-border-subtle)] pb-3">
                      <div>
                        <p className="text-lg font-semibold text-[color:var(--sem-text-primary)]">{getDashboardStatusLabel(status)}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                          {jobs.length} job{jobs.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.24em] ${statusTone(status)}`}>
                        {getDashboardStatusLabel(status)}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {jobs.map((job) => {
                        const customer = relationValue(job.customer);
                        const technician = relationValue(job.technician);
                        const service = relationValue(job.service);
                        const googleMapsUrl = buildGoogleMapsSearchUrl(
                          buildAddressQuery(
                            job.service_address_line_1,
                            job.service_address_line_2,
                            job.service_city,
                            job.service_state_or_region,
                            job.service_postal_code,
                          ),
                        );
                        const quickActions = getOfficeQuickStatusActions(job.status).filter((nextStatus) =>
                          canTransitionJobStatus(job.status, nextStatus),
                        );

                        return (
                          <article
                            key={job.id}
                            className={`rounded-[22px] border p-4 transition ${selectedJobId === job.id ? "theme-selected-card" : "theme-control-surface"}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-base font-semibold text-[color:var(--sem-text-primary)]">{job.title}</p>
                                <p className="mt-1 text-sm text-[color:var(--sem-text-muted)]">
                                  {formatAddress(
                                    job.service_address_line_1,
                                    job.service_address_line_2,
                                    job.service_city,
                                    job.service_state_or_region,
                                    job.service_postal_code,
                                  )}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  router.push(`/jobs/${job.id}`);
                                }}
                                className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)] transition hover:bg-[color:var(--cmp-hover-surface)] hover:text-[color:var(--sem-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)]"
                              >
                                Open Job
                              </button>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                              <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-3">
                                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-secondary)]">Customer</p>
                                <p className="mt-2 text-sm text-[color:var(--sem-text-primary)]">{customer?.full_name ?? "Customer pending"}</p>
                              </div>
                              <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-3">
                                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-secondary)]">Service Type</p>
                                <p className="mt-2 text-sm text-[color:var(--sem-text-primary)]">{service?.name ?? getServiceTypeLabel(job.requested_service_type)}</p>
                              </div>
                              <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-3">
                                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-secondary)]">Scheduled</p>
                                <p className="mt-2 text-sm text-[color:var(--sem-text-primary)]">{formatDateTime(job.scheduled_for)}{job.scheduled_window ? ` - ${job.scheduled_window}` : ""}</p>
                              </div>
                              <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-3">
                                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-secondary)]">Assigned Technician</p>
                                <p className="mt-2 text-sm text-[color:var(--sem-text-primary)]">{technician?.display_name ?? "Unassigned"}</p>
                              </div>
                              <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-3">
                                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-secondary)]">Current Status</p>
                                <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] ${statusTone(job.status)}`}>
                                  {getJobStatusLabel(job.status)}
                                </span>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-2">
                              <a
                                href={googleMapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--button-secondary-border)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--sem-accent-primary)] transition hover:border-[color:var(--button-secondary-border)] hover:bg-[color:var(--button-secondary-bg)]"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Google Maps
                              </a>
                              <span className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-secondary)]">Quick Status</span>
                              {quickActions.length ? quickActions.map((nextStatus) => {
                                const actionKey = `queue-status-${job.id}-${nextStatus}`;

                                return (
                                  <button
                                    key={nextStatus}
                                    type="button"
                                    disabled={Boolean(busyAction)}
                                    onClick={() => {
                                      void runAction(
                                        actionKey,
                                        async () => {
                                          await crmApiFetch(`/api/jobs/${job.id}/status`, {
                                            method: "POST",
                                            body: JSON.stringify({ status: nextStatus, note: null }),
                                          });
                                          await Promise.all([
                                            refreshDashboard(job.id, selectedLeadId),
                                            refreshJobDetail(job.id),
                                          ]);
                                        },
                                        `${customer?.full_name ?? "Job"} moved to ${getJobStatusLabel(nextStatus)}.`,
                                      );
                                    }}
                                    className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-subtle)] hover:text-[color:var(--sem-text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {busyAction === actionKey ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                                    {getJobStatusLabel(nextStatus)}
                                  </button>
                                );
                              }) : (
                                <span className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
                                  No quick actions
                                </span>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
                <div className="flex flex-col gap-3 rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-[color:var(--sem-text-secondary)]">
                    Showing {queueStartIndex + 1}-{Math.min(queueStartIndex + QUEUE_ITEMS_PER_PAGE, queueJobs.length)} of {queueJobs.length} jobs
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={safeQueuePage <= 1}
                      onClick={() => setQueuePage((current) => Math.max(1, current - 1))}
                      className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:bg-[color:var(--cmp-hover-surface)] hover:text-[color:var(--sem-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">
                      Page {safeQueuePage} of {queueTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeQueuePage >= queueTotalPages}
                      onClick={() => setQueuePage((current) => Math.min(queueTotalPages, current + 1))}
                      className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:bg-[color:var(--cmp-hover-surface)] hover:text-[color:var(--sem-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-[28px] theme-control-surface-soft border-dashed bg-[color:var(--cmp-surface-panel)] px-5 py-10 text-center text-sm text-[color:var(--sem-text-secondary)]">
                {queueFilterActive
                  ? "No jobs match the current technician and date filters."
                  : "No jobs are active yet. Convert a lead to start the first service ticket."}
              </div>
            )}
          </SectionFrame>

        </div>
      </div>
    </main>
  );
}

