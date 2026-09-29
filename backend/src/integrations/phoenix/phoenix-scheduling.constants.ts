export const PHOENIX_REQUEST_SERVICE_TIME_WINDOWS = [
  { start: "09:00", end: "11:00", label: "9–11" },
  { start: "11:00", end: "13:00", label: "11–1" },
  { start: "13:00", end: "15:00", label: "1–3" },
  { start: "15:00", end: "17:00", label: "3–5" },
  { start: "17:00", end: "19:00", label: "5–7" },
] as const;

export type PhoenixTimeWindow = (typeof PHOENIX_REQUEST_SERVICE_TIME_WINDOWS)[number];

export const PHOENIX_SLOT_BLOCKING_JOB_STATUSES = [
  "scheduled",
  "on_the_way",
  "in_progress",
  "waiting_for_approval",
] as const;

export function formatScheduledWindowKey(start: string, end: string) {
  return `${start}-${end}`;
}

export function findPhoenixTimeWindow(start: string, end: string): PhoenixTimeWindow | undefined {
  const normalizedStart = start.trim();
  const normalizedEnd = end.trim();
  return PHOENIX_REQUEST_SERVICE_TIME_WINDOWS.find(
    (window) => window.start === normalizedStart && window.end === normalizedEnd,
  );
}

export function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/** Current calendar month plus this many future months (3 navigable months total). */
export const PHOENIX_BOOKING_HORIZON_MONTHS = 2;

export const PHOENIX_AVAILABILITY_MAX_RANGE_DAYS = 31;

export function formatIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseIsoDateParts(iso: string) {
  const trimmed = iso.trim();
  const [year, month, day] = trimmed.split("-").map(Number);
  return { year, month, day };
}

export function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addCalendarMonths(year: number, month: number, monthsToAdd: number) {
  const anchor = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
  return { year: anchor.getUTCFullYear(), month: anchor.getUTCMonth() + 1 };
}

export function utcTodayIsoDate() {
  const now = new Date();
  return formatIsoDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

export function getBookingHorizonBounds(referenceTodayIso = utcTodayIsoDate()) {
  const { year, month } = parseIsoDateParts(referenceTodayIso);
  const horizonStart = formatIsoDate(year, month, 1);
  const endMonth = addCalendarMonths(year, month, PHOENIX_BOOKING_HORIZON_MONTHS);
  const horizonEnd = formatIsoDate(
    endMonth.year,
    endMonth.month,
    lastDayOfMonth(endMonth.year, endMonth.month),
  );
  return { horizonStart, horizonEnd, todayIso: referenceTodayIso };
}

export function compareIsoDates(a: string, b: string) {
  return a.trim().localeCompare(b.trim());
}

export function enumerateIsoDates(from: string, to: string) {
  const startParts = parseIsoDateParts(from);
  const endParts = parseIsoDateParts(to);
  const dates: string[] = [];
  let cursor = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
  const end = new Date(Date.UTC(endParts.year, endParts.month - 1, endParts.day));

  while (cursor <= end) {
    dates.push(
      formatIsoDate(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()),
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export function countIsoDateSpanDays(from: string, to: string) {
  return enumerateIsoDates(from, to).length;
}

export function isIsoDateWithinHorizon(date: string, referenceTodayIso = utcTodayIsoDate()) {
  const { horizonStart, horizonEnd } = getBookingHorizonBounds(referenceTodayIso);
  const normalized = date.trim();
  return compareIsoDates(normalized, horizonStart) >= 0 && compareIsoDates(normalized, horizonEnd) <= 0;
}

export function validateAvailabilityRangeQuery(from: string, to: string, referenceTodayIso = utcTodayIsoDate()) {
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return { ok: false as const, code: "invalid_availability_date" as const, message: "from and to must be YYYY-MM-DD." };
  }

  const normalizedFrom = from.trim();
  const normalizedTo = to.trim();

  if (compareIsoDates(normalizedFrom, normalizedTo) > 0) {
    return { ok: false as const, code: "invalid_availability_range" as const, message: "from must be on or before to." };
  }

  const spanDays = countIsoDateSpanDays(normalizedFrom, normalizedTo);
  if (spanDays > PHOENIX_AVAILABILITY_MAX_RANGE_DAYS) {
    return {
      ok: false as const,
      code: "availability_range_too_large" as const,
      message: `Availability range must not exceed ${PHOENIX_AVAILABILITY_MAX_RANGE_DAYS} days.`,
    };
  }

  const { horizonStart, horizonEnd } = getBookingHorizonBounds(referenceTodayIso);
  if (compareIsoDates(normalizedFrom, horizonStart) < 0 || compareIsoDates(normalizedTo, horizonEnd) > 0) {
    return {
      ok: false as const,
      code: "availability_outside_horizon" as const,
      message: "Requested dates are outside the booking horizon.",
    };
  }

  return { ok: true as const, from: normalizedFrom, to: normalizedTo, spanDays };
}
