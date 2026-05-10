import type { InspectionWorkspacePayload } from "@/lib/inspections/browser-api";

export type ReportServiceType = "STANDARD" | "WETT" | "GAS";
export type ReportWorkflowType = "safety_standard" | "compliance_wett" | "gas_simplified";
export type ReportStatus = "draft" | "generated" | "sent" | "locked" | "correction";
export type ReportItemStatus = "satisfactory" | "unsatisfactory" | "not_applicable";
export type RecommendationPriorityCode = "P1" | "P2" | "P3" | "P4";

export type StructuredRecommendationDetails = {
  issueObserved?: string;
  riskIfIgnored?: string;
  recommendedAction?: string;
  priorityLevel?: RecommendationPriorityCode;
};

export type InspectionReportPayload = {
  reportId: string;
  version: string;
  generatedAt?: string;
  status: ReportStatus;
  serviceType: ReportServiceType;
  workflowType: ReportWorkflowType;
  reportType: string;
  createdAt: string;
  score?: number;
  complianceStatus?: string;
  resultLabel?: string;
  company: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    logoUrl?: string;
  };
  customer: {
    name?: string;
    email?: string;
    phone?: string;
  };
  property: {
    address?: string;
    city?: string;
    province?: string;
    postalCode?: string;
  };
  inspector: {
    name: string;
    signatureUrl?: string;
    wettId?: string;
    gasLicenseNumber?: string;
    gasLicenseHolderName?: string;
  };
  sections: Array<{
    id: string;
    title: string;
    items: Array<{
      id: string;
      key: string;
      label: string;
      status: ReportItemStatus;
      observation?: string;
      recommendation?: string;
      recommendationPriority?: RecommendationPriorityCode;
      recommendationPriorityLabel?: string;
      recommendationDetails?: StructuredRecommendationDetails;
      required?: boolean;
      photoIds?: string[];
    }>;
  }>;
  requiredFields: Array<{
    key: string;
    label: string;
    value?: string;
    required: boolean;
    workflowType: ReportWorkflowType;
  }>;
  photos: Array<{
    id: string;
    url: string;
    thumbnailUrl?: string;
    caption?: string;
    itemId?: string;
    assignmentLabel?: string;
    uploadedAt?: string;
  }>;
  disclaimers: {
    main: string;
    limitations?: string;
    workflowSpecific?: string;
  };
  preview?: {
    gateErrors: string[];
    showDraftBadge: boolean;
  };
};

function toServiceType(workflowType: string): ReportServiceType {
  if (workflowType === "compliance_wett") return "WETT";
  if (workflowType === "gas_simplified") return "GAS";
  return "STANDARD";
}

function toWorkflowType(workflowType: string): ReportWorkflowType {
  if (workflowType === "compliance_wett") return "compliance_wett";
  if (workflowType === "gas_simplified") return "gas_simplified";
  return "safety_standard";
}

function toReportStatus(input: InspectionWorkspacePayload): ReportStatus {
  if (input.inspectionMeta.locked_at) return "locked";
  if (input.inspectionMeta.sent_to_customer_at) return "sent";
  if (input.inspectionMeta.generated_pdf_at) return "generated";
  return "draft";
}

function toItemStatus(status: InspectionWorkspacePayload["items"][number]["status"]): ReportItemStatus {
  if (status === "na") return "not_applicable";
  return status;
}

