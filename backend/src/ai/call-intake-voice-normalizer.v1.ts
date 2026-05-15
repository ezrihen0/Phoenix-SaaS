import { createHash } from "node:crypto";

import type { RecentCallEntity } from "../database/entities/recent-call.entity";
import {
  AI_VOICE_INTAKE_NORMALIZER_VERSION,
  AI_VOICE_INTAKE_TRACE_SCHEMA_VERSION,
  RESERVED_VOICE_INTAKE_AI_EVENT_KEYS,
} from "./ai.constants";

export type CallIntakeEnvelopeSectionsVoiceV1 = Record<(typeof RESERVED_VOICE_INTAKE_AI_EVENT_KEYS)[number], unknown>;

export type CallIntakeVoiceMinimalDigestV1 = {
  voice_intake_trace_schema_version: typeof AI_VOICE_INTAKE_TRACE_SCHEMA_VERSION;
  voice_intake_normalizer_version: typeof AI_VOICE_INTAKE_NORMALIZER_VERSION;
  recent_call_id: string;
  provider: string;
  telnyx_conversation_id: string | null;
  telnyx_ai_assistant_id: string | null;
  ai_summary_present: boolean;
  messages_thread_sha256_hex: string | null;
  transcript_line_count: number;
  matched_client_id: string | null;
  matched_lead_id: string | null;
};

function sha256Utf8Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function parseMessageCount(messagesJson: string | null | undefined): { count: number; digestHex: string | null } {
  const raw = messagesJson?.trim() ?? "";
  if (!raw) {
    return { count: 0, digestHex: null };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return { count: 0, digestHex: sha256Utf8Hex(raw) };
    }
    return { count: parsed.length, digestHex: sha256Utf8Hex(raw) };
  } catch {
    return { count: 0, digestHex: sha256Utf8Hex(raw) };
  }
}

export function buildCallIntakeVoiceMinimalDigestV1(call: RecentCallEntity): CallIntakeVoiceMinimalDigestV1 {
  const { count, digestHex } = parseMessageCount(call.ai_conversation_messages_json);
  return {
    voice_intake_trace_schema_version: AI_VOICE_INTAKE_TRACE_SCHEMA_VERSION,
    voice_intake_normalizer_version: AI_VOICE_INTAKE_NORMALIZER_VERSION,
    recent_call_id: call.id,
    provider: call.provider,
    telnyx_conversation_id: call.telnyx_conversation_id ?? null,
    telnyx_ai_assistant_id: call.telnyx_ai_assistant_id ?? null,
    ai_summary_present: Boolean(call.ai_summary?.trim()),
    messages_thread_sha256_hex: digestHex,
    transcript_line_count: count,
    matched_client_id: call.matched_client_id,
    matched_lead_id: call.matched_lead_id,
  };
}

export function digestCallIntakeVoiceMinimalV1(minimal: CallIntakeVoiceMinimalDigestV1): string {
  return sha256Utf8Hex(JSON.stringify(minimal));
}

/**
 * Phase 1.5B P3 — maps Telnyx-ingested `recent_calls` AI columns into the reserved `call_intake.*` envelope keys.
 */
export function buildCallIntakeEnvelopeSectionsVoiceV1(call: RecentCallEntity): CallIntakeEnvelopeSectionsVoiceV1 {
  const summaryText =
    call.ai_summary?.trim()
    ?? (call.ai_conversation_messages_json ? "Conversation transcript captured; see structured_capture." : "No AI summary available yet.");

  const { count } = parseMessageCount(call.ai_conversation_messages_json);

  return {
    "call_intake.summary": {
      text: summaryText,
      provider: call.provider,
      ai_summary: call.ai_summary,
      duration_seconds: call.duration_seconds,
      call_status: call.call_status,
      telnyx_conversation_id: call.telnyx_conversation_id,
    },
    "call_intake.intent": {
      coarse_intent: "voice_ai_intake",
      ai_sentiment: call.ai_sentiment,
      ai_status: call.ai_status,
      processing_status: call.processing_status,
    },
    "call_intake.structured_capture": {
      matched_lead_id: call.matched_lead_id,
      matched_client_id: call.matched_client_id,
      matched_client_display_name: call.matched_client_display_name,
      telnyx_ai_assistant_id: call.telnyx_ai_assistant_id,
      telnyx_conversation_id: call.telnyx_conversation_id,
      transcript_message_count: count,
      inbound_owned_phone_number_id: call.inbound_owned_phone_number_id,
      inbound_owned_phone_number_label: call.inbound_owned_phone_number_label,
    },
    "call_intake.handoff": {
      mode: "voice_ai_assistant_session",
      live_voice_session: true,
      ai_enriched_at: call.ai_enriched_at?.toISOString() ?? null,
      notes:
        "Phase 1.5B voice bridge — hybrid CRM outcome recorded in audit trace `hybrid_crm` (not a booking confirmation).",
    },
  };
}
