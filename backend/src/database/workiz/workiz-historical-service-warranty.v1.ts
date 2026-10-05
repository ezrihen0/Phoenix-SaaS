import {
  addMonths,
  detectSystems,
  derivePrimaryServices,
  isLaborChargeTitle,
  matchRules,
  parseScopedWarranties,
  SERVICE_DETAIL_RULES,
  PART_COMPONENT_RULES,
  stripBoilerplate,
  systemBucket,
} from "../workiz-service-intelligence-discovery";

import type {
  WorkizHistoricalInvoiceLine,
  WorkizHistoricalParseCandidate,
  WorkizServiceIntelligence,
  WorkizWarrantyEvidenceItem,
  WorkizWarrantyEvidenceSourceLocation,
  WorkizWarrantyReconstruction,
  WorkizWarrantyScopeReconstruction,
} from "./workiz-historical-types.v1";

const DEFAULT_PARTS_MONTHS = 12;
const DEFAULT_LABOR_MONTHS = 6;
const ANALYSIS_AS_OF = new Date().toISOString().slice(0, 10);
const WARRANTY_SNIPPET_PATTERN = /.{0,80}\bwarrant(?:y|ies|ied)\b.{0,120}/gi;

function warrantyDynamicStatus(endDate: string | null): "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "UNKNOWN" {
  if (!endDate) return "UNKNOWN";
  const end = Date.parse(endDate);
  const asOf = Date.parse(ANALYSIS_AS_OF);
  if (Number.isNaN(end) || Number.isNaN(asOf)) return "UNKNOWN";
  const days = Math.floor((end - asOf) / (24 * 60 * 60 * 1000));
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "EXPIRING_SOON";
  return "ACTIVE";
}

function inferEvidenceScope(trimmed: string): WorkizWarrantyEvidenceItem["scope"] {
  if (/\b(labou?r|installation|workmanship)\b/i.test(trimmed)) return "LABOR";
  if (/\b(part|parts|component|pilot|valve|assembly)\b/i.test(trimmed)) return "PARTS";
  return "GENERIC";
}

function extractExplicitDurationSnippet(trimmed: string): string | null {
  return trimmed.match(/\b(\d+\s*(?:day|days|week|weeks|month|months|year|years))\b/i)?.[1] ?? null;
}

