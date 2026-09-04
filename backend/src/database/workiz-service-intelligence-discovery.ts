import "dotenv/config";
import "reflect-metadata";

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

import { DataSource, In } from "typeorm";

import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import type {
  WorkizPdfNormalizedInvoice,
  WorkizPdfNormalizedLineItem,
  WorkizPdfNormalizedPart,
  WorkizPdfServiceSummaryBlock,
} from "./workiz/workiz-invoice-pdf-normalizer";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "./workiz/workiz-invoice-upsert";

export const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const PHOENIX_ORG_SLUG = "phoenix-fireplace";
const REPRESENTATIVE_CAP = 12;
const RAW_EXAMPLE_CAP = 8;
const FORBIDDEN_FLAGS = ["--execute", "--write", "--enrich", "--apply", "--commit", "--second-run"];

type Snapshot = {
  import_source?: string;
  enrichment_status?: string;
  workiz_invoice_code?: string;
  pdf_enrichment?: {
    service_summary?: WorkizPdfServiceSummaryBlock[];
    warranty?: {
      text_blocks?: string[];
      duration_mentions?: string[];
      assurance_blocks?: string[];
    } | null;
    notes?: string | null;
    terms?: string | null;
    operational_line_items?: WorkizPdfNormalizedLineItem[];
  };
};

type ConceptBucket = {
  canonical_label: string;
  invoice_codes: Set<string>;
  raw_examples: Set<string>;
};

export type WarrantyStatus =
  | "DOCUMENTED_ACTIVE"
  | "DOCUMENTED_EXPIRED"
  | "EXPLICIT_NO_WARRANTY"
  | "NOT_DOCUMENTED"
  | "UNPARSEABLE";

export type ScopedWarranty = {
  status: WarrantyStatus;
  duration_months: number | null;
  raw_text: string | null;
  source_invoice_date: string | null;
  calculable_expiry_date: string | null;
};

type InvoiceAssignment = {
  invoice_code: string;
  invoice_id: string | null;
  issued_at: string | null;
  systems: string[];
  system_bucket: "GAS" | "WOOD" | "CHIMNEY" | "MIXED" | "OTHER" | "UNKNOWN";
  primary_services: string[];
  service_details: string[];
  equipment: string[];
  work_performed: string[];
  parts: Array<{ component: string; model_numbers: string[] }>;
  findings: string[];
  labor: {
    labor_charged: "true" | "false" | "unknown";
    labor_raw_text: string[];
  };
  parts_warranty: ScopedWarranty;
  labor_warranty: ScopedWarranty;
  unspecified_warranty: ScopedWarranty;
  crm_requested_service_type: string | null;
  short_titles: string[];
  previously_would_be_installation: boolean;
  true_installation: boolean;
  confidence: "high" | "medium" | "low";
  review_reasons: string[];
  missing_extraction: boolean;
  source: "db" | "harness_fallback";
};

const PREVIOUS_INSTALLATION_COUNT = 145;
export const ANALYSIS_AS_OF = "2026-09-02";

export type SourceLine = {
  raw: string;
  title: string;
  amount_cents: number | null;
};

export type CorpusRow = {
  invoice_code: string;
  invoice_id: string | null;
  issued_at: string | null;
  crm_requested_service_type: string | null;
  job_description: string | null;
  line_texts: string[];
  short_titles: string[];
  service_summary_lines: string[];
  notes: string[];
  warranty_blocks: string[];
  extracted_parts: WorkizPdfNormalizedPart[];
  source_lines: SourceLine[];
  missing_extraction: boolean;
  source: "db" | "harness_fallback";
};

export function abortIfWriteFlags(argv: string[]): void {
  const hit = argv.filter((arg) => FORBIDDEN_FLAGS.includes(arg));
  if (hit.length > 0) {
    throw new Error(`Read-only discovery aborted. Forbidden flag(s): ${hit.join(", ")}`);
  }
}

export function loadExtractions(extractionsDir: string): Map<string, WorkizPdfNormalizedInvoice> {
  const map = new Map<string, WorkizPdfNormalizedInvoice>();
  if (!existsSync(extractionsDir)) return map;
  for (const file of readdirSync(extractionsDir).filter((name) => name.endsWith(".json"))) {
    const payload = JSON.parse(readFileSync(join(extractionsDir, file), "utf8")) as WorkizPdfNormalizedInvoice;
    if (payload.invoice_number) map.set(payload.invoice_number, payload);
  }
  return map;
}

export function loadFallbackCodes(reportPath: string): string[] {
  if (!existsSync(reportPath)) return [];
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
    records?: Array<{ invoiceNumber?: string; action?: string }>;
  };
  const codes = new Set<string>();
  for (const record of report.records ?? []) {
    if (record.action === "skipped_already_enriched" && record.invoiceNumber) {
      codes.add(record.invoiceNumber);
    }
  }
  return [...codes];
}

const BOILERPLATE_MARKERS = [
  /A WETT inspection is a detailed safety assessment/i,
  /Our full chimney cleaning service ensures/i,
  /Book your professional safety inspection today/i,
  /Safety Inspection with Camera Analysis/i,
  /A thermopile is a device that converts heat/i,
  /A thermocouple is a safety device/i,
  /A fireplace pilot assembly is a crucial component/i,
  /Grade 1 Heat-Resistant Mortar/i,
  /High-quality stainless steel liner kit/i,
  /We value and appreciate our senior customers/i,
  /Valve reset refers to the process/i,
  /Most insurance companies and many lenders/i,
  /We understand that home repairs can be unexpected/i,
  /Imported from Workiz historical invoice/i,
];

const NOISE_NOTES = [
  /^thank you for your business!?\s*$/i,
  /^by paying the due balance/i,
];

export function stripBoilerplate(text: string): { title: string; remainder: string; hadBoilerplate: boolean } {
  const cleaned = text.replace(/\s+/g, " ").trim();
  let cut = cleaned.length;
  let hadBoilerplate = false;
  for (const marker of BOILERPLATE_MARKERS) {
    const match = cleaned.match(marker);
    if (match?.index != null && match.index < cut) {
      cut = match.index;
      hadBoilerplate = true;
    }
  }
  const rawTitle = cleaned.slice(0, cut).replace(/[–—:$]+$/g, "").replace(/\s+/g, " ").trim();
  const title = rawTitle || cleaned.slice(0, 96).trim();
  return { title, remainder: cleaned.slice(cut).trim(), hadBoilerplate };
}

export function isUsableTitle(title: string): boolean {
  if (!title.trim()) return false;
  if (/^Imported from Workiz/i.test(title)) return false;
  if (/We understand that home repairs/i.test(title)) return false;
  if (/By paying the due balance/i.test(title)) return false;
  if (title.length > 160) return false;
  return true;
}

export function isNoiseText(text: string): boolean {
  return NOISE_NOTES.some((pattern) => pattern.test(text.trim()));
}

function uniquePush(target: string[], value: string | null | undefined): void {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  if (!trimmed) return;
  if (!target.includes(trimmed)) target.push(trimmed);
}

function addAllTexts(target: string[], values: Array<string | null | undefined>): void {
  for (const value of values) uniquePush(target, value);
}

