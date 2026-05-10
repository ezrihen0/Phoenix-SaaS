import type { Database } from "@/lib/types/database";

export const leadStatuses = ["new_lead", "contacted", "converted"] as const;
export const jobStatuses = [
  "new_lead",
  "contacted",
  "scheduled",
  "on_the_way",
  "in_progress",
  "waiting_for_approval",
  "completed",
  "paid",
  "cancelled",
] as const;
export const dashboardStatuses = [
  "new_lead",
  "contacted",
  "scheduled",
  "on_the_way",
  "in_progress",
  "waiting_for_approval",
  "completed",
  "paid",
] as const;

export const technicianJobStatuses = [
  "on_the_way",
  "in_progress",
  "completed",
] as const;

export const officeOnlyJobStatuses = ["new_lead", "contacted", "paid", "cancelled"] as const;

const officeOnlyJobStatusSet: ReadonlySet<JobStatus> = new Set<JobStatus>(officeOnlyJobStatuses);

export type LeadStatus = Database["public"]["Enums"]["lead_status"];
export type JobStatus = Database["public"]["Enums"]["job_status"];
export type ServiceType = Database["public"]["Enums"]["service_type"];
export type LeadSource = Database["public"]["Enums"]["lead_source"];
export type DashboardStatus = (typeof dashboardStatuses)[number];

const jobTransitionMap: Record<JobStatus, JobStatus[]> = {
  new_lead: ["contacted", "scheduled", "cancelled"],
  contacted: ["new_lead", "scheduled", "cancelled"],
  scheduled: ["contacted", "on_the_way", "in_progress", "waiting_for_approval", "completed", "cancelled"],
  on_the_way: ["scheduled", "in_progress", "waiting_for_approval", "completed", "cancelled"],
  in_progress: ["on_the_way", "waiting_for_approval", "completed", "cancelled"],
  waiting_for_approval: ["scheduled", "on_the_way", "in_progress", "completed", "cancelled"],
  completed: ["waiting_for_approval", "paid"],
  paid: ["completed"],
  cancelled: [],
};

const jobStatusLabels: Record<JobStatus, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  scheduled: "Scheduled",
  on_the_way: "On The Way",
  in_progress: "In Progress",
  waiting_for_approval: "Waiting Approval",
  completed: "Completed",
  paid: "Paid",
  cancelled: "Cancelled",
};

const leadStatusLabels: Record<Exclude<LeadStatus, "converted">, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
};

const serviceTypeLabels: Record<ServiceType, string> = {
  inspection: "Inspection",
  cleaning: "Cleaning",
  repair: "Repair",
  rebuild: "Rebuild",
};

const leadSourceLabels: Record<LeadSource, string> = {
  phone: "Phone",
  website: "Website",
  google: "Google",
  referral: "Referral",
  repeat_customer: "Repeat Customer",
  other: "Other",
};

export function canTransitionJobStatus(currentStatus: JobStatus, nextStatus: JobStatus) {
  if (currentStatus === nextStatus) {
    return true;
  }

  return jobTransitionMap[currentStatus].includes(nextStatus);
}

export function isOfficeOnlyJobStatus(status: JobStatus) {
  return officeOnlyJobStatusSet.has(status);
}

export function getJobStatusLabel(status: JobStatus) {
  return jobStatusLabels[status];
}

export function getDashboardStatusLabel(
  status: Exclude<LeadStatus, "converted"> | JobStatus,
) {
  if (status === "new_lead" || status === "contacted") {
    return leadStatusLabels[status];
  }

  return getJobStatusLabel(status);
}

export function getDashboardBoardStatus(
  status: Exclude<LeadStatus, "converted"> | JobStatus,
): DashboardStatus | null {
  if (
    status === "new_lead"
    || status === "contacted"
    || status === "scheduled"
    || status === "on_the_way"
    || status === "in_progress"
    || status === "waiting_for_approval"
    || status === "completed"
    || status === "paid"
  ) {
    return status;
  }

  if (status === "cancelled") {
    return null;
  }

  return "scheduled";
}

export function getServiceTypeLabel(serviceType: ServiceType) {
  return serviceTypeLabels[serviceType];
}

export function getLeadSourceLabel(source: LeadSource) {
  return leadSourceLabels[source];
}