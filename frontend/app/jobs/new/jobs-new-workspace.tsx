"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  UserRound,
} from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import { formatJobCurrency, getJobTypeLabel, type JobTypeValue } from "@/lib/crm/job-field-display";
import {
  createCustomer,
  fetchCustomerDetail,
  searchCustomers,
  type CustomerSearchRow,
  type ServiceCatalogRow,
} from "@/lib/crm/jobs-new-api";
import {
  buildScheduledWindow,
  buildTechnicianIntakeSlots,
  filterJobsForDate,
  formatIntakeScheduleSummary,
  formatTimeInputLabel,
  type SchedulingJobRecord,
} from "@/lib/crm/scheduling-utils";
import type { Database } from "@/lib/types/database";

type ServiceType = Database["public"]["Enums"]["service_type"];

export type TechnicianOption = {
  id: string;
  display_name: string;
  phone: string | null;
  is_active: boolean;
};

export type JobsNewInitialSource = {
  kind: "customer" | "lead";
  customerId: string | null;
  leadId: string | null;
  fullName: string;
  phone: string;
  email: string;
  serviceAddressLine1: string;
  serviceAddressLine2: string;
  serviceCity: string;
  serviceStateOrRegion: string;
  servicePostalCode: string;
  defaultJobType: JobTypeValue;
  defaultInternalNotes: string;
  defaultCustomerConcern: string;
};

type JobsNewWorkspaceProps = {
  technicians: TechnicianOption[];
  services: ServiceCatalogRow[];
  canManageCustomers: boolean;
  initialSource: JobsNewInitialSource | null;
};

type DraftState = {
  fullName: string;
  phone: string;
  email: string;
  serviceAddressLine1: string;
  serviceAddressLine2: string;
  serviceCity: string;
  serviceStateOrRegion: string;
  servicePostalCode: string;
  jobType: JobTypeValue;
  serviceId: string;
  customerConcern: string;
  internalNotes: string;
  selectedDate: string;
  assignedTechnicianId: string;
  startTime: string;
  endTime: string;
  selectedCustomerId: string;
};

const DRAFT_KEY = "wizfield-jobs-new-draft:v1";
const JOB_TYPES: JobTypeValue[] = ["inspection", "installation_repair", "callback_warranty"];
/** Fixed 2-hour intake windows for /jobs/new only (max 5 appointments per tech per day). */
const JOBS_NEW_DAILY_SLOT_STARTS = ["09:00", "11:00", "13:00", "15:00", "17:00"] as const;
const JOBS_NEW_APPOINTMENT_DURATION_MINUTES = 120;

const inputClass =
  "theme-input-control h-11 w-full rounded-xl border px-3 text-sm transition focus:outline-none focus:ring-2 focus:ring-[color:var(--cmp-focus-ring)]";
const labelClass = "text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]";
const sectionClass = "space-y-4 border-b border-[color:var(--cmp-border-subtle)] pb-6 last:border-b-0 last:pb-0";

function todayDateInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function shiftDateInputValue(value: string, days: number) {
  const base = new Date(`${value}T12:00:00`);

  if (Number.isNaN(base.getTime())) {
    return todayDateInputValue();
  }

  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function formatScheduleDateLabel(value: string) {
  if (!value) {
    return "Select a date";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function readDraft(): Partial<DraftState> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<DraftState>) : null;
  } catch {
    return null;
  }
}

function writeDraft(state: DraftState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
}

