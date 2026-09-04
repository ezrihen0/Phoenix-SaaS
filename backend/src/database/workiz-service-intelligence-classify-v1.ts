import "dotenv/config";
import "reflect-metadata";

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import {
  ANALYSIS_AS_OF,
  abortIfWriteFlags,
  addMonths,
  derivePrimaryServices,
  detectSystems,
  emptyWarranty,
  extractModelNumbers,
  extractScopedDurations,
  FINDING_RULES,
  isLaborChargeTitle,
  isNoiseText,
  isTrueInstallationTitle,
  isUsableTitle,
  loadExtractions,
  loadFallbackCodes,
  loadFromDatabase,
  loadFromHarnessFallback,
  matchRules,
  normalizePartNumber,
  PART_COMPONENT_RULES,
  PHOENIX_ORG_ID,
  SERVICE_DETAIL_RULES,
  stripBoilerplate,
  systemBucket,
  warrantyStatus,
  type CorpusRow,
  type SourceLine,
  type WarrantyStatus,
} from "./workiz-service-intelligence-discovery";

export const TAXONOMY_VERSION = "V1";
const FORBIDDEN_WRITE = 0;
const VALIDATION_CODES = [
  "WET6R6",
  "70QLL2",
  "03LDZE",
  "6K5NIA",
  "EKWLIM",
  "74BY7X",
  "62QJZP",
  "CALURM",
  "TWKN8Z",
  "8TGGHY",
  "9TZM8J",
  "QRBE2K",
] as const;

type WorkAction = "REPLACED" | "INSTALLED" | "REPAIRED" | "SERVICED" | "CLEANED" | "UNKNOWN";
type Confidence = "HIGH" | "MEDIUM" | "LOW";
type ReviewReason =
  | "UNKNOWN_SYSTEM"
  | "UNKNOWN_PRIMARY_SERVICE"
  | "AMBIGUOUS_COMPONENT"
  | "AMBIGUOUS_WORK_ACTION"
  | "AMBIGUOUS_WARRANTY_SCOPE"
  | "UNPARSEABLE_WARRANTY"
  | "EXTENDED_WARRANTY_AMBIGUOUS"
  | "THIN_RECORD"
  | "ADMIN_ONLY";

type ExtendedWarranty = {
  duration_months: number | null;
  source_text: string;
  relationship: "REPLACES" | "ADDS" | "AMBIGUOUS";
  target_component: string | null;
  effective_expiry_date: string | null;
};

type ComponentIntelligence = {
  component: string;
  raw_name: string;
  model_or_part_number: string | null;
  work_action: WorkAction;
  line_amount_cents: number | null;
  warranty_status: WarrantyStatus;
  warranty_duration_months: number | null;
  warranty_source_text: string | null;
  warranty_start_date: string | null;
  warranty_expiry_date: string | null;
  confidence: Confidence;
  extended_warranty: ExtendedWarranty | null;
  evidence: string[];
};

type PartsWarrantyRecord = {
  component: string | null;
  scope: "COMPONENT" | "UNSCOPED_INVOICE";
  status: WarrantyStatus;
  duration_months: number | null;
  source_text: string;
  start_date: string | null;
  expiry_date: string | null;
  confidence: Confidence;
};

type LaborWarranty = {
  status: WarrantyStatus;
  duration_months: number | null;
  source_text: string | null;
  start_date: string | null;
  expiry_date: string | null;
};

type FindingRecord = {
  label: string;
  evidence: string;
  confidence: Confidence;
};

type Provenance = {
  source_lines: Array<{ raw: string; title: string; amount_cents: number | null }>;
  service_summary: string[];
  warranty_blocks: string[];
  notes: string[];
};

export type ClassificationV1 = {
  taxonomy_version: typeof TAXONOMY_VERSION;
  invoice_code: string;
  invoice_id: string | null;
  issued_at: string | null;
  system: string[];
  system_bucket: "GAS" | "WOOD" | "CHIMNEY" | "MIXED" | "OTHER" | "UNKNOWN";
  primary_service: string[];
  service_detail: string[];
  components: ComponentIntelligence[];
  labor: {
    labor_charged: boolean;
    raw_wording: string[];
  };
  parts_warranty: PartsWarrantyRecord[];
  labor_warranty: LaborWarranty;
  unbound_extended: ExtendedWarranty[];
  findings: FindingRecord[];
  classification_confidence: Confidence;
  review_reasons: ReviewReason[];
  evidence: Provenance;
  source: "db" | "harness_fallback";
  missing_extraction: boolean;
};

type Rule = { label: string; pattern: RegExp };

const EXTRA_COMPONENT_RULES: Rule[] = [
  { label: "FLASHING", pattern: /\bflashing\b/i },
  { label: "CROWN", pattern: /\bcrown\b/i },
];

const COMPONENT_RULES: Rule[] = [...PART_COMPONENT_RULES, ...EXTRA_COMPONENT_RULES];

const COMPONENT_ALIASES: Record<string, RegExp[]> = {
  PILOT_ASSEMBLY: [/\bpilot\b/i],
  GAS_VALVE: [/\b(?:main\s+)?(?:gas\s+)?valve\b/i],
  CONTROL_MODULE: [/\bcontrol module\b/i, /\bmain computer\b/i, /\bignition box\b/i],
  SWITCH: [/\bswitch\b/i],
  REMOTE: [/\bremote\b/i],
  RECEIVER: [/\breceiver\b/i],
  BLOWER_FAN: [/\bblower\b/i, /\bfan\b/i],
  THERMOCOUPLE: [/\bthermocouple\b/i],
  THERMOPILE: [/\bthermopile\b/i],
  CHIMNEY_CAP: [/\bchimney cap\b/i, /\bcap\b/i],
  CHASE_COVER: [/\bchase cover\b/i],
  GASKET: [/\bgasket\b/i],
  MESH: [/\bmesh\b/i],
  IGNITER: [/\bigniter\b/i],
  FLASHING: [/\bflashing\b/i],
};

