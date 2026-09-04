import { billingPlanKeys, billingPlanOrganizationLimits, type BillingPlanKey } from "./billing.constants";

export type PlanCatalogEntry = {
  key: BillingPlanKey;
  title: string;
  organizationLimit: number | null;
  monthlyPriceEnvKey: string;
  monthlyDisplayFallback: string;
  features: string[];
};

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    key: "starter",
    title: "Starter",
    organizationLimit: billingPlanOrganizationLimits.starter,
    monthlyPriceEnvKey: "NEXT_PUBLIC_PLAN_STARTER_MONTHLY",
    monthlyDisplayFallback: "$79/mo",
    features: ["1 business workspace", "Calls, jobs, and invoicing", "Office + field alignment"],
  },
  {
    key: "pro",
    title: "Pro",
    organizationLimit: billingPlanOrganizationLimits.pro,
    monthlyPriceEnvKey: "NEXT_PUBLIC_PLAN_PRO_MONTHLY",
    monthlyDisplayFallback: "$149/mo",
    features: ["Up to 3 businesses", "Growth Center publishing", "Priority onboarding support"],
  },
  {
    key: "business",
    title: "Business",
    organizationLimit: billingPlanOrganizationLimits.business,
    monthlyPriceEnvKey: "NEXT_PUBLIC_PLAN_BUSINESS_MONTHLY",
    monthlyDisplayFallback: "$299/mo",
    features: ["Expanded business coverage", "Multi-brand operations", "Dedicated rollout guidance"],
  },
];

export function getPlanCatalogEntry(planKey: BillingPlanKey) {
  return PLAN_CATALOG.find((entry) => entry.key === planKey) ?? PLAN_CATALOG[0];
}

export function listPlanCatalogKeys() {
  return billingPlanKeys.slice();
}

export function resolveCloverPlanIdForBillingPlan(
  configService: { get: (key: string) => string | undefined },
  planKey: BillingPlanKey,
): string | null {
  const envKey =
    planKey === "starter"
      ? "CLOVER_PLAN_ID_STARTER"
      : planKey === "pro"
        ? "CLOVER_PLAN_ID_PRO"
        : "CLOVER_PLAN_ID_BUSINESS";
  return configService.get(envKey)?.trim() || null;
}
