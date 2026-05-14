/** Phase 4 Core V1 opportunity type keys (owner locked). */
export const MARKETING_OPPORTUNITY_TYPES = [
  "work_showcase_recent",
  "service_momentum",
  "local_authority_geo",
  "before_after_signal",
] as const;

export type MarketingOpportunityTypeKey = (typeof MARKETING_OPPORTUNITY_TYPES)[number];

export const MARKETING_OPPORTUNITY_SOURCE_CRM = "crm_intelligence";

/** Active / convertible rows surfaced in Growth Center lists. */
export const MARKETING_OPPORTUNITY_OPEN_STATUSES = ["suggested", "detected"] as const;

export const MARKETING_OPPORTUNITY_REFRESH_COOLDOWN_MS = 60_000;

/** Rolling window for job-based detectors (days). */
export const MARKETING_INTELLIGENCE_ROLLING_WINDOW_DAYS = 14;

export const MARKETING_INTELLIGENCE_MIN_JOBS_WORK_SHOWCASE = 1;

export const MARKETING_INTELLIGENCE_MIN_JOBS_SERVICE_MOMENTUM = 3;

export const MARKETING_INTELLIGENCE_MIN_JOBS_LOCAL_AUTHORITY = 3;

/** Lower number = higher priority in recommended-next-action ranking. */
export const MARKETING_OPPORTUNITY_TYPE_PRIORITY: Record<string, number> = {
  work_showcase_recent: 1,
  before_after_signal: 2,
  service_momentum: 3,
  local_authority_geo: 4,
};
