import { Injectable } from "@nestjs/common";

import {
  type InspectionItemStatus,
  type InspectionPhotoAssignmentType,
} from "../database/entities/inspection-item.entity";
import {
  inspectionReportTypes,
  inspectionWorkflowTypes,
  type InspectionReportType,
  type InspectionWorkflowType,
} from "../database/entities/inspection.entity";

export type InspectionTemplateItem = {
  section_key: string;
  item_key: string;
  item_label: string;
  assignment_type: InspectionPhotoAssignmentType | null;
  is_required: boolean;
  is_legal_mandatory: boolean;
  sort_order: number;
};

export type InspectionTemplateRequiredField = {
  field_key: string;
  field_label: string;
  is_mandatory: boolean;
};

export type InspectionTemplateSeed = {
  report_type: InspectionReportType;
  workflow_type: InspectionWorkflowType;
  items: InspectionTemplateItem[];
  required_fields: InspectionTemplateRequiredField[];
};

export type InspectionReportDisclaimers = {
  main: string;
  limitations?: string;
  workflowSpecific?: string;
};

export type GateValidationInput = {
  workflow_type: InspectionWorkflowType;
  gas_license_number: string | null;
  gas_license_holder_name: string | null;
  items: Array<{
    item_key: string;
    status: InspectionItemStatus;
    is_required: boolean;
    is_legal_mandatory: boolean;
    recommendation_text: string | null;
  }>;
  required_fields: Array<{
    field_key: string;
    is_mandatory: boolean;
    is_satisfied: boolean;
  }>;
};

export type GateValidationResult = {
  valid: boolean;
  errors: string[];
};

export class TemplateNotConfiguredError extends Error {
  constructor(public readonly reportType: InspectionReportType) {
    super(`Inspection template is not configured for report type: ${reportType}`);
    this.name = "TemplateNotConfiguredError";
  }
}

const INSPECTION_WORKFLOW_MAP: Record<InspectionReportType, InspectionWorkflowType> = {
  wood_burning_fireplace: "safety_standard",
  wood_stove: "safety_standard",
  wett_inspection: "compliance_wett",
  gas_fireplace: "gas_simplified",
  garage_door: "safety_standard",
  hvac: "safety_standard",
};

const STANDARD_SECTION_ORDER = [
  "fireplace_interior",
  "chimney_exterior",
  "venting_draft_operation",
  "water_weather_protection",
  "safety_concerns",
  "recommendations",
] as const;

type StandardSectionKey = (typeof STANDARD_SECTION_ORDER)[number];

