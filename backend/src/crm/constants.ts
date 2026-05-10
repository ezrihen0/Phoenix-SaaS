export const profileRoles = [
  "owner",
  "admin",
  "office_admin",
  "dispatcher",
  "csr",
  "technician",
  "viewer",
] as const;
export const leadSources = [
  "phone",
  "website",
  "google",
  "referral",
  "repeat_customer",
  "other",
] as const;
export const serviceTypes = ["inspection", "cleaning", "repair", "rebuild"] as const;
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
export const quoteStatuses = ["draft", "sent", "approved", "rejected"] as const;
export const invoiceStatuses = ["unpaid", "paid"] as const;
export const invoicePaymentEntryTypes = ["payment", "refund", "adjustment"] as const;
export const invoicePaymentMethods = ["cash", "check", "card_manual", "bank_transfer", "other"] as const;

export type ProfileRole = (typeof profileRoles)[number];
export type LeadSource = (typeof leadSources)[number];
export type ServiceType = (typeof serviceTypes)[number];
export type LeadStatus = (typeof leadStatuses)[number];
export type JobStatus = (typeof jobStatuses)[number];
export type QuoteStatus = (typeof quoteStatuses)[number];
export type InvoiceStatus = (typeof invoiceStatuses)[number];
export type InvoicePaymentEntryType = (typeof invoicePaymentEntryTypes)[number];
export type InvoicePaymentMethod = (typeof invoicePaymentMethods)[number];

export const openJobStatuses: JobStatus[] = [
  "new_lead",
  "contacted",
  "scheduled",
  "on_the_way",
  "in_progress",
  "waiting_for_approval",
];

export const technicianJobStatuses: JobStatus[] = ["on_the_way", "in_progress", "completed"];

export const officeOnlyJobStatuses: JobStatus[] = ["new_lead", "contacted", "paid", "cancelled"];

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

const serviceTypeLabels: Record<ServiceType, string> = {
  inspection: "Inspection",
  cleaning: "Cleaning",
  repair: "Repair",
  rebuild: "Rebuild",
};

export function canTransitionJobStatus(currentStatus: JobStatus, nextStatus: JobStatus) {
  if (currentStatus === nextStatus) {
    return true;
  }

  return jobTransitionMap[currentStatus].includes(nextStatus);
}

export function isOfficeOnlyJobStatus(status: JobStatus) {
  return officeOnlyJobStatuses.includes(status);
}

export function getJobStatusLabel(status: JobStatus) {
  return jobStatusLabels[status];
}

export function getServiceTypeLabel(serviceType: ServiceType) {
  return serviceTypeLabels[serviceType];
}

export function getJobStatusTimestampUpdates(
  status: JobStatus,
  timestamp = new Date(),
) {
  if (
    status === "new_lead"
    || status === "contacted"
    || status === "scheduled"
  ) {
    return {
      on_the_way_at: null,
      started_at: null,
      completed_at: null,
      paid_at: null,
    };
  }

  if (status === "on_the_way") {
    return {
      on_the_way_at: timestamp,
      started_at: null,
      completed_at: null,
      paid_at: null,
    };
  }

  if (status === "in_progress") {
    return {
      started_at: timestamp,
      on_the_way_at: timestamp,
      completed_at: null,
      paid_at: null,
    };
  }

  if (status === "waiting_for_approval") {
    return {
      completed_at: null,
      paid_at: null,
    };
  }

  if (status === "completed") {
    return {
      completed_at: timestamp,
      paid_at: null,
    };
  }

  if (status === "paid") {
    return {
      completed_at: timestamp,
      paid_at: timestamp,
    };
  }

  return {};
}

export function canAccessJob(
  role: ProfileRole | null,
  technicianId: string | null,
  assignedTechnicianId: string | null,
) {
  if (
    role === "owner"
    || role === "admin"
    || role === "office_admin"
    || role === "dispatcher"
    || role === "csr"
    || role === "viewer"
  ) {
    return true;
  }

  if (!technicianId || !assignedTechnicianId) {
    return false;
  }

  return technicianId === assignedTechnicianId;
}
