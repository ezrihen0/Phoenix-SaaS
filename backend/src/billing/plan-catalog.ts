import type { ConfigService } from "@nestjs/config";

import type { PhoenixPlanKey } from "./billing.constants";

/** Env-mapped Clover recurring plan IDs for the single PhoenixOS merchant. */
export function resolveCloverPlanIdForPhoenixPlan(
  configService: ConfigService,
  planKey: PhoenixPlanKey,
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
