import type { ConfigService } from "@nestjs/config";

import type { BillingPlanKey } from "./billing.constants";

/** Env-mapped Clover recurring plan IDs for the single WizField merchant. */
export function resolveCloverPlanIdForBillingPlan(
  configService: ConfigService,
  planKey: BillingPlanKey,
): string | null {
  const key =
    planKey === "starter"
      ? "CLOVER_PLAN_ID_STARTER"
      : planKey === "pro"
        ? "CLOVER_PLAN_ID_PRO"
        : "CLOVER_PLAN_ID_BUSINESS";
  const raw = configService.get<string>(key);
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  return raw.trim();
}
