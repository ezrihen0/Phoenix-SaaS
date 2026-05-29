/**
 * Field knowledge topic detection + jurisdiction selection (no DB, no LLM).
 * Run: npm run field-knowledge:unit-check --workspace backend
 */
import assert from "node:assert/strict";

import {
  FIELD_KNOWLEDGE_DOMAIN_DOORS_WINDOWS,
  FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE,
} from "./field-knowledge.constants";
import { selectAlbertaV1KnowledgePacks } from "./field-knowledge-jurisdiction-selector";
import { detectFieldKnowledgeTopics } from "./field-knowledge-topic-detector";

function gasTopics(message: string) {
  return detectFieldKnowledgeTopics(FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE, message).topics;
}

function includesAllGas(message: string, expected: string[]) {
  const selected = gasTopics(message);
  for (const topic of expected) {
    assert.ok(selected.includes(topic as never), `expected ${topic} in [${selected.join(", ")}] for: ${message}`);
  }
}

function gasAlbertaPacks(message: string, serviceCity?: string | null) {
  return selectAlbertaV1KnowledgePacks({
    domain: FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE,
    userMessage: message,
    serviceCity,
  });
}

function doorsAlbertaPacks(message: string, serviceCity?: string | null) {
  return selectAlbertaV1KnowledgePacks({
    domain: FIELD_KNOWLEDGE_DOMAIN_DOORS_WINDOWS,
    userMessage: message,
    serviceCity,
  });
}

// --- Legacy gas topic detection ---
includesAllGas("I'm servicing a gas fireplace, what should I check first?", [
  "safety_first",
  "customer_interview",
  "visual_inspection",
]);

includesAllGas("The glass is black, what does it mean?", [
  "common_problems",
  "safety_first",
  "report_wording",
]);

includesAllGas("Can I promise the customer it is safe now?", [
  "safety_first",
  "manufacturer_manual_rule",
]);

includesAllGas("What can I sell during a basic service?", [
  "maintenance_sales",
  "field_sales_playbook",
]);

includesAllGas("Give me exact vent clearance.", ["venting_basics", "manufacturer_manual_rule"]);
includesAllGas("How do I adjust gas pressure?", ["safety_first", "manufacturer_manual_rule"]);
includesAllGas("Write a report note for soot on glass.", ["report_wording"]);

// --- Alberta V1 gas jurisdiction selection ---
assert.deepEqual(
  gasAlbertaPacks("What should I check on a gas fireplace service in Alberta?").jurisdictionPacks,
  ["canada_alberta_gas_fireplace_basics", "canada_alberta_gas"],
);

assert.deepEqual(
  gasAlbertaPacks("Does Calgary require a permit for gas fireplace installation?").jurisdictionPacks,
  [
    "canada_alberta_gas_fireplace_basics",
    "canada_alberta_gas",
    "canada_alberta_calgary_gas_fireplace_permits",
  ],
);

assert.deepEqual(
  gasAlbertaPacks("Does Edmonton require a permit for gas fireplace work?").jurisdictionPacks,
  [
    "canada_alberta_gas_fireplace_basics",
    "canada_alberta_gas",
    "canada_alberta_edmonton_gas_fireplace_permits",
  ],
);

assert.deepEqual(
  gasAlbertaPacks("Is Calgary the same as Edmonton for permits?").jurisdictionPacks,
  [
    "canada_alberta_gas_fireplace_basics",
    "canada_alberta_gas",
    "canada_alberta_calgary_gas_fireplace_permits",
    "canada_alberta_edmonton_gas_fireplace_permits",
  ],
);

assert.equal(
  gasAlbertaPacks("Gas fireplace permit requirements in Denver, Colorado").jurisdictionNotice,
  "I do not have verified jurisdiction guidance for that location yet.",
);
assert.deepEqual(gasAlbertaPacks("Gas fireplace permit in Denver, Colorado").jurisdictionPacks, []);
assert.deepEqual(gasAlbertaPacks("Servicing a fireplace", null).jurisdictionPacks, []);

assert.deepEqual(
  gasAlbertaPacks("Need a permit", "Calgary").jurisdictionPacks,
  [
    "canada_alberta_gas_fireplace_basics",
    "canada_alberta_gas",
    "canada_alberta_calgary_gas_fireplace_permits",
  ],
);

// --- Doors & Windows topic behavior ---
assert.deepEqual(
  detectFieldKnowledgeTopics(FIELD_KNOWLEDGE_DOMAIN_DOORS_WINDOWS, "Front door rubs and drafts").topics,
  [],
);

// --- Doors & Windows Alberta V0.1 strict jurisdiction gating ---
assert.deepEqual(
  doorsAlbertaPacks("Need doors and windows help in Alberta").jurisdictionPacks,
  [
    "ca_ab_doors_windows_trade_map_basics_v1",
    "ca_ab_doors_windows_residential_diagnostics_basics_v1",
    "ca_ab_doors_windows_dispatcher_triage_basics_v1",
    "ca_ab_doors_windows_report_wording_basics_v1",
    "ca_ab_doors_windows_photo_intake_safety_v1",
    "ca_ab_windows_screen_service_basics_v1",
    "ca_ab_doors_windows_service_opportunity_basics_v1",
  ],
);

assert.deepEqual(
  doorsAlbertaPacks("Need intake help", "Calgary").jurisdictionPacks,
  [
    "ca_ab_doors_windows_trade_map_basics_v1",
    "ca_ab_doors_windows_residential_diagnostics_basics_v1",
    "ca_ab_doors_windows_dispatcher_triage_basics_v1",
    "ca_ab_doors_windows_report_wording_basics_v1",
    "ca_ab_doors_windows_photo_intake_safety_v1",
    "ca_ab_windows_screen_service_basics_v1",
    "ca_ab_doors_windows_service_opportunity_basics_v1",
  ],
);

assert.equal(
  doorsAlbertaPacks("Window replacement in Denver, Colorado").jurisdictionNotice,
  "I do not have verified jurisdiction guidance for that location yet.",
);
assert.deepEqual(doorsAlbertaPacks("Window replacement in Denver, Colorado").jurisdictionPacks, []);

const doorsNoAlberta = doorsAlbertaPacks("Need help with a sticking front door");
assert.equal(doorsNoAlberta.jurisdictionNotice, null);
assert.deepEqual(doorsNoAlberta.jurisdictionPacks, []);

console.log("field-knowledge-unit-check: ok");
