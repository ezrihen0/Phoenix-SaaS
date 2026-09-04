export const DEFAULT_PRICEBOOK_SYSTEMS = [
  { code: "gas", name: "Gas" },
  { code: "wood", name: "Wood" },
  { code: "general", name: "General" },
] as const;

export const GAS_PRICEBOOK_CATEGORIES = [
  "Pilot Assemblies",
  "Gas Control Valves",
  "Control Modules",
  "Blowers",
  "Switches / Controls",
  "Thermocouples & Thermopiles",
  "Remotes",
  "Appearance & Maintenance",
  "Gas Labor & Services",
] as const;

export const GAS_SAMPLE_ITEMS: Array<{ category: string; name: string; customerPriceCents: number }> = [
  { category: "Pilot Assemblies", name: "SIT Top Mount Pilot Assembly — Natural Gas", customerPriceCents: 0 },
  { category: "Pilot Assemblies", name: "SIT Side Mount Pilot Assembly — Natural Gas", customerPriceCents: 0 },
  { category: "Pilot Assemblies", name: "SIT IPI Pilot Assembly — Natural Gas", customerPriceCents: 0 },
  { category: "Gas Control Valves", name: "SIT 820 Series Gas Valve", customerPriceCents: 0 },
  { category: "Gas Control Valves", name: "SIT 630 Series Gas Valve", customerPriceCents: 0 },
  { category: "Gas Control Valves", name: "Dexen / Robertshaw Gas Valve", customerPriceCents: 0 },
  { category: "Control Modules", name: "SIT Control Module", customerPriceCents: 0 },
  { category: "Blowers", name: "Replacement Blower — 9.75\"", customerPriceCents: 0 },
  { category: "Switches / Controls", name: "SIT On/Off Control", customerPriceCents: 0 },
  { category: "Gas Labor & Services", name: "Gas Fireplace Diagnostic Service", customerPriceCents: 0 },
];
