export type BillingPlanKey = "starter" | "pro" | "business";

export type PlanDisplayInfo = {
  key: BillingPlanKey;
  title: string;
  organizationLimit: number | null;
  coverage: string;
  body: string;
  monthlyPriceLabel: string;
  features: string[];
};

function readPriceLabel(envKey: string, fallback: string) {
  const value = process.env[envKey]?.trim();
  return value || fallback;
}

function formatCoverage(organizationLimit: number | null) {
  if (organizationLimit === 1) {
    return "Covers 1 business";
  }
  if (organizationLimit === null) {
    return "Covers unlimited businesses";
  }
  return `Covers up to ${organizationLimit} businesses`;
}

export const BILLING_HONESTY_FOOTNOTE =
  process.env.NEXT_PUBLIC_BILLING_HONESTY_FOOTNOTE?.trim()
  || "All plans bill monthly through Stripe Checkout. Displayed prices are per month; taxes may apply. Activation is confirmed by verified webhook sync, not by checkout redirect alone.";

export const PLAN_DISPLAY_CATALOG: PlanDisplayInfo[] = [
  {
    key: "starter",
    title: "Starter",
    organizationLimit: 1,
    coverage: formatCoverage(1),
    body: "Best for a single service brand under one shared WizField billing account.",
    monthlyPriceLabel: readPriceLabel("NEXT_PUBLIC_PLAN_STARTER_MONTHLY", "$79/mo"),
    features: ["1 business workspace", "Calls, jobs, and invoicing", "Office + field alignment"],
  },
  {
    key: "pro",
    title: "Pro",
    organizationLimit: 3,
    coverage: formatCoverage(3),
    body: "Designed for owners running a few brands or geographic business entities under one payer.",
    monthlyPriceLabel: readPriceLabel("NEXT_PUBLIC_PLAN_PRO_MONTHLY", "$149/mo"),
    features: ["Up to 3 businesses", "Growth Center publishing", "Priority onboarding support"],
  },
  {
    key: "business",
    title: "Business",
    organizationLimit: null,
    coverage: formatCoverage(null),
    body: "Use when the current local entitlement model needs effectively uncapped shared-account coverage.",
    monthlyPriceLabel: readPriceLabel("NEXT_PUBLIC_PLAN_BUSINESS_MONTHLY", "$299/mo"),
    features: ["Expanded business coverage", "Multi-brand operations", "Dedicated rollout guidance"],
  },
];

export function getPlanDisplay(planKey: BillingPlanKey) {
  return PLAN_DISPLAY_CATALOG.find((plan) => plan.key === planKey) ?? PLAN_DISPLAY_CATALOG[0];
}
