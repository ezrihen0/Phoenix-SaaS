import {
  FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE,
  FIELD_KNOWLEDGE_UNKNOWN_JURISDICTION_MESSAGE,
  type AlbertaV1KnowledgeKey,
  type FieldKnowledgeDomain,
} from "./field-knowledge.constants";

export type FieldKnowledgeCityAhj = "calgary" | "edmonton";

export type FieldKnowledgeJurisdictionSelection = {
  jurisdictionPacks: AlbertaV1KnowledgeKey[];
  jurisdictionNotice: string | null;
};

const ALBERTA_BASELINE_PACKS: AlbertaV1KnowledgeKey[] = [
  "canada_alberta_gas_fireplace_basics",
  "canada_alberta_gas",
];

const USA_STATE_NAMES = [
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
] as const;

const OTHER_CANADA_PROVINCE_PATTERNS: RegExp[] = [
  /\bbritish columbia\b/i,
  /\bmanitoba\b/i,
  /\bnew brunswick\b/i,
  /\bnewfoundland\b/i,
  /\blabrador\b/i,
  /\bnorthwest territories\b/i,
  /\bnova scotia\b/i,
  /\bnunavut\b/i,
  /\bontario\b/i,
  /\bprince edward island\b/i,
  /\bquebec\b/i,
  /\bsaskatchewan\b/i,
  /\byukon\b/i,
];

function normalizeLocationText(userMessage: string, serviceCity?: string | null): string {
  const parts = [userMessage, serviceCity ?? ""].filter((p) => p.trim().length > 0);
  return parts.join(" ").toLowerCase();
}

function detectCities(text: string): Set<FieldKnowledgeCityAhj> {
  const cities = new Set<FieldKnowledgeCityAhj>();
  if (/\bcalgary\b/.test(text)) {
    cities.add("calgary");
  }
  if (/\bedmonton\b/.test(text)) {
    cities.add("edmonton");
  }
  return cities;
}

function detectProvinceAlberta(text: string): boolean {
  if (/\balberta\b/.test(text)) {
    return true;
  }
  if (/\bab\b/.test(text) && /\b(calgary|edmonton|alberta)\b/.test(text)) {
    return true;
  }
  return detectCities(text).size > 0;
}

function detectOutsideApprovedJurisdiction(text: string): boolean {
  if (/\b(usa|u\.s\.a\.|u\.s\.|united states)\b/.test(text)) {
    return true;
  }

  for (const state of USA_STATE_NAMES) {
    const pattern = new RegExp(`\\b${state.replace(/ /g, "\\s+")}\\b`, "i");
    if (pattern.test(text)) {
      return true;
    }
  }

  for (const pattern of OTHER_CANADA_PROVINCE_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Select Alberta V1 packs for gas_fireplace when province/city context is approved.
 * Outside North America approved packs → jurisdiction notice only (no Alberta files).
 */
export function selectAlbertaV1KnowledgePacks(input: {
  domain: FieldKnowledgeDomain;
  userMessage: string;
  serviceCity?: string | null;
}): FieldKnowledgeJurisdictionSelection {
  if (input.domain !== FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE) {
    return { jurisdictionPacks: [], jurisdictionNotice: null };
  }

  const text = normalizeLocationText(input.userMessage, input.serviceCity);
  const provinceAlberta = detectProvinceAlberta(text);
  const outsideApproved = detectOutsideApprovedJurisdiction(text);

  if (outsideApproved && !provinceAlberta) {
    return {
      jurisdictionPacks: [],
      jurisdictionNotice: FIELD_KNOWLEDGE_UNKNOWN_JURISDICTION_MESSAGE,
    };
  }

  if (!provinceAlberta) {
    return { jurisdictionPacks: [], jurisdictionNotice: null };
  }

  const packs: AlbertaV1KnowledgeKey[] = [...ALBERTA_BASELINE_PACKS];
  const cities = detectCities(text);

  if (cities.has("calgary")) {
    packs.push("canada_alberta_calgary_gas_fireplace_permits");
  }
  if (cities.has("edmonton")) {
    packs.push("canada_alberta_edmonton_gas_fireplace_permits");
  }

  return { jurisdictionPacks: packs, jurisdictionNotice: null };
}
