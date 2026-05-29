import {
  AI_ACTION_KEY_CUSTOMER_HISTORY_SUMMARY,
  AI_ACTION_KEY_GROWTH_OPPORTUNITY_DRAFT,
  AI_ACTION_KEY_HOME_BRAIN_BRIEF,
  AI_ACTION_KEY_JOB_NEXT_STEP,
  AI_ACTION_KEY_MISSED_CALL_SUMMARY,
  AI_ACTION_KEY_SMS_FOLLOWUP_DRAFT,
  AI_ACTION_KEY_STALE_ESTIMATE_FOLLOWUP,
  AI_ACTION_KEY_UNPAID_INVOICE_RECOVERY,
  AI_FEATURE_BRAIN_V1_HOME,
  AI_FEATURE_CALL_INTAKE_ENVELOPE_V0,
  AI_FEATURE_OPERATOR_COPILOT_CALLS_SMS_V1,
} from "./ai.constants";

export type AiActionKey =
  | typeof AI_ACTION_KEY_HOME_BRAIN_BRIEF
  | typeof AI_ACTION_KEY_SMS_FOLLOWUP_DRAFT
  | typeof AI_ACTION_KEY_UNPAID_INVOICE_RECOVERY
  | typeof AI_ACTION_KEY_STALE_ESTIMATE_FOLLOWUP
  | typeof AI_ACTION_KEY_CUSTOMER_HISTORY_SUMMARY
  | typeof AI_ACTION_KEY_MISSED_CALL_SUMMARY
  | typeof AI_ACTION_KEY_JOB_NEXT_STEP
  | typeof AI_ACTION_KEY_GROWTH_OPPORTUNITY_DRAFT;

export type AiActionMutationPolicy = "none" | "draft_only" | "guarded_confirmed";

export type AiActionMonetizationTier = "included" | "pro" | "business" | "add_on_candidate";

export type AiActionRegistryStatus = "active" | "existing" | "planned" | "disabled";

export type AiActionRegistryEntry = {
  action_key: AiActionKey;
  display_name: string;
  business_value: string;
  surface: string;
  required_permission: string | string[];
  feature_flag: string | string[];
  mutation_policy: AiActionMutationPolicy;
  monetization_tier: AiActionMonetizationTier;
  status: AiActionRegistryStatus;
  legacy_feature_key?: string;
};

export const AI_ACTION_REGISTRY: AiActionRegistryEntry[] = [
  {
    action_key: AI_ACTION_KEY_HOME_BRAIN_BRIEF,
    display_name: "Home Brain Brief",
    business_value: "Deterministic office dashboard briefing with actionable cards.",
    surface: "/home",
    required_permission: "dashboard.office.view",
    feature_flag: ["AI_FOUNDATION_ENABLED", "AI_BRAIN_V1_ENABLED"],
    mutation_policy: "none",
    monetization_tier: "included",
    status: "existing",
    legacy_feature_key: AI_FEATURE_BRAIN_V1_HOME,
  },
  {
    action_key: AI_ACTION_KEY_SMS_FOLLOWUP_DRAFT,
    display_name: "SMS Follow-up Draft",
    business_value: "Operator Copilot SMS draft from recent call context.",
    surface: "/calls",
    required_permission: "calls.view",
    feature_flag: [
      "AI_FOUNDATION_ENABLED",
      "AI_OPERATOR_COPILOT_ENABLED",
      "AI_COPILOT_CALLS_SURFACE_ENABLED",
      "AI_COPILOT_CUSTOMER_SMS_DRAFT_ENABLED",
    ],
    mutation_policy: "draft_only",
    monetization_tier: "pro",
    status: "existing",
    legacy_feature_key: AI_FEATURE_OPERATOR_COPILOT_CALLS_SMS_V1,
  },
  {
    action_key: AI_ACTION_KEY_MISSED_CALL_SUMMARY,
    display_name: "Missed Call Summary",
    business_value: "Deterministic call-intake envelope dry-run for staff review.",
    surface: "/calls",
    required_permission: "calls.view",
    feature_flag: ["AI_FOUNDATION_ENABLED", "AI_VOICE_INTAKE_FOUNDATION_ENABLED"],
    mutation_policy: "none",
    monetization_tier: "included",
    status: "existing",
    legacy_feature_key: AI_FEATURE_CALL_INTAKE_ENVELOPE_V0,
  },
  {
    action_key: AI_ACTION_KEY_UNPAID_INVOICE_RECOVERY,
    display_name: "Unpaid Invoice Recovery",
    business_value: "Draft recovery outreach for overdue invoices.",
    surface: "/home, /invoices",
    required_permission: "dashboard.office.view",
    feature_flag: ["AI_FOUNDATION_ENABLED", "AI_ACTIONS_V1_ENABLED"],
    mutation_policy: "draft_only",
    monetization_tier: "pro",
    status: "planned",
  },
  {
    action_key: AI_ACTION_KEY_STALE_ESTIMATE_FOLLOWUP,
    display_name: "Stale Estimate Follow-up",
    business_value: "Draft follow-up for aging open estimates.",
    surface: "/home, /estimates",
    required_permission: "dashboard.office.view",
    feature_flag: ["AI_FOUNDATION_ENABLED", "AI_ACTIONS_V1_ENABLED"],
    mutation_policy: "draft_only",
    monetization_tier: "pro",
    status: "planned",
  },
  {
    action_key: AI_ACTION_KEY_CUSTOMER_HISTORY_SUMMARY,
    display_name: "Customer History Summary",
    business_value: "Bounded CRM narrative summary for a customer record.",
    surface: "/customers",
    required_permission: "customers.view",
    feature_flag: ["AI_FOUNDATION_ENABLED", "AI_ACTIONS_V1_ENABLED"],
    mutation_policy: "none",
    monetization_tier: "business",
    status: "planned",
  },
  {
    action_key: AI_ACTION_KEY_JOB_NEXT_STEP,
    display_name: "Job Next Step",
    business_value: "Suggested next step draft for an active job.",
    surface: "/jobs",
    required_permission: "jobs.view",
    feature_flag: ["AI_FOUNDATION_ENABLED", "AI_ACTIONS_V1_ENABLED"],
    mutation_policy: "draft_only",
    monetization_tier: "pro",
    status: "planned",
  },
  {
    action_key: AI_ACTION_KEY_GROWTH_OPPORTUNITY_DRAFT,
    display_name: "Growth Opportunity Draft",
    business_value: "Marketing opportunity content draft for Growth Center.",
    surface: "/marketing",
    required_permission: "marketing.office.read",
    feature_flag: ["AI_FOUNDATION_ENABLED", "AI_ACTIONS_V1_ENABLED"],
    mutation_policy: "draft_only",
    monetization_tier: "add_on_candidate",
    status: "planned",
  },
];

const registryByKey = new Map<AiActionKey, AiActionRegistryEntry>(
  AI_ACTION_REGISTRY.map((entry) => [entry.action_key, entry]),
);

export function getAiActionRegistryEntry(actionKey: string): AiActionRegistryEntry | null {
  return registryByKey.get(actionKey as AiActionKey) ?? null;
}

export function isAiActionKey(actionKey: string): actionKey is AiActionKey {
  return registryByKey.has(actionKey as AiActionKey);
}

export function listAiActionRegistryEntries(): AiActionRegistryEntry[] {
  return [...AI_ACTION_REGISTRY];
}