const ADMIN_PATTERN = /\b(?:tip|refund|mil(?:e|a)ge|credit fee|manager discount|senior discount|google review|imported workiz|job grade|service call)\b/i;
const WARRANTY_WORD = /warr(?:anty|nty|ny|anted)/i;
const EXTENDED_WARRANTY = /\bextended\s+warr/i;
const REPLACE_PATTERN = /\b(?:replac(?:e|ed|ement|ing)|removed the existing)\b/i;
const NEW_PART_PATTERN = /\bnew\s+(?:pilot|valve|switch|module|remote|receiver|blower|fan|thermocouple|thermopile|cap|gasket|igniter|assembly)\b/i;
const INSTALL_PATTERN = /\binstall(?:ation|ed|ing)?\b/i;
const REPAIR_PATTERN = /\b(?:repair(?:ed|s|ing)?|fix(?:ed|ing)?|rewir(?:e|ing|ed))\b/i;
const CLEAN_PATTERN = /\b(?:clean(?:ed|ing)?|sweep(?:ing)?)\b/i;
const SERVICE_PATTERN = /\b(?:service|serviced|servicing|tune[\s-]?up|maintenance)\b/i;
const FAN_WIRE_PATTERN = /\bfan\s+wires?\b/i;

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function isAdminTitle(title: string): boolean {
  return matchRules(title, SERVICE_DETAIL_RULES).includes("ADMINISTRATIVE") || ADMIN_PATTERN.test(title);
}

function isWarrantyOnlyLine(title: string): boolean {
  const text = compact(title);
  if (!WARRANTY_WORD.test(text)) return false;
  if (EXTENDED_WARRANTY.test(text)) return true;
  if (/^(?:extended\s+)?warr/i.test(text)) return true;
  if (/^\d+\s*(?:years?|yrs?|months?)/i.test(text) && WARRANTY_WORD.test(text) && !COMPONENT_RULES.some((rule) => rule.pattern.test(text))) {
    return true;
  }
  const withoutWarranty = text
    .replace(/\b(?:extended\s+)?warr(?:anty|nty|ny).*$/i, "")
    .replace(/\d+\s*(?:years?|yrs?|months?|mo)\b/gi, "")
    .replace(/\b(?:parts?|labou?r|only|for|a|new|and|&)\b/gi, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim();
  return withoutWarranty.length === 0;
}

function skipComponentLine(title: string): boolean {
  if (isLaborChargeTitle(title)) return true;
  if (isWarrantyOnlyLine(title)) return true;
  if (isAdminTitle(title) && !COMPONENT_RULES.some((rule) => rule.pattern.test(title))) return true;
  if (FAN_WIRE_PATTERN.test(title) && !/\bblower\b|\bfan motor\b/i.test(title)) return true;
  return false;
}

function pickComponent(title: string): { component: string; ambiguous: boolean } | null {
  const matches = COMPONENT_RULES.filter((rule) => rule.pattern.test(title));
  if (matches.length === 0) return null;
  if (matches.length === 1) return { component: matches[0].label, ambiguous: false };

  let best = matches[0];
  let bestIdx = title.search(best.pattern);
  for (const match of matches.slice(1)) {
    const idx = title.search(match.pattern);
    if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) {
      best = match;
      bestIdx = idx;
    }
  }
  const coordinated = /\b(?:and|&)\b/.test(title)
    && matches.filter((match) => match.label !== best.label).some((match) => {
      const idx = title.search(match.pattern);
      return idx >= 0 && Math.abs(idx - bestIdx) < 40;
    });
  return { component: best.label, ambiguous: coordinated };
}

function detectWorkAction(title: string, amountCents: number | null): {
  action: WorkAction;
  confidence: Confidence;
  ambiguous: boolean;
} {
  const stripped = compact(title)
    .replace(/^labor\s*(?:and|&|,)?\s*installation\s*/i, "")
    .replace(/^installation\s+labor\s*/i, "");
  if (REPLACE_PATTERN.test(stripped) || NEW_PART_PATTERN.test(stripped)) {
    return { action: "REPLACED", confidence: "HIGH", ambiguous: false };
  }
  if (INSTALL_PATTERN.test(stripped) && !isLaborChargeTitle(title)) {
    return { action: "INSTALLED", confidence: "HIGH", ambiguous: false };
  }
  if (REPAIR_PATTERN.test(stripped)) {
    return { action: "REPAIRED", confidence: "HIGH", ambiguous: false };
  }
  if (CLEAN_PATTERN.test(stripped)) {
    return { action: "CLEANED", confidence: "HIGH", ambiguous: false };
  }
  if (SERVICE_PATTERN.test(stripped)) {
    return { action: "SERVICED", confidence: "MEDIUM", ambiguous: false };
  }
  if ((amountCents ?? 0) > 0) {
    return { action: "UNKNOWN", confidence: "MEDIUM", ambiguous: true };
  }
  return { action: "UNKNOWN", confidence: "LOW", ambiguous: true };
}

function lineModels(line: SourceLine, extracted: CorpusRow["extracted_parts"]): string | null {
  const ownParts = extracted.filter((part) => {
    const label = compact(part.label || "");
    return label.length > 0 && (label === compact(line.raw) || label === compact(line.title));
  });
  const skuHits = compact(`${line.title} ${line.raw}`).match(/\b\d{3,5}-\d{2,4}\b/g) ?? [];
  const models = [
    ...extractModelNumbers(`${line.title} ${line.raw}`, ownParts),
    ...skuHits,
  ]
    .map((model) => normalizePartNumber(model))
    .filter((model): model is string => Boolean(model));
  return models[0] ?? null;
}

function applyWarrantyToComponent(
  component: ComponentIntelligence,
  months: number,
  raw: string,
  issuedAt: string | null,
  confidence: Confidence,
): void {
  if (component.warranty_status !== "NOT_DOCUMENTED" && component.warranty_status !== "UNPARSEABLE") return;
  component.warranty_duration_months = months;
  component.warranty_source_text = raw.slice(0, 220);
  component.warranty_start_date = issuedAt;
  component.warranty_expiry_date = issuedAt ? addMonths(issuedAt, months) : null;
  component.warranty_status = warrantyStatus(months, issuedAt);
  if (confidence === "HIGH" || component.confidence === "LOW") component.confidence = confidence;
  component.evidence.push(raw.slice(0, 220));
}

function markUnparseable(component: ComponentIntelligence, raw: string): void {
  if (component.warranty_status !== "NOT_DOCUMENTED") return;
  component.warranty_status = "UNPARSEABLE";
  component.warranty_source_text = raw.slice(0, 220);
  component.evidence.push(raw.slice(0, 220));
}

