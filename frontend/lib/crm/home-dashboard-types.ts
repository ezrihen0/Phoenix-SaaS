import type { JobStatus } from "@/lib/crm/statuses";

export type DashboardControlItem = {
  id: string;
  jobId: string | null;
  title: string;
  customerName: string;
  addressLabel: string;
  technicianName: string | null;
  amountCents: number | null;
  scheduledFor: string | null;
  occurredAt: string;
  statusLabel: string;
};

export type DashboardJob = {
  id: string;
  title: string;
  status: JobStatus;
  scheduled_for: string | null;
  updated_at: string;
  customer?: { full_name: string } | null;
  technician?: { display_name: string } | null;
};

export type OfficeDashboardResponse = {
  summary: {
    newLeads: number;
    contactedLeads: number;
    activeJobs: number;
    jobsScheduledToday: number;
    unpaidInvoices: number;
  };
  controls: {
    unpaidInvoices: DashboardControlItem[];
    followUpsNeeded: DashboardControlItem[];
    todaysScheduledJobs: DashboardControlItem[];
    recentCompletedJobs: DashboardControlItem[];
  };
  jobs: DashboardJob[];
};

export type TechnicianDashboardResponse = {
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
  jobs: DashboardJob[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

export function isOfficeDashboardResponse(value: unknown): value is OfficeDashboardResponse {
  if (!isRecord(value) || !isRecord(value.summary)) {
    return false;
  }

  const summary = value.summary;

  return (
    isFiniteNumber(summary.newLeads)
    && isFiniteNumber(summary.contactedLeads)
    && isFiniteNumber(summary.activeJobs)
    && isFiniteNumber(summary.jobsScheduledToday)
    && isFiniteNumber(summary.unpaidInvoices)
  );
}

export function isTechnicianDashboardResponse(value: unknown): value is TechnicianDashboardResponse {
  if (!isRecord(value) || !isRecord(value.summary)) {
    return false;
  }

  const summary = value.summary;

  return (
    isFiniteNumber(summary.openJobs)
    && isFiniteNumber(summary.inProgressJobs)
    && isFiniteNumber(summary.waitingForApprovalJobs)
    && isFiniteNumber(summary.completedToday)
  );
}