function parseSnapshot(raw: string | null | undefined): Snapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function addMonths(iso: string, months: number): string {
  const date = new Date(iso);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function createBucket(label: string): ConceptBucket {
  return { canonical_label: label, invoice_codes: new Set<string>(), raw_examples: new Set<string>() };
}

function recordConcept(
  buckets: Map<string, ConceptBucket>,
  label: string,
  invoiceCode: string,
  raw: string,
): void {
  const existing = buckets.get(label) ?? createBucket(label);
  existing.invoice_codes.add(invoiceCode);
  if (raw.trim()) existing.raw_examples.add(raw.replace(/\s+/g, " ").trim().slice(0, 180));
  buckets.set(label, existing);
}

function serializeConcepts(buckets: Map<string, ConceptBucket>) {
  return [...buckets.values()]
    .map((bucket) => ({
      canonical_label: bucket.canonical_label,
      invoice_count: bucket.invoice_codes.size,
      raw_examples: [...bucket.raw_examples].slice(0, RAW_EXAMPLE_CAP),
      representative_invoice_codes: [...bucket.invoice_codes].slice(0, REPRESENTATIVE_CAP),
    }))
    .sort((a, b) => b.invoice_count - a.invoice_count || a.canonical_label.localeCompare(b.canonical_label));
}

type Rule = { label: string; pattern: RegExp };

const SYSTEM_RULES: Array<{ label: "GAS" | "WOOD" | "CHIMNEY" | "OTHER"; patterns: RegExp[] }> = [
  {
    label: "GAS",
    patterns: [
      /\bgas fireplace\b/i,
      /\bfull gas\b/i,
      /\bgas (?:clean|tune|valve|remote|leak|fitting|fittings|assistance)\b/i,
      /\bmillivolt\b/i,
      /\bthermopile\b/i,
      /\bthermocouple\b/i,
      /\b(?:main )?gas valve\b/i,
      /\bmain valve\b/i,
      /\bpilot(?:\s+assembly)?\b/i,
      /\bcontrol module\b/i,
      /\bfireplace switch\b/i,
      /\bfireplace (?:remote|blower|ignition)\b/i,
      /\b(?:ng|lp|propane|natural gas)\b/i,
      /\bignition box\b/i,
      /\bgas remote\b/i,
      /\bvalve reset\b/i,
    ],
  },
  {
    label: "WOOD",
    patterns: [
      /\bwood[\s-]?burning\b/i,
      /\bwood stove\b/i,
      /\bwett\b/i,
      /\bwood plates\b/i,
    ],
  },
  {
    label: "CHIMNEY",
    patterns: [
      /\bchimney\b/i,
      /\bflue\b/i,
      /\bsmoke chamber\b/i,
      /\bchase cover\b/i,
      /\bcrown\b/i,
      /\bdamper\b/i,
      /\bliner\b/i,
      /\bcamera inspect/i,
    ],
  },
  {
    label: "OTHER",
    patterns: [/\bbbq\b/i, /\bbarbecue\b/i],
  },
];

export const SERVICE_DETAIL_RULES: Rule[] = [
  { label: "WETT", pattern: /\bwett\b/i },
  { label: "CAMERA_INSPECTION", pattern: /\bcamera\b/i },
  { label: "SAFETY_INSPECTION", pattern: /\bsafety\s*inspect/i },
  { label: "INSPECTION_GENERAL", pattern: /\binspect(?:ion|ion fee|ion level|ion standard)?\b/i },
  { label: "GAS_CLEAN", pattern: /\b(?:full gas|gas (?:clean|tune)|cleaning the gas|gas fireplace clean|gas clean)\b/i },
  { label: "CHIMNEY_SWEEP", pattern: /\b(?:chimney clean|crown cleaning|basic chimney|chimney cleaning)\b/i },
  { label: "DIAGNOSTIC", pattern: /\bdiagnos|system reset|full diagnostic|verified thermopile\b/i },
  { label: "MAINTENANCE", pattern: /\bmaintenance|valve reset|valve clean|pilot clean|burner pan clean|tune\s*up\b/i },
  { label: "FIREBOX_MASONRY", pattern: /\bfirebox (?:patch|paint|pach)|brick|mortar|cement|firewall|clay glue\b/i },
  { label: "CHIMNEY_REPAIR", pattern: /\bchase cover|crown repair|chimney (?:patch|cap|liner)|damper\b/i },
  { label: "PART_REPLACEMENT", pattern: /\bpilot|main valve|thermopile|thermocouple|control module|receiver|blower|ignit|gasket|fan motor|fireplace switch|remote control\b/i },
  { label: "EXPLICIT_REPAIR", pattern: /\b(?:repair|rewiring|replacement|replace|fixing|pach)\b/i },
  { label: "BBQ_GAS_FITTING", pattern: /\bbbq|barbecue\b/i },
  { label: "ADMINISTRATIVE", pattern: /\b(?:tip|refund|mil(?:e|a)ge|credit fee|manager discount|senior discount|google review|imported workiz|job grade)\b/i },
];

const TRUE_INSTALLATION_PATTERN = /\b(?:(?:new\s+)?(?:gas\s+|wood\s+)?(?:fireplace|insert|stove|appliance)\s+install(?:ation|ing)?|install(?:ation|ing)?\s+(?:of\s+)?(?:a\s+|the\s+|new\s+)?(?:gas\s+|wood\s+)?(?:fireplace|insert|stove|appliance)|new (?:fireplace|insert|stove|appliance))\b/i;

const LEGACY_INSTALLATION_PATTERN = /\binstall|labor and installation|labor installation\b/i;

const LABOR_CHARGE_PATTERN = /\b(?:labor\s*(?:and|&|,)?\s*installation|installation\s+labor|labor\s+installation|^labor\b|\blabor\b)/i;

const WORK_RULES: Rule[] = [
  { label: "Full gas clean", pattern: /\b(?:full gas|gas fireplace clean|gas clean|gas tune|cleaning the gas firebox)\b/i },
  { label: "Full chimney clean", pattern: /\bfull chimney clean\b/i },
  { label: "Basic chimney clean", pattern: /\bbasic chimney\b/i },
  { label: "Chimney clean", pattern: /\bchimney clean\b/i },
  { label: "WETT inspection", pattern: /\bwett\b/i },
  { label: "Safety / camera inspection", pattern: /\bsafety inspect|camera inspect|\bcamera\b/i },
  { label: "Inspection", pattern: /\binspect/i },
  { label: "Valve reset / system reset", pattern: /\bvalve reset|system reset\b/i },
  { label: "Valve clean", pattern: /\bvalve clean|cleaning the valve\b/i },
  { label: "Pilot assembly work", pattern: /\bpilot\b/i },
  { label: "Main valve work", pattern: /\bmain valve|gas valve\b/i },
  { label: "Firebox patch", pattern: /\bfirebox (?:patch|pach)\b/i },
  { label: "Firebox paint", pattern: /\bfirebox paint\b/i },
  { label: "Gas leak check", pattern: /\bgas leak\b/i },
  { label: "Remote control work", pattern: /\bremote\b/i },
  { label: "Blower / fan work", pattern: /\bblower|\bfan\b/i },
  { label: "Damper work", pattern: /\bdamper\b/i },
  { label: "Chase cover work", pattern: /\bchase cover\b/i },
  { label: "Crown work", pattern: /\bcrown\b/i },
  { label: "Chimney cap work", pattern: /\bchimney cap\b/i },
  { label: "Liner work", pattern: /\bliner\b/i },
  { label: "Brick / mortar / cement", pattern: /\bbrick|mortar|cement|clay glue\b/i },
  { label: "Maintenance", pattern: /\bmaintenance\b/i },
  { label: "Control module / ignition work", pattern: /\bcontrol module|ignition box|main computer|new ignition\b/i },
  { label: "Thermopile work", pattern: /\bthermopile\b/i },
  { label: "Thermocouple work", pattern: /\bthermocouple\b/i },
  { label: "Fireplace switch work", pattern: /\bswitch\b/i },
  { label: "Rewiring", pattern: /\brewir/i },
  { label: "Gas fittings / pipe work", pattern: /\bgas fittings|gas assistance pipe|bbq gas fitting\b/i },
  { label: "Gasket work", pattern: /\bgasket\b/i },
  { label: "Fireplace mesh", pattern: /\bmesh\b/i },
  { label: "Smoke guard", pattern: /\bsmoke guard\b/i },
  { label: "Site cleanup", pattern: /\bsite cleanup\b/i },
];

const EQUIPMENT_RULES: Rule[] = [
  { label: "Gas fireplace", pattern: /\bgas fireplace|full gas|millivolt|thermopile|gas valve|gas clean|gas remote\b/i },
  { label: "Wood-burning fireplace", pattern: /\bwood[\s-]?burning\b/i },
  { label: "Wood stove", pattern: /\bwood stove|note stove\b/i },
  { label: "Chimney / flue", pattern: /\bchimney|flue|smoke chamber|chase|crown|liner\b/i },
  { label: "Fireplace insert", pattern: /\binsert\b/i },
  { label: "Remote / receiver", pattern: /\bremote|receiver\b/i },
  { label: "Blower / fan", pattern: /\bblower|\bfan\b/i },
  { label: "BBQ", pattern: /\bbbq|barbecue\b/i },
  { label: "Damper / damper cap", pattern: /\bdamper\b/i },
];

export const PART_COMPONENT_RULES: Rule[] = [
  { label: "PILOT_ASSEMBLY", pattern: /\bpilot\b/i },
  { label: "GAS_VALVE", pattern: /\bmain valve|gas valve\b/i },
  { label: "THERMOPILE", pattern: /\bthermopile\b/i },
  { label: "THERMOCOUPLE", pattern: /\bthermocouple\b/i },
  { label: "CONTROL_MODULE", pattern: /\bcontrol module|main computer|ignition box\b/i },
  { label: "RECEIVER", pattern: /\breceiver\b/i },
  { label: "REMOTE", pattern: /\bremote\b/i },
  { label: "BLOWER_FAN", pattern: /\bblower|\bfan motor|\bfan\b/i },
  { label: "IGNITER", pattern: /\bignit/i },
  { label: "SWITCH", pattern: /\bswitch\b/i },
  { label: "DAMPER_CAP", pattern: /\bdamper cap\b/i },
  { label: "MORTAR", pattern: /\bmortar|cement\b/i },
  { label: "MESH", pattern: /\bmesh\b/i },
  { label: "GASKET", pattern: /\bgasket\b/i },
  { label: "LINER_KIT", pattern: /\bliner\b/i },
  { label: "CHASE_COVER", pattern: /\bchase cover\b/i },
  { label: "CHIMNEY_CAP", pattern: /\bchimney cap\b/i },
];

export const FINDING_RULES: Rule[] = [
  { label: "Faulty / defective gas valve", pattern: /\bfaulty gas valve|valve was (?:not responding|confirmed defective)|defective\b/i },
  { label: "Valve safety lockout", pattern: /\bsafety lockout|unstable signal\b/i },
  { label: "Valve not responding to thermostat", pattern: /\bnot responding properly to the thermostat\b/i },
  { label: "Millivolt system replacement performed", pattern: /\bmillivolt system replacement\b/i },
  { label: "No gas leaks detected", pattern: /\bno gas leaks detected\b/i },
  { label: "CO levels within safe limits", pattern: /\bco levels are within safe limits\b/i },
  { label: "Unit operating properly", pattern: /\boperating properly|functioning as intended|functioning within normal parameters\b/i },
  { label: "Thermopile verified under load", pattern: /\bverified thermopile output\b/i },
  { label: "Future valve replacement recommended", pattern: /\breplacement may be required in the future\b/i },
  { label: "Creosote / soot buildup", pattern: /\bcreosote|soot buildup\b/i },
  { label: "Gas leak concern", pattern: /\bgas leak(?!s detected)\b/i },
];

const JUNK_PART_TOKENS = new Set([
  "control", "made", "canada", "years", "year", "months", "month", "warranty",
  "after", "market", "fuse", "include", "parts", "labor", "valve", "pilot",
  "the", "and", "for", "new", "gas", "way", "ways", "clean", "grade",
]);

const MODEL_PATTERNS = [
  /\b2103(?:-\d{2,4})?\b/i,
  /\bBfcOEM36\b/i,
  /\bGm\s*81\b/i,
  /\bCB\s*\d{4,}\b/i,
  /\b80D0018\b/i,
  /\bSl-550\w*\b/i,
  /\b23004\b/i,
  /\bZ33Fk\b/i,
  /\bGZ-550\b/i,
  /\bFK36\b/i,
  /\b209-\w+\b/i,
  /\bSIT\b/,
  /\bSTI\b/,
  /\bHeat\s*N\s*Glo\b/i,
  /\bNapoleon\b/i,
  /\bKingsman\b/i,
  /\b[A-Z]{1,4}\d{3,5}[-./][A-Z0-9]{2,}\b/i,
];

export function normalizePartNumber(raw: string): string | null {
  const value = raw.replace(/\s+/g, " ").trim().replace(/-+$/, "");
  if (value.length < 3) return null;
  if (!/\d/.test(value) && !/^(SIT|STI|Napoleon|Kingsman|Heat N Glo)$/i.test(value)) return null;
  if (JUNK_PART_TOKENS.has(value.toLowerCase())) return null;
  return value;
}

export function extractModelNumbers(text: string, extracted: WorkizPdfNormalizedPart[]): string[] {
  const models = new Set<string>();
  for (const part of extracted) {
    const normalized = part.part_number ? normalizePartNumber(part.part_number) : null;
    if (normalized) models.add(normalized);
  }
  for (const pattern of MODEL_PATTERNS) {
    const matches = text.match(new RegExp(pattern, "gi")) ?? [];
    for (const match of matches) {
      const normalized = normalizePartNumber(match);
      if (normalized) models.add(normalized);
    }
  }
  return [...models];
}

export function matchRules(text: string, rules: Rule[]): string[] {
  const labels: string[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(text) && !labels.includes(rule.label)) labels.push(rule.label);
  }
  return labels;
}