function extendedRelationship(text: string): ExtendedWarranty["relationship"] {
  if (/\b(?:additional|plus|on top(?: of)?|added to)\b/i.test(text)) return "ADDS";
  if (/\b(?:replac(?:es|ing)|instead of|total of)\b/i.test(text)) return "REPLACES";
  return "AMBIGUOUS";
}

function targetFromExtended(text: string, components: ComponentIntelligence[]): string | null {
  const mentioned = Object.entries(COMPONENT_ALIASES)
    .filter(([label, aliases]) => aliases.some((alias) => alias.test(text)) && components.some((item) => item.component === label))
    .map(([label]) => label);
  if (mentioned.length === 1) return mentioned[0];
  return null;
}

function bindNamedWarranty(
  text: string,
  components: ComponentIntelligence[],
  issuedAt: string | null,
): { bound: boolean; laborMonths: number | null; laborRaw: string | null; unscopedParts: Array<{ months: number; raw: string }>; unparseable: boolean } {
  const compactText = compact(text);
  const onLabor = isLaborChargeTitle(compactText);
  const onPart = COMPONENT_RULES.some((rule) => rule.pattern.test(compactText));
  const scoped = extractScopedDurations(compactText, onLabor, onPart);
  let bound = false;
  let laborMonths: number | null = null;
  let laborRaw: string | null = null;
  const unscopedParts: Array<{ months: number; raw: string }> = [];
  let unparseable = false;

  if (scoped.length === 0 && WARRANTY_WORD.test(compactText)) {
    return { bound: false, laborMonths: null, laborRaw: null, unscopedParts, unparseable: true };
  }

  for (const item of scoped) {
    if (item.scope === "labor" || item.scope === "both") {
      laborMonths = item.months;
      laborRaw = item.raw;
    }
    if (item.scope === "labor") continue;

    const named = Object.entries(COMPONENT_ALIASES)
      .filter(([label, aliases]) => aliases.some((alias) => alias.test(compactText)) && components.some((row) => row.component === label))
      .map(([label]) => label);
    const uniqueNamed = unique(named);
    if (uniqueNamed.length === 1) {
      const target = components.find((row) => row.component === uniqueNamed[0]);
      if (target) {
        applyWarrantyToComponent(target, item.months, item.raw, issuedAt, "HIGH");
        bound = true;
        continue;
      }
    }
    if (item.scope === "parts" || item.scope === "both" || item.scope === "unspecified") {
      unscopedParts.push({ months: item.months, raw: item.raw });
    }
  }

  return { bound, laborMonths, laborRaw, unscopedParts, unparseable };
}

function applySummaryWorkActions(texts: string[], components: ComponentIntelligence[]): void {
  const blob = texts.join(" \n ");
  for (const component of components) {
    const aliases = COMPONENT_ALIASES[component.component] ?? [];
    const mentioned = aliases.some((alias) => alias.test(blob));
    if (!mentioned) continue;
    if (component.work_action !== "UNKNOWN") continue;
    const window = blob.slice(0, 2000);
    if (REPLACE_PATTERN.test(window) && aliases.some((alias) => alias.test(window))) {
      component.work_action = "REPLACED";
      component.confidence = "HIGH";
      component.evidence.push("Service summary replacement/install evidence");
    } else if (/\binstalled a new\b/i.test(window) && aliases.some((alias) => alias.test(window))) {
      component.work_action = "REPLACED";
      component.confidence = "HIGH";
      component.evidence.push("Service summary installed-new evidence");
    }
  }
}

function laborWarrantyFrom(
  status: WarrantyStatus,
  months: number | null,
  raw: string | null,
  issuedAt: string | null,
): LaborWarranty {
  return {
    status,
    duration_months: months,
    source_text: raw,
    start_date: issuedAt && months != null ? issuedAt : null,
    expiry_date: issuedAt && months != null ? addMonths(issuedAt, months) : null,
  };
}

