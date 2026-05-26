"use client";

export function formatSectionLabel(sectionKey: string) {
  const sectionLabels: Record<string, string> = {
    appliance_condition: "Fireplace / Interior",
    venting: "Venting / Draft / Operation",
    safety: "Safety Concerns",
    fireplace_interior: "Fireplace / Interior",
    chimney_exterior: "Chimney / Exterior",
    venting_draft_operation: "Venting / Draft / Operation",
    water_weather_protection: "Water / Weather Protection",
    safety_concerns: "Safety Concerns",
    recommendations: "Recommendations",
  };
  if (sectionLabels[sectionKey]) {
    return sectionLabels[sectionKey];
  }
  return sectionKey
    .split("_")
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");
}

export function reportTypeLabel(reportType: string) {
  if (reportType === "wood_burning_fireplace") return "Wood Fireplace";
  if (reportType === "wood_stove") return "Wood Stove";
  if (reportType === "wett_inspection") return "WETT Site Basic";
  if (reportType === "gas_fireplace") return "Gas Fireplace";
  if (reportType === "garage_door") return "Garage Door";
  if (reportType === "hvac") return "HVAC";
  return reportType.replaceAll("_", " ");
}

export function workflowTypeLabel(workflowType: string) {
  if (workflowType === "compliance_wett") return "WETT Site Basic";
  if (workflowType === "gas_simplified") return "Gas Workflow";
  if (workflowType === "safety_standard") return "Safety Standard";
  return workflowType.replaceAll("_", " ");
}

export function formatInspectionDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function itemStatusLabel(status: "satisfactory" | "unsatisfactory" | "na" | string) {
  if (status === "satisfactory") return "SAT";
  if (status === "unsatisfactory") return "UNSAT";
  if (status === "na") return "N/A";
  return String(status || "—").toUpperCase();
}

export function jurisdictionLabel(provinceCode?: string | null, countryCode?: string | null) {
  const province = provinceCode?.trim();
  if (province && province !== "UNSPEC") {
    return countryCode?.trim() ? `${province} · ${countryCode}` : province;
  }
  return "No jurisdiction";
}

const STATUS_LABELS: Record<string, string> = {
  pass: "Pass",
  warning: "Warning",
  fail: "Fail",
  generated: "Generated",
  sent: "Marked sent",
  locked: "Locked",
  draft: "Draft",
  satisfactory: "Satisfactory",
  unsatisfactory: "Unsatisfactory",
  na: "N/A",
  compliance_wett: "WETT Site Basic",
  gas_simplified: "Gas Workflow",
  safety_standard: "Safety Standard",
};

export function inspectionStatusLabel(raw: string | null | undefined) {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) {
    return "Draft";
  }
  if (STATUS_LABELS[normalized]) {
    return STATUS_LABELS[normalized];
  }
  if (normalized.includes("compliance_wett") || normalized === "wett") {
    return "WETT Site Basic";
  }
  return normalized
    .split("_")
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");
}

type StatusPillProps = {
  status: string | null | undefined;
  className?: string;
};

export function StatusPill({ status, className = "" }: StatusPillProps) {
  const normalized = String(status || "").toLowerCase();
  let tone = "border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)] text-[color:var(--cmp-status-warning-text)]";

  if (normalized.includes("pass") || normalized.includes("generated") || normalized.includes("sent") || normalized.includes("complete") || normalized.includes("ready") || normalized.includes("satisfactory")) {
    tone = "border-[color:var(--cmp-status-success-border)] bg-[color:var(--cmp-status-success-bg)] text-[color:var(--cmp-status-success-text)]";
  } else if (normalized.includes("fail") || normalized.includes("blocked") || normalized.includes("unsatisfactory")) {
    tone = "border-[color:var(--cmp-status-error-border)] bg-[color:var(--cmp-status-error-bg)] text-[color:var(--cmp-status-error-text)]";
  }

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone} ${className}`}>
      {inspectionStatusLabel(status)}
    </span>
  );
}

export function canManageInspections(permissions: string[]) {
  return permissions.includes("inspections.admin");
}