export function detectSystems(text: string): Array<"GAS" | "WOOD" | "CHIMNEY" | "OTHER"> {
  const systems: Array<"GAS" | "WOOD" | "CHIMNEY" | "OTHER"> = [];
  for (const rule of SYSTEM_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text)) && !systems.includes(rule.label)) {
      systems.push(rule.label);
    }
  }
  return systems;
}

export function systemBucket(systems: string[]): InvoiceAssignment["system_bucket"] {
  const core = systems.filter((system) => system === "GAS" || system === "WOOD" || system === "CHIMNEY");
  if (core.length >= 2) return "MIXED";
  if (core.length === 1) return core[0] as "GAS" | "WOOD" | "CHIMNEY";
  if (systems.includes("OTHER")) return "OTHER";
  return "UNKNOWN";
}

const WARRANTY_WORD = /warr(?:anty|nty|ny|anted)/i;
const NO_WARRANTY = /\bno\s+warr(?:anty|nty|ny)\b/i;

export function emptyWarranty(issuedAt: string | null): ScopedWarranty {
  return {
    status: "NOT_DOCUMENTED",
    duration_months: null,
    raw_text: null,
    source_invoice_date: issuedAt,
    calculable_expiry_date: null,
  };
}

export function warrantyStatus(months: number | null, issuedAt: string | null, asOf = ANALYSIS_AS_OF): WarrantyStatus {
  if (months == null) return "UNPARSEABLE";
  if (!issuedAt) return "UNPARSEABLE";
  const expiry = addMonths(issuedAt, months);
  return expiry < asOf.slice(0, 10) ? "DOCUMENTED_EXPIRED" : "DOCUMENTED_ACTIVE";
}

