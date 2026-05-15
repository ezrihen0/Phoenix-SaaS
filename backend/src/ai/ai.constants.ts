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

/** Phase 2 — Operator Copilot: SMS follow-up draft from recent call context. */
export const AI_FEATURE_OPERATOR_COPILOT_CALLS_SMS_V1 = "operator_copilot_calls_sms_v1";

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