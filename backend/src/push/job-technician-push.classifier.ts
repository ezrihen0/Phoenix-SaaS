export type JobPushSnapshot = {
  id: string;
  title: string;
  description: string | null;
  assigned_technician_id: string | null;
  service_id: string | null;
  status: string;
  service_address_line_1: string;
  service_address_line_2: string | null;
  service_city: string;
  service_state_or_region: string | null;
  service_postal_code: string;
  scheduled_for: Date | string | null;
  scheduled_window: string | null;
};

export type TechnicianJobPushMessage = {
  kind: string;
  title: string;
  body: string;
  jobId: string;
  url: string;
};

function scheduleKey(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toISOString();
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

export function jobEntityToPushSnapshot(job: JobPushSnapshot): JobPushSnapshot {
  return job;
}

export function classifyJobChangeForTechnicianPush(input: {
  before: JobPushSnapshot | null;
  after: JobPushSnapshot;
}): TechnicianJobPushMessage | null {
  const { before, after } = input;
  const jobTitle = truncate(after.title.trim() || "Job", 80);
  const url = `/jobs/${after.id}`;

  if (!before) {
    if (!after.assigned_technician_id) {
      return null;
    }

    return {
      kind: "job_created_assigned",
      title: "New job assigned",
      body: `${jobTitle} was assigned to you.`,
      jobId: after.id,
      url,
    };
  }

  if (
    before.assigned_technician_id !== after.assigned_technician_id
    && after.assigned_technician_id
  ) {
    return {
      kind: "job_reassigned",
      title: "Job assigned to you",
      body: `${jobTitle} was assigned to you.`,
      jobId: after.id,
      url,
    };
  }

  if (before.status !== after.status) {
    return {
      kind: "job_status_changed",
      title: "Job status updated",
      body: `${jobTitle} is now ${after.status.replaceAll("_", " ")}.`,
      jobId: after.id,
      url,
    };
  }

  if (
    scheduleKey(before.scheduled_for) !== scheduleKey(after.scheduled_for)
    || normalizeText(before.scheduled_window) !== normalizeText(after.scheduled_window)
  ) {
    const windowLabel = normalizeText(after.scheduled_window);
    const scheduleLabel = after.scheduled_for
      ? scheduleKey(after.scheduled_for).slice(0, 16).replace("T", " ")
      : "unscheduled";
    const body = windowLabel
      ? `${jobTitle} rescheduled (${scheduleLabel}, ${windowLabel}).`
      : `${jobTitle} rescheduled (${scheduleLabel}).`;

    return {
      kind: "job_rescheduled",
      title: "Schedule updated",
      body: truncate(body, 180),
      jobId: after.id,
      url,
    };
  }

  const detailChanged =
    before.title !== after.title
    || normalizeText(before.description) !== normalizeText(after.description)
    || before.service_id !== after.service_id
    || before.service_address_line_1 !== after.service_address_line_1
    || normalizeText(before.service_address_line_2) !== normalizeText(after.service_address_line_2)
    || before.service_city !== after.service_city
    || normalizeText(before.service_state_or_region) !== normalizeText(after.service_state_or_region)
    || before.service_postal_code !== after.service_postal_code;

  if (detailChanged) {
    return {
      kind: "job_details_updated",
      title: "Job details updated",
      body: `${jobTitle} was updated.`,
      jobId: after.id,
      url,
    };
  }

  return null;
}

export function classifyJobNoteForTechnicianPush(input: {
  jobId: string;
  jobTitle: string;
  findings: string | null;
  recommendations: string | null;
}): TechnicianJobPushMessage | null {
  const parts: string[] = [];

  if (normalizeText(input.findings)) {
    parts.push(normalizeText(input.findings));
  }

  if (normalizeText(input.recommendations)) {
    parts.push(normalizeText(input.recommendations));
  }

  if (parts.length === 0) {
    return null;
  }

  const jobTitle = truncate(input.jobTitle.trim() || "Job", 60);
  const preview = truncate(parts.join(" · "), 120);

  return {
    kind: "job_note_added",
    title: "New job note",
    body: `${jobTitle}: ${preview}`,
    jobId: input.jobId,
    url: `/jobs/${input.jobId}`,
  };
}