export function classifyInvoiceV1(row: CorpusRow): ClassificationV1 {
  const review = new Set<ReviewReason>();
  const lines = row.source_lines.length > 0
    ? row.source_lines
    : row.short_titles.map((title) => ({ raw: title, title, amount_cents: null as number | null }));

  const laborRaw: string[] = [];
  const components: ComponentIntelligence[] = [];
  const extendedLines: SourceLine[] = [];
  const warrantyOnly: SourceLine[] = [];
  const operationalTitles: string[] = [];

  for (const line of lines) {
    const title = compact(line.title || line.raw);
    if (!title || isNoiseText(title)) continue;
    if (isLaborChargeTitle(title)) {
      laborRaw.push(title);
      continue;
    }
    if (EXTENDED_WARRANTY.test(title)) {
      extendedLines.push({ ...line, title });
      continue;
    }
    if (isWarrantyOnlyLine(title)) {
      warrantyOnly.push({ ...line, title });
      continue;
    }
    if (isUsableTitle(title) && !isAdminTitle(title)) operationalTitles.push(title);

    if (skipComponentLine(title)) continue;
    const picked = pickComponent(title);
    if (!picked) continue;

    const work = detectWorkAction(title, line.amount_cents);
    const models = lineModels({ ...line, title }, row.extracted_parts);
    const component: ComponentIntelligence = {
      component: picked.component,
      raw_name: title,
      model_or_part_number: models,
      work_action: work.action,
      line_amount_cents: line.amount_cents,
      warranty_status: "NOT_DOCUMENTED",
      warranty_duration_months: null,
      warranty_source_text: null,
      warranty_start_date: null,
      warranty_expiry_date: null,
      confidence: picked.ambiguous ? "LOW" : work.confidence,
      extended_warranty: null,
      evidence: [line.raw.slice(0, 220)],
    };

    const scoped = extractScopedDurations(title, false, true);
    if (scoped.length === 0 && WARRANTY_WORD.test(title)) {
      markUnparseable(component, title);
    }
    for (const item of scoped) {
      if (item.scope === "labor") continue;
      applyWarrantyToComponent(component, item.months, item.raw, row.issued_at, "HIGH");
    }

    if (picked.ambiguous) review.add("AMBIGUOUS_COMPONENT");
    components.push(component);
  }

  const laborCharged = laborRaw.length > 0;
  for (const component of components) {
    if (component.work_action !== "UNKNOWN") continue;
    const priced = (component.line_amount_cents ?? 0) > 0;
    const hasOwnWarranty = component.warranty_status === "DOCUMENTED_ACTIVE"
      || component.warranty_status === "DOCUMENTED_EXPIRED";
    if (priced && (laborCharged || hasOwnWarranty)) {
      component.work_action = "REPLACED";
      component.confidence = component.confidence === "HIGH" ? "HIGH" : "MEDIUM";
      component.evidence.push("Priced component with labor/warranty supply-or-replace context");
      continue;
    }
    review.add("AMBIGUOUS_WORK_ACTION");
  }

  const laborWarrantySeed = emptyWarranty(row.issued_at);
  const applyLabor = (raw: string, months: number) => {
    if (laborWarrantySeed.status !== "NOT_DOCUMENTED") return;
    laborWarrantySeed.raw_text = raw.slice(0, 220);
    laborWarrantySeed.duration_months = months;
    laborWarrantySeed.calculable_expiry_date = row.issued_at ? addMonths(row.issued_at, months) : null;
    laborWarrantySeed.status = warrantyStatus(months, row.issued_at);
  };

  for (const wording of laborRaw) {
    const scoped = extractScopedDurations(wording, true, false);
    if (scoped.length === 0 && WARRANTY_WORD.test(wording)) {
      laborWarrantySeed.raw_text = wording.slice(0, 220);
      laborWarrantySeed.status = "UNPARSEABLE";
      review.add("UNPARSEABLE_WARRANTY");
    }
    for (const item of scoped) {
      if (item.scope === "labor" || item.scope === "both" || (item.scope === "unspecified" && isLaborChargeTitle(wording))) {
        applyLabor(item.raw, item.months);
      }
    }
  }

  for (const line of lines) {
    const title = compact(line.title || line.raw);
    if (!COMPONENT_RULES.some((rule) => rule.pattern.test(title))) continue;
    if (isLaborChargeTitle(title) || isWarrantyOnlyLine(title) || EXTENDED_WARRANTY.test(title)) continue;
    const scoped = extractScopedDurations(title, false, true);
    for (const item of scoped) {
      if (item.scope === "labor" || item.scope === "both") applyLabor(item.raw, item.months);
    }
  }

  const unscopedParts: PartsWarrantyRecord[] = [];
  const bindStandalone = (text: string) => {
    const result = bindNamedWarranty(text, components, row.issued_at);
    if (result.laborMonths != null && result.laborRaw) applyLabor(result.laborRaw, result.laborMonths);
    if (result.unparseable) review.add("UNPARSEABLE_WARRANTY");
    if (result.unscopedParts.length > 0) {
      const novel = result.unscopedParts.filter((part) =>
        !components.some((item) => item.warranty_duration_months === part.months)
        && !unscopedParts.some((item) => item.duration_months === part.months)
        && laborWarrantySeed.duration_months !== part.months
      );
      if (novel.length === 0) return;
      const distinctComponents = unique(components.map((item) => item.component));
      if (distinctComponents.length === 1 && !result.bound) {
        applyWarrantyToComponent(components[0], novel[0].months, novel[0].raw, row.issued_at, "MEDIUM");
      } else if (distinctComponents.length > 1 && !result.bound) {
        review.add("AMBIGUOUS_WARRANTY_SCOPE");
        for (const part of novel) {
          unscopedParts.push({
            component: null,
            scope: "UNSCOPED_INVOICE",
            status: warrantyStatus(part.months, row.issued_at),
            duration_months: part.months,
            source_text: part.raw.slice(0, 220),
            start_date: row.issued_at,
            expiry_date: row.issued_at ? addMonths(row.issued_at, part.months) : null,
            confidence: "MEDIUM",
          });
        }
      } else if (distinctComponents.length === 0) {
        for (const part of novel) {
          unscopedParts.push({
            component: null,
            scope: "UNSCOPED_INVOICE",
            status: warrantyStatus(part.months, row.issued_at),
            duration_months: part.months,
            source_text: part.raw.slice(0, 220),
            start_date: row.issued_at,
            expiry_date: row.issued_at ? addMonths(row.issued_at, part.months) : null,
            confidence: "LOW",
          });
        }
      }
    }
  };

  for (const line of warrantyOnly) bindStandalone(line.title);
  for (const block of [...row.service_summary_lines, ...row.warranty_blocks]) {
    if (!WARRANTY_WORD.test(block)) continue;
    bindStandalone(block);
  }
  applySummaryWorkActions([...row.service_summary_lines, ...row.notes], components);

  const unboundExtended: ExtendedWarranty[] = [];
  for (const line of extendedLines) {
    const scoped = extractScopedDurations(line.title, false, true);
    const relationship = extendedRelationship(line.title);
    const target = targetFromExtended(line.title, components);
    const months = scoped.find((item) => item.scope !== "labor")?.months ?? null;
    const record: ExtendedWarranty = {
      duration_months: months,
      source_text: line.raw.slice(0, 220),
      relationship,
      target_component: target,
      effective_expiry_date: relationship !== "AMBIGUOUS" && months != null && row.issued_at
        ? addMonths(row.issued_at, relationship === "ADDS" && target
          ? (components.find((item) => item.component === target)?.warranty_duration_months ?? 0) + months
          : months)
        : null,
    };
    if (relationship === "AMBIGUOUS" || !target || months == null) review.add("EXTENDED_WARRANTY_AMBIGUOUS");
    if (target) {
      const dest = components.find((item) => item.component === target);
      if (dest && !dest.extended_warranty) dest.extended_warranty = record;
      else unboundExtended.push(record);
    } else if (components.length === 1) {
      if (!components[0].extended_warranty) components[0].extended_warranty = record;
      else unboundExtended.push(record);
      review.add("EXTENDED_WARRANTY_AMBIGUOUS");
    } else {
      unboundExtended.push(record);
      review.add("EXTENDED_WARRANTY_AMBIGUOUS");
    }
    if (months == null && WARRANTY_WORD.test(line.title)) review.add("UNPARSEABLE_WARRANTY");
  }

  const nonLaborTitles = row.short_titles.filter((title) => !isLaborChargeTitle(title));
  const titleBlob = nonLaborTitles.join(" \n ");
  const details = new Set<string>();
  for (const label of matchRules(titleBlob, SERVICE_DETAIL_RULES)) {
    if (label === "PART_REPLACEMENT" || label === "ADMINISTRATIVE" || label === "EXPLICIT_REPAIR") continue;
    details.add(label);
  }
  if (row.line_texts.some((text) => /\bcamera\b/i.test(text))) details.add("CAMERA_INSPECTION");
  if (nonLaborTitles.some((title) => /\b(?:repair|rewiring|replacement|replace|fixing)\b/i.test(title))) {
    details.add("EXPLICIT_REPAIR");
  }
  if (components.some((item) => item.work_action === "REPLACED" || item.work_action === "INSTALLED")) {
    details.add("PART_REPLACEMENT");
  }

  const trueInstallation = row.short_titles.some((title) => isTrueInstallationTitle(title));
  const primary = derivePrimaryServices([...details], trueInstallation);
  const systems = detectSystems(`${titleBlob} \n ${row.service_summary_lines.join(" ")}`);
  if (systems.length === 0) {
    for (const extra of detectSystems([...row.line_texts, ...row.notes].join(" \n "))) {
      if (!systems.includes(extra)) systems.push(extra);
    }
  }
  const bucket = systemBucket(systems);

  const findings: FindingRecord[] = [];
  for (const line of [...row.service_summary_lines, ...row.line_texts]) {
    if (isNoiseText(line)) continue;
    for (const label of matchRules(line, FINDING_RULES)) {
      if (!findings.some((item) => item.label === label)) {
        findings.push({ label, evidence: compact(line).slice(0, 220), confidence: "HIGH" });
      }
    }
  }

  const onlyAdmin = nonLaborTitles.length > 0
    && nonLaborTitles.every((title) => isAdminTitle(title))
    && components.length === 0
    && !trueInstallation;
  const laborOnly = laborRaw.length > 0 && operationalTitles.length === 0 && components.length === 0;
  const thin = row.short_titles.length <= 1 && primary.includes("UNKNOWN") && findings.length === 0 && components.length === 0;

  if (bucket === "UNKNOWN") review.add("UNKNOWN_SYSTEM");
  if (primary.includes("UNKNOWN")) review.add("UNKNOWN_PRIMARY_SERVICE");
  if (onlyAdmin) review.add("ADMIN_ONLY");
  if (thin || laborOnly) review.add("THIN_RECORD");
  if (components.some((item) => item.warranty_status === "UNPARSEABLE")) review.add("UNPARSEABLE_WARRANTY");
  if (components.some((item) => item.component === "UNCLASSIFIED_COMPONENT")) review.add("AMBIGUOUS_COMPONENT");

  const partsWarranty: PartsWarrantyRecord[] = [
    ...components
      .filter((item) => item.warranty_status !== "NOT_DOCUMENTED")
      .map((item) => ({
        component: item.component,
        scope: "COMPONENT" as const,
        status: item.warranty_status,
        duration_months: item.warranty_duration_months,
        source_text: item.warranty_source_text ?? item.raw_name,
        start_date: item.warranty_start_date,
        expiry_date: item.warranty_expiry_date,
        confidence: item.confidence,
      })),
    ...unscopedParts,
  ];

  const reasons = [...review];
  const classificationConfidence: Confidence = reasons.length === 0
    ? "HIGH"
    : reasons.some((reason) => ["UNKNOWN_SYSTEM", "UNKNOWN_PRIMARY_SERVICE", "ADMIN_ONLY", "THIN_RECORD", "UNPARSEABLE_WARRANTY"].includes(reason))
      ? "LOW"
      : "MEDIUM";

  return {
    taxonomy_version: TAXONOMY_VERSION,
    invoice_code: row.invoice_code,
    invoice_id: row.invoice_id,
    issued_at: row.issued_at,
    system: systems.length > 0 ? systems : ["UNKNOWN"],
    system_bucket: bucket,
    primary_service: primary,
    service_detail: [...details].filter((label) => label !== "EXPLICIT_REPAIR"),
    components,
    labor: {
      labor_charged: laborRaw.length > 0,
      raw_wording: unique(laborRaw),
    },
    parts_warranty: partsWarranty,
    unbound_extended: unboundExtended,
    labor_warranty: laborWarrantyFrom(
      laborWarrantySeed.status,
      laborWarrantySeed.duration_months,
      laborWarrantySeed.raw_text,
      row.issued_at,
    ),
    findings,
    classification_confidence: classificationConfidence,
    review_reasons: reasons,
    evidence: {
      source_lines: lines.map((line) => ({
        raw: line.raw,
        title: line.title,
        amount_cents: line.amount_cents,
      })),
      service_summary: row.service_summary_lines,
      warranty_blocks: row.warranty_blocks,
      notes: row.notes.filter((note) => !isNoiseText(note)),
    },
    source: row.source,
    missing_extraction: row.missing_extraction,
  };
}

