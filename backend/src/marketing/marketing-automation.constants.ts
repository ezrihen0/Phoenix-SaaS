export const MARKETING_AUTOMATION_OPPORTUNITY_TYPES = [
  "work_showcase_recent",
  "service_momentum",
  "local_authority_geo",
  "before_after_signal",
] as const;

export type MarketingAutomationOpportunityTypeKey = (typeof MARKETING_AUTOMATION_OPPORTUNITY_TYPES)[number];

export const MARKETING_AUTOMATION_ACTION_TYPES = ["suggest_only", "auto_create_draft"] as const;

export type MarketingAutomationActionTypeKey = (typeof MARKETING_AUTOMATION_ACTION_TYPES)[number];

export const MARKETING_AUTOMATION_RUN_OUTCOMES = ["matched", "skipped", "draft_created", "error"] as const;

export type MarketingAutomationRunOutcomeKey = (typeof MARKETING_AUTOMATION_RUN_OUTCOMES)[number];

export function isMarketingAutomationOpportunityType(raw: string): raw is MarketingAutomationOpportunityTypeKey {
  return (MARKETING_AUTOMATION_OPPORTUNITY_TYPES as readonly string[]).includes(raw);
}

export function isMarketingAutomationActionType(raw: string): raw is MarketingAutomationActionTypeKey {
  return (MARKETING_AUTOMATION_ACTION_TYPES as readonly string[]).includes(raw);
}

export function isMarketingAutomationRunOutcome(raw: string): raw is MarketingAutomationRunOutcomeKey {
  return (MARKETING_AUTOMATION_RUN_OUTCOMES as readonly string[]).includes(raw);
}
