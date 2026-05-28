/**
 * Field knowledge topic detection + jurisdiction selection (no DB, no LLM).
 * Run: npm run field-knowledge:unit-check --workspace backend
 */
import assert from "node:assert/strict";

import { FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE } from "./field-knowledge.constants";
import { selectAlbertaV1KnowledgePacks } from "./field-knowledge-jurisdiction-selector";
import { detectFieldKnowledgeTopics } from "./field-knowledge-topic-detector";

function topics(message: string) {
  return detectFieldKnowledgeTopics(FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE, message).topics;
}

function includesAll(message: string, expected: string[]) {
  const selected = topics(message);
  for (const topic of expected) {
    assert.ok(selected.includes(topic as never), `expected ${topic} in [${selected.join(", ")}] for: ${message}`);
  }
}

function albertaPacks(message: string, serviceCity?: string | null) {
  return selectAlbertaV1KnowledgePacks({
    domain: FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE,
    userMessage: message,
    serviceCity,
  });
}

// --- Legacy topic detection ---

includesAll("I'm servicing a gas fireplace, what should I check first?", [
  "safety_first",
  "customer_interview",
  "visual_inspection",
]);

includesAll("The glass is black, what does it mean?", [
  "common_problems",
  "safety_first",
  "report_wording",
]);

includesAll("Can I promise the customer it is safe now?", [
  "safety_first",
  "manufacturer_manual_rule",
]);

includesAll("What can I sell during a basic service?", [
  "maintenance_sales",
  "field_sales_playbook",
]);

includesAll("Give me exact vent clearance.", ["venting_basics", "manufacturer_manual_rule"]);

includesAll("How do I adjust gas pressure?", ["safety_first", "manufacturer_manual_rule"]);

includesAll("Write a report note for soot on glass.", ["report_wording"]);

// --- Alberta V1 jurisdiction selection ---

assert.deepEqual(
  albertaPacks("What should I check on a gas fireplace service in Alberta?").jurisdictionPacks,
  ["canada_alberta_gas_fireplace_basics", "canada_alberta_gas"],
);

assert.deepEqual(
  albertaPacks("Does Calgary require a permit for gas fireplace installation?").jurisdictionPacks,
  [
    "canada_alberta_gas_fireplace_basics",
    "canada_alberta_gas",
    "canada_alberta_calgary_gas_fireplace_permits",
  ],
);

assert.deepEqual(
  albertaPacks("Does Edmonton require a permit for gas fireplace work?").jurisdictionPacks,
  [
    "canada_alberta_gas_fireplace_basics",
    "canada_alberta_gas",
    "canada_alberta_edmonton_gas_fireplace_permits",
  ],
);

assert.deepEqual(
  albertaPacks("Is Calgary the same as Edmonton for permits?").jurisdictionPacks,
  [
    "canada_alberta_gas_fireplace_basics",
    "canada_alberta_gas",
    "canada_alberta_calgary_gas_fireplace_permits",
    "canada_alberta_edmonton_gas_fireplace_permits",
  ],
);

assert.equal(
  albertaPacks("Gas fireplace permit requirements in Denver, Colorado").jurisdictionNotice,
  "I do not have verified jurisdiction guidance for that location yet.",
);
assert.deepEqual(albertaPacks("Gas fireplace permit in Denver, Colorado").jurisdictionPacks, []);

assert.deepEqual(albertaPacks("Servicing a fireplace", null).jurisdictionPacks, []);

assert.deepEqual(
  albertaPacks("Need a permit", "Calgary").jurisdictionPacks,
  [
    "canada_alberta_gas_fireplace_basics",
    "canada_alberta_gas",
    "canada_alberta_calgary_gas_fireplace_permits",
  ],
);

console.log("field-knowledge-unit-check: ok");
