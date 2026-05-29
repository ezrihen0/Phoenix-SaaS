import type { ProfileRole } from "../../crm/constants";
import type { FieldKnowledgeDomain, FieldKnowledgeSelectionKey } from "./field-knowledge.constants";
import { selectAlbertaV1KnowledgePacks } from "./field-knowledge-jurisdiction-selector";
import { detectFieldKnowledgeTopics } from "./field-knowledge-topic-detector";
import {
  buildFallbackMessage,
  buildFallbackRefusalReason,
} from "./field-knowledge-fallback.engine";
import { isPackAllowedForRuntime } from "./field-knowledge-pack-gates";
import {
  RESTRICTED_RUNTIME_SURFACES,
  RISK_CONFIDENCE_THRESHOLD,
  TRADE_CONFIDENCE_THRESHOLD,
} from "./field-knowledge-runtime.constants";
import {
  isManufacturerSpecificRequest,
  resolveRuntimeContext,
} from "./field-knowledge-runtime-resolver";
import type {
  FallbackReason,
  FieldKnowledgeRuntimeContext,
  RuntimeGateEvaluation,
  RuntimeSurface,
} from "./field-knowledge-runtime.types";

export type RuntimeKillSwitchState = {
  domainDisabled: boolean;
  surfaceDisabled: boolean;
  voiceEnabled: boolean;
  disabledSurfaces?: string[];
};

function voiceSafe(context: FieldKnowledgeRuntimeContext): boolean {
  return context.runtime_surface === "ai_voice_phone";
}

function fallbackEvaluation(
  context: FieldKnowledgeRuntimeContext,
  reason: FallbackReason,
): RuntimeGateEvaluation {
  return {
    gate_outcome: reason === "insufficient_role" ? "refused" : "fallback",
    fallback_reason: reason,
    refusal_reason: buildFallbackRefusalReason(reason),
    fallback_message: buildFallbackMessage(reason, { voiceSafe: voiceSafe(context) }),
    skip_llm: true,
    allowed_pack_keys: null,
    context,
  };
}

function listCandidatePackKeys(
  domain: FieldKnowledgeDomain,
  userMessage: string,
  serviceCity?: string | null,
): FieldKnowledgeSelectionKey[] {
  const topics = detectFieldKnowledgeTopics(domain, userMessage);
  const jurisdiction = selectAlbertaV1KnowledgePacks({ domain, userMessage, serviceCity });
  return [...jurisdiction.jurisdictionPacks, ...topics.topics];
}

export function filterPackKeysForRuntime(input: {
  packKeys: FieldKnowledgeSelectionKey[];
  context: FieldKnowledgeRuntimeContext;
  userRole: ProfileRole;
}): FieldKnowledgeSelectionKey[] {
  if (RESTRICTED_RUNTIME_SURFACES.has(input.context.runtime_surface)) {
    return [];
  }

  return input.packKeys.filter((key) =>
    isPackAllowedForRuntime({
      selectionKey: key,
      runtimeSurface: input.context.runtime_surface,
      userRole: input.userRole,
      professionalContext: input.context.professional_context,
    }),
  );
}

export function evaluateRuntimeGates(input: {
  domain: FieldKnowledgeDomain;
  userMessage: string;
  userRole: ProfileRole;
  organizationId: string | null;
  serviceCity?: string | null;
  requestedSurface?: string | null;
  killSwitches?: RuntimeKillSwitchState;
  tradeConfidenceOverride?: number;
  riskConfidenceOverride?: number;
  emergencyFlagOverride?: boolean;
}): RuntimeGateEvaluation {
  const killSwitches = input.killSwitches ?? {
    domainDisabled: false,
    surfaceDisabled: false,
    voiceEnabled: false,
  };

  const context = resolveRuntimeContext({
    domain: input.domain,
    userMessage: input.userMessage,
    userRole: input.userRole,
    organizationId: input.organizationId,
    requestedSurface: input.requestedSurface,
    tradeConfidenceOverride: input.tradeConfidenceOverride,
    riskConfidenceOverride: input.riskConfidenceOverride,
    emergencyFlagOverride: input.emergencyFlagOverride,
  });

  if (killSwitches.domainDisabled) {
    return fallbackEvaluation(context, "domain_disabled");
  }

  if (killSwitches.surfaceDisabled) {
    return fallbackEvaluation(context, "surface_disabled");
  }

  const disabledSurfaces = killSwitches.disabledSurfaces ?? [];
  if (disabledSurfaces.includes(context.runtime_surface)) {
    return fallbackEvaluation(context, "surface_disabled");
  }

  if (context.runtime_surface === "ai_voice_phone" && !killSwitches.voiceEnabled) {
    return fallbackEvaluation(context, "voice_disabled");
  }

  if (context.emergency_flag) {
    return fallbackEvaluation(context, "emergency");
  }

  if (context.trade_confidence < TRADE_CONFIDENCE_THRESHOLD) {
    return fallbackEvaluation(context, "low_trade_confidence");
  }

  const isSafetyRisk = context.risk_level === "high" || context.risk_level === "critical";
  if (isSafetyRisk && context.risk_confidence < RISK_CONFIDENCE_THRESHOLD) {
    return fallbackEvaluation(context, "low_risk_confidence");
  }

  if (context.runtime_surface === "ai_voice_phone" && context.repair_guidance_requested) {
    return fallbackEvaluation(context, "voice_repair_request");
  }

  if (
    (context.runtime_surface === "customer_portal" || context.runtime_surface === "public_site")
    && context.repair_guidance_requested
  ) {
    return fallbackEvaluation(context, "blocked_surface");
  }

  if (isManufacturerSpecificRequest(input.userMessage)) {
    const candidateKeys = listCandidatePackKeys(input.domain, input.userMessage, input.serviceCity);
    const allowed = filterPackKeysForRuntime({
      packKeys: candidateKeys,
      context,
      userRole: input.userRole,
    });
    if (allowed.length === 0) {
      return fallbackEvaluation(context, "manufacturer_specific");
    }
  }

  const jurisdiction = selectAlbertaV1KnowledgePacks({
    domain: input.domain,
    userMessage: input.userMessage,
    serviceCity: input.serviceCity,
  });

  if (jurisdiction.jurisdictionNotice != null) {
    return fallbackEvaluation(context, "unsupported_jurisdiction");
  }

  const candidateKeys = listCandidatePackKeys(input.domain, input.userMessage, input.serviceCity);
  const allowedPackKeys = filterPackKeysForRuntime({
    packKeys: candidateKeys,
    context,
    userRole: input.userRole,
  });

  if (RESTRICTED_RUNTIME_SURFACES.has(context.runtime_surface)) {
    return fallbackEvaluation(context, "blocked_surface");
  }

  if (allowedPackKeys.length === 0) {
    return fallbackEvaluation(context, "no_approved_pack");
  }

  if (context.regulated_claim_requested) {
    const hasPermitOrJurisdictionPack = allowedPackKeys.some((key) =>
      key.includes("permit") || key.includes("gas") || key === "canada_alberta_gas",
    );
    if (!hasPermitOrJurisdictionPack) {
      return fallbackEvaluation(context, "regulated_claim_without_pack");
    }
  }

  if (isSafetyRisk && context.repair_guidance_requested) {
    return fallbackEvaluation(context, "high_risk");
  }

  return {
    gate_outcome: "allowed",
    fallback_reason: null,
    refusal_reason: null,
    fallback_message: null,
    skip_llm: false,
    allowed_pack_keys: allowedPackKeys,
    context,
  };
}
