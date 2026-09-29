import {
  PHOENIX_REQUEST_SERVICE_TIME_WINDOWS,
  PHOENIX_AVAILABILITY_MAX_RANGE_DAYS,
  PHOENIX_BOOKING_HORIZON_MONTHS,
  PHOENIX_SLOT_BLOCKING_JOB_STATUSES,
  findPhoenixTimeWindow,
  formatScheduledWindowKey,
  getBookingHorizonBounds,
  validateAvailabilityRangeQuery,
  countIsoDateSpanDays,
} from "./phoenix-scheduling.constants";
import {
  isoDateKeyFromUtcInstant,
  zonedLocalDateTimeToUtc,
} from "./phoenix-scheduling-timezone";
import { parsePhoenixRequestServiceLiveTimingLocation } from "./phoenix-location-resolution";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

assert(PHOENIX_REQUEST_SERVICE_TIME_WINDOWS.length === 5, "V1 requires five windows");
assert(
  formatScheduledWindowKey("09:00", "11:00") === "09:00-11:00",
  "scheduled window key format",
);
assert(Boolean(findPhoenixTimeWindow("15:00", "17:00")), "find window");
assert(PHOENIX_BOOKING_HORIZON_MONTHS === 2, "horizon months");
assert(PHOENIX_AVAILABILITY_MAX_RANGE_DAYS === 31, "max range days");

const bounds = getBookingHorizonBounds("2026-10-15");
assert(bounds.horizonStart === "2026-10-01", "horizon starts at month start");
assert(bounds.horizonEnd === "2026-12-31", "horizon ends two months ahead");

const okRange = validateAvailabilityRangeQuery("2026-10-01", "2026-10-31", "2026-10-15");
assert(okRange.ok, "full month in horizon");
assert(countIsoDateSpanDays("2026-10-01", "2026-10-31") === 31, "october span");

const tooWide = validateAvailabilityRangeQuery("2026-10-01", "2026-11-01", "2026-10-15");
assert(!tooWide.ok && tooWide.code === "availability_range_too_large", "reject >31 days");

assert(PHOENIX_SLOT_BLOCKING_JOB_STATUSES.length === 4, "four blocking statuses");
assert(parsePhoenixRequestServiceLiveTimingLocation("calgary") === "calgary", "calgary live location");
assert(parsePhoenixRequestServiceLiveTimingLocation("Ottawa") === "ottawa", "ottawa live location");

const calgaryMorning = zonedLocalDateTimeToUtc("2026-07-15", "09:00", "AB");
assert(calgaryMorning.toISOString() === "2026-07-15T15:00:00.000Z", "Calgary MDT 9am → UTC");

const ottawaMorning = zonedLocalDateTimeToUtc("2026-01-15", "09:00", "ON");
assert(ottawaMorning.toISOString() === "2026-01-15T14:00:00.000Z", "Ottawa EST 9am → UTC");

const dstSpring = zonedLocalDateTimeToUtc("2026-03-08", "09:00", "AB");
assert(isoDateKeyFromUtcInstant(dstSpring, "AB") === "2026-03-08", "DST spring local date preserved");

console.log("phoenix request-service scheduling constants OK");
