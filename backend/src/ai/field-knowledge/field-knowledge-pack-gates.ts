import type { ProfileRole } from "../../crm/constants";
import type { FieldKnowledgeSelectionKey } from "./field-knowledge.constants";
import type { RuntimeSurface } from "./field-knowledge-runtime.types";

export type PackGateDefinition = {
  allowed_runtime_surfaces: readonly RuntimeSurface[];
  blocked_runtime_surfaces: readonly RuntimeSurface[];
  minimum_user_role: ProfileRole;
  professional_context_required: boolean;
};

const PROFESSIONAL_SURFACES: RuntimeSurface[] = [
  "technician_mobile",
  "office_crm",
  "dispatcher_workspace",
  "owner_admin",
];

const PUBLIC_BLOCKED_SURFACES: RuntimeSurface[] = [
  "customer_portal",
  "public_site",
  "ai_voice_phone",
];

/**
 * Conservative defaults for legacy gas-fireplace flat packs (no declared pack metadata).
 * Does not invent per-pack claims — one shared professional-only gate.
 */
export const LEGACY_GAS_FIREPLACE_PACK_GATE: PackGateDefinition = {
  allowed_runtime_surfaces: PROFESSIONAL_SURFACES,
  blocked_runtime_surfaces: PUBLIC_BLOCKED_SURFACES,
  minimum_user_role: "technician",
  professional_context_required: true,
};

/**
 * Declared metadata from approved doors-windows Alberta packs (mirrored verbatim).
 */
const DOORS_WINDOWS_DISPATCHER_GATE: PackGateDefinition = {
  allowed_runtime_surfaces: PROFESSIONAL_SURFACES,
  blocked_runtime_surfaces: ["customer_portal", "public_site"],
  minimum_user_role: "dispatcher",
  professional_context_required: true,
};

const DOORS_WINDOWS_TECHNICIAN_GATE: PackGateDefinition = {
  allowed_runtime_surfaces: PROFESSIONAL_SURFACES,
  blocked_runtime_surfaces: ["customer_portal", "public_site"],
  minimum_user_role: "technician",
  professional_context_required: true,
};

/** Alberta gas V1 trade/jurisdiction packs — conservative professional gate (no invented pack metadata). */
export const ALBERTA_GAS_V1_PACK_GATE: PackGateDefinition = {
  allowed_runtime_surfaces: PROFESSIONAL_SURFACES,
  blocked_runtime_surfaces: PUBLIC_BLOCKED_SURFACES,
  minimum_user_role: "dispatcher",
  professional_context_required: true,
};

const ROLE_RANK: Record<ProfileRole, number> = {
  viewer: 0,
  csr: 1,
  dispatcher: 2,
  technician: 3,
  office_admin: 4,
  admin: 5,
  owner: 6,
};

export const PACK_GATE_REGISTRY: Partial<Record<FieldKnowledgeSelectionKey, PackGateDefinition>> = {
  // Legacy gas-fireplace — conservative shared default
  safety_first: LEGACY_GAS_FIREPLACE_PACK_GATE,
  customer_interview: LEGACY_GAS_FIREPLACE_PACK_GATE,
  visual_inspection: LEGACY_GAS_FIREPLACE_PACK_GATE,
  common_problems: LEGACY_GAS_FIREPLACE_PACK_GATE,
  venting_basics: LEGACY_GAS_FIREPLACE_PACK_GATE,
  manufacturer_manual_rule: LEGACY_GAS_FIREPLACE_PACK_GATE,
  maintenance_sales: LEGACY_GAS_FIREPLACE_PACK_GATE,
  repair_upgrade: LEGACY_GAS_FIREPLACE_PACK_GATE,
  report_wording: LEGACY_GAS_FIREPLACE_PACK_GATE,
  field_sales_playbook: LEGACY_GAS_FIREPLACE_PACK_GATE,
  // Alberta gas V1
  canada_alberta_gas_fireplace_basics: ALBERTA_GAS_V1_PACK_GATE,
  canada_alberta_gas: ALBERTA_GAS_V1_PACK_GATE,
  canada_alberta_calgary_gas_fireplace_permits: ALBERTA_GAS_V1_PACK_GATE,
  canada_alberta_edmonton_gas_fireplace_permits: ALBERTA_GAS_V1_PACK_GATE,
  // Doors-windows — declared metadata
  ca_ab_doors_windows_trade_map_basics_v1: DOORS_WINDOWS_DISPATCHER_GATE,
  ca_ab_doors_windows_residential_diagnostics_basics_v1: DOORS_WINDOWS_DISPATCHER_GATE,
  ca_ab_doors_windows_dispatcher_triage_basics_v1: DOORS_WINDOWS_DISPATCHER_GATE,
  ca_ab_doors_windows_report_wording_basics_v1: DOORS_WINDOWS_TECHNICIAN_GATE,
  ca_ab_doors_windows_photo_intake_safety_v1: DOORS_WINDOWS_DISPATCHER_GATE,
  ca_ab_windows_screen_service_basics_v1: DOORS_WINDOWS_DISPATCHER_GATE,
  ca_ab_doors_windows_service_opportunity_basics_v1: DOORS_WINDOWS_DISPATCHER_GATE,
};

export function getPackGate(selectionKey: FieldKnowledgeSelectionKey): PackGateDefinition | null {
  return PACK_GATE_REGISTRY[selectionKey] ?? null;
}

export function isPackAllowedForRuntime(input: {
  selectionKey: FieldKnowledgeSelectionKey;
  runtimeSurface: RuntimeSurface;
  userRole: ProfileRole;
  professionalContext: boolean;
}): boolean {
  const gate = getPackGate(input.selectionKey);
  if (!gate) {
    return false;
  }

  if (gate.blocked_runtime_surfaces.includes(input.runtimeSurface)) {
    return false;
  }

  if (!gate.allowed_runtime_surfaces.includes(input.runtimeSurface)) {
    return false;
  }

  if (ROLE_RANK[input.userRole] < ROLE_RANK[gate.minimum_user_role]) {
    return false;
  }

  if (gate.professional_context_required && !input.professionalContext) {
    return false;
  }

  return true;
}
