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