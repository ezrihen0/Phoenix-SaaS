/** Operator intent modes for general_ai_chat (server-detected). */
export type AiChatDetectedMode =
  | "daily_focus"
  | "money_recovery"
  | "estimate_followup"
  | "call_recovery"
  | "lead_followup"
  | "job_operations"
  | "general_question";

export type AiChatRecommendationPriority = "high" | "medium" | "low";

export type AiChatRecommendation = {
  title: string;
  reason: string;
  priority: AiChatRecommendationPriority;
  targetHref: string;
};

export type AiChatGroundingSource =
  | "dashboard"
  | "invoice"
  | "estimate"
  | "lead"
  | "job"
  | "call";

export type AiChatGroundingItem = {
  source: AiChatGroundingSource;
  label: string;
};

/** Internal list routes only — no entity ids in chat V1 navigation. */
export const AI_CHAT_ALLOWED_TARGET_HREFS = [
  "/home",
  "/invoices",
  "/estimates",
  "/jobs",
  "/leads",
  "/calls",
  "/customers",
] as const;

export type AiChatAllowedTargetHref = (typeof AI_CHAT_ALLOWED_TARGET_HREFS)[number];

export const AI_CHAT_FEEDBACK_USEFUL = "useful";
export const AI_CHAT_FEEDBACK_NOT_USEFUL = "not_useful";

export type AiChatFeedbackValue = typeof AI_CHAT_FEEDBACK_USEFUL | typeof AI_CHAT_FEEDBACK_NOT_USEFUL;
