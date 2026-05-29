/**
 * Runtime safety foundation unit checks (no DB, no LLM).
 * Run: npm run field-knowledge:runtime-safety-check --workspace backend
 */
import assert from "node:assert/strict";

import {
  FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE,
} from "./field-knowledge.constants";
import { assertRuntimeKnowledgePathAllowed } from "./field-knowledge-path-guard";
import { evaluateRuntimeGates } from "./field-knowledge-runtime-gate.engine";
import { resolveEffectiveRuntimeSurface } from "./field-knowledge-runtime-resolver";
import { selectAlbertaV1KnowledgePacks } from "./field-knowledge-jurisdiction-selector";

function gate(input: Partial<Parameters<typeof evaluateRuntimeGates>[0]> & {
  userMessage: string;
}) {
  return evaluateRuntimeGates({
    domain: FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE,
    userRole: "technician",
    organizationId: "org-test",
    killSwitches: { domainDisabled: false, surfaceDisabled: false, voiceEnabled: true },
    ...input,
  });
}

// 1. Candidate path blocked
assert.equal(
  assertRuntimeKnowledgePathAllowed("_candidate-updates/doors-windows/candidate-index-v1.md").ok,
  false,
);

// 2. Protocol path blocked
assert.equal(
  assertRuntimeKnowledgePathAllowed("_protocols/general-trade-research-protocol.md").ok,
  false,
);

// 3. Runtime planning doc blocked
assert.equal(
  assertRuntimeKnowledgePathAllowed("runtime/field-copilot-runtime-safety-and-voice-plan-v1.md").ok,
  false,
);

// Legitimate approved pack path must NOT be blocked by substring rules
assert.equal(
  assertRuntimeKnowledgePathAllowed(
    "trades/doors-windows/canada/alberta/doors-windows-photo-intake-safety-v1.md",
  ).ok,
  true,
);

// 4. Unknown jurisdiction returns safe fallback
const unknownJurisdiction = gate({
  userMessage: "Gas fireplace permit requirements in Denver, Colorado",
});
assert.equal(unknownJurisdiction.gate_outcome, "fallback");
assert.equal(unknownJurisdiction.fallback_reason, "unsupported_jurisdiction");
assert.equal(unknownJurisdiction.skip_llm, true);

// 5. Customer portal blocks professional guidance
const customerPortal = gate({
  userMessage: "What should I inspect first on a gas fireplace in Alberta?",
  requestedSurface: "customer_portal",
});
assert.equal(customerPortal.gate_outcome, "fallback");
assert.equal(customerPortal.fallback_reason, "blocked_surface");
assert.equal(customerPortal.skip_llm, true);

// 6. Public site blocks professional guidance
const publicSite = gate({
  userMessage: "What should I inspect first on a gas fireplace in Alberta?",
  requestedSurface: "public_site",
});
assert.equal(publicSite.gate_outcome, "fallback");
assert.equal(publicSite.fallback_reason, "blocked_surface");

// 7. ai_voice_phone blocks repair steps
const voiceRepair = gate({
  userMessage: "How do I fix my gas fireplace pilot step by step?",
  requestedSurface: "ai_voice_phone",
});
assert.equal(voiceRepair.gate_outcome, "fallback");
assert.equal(voiceRepair.fallback_reason, "voice_repair_request");
assert.equal(voiceRepair.skip_llm, true);

// 8. emergency_flag=true blocks booking/troubleshooting/normal answer
const emergency = gate({
  userMessage: "Routine annual service for gas fireplace in Alberta",
  emergencyFlagOverride: true,
});
assert.equal(emergency.context.emergency_flag, true);
assert.equal(emergency.context.booking_eligibility, false);
assert.equal(emergency.gate_outcome, "fallback");
assert.equal(emergency.fallback_reason, "emergency");
assert.equal(emergency.skip_llm, true);

for (const message of [
  "A broken spring flew off from the garage door.",
  "Cable snapped on the garage door.",
  "The garage door is hanging off-track.",
  "Broken glass with security exposure.",
]) {
  const detectedEmergency = gate({
    userMessage: message,
    requestedSurface: "ai_voice_phone",
    tradeConfidenceOverride: 0.92,
  });
  assert.equal(detectedEmergency.context.emergency_flag, true, message);
  assert.equal(detectedEmergency.context.booking_eligibility, false, message);
  assert.equal(detectedEmergency.gate_outcome, "fallback", message);
  assert.equal(detectedEmergency.fallback_reason, "emergency", message);
  assert.equal(detectedEmergency.skip_llm, true, message);
}

// 9. trade_confidence < 0.80 triggers clarification / no confirmed appointment
const lowTrade = gate({
  userMessage: "Need help with something in Alberta",
  tradeConfidenceOverride: 0.5,
});
assert.equal(lowTrade.gate_outcome, "fallback");
assert.equal(lowTrade.fallback_reason, "low_trade_confidence");
assert.equal(lowTrade.context.booking_eligibility, false);

// 10. risk_confidence < 0.90 on safety issue triggers human review / no booking
const lowRisk = gate({
  userMessage: "There is a combustion concern on the gas fireplace",
  tradeConfidenceOverride: 0.92,
  riskConfidenceOverride: 0.5,
});
assert.equal(lowRisk.gate_outcome, "fallback");
assert.equal(lowRisk.fallback_reason, "low_risk_confidence");
assert.equal(lowRisk.context.booking_eligibility, false);

// 11. No code/permit/AHJ/manufacturer claim without approved pack
const regulatedNoPack = gate({
  userMessage: "What building code clearance applies in Boston Massachusetts for gas fireplace?",
});
assert.equal(regulatedNoPack.gate_outcome, "fallback");
assert.ok(
  regulatedNoPack.fallback_reason === "unsupported_jurisdiction"
    || regulatedNoPack.fallback_reason === "regulated_claim_without_pack",
);

// 12. Existing gas-fireplace Alberta behavior still works (regression)
assert.deepEqual(
  selectAlbertaV1KnowledgePacks({
    domain: FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE,
    userMessage: "What should I check on a gas fireplace service in Alberta?",
  }).jurisdictionPacks,
  ["canada_alberta_gas_fireplace_basics", "canada_alberta_gas"],
);

const albertaAllowed = gate({
  userMessage: "What should I check on a gas fireplace service in Alberta?",
  userRole: "technician",
});
assert.equal(albertaAllowed.gate_outcome, "allowed");
assert.ok(albertaAllowed.allowed_pack_keys != null && albertaAllowed.allowed_pack_keys.length > 0);

// Privilege elevation blocked: dispatcher cannot request technician_mobile
assert.equal(
  resolveEffectiveRuntimeSurface({ userRole: "dispatcher", requestedSurface: "technician_mobile" }),
  "dispatcher_workspace",
);

// Voice hard-disabled when env flag off
const voiceDisabled = evaluateRuntimeGates({
  domain: FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE,
  userMessage: "Schedule a gas fireplace visit in Alberta",
  userRole: "dispatcher",
  organizationId: "org-test",
  requestedSurface: "ai_voice_phone",
  killSwitches: { domainDisabled: false, surfaceDisabled: false, voiceEnabled: false },
});
assert.equal(voiceDisabled.gate_outcome, "fallback");
assert.equal(voiceDisabled.fallback_reason, "voice_disabled");

console.log("field-knowledge-runtime-safety-check: ok");