const SCOPED_DURATION_PATTERN = /(\d+)\s*(years?|yrs?|months?|mo)\b(?:['’]s)?/gi;

function unitToMonths(count: number, unit: string): number | null {
  if (!count || count <= 0 || count > 240) return null;
  const months = /month|^mo$/i.test(unit) ? count : count * 12;
  return months > 0 && months <= 240 ? months : null;
}

function classifyWarrantyWindow(
  after: string,
  local: string,
  onLaborLine: boolean,
  onPartLine: boolean,
): "parts" | "labor" | "both" | "unspecified" {
  const sharedBoth = /\bparts?\s*(?:and|&)\s*labou?r\b|\blabou?r\s*(?:and|&)\s*parts?\b/i.test(local);
  const laborWarranty = /\blabou?r\s+warr|\bwarr[^\n]{0,32}\bon\s+labou?r\b|\bwarr[^\n]{0,16}\blabou?r\b|\b(?:years?|yrs?|months?|mo)\s+labou?r\b|\blabou?r\s+\d+/i.test(local);
  const partsWarranty = /\bparts?\b/i.test(after) || /\bparts?\s+warr|\bwarr[^\n]{0,24}\bparts?\b|\b(?:years?|yrs?|months?|mo)\s+parts?\b/i.test(local);
  if (sharedBoth) return "both";
  if (/\bparts?\b/i.test(after) && !/\blabou?r\b/i.test(after)) return "parts";
  if (/\blabou?r\b/i.test(after) && !/\bparts?\b/i.test(after) && laborWarranty) return "labor";
  if (laborWarranty && !partsWarranty) return "labor";
  if (partsWarranty && !laborWarranty) return "parts";
  if (onLaborLine && WARRANTY_WORD.test(local)) return "labor";
  if (onPartLine && WARRANTY_WORD.test(local)) return "parts";
  return "unspecified";
}

export function extractScopedDurations(
  text: string,
  onLaborLine: boolean,
  onPartLine: boolean,
): Array<{ scope: "parts" | "labor" | "both" | "unspecified"; months: number; raw: string }> {
  const matches = [...text.matchAll(new RegExp(SCOPED_DURATION_PATTERN, "gi"))];
  const found: Array<{ scope: "parts" | "labor" | "both" | "unspecified"; months: number; raw: string }> = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match.index == null) continue;
    const months = unitToMonths(Number(match[1]), match[2]);
    if (months == null) continue;
    const start = match.index;
    const end = start + match[0].length;
    const prevEnd = index === 0 ? 0 : (matches[index - 1].index ?? 0) + (matches[index - 1][0]?.length ?? 0);
    const nextStart = index + 1 < matches.length ? (matches[index + 1].index ?? text.length) : text.length;
    const after = text.slice(end, nextStart);
    const local = `${text.slice(Math.max(prevEnd, start - 40), start)} ${match[0]} ${after.slice(0, 48)}`;
    if (!WARRANTY_WORD.test(local) && !/^\s*(?:parts?|labou?r)\b/i.test(after)) continue;
    found.push({
      scope: classifyWarrantyWindow(after, local, onLaborLine, onPartLine),
      months,
      raw: `${match[0]} ${after}`.replace(/\s+/g, " ").trim().slice(0, 220),
    });
  }
  return found;
}

export function isLaborChargeTitle(title: string): boolean {
  const compact = title.replace(/\s+/g, " ").trim();
  if (/^labor\s+warr/i.test(compact)) return false;
  return /^(labor\b|installation labor\b)/i.test(compact)
    || /\blabor\s*(?:and|&|,)?\s*installation\b/i.test(compact)
    || /\binstallation\s+labor\b/i.test(compact);
}

export function isTrueInstallationTitle(title: string): boolean {
  const compact = title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^labor\s*(?:and|&|,)?\s*installation\s*/i, "")
    .replace(/^installation\s+labor\s*/i, "");
  return TRUE_INSTALLATION_PATTERN.test(compact);
}

export function parseScopedWarranties(
  texts: string[],
  titles: string[],
  issuedAt: string | null,
): { parts: ScopedWarranty; labor: ScopedWarranty; unspecified: ScopedWarranty } {
  const parts = emptyWarranty(issuedAt);
  const labor = emptyWarranty(issuedAt);
  const unspecified = emptyWarranty(issuedAt);
  let explicitNo = false;

  const apply = (target: ScopedWarranty, raw: string, months: number) => {
    if (target.status !== "NOT_DOCUMENTED") return;
    target.raw_text = raw.slice(0, 220);
    target.duration_months = months;
    target.calculable_expiry_date = issuedAt ? addMonths(issuedAt, months) : null;
    target.status = warrantyStatus(months, issuedAt);
  };

  for (const text of texts) {
    const compact = text.replace(/\s+/g, " ").trim();
    if (/^Imported from Workiz/i.test(compact)) continue;
    if (NO_WARRANTY.test(compact)) {
      explicitNo = true;
      continue;
    }
    if (!WARRANTY_WORD.test(compact) && !/\b(?:parts?|labou?r)\b/i.test(compact)) continue;

    const onLaborLine = isLaborChargeTitle(compact)
      || titles.some((title) => title === compact && isLaborChargeTitle(title));
    const onPartLine = PART_COMPONENT_RULES.some((rule) => rule.pattern.test(compact));
    const scoped = extractScopedDurations(compact, onLaborLine, onPartLine);
    if (scoped.length === 0 && WARRANTY_WORD.test(compact)) {
      if (onLaborLine && labor.status === "NOT_DOCUMENTED") {
        labor.raw_text = compact.slice(0, 220);
        labor.status = "UNPARSEABLE";
      } else if (onPartLine && parts.status === "NOT_DOCUMENTED") {
        parts.raw_text = compact.slice(0, 220);
        parts.status = "UNPARSEABLE";
      } else if (unspecified.status === "NOT_DOCUMENTED") {
        unspecified.raw_text = compact.slice(0, 220);
        unspecified.status = "UNPARSEABLE";
      }
      continue;
    }

    for (const item of scoped) {
      if (item.scope === "both") {
        apply(parts, item.raw, item.months);
        apply(labor, item.raw, item.months);
        continue;
      }
      if (item.scope === "parts") apply(parts, item.raw, item.months);
      else if (item.scope === "labor") apply(labor, item.raw, item.months);
      else apply(unspecified, item.raw, item.months);
    }
  }

  if (explicitNo) {
    if (parts.status === "NOT_DOCUMENTED") {
      parts.status = "EXPLICIT_NO_WARRANTY";
      parts.raw_text = parts.raw_text ?? "No warranty";
    }
    if (labor.status === "NOT_DOCUMENTED") {
      labor.status = "EXPLICIT_NO_WARRANTY";
      labor.raw_text = labor.raw_text ?? "No warranty";
    }
  }

  return { parts, labor, unspecified };
}