const SAFETY_ITEMS: InspectionTemplateItem[] = [
  {
    section_key: "fireplace_interior",
    item_key: "firebox",
    item_label: "Firebox",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 10,
  },
  {
    section_key: "fireplace_interior",
    item_key: "damper",
    item_label: "Damper",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 20,
  },
  {
    section_key: "fireplace_interior",
    item_key: "smoke_chamber",
    item_label: "Smoke Chamber",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 30,
  },
  {
    section_key: "fireplace_interior",
    item_key: "ash_cleanout_ash_door",
    item_label: "Ash Cleanout / Ash Door",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 40,
  },
  {
    section_key: "fireplace_interior",
    item_key: "fireback_reflector",
    item_label: "Fireback / Reflector",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 50,
  },
  {
    section_key: "fireplace_interior",
    item_key: "grate_log_set_area",
    item_label: "Grate / Log Set Area",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 60,
  },
  {
    section_key: "chimney_exterior",
    item_key: "chimney_cap_shroud",
    item_label: "Chimney Cap / Shroud",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 10,
  },
  {
    section_key: "chimney_exterior",
    item_key: "crown_chase_cover",
    item_label: "Crown / Chase Cover",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 20,
  },
  {
    section_key: "chimney_exterior",
    item_key: "spark_arrestor_screen",
    item_label: "Spark Arrestor / Screen",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 30,
  },
  {
    section_key: "chimney_exterior",
    item_key: "brickwork_mortar_stucco",
    item_label: "Brickwork / Mortar / Stucco",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 40,
  },
  {
    section_key: "chimney_exterior",
    item_key: "flue_liner_visible_condition",
    item_label: "Flue Liner Visible Condition",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 50,
  },
  {
    section_key: "chimney_exterior",
    item_key: "flashing_area",
    item_label: "Flashing Area",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 60,
  },
  {
    section_key: "venting_draft_operation",
    item_key: "draft_performance",
    item_label: "Draft Performance",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 10,
  },
  {
    section_key: "venting_draft_operation",
    item_key: "smoke_movement",
    item_label: "Smoke Movement",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 20,
  },
  {
    section_key: "venting_draft_operation",
    item_key: "visible_blockage",
    item_label: "Visible Blockage",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 30,
  },
  {
    section_key: "venting_draft_operation",
    item_key: "odor_backdraft_signs",
    item_label: "Odor / Backdraft Signs",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 40,
  },
  {
    section_key: "venting_draft_operation",
    item_key: "creosote_soot_accumulation",
    item_label: "Creosote / Soot Accumulation",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 50,
  },
  {
    section_key: "venting_draft_operation",
    item_key: "airflow_concerns",
    item_label: "Airflow Concerns",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 60,
  },
  {
    section_key: "water_weather_protection",
    item_key: "crown_cracks",
    item_label: "Crown Cracks",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 10,
  },
  {
    section_key: "water_weather_protection",
    item_key: "chase_cover_rust_leak_risk",
    item_label: "Chase Cover Rust / Leak Risk",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 20,
  },
  {
    section_key: "water_weather_protection",
    item_key: "flashing_concerns",
    item_label: "Flashing Concerns",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 30,
  },
  {
    section_key: "water_weather_protection",
    item_key: "water_staining",
    item_label: "Water Staining",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 40,
  },
  {
    section_key: "water_weather_protection",
    item_key: "moisture_related_deterioration",
    item_label: "Moisture-Related Deterioration",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 50,
  },
  {
    section_key: "water_weather_protection",
    item_key: "exterior_sealant_condition",
    item_label: "Exterior Sealant Condition",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 60,
  },
  {
    section_key: "safety_concerns",
    item_key: "fire_hazard_concern",
    item_label: "Fire Hazard Concern",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 10,
  },
  {
    section_key: "safety_concerns",
    item_key: "smoke_entering_home",
    item_label: "Smoke Entering Home",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 20,
  },
  {
    section_key: "safety_concerns",
    item_key: "co_exhaust_concern",
    item_label: "CO / Exhaust Concern",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 30,
  },
  {
    section_key: "safety_concerns",
    item_key: "structural_concern",
    item_label: "Structural Concern",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 40,
  },
  {
    section_key: "safety_concerns",
    item_key: "use_limitation_do_not_use_note",
    item_label: "Use Limitation / Do Not Use Note",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 50,
  },
  {
    section_key: "recommendations",
    item_key: "required_safety_repair",
    item_label: "Required Safety Repair",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 10,
  },
  {
    section_key: "recommendations",
    item_key: "recommended_repair",
    item_label: "Recommended Repair",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 20,
  },
  {
    section_key: "recommendations",
    item_key: "preventive_maintenance",
    item_label: "Preventive Maintenance",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 30,
  },
  {
    section_key: "recommendations",
    item_key: "optional_upgrade",
    item_label: "Optional Upgrade",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 40,
  },
];

const WETT_ITEMS: InspectionTemplateItem[] = [
  {
    section_key: "installation",
    item_key: "clearance_to_combustibles",
    item_label: "Clearance to Combustibles",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: true,
    sort_order: 10,
  },
  {
    section_key: "chimney_system",
    item_key: "flue_liner_condition",
    item_label: "Flue Liner Condition",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: true,
    sort_order: 20,
  },
  {
    section_key: "documentation",
    item_key: "manufacturer_plate",
    item_label: "Appliance Manufacturer Plate",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: true,
    sort_order: 30,
  },
];

