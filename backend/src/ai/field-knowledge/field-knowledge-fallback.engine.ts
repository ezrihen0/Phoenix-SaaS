import type { FallbackReason } from "./field-knowledge-runtime.types";

const FALLBACK_MESSAGES: Record<FallbackReason, string> = {
  no_approved_pack:
    "I do not have approved field knowledge loaded for this request yet. Our team can follow up with verified guidance.",
  unsupported_jurisdiction:
    "I do not have verified jurisdiction guidance for that location yet. Our team can follow up with confirmed information.",
  blocked_surface:
    "This type of guidance is not available on this surface. Please use an internal professional workspace or contact the office for help.",
  insufficient_role:
    "This guidance requires a higher workspace role. Please escalate to a qualified team member.",
  high_risk:
    "This looks like a high-risk situation. I cannot provide repair or troubleshooting guidance here. Please escalate for human review.",
  emergency:
    "If you smell gas or have a CO alarm, leave the area and call your gas utility or 911. I am marking this urgent for our team.",
  voice_repair_request:
    "I can't walk through repairs over the phone. I can take your details for a technician to visit safely.",
  voice_disabled:
    "Phone voice guidance is not enabled in this environment. Please contact the office for assistance.",
  manufacturer_specific:
    "That depends on your exact model. I'll note it for the technician to confirm on site.",
  low_trade_confidence:
    "I want to make sure we schedule the right service. Which best describes your issue—chimney, gas fireplace, garage door, or doors and windows?",
  low_risk_confidence:
    "I want a technician to review this safely. I'll have our team call you back shortly.",
  regulated_claim_without_pack:
    "I can't give a definite permit, code, or manufacturer answer without verified approved guidance for this request.",
  domain_disabled: "Field Copilot is disabled for this trade in this environment.",
  surface_disabled: "Field Copilot is disabled for this surface in this environment.",
  kill_switch: "Field Copilot is disabled in this environment.",
};

/** Voice-safe responses: 1–3 short sentences, no markdown. */
function toVoiceSafe(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  return sentences.slice(0, 3).join(" ");
}

export function buildFallbackMessage(
  reason: FallbackReason,
  options: { voiceSafe?: boolean } = {},
): string {
  const raw = FALLBACK_MESSAGES[reason];
  return options.voiceSafe ? toVoiceSafe(raw) : raw;
}

export function buildFallbackRefusalReason(reason: FallbackReason): string {
  return `runtime_safety:${reason}`;
}