export function derivePrimaryServices(details: string[], trueInstallation: boolean): string[] {
  const primaries = new Set<string>();
  if (trueInstallation) primaries.add("TRUE_INSTALLATION");
  if (details.includes("GAS_CLEAN") || details.includes("CHIMNEY_SWEEP")) primaries.add("CLEANING");
  if (
    details.includes("WETT")
    || details.includes("CAMERA_INSPECTION")
    || details.includes("SAFETY_INSPECTION")
    || details.includes("INSPECTION_GENERAL")
  ) {
    primaries.add("INSPECTION");
  }
  if (
    details.includes("PART_REPLACEMENT")
    || details.includes("FIREBOX_MASONRY")
    || details.includes("CHIMNEY_REPAIR")
    || details.includes("EXPLICIT_REPAIR")
  ) {
    primaries.add("REPAIR");
  }
  if (details.includes("MAINTENANCE") || details.includes("DIAGNOSTIC")) primaries.add("MAINTENANCE");
  if (details.includes("BBQ_GAS_FITTING")) primaries.add("OTHER");
  if (primaries.size === 0) primaries.add("UNKNOWN");
  return [...primaries];
}

function classifyInvoice(row: CorpusRow): InvoiceAssignment {
  const operationalTexts = [...row.short_titles, ...row.service_summary_lines];
  const haystack = [...operationalTexts, ...row.line_texts, ...row.notes, row.job_description ?? ""]
    .filter((text) => !isNoiseText(text))
    .join(" \n ");
  const titleHaystack = row.short_titles.join(" \n ");

  const systems = detectSystems(`${titleHaystack} \n ${row.service_summary_lines.join(" ")}`);
  if (systems.length === 0) {
    for (const extra of detectSystems(haystack)) {
      if (!systems.includes(extra)) systems.push(extra);
    }
  }

  const details = new Set<string>();
  const work = new Set<string>();
  const equipment = new Set<string>();
  const findings = new Set<string>();
  const partsByComponent = new Map<string, Set<string>>();
  const laborRaw: string[] = [];

  const nonLaborTitles = row.short_titles.filter((title) => !isLaborChargeTitle(title));
  const titleBlob = nonLaborTitles.join(" \n ") || titleHaystack;
  for (const label of matchRules(titleBlob, SERVICE_DETAIL_RULES)) details.add(label);
  for (const line of row.line_texts) {
    if (/\bcamera\b/i.test(line)) details.add("CAMERA_INSPECTION");
  }
  for (const title of row.short_titles) {
    if (isLaborChargeTitle(title)) uniquePush(laborRaw, title);
  }
  const trueInstallation = row.short_titles.some((title) => isTrueInstallationTitle(title));
  const previouslyWouldBeInstallation = row.short_titles.some((title) => LEGACY_INSTALLATION_PATTERN.test(title));

  for (const label of matchRules(titleBlob, WORK_RULES)) work.add(label);
  for (const label of matchRules(`${titleBlob} \n ${row.service_summary_lines.join(" ")}`, EQUIPMENT_RULES)) {
    equipment.add(label);
  }
  for (const label of matchRules(row.service_summary_lines.join(" \n "), FINDING_RULES)) findings.add(label);
  for (const title of row.short_titles) {
    if (/diagnos|verified thermopile|faulty|defective|lockout/i.test(title)) {
      for (const label of matchRules(title, FINDING_RULES)) findings.add(label);
    }
  }
  for (const line of row.line_texts) {
    const stripped = stripBoilerplate(line);
    if (stripped.hadBoilerplate) continue;
    if (/diagnos|faulty|defective|lockout|verified thermopile|operating properly|no gas leaks|CO levels/i.test(line)) {
      for (const label of matchRules(line, FINDING_RULES)) findings.add(label);
    }
  }

  const modelNumbers = extractModelNumbers(haystack, row.extracted_parts);
  for (const title of nonLaborTitles) {
    for (const label of matchRules(title, PART_COMPONENT_RULES)) {
      const models = partsByComponent.get(label) ?? new Set<string>();
      for (const model of extractModelNumbers(title, row.extracted_parts)) models.add(model);
      partsByComponent.set(label, models);
    }
  }
  if (modelNumbers.length > 0 && partsByComponent.size === 0) {
    partsByComponent.set("UNCLASSIFIED_COMPONENT", new Set(modelNumbers));
  } else {
    for (const models of partsByComponent.values()) {
      for (const model of modelNumbers) models.add(model);
    }
  }
  if (partsByComponent.size > 0) details.add("PART_REPLACEMENT");

  const warranties = parseScopedWarranties(
    [...row.line_texts, ...row.warranty_blocks, ...row.short_titles, ...row.notes],
    row.short_titles,
    row.issued_at,
  );

  const primaryServices = derivePrimaryServices([...details], trueInstallation);
  const laborCharged: "true" | "false" | "unknown" = laborRaw.length > 0 ? "true" : "false";

  const reviewReasons: string[] = [];
  const bucket = systemBucket(systems);
  const operationalTitles = nonLaborTitles.filter((title) => !matchRules(title, SERVICE_DETAIL_RULES).includes("ADMINISTRATIVE") || nonLaborTitles.length === 1);
  const onlyAdmin = nonLaborTitles.length > 0 && nonLaborTitles.every((title) => {
    const labels = matchRules(title, SERVICE_DETAIL_RULES);
    return labels.length === 0 || (labels.length === 1 && labels[0] === "ADMINISTRATIVE");
  });
  const genericOnly = operationalTitles.length > 0 && operationalTitles.every((title) =>
    /^(gas fireplace service|wood burning service|maintenance)$/i.test(title.trim()),
  );
  const laborOnly = laborRaw.length > 0 && nonLaborTitles.length === 0;

  if (row.missing_extraction) reviewReasons.push("MISSING_EXTRACTION");
  if (bucket === "UNKNOWN") reviewReasons.push("UNKNOWN_SYSTEM");
  if (laborOnly) reviewReasons.push("LABOR_ONLY");
  if (genericOnly && !laborOnly) reviewReasons.push("GENERIC_SERVICE_ONLY");
  if (onlyAdmin) reviewReasons.push("ADMIN_OR_EMPTY");
  if (row.short_titles.length === 0) reviewReasons.push("NO_OPERATIONAL_TITLE");
  if (warranties.labor.status === "UNPARSEABLE" || warranties.parts.status === "UNPARSEABLE") {
    reviewReasons.push("WARRANTY_UNPARSEABLE");
  }
  const validModels = extractModelNumbers(haystack, row.extracted_parts);
  const suspiciousParts = row.extracted_parts
    .map((part) => part.part_number)
    .filter((value): value is string => value != null && normalizePartNumber(value) == null);
  if (
    suspiciousParts.length > 0
    && validModels.length === 0
    && (bucket === "UNKNOWN" || operationalTitles.length <= 1)
  ) {
    reviewReasons.push("SUSPICIOUS_PART");
  }
  if (row.short_titles.length <= 1 && primaryServices.includes("UNKNOWN") && findings.size === 0) {
    reviewReasons.push("THIN_RECORD");
  }

  const confidence: InvoiceAssignment["confidence"] = reviewReasons.length === 0
    ? "high"
    : reviewReasons.some((reason) => ["UNKNOWN_SYSTEM", "NO_OPERATIONAL_TITLE", "ADMIN_OR_EMPTY", "MISSING_EXTRACTION"].includes(reason))
      ? "low"
      : "medium";

  return {
    invoice_code: row.invoice_code,
    invoice_id: row.invoice_id,
    issued_at: row.issued_at,
    systems,
    system_bucket: bucket,
    primary_services: primaryServices,
    service_details: [...details].filter((label) => label !== "ADMINISTRATIVE" && label !== "EXPLICIT_REPAIR"),
    equipment: [...equipment],
    work_performed: [...work],
    parts: [...partsByComponent.entries()].map(([component, models]) => ({
      component,
      model_numbers: [...models],
    })),
    findings: [...findings],
    labor: {
      labor_charged: laborCharged,
      labor_raw_text: laborRaw,
    },
    parts_warranty: warranties.parts,
    labor_warranty: warranties.labor,
    unspecified_warranty: warranties.unspecified,
    crm_requested_service_type: row.crm_requested_service_type,
    short_titles: row.short_titles,
    previously_would_be_installation: previouslyWouldBeInstallation,
    true_installation: trueInstallation,
    confidence,
    review_reasons: [...new Set(reviewReasons)],
    missing_extraction: row.missing_extraction,
    source: row.source,
  };
}