function componentCount(records: ClassificationV1[], label: string): number {
  return records.filter((row) => row.components.some((item) => item.component === label)).length;
}

function remoteReceiverCount(records: ClassificationV1[]): number {
  return records.filter((row) => row.components.some((item) => item.component === "REMOTE" || item.component === "RECEIVER")).length;
}

function hasSystem(row: ClassificationV1, label: string): boolean {
  return row.system.includes(label);
}

function expect(condition: boolean, message: string): { ok: boolean; message: string } {
  return { ok: condition, message };
}

function validateKnown(records: ClassificationV1[]): Array<{ invoice_code: string; checks: Array<{ ok: boolean; message: string }> }> {
  const byCode = new Map(records.map((row) => [row.invoice_code, row]));
  const get = (code: string) => byCode.get(code);

  const checks: Array<{ invoice_code: string; checks: Array<{ ok: boolean; message: string }> }> = [];

  const wet = get("WET6R6");
  checks.push({
    invoice_code: "WET6R6",
    checks: [
      expect(Boolean(wet), "present"),
      expect(wet?.components.some((item) => item.component === "CHIMNEY_CAP" && item.warranty_duration_months === 36) === true, "chimney cap 36 months"),
      expect(wet?.labor_warranty.duration_months === 12, "labor 12 months from part line"),
      expect(wet?.primary_service.includes("TRUE_INSTALLATION") !== true, "not true installation"),
    ],
  });

  const valve = get("70QLL2");
  checks.push({
    invoice_code: "70QLL2",
    checks: [
      expect(valve?.components.some((item) => item.component === "GAS_VALVE" && item.warranty_duration_months === 12) === true, "valve parts 12 months"),
      expect(valve?.labor_warranty.duration_months === 6, "labor 6 months"),
      expect(valve?.components.some((item) => item.component === "GAS_VALVE" && item.work_action === "REPLACED") === true, "valve replaced from summary"),
    ],
  });

  const fan = get("03LDZE");
  checks.push({
    invoice_code: "03LDZE",
    checks: [
      expect(fan?.components.some((item) => item.component === "BLOWER_FAN" && item.warranty_duration_months === 6) === true, "fan 6 months"),
      expect(fan?.labor_warranty.duration_months === 6, "shared part and labor 6 months"),
      expect(fan?.components.some((item) => item.component === "SWITCH" && item.work_action === "REPLACED") === true, "switch replacement"),
    ],
  });

  const unscoped = get("6K5NIA");
  checks.push({
    invoice_code: "6K5NIA",
    checks: [
      expect(unscoped?.components.some((item) => item.component === "GAS_VALVE") === true, "main valve present"),
      expect(unscoped?.components.some((item) => item.component === "PILOT_ASSEMBLY") === true, "pilot present"),
      expect(unscoped?.components.every((item) => item.warranty_status === "NOT_DOCUMENTED") === true, "unscoped warranty not copied onto each part"),
      expect(unscoped?.parts_warranty.some((item) => item.scope === "UNSCOPED_INVOICE" && item.duration_months === 24) === true, "invoice-level 24 month parts"),
      expect(unscoped?.labor_warranty.duration_months === 6, "labor 6 months"),
      expect(unscoped?.review_reasons.includes("AMBIGUOUS_WARRANTY_SCOPE") === true, "ambiguous warranty scope flagged"),
    ],
  });

  const ekw = get("EKWLIM");
  checks.push({
    invoice_code: "EKWLIM",
    checks: [
      expect(ekw?.components.some((item) => item.component === "PILOT_ASSEMBLY") === true, "pilot normalizes"),
      expect(ekw?.labor_warranty.duration_months === 12, "labor 12 months"),
      expect(ekw?.parts_warranty.some((item) => item.scope === "UNSCOPED_INVOICE" && item.duration_months === 36) === true, "unscoped 36 month parts"),
      expect(ekw?.review_reasons.includes("AMBIGUOUS_WARRANTY_SCOPE") === true, "multi-part unscoped flagged"),
    ],
  });

  const moms = get("74BY7X");
  checks.push({
    invoice_code: "74BY7X",
    checks: [
      expect(moms?.labor.labor_charged === true, "labor charged"),
      expect(moms?.labor_warranty.status === "UNPARSEABLE", "6 moms warranty unparseable"),
      expect(moms?.components.some((item) => item.component === "GAS_VALVE" && item.warranty_duration_months === 12) === true, "valve 12 months"),
      expect(moms?.review_reasons.includes("EXTENDED_WARRANTY_AMBIGUOUS") === true, "extended 2 years for new parts flagged"),
    ],
  });

  const multi = get("62QJZP");
  checks.push({
    invoice_code: "62QJZP",
    checks: [
      expect(multi?.components.some((item) => item.component === "PILOT_ASSEMBLY" && item.warranty_duration_months === 36) === true, "pilot 36"),
      expect(multi?.components.some((item) => item.component === "SWITCH" && item.warranty_duration_months === 6) === true, "switch 6"),
      expect(multi?.primary_service.includes("TRUE_INSTALLATION") !== true, "labor and installation is not TRUE_INSTALLATION"),
      expect(multi?.labor.labor_charged === true && multi?.labor_warranty.status === "NOT_DOCUMENTED", "labor charged, warranty not inferred"),
    ],
  });

  const cal = get("CALURM");
  checks.push({
    invoice_code: "CALURM",
    checks: [
      expect(cal?.components.some((item) => item.component === "CONTROL_MODULE" && item.warranty_duration_months === 12) === true, "module 12"),
      expect(cal?.components.some((item) => item.component === "SWITCH" && item.warranty_duration_months === 6) === true, "switch 6"),
      expect(cal?.labor_warranty.status === "NOT_DOCUMENTED", "no inferred labor warranty"),
    ],
  });

  const twk = get("TWKN8Z");
  const twkPilot = twk?.components.find((item) => item.component === "PILOT_ASSEMBLY");
  checks.push({
    invoice_code: "TWKN8Z",
    checks: [
      expect(twkPilot?.warranty_duration_months === 12, "base pilot 12 months"),
      expect(twkPilot?.extended_warranty?.duration_months === 36, "extended 36 months preserved"),
      expect(twkPilot?.extended_warranty?.relationship === "AMBIGUOUS", "extended relationship not guessed"),
      expect(twkPilot?.extended_warranty?.effective_expiry_date == null, "effective expiry withheld"),
      expect(twk?.review_reasons.includes("EXTENDED_WARRANTY_AMBIGUOUS") === true, "extended flagged"),
    ],
  });

  const ext = get("8TGGHY");
  checks.push({
    invoice_code: "8TGGHY",
    checks: [
      expect(ext?.components.some((item) => item.component === "GAS_VALVE" && item.warranty_duration_months === 12) === true, "valve 12"),
      expect(ext?.components.some((item) => item.component === "PILOT_ASSEMBLY" && item.warranty_duration_months === 12) === true, "pilot 12"),
      expect(ext?.labor.raw_wording.some((text) => /6 months/i.test(text)) === true, "labor 6 months wording preserved"),
      expect(ext?.labor_warranty.status === "NOT_DOCUMENTED", "labor 6 months without warranty word is not a warranty"),
      expect(ext?.review_reasons.includes("EXTENDED_WARRANTY_AMBIGUOUS") === true, "extended parts-only flagged"),
    ],
  });

  const dual = get("9TZM8J");
  checks.push({
    invoice_code: "9TZM8J",
    checks: [
      expect(dual?.components.some((item) => item.component === "PILOT_ASSEMBLY" && item.warranty_duration_months === 36) === true, "pilot 36"),
      expect(dual?.components.some((item) => item.component === "GAS_VALVE" && item.warranty_duration_months === 48) === true, "valve 48"),
      expect(dual?.primary_service.includes("TRUE_INSTALLATION") !== true, "not true installation"),
    ],
  });

  const qrb = get("QRBE2K");
  checks.push({
    invoice_code: "QRBE2K",
    checks: [
      expect(qrb?.components.some((item) => item.component === "SWITCH" && item.warranty_duration_months === 6) === true, "switch 6"),
      expect(qrb?.components.some((item) => item.component === "PILOT_ASSEMBLY" && item.warranty_duration_months === 12 && item.work_action === "INSTALLED") === true, "pilot installed 12"),
      expect(qrb?.primary_service.includes("CLEANING") === true, "gas clean is cleaning"),
      expect(qrb?.primary_service.includes("TRUE_INSTALLATION") !== true, "pilot assembly installation is not TRUE_INSTALLATION"),
    ],
  });

  return checks;
}

