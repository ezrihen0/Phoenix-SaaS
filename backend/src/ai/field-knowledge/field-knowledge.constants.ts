/** Approved V1 field knowledge domains. */
export const FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE = "gas_fireplace";

export const FIELD_KNOWLEDGE_APPROVED_DOMAINS = [FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE] as const;

export type FieldKnowledgeDomain = (typeof FIELD_KNOWLEDGE_APPROVED_DOMAINS)[number];

/** Approved topic keys for gas_fireplace domain (legacy flat packs). */
export const GAS_FIREPLACE_TOPIC_KEYS = [
  "safety_first",
  "customer_interview",
  "visual_inspection",
  "common_problems",
  "venting_basics",
  "manufacturer_manual_rule",
  "maintenance_sales",
  "repair_upgrade",
  "report_wording",
  "field_sales_playbook",
] as const;

export type GasFireplaceTopicKey = (typeof GAS_FIREPLACE_TOPIC_KEYS)[number];

/** Relative paths under `docs/field-knowledge/` — legacy allowlist only. */
export const GAS_FIREPLACE_TOPIC_FILES: Record<GasFireplaceTopicKey, string> = {
  safety_first: "gas-fireplace/gas-fireplace-safety-first-v1.md",
  customer_interview: "gas-fireplace/gas-fireplace-customer-interview-v1.md",
  visual_inspection: "gas-fireplace/gas-fireplace-visual-inspection-v1.md",
  common_problems: "gas-fireplace/gas-fireplace-common-problems-v1.md",
  venting_basics: "gas-fireplace/gas-fireplace-venting-basics-v1.md",
  manufacturer_manual_rule: "gas-fireplace/gas-fireplace-manufacturer-manual-rule-v1.md",
  maintenance_sales: "gas-fireplace/gas-fireplace-maintenance-sales-v1.md",
  repair_upgrade: "gas-fireplace/gas-fireplace-repair-upgrade-v1.md",
  report_wording: "gas-fireplace/gas-fireplace-report-wording-v1.md",
  field_sales_playbook: "gas-fireplace/gas-fireplace-field-sales-playbook-v1.md",
};

/** Alberta V1 jurisdiction/trade packs (manifest `alberta_v1_seeded`). */
export const ALBERTA_V1_KNOWLEDGE_KEYS = [
  "canada_alberta_gas_fireplace_basics",
  "canada_alberta_gas",
  "canada_alberta_calgary_gas_fireplace_permits",
  "canada_alberta_edmonton_gas_fireplace_permits",
] as const;

export type AlbertaV1KnowledgeKey = (typeof ALBERTA_V1_KNOWLEDGE_KEYS)[number];

export const ALBERTA_V1_KNOWLEDGE_FILES: Record<AlbertaV1KnowledgeKey, string> = {
  canada_alberta_gas_fireplace_basics:
    "trades/gas-fireplace/canada/alberta/canada-alberta-gas-fireplace-basics-v1.md",
  canada_alberta_gas: "jurisdictions/canada/alberta/canada-alberta-gas-v1.md",
  canada_alberta_calgary_gas_fireplace_permits:
    "jurisdictions/canada/alberta/canada-alberta-calgary-gas-fireplace-permits-v1.md",
  canada_alberta_edmonton_gas_fireplace_permits:
    "jurisdictions/canada/alberta/canada-alberta-edmonton-gas-fireplace-permits-v1.md",
};

export type FieldKnowledgeSelectionKey = GasFireplaceTopicKey | AlbertaV1KnowledgeKey;

/** Combined allowlist for filesystem reads — no arbitrary paths. */
export const FIELD_KNOWLEDGE_ALLOWLISTED_PATHS: readonly string[] = [
  ...Object.values(GAS_FIREPLACE_TOPIC_FILES),
  ...Object.values(ALBERTA_V1_KNOWLEDGE_FILES),
];

export const FIELD_KNOWLEDGE_UNKNOWN_JURISDICTION_MESSAGE =
  "I do not have verified jurisdiction guidance for that location yet.";

/** Max UTF-8 bytes for all knowledge excerpts combined in one Field Copilot prompt. */
export const FIELD_KNOWLEDGE_MAX_PROMPT_BYTES = 48 * 1024;

/** Max UTF-8 bytes per topic excerpt after load. */
export const FIELD_KNOWLEDGE_MAX_TOPIC_BYTES = 6 * 1024;
