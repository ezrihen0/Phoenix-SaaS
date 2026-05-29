import type { ProfileRole } from "../../crm/constants";
import {
  FIELD_KNOWLEDGE_DOMAIN_DOORS_WINDOWS,
  FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE,
  type FieldKnowledgeDomain,
} from "./field-knowledge.constants";
import type { RuntimeSurface, RuntimeTrade } from "./field-knowledge-runtime.types";

/** Manifest audit constants — read-only reference, not loaded at runtime. */
export const FIELD_KNOWLEDGE_MANIFEST_VERSION = "field_knowledge_manifest_v1";
export const FIELD_KNOWLEDGE_MANIFEST_STATUS = "alberta_v1_seeded";

export const TRADE_CONFIDENCE_THRESHOLD = 0.8;
export const RISK_CONFIDENCE_THRESHOLD = 0.9;

/** Higher rank = more privileged / detailed professional surface. */
export const RUNTIME_SURFACE_RANK: Record<RuntimeSurface, number> = {
  public_site: 0,
  customer_portal: 1,
  ai_voice_phone: 2,
  dispatcher_workspace: 3,
  office_crm: 4,
  technician_mobile: 5,
  owner_admin: 6,
};

export const RESTRICTED_RUNTIME_SURFACES = new Set<RuntimeSurface>([
  "customer_portal",
  "public_site",
  "ai_voice_phone",
]);

export const PROFESSIONAL_RUNTIME_SURFACES = new Set<RuntimeSurface>([
  "technician_mobile",
  "office_crm",
  "dispatcher_workspace",
  "owner_admin",
]);

export const ROLE_DEFAULT_RUNTIME_SURFACE: Record<ProfileRole, RuntimeSurface> = {
  owner: "owner_admin",
  admin: "owner_admin",
  office_admin: "office_crm",
  dispatcher: "dispatcher_workspace",
  technician: "technician_mobile",
  csr: "dispatcher_workspace",
  viewer: "dispatcher_workspace",
};

export const FIELD_COPILOT_ALLOWED_ROLES = new Set<ProfileRole>([
  "owner",
  "admin",
  "office_admin",
  "dispatcher",
  "technician",
]);

export const ROLE_MAX_RUNTIME_SURFACE: Record<ProfileRole, RuntimeSurface> = {
  owner: "owner_admin",
  admin: "owner_admin",
  office_admin: "office_crm",
  dispatcher: "dispatcher_workspace",
  technician: "technician_mobile",
  csr: "dispatcher_workspace",
  viewer: "dispatcher_workspace",
};

export const DOMAIN_TO_TRADE: Record<FieldKnowledgeDomain, RuntimeTrade> = {
  [FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE]: "gas-fireplace",
  [FIELD_KNOWLEDGE_DOMAIN_DOORS_WINDOWS]: "doors-windows",
};

export const EMERGENCY_KEYWORD_PATTERNS: RegExp[] = [
  /\bgas (smell|odor|leak)\b/i,
  /\bsmell(?:ing)? gas\b/i,
  /\bco alarm\b/i,
  /\bcarbon monoxide\b/i,
  /\b(?:active )?fire\b/i,
  /\bsmoke (?:in|from) (?:house|home|room)\b/i,
  /\binjur(?:y|ed)\b/i,
  /\bentrap(?:ment|ped)\b/i,
  /\b(?:pinned|trapped) (?:person|someone|child|adult)\b/i,
  /\b(?:someone|child|adult|person) (?:is )?(?:pinned|trapped)\b/i,
  /\belectrical burning smell\b/i,
  /\bbroken spring\b/i,
  /\bspring (?:broke|snapped|flew off)\b/i,
  /\bcable (?:snapped|broke|broken|came off)\b/i,
  /\bdoor (?:off[\s-]?track|fell|slammed)\b/i,
  /\b(?:garage )?door (?:is )?hanging\b/i,
  /\bhanging (?:halfway|off[\s-]?track)\b/i,
  /\bcrooked and hanging\b/i,
  /\bsecurity exposure\b/i,
  /\bhome exposed\b/i,
  /\bopening exposed\b/i,
  /\bactive break[\s-]?in\b/i,
  /\bdoor (?:won['’]?t|will not|cannot|can't|cant) lock\b/i,
  /\bhome unsecured\b/i,
  /\blarge broken window\b.*\bexpos(?:ed|ure)\b/i,
  /\bslider broken\b.*\bexpos(?:ed|ure)\b/i,
];

export const HIGH_RISK_KEYWORD_PATTERNS: RegExp[] = [
  /\btorsion spring\b/i,
  /\bcable (?:snapped|broken|off)\b/i,
  /\boff[\s-]?track\b/i,
  /\brollout\b/i,
  /\bcombustion concern\b/i,
  /\bbroken glass\b/i,
  /\bsecurity exposure\b/i,
];

export const REGULATED_CLAIM_KEYWORD_PATTERNS: RegExp[] = [
  /\bpermit\b/i,
  /\bahj\b/i,
  /\bauthority having jurisdiction\b/i,
  /\bbuilding code\b/i,
  /\bcode compliant\b/i,
  /\bclearance (?:requirement|number)\b/i,
  /\bmanufacturer(?:['\s-]?specific| spec)\b/i,
  /\bmodel (?:number|spec)\b/i,
  /\begress\b/i,
  /\bfire[\s-]?rated\b/i,
];

export const REPAIR_GUIDANCE_KEYWORD_PATTERNS: RegExp[] = [
  /\bhow (?:do|can) i (?:fix|repair|adjust|replace)\b/i,
  /\bstep[\s-]by[\s-]step\b/i,
  /\bwalk me through\b/i,
  /\bdi(?:y| y)\b/i,
  /\bturn(?:s)? (?:for|on) (?:the )?spring\b/i,
  /\bwinding (?:the )?spring\b/i,
  /\badjust gas pressure\b/i,
];

export const MANUFACTURER_SPECIFIC_PATTERNS: RegExp[] = [
  /\bnapoleon\b/i,
  /\bheat(?:\s*&\s*|\s+)n glo\b/i,
  /\bmajestic\b/i,
  /\bmodel (?:#|number)\b/i,
  /\bwhat does .+ manual say\b/i,
];
