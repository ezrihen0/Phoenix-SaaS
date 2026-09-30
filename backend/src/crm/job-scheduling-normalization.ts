import {
  normalizeServiceProvinceToBranchCode,
  type BranchProvinceCode,
} from "./branch-province-resolution";
import {
  PHOENIX_REQUEST_SERVICE_TIME_WINDOWS,
  findPhoenixTimeWindow,
  formatScheduledWindowKey,
} from "../integrations/phoenix/phoenix-scheduling.constants";
import {
  isoDateKeyFromUtcInstant,
  zonedLocalDateTimeToUtc,
} from "../integrations/phoenix/phoenix-scheduling-timezone";

export const CANONICAL_BLOCKING_WINDOW_KEYS = PHOENIX_REQUEST_SERVICE_TIME_WINDOWS.map((window) =>
  formatScheduledWindowKey(window.start, window.end),
);

const CANONICAL_KEY_SET = new Set(CANONICAL_BLOCKING_WINDOW_KEYS);

function padHourMinute(hours: number, minutes: number) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseMeridiemTime(value: string): { hours: number; minutes: number } | null {
  const trimmed = value.trim();
  const match12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (match12) {
    const hoursRaw = Number.parseInt(match12[1], 10);
    const minutes = Number.parseInt(match12[2] ?? "0", 10);
    const meridiem = match12[3].toUpperCase();
    let hours = hoursRaw;
    if (meridiem === "PM" && hours < 12) {
      hours += 12;
    }
    if (meridiem === "AM" && hours === 12) {
      hours = 0;
    }
    return { hours, minutes };
  }

  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return {
      hours: Number.parseInt(match24[1], 10),
      minutes: Number.parseInt(match24[2], 10),
    };
  }

  return null;
}

function extractWindowSegment(raw: string) {
  const withoutSuffix = raw.split("•")[0]?.trim() ?? raw.trim();
  const parts = withoutSuffix.split("-").map((part) => part.trim());
  if (parts.length < 2) {
    return null;
  }

  const start = parseMeridiemTime(parts[0] ?? "");
  const end = parseMeridiemTime(parts[parts.length - 1] ?? "");
  if (!start || !end) {
    return null;
  }

  return {
    start: padHourMinute(start.hours, start.minutes),
    end: padHourMinute(end.hours, end.minutes),
  };
}

/** Map legacy/display or canonical strings to Phoenix blocking window keys. */
export function normalizeScheduledWindowKey(raw: string | null | undefined): string | null {
  if (!raw?.trim()) {
    return null;
  }

  const trimmed = raw.trim();
  if (CANONICAL_KEY_SET.has(trimmed)) {
    return trimmed;
  }

  const compact = trimmed.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (compact) {
    const key = formatScheduledWindowKey(compact[1], compact[2]);
    return CANONICAL_KEY_SET.has(key) ? key : null;
  }

  const segment = extractWindowSegment(trimmed);
  if (!segment) {
    return null;
  }

  const matched = findPhoenixTimeWindow(segment.start, segment.end);
  if (!matched) {
    return null;
  }

  return formatScheduledWindowKey(matched.start, matched.end);
}

export function formatCanonicalWindowDisplay(canonicalKey: string): string {
  const window = PHOENIX_REQUEST_SERVICE_TIME_WINDOWS.find(
    (entry) => formatScheduledWindowKey(entry.start, entry.end) === canonicalKey,
  );
  return window?.label ?? canonicalKey;
}

export function resolveBranchProvinceForJob(input: {
  serviceStateOrRegion: string | null | undefined;
  branchProvinceCode?: BranchProvinceCode | null;
}): BranchProvinceCode | null {
  return input.branchProvinceCode ?? normalizeServiceProvinceToBranchCode(input.serviceStateOrRegion);
}

export function alignScheduledForToBranchLocalWindow(input: {
  scheduledFor: Date | null;
  scheduledWindow: string | null | undefined;
  serviceStateOrRegion: string | null | undefined;
  branchProvinceCode?: BranchProvinceCode | null;
  scheduledServiceDate?: string | null;
}): { scheduledFor: Date | null; scheduledWindow: string | null } {
  const canonicalWindow = normalizeScheduledWindowKey(input.scheduledWindow);
  const provinceCode = resolveBranchProvinceForJob({
    serviceStateOrRegion: input.serviceStateOrRegion,
    branchProvinceCode: input.branchProvinceCode,
  });

  if (!input.scheduledFor && !input.scheduledServiceDate) {
    return { scheduledFor: null, scheduledWindow: canonicalWindow };
  }

  if (!canonicalWindow || !provinceCode) {
    return {
      scheduledFor: input.scheduledFor,
      scheduledWindow: canonicalWindow ?? input.scheduledWindow?.trim() ?? null,
    };
  }

  const [windowStart, windowEnd] = canonicalWindow.split("-");
  const window = findPhoenixTimeWindow(windowStart ?? "", windowEnd ?? "");
  if (!window) {
    return {
      scheduledFor: input.scheduledFor,
      scheduledWindow: canonicalWindow,
    };
  }

  const serviceDate =
    input.scheduledServiceDate?.trim() ||
    (input.scheduledFor ? isoDateKeyFromUtcInstant(input.scheduledFor, provinceCode) : null);

  if (!serviceDate || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
    return {
      scheduledFor: input.scheduledFor,
      scheduledWindow: canonicalWindow,
    };
  }

  return {
    scheduledFor: zonedLocalDateTimeToUtc(serviceDate, window.start, provinceCode),
    scheduledWindow: canonicalWindow,
  };
}

/** Occupied-window keys for Live Timing (includes legacy display normalization). */
export function occupiedBlockingWindowKey(raw: string | null | undefined): string | null {
  return normalizeScheduledWindowKey(raw);
}
