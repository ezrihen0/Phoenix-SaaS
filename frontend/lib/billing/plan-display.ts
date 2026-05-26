export type BillingPlanKey = "starter" | "pro" | "business";

export type PlanDisplayInfo = {
  key: BillingPlanKey;
  title: string;
  coverage: string;
  body: string;
  monthlyPriceLabel: string;
  annualPriceLabel: string | null;
  features: string[];
};

function readPriceLabel(envKey: string, fallback: string) {
  const value = process.env[envKey]?.trim();
  return value || fallback;
}

export const PLAN_DISPLAY_CATALOG: PlanDisplayInfo[] = [
  {
    key: "starter",
    title: "Starter",
    coverage: "Covers 1 business",
    body: "Best for a single service brand under one shared WizField billing account.",
    monthlyPriceLabel: readPriceLabel("NEXT_PUBLIC_PLAN_STARTER_MONTHLY", "$79/mo"),
    annualPriceLabel: readPriceLabel("NEXT_PUBLIC_PLAN_STARTER_ANNUAL", "$790/yr"),
    features: ["1 business workspace", "Calls, jobs, and invoicing", "Office + field alignment"],
  },
  {
    key: "pro",
    title: "Pro",
    coverage: "Covers up to 3 businesses",
    body: "Designed for owners running a few brands or geographic business entities under one payer.",
    monthlyPriceLabel: readPriceLabel("NEXT_PUBLIC_PLAN_PRO_MONTHLY", "$149/mo"),
    annualPriceLabel: readPriceLabel("NEXT_PUBLIC_PLAN_PRO_ANNUAL", "$1,490/yr"),
    features: ["Up to 3 businesses", "Growth Center publishing", "Priority onboarding support"],
  },
  {
    key: "business",
    title: "Business",
    coverage: "Covers more businesses",
    body: "Use when the current local entitlement model needs effectively uncapped shared-account coverage.",
    monthlyPriceLabel: readPriceLabel("NEXT_PUBLIC_PLAN_BUSINESS_MONTHLY", "$299/mo"),
    annualPriceLabel: readPriceLabel("NEXT_PUBLIC_PLAN_BUSINESS_ANNUAL", "$2,990/yr"),
    features: ["Expanded business coverage", "Multi-brand operations", "Dedicated rollout guidance"],
  },
];

export function getPlanDisplay(planKey: BillingPlanKey) {
  return PLAN_DISPLAY_CATALOG.find((plan) => plan.key === planKey) ?? PLAN_DISPLAY_CATALOG[0];
}
