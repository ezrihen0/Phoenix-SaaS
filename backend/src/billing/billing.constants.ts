export const phoenixPlanKeys = ["starter", "pro", "business"] as const;
export type PhoenixPlanKey = (typeof phoenixPlanKeys)[number];

export const organizationBillingStatuses = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "deactivated",
  "unknown",
] as const;
export type OrganizationBillingStatus = (typeof organizationBillingStatuses)[number];

export function parsePhoenixPlanKey(value: unknown): PhoenixPlanKey | null {
  if (typeof value !== "string") {
    return null;
  }
  const v = value.trim().toLowerCase();
  return phoenixPlanKeys.includes(v as PhoenixPlanKey) ? (v as PhoenixPlanKey) : null;
}