function parseMonthsFromDuration(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.match(/(\d+)\s*(month|months|year|years)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return /year/i.test(match[2]) ? value * 12 : value;
}

function warrantyStartDate(candidate: WorkizHistoricalParseCandidate): string | null {
  return candidate.job.completion_date
    ?? candidate.job.service_date
    ?? candidate.invoice?.invoice_date
    ?? null;
}

export type WorkizWarrantyCorpusSource = {
  text: string;
  source_location: WorkizWarrantyEvidenceSourceLocation;
  source_line_index?: number | null;
};

export function buildWarrantyEvidenceFromCorpus(sources: WorkizWarrantyCorpusSource[]): WorkizWarrantyEvidenceItem[] {
  const items: WorkizWarrantyEvidenceItem[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    const text = source.text?.trim();
    if (!text || !/\bwarrant(?:y|ies|ied)\b/i.test(text)) continue;

    const snippets =
      source.source_location === "INVOICE_LINE"
        ? [text]
        : (text.match(WARRANTY_SNIPPET_PATTERN) ?? []).map((value) => value.trim());

    for (const trimmed of snippets) {
      if (!trimmed) continue;
      const key = `${source.source_location}:${source.source_line_index ?? ""}:${trimmed}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        scope: inferEvidenceScope(trimmed),
        raw_text: trimmed,
        explicit_duration: extractExplicitDurationSnippet(trimmed),
        source_location: source.source_location,
        source_line_index: source.source_line_index ?? null,
      });
    }
  }

  return items;
}

/** @deprecated Use buildWarrantyEvidenceFromCorpus */
export function extractWarrantyEvidenceFromText(text: string): WorkizWarrantyEvidenceItem[] {
  return buildWarrantyEvidenceFromCorpus([{ text, source_location: "WARRANTY_SECTION", source_line_index: null }]);
}

function pickSourceLocation(
  evidence: WorkizWarrantyEvidenceItem[],
  scope: "PARTS" | "LABOR",
  rawText: string | null,
): WorkizWarrantyEvidenceSourceLocation | null {
  if (rawText) {
    const exact = evidence.find((item) => item.raw_text === rawText || rawText.includes(item.raw_text));
    if (exact) return exact.source_location;
  }
  const scoped = evidence.find((item) => item.scope === scope);
  if (scoped) return scoped.source_location;
  const generic = evidence.find((item) => item.scope === "GENERIC");
  return generic?.source_location ?? evidence[0]?.source_location ?? null;
}

function hasExplicitEvidenceForScope(
  evidence: WorkizWarrantyEvidenceItem[],
  scope: "PARTS" | "LABOR",
): boolean {
  return evidence.some((item) => item.scope === scope);
}

function hasGenericWarrantyEvidence(evidence: WorkizWarrantyEvidenceItem[]): boolean {
  return evidence.some((item) => item.scope === "GENERIC");
}

function resolveScopeWarranty(input: {
  scope: "PARTS" | "LABOR";
  defaultMonths: number;
  startDate: string;
  evidence: WorkizWarrantyEvidenceItem[];
  scoped: ReturnType<typeof parseScopedWarranties>;
}): WorkizWarrantyScopeReconstruction {
  const scopeKey = input.scope === "PARTS" ? "parts" : "labor";
  const scopedLeg = input.scoped[scopeKey];
  const documentedMonths = scopedLeg.duration_months;
  const explicitForScope = hasExplicitEvidenceForScope(input.evidence, input.scope);
  const genericEvidence = hasGenericWarrantyEvidence(input.evidence);
  const scopeSpecificEvidence = explicitForScope;

  if (documentedMonths != null) {
    const endDate = addMonths(input.startDate, documentedMonths);
    return {
      scope: input.scope,
      duration_months: documentedMonths,
      start_date: input.startDate,
      end_date: endDate,
      provenance: "DOCUMENTED",
      status: warrantyDynamicStatus(endDate),
      source_text: scopedLeg.raw_text,
      source_location: pickSourceLocation(input.evidence, input.scope, scopedLeg.raw_text),
    };
  }

  const unparseableOnScope = scopedLeg.status === "UNPARSEABLE";
  const unparseableUnspecified = input.scoped.unspecified.status === "UNPARSEABLE";

  const fallbackMonths = parseMonthsFromDuration(
    input.evidence.find((item) => item.scope === input.scope)?.explicit_duration ?? null,
  );
  if (fallbackMonths != null && scopeSpecificEvidence) {
    const endDate = addMonths(input.startDate, fallbackMonths);
    return {
      scope: input.scope,
      duration_months: fallbackMonths,
      start_date: input.startDate,
      end_date: endDate,
      provenance: "DOCUMENTED",
      status: warrantyDynamicStatus(endDate),
      source_text: input.evidence.find((item) => item.scope === input.scope)?.raw_text ?? null,
      source_location: pickSourceLocation(input.evidence, input.scope, null),
    };
  }

  if (genericEvidence && unparseableUnspecified) {
    return {
      scope: input.scope,
      duration_months: null,
      start_date: input.startDate,
      end_date: null,
      provenance: "AMBIGUOUS_WARRANTY",
      status: "UNKNOWN",
      source_text: input.scoped.unspecified.raw_text,
      source_location: pickSourceLocation(input.evidence, input.scope, input.scoped.unspecified.raw_text),
    };
  }

  if (scopeSpecificEvidence && (unparseableOnScope || unparseableUnspecified)) {
    return {
      scope: input.scope,
      duration_months: null,
      start_date: input.startDate,
      end_date: null,
      provenance: "AMBIGUOUS_WARRANTY",
      status: "UNKNOWN",
      source_text: scopedLeg.raw_text ?? input.evidence.find((item) => item.scope === input.scope)?.raw_text ?? null,
      source_location: pickSourceLocation(input.evidence, input.scope, scopedLeg.raw_text),
    };
  }

  if (scopeSpecificEvidence) {
    return {
      scope: input.scope,
      duration_months: null,
      start_date: input.startDate,
      end_date: null,
      provenance: "AMBIGUOUS_WARRANTY",
      status: "UNKNOWN",
      source_text: input.evidence.find((item) => item.scope === input.scope)?.raw_text ?? null,
      source_location: pickSourceLocation(input.evidence, input.scope, null),
    };
  }

  if (!explicitForScope && !genericEvidence) {
    const endDate = addMonths(input.startDate, input.defaultMonths);
    return {
      scope: input.scope,
      duration_months: input.defaultMonths,
      start_date: input.startDate,
      end_date: endDate,
      provenance: "PHOENIX_DEFAULT_POLICY",
      status: warrantyDynamicStatus(endDate),
      source_text: null,
      source_location: null,
    };
  }

  if (!explicitForScope && genericEvidence) {
    const endDate = addMonths(input.startDate, input.defaultMonths);
    return {
      scope: input.scope,
      duration_months: input.defaultMonths,
      start_date: input.startDate,
      end_date: endDate,
      provenance: "PHOENIX_DEFAULT_POLICY",
      status: warrantyDynamicStatus(endDate),
      source_text: null,
      source_location: null,
    };
  }

  return {
    scope: input.scope,
    duration_months: null,
    start_date: input.startDate,
    end_date: null,
    provenance: "AMBIGUOUS_WARRANTY",
    status: "UNKNOWN",
    source_text: input.evidence.find((item) => item.scope === input.scope)?.raw_text ?? null,
    source_location: pickSourceLocation(input.evidence, input.scope, null),
  };
}

export function isWorkizWarrantyReconstructionValid(reconstruction: WorkizWarrantyReconstruction | null): boolean {
  if (!reconstruction) return false;
  for (const leg of [reconstruction.parts, reconstruction.labor]) {
    if (leg.provenance === "DOCUMENTED") {
      if (leg.duration_months == null || leg.end_date == null) return false;
    }
    if (leg.provenance === "PHOENIX_DEFAULT_POLICY") {
      if (leg.duration_months == null || leg.end_date == null) return false;
    }
    if (leg.provenance === "AMBIGUOUS_WARRANTY" && leg.duration_months != null) {
      return false;
    }
  }
  return true;
}

export function reconstructWarranty(candidate: WorkizHistoricalParseCandidate): WorkizWarrantyReconstruction | null {
  if (!candidate.invoice?.invoice_date) return null;
  const startDate = warrantyStartDate(candidate);
  if (!startDate) return null;

  const warrantyTexts = candidate.warranty_evidence.map((item) => item.raw_text);
  const lineTitles = candidate.invoice_lines.map((line) => line.raw_description);
  const scoped = parseScopedWarranties(warrantyTexts, lineTitles, candidate.invoice.invoice_date);

  return {
    parts: resolveScopeWarranty({
      scope: "PARTS",
      defaultMonths: DEFAULT_PARTS_MONTHS,
      startDate,
      evidence: candidate.warranty_evidence,
      scoped,
    }),
    labor: resolveScopeWarranty({
      scope: "LABOR",
      defaultMonths: DEFAULT_LABOR_MONTHS,
      startDate,
      evidence: candidate.warranty_evidence,
      scoped,
    }),
  };
}

export function applyWarrantyReviewFlags(candidate: WorkizHistoricalParseCandidate): void {
  const reconstruction = candidate.warranty_reconstruction;
  if (!reconstruction) return;
  if (reconstruction.parts.provenance === "AMBIGUOUS_WARRANTY") {
    candidate.review_flags.push("AMBIGUOUS_WARRANTY:PARTS");
  }
  if (reconstruction.labor.provenance === "AMBIGUOUS_WARRANTY") {
    candidate.review_flags.push("AMBIGUOUS_WARRANTY:LABOR");
  }
}

export function buildServiceIntelligence(candidate: WorkizHistoricalParseCandidate): WorkizServiceIntelligence {
  const corpus = [
    ...candidate.invoice_lines.map((line) => line.raw_description),
    candidate.job.historical_notes ?? "",
  ].join(" ");
  const systems = detectSystems(corpus);
  const system = systemBucket(systems);
  const serviceDetails = matchRules(corpus, SERVICE_DETAIL_RULES);
  const components = matchRules(corpus, PART_COMPONENT_RULES);
  const primaryServices = derivePrimaryServices(serviceDetails, false);
  const labor = candidate.invoice_lines.some((line) => line.structured.is_labor)
    || isLaborChargeTitle(corpus);

  let workAction: string | null = null;
  const lowered = corpus.toLowerCase();
  if (/\breplace/i.test(lowered)) workAction = "REPLACED";
  else if (/\binstall/i.test(lowered)) workAction = "INSTALLED";
  else if (/\brepair/i.test(lowered)) workAction = "REPAIRED";
  else if (/\bclean/i.test(lowered)) workAction = "CLEANED";
  else if (/\binspect/i.test(lowered)) workAction = "INSPECTED";

  const confidenceEvidence = candidate.invoice_lines.map((line) => line.raw_description).slice(0, 8);

  return {
    system: system === "UNKNOWN" ? null : system,
    primary_service: primaryServices[0] ?? null,
    service_detail: serviceDetails[0] ?? null,
    component: components[0] ?? null,
    work_action: workAction,
    labor,
    findings: [],
    raw_evidence: confidenceEvidence,
  };
}

export function enrichLineStructuredFields(lines: WorkizHistoricalInvoiceLine[]): WorkizHistoricalInvoiceLine[] {
  return lines.map((line) => {
    const { title } = stripBoilerplate(line.raw_description);
    const components = matchRules(line.raw_description, PART_COMPONENT_RULES);
    const systems = detectSystems(line.raw_description);
    return {
      ...line,
      structured: {
        system: systemBucket(systems) === "UNKNOWN" ? null : systemBucket(systems),
        component: components[0] ?? null,
        work_action: null,
        is_labor: isLaborChargeTitle(title || line.raw_description),
      },
    };
  });
}