function clearDraft() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(DRAFT_KEY);
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export default function JobsNewWorkspace({
  technicians,
  services,
  canManageCustomers,
  initialSource,
}: JobsNewWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const submitLockRef = useRef(false);

  const activeTechnicians = useMemo(
    () => technicians.filter((technician) => technician.is_active),
    [technicians],
  );

  const [customerId, setCustomerId] = useState<string | null>(initialSource?.customerId ?? null);
  const [leadId] = useState<string | null>(initialSource?.leadId ?? null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerSearchRow[]>([]);
  const [customerSearchBusy, setCustomerSearchBusy] = useState(false);

  const [fullName, setFullName] = useState(initialSource?.fullName ?? "");
  const [phone, setPhone] = useState(initialSource?.phone ?? "");
  const [email, setEmail] = useState(initialSource?.email ?? "");
  const [serviceAddressLine1, setServiceAddressLine1] = useState(initialSource?.serviceAddressLine1 ?? "");
  const [serviceAddressLine2, setServiceAddressLine2] = useState(initialSource?.serviceAddressLine2 ?? "");
  const [serviceCity, setServiceCity] = useState(initialSource?.serviceCity ?? "");
  const [serviceStateOrRegion, setServiceStateOrRegion] = useState(initialSource?.serviceStateOrRegion ?? "");
  const [servicePostalCode, setServicePostalCode] = useState(initialSource?.servicePostalCode ?? "");

  const [jobType, setJobType] = useState<JobTypeValue>(initialSource?.defaultJobType ?? "inspection");
  const [serviceId, setServiceId] = useState("");
  const [customerConcern, setCustomerConcern] = useState(initialSource?.defaultCustomerConcern ?? "");
  const [internalNotes, setInternalNotes] = useState(initialSource?.defaultInternalNotes ?? "");

  const [selectedDate, setSelectedDate] = useState(todayDateInputValue());
  const [assignedTechnicianId, setAssignedTechnicianId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [scheduleJobs, setScheduleJobs] = useState<SchedulingJobRecord[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId) ?? null,
    [serviceId, services],
  );

  const dayJobs = useMemo(
    () => filterJobsForDate(scheduleJobs, selectedDate),
    [scheduleJobs, selectedDate],
  );

  const technicianSlots = useMemo(
    () => buildTechnicianIntakeSlots({
      technicians: activeTechnicians,
      dayJobs,
      selectedDate,
      slotStarts: JOBS_NEW_DAILY_SLOT_STARTS,
      durationMinutes: JOBS_NEW_APPOINTMENT_DURATION_MINUTES,
    }),
    [activeTechnicians, dayJobs, selectedDate],
  );

  const selectedTechnicianSlots = useMemo(
    () => technicianSlots.find((technician) => technician.technicianId === assignedTechnicianId) ?? null,
    [technicianSlots, assignedTechnicianId],
  );

  const selectedTechnicianName = useMemo(
    () => activeTechnicians.find((tech) => tech.id === assignedTechnicianId)?.display_name ?? "",
    [activeTechnicians, assignedTechnicianId],
  );

  const scheduleSummary = useMemo(() => {
    if (!assignedTechnicianId || !selectedDate || !startTime || !endTime) {
      return null;
    }

    return formatIntakeScheduleSummary(
      selectedDate,
      startTime,
      endTime,
      selectedTechnicianName,
    );
  }, [assignedTechnicianId, selectedDate, startTime, endTime, selectedTechnicianName]);

  const servicePriceLabel = useMemo(() => {
    if (!selectedService) {
      return "—";
    }

    return formatJobCurrency(selectedService.default_price_cents) ?? "—";
  }, [selectedService]);

  useEffect(() => {
    if (initialSource || draftRestored) {
      return;
    }

    const draft = readDraft();

    if (!draft) {
      setDraftRestored(true);
      return;
    }

    setFullName(draft.fullName ?? "");
    setPhone(draft.phone ?? "");
    setEmail(draft.email ?? "");
    setServiceAddressLine1(draft.serviceAddressLine1 ?? "");
    setServiceAddressLine2(draft.serviceAddressLine2 ?? "");
    setServiceCity(draft.serviceCity ?? "");
    setServiceStateOrRegion(draft.serviceStateOrRegion ?? "");
    setServicePostalCode(draft.servicePostalCode ?? "");
    setJobType(draft.jobType ?? "inspection");
    setServiceId(draft.serviceId ?? "");
    setCustomerConcern(draft.customerConcern ?? "");
    setInternalNotes(draft.internalNotes ?? "");
    setSelectedDate(draft.selectedDate ?? todayDateInputValue());
    setAssignedTechnicianId(draft.assignedTechnicianId ?? "");
    setStartTime(draft.startTime ?? "");
    setEndTime(draft.endTime ?? "");

    if (draft.selectedCustomerId) {
      setCustomerId(draft.selectedCustomerId);
    }

    setDraftRestored(true);
  }, [draftRestored, initialSource]);

  useEffect(() => {
    if (!draftRestored) {
      return;
    }

    const handle = window.setTimeout(() => {
      writeDraft({
        fullName,
        phone,
        email,
        serviceAddressLine1,
        serviceAddressLine2,
        serviceCity,
        serviceStateOrRegion,
        servicePostalCode,
        jobType,
        serviceId,
        customerConcern,
        internalNotes,
        selectedDate,
        assignedTechnicianId,
        startTime,
        endTime,
        selectedCustomerId: customerId ?? "",
      });
    }, 400);

    return () => window.clearTimeout(handle);
  }, [
    assignedTechnicianId,
    customerConcern,
    customerId,
    draftRestored,
    email,
    endTime,
    fullName,
    internalNotes,
    jobType,
    phone,
    selectedDate,
    serviceAddressLine1,
    serviceAddressLine2,
    serviceCity,
    serviceId,
    servicePostalCode,
    serviceStateOrRegion,
    startTime,
  ]);

  useEffect(() => {
    let ignore = false;

    void crmApiFetch<SchedulingJobRecord[]>("/api/jobs")
      .then((jobs) => {
        if (!ignore) {
          setScheduleJobs(jobs);
          setScheduleError(null);
        }
      })
      .catch((error) => {
        if (!ignore) {
          setScheduleError(error instanceof Error ? error.message : "Schedule data could not be loaded.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setScheduleLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = customerQuery.trim();

    if (trimmed.length < 2 || customerId) {
      setCustomerResults([]);
      return;
    }

    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      setCustomerSearchBusy(true);

      void searchCustomers(trimmed, controller.signal)
        .then((results) => {
          setCustomerResults(results);
        })
        .catch(() => {
          setCustomerResults([]);
        })
        .finally(() => {
          setCustomerSearchBusy(false);
        });
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [customerId, customerQuery]);

  const selectCustomer = useCallback(async (row: CustomerSearchRow) => {
    setCustomerId(row.id);
    setCustomerQuery("");
    setCustomerResults([]);
    setDuplicateWarning(null);

    try {
      const detail = await fetchCustomerDetail(row.id);
      const customer = detail.customer;
      setFullName(customer.full_name);
      setPhone(customer.phone);
      setEmail(customer.email ?? "");
      setServiceAddressLine1(customer.service_address_line_1);
      setServiceAddressLine2(customer.service_address_line_2 ?? "");
      setServiceCity(customer.service_city);
      setServiceStateOrRegion(customer.service_state_or_region ?? "");
      setServicePostalCode(customer.service_postal_code);
    } catch {
      setFullName(row.full_name);
      setPhone(row.phone);
      setEmail(row.email ?? "");
    }
  }, []);

  function clearCustomerSelection() {
    setCustomerId(null);
    setFullName("");
    setPhone("");
    setEmail("");
    setDuplicateWarning(null);
  }

  function selectSlot(slotStart: string, slotEnd: string) {
    setStartTime(slotStart);
    setEndTime(slotEnd);
    setErrorMessage(null);
  }

  function handleTechnicianChange(technicianId: string) {
    setAssignedTechnicianId(technicianId);
    setStartTime("");
    setEndTime("");
    setErrorMessage(null);
  }

  function handleScheduleDateChange(nextDate: string) {
    setSelectedDate(nextDate);
    setStartTime("");
    setEndTime("");
  }

  function validateIntake(requireSchedule: boolean) {
    if (!fullName.trim()) {
      return "Customer name is required.";
    }

    if (!phone.trim()) {
      return "Customer phone is required.";
    }

    if (!serviceAddressLine1.trim() || !serviceCity.trim() || !servicePostalCode.trim()) {
      return "Service address, city, and postal code are required.";
    }

    if (services.length > 0 && !serviceId) {
      return "Select a service from the catalog.";
    }

    if (requireSchedule) {
      if (!assignedTechnicianId || !selectedDate || !startTime || !endTime) {
        return "Select an available time slot before scheduling this job.";
      }
    }

    return null;
  }

  async function resolveCustomerIdForSubmit() {
    if (customerId) {
      return customerId;
    }

    if (leadId) {
      return null;
    }

    if (!canManageCustomers) {
      throw new Error("This account cannot create customers. Search for an existing customer or ask an admin.");
    }

    const normalizedPhone = phone.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const duplicate = customerResults.find((row) => {
      if (normalizedPhone && row.phone.trim() === normalizedPhone) {
        return true;
      }

      if (normalizedEmail && row.email?.trim().toLowerCase() === normalizedEmail) {
        return true;
      }

      return false;
    });

    if (duplicate) {
      throw new Error(`A matching customer already exists (${duplicate.full_name}). Select them from search results.`);
    }

    const created = await createCustomer({
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      serviceAddressLine1: serviceAddressLine1.trim(),
      serviceAddressLine2: serviceAddressLine2.trim() || null,
      serviceCity: serviceCity.trim(),
      serviceStateOrRegion: serviceStateOrRegion.trim() || null,
      servicePostalCode: servicePostalCode.trim(),
    });

    return created.id;
  }

  async function submitJob(requireSchedule: boolean) {
    if (submitLockRef.current || isPending) {
      return;
    }

    const validationError = validateIntake(requireSchedule);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    submitLockRef.current = true;
    setErrorMessage(null);
    setDuplicateWarning(null);

    startTransition(() => {
      void (async () => {
        try {
          let resolvedCustomerId = customerId;

          if (!leadId && !resolvedCustomerId) {
            resolvedCustomerId = await resolveCustomerIdForSubmit();
          }

          if (!leadId && !resolvedCustomerId) {
            throw new Error("A customer is required to create this job.");
          }

          const serviceType = (selectedService?.service_type ?? mapJobTypeToServiceType(jobType)) as ServiceType;
          const scheduledWindow = requireSchedule
            ? buildScheduledWindow(startTime, endTime)
            : null;
          const scheduledFor = requireSchedule && selectedDate && startTime
            ? combineScheduledIso(selectedDate, startTime)
            : null;

          await crmApiFetch<{ job: { id: string } }>("/api/jobs", {
            method: "POST",
            body: JSON.stringify({
              customerId: leadId ? null : resolvedCustomerId,
              leadId,
              jobType,
              serviceType,
              serviceId: serviceId || null,
              serviceAddressLine1: serviceAddressLine1.trim(),
              serviceAddressLine2: serviceAddressLine2.trim() || null,
              serviceCity: serviceCity.trim(),
              serviceStateOrRegion: serviceStateOrRegion.trim() || null,
              servicePostalCode: servicePostalCode.trim(),
              scheduledFor,
              scheduledWindow,
              assignedTechnicianId: requireSchedule ? assignedTechnicianId : null,
              customerConcern: customerConcern.trim() || null,
              internalNotes: internalNotes.trim() || null,
            }),
          });

          clearDraft();
          router.push("/jobs");
          router.refresh();
        } catch (error) {
          const message = error instanceof Error ? error.message : "The job could not be created.";

          if (message.toLowerCase().includes("matching customer")) {
            setDuplicateWarning(message);
          }

          setErrorMessage(message);
          submitLockRef.current = false;
        }
      })();
    });
  }

  function handleScheduledSubmit(event: FormEvent) {
    event.preventDefault();
    void submitJob(true);
  }

  function handleUnscheduledSubmit() {
    void submitJob(false);
  }

  const canSchedule = Boolean(assignedTechnicianId && selectedDate && startTime && endTime);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-6 py-5 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
          <Link
            href="/jobs"
            className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to jobs
          </Link>
          <div>
            <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">New Job</p>
            <h1 className="font-[family:var(--font-flat-display)] text-2xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-3xl">
              Call intake & scheduling
            </h1>
          </div>
        </div>
      </div>

      <form onSubmit={handleScheduledSubmit} className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-6 lg:px-10">
        {errorMessage ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        {duplicateWarning ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {duplicateWarning}
          </div>
        ) : null}

        <div className="grid flex-1 gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-6">
            <section className={sectionClass}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-text-primary)]">
                Customer
              </h2>

              {!customerId && !leadId ? (
                <FieldLabel label="Search by name, phone, or email">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--sem-text-muted)]" />
                    <input
                      className={`${inputClass} pl-10`}
                      value={customerQuery}
                      onChange={(event) => setCustomerQuery(event.target.value)}
                      placeholder="Start typing to search..."
                      autoComplete="off"
                    />
                    {customerSearchBusy ? (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[color:var(--sem-text-muted)]" />
                    ) : null}
                  </div>
                </FieldLabel>
              ) : null}

              {!customerId && !leadId && customerResults.length > 0 ? (
                <ul className="max-h-48 overflow-y-auto rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]">
                  {customerResults.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm transition hover:bg-[color:var(--cmp-surface-muted)]"
                        onClick={() => void selectCustomer(row)}
                      >
                        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--sem-accent-primary)]" />
                        <span>
                          <span className="block font-medium text-[color:var(--sem-text-primary)]">{row.full_name}</span>
                          <span className="text-[color:var(--sem-text-secondary)]">{row.phone}{row.email ? ` · ${row.email}` : ""}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {customerId ? (
                <div className="flex items-center justify-between rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-muted)] px-4 py-3 text-sm">
                  <span className="text-[color:var(--sem-text-secondary)]">Linked customer record</span>
                  <button
                    type="button"
                    className="text-[color:var(--sem-accent-primary)] underline-offset-2 hover:underline"
                    onClick={clearCustomerSelection}
                  >
                    Change
                  </button>
                </div>
              ) : null}

              {leadId ? (
                <p className="rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-muted)] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
                  Creating from lead — customer will be resolved on submit.
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldLabel label="Full name">
                  <input
                    className={inputClass}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    autoComplete="name"
                    readOnly={Boolean(leadId)}
                  />
                </FieldLabel>
                <FieldLabel label="Phone">
                  <input
                    className={inputClass}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                    autoComplete="tel"
                    readOnly={Boolean(leadId)}
                  />
                </FieldLabel>
              </div>

              <FieldLabel label="Email">
                <input
                  className={inputClass}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  readOnly={Boolean(leadId)}
                />
              </FieldLabel>

              {!canManageCustomers && !customerId && !leadId ? (
                <p className="text-xs text-[color:var(--sem-text-muted)]">
                  New customers require admin permissions. Search for an existing customer to continue.
                </p>
              ) : null}
            </section>

            <section className={sectionClass}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-text-primary)]">
                Address
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldLabel label="Address line 1">
                  <input
                    className={inputClass}
                    value={serviceAddressLine1}
                    onChange={(event) => setServiceAddressLine1(event.target.value)}
                    required
                    autoComplete="address-line1"
                  />
                </FieldLabel>
                <FieldLabel label="Unit / Suite">
                  <input
                    className={inputClass}
                    value={serviceAddressLine2}
                    onChange={(event) => setServiceAddressLine2(event.target.value)}
                    autoComplete="address-line2"
                  />
                </FieldLabel>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <FieldLabel label="City">
                  <input
                    className={inputClass}
                    value={serviceCity}
                    onChange={(event) => setServiceCity(event.target.value)}
                    required
                    autoComplete="address-level2"
                  />
                </FieldLabel>
                <FieldLabel label="State / Region">
                  <input
                    className={inputClass}
                    value={serviceStateOrRegion}
                    onChange={(event) => setServiceStateOrRegion(event.target.value)}
                    autoComplete="address-level1"
                  />
                </FieldLabel>
                <FieldLabel label="Postal code">
                  <input
                    className={inputClass}
                    value={servicePostalCode}
                    onChange={(event) => setServicePostalCode(event.target.value)}
                    required
                    autoComplete="postal-code"
                  />
                </FieldLabel>
              </div>
            </section>

            <section className={sectionClass}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-text-primary)]">
                Job
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldLabel label="Job type">
                  <select
                    className={inputClass}
                    value={jobType}
                    onChange={(event) => setJobType(event.target.value as JobTypeValue)}
                    required
                  >
                    {JOB_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {getJobTypeLabel(value)}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
                <FieldLabel label="Service">
                  <select
                    className={inputClass}
                    value={serviceId}
                    onChange={(event) => setServiceId(event.target.value)}
                    required={services.length > 0}
                  >
                    <option value="">Select a service</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
              </div>
              <FieldLabel label="Customer concern">
                <textarea
                  className={`${inputClass} min-h-[88px] py-2`}
                  value={customerConcern}
                  onChange={(event) => setCustomerConcern(event.target.value)}
                  placeholder="What is the customer calling about?"
                />
              </FieldLabel>
            </section>

            <section className={sectionClass}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-text-primary)]">
                Price
              </h2>
              <div className="rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-muted)] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">Service price</p>
                <p className="mt-1 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{servicePriceLabel}</p>
                <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">Catalog default — not saved on the job record.</p>
              </div>
            </section>

            <section className={sectionClass}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-text-primary)]">
                Internal notes
              </h2>
              <FieldLabel label="Office / technician notes">
                <textarea
                  className={`${inputClass} min-h-[88px] py-2`}
                  value={internalNotes}
                  onChange={(event) => setInternalNotes(event.target.value)}
                  placeholder="Information useful to office staff or the assigned technician."
                />
              </FieldLabel>
            </section>
          </div>

          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <section className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-text-primary)]">
                  Schedule
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="theme-btn-secondary inline-flex h-9 w-9 items-center justify-center rounded-full"
                    onClick={() => setSelectedDate((value) => shiftDateInputValue(value, -1))}
                    aria-label="Previous day"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-[9rem] text-center text-sm font-medium text-[color:var(--sem-text-primary)]">
                    {formatScheduleDateLabel(selectedDate)}
                  </span>
                  <button
                    type="button"
                    className="theme-btn-secondary inline-flex h-9 w-9 items-center justify-center rounded-full"
                    onClick={() => setSelectedDate((value) => shiftDateInputValue(value, 1))}
                    aria-label="Next day"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <input
                type="date"
                className={`${inputClass} mt-4`}
                value={selectedDate}
                onChange={(event) => handleScheduleDateChange(event.target.value)}
              />

              <FieldLabel label="Assign technician">
                <select
                  className={inputClass}
                  value={assignedTechnicianId}
                  onChange={(event) => handleTechnicianChange(event.target.value)}
                >
                  <option value="">Select technician...</option>
                  {activeTechnicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.display_name}
                    </option>
                  ))}
                </select>
              </FieldLabel>

              {!assignedTechnicianId ? (
                <p className="mt-6 text-sm text-[color:var(--sem-text-secondary)]">
                  Select a technician to view availability.
                </p>
              ) : null}

              {assignedTechnicianId && scheduleLoading ? (
                <div className="mt-6 flex items-center gap-2 text-sm text-[color:var(--sem-text-secondary)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading availability...
                </div>
              ) : null}

              {assignedTechnicianId && scheduleError ? (
                <p className="mt-6 text-sm text-rose-600">{scheduleError}</p>
              ) : null}

              {assignedTechnicianId && !scheduleLoading && !scheduleError ? (
                <div className="mt-6 space-y-3">
                  {!selectedTechnicianSlots ? (
                    <p className="text-sm text-[color:var(--sem-text-secondary)]">No availability for this technician.</p>
                  ) : (
                    <FieldLabel label="Appointment time">
                      <select
                        className={inputClass}
                        value={startTime && endTime ? `${startTime}|${endTime}` : ""}
                        onChange={(event) => {
                          const value = event.target.value;

                          if (!value) {
                            setStartTime("");
                            setEndTime("");
                            return;
                          }

                          const [slotStart, slotEnd] = value.split("|");
                          selectSlot(slotStart, slotEnd);
                        }}
                      >
                        <option value="">Select appointment time...</option>
                        {selectedTechnicianSlots.slots.map((slot) => (
                          <option
                            key={slot.startTime}
                            value={`${slot.startTime}|${slot.endTime}`}
                            disabled={slot.status !== "available"}
                          >
                            {formatTimeInputLabel(slot.startTime)} – {formatTimeInputLabel(slot.endTime)}
                            {slot.status === "available" ? "" : " (Busy)"}
                          </option>
                        ))}
                      </select>
                    </FieldLabel>
                  )}
                </div>
              ) : null}

              {scheduleSummary ? (
                <div className="mt-6 rounded-xl border border-[color:var(--sem-accent-primary)]/30 bg-[color:var(--cmp-surface-muted)] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">Selected</p>
                  <p className="mt-1 text-sm font-medium text-[color:var(--sem-text-primary)]">{scheduleSummary}</p>
                </div>
              ) : null}
            </section>
          </div>
        </div>

        <div className="sticky bottom-0 mt-8 border-t border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)] py-4">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link href="/jobs" className="theme-btn-secondary rounded-full px-5 py-2.5 text-sm">
              Cancel
            </Link>
            <button
              type="button"
              className="theme-btn-secondary rounded-full px-5 py-2.5 text-sm"
              disabled={isPending}
              onClick={handleUnscheduledSubmit}
            >
              {isPending ? "Saving..." : "Create Unscheduled Job"}
            </button>
            <button
              type="submit"
              className="theme-btn-primary rounded-full px-5 py-2.5 text-sm"
              disabled={isPending || !canSchedule}
            >
              {isPending ? "Saving..." : "Create & Schedule Job"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function combineScheduledIso(date: string, time: string) {
  const value = new Date(`${date}T${time}`);

  if (Number.isNaN(value.getTime())) {
    return null;
  }

  return value.toISOString();
}

function mapJobTypeToServiceType(jobType: JobTypeValue): ServiceType {
  switch (jobType) {
    case "inspection":
      return "inspection";
    case "installation_repair":
      return "repair";
    case "callback_warranty":
      return "repair";
    default:
      return "inspection";
  }
}
