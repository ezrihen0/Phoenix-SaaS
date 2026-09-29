import { apiError } from "../../common/api-response";
import type { BranchProvinceCode } from "../../crm/branch-province-resolution";

export type PhoenixMarketingLocation =
  | "calgary"
  | "edmonton"
  | "red-deer"
  | "ottawa";

/** V1 live timing availability + booking accepts Calgary and Ottawa only. */
export type PhoenixRequestServiceLiveTimingLocation = "calgary" | "ottawa";

const LOCATION_TO_BRANCH_CODE: Record<PhoenixMarketingLocation, BranchProvinceCode> = {
  calgary: "AB",
  edmonton: "AB",
  "red-deer": "AB",
  ottawa: "ON",
};

export function parsePhoenixMarketingLocation(value: string | undefined): PhoenixMarketingLocation {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "calgary" ||
    normalized === "edmonton" ||
    normalized === "red-deer" ||
    normalized === "ottawa"
  ) {
    return normalized;
  }

  apiError(400, "invalid_phoenix_location", "location must be calgary, edmonton, red-deer, or ottawa.");
}

export function resolveBranchProvinceCodeForLocation(location: PhoenixMarketingLocation): BranchProvinceCode {
  return LOCATION_TO_BRANCH_CODE[location];
}

export function parsePhoenixRequestServiceLiveTimingLocation(
  value: string | undefined,
): PhoenixRequestServiceLiveTimingLocation {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "calgary" || normalized === "ottawa") {
    return normalized;
  }

  apiError(
    400,
    "invalid_phoenix_location",
    "location must be calgary or ottawa for live timing availability and booking.",
  );
}
