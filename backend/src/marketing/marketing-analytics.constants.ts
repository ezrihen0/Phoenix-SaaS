/** Maximum analytics window span (rolling) — aligns with Execution Prompt bounded custom range. */
export const MARKETING_ANALYTICS_MAX_WINDOW_MS = 366 * 24 * 60 * 60 * 1000;

export const MARKETING_ANALYTICS_PRESETS = ["last_7d", "last_30d", "last_90d"] as const;

export type MarketingAnalyticsPresetKey = (typeof MARKETING_ANALYTICS_PRESETS)[number];