function buildCorpusFromExtraction(
  extraction: WorkizPdfNormalizedInvoice | undefined,
  extras: string[],
): {
  line_texts: string[];
  short_titles: string[];
  service_summary_lines: string[];
  notes: string[];
  warranty_blocks: string[];
  extracted_parts: WorkizPdfNormalizedPart[];
  source_lines: SourceLine[];
} {
  const line_texts: string[] = [];
  const short_titles: string[] = [];
  const service_summary_lines: string[] = [];
  const notes: string[] = [];
  const warranty_blocks: string[] = [];
  const extracted_parts: WorkizPdfNormalizedPart[] = [];
  const source_lines: SourceLine[] = [];

  for (const extra of extras) {
    if (!extra || isNoiseText(extra)) continue;
    uniquePush(line_texts, extra);
    const stripped = stripBoilerplate(extra);
    if (isUsableTitle(stripped.title)) uniquePush(short_titles, stripped.title);
  }

  if (extraction) {
    for (const line of extraction.line_items) {
      uniquePush(line_texts, line.description);
      addAllTexts(line_texts, line.content_lines);
      const stripped = stripBoilerplate(line.description);
      const title = isUsableTitle(stripped.title)
        ? stripped.title
        : line.description.replace(/\s+/g, " ").trim().slice(0, 160);
      if (isUsableTitle(stripped.title)) uniquePush(short_titles, stripped.title);
      extracted_parts.push(...line.parts);
      source_lines.push({
        raw: line.description,
        title,
        amount_cents: typeof line.amount_cents === "number" ? line.amount_cents : null,
      });
    }
    for (const block of extraction.service_summary) {
      uniquePush(service_summary_lines, block.title);
      addAllTexts(service_summary_lines, block.body_lines);
    }
    if (extraction.notes && !isNoiseText(extraction.notes)) uniquePush(notes, extraction.notes);
    if (extraction.warranty) {
      addAllTexts(warranty_blocks, extraction.warranty.text_blocks);
      addAllTexts(warranty_blocks, extraction.warranty.duration_mentions);
      addAllTexts(warranty_blocks, extraction.warranty.assurance_blocks);
    }
  } else {
    for (const extra of extras) {
      if (!extra || isNoiseText(extra)) continue;
      const stripped = stripBoilerplate(extra);
      source_lines.push({
        raw: extra,
        title: isUsableTitle(stripped.title) ? stripped.title : extra.replace(/\s+/g, " ").trim().slice(0, 160),
        amount_cents: null,
      });
    }
  }

  return { line_texts, short_titles, service_summary_lines, notes, warranty_blocks, extracted_parts, source_lines };
}