const GAS_ITEMS: InspectionTemplateItem[] = [
  {
    section_key: "appliance_information",
    item_key: "appliance_data_plate_verification",
    item_label: "Appliance Data Plate / Rating Label Verification",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 10,
  },
  {
    section_key: "pilot_ignition",
    item_key: "pilot_ignition_operation",
    item_label: "Pilot / Ignition Operation",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 20,
  },
  {
    section_key: "burner_flame",
    item_key: "burner_flame_pattern",
    item_label: "Burner / Flame Pattern",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 30,
  },
  {
    section_key: "gas_valve_controls",
    item_key: "gas_valve_controls_response",
    item_label: "Gas Valve / Controls Response",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 40,
  },
  {
    section_key: "venting",
    item_key: "venting_integrity",
    item_label: "Venting Integrity",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 50,
  },
  {
    section_key: "co_check",
    item_key: "co_check_result",
    item_label: "CO Check Result",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 60,
  },
  {
    section_key: "gas_leak_check",
    item_key: "gas_leak_check_result",
    item_label: "Gas Leak Check Result",
    assignment_type: "required_photo",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 70,
  },
  {
    section_key: "safety_concerns",
    item_key: "visible_safety_concerns",
    item_label: "Visible Safety Concerns / Clearance Review",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 80,
  },
  {
    section_key: "recommendations",
    item_key: "service_recommendation_summary",
    item_label: "Recommendations / Follow-Up Summary",
    assignment_type: "unsatisfactory_evidence",
    is_required: true,
    is_legal_mandatory: false,
    sort_order: 90,
  },
];

const GAS_REQUIRED_FIELDS: InspectionTemplateRequiredField[] = [
  { field_key: "appliance_type", field_label: "Appliance Type", is_mandatory: true },
  { field_key: "manufacturer", field_label: "Manufacturer", is_mandatory: true },
  { field_key: "model", field_label: "Model", is_mandatory: true },
  { field_key: "serial_number", field_label: "Serial Number", is_mandatory: false },
  { field_key: "location", field_label: "Location", is_mandatory: true },
  { field_key: "venting_type", field_label: "Venting Type", is_mandatory: false },
];

const WETT_REQUIRED_FIELDS: InspectionTemplateRequiredField[] = [
  { field_key: "inspector_name", field_label: "Inspector Name", is_mandatory: true },
  { field_key: "inspection_date", field_label: "Inspection Date", is_mandatory: true },
  { field_key: "site_full_address", field_label: "Site Full Address", is_mandatory: true },
  { field_key: "homeowner_name", field_label: "Homeowner Name", is_mandatory: true },
  { field_key: "wett_id", field_label: "WETT Credential / Registration ID", is_mandatory: true },
];

const WETT_CREDENTIAL_FIELD_KEYS = ["wett_id", "wett_license_number", "wett_registration_id"] as const;

const REPORT_DISCLAIMER_EDITABLE_FIELDS: InspectionTemplateRequiredField[] = [
  { field_key: "report_disclaimer_main", field_label: "Report Disclaimer (Main)", is_mandatory: false },
  { field_key: "report_disclaimer_limitations", field_label: "Report Disclaimer (Limitations)", is_mandatory: false },
  { field_key: "report_disclaimer_workflow", field_label: "Report Disclaimer (Workflow Specific)", is_mandatory: false },
];

