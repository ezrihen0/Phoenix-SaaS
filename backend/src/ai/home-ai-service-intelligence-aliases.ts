const SERVICE_DETAIL_ALIASES: Record<string, string> = {
  wett: "WETT",
  "wett inspection": "WETT",
  "wett inspections": "WETT",
  chimney_sweep: "CHIMNEY_SWEEP",
  "chimney sweep": "CHIMNEY_SWEEP",
  "chimney sweeps": "CHIMNEY_SWEEP",
  sweep: "CHIMNEY_SWEEP",
  sweeps: "CHIMNEY_SWEEP",
  gas_clean: "GAS_CLEAN",
  "gas clean": "GAS_CLEAN",
  "gas cleaning": "GAS_CLEAN",
  "gas fireplace clean": "GAS_CLEAN",
  "gas fireplace cleaning": "GAS_CLEAN",
  camera_inspection: "CAMERA_INSPECTION",
  "camera inspection": "CAMERA_INSPECTION",
  part_replacement: "PART_REPLACEMENT",
  "part replacement": "PART_REPLACEMENT",
  firebox_masonry: "FIREBOX_MASONRY",
  chimney_repair: "CHIMNEY_REPAIR",
  safety_inspection: "SAFETY_INSPECTION",
  inspection_general: "INSPECTION_GENERAL",
  diagnostic: "DIAGNOSTIC",
  maintenance: "MAINTENANCE",
  bbq_gas_fitting: "BBQ_GAS_FITTING",
};

const SYSTEM_ALIASES: Record<string, string> = {
  gas: "GAS",
  "gas fireplace": "GAS",
  wood: "WOOD",
  "wood stove": "WOOD",
  "wood burning": "WOOD",
  chimney: "CHIMNEY",
  mixed: "MIXED",
  other: "OTHER",
  unknown: "UNKNOWN",
};

const PRIMARY_SERVICE_ALIASES: Record<string, string> = {
  cleaning: "CLEANING",
  clean: "CLEANING",
  inspection: "INSPECTION",
  inspect: "INSPECTION",
  repair: "REPAIR",
  maintenance: "MAINTENANCE",
  installation: "TRUE_INSTALLATION",
  true_installation: "TRUE_INSTALLATION",
  other: "OTHER",
  unknown: "UNKNOWN",
};

const COMPONENT_ALIASES: Record<string, string> = {
  pilot: "PILOT_ASSEMBLY",
  pilots: "PILOT_ASSEMBLY",
  "pilot assembly": "PILOT_ASSEMBLY",
  pilot_assembly: "PILOT_ASSEMBLY",
  gas_valve: "GAS_VALVE",
  "gas valve": "GAS_VALVE",
  valve: "GAS_VALVE",
  valves: "GAS_VALVE",
  blower: "BLOWER_FAN",
  "blower fan": "BLOWER_FAN",
  fan: "BLOWER_FAN",
  blower_fan: "BLOWER_FAN",
  thermocouple: "THERMOCOUPLE",
  thermopile: "THERMOPILE",
  control_module: "CONTROL_MODULE",
  remote: "REMOTE",
  receiver: "RECEIVER",
  switch: "SWITCH",
  igniter: "IGNITER",
  gasket: "GASKET",
  mesh: "MESH",
  chimney_cap: "CHIMNEY_CAP",
  chase_cover: "CHASE_COVER",
};

const WORK_ACTION_ALIASES: Record<string, string> = {
  replaced: "REPLACED",
  replace: "REPLACED",
  replacement: "REPLACED",
  installed: "INSTALLED",
  install: "INSTALLED",
  installation: "INSTALLED",
  repaired: "REPAIRED",
  repair: "REPAIRED",
  serviced: "SERVICED",
  service: "SERVICED",
  cleaned: "CLEANED",
  clean: "CLEANED",
  unknown: "UNKNOWN",
};

const WARRANTY_STATUS_ALIASES: Record<string, string> = {
  documented_active: "DOCUMENTED_ACTIVE",
  "documented active": "DOCUMENTED_ACTIVE",
  active: "DOCUMENTED_ACTIVE",
  "active parts": "DOCUMENTED_ACTIVE",
  "active warranty": "DOCUMENTED_ACTIVE",
  documented_expired: "DOCUMENTED_EXPIRED",
  expired: "DOCUMENTED_EXPIRED",
  explicit_no_warranty: "EXPLICIT_NO_WARRANTY",
  "no warranty": "EXPLICIT_NO_WARRANTY",
  not_documented: "NOT_DOCUMENTED",
  unparseable: "UNPARSEABLE",
};

function normalizeLookup(raw: string | undefined, aliases: Record<string, string>): string | undefined {
  const value = (raw ?? "").trim();
  if (!value) {
    return undefined;
  }

  const lower = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (aliases[lower]) {
    return aliases[lower];
  }

  const underscored = value.toUpperCase().replace(/[\s-]+/g, "_");
  const underscoredAlias = aliases[underscored.toLowerCase().replace(/_/g, " ")];
  if (underscoredAlias) {
    return underscoredAlias;
  }

  return underscored;
}

export function normalizeServiceDetail(raw?: string): string | undefined {
  return normalizeLookup(raw, SERVICE_DETAIL_ALIASES);
}

export function normalizeSystem(raw?: string): string | undefined {
  return normalizeLookup(raw, SYSTEM_ALIASES);
}

export function normalizePrimaryService(raw?: string): string | undefined {
  return normalizeLookup(raw, PRIMARY_SERVICE_ALIASES);
}

export function normalizeComponent(raw?: string): string | undefined {
  return normalizeLookup(raw, COMPONENT_ALIASES);
}

export function normalizeWorkAction(raw?: string): string | undefined {
  return normalizeLookup(raw, WORK_ACTION_ALIASES);
}

export function normalizeWarrantyStatus(raw?: string): string | undefined {
  return normalizeLookup(raw, WARRANTY_STATUS_ALIASES);
}

export function isOrgWideCustomerQuery(raw?: string): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  return value.length === 0
    || ["i", "me", "we", "us", "our", "ours", "my", "company", "phoenix"].includes(value);
}

export function confidenceGuidance(confidence: string): string {
  switch (confidence) {
    case "HIGH":
      return "Use as a normal factual answer.";
    case "MEDIUM":
      return "Answer, but qualify if this classification is material to the question.";
    case "LOW":
      return "Surface uncertainty. Do not present this classification as definitive.";
    default:
      return "UNKNOWN must remain UNKNOWN. Do not invent a more specific classification.";
  }
}
