import type { JobStatus } from "./constants";

/** Statuses shown in operational UI and accepted from status-update APIs. */
export const operationalJobStatuses = [
  "submitted",
  "scheduled",
  "completed",
  "cancelled",
] as const;

export type OperationalJobStatus = (typeof operationalJobStatuses)[number];

/** Legacy CRM statuses retained in DB for history and automations. */
export const legacyJobStatuses = [
  "new_lead",
  "contacted",
  "on_the_way",
  "in_progress",
  "waiting_for_approval",
  "paid",
] as const;

export type LegacyJobStatus = (typeof legacyJobStatuses)[number];

/** DB values that belong on the active work queue (includes legacy in-flight rows). */
export const activeJobStatusValues: JobStatus[] = [
  "submitted",
  "new_lead",
  "contacted",
  "scheduled",
  "on_the_way",
  "in_progress",
  "waiting_for_approval",
];

export const completedJobStatusValues: JobStatus[] = ["completed", "paid"];

const submittedBucket = new Set<JobStatus>(["submitted", "new_lead", "contacted"]);
const scheduledBucket = new Set<JobStatus>([
  "scheduled",
  "on_the_way",
  "in_progress",
  "waiting_for_approval",
]);

const operationalTransitionMap: Record<OperationalJobStatus, OperationalJobStatus[]> = {
  submitted: ["scheduled", "completed", "cancelled"],
  scheduled: ["submitted", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const operationalStatusLabels: Record<OperationalJobStatus, string> = {
  submitted: "Submitted",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function isOperationalJobStatus(status: string): status is OperationalJobStatus {
  return (operationalJobStatuses as readonly string[]).includes(status);
}

export function mapJobStatusToOperationalBucket(status: JobStatus): OperationalJobStatus {
  if (isOperationalJobStatus(status)) {
    return status;
  }

  if (submittedBucket.has(status)) {
    return "submitted";
  }

  if (scheduledBucket.has(status)) {
    return "scheduled";
  }

  if (status === "paid") {
    return "completed";
  }

  return "cancelled";
}

export function getOperationalJobStatusLabel(status: JobStatus): string {
  return operationalStatusLabels[mapJobStatusToOperationalBucket(status)];
}

export function isActiveJobStatus(status: JobStatus): boolean {
  return activeJobStatusValues.includes(status);
}

export function isCompletedJobStatus(status: JobStatus): boolean {
  return completedJobStatusValues.includes(status);
}

export function isCancelledJobStatus(status: JobStatus): boolean {
  return status === "cancelled";
}

export type JobListQueue = "active" | "completed" | "cancelled";

export function jobStatusMatchesListQueue(status: JobStatus, queue: JobListQueue): boolean {
  if (queue === "active") {
    return isActiveJobStatus(status);
  }

  if (queue === "completed") {
    return isCompletedJobStatus(status);
  }

  return isCancelledJobStatus(status);
}

/** System-only status set by invoice flows; not offered in operational UI. */
export function isSystemOnlyJobStatus(status: JobStatus): boolean {
  return status === "paid";
}

export function canTransitionJobStatus(currentStatus: JobStatus, nextStatus: JobStatus): boolean {
  if (currentStatus === nextStatus) {
    return true;
  }

  if (isSystemOnlyJobStatus(nextStatus)) {
    return false;
  }

  if (!isOperationalJobStatus(nextStatus)) {
    return false;
  }

  const currentBucket = mapJobStatusToOperationalBucket(currentStatus);
  return operationalTransitionMap[currentBucket].includes(nextStatus);
}

/** @deprecated Use activeJobStatusValues */
export const openJobStatuses: JobStatus[] = activeJobStatusValues;

export function getJobStatusLabel(status: JobStatus): string {
  return getOperationalJobStatusLabel(status);
}