const WORKFLOW_DISCLAIMER_DEFAULTS: Record<InspectionWorkflowType, InspectionReportDisclaimers> = {
  safety_standard: {
    main:
      "This report is based on a visual inspection of accessible fireplace and chimney components at the time of service. It is not a guarantee of future performance and does not replace repairs, maintenance, code-required upgrades, or specialist evaluation where deficiencies are identified.",
    limitations:
      "Findings are limited to visible and reasonably accessible components. Hidden defects, latent failures, and future deterioration may not be observable during this inspection.",
  },
  compliance_wett: {
    main:
      "This report is based on a visual Site Basic inspection of the accessible components only. Concealed areas, internal chimney conditions, structural components, and components requiring disassembly are excluded unless specifically noted. This report reflects the observed condition at the time of inspection and is intended for documentation, insurance, or real estate review purposes where applicable.",
    limitations:
      "This WETT Site Basic report is not a destructive or invasive evaluation and does not certify concealed components unless specifically documented.",
    workflowSpecific: "Prepared in formal compliance format for insurance and real-estate documentation use where applicable.",
  },
  gas_simplified: {
    main:
      "This report is based on a visual and operational inspection of accessible gas fireplace components at the time of service. Gas-related findings are limited to the checks performed and documented in this report. Any unsafe, damaged, leaking, or non-operational components must be corrected by a qualified gas technician before continued use.",
    limitations:
      "Gas findings are limited to observed operating conditions during inspection and do not replace full pressure or system diagnostics unless explicitly documented.",
  },
};

@Injectable()
export class InspectionWorkflowService {
  private getStandardTemplateItems(): InspectionTemplateItem[] {
    const bySection = new Map<string, InspectionTemplateItem[]>();
    for (const item of SAFETY_ITEMS) {
      const rows = bySection.get(item.section_key) ?? [];
      rows.push({ ...item });
      bySection.set(item.section_key, rows);
    }

    for (const sectionKey of STANDARD_SECTION_ORDER) {
      if (!bySection.has(sectionKey)) {
        throw new Error(`Missing STANDARD section seed items for section: ${sectionKey}`);
      }
    }

    const orderedItems: InspectionTemplateItem[] = [];
    for (const sectionKey of STANDARD_SECTION_ORDER) {
      const sectionItems = bySection.get(sectionKey as StandardSectionKey) ?? [];
      sectionItems.sort((left, right) => left.sort_order - right.sort_order);
      orderedItems.push(...sectionItems);
    }

    return orderedItems;
  }

  private parseStructuredRecommendation(recommendationText: string | null) {
    const text = recommendationText?.trim() ?? "";
    if (!text) {
      return null;
    }
    const issueObserved = text.match(/Issue Observed:\s*(.+)/i)?.[1]?.trim() ?? "";
    const riskIfIgnored = text.match(/Risk If Ignored:\s*(.+)/i)?.[1]?.trim() ?? "";
    const recommendedAction = text.match(/Recommended Action:\s*(.+)/i)?.[1]?.trim() ?? "";
    const priorityLevel = text.match(/Priority Level:\s*(P[1-4])/i)?.[1]?.toUpperCase() ?? "";
    return {
      issueObserved,
      riskIfIgnored,
      recommendedAction,
      priorityLevel,
    };
  }

  resolveWorkflowType(reportType: InspectionReportType): InspectionWorkflowType {
    return INSPECTION_WORKFLOW_MAP[reportType];
  }

  getTemplateSeed(reportType: InspectionReportType): InspectionTemplateSeed {
    if (reportType === "garage_door" || reportType === "hvac") {
      throw new TemplateNotConfiguredError(reportType);
    }

    const workflowType = this.resolveWorkflowType(reportType);
    if (workflowType === "compliance_wett") {
      return {
        report_type: reportType,
        workflow_type: workflowType,
        items: WETT_ITEMS,
        required_fields: [...WETT_REQUIRED_FIELDS, ...REPORT_DISCLAIMER_EDITABLE_FIELDS],
      };
    }
    if (workflowType === "gas_simplified") {
      return {
        report_type: reportType,
        workflow_type: workflowType,
        items: GAS_ITEMS,
        required_fields: [...GAS_REQUIRED_FIELDS, ...REPORT_DISCLAIMER_EDITABLE_FIELDS],
      };
    }
    return {
      report_type: reportType,
      workflow_type: workflowType,
      items: this.getStandardTemplateItems(),
      required_fields: REPORT_DISCLAIMER_EDITABLE_FIELDS,
    };
  }

