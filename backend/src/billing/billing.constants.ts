export const billingPlanKeys = ["starter", "pro", "business"] as const;
export type BillingPlanKey = (typeof billingPlanKeys)[number];

export const billingProviders = ["stripe", "clover"] as const;
export type BillingProvider = (typeof billingProviders)[number];

export const billingPlanOrganizationLimits: Record<BillingPlanKey, number | null> = {
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

export function parseBillingPlanKey(value: unknown): BillingPlanKey | null {
  if (typeof value !== "string") {
    return null;
  }
  const v = value.trim().toLowerCase();
  return billingPlanKeys.includes(v as BillingPlanKey) ? (v as BillingPlanKey) : null;
}

export function resolveOrganizationLimitForPlan(planKey: BillingPlanKey) {
  return billingPlanOrganizationLimits[planKey];
}