function schemaProposal() {
  return {
    decision: "DO_NOT_WRITE_YET",
    reason: "Classification V1 is a derived intelligence layer and needs structured persistence distinct from historical invoice evidence.",
    rejected_storage: [
      "Do not store Classification V1 inside invoices.branding_snapshot_json",
      "Do not overwrite invoice line items, financials, customer master, or invoice_documents",
    ],
    proposed_tables: [
      {
        name: "invoice_service_intelligence",
        purpose: "One derived classification row per invoice / taxonomy version",
        columns: [
          "id uuid pk",
          "organization_id uuid not null",
          "invoice_id uuid not null",
          "taxonomy_version varchar(16) not null default 'V1'",
          "system_json json not null",
          "primary_service_json json not null",
          "service_detail_json json not null",
          "system_bucket varchar(16) not null",
          "labor_charged tinyint(1) not null",
          "labor_raw_wording_json json not null",
          "labor_warranty_status varchar(32) not null",
          "labor_warranty_months int null",
          "labor_warranty_source_text varchar(255) null",
          "labor_warranty_start date null",
          "labor_warranty_expiry date null",
          "classification_confidence varchar(8) not null",
          "review_reasons_json json not null",
          "findings_json json not null",
          "source_kind varchar(32) not null",
          "classified_at datetime(6) not null",
        ],
        unique: ["organization_id", "invoice_id", "taxonomy_version"],
      },
      {
        name: "invoice_service_intelligence_component",
        purpose: "Normalized functional component plus that component's own warranty",
        columns: [
          "id uuid pk",
          "organization_id uuid not null",
          "intelligence_id uuid not null",
          "invoice_id uuid not null",
          "component varchar(64) not null",
          "raw_name varchar(255) not null",
          "model_or_part_number varchar(128) null",
          "work_action varchar(16) not null",
          "warranty_status varchar(32) not null",
          "warranty_duration_months int null",
          "warranty_source_text varchar(255) null",
          "warranty_start_date date null",
          "warranty_expiry_date date null",
          "extended_warranty_months int null",
          "extended_warranty_source_text varchar(255) null",
          "extended_warranty_relationship varchar(16) null",
          "extended_effective_expiry date null",
          "confidence varchar(8) not null",
          "evidence_json json not null",
        ],
      },
      {
        name: "invoice_service_intelligence_warranty",
        purpose: "Invoice-level unscoped / labor / extended warranties that must not be silently attached to a part",
        columns: [
          "id uuid pk",
          "organization_id uuid not null",
          "intelligence_id uuid not null",
          "invoice_id uuid not null",
          "kind varchar(16) not null",
          "component varchar(64) null",
          "scope varchar(24) not null",
          "status varchar(32) not null",
          "duration_months int null",
          "source_text varchar(255) not null",
          "start_date date null",
          "expiry_date date null",
          "confidence varchar(8) not null",
        ],
      },
    ],
    invariants: [
      "Historical source evidence stays on invoices, invoice_line_items, invoice_documents, and PDF objects",
      "Derived intelligence is versioned and replaceable without mutating source rows",
      "Cross-tenant writes remain 0: every row carries organization_id and is inserted only for Phoenix during execute",
      "No campaign, lead, job, SMS, or reactivation eligibility columns in this schema",
    ],
  };
}