export async function loadFromDatabase(
  extractions: Map<string, WorkizPdfNormalizedInvoice>,
): Promise<CorpusRow[] | null> {
  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();
  try {
    const org = await ds.getRepository(OrganizationEntity).findOne({ where: { id: PHOENIX_ORG_ID } });
    if (!org || org.slug !== PHOENIX_ORG_SLUG) {
      throw new Error("Phoenix org verification failed");
    }

    const invoices = await ds.getRepository(InvoiceEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
    const enriched = invoices.filter((invoice) => {
      const snapshot = parseSnapshot(invoice.branding_snapshot_json);
      return snapshot?.import_source === WORKIZ_HISTORICAL_IMPORT_SOURCE
        && snapshot.enrichment_status === "complete"
        && Boolean(snapshot.workiz_invoice_code);
    });

    const jobIds = enriched.map((invoice) => invoice.job_id);
    const invoiceIds = enriched.map((invoice) => invoice.id);
    const jobs = jobIds.length > 0
      ? await ds.getRepository(JobEntity).find({ where: { id: In(jobIds) } })
      : [];
    const lineItems = invoiceIds.length > 0
      ? await ds.getRepository(InvoiceLineItemEntity).find({ where: { invoice_id: In(invoiceIds) } })
      : [];
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const linesByInvoice = new Map<string, InvoiceLineItemEntity[]>();
    for (const line of lineItems) {
      const list = linesByInvoice.get(line.invoice_id) ?? [];
      list.push(line);
      linesByInvoice.set(line.invoice_id, list);
    }

    return enriched.map((invoice) => {
      const snapshot = parseSnapshot(invoice.branding_snapshot_json)!;
      const code = snapshot.workiz_invoice_code!;
      const job = jobsById.get(invoice.job_id);
      const extras: string[] = [];
      for (const line of linesByInvoice.get(invoice.id) ?? []) {
        uniquePush(extras, line.name_snapshot);
        uniquePush(extras, line.description_snapshot);
      }
      if (snapshot.pdf_enrichment?.operational_line_items) {
        for (const line of snapshot.pdf_enrichment.operational_line_items) {
          uniquePush(extras, line.description);
        }
      }
      const built = buildCorpusFromExtraction(extractions.get(code), extras);
      if (snapshot.pdf_enrichment?.notes && !isNoiseText(snapshot.pdf_enrichment.notes)) {
        uniquePush(built.notes, snapshot.pdf_enrichment.notes);
      }
      if (job?.description && !isNoiseText(job.description)) {
        uniquePush(built.notes, job.description);
      }
      if (snapshot.pdf_enrichment?.service_summary) {
        for (const block of snapshot.pdf_enrichment.service_summary) {
          uniquePush(built.service_summary_lines, block.title);
          addAllTexts(built.service_summary_lines, block.body_lines);
        }
      }
      if (snapshot.pdf_enrichment?.warranty) {
        addAllTexts(built.warranty_blocks, snapshot.pdf_enrichment.warranty.text_blocks ?? []);
        addAllTexts(built.warranty_blocks, snapshot.pdf_enrichment.warranty.duration_mentions ?? []);
      }

      return {
        invoice_code: code,
        invoice_id: invoice.id,
        issued_at: isoDate(invoice.issued_at),
        crm_requested_service_type: job?.requested_service_type ?? null,
        job_description: job?.description ?? null,
        missing_extraction: !extractions.has(code),
        source: "db" as const,
        ...built,
      };
    });
  } finally {
    await ds.destroy();
  }
}

export function loadFromHarnessFallback(
  extractions: Map<string, WorkizPdfNormalizedInvoice>,
  fallbackCodes: string[],
): CorpusRow[] {
  return fallbackCodes.map((code) => {
    const extraction = extractions.get(code);
    const built = buildCorpusFromExtraction(extraction, []);
    return {
      invoice_code: code,
      invoice_id: null,
      issued_at: extraction?.invoice_date ?? null,
      crm_requested_service_type: null,
      job_description: null,
      missing_extraction: !extraction,
      source: "harness_fallback" as const,
      ...built,
    };
  });
}

function countBy<T extends string>(values: T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

export async function runServiceIntelligenceDiscovery(): Promise<{
  outputDir: string;
  total: number;
  source: string;
}> {
  abortIfWriteFlags(process.argv.slice(2));

  const harnessRoot = join(process.cwd(), "_runtime_harness");
  const batchDir = join(harnessRoot, "workiz-invoice-pdf-batch1");
  const outputDir = join(harnessRoot, "service-intelligence");
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

  const assignments = rows.map(classifyInvoice);

  const systemConcepts = new Map<string, ConceptBucket>();
  const primaryConcepts = new Map<string, ConceptBucket>();
  const detailConcepts = new Map<string, ConceptBucket>();
  const equipmentConcepts = new Map<string, ConceptBucket>();
  const workConcepts = new Map<string, ConceptBucket>();
  const partConcepts = new Map<string, ConceptBucket>();
  const findingConcepts = new Map<string, ConceptBucket>();
  const partModels = new Map<string, Set<string>>();

  for (const assignment of assignments) {
    const example = assignment.short_titles[0] ?? assignment.invoice_code;
    for (const system of assignment.systems) recordConcept(systemConcepts, system, assignment.invoice_code, example);
    for (const label of assignment.primary_services) recordConcept(primaryConcepts, label, assignment.invoice_code, example);
    for (const label of assignment.service_details) {
      const raw = assignment.short_titles.find((title) => matchRules(title, SERVICE_DETAIL_RULES).includes(label))
        ?? example;
      recordConcept(detailConcepts, label, assignment.invoice_code, raw);
    }
    for (const label of assignment.equipment) recordConcept(equipmentConcepts, label, assignment.invoice_code, example);
    for (const label of assignment.work_performed) {
      const raw = assignment.short_titles.find((title) => matchRules(title, WORK_RULES).includes(label)) ?? example;
      recordConcept(workConcepts, label, assignment.invoice_code, raw);
    }
    for (const part of assignment.parts) {
      recordConcept(partConcepts, part.component, assignment.invoice_code, assignment.short_titles.join(" | "));
      const models = partModels.get(part.component) ?? new Set<string>();
      for (const model of part.model_numbers) models.add(model);
      partModels.set(part.component, models);
    }
    for (const finding of assignment.findings) {
      const corpus = rows.find((row) => row.invoice_code === assignment.invoice_code);
      const raw = corpus?.service_summary_lines.find((line) => matchRules(line, FINDING_RULES).includes(finding))
        ?? example;
      recordConcept(findingConcepts, finding, assignment.invoice_code, raw);
    }
  }

  const systemDistribution = countBy(assignments.map((row) => row.system_bucket));
  const crmDistribution = countBy(
    assignments.map((row) => row.crm_requested_service_type ?? "unmapped"),
  );

  const laborInvoices = assignments.filter((row) => row.labor.labor_charged === "true");
  const laborWithDocumentedWarranty = laborInvoices.filter((row) =>
    row.labor_warranty.status === "DOCUMENTED_ACTIVE" || row.labor_warranty.status === "DOCUMENTED_EXPIRED",
  );
  const laborWithNoDocumentedWarranty = laborInvoices.filter((row) =>
    row.labor_warranty.status === "NOT_DOCUMENTED",
  );
  const laborWarrantyDurationDistribution = countBy(
    laborWithDocumentedWarranty
      .map((row) => row.labor_warranty.duration_months)
      .filter((months): months is number => months != null)
      .map((months) => `${months}_months`),
  );
  const previousInstallationNow = assignments.filter((row) => row.previously_would_be_installation);
  const trueInstallations = assignments.filter((row) => row.true_installation);
  const documentedParts = assignments.filter((row) =>
    row.parts_warranty.status === "DOCUMENTED_ACTIVE" || row.parts_warranty.status === "DOCUMENTED_EXPIRED",
  );
  const explicitNo = assignments.filter((row) =>
    row.parts_warranty.status === "EXPLICIT_NO_WARRANTY" || row.labor_warranty.status === "EXPLICIT_NO_WARRANTY",
  );
  const unparseableWarranty = assignments.filter((row) =>
    row.parts_warranty.status === "UNPARSEABLE" || row.labor_warranty.status === "UNPARSEABLE"
    || row.unspecified_warranty.status === "UNPARSEABLE",
  );

  const reviewQueue = assignments
    .filter((row) => row.review_reasons.length > 0)
    .map((row) => ({
      invoice_code: row.invoice_code,
      invoice_id: row.invoice_id,
      system_bucket: row.system_bucket,
      systems: row.systems,
      primary_services: row.primary_services,
      service_details: row.service_details,
      labor_charged: row.labor.labor_charged,
      labor_warranty_status: row.labor_warranty.status,
      short_titles: row.short_titles,
      confidence: row.confidence,
      reason_codes: row.review_reasons,
    }));

  const serializedParts = serializeConcepts(partConcepts).map((concept) => ({
    ...concept,
    model_numbers: [...(partModels.get(concept.canonical_label) ?? [])],
  }));

  const primaryServices = serializeConcepts(primaryConcepts);
  const serviceDetails = serializeConcepts(detailConcepts);

  const discovery = {
    generated_at: new Date().toISOString(),
    organization_id: PHOENIX_ORG_ID,
    organization_name: "Phoenix Fireplace",
    analysis_only: true,
    production_writes: false,
    corpus_source: source,
    total_invoices_analyzed: assignments.length,
    system_distribution: {
      GAS: systemDistribution.GAS ?? 0,
      WOOD: systemDistribution.WOOD ?? 0,
      CHIMNEY: systemDistribution.CHIMNEY ?? 0,
      MIXED: systemDistribution.MIXED ?? 0,
      OTHER: systemDistribution.OTHER ?? 0,
      UNKNOWN: systemDistribution.UNKNOWN ?? 0,
    },
    primary_services: primaryServices,
    service_details: serviceDetails,
    discovered_equipment_types: serializeConcepts(equipmentConcepts),
    top_work_performed: serializeConcepts(workConcepts),
    top_parts: serializedParts,
    top_findings: serializeConcepts(findingConcepts),
    discovered_systems: serializeConcepts(systemConcepts),
    labor: {
      invoices_with_labor: laborInvoices.length,
      labor_with_explicit_labor_warranty: laborWithDocumentedWarranty.length,
      labor_with_no_documented_labor_warranty: laborWithNoDocumentedWarranty.length,
      labor_warranty_duration_distribution: laborWarrantyDurationDistribution,
      labor_warranty_status_counts: countBy(assignments.map((row) => row.labor_warranty.status)),
    },
    installation_correction: {
      previous_installation_primary_count: PREVIOUS_INSTALLATION_COUNT,
      invoices_with_legacy_installation_language: previousInstallationNow.length,
      genuine_true_installation_count: trueInstallations.length,
      installation_primaries_removed: PREVIOUS_INSTALLATION_COUNT - trueInstallations.length,
      true_installation_examples: trueInstallations.slice(0, 12).map((row) => ({
        invoice_code: row.invoice_code,
        short_titles: row.short_titles,
      })),
    },
    warranty: {
      parts_documented: documentedParts.length,
      labor_documented: laborWithDocumentedWarranty.length,
      explicit_no_warranty: explicitNo.length,
      unparseable: unparseableWarranty.length,
      parts_status_counts: countBy(assignments.map((row) => row.parts_warranty.status)),
      labor_status_counts: countBy(assignments.map((row) => row.labor_warranty.status)),
      do_not_infer_from_labor_line: true,
      reactivation_is_independent: true,
    },
    crm_requested_service_type_baseline: crmDistribution,
    unknown_low_confidence: {
      review_queue_count: reviewQueue.length,
      low_confidence_count: assignments.filter((row) => row.confidence === "low").length,
      unknown_system_count: systemDistribution.UNKNOWN ?? 0,
    },
    invoices: assignments,
  };

  const taxonomy = {
    version: "v1-refined",
    status: "proposal_only_not_applied",
    do_not_write_to_production: true,
    do_not_create_marketing_automations: true,
    organization_id: PHOENIX_ORG_ID,
    derived_from_invoices: assignments.length,
    multi_label: true,
    notes: [
      "INSTALLATION is not a primary service. Labor and installation lines are LABOR_CHARGED.",
      "TRUE_INSTALLATION requires independent evidence of a new appliance/system being sold.",
      "Parts, labor, findings, and warranty are independent dimensions.",
      "Warranty is never inferred from a labor line. NOT_DOCUMENTED is not EXPIRED.",
      "Reactivation eligibility is independent of warranty and is not computed in this pass.",
    ],
    dimensions: {
      system: {
        values: ["GAS", "WOOD", "CHIMNEY", "OTHER", "UNKNOWN"],
        bucket_when_multiple_core_systems: "MIXED",
        observed_counts: discovery.system_distribution,
      },
      primary_service: {
        values: ["CLEANING", "INSPECTION", "REPAIR", "MAINTENANCE", "TRUE_INSTALLATION", "OTHER", "UNKNOWN"],
        observed: primaryServices,
      },
      service_detail: {
        values_in_v1: serviceDetails
          .filter((concept) => concept.invoice_count >= 5)
          .map((concept) => concept.canonical_label),
        observed: serviceDetails,
      },
      labor: {
        labor_charged: ["true", "false", "unknown"],
        do_not_treat_as_service_type: ["Labor", "Labor and installation", "Labor & installation", "Installation labor"],
        observed: discovery.labor,
      },
      parts: {
        values_in_v1: serializedParts
          .filter((concept) => concept.invoice_count >= 5)
          .map((concept) => concept.canonical_label),
        preserve_model_numbers: true,
        observed: serializedParts.slice(0, 20),
      },
      warranty: {
        states: [
          "DOCUMENTED_ACTIVE",
          "DOCUMENTED_EXPIRED",
          "EXPLICIT_NO_WARRANTY",
          "NOT_DOCUMENTED",
          "UNPARSEABLE",
        ],
        independent_scopes: ["parts_warranty", "labor_warranty"],
        do_not_infer_labor_warranty_from_labor_line: true,
        not_documented_is_not_expired: true,
        reactivation_is_independent: true,
        observed: discovery.warranty,
      },
      findings: {
        observed: serializeConcepts(findingConcepts),
      },
    },
    installation_correction: discovery.installation_correction,
    phrase_map: {
      system: SYSTEM_RULES.map((rule) => ({ label: rule.label, patterns: rule.patterns.map((pattern) => pattern.source) })),
      service_detail: SERVICE_DETAIL_RULES.map((rule) => ({ label: rule.label, pattern: rule.pattern.source })),
      true_installation: TRUE_INSTALLATION_PATTERN.source,
      labor_charge: LABOR_CHARGE_PATTERN.source,
      work_performed: WORK_RULES.map((rule) => ({ label: rule.label, pattern: rule.pattern.source })),
      parts: PART_COMPONENT_RULES.map((rule) => ({ label: rule.label, pattern: rule.pattern.source })),
      findings: FINDING_RULES.map((rule) => ({ label: rule.label, pattern: rule.pattern.source })),
    },
    crm_gap: {
      existing_enum: ["inspection", "cleaning", "repair", "rebuild"],
      existing_source: "jobs.requested_service_type via inferServiceType() keyword heuristic",
      observed_crm_distribution: crmDistribution,
      lost_distinctions: [
        "CRM tagged all 378 jobs as repair",
        "Labor-and-installation was previously treated as INSTALLATION",
        "Gas clean vs chimney sweep, WETT vs camera, and parts vs labor were collapsed",
      ],
    },
  };

  const queue = {
    generated_at: new Date().toISOString(),
    organization_id: PHOENIX_ORG_ID,
    total_invoices_analyzed: assignments.length,
    queued: reviewQueue.length,
    reason_counts: countBy(reviewQueue.flatMap((row) => row.reason_codes)),
    records: reviewQueue,
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "service-intelligence-discovery.json"), JSON.stringify(discovery, null, 2));
  writeFileSync(join(outputDir, "taxonomy-v1-proposal.json"), JSON.stringify(taxonomy, null, 2));
  writeFileSync(join(outputDir, "classification-review-queue.json"), JSON.stringify(queue, null, 2));

  return { outputDir, total: assignments.length, source };
}

async function main() {
  const result = await runServiceIntelligenceDiscovery();
  console.log(`Analyzed ${result.total} invoices from ${result.source}`);
  console.log(`Wrote read-only reports to ${result.outputDir}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
