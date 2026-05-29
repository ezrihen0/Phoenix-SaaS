import type { ProfileRole } from "../../crm/constants";
import type { FieldKnowledgeDomain, FieldKnowledgeSelectionKey } from "./field-knowledge.constants";

export const RUNTIME_SURFACES = [
  "technician_mobile",
  "office_crm",
  "dispatcher_workspace",
  "owner_admin",
  "customer_portal",
  "public_site",
  "ai_voice_phone",
] as const;

export type RuntimeSurface = (typeof RUNTIME_SURFACES)[number];

export type RuntimeTrade =
  | "gas-fireplace"
  | "doors-windows"
  | "chimney"
  | "garage-door"
  | "unknown"
  | "mixed";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type BookingOutcome = "none" | "lead_capture" | "confirmed_appointment";

export type GateOutcome = "allowed" | "fallback" | "refused";

export type FallbackReason =
  | "no_approved_pack"
  | "unsupported_jurisdiction"
  | "blocked_surface"
  | "insufficient_role"
  | "high_risk"
  | "emergency"
  | "voice_repair_request"
  | "voice_disabled"
  | "manufacturer_specific"
  | "low_trade_confidence"
  | "low_risk_confidence"
  | "regulated_claim_without_pack"
  | "domain_disabled"
  | "surface_disabled"
  | "kill_switch";

export type FieldKnowledgeRuntimeContext = {
  trade: RuntimeTrade;
  trade_confidence: number;
  country: string | null;
  province_or_state: string | null;
  city_or_ahj: string | null;
  runtime_surface: RuntimeSurface;
  user_role: ProfileRole | "public";
  professional_context: boolean;
  risk_level: RiskLevel;
  risk_confidence: number;
  emergency_flag: boolean;
  booking_eligibility: boolean;
  lead_capture_only: boolean;
  booking_outcome: BookingOutcome;
  regulated_claim_requested: boolean;
  repair_guidance_requested: boolean;
};

export type RuntimeGateEvaluation = {
  gate_outcome: GateOutcome;
  fallback_reason: FallbackReason | null;
  refusal_reason: string | null;
  fallback_message: string | null;
  skip_llm: boolean;
  allowed_pack_keys: FieldKnowledgeSelectionKey[] | null;
  context: FieldKnowledgeRuntimeContext;
};

export type FieldKnowledgeRuntimeAudit = {
  manifest_version: string;
  manifest_status: string;
  selected_knowledge_keys: FieldKnowledgeSelectionKey[];
  selected_pack_paths: string[];
  trade: RuntimeTrade;
  region_country: string | null;
  region_province: string | null;
  region_city: string | null;
  runtime_surface: RuntimeSurface;
  user_role: ProfileRole | "public";
  risk_level: RiskLevel;
  trade_confidence: number;
  risk_confidence: number;
  emergency_flag: boolean;
  gate_outcome: GateOutcome;
  fallback_reason: FallbackReason | null;
  refusal_reason: string | null;
  booking_eligibility: boolean;
  lead_capture_only: boolean;
  booking_outcome: BookingOutcome;
  knowledge_domain: FieldKnowledgeDomain;
  used_llm: boolean;
};
