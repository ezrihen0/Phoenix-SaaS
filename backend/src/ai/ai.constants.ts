/** Canonical Phase 0 whitelisted CRM tool identifier. */
export const AI_PHASE0_TOOL_OFFICE_DASHBOARD = "crm.office_dashboard_snapshot";

export const AI_FEATURE_PHASE0_DRY_RUN = "phase0_tool_dry_run";

export const AI_PROMPT_VERSION_PHASE0 = "phase0_none";

/** Phase 1 Brain V1 `/home` brief (generation telemetry via `ai_recommendation_runs`). */
export const AI_FEATURE_BRAIN_V1_HOME = "brain_v1_home";

/** Monotonic bump when persisted `tool_trace_json` Brain envelope keys change shape. */
export const AI_BRAIN_TRACE_SCHEMA_VERSION = "1";

/** Monotonic bump when BrainRulesEngine deterministic semantics change materially. */
export const AI_BRAIN_RULES_ENGINE_VERSION = "1";

/** Template-assembled wording only in Phase 1 (no LM). */
export const AI_PROMPT_VERSION_BRAIN_V1_TEMPLATE = "brain_v1_template_only";

/** Non-converted leads older than N days qualify for `stale_leads` Brain rule. */
export const AI_BRAIN_STALE_LEAD_DAYS_THRESHOLD = 5;

/** Max UTF-8 byte length accepted for hashing + audit linkage (deterministic payloads only). */
export const AI_MAX_SERIALIZED_TOOL_OUTPUT_BYTES = 2 * 1024 * 1024;

/** Phase 1.5A — staff dry-run call intake envelope (`ai_recommendation_runs`). */
export const AI_FEATURE_CALL_INTAKE_ENVELOPE_V0 = "call_intake_envelope_v0";

/** Phase 1.5B P3 — persisted `ai_recommendation_runs` from Telnyx conversation webhooks + hybrid CRM. */
export const AI_FEATURE_CALL_INTAKE_VOICE_TELNYX_V1 = "call_intake_voice_telnyx_v1";

/** Monotonic bump when persisted intake `tool_trace_json` envelope shape changes. */
export const AI_INTAKE_TRACE_SCHEMA_VERSION = "1";

/** Monotonic bump when deterministic intake normalizer output semantics change (Phase 1.5A staff dry-run path). */
export const AI_INTAKE_NORMALIZER_VERSION = "1";

/** Phase 1.5B Telnyx post-call voice bridge — first normalizer revision. */
export const AI_VOICE_INTAKE_NORMALIZER_VERSION = "1";

/** Trace payload revision for `tool_trace_json` voice bridge envelopes. */
export const AI_VOICE_INTAKE_TRACE_SCHEMA_VERSION = "1";

/** Deterministic contract only; no LM on the voice leg in Phase 1.5A. */
export const AI_PROMPT_VERSION_CALL_INTAKE_V0 = "call_intake_v0_deterministic";

/** Phase 1.5B P3 — deterministic voice bridge (`Telnyx` ingest → `call_intake.*` sections). */
export const AI_PROMPT_VERSION_CALL_INTAKE_VOICE_V1 = "call_intake_voice_telnyx_v1_deterministic";

/**
 * Audit `source_channel` for rows derived from persisted `recent_calls` (not live voice session).
 * Distinct from `ui` / future live pilot channels.
 */
export const AI_SOURCE_CHANNEL_CALL_RECORDING_DERIVED = "call_recording_derived";

/** `ai_recommendation_runs.source_channel` for Phase 1.5B Telnyx AI Assistant post-call pipeline. */
export const AI_SOURCE_CHANNEL_TELNYX_AI_VOICE_WEBHOOK = "telnyx_ai_voice_webhook";

/** Staff-triggered AI features (UI / authenticated API). */
export const AI_SOURCE_CHANNEL_UI = "ui";

