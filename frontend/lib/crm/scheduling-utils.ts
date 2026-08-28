export const DEFAULT_DURATION_MINUTES = 120;
export const INTAKE_SLOT_STARTS = ["09:00", "11:00", "13:00"] as const;

export type SchedulingJobRecord = {
  id: string;
  assigned_technician_id: string | null;
  scheduled_for: string | null;
  scheduled_window: string | null;
  status: string;
};

export type TechnicianRef = {
  id: string;
  display_name: string;
};

export type IntakeSlotStatus = "available" | "busy";

export type IntakeSlot = {
  startTime: string;
  endTime: string;
  status: IntakeSlotStatus;
};

export type TechnicianIntakeSlots = {
  technicianId: string;
  technicianName: string;
  slots: IntakeSlot[];
};

export function localDateTimeParts(value: string | null) {
  if (!value) {
    return { date: "", time: "" };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { date: "", time: "" };
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  const [nextDate, nextTime] = localDate.toISOString().slice(0, 16).split("T");

  return {
    date: nextDate ?? "",
    time: nextTime ?? "",
  };
}

export function combineDateTime(date: string, time: string) {
  if (!date || !time) {
    return null;
  }

  const nextDate = new Date(`${date}T${time}`);
  return Number.isNaN(nextDate.getTime()) ? null : nextDate;
}

function parseTimeLabelToInput(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);

  if (!match) {
    return "";
  }

  const [, hourPart, minutePart, meridiemRaw] = match;
  const meridiem = meridiemRaw.toUpperCase();
  let hours = Number.parseInt(hourPart, 10);

  if (meridiem === "PM" && hours < 12) {
    hours += 12;
  }

  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }

  return `${String(hours).padStart(2, "0")}:${minutePart}`;
}

export function deriveEndTimeInput(
  scheduledFor: string | null,
  scheduledWindow: string | null,
  durationMinutes = DEFAULT_DURATION_MINUTES,
) {
  const fromWindow = scheduledWindow?.match(/-\s*([0-9]{1,2}:[0-9]{2}\s*[AP]M)/i)?.[1];

  if (fromWindow) {
    return parseTimeLabelToInput(fromWindow);
  }

  const startDate = scheduledFor ? new Date(scheduledFor) : null;

  if (!startDate || Number.isNaN(startDate.getTime())) {
    return "";
  }

  const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);
  return localDateTimeParts(endDate.toISOString()).time;
}

export function formatTimeInputLabel(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(`2000-01-01T${value}`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function buildScheduledWindow(startTime: string, endTime: string) {
  if (!startTime || !endTime) {
    return null;
  }

  return `${formatTimeInputLabel(startTime)} - ${formatTimeInputLabel(endTime)}`;
}

export function buildComparisonWindow(
  job: SchedulingJobRecord,
  durationMinutes = DEFAULT_DURATION_MINUTES,
) {
  if (!job.scheduled_for) {
    return null;
  }

  const start = new Date(job.scheduled_for);

  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const endTimeInput = deriveEndTimeInput(job.scheduled_for, job.scheduled_window, durationMinutes);
  const localParts = localDateTimeParts(job.scheduled_for);
  const derivedEnd = combineDateTime(localParts.date, endTimeInput);
  const end = derivedEnd && derivedEnd.getTime() > start.getTime()
    ? derivedEnd
    : new Date(start.getTime() + durationMinutes * 60_000);

  return { start, end };
}

export function windowsOverlap(leftStart: Date, leftEnd: Date, rightStart: Date, rightEnd: Date) {
  return leftStart.getTime() < rightEnd.getTime() && leftEnd.getTime() > rightStart.getTime();
}

function addMinutesToTimeInput(time: string, minutes: number) {
  const base = new Date(`2000-01-01T${time}`);

  if (Number.isNaN(base.getTime())) {
    return "";
  }

  const next = new Date(base.getTime() + minutes * 60_000);
  return next.toTimeString().slice(0, 5);
}

export function filterJobsForDate(jobs: SchedulingJobRecord[], selectedDate: string) {
  if (!selectedDate) {
    return [];
  }

  return jobs.filter((job) => {
    if (!job.scheduled_for || job.status === "cancelled") {
      return false;
    }

    return localDateTimeParts(job.scheduled_for).date === selectedDate;
  });
}

function slotOverlapsAnyJob(
  slotStart: Date,
  slotEnd: Date,
  technicianJobs: SchedulingJobRecord[],
  durationMinutes: number,
) {
  return technicianJobs.some((job) => {
    const comparisonWindow = buildComparisonWindow(job, durationMinutes);

    if (!comparisonWindow) {
      return false;
    }

    return windowsOverlap(
      slotStart,
      slotEnd,
      comparisonWindow.start,
      comparisonWindow.end,
    );
  });
}

export function buildTechnicianIntakeSlots({
  technicians,
  dayJobs,
  selectedDate,
  slotStarts = INTAKE_SLOT_STARTS,
  durationMinutes = DEFAULT_DURATION_MINUTES,
}: {
  technicians: TechnicianRef[];
  dayJobs: SchedulingJobRecord[];
  selectedDate: string;
  slotStarts?: readonly string[];
  durationMinutes?: number;
}): TechnicianIntakeSlots[] {
  if (!selectedDate) {
    return [];
  }

  return technicians.map((technician) => {
    const technicianJobs = dayJobs.filter(
      (job) => job.assigned_technician_id === technician.id,
    );

    const slots: IntakeSlot[] = slotStarts.map((startTime) => {
      const endTime = addMinutesToTimeInput(startTime, durationMinutes);
      const slotStart = combineDateTime(selectedDate, startTime);
      const slotEnd = combineDateTime(selectedDate, endTime);

      const isBusy = slotStart && slotEnd
        ? slotOverlapsAnyJob(slotStart, slotEnd, technicianJobs, durationMinutes)
        : true;

      return {
        startTime,
        endTime,
        status: isBusy ? "busy" : "available",
      };
    });

    return {
      technicianId: technician.id,
      technicianName: technician.display_name,
      slots,
    };
  });
}

export function formatIntakeScheduleSummary(
  selectedDate: string,
  startTime: string,
  endTime: string,
  technicianName: string,
  locale = "en-US",
) {
  const dateLabel = selectedDate
    ? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
        new Date(`${selectedDate}T12:00:00`),
      )
    : "";

  const windowLabel = buildScheduledWindow(startTime, endTime);

  return [dateLabel, windowLabel, technicianName].filter(Boolean).join(" · ");
}
