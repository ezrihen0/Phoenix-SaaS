import type { ActorContext } from "../common/request-types";
import type { RoleModePermission } from "../auth/permissions";
import { AI_CHAT_CONTEXT_MAX_PER_CATEGORY } from "./ai-chat-context.types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_PREFIX_PATTERN = /^(sk-|whsec_|KEY[A-Z0-9_])/i;

export function isoDateOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function truncateLabel(value: string | null | undefined, max = 80): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

export function looksLikeEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return false;
  }

  const nonPhoneChars = trimmed.replace(/[\d\s().+-]/g, "");
  return nonPhoneChars.length <= 2;
}

export function looksLikeRawIdentifier(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (UUID_PATTERN.test(trimmed)) {
    return true;
  }

  if (SECRET_PREFIX_PATTERN.test(trimmed)) {
    return true;
  }

  if (/^\+?\d{10,}$/.test(trimmed.replace(/[\s()-]/g, ""))) {
    return true;
  }

  const hexish = trimmed.replace(/[^0-9a-f]/gi, "");
  if (hexish.length >= 24 && hexish.length / trimmed.length > 0.85) {
    return true;
  }

  return false;
}

export function looksLikeSensitiveIdentifier(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return false;
  }

  return looksLikeEmail(trimmed) || looksLikePhone(trimmed) || looksLikeRawIdentifier(trimmed);
}

/**
 * Call rows: never pass phone-like matched_client_display_name into WORKSPACE_CONTEXT.
 */
export function sanitizeCallerDisplayLabel(
  displayName: string | null | undefined,
  matchedClientId: string | null | undefined,
): string {
  const trimmed = (displayName ?? "").trim();
  if (!trimmed || looksLikeSensitiveIdentifier(trimmed)) {
    return matchedClientId?.trim() ? "Known customer" : "Unknown caller";
  }

  return truncateLabel(trimmed, 64);
}

/**
 * Lead / invoice customer labels: strip phone, email, and raw identifiers.
 */
export function sanitizePersonDisplayLabel(
  displayName: string | null | undefined,
  fallbackLabel: string,
): string {
  const trimmed = (displayName ?? "").trim();
  if (!trimmed || looksLikeSensitiveIdentifier(trimmed)) {
    return fallbackLabel;
  }

  return truncateLabel(trimmed, 64) || fallbackLabel;
}

export type AiChatActorCapabilitySummary = {
  role: string | null;
  can_view_financials: boolean;
  can_view_jobs: boolean;
  can_view_calls: boolean;
  can_view_leads: boolean;
};

function permissionGranted(permissions: ReadonlySet<string>, keys: RoleModePermission[]): boolean {
  return keys.some((key) => permissions.has(key));
}

export function buildActorCapabilitySummary(actor: ActorContext): AiChatActorCapabilitySummary {
  const permissions = new Set(actor.permissions ?? []);

  return {
    role: actor.role ?? null,
    can_view_financials: permissionGranted(permissions, [
      "invoices.view",
      "invoices.manage",
      "invoices.assigned.view",
    ]),
    can_view_jobs: permissionGranted(permissions, [
      "jobs.view",
      "jobs.create",
      "jobs.assigned.view",
    ]),
    can_view_calls: permissionGranted(permissions, ["calls.view", "calls.dial"]),
    can_view_leads: permissionGranted(permissions, ["leads.view", "leads.manage"]),
  };
}

export function takeMax<T>(rows: T[], max = AI_CHAT_CONTEXT_MAX_PER_CATEGORY): T[] {
  return rows.slice(0, max);
}

/** Forbidden substrings that must not appear in serialized WORKSPACE_CONTEXT JSON. */
export const WORKSPACE_CONTEXT_FORBIDDEN_SERIALIZED_KEYS = [
  "voicemail_transcription",
  "ai_conversation_messages_json",
  "raw_payload_snapshot",
  "recording_url",
  "from_number",
  "to_number",
  "DEEPSEEK_API_KEY",
  "permissions",
] as const;

export function assertWorkspaceContextJsonSafe(json: string): void {
  for (const key of WORKSPACE_CONTEXT_FORBIDDEN_SERIALIZED_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`workspace_context_forbidden_key:${key}`);
    }
  }
}