/** AI Actions V1 — unified action run trace envelope revision. */
export const AI_ACTIONS_TRACE_SCHEMA_VERSION = "1";

/** Active LLM provider name persisted on audit rows. */
export const AI_DEEPSEEK_PROVIDER_NAME = "deepseek";

/** First WizField AI Agent — owner/admin general chat (`POST /api/ai/chat`). */
export const AI_AGENT_KEY_GENERAL_AI_CHAT = "general_ai_chat";

export const AI_FEATURE_GENERAL_AI_CHAT_V1 = "general_ai_chat_v1";

export const AI_PROMPT_VERSION_GENERAL_AI_CHAT_V1 = "general_ai_chat_v1";

export const AI_AGENT_DISPLAY_NAME_GENERAL_AI_CHAT = "WizField AI Chat";

/** Field Copilot — technician field knowledge assistant (`POST /api/ai/field-copilot`). */
export const AI_AGENT_KEY_FIELD_COPILOT = "field_copilot";

export const AI_FEATURE_FIELD_COPILOT_V1 = "field_copilot_v1";

export const AI_PROMPT_VERSION_FIELD_COPILOT_V1 = "field_copilot_v1";

/** Canonical AI Actions V1 action keys (registry + telemetry). */
export const AI_ACTION_KEY_HOME_BRAIN_BRIEF = "home_brain_brief";
export const AI_ACTION_KEY_SMS_FOLLOWUP_DRAFT = "sms_followup_draft";
export const AI_ACTION_KEY_UNPAID_INVOICE_RECOVERY = "unpaid_invoice_recovery";
export const AI_ACTION_KEY_STALE_ESTIMATE_FOLLOWUP = "stale_estimate_followup";
export const AI_ACTION_KEY_CUSTOMER_HISTORY_SUMMARY = "customer_history_summary";
export const AI_ACTION_KEY_MISSED_CALL_SUMMARY = "missed_call_summary";
export const AI_ACTION_KEY_JOB_NEXT_STEP = "job_next_step";
export const AI_ACTION_KEY_GROWTH_OPPORTUNITY_DRAFT = "growth_opportunity_draft";

/** Phase 2 — Operator Copilot: SMS follow-up draft from recent call context. */
export const AI_FEATURE_OPERATOR_COPILOT_CALLS_SMS_V1 = "operator_copilot_calls_sms_v1";

/** Maps legacy `feature_key` values to AI Actions V1 keys for usage aggregates. */
export const AI_LEGACY_FEATURE_KEY_TO_ACTION_KEY: Record<string, string> = {
  [AI_FEATURE_BRAIN_V1_HOME]: AI_ACTION_KEY_HOME_BRAIN_BRIEF,
  [AI_FEATURE_OPERATOR_COPILOT_CALLS_SMS_V1]: AI_ACTION_KEY_SMS_FOLLOWUP_DRAFT,
  [AI_FEATURE_CALL_INTAKE_ENVELOPE_V0]: AI_ACTION_KEY_MISSED_CALL_SUMMARY,
  [AI_FEATURE_GENERAL_AI_CHAT_V1]: AI_AGENT_KEY_GENERAL_AI_CHAT,
  [AI_FEATURE_FIELD_COPILOT_V1]: AI_AGENT_KEY_FIELD_COPILOT,
};

export const AI_DRAFT_TYPE_CUSTOMER_SMS_FOLLOWUP_V1 = "customer_sms_followup_v1";

export const AI_PROMPT_VERSION_OPERATOR_COPILOT_SMS_V1 = "operator_copilot_sms_v1";

/**
 * Canonical section keys for call intake trace payload (Phase 1.5A populates v0; Phase 1.5B may extend).
 */
export const RESERVED_VOICE_INTAKE_AI_EVENT_KEYS = [
  "call_intake.summary",
  "call_intake.intent",
  "call_intake.structured_capture",
  "call_intake.handoff",
] as const;