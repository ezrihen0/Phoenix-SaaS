import {
  FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE,
  type FieldKnowledgeDomain,
  type GasFireplaceTopicKey,
} from "./field-knowledge.constants";

export type FieldKnowledgeTopicSelection = {
  domain: FieldKnowledgeDomain;
  topics: GasFireplaceTopicKey[];
};

type TopicRule = {
  topic: GasFireplaceTopicKey;
  patterns: RegExp[];
};

const GAS_FIREPLACE_RULES: TopicRule[] = [
  {
    topic: "safety_first",
    patterns: [
      /\bsafe\b/,
      /\bsafety\b/,
      /\bco\b/,
      /\bcarbon monoxide\b/,
      /\bgas (odor|smell|leak)\b/,
      /\bsmell gas\b/,
      /\bpromise\b/,
      /\bguarantee\b/,
      /\bpressure\b/,
      /\borifice\b/,
      /\bbypass\b/,
      /\bburner adjust/,
      /\bgasfitter\b/,
    ],
  },
  {
    topic: "customer_interview",
    patterns: [
      /\bwhat should i\b/,
      /\bwhere (do i|should i) start\b/,
      /\binterview\b/,
      /\bask (the )?customer\b/,
      /\bquestions to ask\b/,
    ],
  },
  {
    topic: "visual_inspection",
    patterns: [
      /\bcheck first\b/,
      /\bwhat should i check\b/,
      /\bvisual inspect/,
      /\bwhat to (look|inspect)\b/,
      /\binspect first\b/,
      /\blook for\b/,
      /\bnameplate\b/,
    ],
  },
  {
    topic: "common_problems",
    patterns: [
      /\bblack glass\b/,
      /\bsoot\b/,
      /\bwon'?t (light|ignite|start)\b/,
      /\bweak flame\b/,
      /\bodor\b/,
      /\bnoise\b/,
      /\bfan (not|won'?t)\b/,
      /\bglass is black\b/,
      /\bwhat does it mean\b/,
    ],
  },
  {
    topic: "venting_basics",
    patterns: [
      /\bvent\b/,
      /\bflue\b/,
      /\btermination\b/,
      /\bblocked\b/,
      /\bclearance\b/,
      /\binches\b/,
      /\bdirect vent\b/,
      /\bb-vent\b/,
    ],
  },
  {
    topic: "manufacturer_manual_rule",
    patterns: [
      /\bmanual\b/,
      /\bmanufacturer\b/,
      /\bcode compliant\b/,
      /\bcertif/,
      /\bpromise.*safe\b/,
      /\bexact\b/,
      /\bspec\b/,
    ],
  },
  {
    topic: "maintenance_sales",
    patterns: [
      /\bmaintenance\b/,
      /\bannual\b/,
      /\bcleaning package\b/,
      /\bwhat can i sell\b/,
      /\bsell during\b/,
      /\bbasic service\b/,
    ],
  },
  {
    topic: "repair_upgrade",
    patterns: [
      /\brepair\b/,
      /\bupgrade\b/,
      /\breplace\b/,
      /\bparts?\b/,
      /\bremote control\b/,
    ],
  },
  {
    topic: "report_wording",
    patterns: [
      /\breport\b/,
      /\bwrite a note\b/,
      /\bwording\b/,
      /\bdocumentation\b/,
      /\bjob note\b/,
    ],
  },
  {
    topic: "field_sales_playbook",
    patterns: [
      /\bhow do i sell\b/,
      /\bwhat can i sell\b/,
      /\bsell during\b/,
      /\bsell service\b/,
      /\bupsell\b/,
      /\bplaybook\b/,
      /\bclose\b/,
    ],
  },
];

const TOPIC_PRIORITY: GasFireplaceTopicKey[] = [
  "safety_first",
  "manufacturer_manual_rule",
  "customer_interview",
  "visual_inspection",
  "common_problems",
  "venting_basics",
  "report_wording",
  "maintenance_sales",
  "repair_upgrade",
  "field_sales_playbook",
];

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

function detectGasFireplaceTopics(text: string): GasFireplaceTopicKey[] {
  const matched = new Set<GasFireplaceTopicKey>();

  for (const rule of GAS_FIREPLACE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      matched.add(rule.topic);
    }
  }

  if (/\bwhat should i check\b/.test(text) || /\bcheck first\b/.test(text)) {
    matched.add("customer_interview");
    matched.add("visual_inspection");
    matched.add("safety_first");
  }

  if (/\bservic(e|ing)\b/.test(text) && /\bcheck first\b/.test(text)) {
    matched.add("customer_interview");
    matched.add("visual_inspection");
    matched.add("safety_first");
  }

  if (/\bblack glass\b/.test(text) || /\bglass is black\b/.test(text)) {
    matched.add("common_problems");
    matched.add("safety_first");
    matched.add("report_wording");
  }

  if (/\bgas fireplace\b/.test(text) && !matched.has("safety_first")) {
    matched.add("safety_first");
  }

  if (/\bpressure\b/.test(text) || /\badjust\b.*\bgas\b/.test(text)) {
    matched.add("safety_first");
    matched.add("manufacturer_manual_rule");
  }

  if (/\bclearance\b/.test(text) || /\binches\b/.test(text)) {
    matched.add("venting_basics");
    matched.add("manufacturer_manual_rule");
  }

  if (matched.size === 0) {
    matched.add("safety_first");
    matched.add("customer_interview");
    matched.add("visual_inspection");
  }

  return TOPIC_PRIORITY.filter((topic) => matched.has(topic));
}

export function detectFieldKnowledgeTopics(
  domain: FieldKnowledgeDomain,
  userMessage: string,
): FieldKnowledgeTopicSelection {
  const text = normalizeMessage(userMessage);

  if (domain === FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE) {
    return {
      domain,
      topics: detectGasFireplaceTopics(text),
    };
  }

  return { domain, topics: ["safety_first"] };
}
