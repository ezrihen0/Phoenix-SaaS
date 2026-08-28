import type { ProfileRole } from "../../crm/constants";
import type { FieldKnowledgeDomain } from "./field-knowledge.constants";
import {
  DOMAIN_TO_TRADE,
  EMERGENCY_KEYWORD_PATTERNS,
  HIGH_RISK_KEYWORD_PATTERNS,
  MANUFACTURER_SPECIFIC_PATTERNS,
  REGULATED_CLAIM_KEYWORD_PATTERNS,
  REPAIR_GUIDANCE_KEYWORD_PATTERNS,
  RESTRICTED_RUNTIME_SURFACES,
  ROLE_DEFAULT_RUNTIME_SURFACE,
  ROLE_MAX_RUNTIME_SURFACE,
  RUNTIME_SURFACE_RANK,
  TRADE_CONFIDENCE_THRESHOLD,
} from "./field-knowledge-runtime.constants";
import type {
  FieldKnowledgeRuntimeContext,
  RuntimeSurface,
  RuntimeTrade,
} from "./field-knowledge-runtime.types";
import { RUNTIME_SURFACES } from "./field-knowledge-runtime.types";

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function parseRuntimeSurface(value: string | undefined): RuntimeSurface | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim() as RuntimeSurface;
  return (RUNTIME_SURFACES as readonly string[]).includes(normalized) ? normalized : null;
}

/**
 * Resolve effective surface — never elevates privilege above role maximum.
 * Restricted surfaces cannot escalate to professional surfaces.
 */
export function resolveEffectiveRuntimeSurface(input: {
  userRole: ProfileRole;
  requestedSurface?: string | null;
}): RuntimeSurface {
  const roleDefault = ROLE_DEFAULT_RUNTIME_SURFACE[input.userRole];
  const roleMax = ROLE_MAX_RUNTIME_SURFACE[input.userRole];
  const requested = parseRuntimeSurface(input.requestedSurface ?? undefined);

  if (!requested) {
    return roleDefault;
  }

  if (RESTRICTED_RUNTIME_SURFACES.has(requested)) {
    return requested;
  }

  if (RUNTIME_SURFACE_RANK[requested] > RUNTIME_SURFACE_RANK[roleMax]) {
    return roleMax;
  }

  return requested;
}

function inferTradeConfidence(trade: RuntimeTrade, message: string): number {
  const text = message.toLowerCase();
  const signals: Partial<Record<RuntimeTrade, RegExp[]>> = {
    "gas-fireplace": [/\bgas fireplace\b/, /\bpilot\b/, /\bburner\b/],
    "doors-windows": [/\bwindow\b/, /\bdoor\b/, /\bdraft\b/, /\bweatherstrip\b/],
    chimney: [/\bchimney\b/, /\bflue\b/, /\bcreosote\b/],
    "garage-door": [/\bgarage door\b/, /\bopener\b/, /\bspring\b/],
  };

  const matched = Object.entries(signals).filter(([, patterns]) =>
    patterns!.some((p) => p.test(text)),
  );

  if (matched.length === 0) {
    return trade === "unknown" ? 0.5 : 0.85;
  }
  if (matched.length > 1) {
    return 0.55;
  }
  const [detected] = matched;
  return detected![0] === trade ? 0.92 : 0.45;
}

function inferRisk(message: string): { level: FieldKnowledgeRuntimeContext["risk_level"]; confidence: number } {
  if (matchesAny(message, EMERGENCY_KEYWORD_PATTERNS)) {
    return { level: "critical", confidence: 0.98 };
  }
  if (matchesAny(message, HIGH_RISK_KEYWORD_PATTERNS)) {
    return { level: "high", confidence: 0.88 };
  }
  if (matchesAny(message, REGULATED_CLAIM_KEYWORD_PATTERNS)) {
    return { level: "medium", confidence: 0.85 };
  }
  return { level: "low", confidence: 0.95 };
}

export function resolveRuntimeContext(input: {
  domain: FieldKnowledgeDomain;
  userMessage: string;
  userRole: ProfileRole;
  organizationId: string | null;
  requestedSurface?: string | null;
  tradeConfidenceOverride?: number;
  riskConfidenceOverride?: number;
  emergencyFlagOverride?: boolean;
}): FieldKnowledgeRuntimeContext {
  const trade = DOMAIN_TO_TRADE[input.domain];
  const runtime_surface = resolveEffectiveRuntimeSurface({
    userRole: input.userRole,
    requestedSurface: input.requestedSurface,
  });
  const professional_context = input.organizationId != null && input.organizationId.trim() !== "";

  const trade_confidence = input.tradeConfidenceOverride ?? inferTradeConfidence(trade, input.userMessage);
  const risk = inferRisk(input.userMessage);
  const risk_confidence = input.riskConfidenceOverride ?? risk.confidence;
  const emergency_flag = input.emergencyFlagOverride ?? matchesAny(input.userMessage, EMERGENCY_KEYWORD_PATTERNS);

  const regulated_claim_requested = matchesAny(input.userMessage, REGULATED_CLAIM_KEYWORD_PATTERNS);
  const repair_guidance_requested = matchesAny(input.userMessage, REPAIR_GUIDANCE_KEYWORD_PATTERNS)
    || (runtime_surface === "ai_voice_phone" && /\bhow (?:do|can|to)\b/i.test(input.userMessage));

  let booking_eligibility = !emergency_flag
    && trade_confidence >= TRADE_CONFIDENCE_THRESHOLD
    && !repair_guidance_requested;

  if (risk.level === "high" || risk.level === "critical") {
    booking_eligibility = false;
  }

  const lead_capture_only = emergency_flag
    || trade_confidence < TRADE_CONFIDENCE_THRESHOLD
    || risk_confidence < 0.9 && (risk.level === "high" || risk.level === "critical");

  return {
    trade,
    trade_confidence,
    country: null,
    province_or_state: null,
    city_or_ahj: null,
    runtime_surface,
    user_role: input.userRole,
    professional_context,
    risk_level: emergency_flag ? "critical" : risk.level,
    risk_confidence,
    emergency_flag,
    booking_eligibility,
    lead_capture_only,
    booking_outcome: booking_eligibility ? "none" : lead_capture_only ? "lead_capture" : "none",
    regulated_claim_requested,
    repair_guidance_requested,
  };
}

export function isManufacturerSpecificRequest(message: string): boolean {
  return matchesAny(message, MANUFACTURER_SPECIFIC_PATTERNS);
}
