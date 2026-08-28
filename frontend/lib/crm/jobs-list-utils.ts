import {
  buildJobServiceLabel,
  relationValue,
  type RelatedValue,
} from "@/lib/crm/job-field-display";
import type { JobStatus } from "@/lib/crm/statuses";

export type JobsQuickFilter =
  | "all"
  | "today"
  | "unscheduled"
  | "in_progress"
  | "completed"
  | "unpaid";

export type JobListCustomer = {
  full_name: string;
};

export type JobListTechnician = {
  id: string;
  display_name: string;
};

export type JobListService = {
  name: string;
  default_price_cents: number;
};

export type JobListInvoice = {
  amount_cents: number;
  status: "unpaid" | "paid";
  balance_cents?: number;
};

export type JobListRecord = {
  id: string;
  assigned_technician_id: string | null;
  requested_service_type: string;
  job_type: "inspection" | "installation_repair" | "callback_warranty";
  status: JobStatus;
  scheduled_for: string | null;
  scheduled_window: string | null;
  created_at: string;
  customer: RelatedValue<JobListCustomer>;
  service: RelatedValue<JobListService>;
  technician: RelatedValue<{ display_name: string }>;
  invoice: RelatedValue<JobListInvoice>;
  quote: RelatedValue<{ price_cents: number; status: string }>;
};

const statusSortPriority: Record<JobStatus, number> = {
  in_progress: 0,
  on_the_way: 1,
  waiting_for_approval: 2,
  scheduled: 3,
  contacted: 4,
  new_lead: 5,
  completed: 6,
  paid: 7,
  cancelled: 8,
};

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
  );
}

export function formatJobNumber(jobId: string) {
  return `#${jobId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

export function getJobBalanceCents(job: JobListRecord): number | null {
  const invoice = relationValue(job.invoice);
  if (invoice) {
    if (typeof invoice.balance_cents === "number") {
      return invoice.balance_cents;
    }

    return invoice.status === "unpaid" ? invoice.amount_cents : 0;
  }

  const quote = relationValue(job.quote);
  if (quote) {
    return quote.price_cents;
  }

  const service = relationValue(job.service);
  if (service?.default_price_cents) {
    return service.default_price_cents;
  }

  return null;
}

export function isJobUnpaid(job: JobListRecord) {
  const invoice = relationValue(job.invoice);
  if (!invoice) {
    return false;
  }

  if (typeof invoice.balance_cents === "number") {
    return invoice.balance_cents > 0;
  }

  return invoice.status === "unpaid";
}

export function formatOperationalScheduleLabel(
  job: JobListRecord,
  locale: string,
  now = new Date(),
) {
  if (job.scheduled_window?.trim()) {
    const scheduledFor = job.scheduled_for ? new Date(job.scheduled_for) : null;
    if (scheduledFor && !Number.isNaN(scheduledFor.getTime()) && isSameLocalDay(scheduledFor, now)) {
      return `Today · ${job.scheduled_window.trim()}`;
    }

    if (scheduledFor && !Number.isNaN(scheduledFor.getTime())) {
      const dayLabel = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(scheduledFor);
      return `${dayLabel} · ${job.scheduled_window.trim()}`;
    }

    return job.scheduled_window.trim();
  }

  if (!job.scheduled_for) {
    return "Unscheduled";
  }

  const scheduledFor = new Date(job.scheduled_for);
  if (Number.isNaN(scheduledFor.getTime())) {
    return "Unscheduled";
  }

  const dayLabel = isSameLocalDay(scheduledFor, now)
    ? "Today"
    : new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(scheduledFor);
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(scheduledFor);

  return `${dayLabel} · ${timeLabel}`;
}

export function sortJobsForOperations(jobs: JobListRecord[]) {
  return [...jobs].sort((left, right) => {
    if (left.status === "cancelled" && right.status !== "cancelled") {
      return 1;
    }

    if (right.status === "cancelled" && left.status !== "cancelled") {
      return -1;
    }

    const leftScheduled = left.scheduled_for ? new Date(left.scheduled_for).getTime() : Number.POSITIVE_INFINITY;
    const rightScheduled = right.scheduled_for ? new Date(right.scheduled_for).getTime() : Number.POSITIVE_INFINITY;

    if (leftScheduled !== rightScheduled) {
      return leftScheduled - rightScheduled;
    }

    const leftPriority = statusSortPriority[left.status];
    const rightPriority = statusSortPriority[right.status];

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

export function matchesQuickFilter(job: JobListRecord, filter: JobsQuickFilter, now = new Date()) {
  if (filter === "all") {
    return true;
  }

  if (filter === "unscheduled") {
    return !job.scheduled_for;
  }

  if (filter === "in_progress") {
    return job.status === "in_progress" || job.status === "on_the_way";
  }

  if (filter === "completed") {
    return job.status === "completed" || job.status === "paid";
  }

  if (filter === "unpaid") {
    return isJobUnpaid(job);
  }

  if (filter === "today") {
    if (!job.scheduled_for) {
      return job.status === "in_progress" || job.status === "on_the_way";
    }

    const scheduledFor = new Date(job.scheduled_for);
    return !Number.isNaN(scheduledFor.getTime()) && scheduledFor >= startOfLocalDay(now) && scheduledFor <= endOfLocalDay(now);
  }

  return true;
}

export function filterJobsList(input: {
  jobs: JobListRecord[];
  quickFilter: JobsQuickFilter;
  searchQuery: string;
  statusFilter: JobStatus | "all";
  technicianFilter: string;
  dateFilter: string;
}) {
  const normalizedQuery = input.searchQuery.trim().toLowerCase();

  return sortJobsForOperations(
    input.jobs.filter((job) => {
      if (!matchesQuickFilter(job, input.quickFilter)) {
        return false;
      }

      if (input.statusFilter !== "all" && job.status !== input.statusFilter) {
        return false;
      }

      if (input.technicianFilter !== "all") {
        if (input.technicianFilter === "unassigned") {
          if (job.assigned_technician_id) {
            return false;
          }
        } else if (job.assigned_technician_id !== input.technicianFilter) {
          return false;
        }
      }

      if (input.dateFilter) {
        if (!job.scheduled_for) {
          return false;
        }

        const scheduledDay = job.scheduled_for.slice(0, 10);
        if (scheduledDay !== input.dateFilter) {
          return false;
        }
      }

      if (!normalizedQuery) {
        return true;
      }

      const customer = relationValue(job.customer);
      const service = relationValue(job.service);
      const technician = relationValue(job.technician);
      const serviceLabel = buildJobServiceLabel(service?.name, job.requested_service_type);

      const haystack = [
        formatJobNumber(job.id),
        customer?.full_name,
        serviceLabel,
        technician?.display_name,
        job.status,
        job.job_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    }),
  );
}

export function collectTechnicianOptions(jobs: JobListRecord[]) {
  const options = new Map<string, string>();

  for (const job of jobs) {
    const technician = relationValue(job.technician);
    if (job.assigned_technician_id && technician?.display_name) {
      options.set(job.assigned_technician_id, technician.display_name);
    }
  }

  return [...options.entries()]
    .map(([id, display_name]) => ({ id, display_name }))
    .sort((left, right) => left.display_name.localeCompare(right.display_name));
}