function sectionTitleFromKey(sectionKey: string): string {
  const SECTION_TITLE_MAP: Record<string, string> = {
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
  if (SECTION_TITLE_MAP[sectionKey]) {
    return SECTION_TITLE_MAP[sectionKey];
  }
  return sectionKey
    .split("_")
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");
}

function priorityLabel(priority: RecommendationPriorityCode): string {
  if (priority === "P1") return "Safety Concern / Action Required Before Continued Use";
  if (priority === "P2") return "Recommended Repair / Prevent Further Damage";
  if (priority === "P3") return "Preventive Maintenance / System Longevity";
  return "Optional Upgrade / Performance or Protection Improvement";
}

function deriveRecommendationPriority(input: {
  workflowType: ReportWorkflowType;
  status: ReportItemStatus;
  itemKey: string;
  recommendation?: string;
}): RecommendationPriorityCode | undefined {
  if (input.workflowType !== "safety_standard") {
    return undefined;
  }
  if (input.status !== "unsatisfactory") {
    return undefined;
  }

  const recommendation = input.recommendation?.trim() ?? "";
  const explicit = recommendation.match(/\bP([1-4])\b/i);
  if (explicit) {
    return `P${explicit[1]}` as RecommendationPriorityCode;
  }

  const signal = `${input.itemKey} ${recommendation}`.toLowerCase();
  if (/(unsafe|hazard|critical|co|carbon\s*monoxide|smoke|fire\s*risk|do\s*not\s*use)/.test(signal)) {
    return "P1";
  }
  if (/(water|weather|flashing|leak|moisture|crown|chase|cap|damage)/.test(signal)) {
    return "P2";
  }
  if (/(maintenance|service|clean|sweep|creosote|draft|vent)/.test(signal)) {
    return "P3";
  }
  return "P2";
}

function observationFromStatus(status: ReportItemStatus): string {
  if (status === "unsatisfactory") return "Checklist marked unsatisfactory by inspector.";
  if (status === "not_applicable") return "Checklist marked not applicable for this inspection.";
  return "Checklist marked satisfactory by inspector.";
}

function extractStructuredRecommendationDetails(recommendation?: string): StructuredRecommendationDetails | undefined {
  if (!recommendation?.trim()) {
    return undefined;
  }
  const issueObserved = recommendation.match(/Issue Observed:\s*(.+)/i)?.[1]?.trim();
  const riskIfIgnored = recommendation.match(/Risk If Ignored:\s*(.+)/i)?.[1]?.trim();
  const recommendedAction = recommendation.match(/Recommended Action:\s*(.+)/i)?.[1]?.trim();
  const priorityText = recommendation.match(/Priority Level:\s*(P[1-4])/i)?.[1]?.toUpperCase();
  const priorityLevel = priorityText as RecommendationPriorityCode | undefined;

  if (!issueObserved && !riskIfIgnored && !recommendedAction && !priorityLevel) {
    return undefined;
  }

  return {
    issueObserved,
    riskIfIgnored,
    recommendedAction,
    priorityLevel,
  };
}

export function buildInspectionReportPayload(input: {
  workspace: InspectionWorkspacePayload;
  score: number;
  gateErrors: string[];
}): InspectionReportPayload {
  const { workspace, score, gateErrors } = input;
  const workflowType = toWorkflowType(workspace.inspectionMeta.workflow_type);
  const serviceType = toServiceType(workspace.inspectionMeta.workflow_type);

  const requiredFieldValueByKey = new Map(
    workspace.required_fields.map((field) => [field.field_key, field.field_value?.trim() ?? ""]),
  );
  const readField = (...keys: string[]) => keys.map((key) => requiredFieldValueByKey.get(key) ?? "").find(Boolean) || "";

  const photoIdsByItemId = new Map<string, string[]>();
  for (const photo of workspace.photoPool) {
    if (!photo.assignment_item_id) continue;
    const ids = photoIdsByItemId.get(photo.assignment_item_id) ?? [];
    ids.push(photo.id);
    photoIdsByItemId.set(photo.assignment_item_id, ids);
  }

  const sectionMap = new Map<string, InspectionReportPayload["sections"][number]>();
  for (const item of workspace.items) {
    const section = sectionMap.get(item.section_key) ?? {
      id: item.section_key,
      title: sectionTitleFromKey(item.section_key),
      items: [],
    };
    const normalizedStatus = toItemStatus(item.status);
    const recommendation = item.recommendation_text?.trim() || undefined;
    const recommendationDetails = extractStructuredRecommendationDetails(recommendation);
    const derivedPriority = deriveRecommendationPriority({
      workflowType,
      status: normalizedStatus,
      itemKey: item.item_key,
      recommendation: recommendationDetails?.priorityLevel ? `${recommendation ?? ""} ${recommendationDetails.priorityLevel}` : recommendation,
    });
    section.items.push({
      id: item.id,
      key: item.item_key,
      label: item.item_label,
      status: normalizedStatus,
      observation: observationFromStatus(normalizedStatus),
      recommendation,
      recommendationPriority: derivedPriority,
      recommendationPriorityLabel: derivedPriority ? priorityLabel(derivedPriority) : undefined,
      recommendationDetails: recommendationDetails
        ? {
          ...recommendationDetails,
          priorityLevel: recommendationDetails.priorityLevel ?? derivedPriority,
        }
        : derivedPriority
          ? { priorityLevel: derivedPriority }
          : undefined,
      required: item.is_required,
      photoIds: photoIdsByItemId.get(item.id) ?? [],
    });
    sectionMap.set(item.section_key, section);
  }

  const gasLicenseHolderName = workspace.inspectionMeta.gas_license_holder_name?.trim() || readField("gas_license_holder_name") || undefined;
  const gasLicenseNumber = workspace.inspectionMeta.gas_license_number?.trim() || readField("gas_license_number") || undefined;
  const inspectorName = readField("inspector_name", "inspector_full_name") || "Inspector information pending";

  return {
    reportId: workspace.inspectionMeta.id,
    version: workspace.inspectionMeta.report_version,
    generatedAt: workspace.inspectionMeta.generated_pdf_at ?? workspace.inspectionMeta.report_generated_at ?? undefined,
    status: toReportStatus(workspace),
    serviceType,
    workflowType,
    reportType: workspace.inspectionMeta.report_type,
    createdAt: workspace.inspectionMeta.created_at,
    score,
    complianceStatus: workspace.liveScoreOrCompliance.compliance_status ?? undefined,
    company: {
      name: readField("company_name") || "Phoenix Chimney",
      phone: readField("company_phone", "office_phone") || undefined,
      email: readField("company_email", "office_email") || undefined,
      address: undefined,
      logoUrl: undefined,
    },
    customer: {
      name: workspace.inspectionMeta.client_display_name_snapshot?.trim() || undefined,
    },
    property: {
      address: workspace.inspectionMeta.site_address_snapshot?.trim() || undefined,
      province: workspace.inspectionMeta.province_code || undefined,
    },
    inspector: {
      name: inspectorName,
      wettId: readField("wett_id", "wett_license_number", "wett_registration_id") || undefined,
      gasLicenseHolderName,
      gasLicenseNumber,
    },
    sections: Array.from(sectionMap.values()).map((section) => ({
      ...section,
      items: [...section.items].sort((a, b) => a.key.localeCompare(b.key)),
    })),
    requiredFields: workspace.required_fields.map((field) => ({
      key: field.field_key,
      label: field.field_label,
      value: field.field_value?.trim() || undefined,
      required: field.is_mandatory,
      workflowType,
    })),
    photos: workspace.photoPool.map((photo) => ({
      id: photo.id,
      url: photo.asset_url || photo.thumbnail_url || "",
      thumbnailUrl: photo.thumbnail_url || undefined,
      caption: photo.caption?.trim() || undefined,
      itemId: photo.assignment_item_id || undefined,
      assignmentLabel: photo.assignment_label?.trim() || undefined,
      uploadedAt: photo.created_at,
    })),
    disclaimers: workspace.disclaimers,
    preview: {
      gateErrors,
      showDraftBadge: !workspace.inspectionMeta.generated_pdf_at,
    },
  };
}