function representative(records: ClassificationV1[]): ClassificationV1[] {
  const preferred = [
    "62QJZP",
    "9TZM8J",
    "TWKN8Z",
    "8TGGHY",
    "6K5NIA",
    "WET6R6",
    "70QLL2",
    "74BY7X",
    "QRBE2K",
    "CALURM",
  ];
  return preferred
    .map((code) => records.find((row) => row.invoice_code === code))
    .filter((row): row is ClassificationV1 => Boolean(row));
}

export async function loadClassificationV1Records(): Promise<{
  records: ClassificationV1[];
  source: string;
}> {
  const harnessRoot = join(process.cwd(), "_runtime_harness");
  const batchDir = join(harnessRoot, "workiz-invoice-pdf-batch1");
  const extractions = loadExtractions(join(batchDir, "extractions"));
  const fallbackCodes = loadFallbackCodes(join(batchDir, "enrichment-write-report.json"));

  let rows: CorpusRow[] = [];
  let source = "db";
  try {
    const fromDb = await loadFromDatabase(extractions);
    if (!fromDb || fromDb.length === 0) throw new Error("No enriched Phoenix invoices in database");
    rows = fromDb;
  } catch (error) {
    if (fallbackCodes.length === 0) throw error;
    source = "harness_fallback";
    rows = loadFromHarnessFallback(extractions, fallbackCodes);
  }

  return { records: rows.map(classifyInvoiceV1), source };
}

