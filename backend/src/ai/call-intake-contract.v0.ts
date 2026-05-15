import { createHash } from "crypto";

import type { RecentCallEntity } from "../database/entities/recent-call.entity";
import {
  AI_INTAKE_NORMALIZER_VERSION,
  AI_INTAKE_TRACE_SCHEMA_VERSION,
  RESERVED_VOICE_INTAKE_AI_EVENT_KEYS,
} from "./ai.constants";

export type CallIntakeMinimalDigestInputV1 = {
  intake_trace_schema_version: typeof AI_INTAKE_TRACE_SCHEMA_VERSION;
  normalizer_version: typeof AI_INTAKE_NORMALIZER_VERSION;
  recent_call_id: string;
  provider: string;
  call_status: string;
  processing_status: string;
  duration_seconds: number | null;
  has_voicemail_recording: boolean;
  has_call_recording: boolean;
  transcript_present: boolean;
  transcript_sha256_hex: string | null;
  matched_lead_id: string | null;
  matched_client_id: string | null;
  selected_service_type: string | null;
  selected_ivr_digit: string | null;
  queue_callback_requested: boolean;
  /** Last 4 of normalized inbound caller when available — avoids storing full DID in audit digest baseline. */
  from_e164_suffix: string | null;
  /** Last 4 of normalized called number when available. */
  to_e164_suffix: string | null;
};

export type CallIntakeEnvelopeSectionsV0 = Record<(typeof RESERVED_VOICE_INTAKE_AI_EVENT_KEYS)[number], unknown>;

function lastFourDigits(normalized: string | null | undefined): string | null {
  if (!normalized?.trim()) {
    return null;
  }
  const digits = normalized.replace(/\D/g, "");
  if (digits.length === 0) {
    return null;
  }
  return digits.length <= 4 ? digits : digits.slice(-4);
}

function sha256Utf8Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function buildCallIntakeMinimalDigestInputV1(call: RecentCallEntity): CallIntakeMinimalDigestInputV1 {
  const transcription = call.voicemail_transcription?.trim() ?? "";
  const transcriptPresent = transcription.length > 0;
  return {
    intake_trace_schema_version: AI_INTAKE_TRACE_SCHEMA_VERSION,
    normalizer_version: AI_INTAKE_NORMALIZER_VERSION,
    recent_call_id: call.id,
    provider: call.provider,
    call_status: call.call_status,
    processing_status: call.processing_status,
    duration_seconds: call.duration_seconds,
    has_voicemail_recording: Boolean(call.voicemail_url?.trim() || call.provider_voicemail_recording_id?.trim()),
    has_call_recording: Boolean(call.recording_url?.trim() || call.provider_recording_id?.trim()),
    transcript_present: transcriptPresent,
    transcript_sha256_hex: transcriptPresent ? sha256Utf8Hex(transcription) : null,
    matched_lead_id: call.matched_lead_id,
    matched_client_id: call.matched_client_id,
    selected_service_type: call.selected_service_type,
    selected_ivr_digit: call.selected_ivr_digit,
    queue_callback_requested: call.queue_callback_requested,
    from_e164_suffix: lastFourDigits(call.from_number_normalized),
    to_e164_suffix: lastFourDigits(call.to_number_normalized),
  };
}

export function digestCallIntakeMinimalInputV1(minimal: CallIntakeMinimalDigestInputV1): string {
  return sha256Utf8Hex(JSON.stringify(minimal));
}

export function serializedCallIntakeAuditPayloadByteLength(
  minimal: CallIntakeMinimalDigestInputV1,
  sections: CallIntakeEnvelopeSectionsV0,
): number {
  return Buffer.byteLength(JSON.stringify({ minimal, sections }), "utf8");
}

function coarseIntentFromCallStatus(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "answered" || s === "completed") {
    return "answered";
  }
  if (s === "missed") {
    return "missed";
  }
  if (s === "voicemail") {
    return "voicemail";
  }
  return "other";
}

export function buildCallIntakeEnvelopeSectionsV0(call: RecentCallEntity): CallIntakeEnvelopeSectionsV0 {
  const duration = call.duration_seconds;
  const durationLabel = typeof duration === "number" && Number.isFinite(duration) ? `${duration}s` : "unknown duration";
  const vm = Boolean(call.voicemail_url?.trim() || call.provider_voicemail_recording_id?.trim());
  const summaryText = `Call status ${call.call_status}, ${durationLabel}, voicemail artifact: ${vm ? "yes" : "no"}.`;

  return {
    "call_intake.summary": {
      text: summaryText,
      provider: call.provider,
      call_status: call.call_status,
      duration_seconds: call.duration_seconds,
    },
    "call_intake.intent": {
      coarse_intent: coarseIntentFromCallStatus(call.call_status),
      source: call.source,
      processing_status: call.processing_status,
    },
    "call_intake.structured_capture": {
      matched_lead_id: call.matched_lead_id,
      matched_client_id: call.matched_client_id,
      matched_client_display_name: call.matched_client_display_name,
      selected_service_type: call.selected_service_type,
      selected_ivr_digit: call.selected_ivr_digit,
      queue_callback_requested: call.queue_callback_requested,
      transcript_present: Boolean(call.voicemail_transcription?.trim()),
      inbound_owned_phone_number_label: call.inbound_owned_phone_number_label,
    },
    "call_intake.handoff": {
      mode: "persisted_call_record",
      live_voice_session: false,
      notes: "Phase 1.5A contract only — no realtime handoff or pilot session.",
    },
  };
}