  resolveReportDisclaimers(
    workflowType: InspectionWorkflowType,
    requiredFields: Array<{ field_key: string; field_value: string | null }>,
  ): InspectionReportDisclaimers {
    const defaults = WORKFLOW_DISCLAIMER_DEFAULTS[workflowType];
    const byKey = new Map(requiredFields.map((field) => [field.field_key, field.field_value?.trim() ?? ""]));

    const main = byKey.get("report_disclaimer_main") || defaults.main;
    const limitations = byKey.get("report_disclaimer_limitations") || defaults.limitations || undefined;
    const workflowSpecific = byKey.get("report_disclaimer_workflow") || defaults.workflowSpecific || undefined;

    return {
      main,
      limitations,
      workflowSpecific,
    };
  }

  validateGenerateGate(input: GateValidationInput): GateValidationResult {
    const errors: string[] = [];
    const requiredItems = input.items.filter((item) => item.is_required);
    const unsatisfactoryItems = input.items.filter((item) => item.status === "unsatisfactory");

    for (const item of requiredItems) {
      if (item.status === "na") {
        errors.push(`Required checklist item is incomplete: ${item.item_key}`);
      }
    }

    for (const item of unsatisfactoryItems) {
      if (!item.recommendation_text?.trim()) {
        errors.push(`Recommendation required for unsatisfactory item: ${item.item_key}`);
      }

      if (input.workflow_type === "safety_standard") {
        const structured = this.parseStructuredRecommendation(item.recommendation_text);
        if (!structured?.issueObserved) {
          errors.push(`Issue observed is required for unsatisfactory STANDARD item: ${item.item_key}`);
        }
        if (!structured?.riskIfIgnored) {
          errors.push(`Risk if ignored is required for unsatisfactory STANDARD item: ${item.item_key}`);
        }
        if (!structured?.recommendedAction) {
          errors.push(`Recommended action is required for unsatisfactory STANDARD item: ${item.item_key}`);
        }
        if (!structured?.priorityLevel || !/^P[1-4]$/i.test(structured.priorityLevel)) {
          errors.push(`Priority level (P1-P4) is required for unsatisfactory STANDARD item: ${item.item_key}`);
        }
      }
    }

    if (input.workflow_type === "gas_simplified") {
      if (!input.gas_license_number?.trim()) {
        errors.push("Gas license number is required for gas fireplace reports.");
      }
      if (!input.gas_license_holder_name?.trim()) {
        errors.push("Gas license holder name is required for gas fireplace reports.");
      }
      for (const field of input.required_fields) {
        if (field.is_mandatory && !field.is_satisfied) {
          errors.push(`Gas mandatory field missing: ${field.field_key}`);
        }
      }
    }

    if (input.workflow_type === "compliance_wett") {
      for (const item of input.items) {
        if (item.is_legal_mandatory && item.status === "na") {
          errors.push(`WETT legal checklist item is incomplete: ${item.item_key}`);
        }
      }
      for (const field of input.required_fields) {
        if (field.is_mandatory && !field.is_satisfied) {
          errors.push(`WETT mandatory field missing: ${field.field_key}`);
        }
      }

      const hasWettCredential = input.required_fields.some(
        (field) => (WETT_CREDENTIAL_FIELD_KEYS as readonly string[]).includes(field.field_key) && field.is_satisfied,
      );
      if (!hasWettCredential) {
        errors.push("WETT credential is required: wett_id, wett_license_number, or wett_registration_id.");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  isKnownReportType(value: string): value is InspectionReportType {
    return (inspectionReportTypes as readonly string[]).includes(value);
  }

  isKnownWorkflowType(value: string): value is InspectionWorkflowType {
    return (inspectionWorkflowTypes as readonly string[]).includes(value);
  }
}
