export const MARKETING_PLATFORM_KEYS = ["google_business", "facebook", "instagram"] as const;
export type MarketingPlatformKey = (typeof MARKETING_PLATFORM_KEYS)[number];

export const MARKETING_WORKFLOW_STATES = ["draft", "needs_review", "approved"] as const;
export type MarketingWorkflowStateEnum = (typeof MARKETING_WORKFLOW_STATES)[number];

export const MARKETING_PUBLISH_OUTCOME_DEFERRED_V1_5 = "deferred_v1_5";
export const MARKETING_PUBLISH_OUTCOME_CHANNEL_DISCONNECTED = "channel_disconnected";
export const MARKETING_PUBLISH_OUTCOME_PROVIDER_ERROR = "provider_error";
export const MARKETING_PUBLISH_OUTCOME_RATE_LIMITED = "rate_limited";
export const MARKETING_PUBLISH_OUTCOME_TIMEOUT = "provider_timeout";

export function isMarketingPublishRetryableOutcome(code: string | null | undefined): boolean {
  if (!code) {
    return false;
  }

  return code === MARKETING_PUBLISH_OUTCOME_RATE_LIMITED || code === MARKETING_PUBLISH_OUTCOME_TIMEOUT;
}