export async function runClassificationV1DryRun(): Promise<{
  outputDir: string;
  total: number;
  source: string;
}> {
  abortIfWriteFlags(process.argv.slice(2));

  const harnessRoot = join(process.cwd(), "_runtime_harness");
  const outputDir = join(harnessRoot, "service-intelligence");
  const { records, source } = await loadClassificationV1Records();
  const validation = validateKnown(records);
  const reviewQueue = records
    .filter((row) => row.review_reasons.length > 0)
    .map((row) => ({
      invoice_code: row.invoice_code,
      invoice_id: row.invoice_id,
      classification_confidence: row.classification_confidence,
      review_reasons: row.review_reasons,
      system: row.system,
      primary_service: row.primary_service,
      components: row.components.map((item) => item.component),
    }));

  const otherComponents = unique(
    records.flatMap((row) => row.components.map((item) => item.component))
      .filter((label) => ![
        "PILOT_ASSEMBLY",
        "GAS_VALVE",
        "CONTROL_MODULE",
        "SWITCH",
        "REMOTE",
        "RECEIVER",
        "BLOWER_FAN",
        "THERMOCOUPLE",
        "THERMOPILE",
      ].includes(label)),
  );

  const documentedParts = records.flatMap((row) => row.parts_warranty).filter((item) =>
    item.status === "DOCUMENTED_ACTIVE" || item.status === "DOCUMENTED_EXPIRED"
  );
  const laborCharged = records.filter((row) => row.labor.labor_charged);
  const laborDocumented = laborCharged.filter((row) =>
    row.labor_warranty.status === "DOCUMENTED_ACTIVE" || row.labor_warranty.status === "DOCUMENTED_EXPIRED"
  );

  const report = {
    generated_at: new Date().toISOString(),
    analysis_as_of: ANALYSIS_AS_OF,
    taxonomy_version: TAXONOMY_VERSION,
    mode: "DRY_RUN",
    organization_id: PHOENIX_ORG_ID,
    source,
    TOTAL_INVOICES: records.length,
    CLASSIFIED: records.length,
    HIGH_CONFIDENCE: records.filter((row) => row.classification_confidence === "HIGH").length,
    MEDIUM_CONFIDENCE: records.filter((row) => row.classification_confidence === "MEDIUM").length,
    LOW_REVIEW: records.filter((row) => row.classification_confidence === "LOW").length,
    SYSTEM: {
      GAS: records.filter((row) => hasSystem(row, "GAS") && row.system_bucket !== "MIXED").length,
      WOOD: records.filter((row) => hasSystem(row, "WOOD") && row.system_bucket !== "MIXED").length,
      CHIMNEY: records.filter((row) => hasSystem(row, "CHIMNEY") && row.system_bucket !== "MIXED").length,
      MIXED: records.filter((row) => row.system_bucket === "MIXED").length,
      UNKNOWN: records.filter((row) => row.system_bucket === "UNKNOWN").length,
      OTHER: records.filter((row) => row.system_bucket === "OTHER").length,
    },
    PRIMARY_SERVICE: {
      REPAIR: records.filter((row) => row.primary_service.includes("REPAIR")).length,
      INSPECTION: records.filter((row) => row.primary_service.includes("INSPECTION")).length,
      CLEANING: records.filter((row) => row.primary_service.includes("CLEANING")).length,
      MAINTENANCE: records.filter((row) => row.primary_service.includes("MAINTENANCE")).length,
      TRUE_INSTALLATION: records.filter((row) => row.primary_service.includes("TRUE_INSTALLATION")).length,
      OTHER: records.filter((row) => row.primary_service.includes("OTHER")).length,
      UNKNOWN: records.filter((row) => row.primary_service.includes("UNKNOWN")).length,
    },
    COMPONENTS: {
      PILOT_ASSEMBLY: componentCount(records, "PILOT_ASSEMBLY"),
      GAS_VALVE: componentCount(records, "GAS_VALVE"),
      CONTROL_MODULE: componentCount(records, "CONTROL_MODULE"),
      SWITCH: componentCount(records, "SWITCH"),
      REMOTE_RECEIVER: remoteReceiverCount(records),
      BLOWER_FAN: componentCount(records, "BLOWER_FAN"),
      THERMOCOUPLE: componentCount(records, "THERMOCOUPLE"),
      THERMOPILE: componentCount(records, "THERMOPILE"),
      OTHER: records.filter((row) => row.components.some((item) => otherComponents.includes(item.component))).length,
      OTHER_LABELS: otherComponents,
    },
    LABOR_CHARGED: laborCharged.length,
    LABOR_WARRANTY_DOCUMENTED: laborDocumented.length,
    LABOR_WARRANTY_NOT_DOCUMENTED: laborCharged.filter((row) => row.labor_warranty.status === "NOT_DOCUMENTED").length,
    LABOR_WARRANTY_UNPARSEABLE: records.filter((row) => row.labor_warranty.status === "UNPARSEABLE").length,
    PART_WARRANTIES_DOCUMENTED: documentedParts.length,
    PART_WARRANTIES_ACTIVE: documentedParts.filter((item) => item.status === "DOCUMENTED_ACTIVE").length,
    PART_WARRANTIES_EXPIRED: documentedParts.filter((item) => item.status === "DOCUMENTED_EXPIRED").length,
    PART_WARRANTY_AMBIGUITIES: records.filter((row) =>
      row.review_reasons.includes("AMBIGUOUS_WARRANTY_SCOPE") || row.review_reasons.includes("EXTENDED_WARRANTY_AMBIGUOUS")
    ).length,
    REVIEW_QUEUE: reviewQueue.length,
    REVIEW_REASON_COUNTS: countBy(reviewQueue.flatMap((row) => row.review_reasons)),
    PRODUCTION_RECORDS_MODIFIED: FORBIDDEN_WRITE,
    FINANCIAL_VALUES_MODIFIED: FORBIDDEN_WRITE,
    CUSTOMER_MASTER_MODIFIED: FORBIDDEN_WRITE,
    PDF_DOCUMENTS_MODIFIED: FORBIDDEN_WRITE,
    CROSS_TENANT_WRITES: FORBIDDEN_WRITE,
    known_case_validation: validation,
    known_case_failures: validation.flatMap((row) => row.checks.filter((check) => !check.ok).map((check) => `${row.invoice_code}: ${check.message}`)),
    representative_invoices: representative(records),
    records,
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "classification-v1.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(outputDir, "classification-v1-review-queue.json"), JSON.stringify({
    generated_at: report.generated_at,
    organization_id: PHOENIX_ORG_ID,
    taxonomy_version: TAXONOMY_VERSION,
    queued: reviewQueue.length,
    reason_counts: report.REVIEW_REASON_COUNTS,
    records: reviewQueue,
  }, null, 2));
  writeFileSync(join(outputDir, "classification-v1-schema-proposal.json"), JSON.stringify(schemaProposal(), null, 2));

  return { outputDir, total: records.length, source };
}

async function main() {
  const result = await runClassificationV1DryRun();
  const reportPath = join(result.outputDir, "classification-v1.json");
  if (!existsSync(reportPath)) throw new Error("Classification V1 report was not written");
  console.log(`Classification V1 dry-run: ${result.total} invoices from ${result.source}`);
  console.log(`Wrote harness reports to ${result.outputDir}`);
  console.log("Production writes: 0");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
