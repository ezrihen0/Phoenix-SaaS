export const MARKETING_PLATFORM_KEYS = ["google_business", "facebook", "instagram"] as const;
export type MarketingPlatformKey = (typeof MARKETING_PLATFORM_KEYS)[number];

export const MARKETING_WORKFLOW_STATES = ["draft", "needs_review", "approved"] as const;
export type MarketingWorkflowStateEnum = (typeof MARKETING_WORKFLOW_STATES)[number];
