"use client";

import type { ReactNode } from "react";

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
  if (workflowType === "compliance_wett") return "WETT Site Basic / Compliance";
  if (workflowType === "gas_simplified") return "Gas Simplified";
  if (workflowType === "safety_standard") return "Standard Safety";
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

type StatusPillProps = {
  status: string | null | undefined;
  className?: string;
};

export function StatusPill({ status, className = "" }: StatusPillProps) {
  const normalized = String(status || "").toLowerCase();
  let tone = "border-amber-200 bg-amber-50 text-amber-800";

  if (normalized.includes("pass") || normalized.includes("generated") || normalized.includes("sent") || normalized.includes("complete") || normalized.includes("ready")) {
    tone = "border-emerald-200 bg-emerald-50 text-emerald-700";
  } else if (normalized.includes("fail") || normalized.includes("blocked") || normalized.includes("unsatisfactory")) {
    tone = "border-rose-200 bg-rose-50 text-rose-700";
  }

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone} ${className}`}>
      {status || "draft"}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  note,
  tone = "zinc",
}: {
  label: string;
  value: ReactNode;
  note: string;
  tone?: "zinc" | "rose" | "amber" | "emerald";
}) {
  const toneClass = tone === "rose"
    ? "text-rose-600"
    : tone === "amber"
      ? "text-amber-600"
      : tone === "emerald"
        ? "text-emerald-600"
        : "text-zinc-950";

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{note}</p>
    </div>
  );
}

export function canManageInspections(permissions: string[]) {
  return permissions.includes("inspections.admin");
}
