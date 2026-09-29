import type { BranchProvinceCode } from "../../crm/branch-province-resolution";
import { formatIsoDate, parseIsoDateParts } from "./phoenix-scheduling.constants";

const IANA_BY_BRANCH: Record<BranchProvinceCode, string> = {
  AB: "America/Edmonton",
  ON: "America/Toronto",
};

export function getIanaTimeZoneForBranchProvince(provinceCode: BranchProvinceCode): string {
  return IANA_BY_BRANCH[provinceCode];
}

function getZonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  };
}

/** Convert a branch-local calendar date + HH:mm to a UTC instant (handles DST). */
export function zonedLocalDateTimeToUtc(
  isoDate: string,
  hhmm: string,
  provinceCode: BranchProvinceCode,
): Date {
  const timeZone = getIanaTimeZoneForBranchProvince(provinceCode);
  const { year, month, day } = parseIsoDateParts(isoDate);
  const [hour, minute] = hhmm.split(":").map(Number);

  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let attempt = 0; attempt < 6; attempt++) {
    const zoned = getZonedParts(new Date(utcMs), timeZone);
    const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute);
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute);
    const deltaMs = desiredAsUtc - zonedAsUtc;
    if (deltaMs === 0) {
      break;
    }
    utcMs += deltaMs;
  }

  return new Date(utcMs);
}

export function isoDateKeyFromUtcInstant(instant: Date, provinceCode: BranchProvinceCode): string {
  const timeZone = getIanaTimeZoneForBranchProvince(provinceCode);
  const { year, month, day } = getZonedParts(instant, timeZone);
  return formatIsoDate(year, month, day);
}

function addOneCalendarIsoDay(isoDate: string) {
  const { year, month, day } = parseIsoDateParts(isoDate);
  const cursor = new Date(Date.UTC(year, month - 1, day + 1));
  return formatIsoDate(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate());
}

export function dayRangeUtcBounds(isoDate: string, provinceCode: BranchProvinceCode) {
  const start = zonedLocalDateTimeToUtc(isoDate, "00:00", provinceCode);
  const endExclusive = zonedLocalDateTimeToUtc(addOneCalendarIsoDay(isoDate), "00:00", provinceCode);
  return { start, endExclusive };
}
