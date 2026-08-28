/**
 * Mirrors TypeORM credential boolean parsing semantics for rollout flags.
 * Enabling values: true, 1, yes, on (case-insensitive trim).
 */
export function resolveAiFoundationEnabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/**
 * Same token contract as `resolveAiFoundationEnabled`.
 * Callers must gate `AI_FOUNDATION_ENABLED` first—403 `ai_foundation_disabled` stays exclusive to that layer.
 */
export function resolveAiBrainV1Enabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/**
 * Phase 1.5A voice intake foundation (staff call-envelope dry-run).
 * Gate `AI_FOUNDATION_ENABLED` first — 403 `ai_foundation_disabled` remains that layer exclusively.
 */
export function resolveAiVoiceIntakeFoundationEnabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/**
 * Phase 1.5B live voice pilot — Telnyx AI Assistant on inbound calls.
 * Requires `AI_FOUNDATION_ENABLED` and `AI_VOICE_INTAKE_FOUNDATION_ENABLED` first (same contract as 1.5A).
 */
export function resolveAiVoiceIntakeLivePilotEnabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/**
 * Phase 2 — Operator Copilot master gate (requires `AI_FOUNDATION_ENABLED` first in callers).
 */
export function resolveAiOperatorCopilotEnabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

export function resolveAiCopilotCallsSurfaceEnabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

export function resolveAiCopilotCustomerSmsDraftEnabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/** Path B — allow live LLM for Copilot draft generation (still falls back to template on failure). */
export function resolveAiCopilotLlmEnabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/** Phase 3 — guarded outbound SMS from `/calls` Copilot behind `messaging.send`. */
export function resolveAiCopilotCustomerSmsGuardedSendEnabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/** Phase 4 — read-time Copilot SMS outcome (waiting vs replied) from `txt_messages`; no outbound side effects. */
export function resolveAiCopilotCustomerSmsOutcomeTrackingEnabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/**
 * AI Actions V1 — unified `/api/ai/actions/:actionKey/run` + planned registry visibility.
 * Requires `AI_FOUNDATION_ENABLED` first in callers.
 */
export function resolveAiActionsV1Enabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/**
 * WizField AI Chat agent (`POST /api/ai/chat`).
 * Requires `AI_FOUNDATION_ENABLED` first in callers.
 */
export function resolveAiChatEnabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/**
 * Field Copilot — gas fireplace field knowledge (`POST /api/ai/field-copilot`).
 * Requires `AI_FOUNDATION_ENABLED` first in callers.
 */
export function resolveAiFieldCopilotEnabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/**
 * Field Copilot AI Voice surface shell — hard-disabled unless explicitly enabled.
 * Requires `AI_FOUNDATION_ENABLED` and `AI_FIELD_COPILOT_ENABLED` first in callers.
 */
export function resolveAiFieldCopilotVoiceEnabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/**
 * HOME AI V1 — AI-first operational home (`/api/ai/home/*`).
 * Requires `AI_FOUNDATION_ENABLED` first in callers.
 */
export function resolveAiHomeV1Enabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/** Parse comma-separated env list into normalized tokens (empty when unset). */
export function parseCsvEnvList(raw: string | undefined): string[] {
  if (typeof raw !== "string" || raw.trim() === "") {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}