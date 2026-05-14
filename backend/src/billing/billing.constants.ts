export const phoenixPlanKeys = ["starter", "pro", "business"] as const;
export type PhoenixPlanKey = (typeof phoenixPlanKeys)[number];

export const billingProviders = ["stripe", "clover"] as const;
export type BillingProvider = (typeof billingProviders)[number];

export const phoenixPlanOrganizationLimits: Record<PhoenixPlanKey, number | null> = {
  starter: 1,
  pro: 3,
  business: null,
};

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

export function resolveOrganizationLimitForPlan(planKey: PhoenixPlanKey) {
  return phoenixPlanOrganizationLimits[planKey];
}
