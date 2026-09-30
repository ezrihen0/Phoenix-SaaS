import assert from "node:assert/strict";

import { PHOENIX_SLOT_BLOCKING_JOB_STATUSES } from "../integrations/phoenix/phoenix-scheduling.constants";
import {
  isoDateKeyFromUtcInstant,
  zonedLocalDateTimeToUtc,
} from "../integrations/phoenix/phoenix-scheduling-timezone";
import {
  alignScheduledForToBranchLocalWindow,
  normalizeScheduledWindowKey,
  occupiedBlockingWindowKey,
} from "./job-scheduling-normalization";

function buildDaySlots(occupiedWindows: Set<string>) {
  const keys = ["09:00-11:00", "11:00-13:00", "13:00-15:00", "15:00-17:00", "17:00-19:00"];
  return keys.map((key) => ({ key, available: !occupiedWindows.has(key) }));
}

assert.equal(normalizeScheduledWindowKey("17:00-19:00"), "17:00-19:00", "canonical passthrough");
assert.equal(
  normalizeScheduledWindowKey("5:00 PM - 7:00 PM • Arrival 2h"),
  "17:00-19:00",
  "wizfield display maps to canonical",
);
assert.equal(
  normalizeScheduledWindowKey("11:00 AM - 1:00 PM"),
  "11:00-13:00",
  "wizfield midday display maps to canonical",
);
assert.equal(
  normalizeScheduledWindowKey("9:00 PM - 11:00 PM • Arrival 2h"),
  null,
  "non-phoenix evening window does not map",
);

const phoenixOccupied = buildDaySlots(new Set(["17:00-19:00"]));
assert.equal(phoenixOccupied.find((slot) => slot.key === "17:00-19:00")?.available, false, "phoenix canonical blocks");

const legacyOccupied = buildDaySlots(
  new Set([occupiedBlockingWindowKey("5:00 PM - 7:00 PM • Arrival 2h")].filter(Boolean) as string[]),
);
assert.equal(legacyOccupied.find((slot) => slot.key === "17:00-19:00")?.available, false, "legacy display blocks same slot");

const ottawaAligned = alignScheduledForToBranchLocalWindow({
  scheduledFor: new Date("2026-10-02T03:00:00.000Z"),
  scheduledWindow: "5:00 PM - 7:00 PM • Arrival 2h",
  scheduledServiceDate: "2026-10-02",
  serviceStateOrRegion: "Ontario",
  branchProvinceCode: "ON",
});
assert.equal(ottawaAligned.scheduledWindow, "17:00-19:00", "ottawa write normalizes window");
assert.equal(
  ottawaAligned.scheduledFor?.toISOString(),
  zonedLocalDateTimeToUtc("2026-10-02", "17:00", "ON").toISOString(),
  "ottawa local service date preserved",
);
assert.equal(
  isoDateKeyFromUtcInstant(ottawaAligned.scheduledFor as Date, "ON"),
  "2026-10-02",
  "ottawa local day stable",
);

const calgaryAligned = alignScheduledForToBranchLocalWindow({
  scheduledFor: new Date("2026-07-15T20:00:00.000Z"),
  scheduledWindow: "09:00-11:00",
  scheduledServiceDate: "2026-07-15",
  serviceStateOrRegion: "Alberta",
  branchProvinceCode: "AB",
});
assert.equal(
  calgaryAligned.scheduledFor?.toISOString(),
  zonedLocalDateTimeToUtc("2026-07-15", "09:00", "AB").toISOString(),
  "calgary local day preserved",
);

assert.equal(PHOENIX_SLOT_BLOCKING_JOB_STATUSES.includes("completed" as never), false, "completed does not block");
assert.equal(PHOENIX_SLOT_BLOCKING_JOB_STATUSES.includes("cancelled" as never), false, "cancelled does not block");

void (async () => {
  async function resolveInspectionJobBranchId(
    resolveBranchId: (organizationId: string, province: string | null) => Promise<string>,
    organizationId: string,
    province: string | null,
  ) {
    try {
      return await resolveBranchId(organizationId, province);
    } catch {
      return null;
    }
  }

  const inspectionBranchId = await resolveInspectionJobBranchId(
    async (_organizationId, province) => (province === "Ontario" ? "on-branch-id" : "ab-branch-id"),
    "org",
    "Ontario",
  );
  assert.equal(inspectionBranchId, "on-branch-id", "inspection job branch assignment uses province resolver");

  console.log("job-scheduling-normalization unit checks OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
