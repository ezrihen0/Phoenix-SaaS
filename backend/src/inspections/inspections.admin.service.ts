import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import { join } from "path";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import type { ServiceType } from "../crm/constants";
import { CustomerEntity } from "../database/entities/customer.entity";
import {
  type InspectionItemStatus,
  InspectionItemEntity,
} from "../database/entities/inspection-item.entity";
import { InspectionPhotoEntity } from "../database/entities/inspection-photo.entity";
import { InspectionRequiredFieldEntity } from "../database/entities/inspection-required-field.entity";
import {
  type InspectionReportType,
  InspectionEntity,
} from "../database/entities/inspection.entity";
import { JobEntity } from "../database/entities/job.entity";
import { InspectionWorkflowService } from "./inspection-workflow.service";

@Injectable()
export class InspectionsAdminService {
  private readonly uploadsRoot = join(process.cwd(), "uploads", "inspection-photos");
  private readonly standardSectionOrder = [
    "fireplace_interior",
    "chimney_exterior",
    "venting_draft_operation",
    "water_weather_protection",
    "safety_concerns",
    "recommendations",
    "appliance_condition",
    "venting",
    "safety",
  ] as const;

  private readonly standardPriorityRank: Record<"P1" | "P2" | "P3" | "P4", number> = {
    P1: 1,
    P2: 2,
    P3: 3,
    P4: 4,
  };

  constructor(
    @InjectRepository(InspectionEntity)
    private readonly inspectionsRepository: Repository<InspectionEntity>,
    @InjectRepository(InspectionItemEntity)
    private readonly inspectionItemsRepository: Repository<InspectionItemEntity>,
    @InjectRepository(InspectionRequiredFieldEntity)
    private readonly inspectionRequiredFieldsRepository: Repository<InspectionRequiredFieldEntity>,
    @InjectRepository(InspectionPhotoEntity)
    private readonly inspectionPhotosRepository: Repository<InspectionPhotoEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
    private readonly workflowService: InspectionWorkflowService,
  ) {}

  async createInspection(input: {
    source: "new_customer" | "existing_customer" | "existing_job" | "internal_draft";
    customer_id: string | null;
    job_id: string | null;
    report_type: InspectionReportType;
    new_customer: {
      first_name: string;
      last_name: string;
      phone: string;
      email: string | null;
      property_address: string;
    } | null;
    property_address: string | null;
    actor: ActorContext;
  }) {
    let customer: CustomerEntity | null = null;
    let job: JobEntity | null = null;
    let isInternalDraft = input.source === "internal_draft";

    if (input.source === "new_customer") {
      if (!input.new_customer) {
        apiError(400, "invalid_new_customer", "new_customer payload is required.");
      }
      const fullName = `${input.new_customer.first_name} ${input.new_customer.last_name}`.trim();
      customer = await this.customersRepository.save(
        this.customersRepository.create({
          full_name: fullName,
          phone: input.new_customer.phone,
          email: input.new_customer.email,
          external_client_number: null,
          company_name: null,
          service_address_line_1: input.new_customer.property_address,
          service_address_line_2: null,
          service_city: "",
          service_state_or_region: null,
          service_postal_code: "",
          source: "website",
          preferred_service_type: "inspection",
          notes: "Created from inspections modal.",
        }),
      );
      job = await this.createInspectionJob(customer, input.new_customer.property_address, input.report_type, input.actor);
    } else if (input.source === "existing_job") {
      if (!input.job_id) {
        apiError(400, "invalid_job_id", "job_id is required.");
      }
      job = await this.jobsRepository.findOne({ where: { id: input.job_id }, relations: { customer: true } });
      if (!job) {
        apiError(404, "job_not_found", "Job not found.");
      }
      customer = job.customer ?? await this.customersRepository.findOne({ where: { id: job.customer_id } });
      if (!customer) {
        apiError(404, "customer_not_found", "Customer not found for selected job.");
      }
    } else if (input.source === "internal_draft") {
      customer = await this.resolveOrCreateDraftCustomer();
    } else {
      if (!input.customer_id) {
        apiError(400, "invalid_customer_id", "customer_id is required.");
      }
      customer = await this.customersRepository.findOne({ where: { id: input.customer_id } });
      if (!customer) {
        apiError(404, "customer_not_found", "Customer not found.");
      }

      if (input.job_id) {
        job = await this.jobsRepository.findOne({
          where: { id: input.job_id, customer_id: customer.id },
        });
        if (!job) {
          apiError(404, "job_not_found", "Job not found for customer.");
        }
      } else {
        const propertyAddress = input.property_address?.trim() || customer.service_address_line_1;
        if (propertyAddress) {
          job = await this.createInspectionJob(customer, propertyAddress, input.report_type, input.actor);
        }
      }
    }

    const template = this.workflowService.getTemplateSeed(input.report_type);
    const inspection = await this.inspectionsRepository.save(
      this.inspectionsRepository.create({
        customer_id: customer.id,
        job_id: job?.id ?? null,
        report_type: input.report_type,
        workflow_type: template.workflow_type,
        province_code: "AB",
        status: "warning",
        site_address_snapshot: isInternalDraft
          ? null
          : job
          ? [job.service_address_line_1, job.service_city, job.service_state_or_region, job.service_postal_code]
            .filter(Boolean)
            .join(", ")
          : (input.property_address?.trim() || customer.service_address_line_1 || null),
        client_display_name_snapshot: isInternalDraft ? "Internal Draft" : (customer.full_name ?? customer.company_name ?? null),
        safety_score_max: 100,
        compliance_status: template.workflow_type === "compliance_wett" ? "incomplete" : null,
        verification_code: isInternalDraft ? "INTERNAL_DRAFT" : null,
      }),
    );

    if (template.items.length > 0) {
      await this.inspectionItemsRepository.save(
        template.items.map((item) =>
          this.inspectionItemsRepository.create({
            inspection_id: inspection.id,
            ...item,
            status: "na",
            updated_by_user_id: input.actor.user.id,
          })),
      );
    }

    if (template.required_fields.length > 0) {
      await this.inspectionRequiredFieldsRepository.save(
        template.required_fields.map((field) =>
          this.inspectionRequiredFieldsRepository.create({
            inspection_id: inspection.id,
            ...field,
            field_value: null,
            is_satisfied: false,
          })),
      );
    }

    return this.getWorkspace(inspection.id);
  }

  async searchCustomers(rawQuery: string) {
    const query = rawQuery.trim().toLowerCase();
    if (query.length < 2) {
      return [] as Array<{ id: string; full_name: string; phone: string; email: string | null }>;
    }

    const rows = await this.customersRepository.createQueryBuilder("customer")
      .select(["customer.id", "customer.full_name", "customer.phone", "customer.email"])
      .where("LOWER(customer.full_name) LIKE :query", { query: `%${query}%` })
      .orWhere("LOWER(COALESCE(customer.email, '')) LIKE :query", { query: `%${query}%` })
      .orWhere("LOWER(customer.phone) LIKE :query", { query: `%${query}%` })
      .orderBy("customer.updated_at", "DESC")
      .take(20)
      .getMany();

    return rows.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      phone: row.phone,
      email: row.email,
    }));
  }

  async searchJobs(rawQuery: string) {
    const query = rawQuery.trim().toLowerCase();
    if (query.length < 2) {
      return [] as Array<{
        id: string;
        job_code: string;
        customer_name: string;
        customer_phone: string;
        service_address: string;
        quote_number: string;
        invoice_number: string;
        report_number: string;
      }>;
    }

    const rows = await this.jobsRepository.find({
      relations: { customer: true },
      order: { updated_at: "DESC" },
    });
    const codeMap = await this.buildPublicJobCodeMap();

    return rows
      .map((row) => {
        const jobCode = codeMap.get(row.id) ?? this.buildPublicJobCodeAttempt(row.id, 0);
        return {
          id: row.id,
          job_code: jobCode,
          customer_name: row.customer?.full_name ?? "Customer",
          customer_phone: row.customer?.phone ?? "",
          service_address: [row.service_address_line_1, row.service_city, row.service_state_or_region, row.service_postal_code]
            .filter(Boolean)
            .join(", "),
          quote_number: this.buildQuoteNumber(jobCode),
          invoice_number: this.buildInvoiceNumber(jobCode),
          report_number: this.buildReportNumber(jobCode),
        };
      })
      .filter((row) => {
        const searchable = [row.job_code, row.customer_name, row.customer_phone, row.service_address]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      })
      .slice(0, 20);
  }

  async listInspections(input: {
    query?: string;
    report_type?: string;
    status?: string;
    customer_id?: string;
  }) {
    const qb = this.inspectionsRepository.createQueryBuilder("inspection")
      .select([
        "inspection.id",
        "inspection.customer_id",
        "inspection.job_id",
        "inspection.client_display_name_snapshot",
        "inspection.site_address_snapshot",
        "inspection.report_type",
        "inspection.workflow_type",
        "inspection.status",
        "inspection.compliance_status",
        "inspection.safety_score",
        "inspection.updated_at",
        "inspection.sent_to_customer_at",
      ])
      .orderBy("inspection.updated_at", "DESC")
      .take(200);

    if (input.report_type?.trim()) {
      qb.andWhere("inspection.report_type = :reportType", { reportType: input.report_type.trim() });
    }
    if (input.status?.trim()) {
      qb.andWhere("inspection.status = :status", { status: input.status.trim() });
    }
    if (input.customer_id?.trim()) {
      qb.andWhere("inspection.customer_id = :customerId", { customerId: input.customer_id.trim() });
    }

    const rows = await qb.getMany();
    const codeMap = await this.buildPublicJobCodeMap();
    const mapped = rows.map((row) => {
      const publicJobCode = row.job_id ? (codeMap.get(row.job_id) ?? this.buildPublicJobCodeAttempt(row.job_id, 0)) : null;
      return {
      id: row.id,
      customer_id: row.customer_id,
      client_name: row.client_display_name_snapshot,
      address: row.site_address_snapshot,
      report_type: row.report_type,
      workflow_type: row.workflow_type,
      status: row.status,
      compliance_status: row.compliance_status,
      safety_score: row.safety_score,
      updated_at: row.updated_at.toISOString(),
      sent_to_customer_at: row.sent_to_customer_at?.toISOString() ?? null,
      public_job_code: publicJobCode,
      quote_number: publicJobCode ? this.buildQuoteNumber(publicJobCode) : null,
      invoice_number: publicJobCode ? this.buildInvoiceNumber(publicJobCode) : null,
      report_number: publicJobCode ? this.buildReportNumber(publicJobCode) : null,
      };
    });

    if (!input.query?.trim()) {
      return mapped;
    }

    const normalized = input.query.trim().toLowerCase();
    return mapped.filter((row) => {
      const searchable = [
        row.client_name,
        row.address,
        row.report_type,
        row.public_job_code,
        row.quote_number,
        row.invoice_number,
        row.report_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalized);
    });
  }

  async getWorkspace(inspectionId: string) {
    const inspection = await this.inspectionsRepository.findOne({
      where: { id: inspectionId },
    });
    if (!inspection) {
      apiError(404, "inspection_not_found", "Inspection not found.");
    }

    const relatedJob = inspection.job_id
      ? await this.jobsRepository.findOne({ where: { id: inspection.job_id } })
      : null;
    const codeMap = await this.buildPublicJobCodeMap();
    const publicJobCode = relatedJob ? (codeMap.get(relatedJob.id) ?? this.buildPublicJobCodeAttempt(relatedJob.id, 0)) : null;

    const [rawItems, requiredFields, photos] = await Promise.all([
      this.inspectionItemsRepository.find({
        where: { inspection_id: inspection.id },
        order: { section_key: "ASC", sort_order: "ASC", created_at: "ASC" },
      }),
      this.inspectionRequiredFieldsRepository.find({
        where: { inspection_id: inspection.id },
      }),
      this.inspectionPhotosRepository.find({
        where: { inspection_id: inspection.id },
        order: { sort_order: "ASC", created_at: "ASC" },
      }),
    ]);

    const items = this.sortItemsForWorkflow(rawItems, inspection.workflow_type);

    const scores = this.computeScoreAndStatus(items, inspection.workflow_type);
    const gate = this.workflowService.validateGenerateGate({
      workflow_type: inspection.workflow_type,
      gas_license_number: inspection.gas_license_number,
      gas_license_holder_name: inspection.gas_license_holder_name,
      items: items.map((item) => ({
        item_key: item.item_key,
        status: item.status,
        is_required: item.is_required,
        is_legal_mandatory: item.is_legal_mandatory,
        recommendation_text: item.recommendation_text,
      })),
      required_fields: requiredFields.map((field) => ({
        field_key: field.field_key,
        is_mandatory: field.is_mandatory,
        is_satisfied: field.is_satisfied,
      })),
    });
    const disclaimers = this.workflowService.resolveReportDisclaimers(
      inspection.workflow_type,
      requiredFields.map((field) => ({
        field_key: field.field_key,
        field_value: field.field_value,
      })),
    );

    const sectionsMap = new Map<string, { key: string; completion: number; total: number }>();
    for (const item of items) {
      const entry = sectionsMap.get(item.section_key) ?? { key: item.section_key, completion: 0, total: 0 };
      entry.total += 1;
      if (item.status !== "na") {
        entry.completion += 1;
      }
      sectionsMap.set(item.section_key, entry);
    }

    const photoCountByItemId = new Map<string, number>();
    for (const photo of photos) {
      if (!photo.assignment_item_id) {
        continue;
      }
      photoCountByItemId.set(photo.assignment_item_id, (photoCountByItemId.get(photo.assignment_item_id) ?? 0) + 1);
    }

    return {
      inspectionMeta: {
        id: inspection.id,
        customer_id: inspection.customer_id,
        job_id: inspection.job_id,
        report_type: inspection.report_type,
        workflow_type: inspection.workflow_type,
        status: inspection.status,
        province_code: inspection.province_code,
        site_address_snapshot: inspection.site_address_snapshot,
        client_display_name_snapshot: inspection.client_display_name_snapshot,
        report_version: inspection.report_snapshot_key ? `v-${inspection.report_snapshot_key.slice(0, 8).toUpperCase()}` : "v-draft",
        report_generated_at: inspection.report_generated_at?.toISOString() ?? null,
        gas_license_number: inspection.gas_license_number,
        gas_license_holder_name: inspection.gas_license_holder_name,
        generated_pdf_url: inspection.generated_pdf_url,
        generated_pdf_at: inspection.generated_pdf_at?.toISOString() ?? null,
        sent_to_customer_at: inspection.sent_to_customer_at?.toISOString() ?? null,
        locked_at: inspection.locked_at?.toISOString() ?? null,
        public_job_code: publicJobCode,
        quote_number: publicJobCode ? this.buildQuoteNumber(publicJobCode) : null,
        invoice_number: publicJobCode ? this.buildInvoiceNumber(publicJobCode) : null,
        report_number: publicJobCode ? this.buildReportNumber(publicJobCode) : null,
        is_internal_draft: inspection.verification_code === "INTERNAL_DRAFT",
        draft_action_label: "Convert Draft to Customer Inspection",
        created_at: inspection.created_at.toISOString(),
        updated_at: inspection.updated_at.toISOString(),
      },
      sections: Array.from(sectionsMap.values()).map((section) => ({
        key: section.key,
        completion_ratio: section.total > 0 ? section.completion / section.total : 0,
        completed: section.completion,
        total: section.total,
      })),
      items: items.map((item) => ({
        id: item.id,
        section_key: item.section_key,
        item_key: item.item_key,
        item_label: item.item_label,
        assignment_type: item.assignment_type,
        status: item.status,
        is_required: item.is_required,
        is_legal_mandatory: item.is_legal_mandatory,
        recommendation_text: item.recommendation_text,
        sort_order: item.sort_order,
        photo_attached_count: photoCountByItemId.get(item.id) ?? 0,
      })),
      required_fields: requiredFields.map((field) => ({
        id: field.id,
        field_key: field.field_key,
        field_label: field.field_label,
        field_value: field.field_value,
        is_mandatory: field.is_mandatory,
        is_satisfied: field.is_satisfied,
      })),
      liveScoreOrCompliance: {
        score: scores.safety_score,
        score_max: 100,
        compliance_status: scores.compliance_status,
        can_generate: gate.valid,
        gate_errors: gate.errors,
      },
      disclaimers,
      photoPool: photos.map((photo) => ({
        id: photo.id,
        photo_type: photo.photo_type,
        caption: photo.caption,
        thumbnail_url: photo.thumbnail_url,
        asset_url: photo.asset_url,
        created_at: photo.created_at.toISOString(),
        assignment_item_id: photo.assignment_item_id,
        assignment_label: photo.assignment_label,
        assignment_type: photo.assignment_type,
      })),
      pdfPreviewUrl: inspection.generated_pdf_url,
    };
  }

  async patchItem(
    inspectionId: string,
    itemId: string,
    input: {
      status?: InspectionItemStatus;
      recommendation_text?: string | null;
    },
    actor: ActorContext,
  ) {
    const [inspection, item] = await Promise.all([
      this.inspectionsRepository.findOne({ where: { id: inspectionId } }),
      this.inspectionItemsRepository.findOne({ where: { id: itemId, inspection_id: inspectionId } }),
    ]);
    if (!inspection) {
      apiError(404, "inspection_not_found", "Inspection not found.");
    }
    if (!item) {
      apiError(404, "inspection_item_not_found", "Inspection item not found.");
    }
    if (inspection.locked_at) {
      apiError(409, "inspection_locked", "Inspection is locked and cannot be edited.");
    }

    if (input.status) {
      item.status = input.status;
    }
    if (input.recommendation_text !== undefined) {
      item.recommendation_text = input.recommendation_text?.trim() ? input.recommendation_text.trim() : null;
    }
    item.updated_by_user_id = actor.user.id;
    await this.inspectionItemsRepository.save(item);

    const items = await this.inspectionItemsRepository.find({ where: { inspection_id: inspectionId } });
    const scores = this.computeScoreAndStatus(items, inspection.workflow_type);
    inspection.report_snapshot_key = randomUUID();
    inspection.generated_pdf_at = null;
    inspection.generated_pdf_url = null;
    inspection.report_generated_at = new Date();
    inspection.sent_to_customer_at = null;
    inspection.safety_score = scores.safety_score;
    inspection.compliance_status = scores.compliance_status;
    inspection.status = scores.inspection_status;
    await this.inspectionsRepository.save(inspection);

    return this.getWorkspace(inspectionId);
  }

  async generate(inspectionId: string) {
    const inspection = await this.inspectionsRepository.findOne({ where: { id: inspectionId } });
    if (!inspection) {
      apiError(404, "inspection_not_found", "Inspection not found.");
    }
    if (inspection.locked_at) {
      apiError(409, "inspection_locked", "Inspection is locked and cannot be regenerated.");
    }
    if (inspection.verification_code === "INTERNAL_DRAFT") {
      apiError(400, "inspection_internal_draft_blocked", "Internal drafts must be converted before generating.");
    }

    const [items, requiredFields] = await Promise.all([
      this.inspectionItemsRepository.find({ where: { inspection_id: inspectionId } }),
      this.inspectionRequiredFieldsRepository.find({ where: { inspection_id: inspectionId } }),
    ]);

    const gate = this.workflowService.validateGenerateGate({
      workflow_type: inspection.workflow_type,
      gas_license_number: inspection.gas_license_number,
      gas_license_holder_name: inspection.gas_license_holder_name,
      items: items.map((item) => ({
        item_key: item.item_key,
        status: item.status,
        is_required: item.is_required,
        is_legal_mandatory: item.is_legal_mandatory,
        recommendation_text: item.recommendation_text,
      })),
      required_fields: requiredFields.map((field) => ({
        field_key: field.field_key,
        is_mandatory: field.is_mandatory,
        is_satisfied: field.is_satisfied,
      })),
    });

    if (!gate.valid) {
      apiError(400, "inspection_generate_gate_failed", "Inspection is not ready to generate.", gate.errors);
    }

    const now = new Date();
    const scores = this.computeScoreAndStatus(items, inspection.workflow_type);
    inspection.report_snapshot_key = randomUUID();
    inspection.report_generated_at = now;
    inspection.generated_pdf_at = now;
    inspection.generated_pdf_url = `/api/inspections/${inspection.id}/pdf-preview?ts=${now.getTime()}`;
    inspection.safety_score = scores.safety_score;
    inspection.compliance_status =
      inspection.workflow_type === "compliance_wett" ? "generated" : scores.compliance_status;
    inspection.status = scores.inspection_status;
    await this.inspectionsRepository.save(inspection);

    return this.getWorkspace(inspectionId);
  }

  async send(inspectionId: string) {
    const inspection = await this.inspectionsRepository.findOne({ where: { id: inspectionId } });
    if (!inspection) {
      apiError(404, "inspection_not_found", "Inspection not found.");
    }
    if (!inspection.generated_pdf_at) {
      apiError(400, "inspection_not_generated", "Generate the report PDF before sending.");
    }
    if (inspection.verification_code === "INTERNAL_DRAFT") {
      apiError(400, "inspection_internal_draft_blocked", "Internal drafts must be converted before sending.");
    }

    const [items, requiredFields] = await Promise.all([
      this.inspectionItemsRepository.find({ where: { inspection_id: inspectionId } }),
      this.inspectionRequiredFieldsRepository.find({ where: { inspection_id: inspectionId } }),
    ]);

    const gate = this.workflowService.validateGenerateGate({
      workflow_type: inspection.workflow_type,
      gas_license_number: inspection.gas_license_number,
      gas_license_holder_name: inspection.gas_license_holder_name,
      items: items.map((item) => ({
        item_key: item.item_key,
        status: item.status,
        is_required: item.is_required,
        is_legal_mandatory: item.is_legal_mandatory,
        recommendation_text: item.recommendation_text,
      })),
      required_fields: requiredFields.map((field) => ({
        field_key: field.field_key,
        is_mandatory: field.is_mandatory,
        is_satisfied: field.is_satisfied,
      })),
    });

    if (!gate.valid) {
      apiError(400, "inspection_send_gate_failed", "Inspection failed validation and cannot be sent.", gate.errors);
    }

    const now = new Date();
    inspection.sent_to_customer_at = now;
    inspection.locked_at = now;
    if (inspection.workflow_type === "compliance_wett") {
      inspection.compliance_status = "sent";
    }
    await this.inspectionsRepository.save(inspection);

    return this.getWorkspace(inspectionId);
  }

  async unlockForCorrection(inspectionId: string) {
    const inspection = await this.inspectionsRepository.findOne({ where: { id: inspectionId } });
    if (!inspection) {
      apiError(404, "inspection_not_found", "Inspection not found.");
    }
    if (!inspection.locked_at) {
      apiError(409, "inspection_not_locked", "Inspection is already unlocked.");
    }

    inspection.locked_at = null;
    inspection.generated_pdf_at = null;
    inspection.generated_pdf_url = null;
    inspection.sent_to_customer_at = null;
    inspection.report_snapshot_key = randomUUID();
    inspection.report_generated_at = new Date();
    if (inspection.workflow_type === "compliance_wett" && inspection.compliance_status === "sent") {
      inspection.compliance_status = "incomplete";
    }
    await this.inspectionsRepository.save(inspection);

    return this.getWorkspace(inspectionId);
  }

  async patchRequiredField(
    inspectionId: string,
    fieldId: string,
    input: { field_value?: string | null; is_satisfied?: boolean },
  ) {
    const [inspection, field] = await Promise.all([
      this.inspectionsRepository.findOne({ where: { id: inspectionId } }),
      this.inspectionRequiredFieldsRepository.findOne({
        where: { id: fieldId, inspection_id: inspectionId },
      }),
    ]);
    if (!inspection) {
      apiError(404, "inspection_not_found", "Inspection not found.");
    }
    if (inspection.locked_at) {
      apiError(409, "inspection_locked", "Inspection is locked and cannot be edited.");
    }
    if (!field) {
      apiError(404, "inspection_required_field_not_found", "Inspection required field not found.");
    }

    if (input.field_value !== undefined) {
      field.field_value = input.field_value?.trim() ? input.field_value.trim() : null;
    }
    if (input.is_satisfied !== undefined) {
      field.is_satisfied = input.is_satisfied;
    } else if (input.field_value !== undefined) {
      field.is_satisfied = Boolean(field.field_value?.trim());
    }

    await this.inspectionRequiredFieldsRepository.save(field);
    inspection.report_snapshot_key = randomUUID();
    inspection.generated_pdf_at = null;
    inspection.generated_pdf_url = null;
    inspection.report_generated_at = new Date();
    inspection.sent_to_customer_at = null;
    await this.inspectionsRepository.save(inspection);
    return this.getWorkspace(inspectionId);
  }

  async patchInspectionMeta(
    inspectionId: string,
    input: {
      gas_license_number?: string | null;
      gas_license_holder_name?: string | null;
    },
  ) {
    const inspection = await this.inspectionsRepository.findOne({ where: { id: inspectionId } });
    if (!inspection) {
      apiError(404, "inspection_not_found", "Inspection not found.");
    }
    if (inspection.locked_at) {
      apiError(409, "inspection_locked", "Inspection is locked and cannot be edited.");
    }

    if (input.gas_license_number !== undefined) {
      inspection.gas_license_number = input.gas_license_number?.trim() || null;
    }
    if (input.gas_license_holder_name !== undefined) {
      inspection.gas_license_holder_name = input.gas_license_holder_name?.trim() || null;
    }

    inspection.report_snapshot_key = randomUUID();
    inspection.generated_pdf_at = null;
    inspection.generated_pdf_url = null;
    inspection.report_generated_at = new Date();
    inspection.sent_to_customer_at = null;
    await this.inspectionsRepository.save(inspection);
    return this.getWorkspace(inspectionId);
  }

  async assignPhoto(
    inspectionId: string,
    photoId: string,
    itemId: string,
    assignmentType: "required_photo" | "unsatisfactory_evidence" | null,
    makePrimary: boolean,
  ) {
    const [inspection, photo, item] = await Promise.all([
      this.inspectionsRepository.findOne({ where: { id: inspectionId } }),
      this.inspectionPhotosRepository.findOne({ where: { id: photoId, inspection_id: inspectionId } }),
      this.inspectionItemsRepository.findOne({ where: { id: itemId, inspection_id: inspectionId } }),
    ]);
    if (!inspection) {
      apiError(404, "inspection_not_found", "Inspection not found.");
    }
    if (inspection.locked_at) {
      apiError(409, "inspection_locked", "Inspection is locked and cannot be edited.");
    }

    if (!photo) {
      apiError(404, "inspection_photo_not_found", "Inspection photo not found.");
    }
    if (!item) {
      apiError(404, "inspection_item_not_found", "Inspection item not found.");
    }

    if (makePrimary) {
      await this.inspectionPhotosRepository.createQueryBuilder()
        .update(InspectionPhotoEntity)
        .set({ is_primary_for_item: false })
        .where("inspection_id = :inspectionId AND assignment_item_id = :itemId", { inspectionId, itemId })
        .execute();
    }

    photo.assignment_item_id = item.id;
    photo.assignment_type = assignmentType ?? item.assignment_type;
    photo.assignment_label = `Evidence: ${item.item_label} Issue`;
    photo.is_primary_for_item = makePrimary;
    await this.inspectionPhotosRepository.save(photo);
    inspection.report_snapshot_key = randomUUID();
    inspection.generated_pdf_at = null;
    inspection.generated_pdf_url = null;
    inspection.report_generated_at = new Date();
    inspection.sent_to_customer_at = null;
    await this.inspectionsRepository.save(inspection);

    return this.getWorkspace(inspectionId);
  }

  async uploadPhotos(inspectionId: string, files: Array<{ originalname: string; mimetype: string; buffer: Buffer }>) {
    const inspection = await this.inspectionsRepository.findOne({ where: { id: inspectionId } });
    if (!inspection) {
      apiError(404, "inspection_not_found", "Inspection not found.");
    }
    if (inspection.locked_at) {
      apiError(409, "inspection_locked", "Inspection is locked and cannot be edited.");
    }

    if (!files.length) {
      apiError(400, "no_files_uploaded", "At least one image file is required.");
    }

    await fs.mkdir(this.uploadsRoot, { recursive: true });
    const saved: InspectionPhotoEntity[] = [];

    for (const file of files) {
      if (!file.mimetype.startsWith("image/")) {
        continue;
      }
      const extension = this.resolveImageExtension(file.mimetype, file.originalname);
      const fileName = `${randomUUID()}.${extension}`;
      const absolutePath = join(this.uploadsRoot, fileName);
      await fs.writeFile(absolutePath, file.buffer);

      const photo = await this.inspectionPhotosRepository.save(
        this.inspectionPhotosRepository.create({
          inspection_id: inspectionId,
          photo_type: "finding",
          caption: null,
          sort_order: 0,
          storage_key: fileName,
          thumbnail_url: `/api/inspections/photos/${fileName}/asset`,
          asset_url: `/api/inspections/photos/${fileName}/asset`,
        }),
      );
      saved.push(photo);
    }

    if (!saved.length) {
      apiError(400, "no_valid_images", "No valid image files were uploaded.");
    }

    inspection.report_snapshot_key = randomUUID();
    inspection.generated_pdf_at = null;
    inspection.generated_pdf_url = null;
    inspection.report_generated_at = new Date();
    inspection.sent_to_customer_at = null;
    await this.inspectionsRepository.save(inspection);

    return this.getWorkspace(inspectionId);
  }

  async getPhotoAssetStream(fileName: string) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "");
    const absolutePath = join(this.uploadsRoot, safeName);
    try {
      await fs.access(absolutePath);
    } catch {
      apiError(404, "inspection_photo_asset_not_found", "Inspection photo asset not found.");
    }
    return createReadStream(absolutePath);
  }

  async renderInspectionPdf(inspectionId: string) {
    const inspection = await this.inspectionsRepository.findOne({ where: { id: inspectionId } });
    if (!inspection) {
      apiError(404, "inspection_not_found", "Inspection not found.");
    }

    const [rawItems, photos, requiredFields] = await Promise.all([
      this.inspectionItemsRepository.find({
        where: { inspection_id: inspectionId },
        order: { section_key: "ASC", sort_order: "ASC" },
      }),
      this.inspectionPhotosRepository.find({
        where: { inspection_id: inspectionId },
        order: { created_at: "ASC" },
      }),
      this.inspectionRequiredFieldsRepository.find({
        where: { inspection_id: inspectionId },
      }),
    ]);

    const items = this.sortItemsForWorkflow(rawItems, inspection.workflow_type);

    const scores = this.computeScoreAndStatus(items, inspection.workflow_type);
    const disclaimers = this.workflowService.resolveReportDisclaimers(
      inspection.workflow_type,
      requiredFields.map((field) => ({
        field_key: field.field_key,
        field_value: field.field_value,
      })),
    );
    const generatedAt = inspection.generated_pdf_at ?? inspection.report_generated_at ?? new Date();
    const reportVersion = inspection.report_snapshot_key ? `v-${inspection.report_snapshot_key.slice(0, 8).toUpperCase()}` : "v-draft";
    const publicJobCode = inspection.job_id
      ? (await this.buildPublicJobCodeMap()).get(inspection.job_id) ?? this.buildPublicJobCodeAttempt(inspection.job_id, 0)
      : null;
    const wettCustomerReportNumber = inspection.workflow_type === "compliance_wett" && publicJobCode
      ? this.buildReportNumber(publicJobCode)
      : null;
    const gasCustomerReportNumber = inspection.workflow_type === "gas_simplified" && publicJobCode
      ? this.buildReportNumber(publicJobCode)
      : null;
    const displayReportLabel = inspection.workflow_type === "safety_standard"
      ? `R-${reportVersion.replace(/^v-/i, "")}`
      : inspection.workflow_type === "compliance_wett"
        ? wettCustomerReportNumber || `R-${reportVersion.replace(/^v-/i, "")}`
        : gasCustomerReportNumber || `R-${reportVersion.replace(/^v-/i, "")}`;
    const displayReportLabelText = "Report Number";
    const itemById = new Map(items.map((item) => [item.id, item]));
    const assignedEvidencePhotos = photos.filter((photo) => photo.assignment_item_id);
    const reportEvidencePhotos = assignedEvidencePhotos.slice(0, 18);
    const evidenceEntries = await Promise.all(
      reportEvidencePhotos.map(async (photo) => {
        const relatedItem = photo.assignment_item_id ? itemById.get(photo.assignment_item_id) : null;
        const sectionName = relatedItem
          ? relatedItem.section_key.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ")
          : null;
        return {
          id: photo.id,
          caption: photo.caption?.trim() || "No caption provided.",
          relatedItemLabel: relatedItem?.item_label ?? photo.assignment_label?.trim() ?? "Inspection Evidence",
          sectionName,
          capturedAt: photo.created_at ? photo.created_at.toISOString() : null,
          imageDataUri: await this.buildPhotoDataUri(photo),
        };
      }),
    );
    const lines = [
      "Phoenix Inspection Report",
      `Inspection ID: ${inspection.id}`,
      `Report Version: ${reportVersion}`,
      `Generated: ${generatedAt.toISOString()}`,
      `Report Label: ${displayReportLabelText} ${displayReportLabel}`,
      `Items: ${items.length}`,
      `Evidence Photos: ${evidenceEntries.length}`,
      "Structured PDF rendering unavailable; using fallback renderer.",
    ];
    return this.buildSimplePdf(lines);
  }

  private renderInspectionPdfHtml(input: {
    inspection: InspectionEntity;
    items: InspectionItemEntity[];
    evidenceEntries: Array<{
      id: string;
      caption: string;
      relatedItemLabel: string;
      sectionName: string | null;
      capturedAt: string | null;
      imageDataUri: string | null;
    }>;
    requiredFields: InspectionRequiredFieldEntity[];
    scores: { safety_score: number | null; compliance_status: string | null; inspection_status: "pass" | "warning" | "fail" };
    disclaimers: { main: string; limitations?: string; workflowSpecific?: string };
    generatedAt: Date;
    reportVersion: string;
    customerReportNumber?: string | null;
  }) {
    const requiredFieldByKey = new Map(input.requiredFields.map((field) => [field.field_key, field.field_value?.trim() ?? ""]));
    const inspectorName = requiredFieldByKey.get("inspector_name") || requiredFieldByKey.get("inspector_full_name") || "";
    const inspectionDateLabel = requiredFieldByKey.get("inspection_date") || input.inspection.created_at.toISOString().slice(0, 10);
    const companyName = requiredFieldByKey.get("company_name") || "Phoenix Chimney";
    const companyPhone = requiredFieldByKey.get("company_phone") || requiredFieldByKey.get("office_phone") || "Information pending";
    const companyEmail = requiredFieldByKey.get("company_email") || requiredFieldByKey.get("office_email") || "Information pending";
    const customerLabel = input.inspection.client_display_name_snapshot?.trim() || "N/A";
    const propertyLabel = input.inspection.site_address_snapshot?.trim() || "N/A";
    const mandatoryRequiredMissingCount = input.requiredFields.filter((field) => field.is_mandatory && !field.is_satisfied).length;
    const satisfactoryCount = input.items.filter((item) => item.status === "satisfactory").length;
    const unsatisfactoryCount = input.items.filter((item) => item.status === "unsatisfactory").length;
    const statusSummary = this.resolveReportStatusSummary({
      workflowType: input.inspection.workflow_type,
      inspectionStatus: input.inspection.status,
      mandatoryRequiredMissingCount,
      satisfactoryCount,
      unsatisfactoryCount,
    });
    const findingsRows = input.items.map((item) => {
      const statusLabel = item.status === "na" ? "Not Applicable" : item.status === "satisfactory" ? "Satisfactory" : "Unsatisfactory";
      const section = this.resolveSectionLabel(item.section_key);
      const recommendation = item.recommendation_text?.trim() || "None documented";
      const structuredRecommendation = this.parseStructuredRecommendation(item.recommendation_text);
      const priority = input.inspection.workflow_type === "safety_standard"
        ? this.resolveStandardRecommendationPriority({
          itemKey: item.item_key,
          status: item.status,
          recommendationText: item.recommendation_text,
        })
        : null;
      const rowClass = item.status === "unsatisfactory" ? "row-unsat" : item.status === "na" ? "row-na" : "";
      const recommendationBody = structuredRecommendation
        ? [
          `<strong>Issue Observed:</strong> ${this.escapeHtml(structuredRecommendation.issueObserved || "Not provided.")}`,
          `<strong>Risk If Ignored:</strong> ${this.escapeHtml(structuredRecommendation.riskIfIgnored || "Not provided.")}`,
          `<strong>Recommended Action:</strong> ${this.escapeHtml(structuredRecommendation.recommendedAction || "Not provided.")}`,
        ].join("<br/>")
        : this.escapeHtml(recommendation);
      const recommendationCell = priority
        ? `<strong>${this.escapeHtml(structuredRecommendation?.priorityLevel || priority.code)}:</strong> ${this.escapeHtml(priority.label)}<br/>${recommendationBody}`
        : recommendationBody;
      return `
        <tr class="${rowClass}">
          <td>
            <div class="section">${this.escapeHtml(section)}</div>
            <div class="component">${this.escapeHtml(item.item_label)}</div>
          </td>
          <td>${this.escapeHtml(statusLabel)}</td>
          <td>${recommendationCell}</td>
        </tr>
      `;
    }).join("\n");

    const standardChecklistSections = input.inspection.workflow_type === "safety_standard"
      ? input.items.reduce((map, item) => {
        const sectionLabel = this.resolveSectionLabel(item.section_key);
        const rows = map.get(sectionLabel) ?? [];
        rows.push(item);
        map.set(sectionLabel, rows);
        return map;
      }, new Map<string, InspectionItemEntity[]>())
      : new Map<string, InspectionItemEntity[]>();

    const customerVisibleStandardSections = Array.from(standardChecklistSections.entries())
      .filter(([, sectionItems]) => sectionItems[0]?.section_key !== "recommendations");

    const standardChecklistGroupedHtml = customerVisibleStandardSections
      .map(([sectionLabel, sectionItems]) => {
        const rows = sectionItems.map((item) => {
          const statusLabel = item.status === "na" ? "Not Applicable" : item.status === "satisfactory" ? "Satisfactory" : "Unsatisfactory";
          const priority = this.resolveStandardRecommendationPriority({
            itemKey: item.item_key,
            status: item.status,
            recommendationText: item.recommendation_text,
          });
          const structured = this.parseStructuredRecommendation(item.recommendation_text);
          const recommendation = item.status === "unsatisfactory"
            ? (structured?.recommendedAction || structured?.issueObserved || item.recommendation_text?.trim() || "Attention required. See summary recommendation.")
            : item.status === "satisfactory"
              ? "No visible concern observed"
              : "-";
          const rowClass = item.status === "unsatisfactory" ? "row-unsat" : item.status === "na" ? "row-na" : "";
          return `
            <tr class="${rowClass}">
              <td>${this.escapeHtml(item.item_label)}</td>
              <td>${this.escapeHtml(statusLabel)}</td>
              <td>${this.escapeHtml(priority?.code || "-")}</td>
              <td>${this.escapeHtml(recommendation)}</td>
            </tr>
          `;
        }).join("\n");
        return `
          <div class="section-group">
            <h3>${this.escapeHtml(sectionLabel)}</h3>
            <table>
              <thead>
                <tr>
                  <th style="width: 36%;">Item</th>
                  <th style="width: 16%;">Status</th>
                  <th style="width: 12%;">Priority</th>
                  <th style="width: 36%;">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                ${rows || `<tr><td colspan="4">No checklist items available.</td></tr>`}
              </tbody>
            </table>
          </div>
        `;
      })
      .join("\n");

    const evidenceCards = input.evidenceEntries
      .map((entry) => {
        const created = entry.capturedAt ? new Date(entry.capturedAt).toLocaleString() : "N/A";
        return `
          <article class="evidence-card">
            ${entry.imageDataUri ? `<img class="evidence-image" src="${entry.imageDataUri}" alt="Inspection evidence ${this.escapeHtml(entry.id)}" />` : ""}
            <h4>${this.escapeHtml(entry.relatedItemLabel)}</h4>
            ${entry.sectionName ? `<p class="meta">Section: ${this.escapeHtml(entry.sectionName)}</p>` : ""}
            <p>${this.escapeHtml(entry.caption)}</p>
            <p class="meta">Captured: ${this.escapeHtml(created)}</p>
          </article>
        `;
      })
      .join("\n");

    const inspectionAreasReviewed = customerVisibleStandardSections.map(([sectionLabel]) => sectionLabel);
    const inspectionAreasReviewedText = inspectionAreasReviewed.length
      ? inspectionAreasReviewed.join(", ")
      : "No inspection areas recorded.";
    const standardPrimaryIssueLocation = input.items
      .find((item) => item.status === "unsatisfactory")
      ? this.resolveStandardIssueLocation(
        input.items.find((item) => item.status === "unsatisfactory")?.section_key ?? "",
      )
      : null;
    const standardDiagramSvg = this.renderStandardSystemDiagramSvg(standardPrimaryIssueLocation);
    const priorityRecommendations = input.items
      .filter((item) => item.status === "unsatisfactory")
      .reduce<Array<{
        priorityCode: "P1" | "P2" | "P3" | "P4";
        priorityLabel: string;
        sectionLabel: string;
        itemLabel: string;
        issueObserved: string;
        riskIfIgnored: string;
        recommendedAction: string;
      }>>((entries, item) => {
        const structured = this.parseStructuredRecommendation(item.recommendation_text);
        const priority = this.resolveStandardRecommendationPriority({
          itemKey: item.item_key,
          status: item.status,
          recommendationText: item.recommendation_text,
        });
        if (!priority) {
          return entries;
        }
        entries.push({
          priorityCode: (structured?.priorityLevel || priority.code) as "P1" | "P2" | "P3" | "P4",
          priorityLabel: priority.label,
          sectionLabel: this.resolveSectionLabel(item.section_key),
          itemLabel: item.item_label,
          issueObserved: structured?.issueObserved || "Issue documented during visual inspection.",
          riskIfIgnored: structured?.riskIfIgnored || "Condition may worsen and increase risk over time.",
          recommendedAction: structured?.recommendedAction || item.recommendation_text?.trim() || "Recommended repair by a qualified technician.",
        });
        return entries;
      }, [])
      .sort((a, b) => this.standardPriorityRank[a.priorityCode] - this.standardPriorityRank[b.priorityCode]);
    const topPriorityFinding = priorityRecommendations[0] ?? null;
    const resolveStandardPriorityTone = (priorityCode?: "P1" | "P2" | "P3" | "P4") => {
      switch (priorityCode) {
        case "P1":
          return {
            toneClass: "priority-tone-critical",
            badgeClass: "priority-badge-critical",
            label: "Immediate Safety Attention",
          };
        case "P2":
          return {
            toneClass: "priority-tone-repair",
            badgeClass: "priority-badge-repair",
            label: "Repair Attention",
          };
        case "P3":
          return {
            toneClass: "priority-tone-maintenance",
            badgeClass: "priority-badge-maintenance",
            label: "Maintenance Planning",
          };
        case "P4":
          return {
            toneClass: "priority-tone-upgrade",
            badgeClass: "priority-badge-upgrade",
            label: "Optional Upgrade",
          };
        default:
          return {
            toneClass: "priority-tone-clear",
            badgeClass: "priority-badge-clear",
            label: "Routine Review",
          };
      }
    };
    const standardTopPriorityTone = resolveStandardPriorityTone(topPriorityFinding?.priorityCode);
    const topPriorityRecommendationHtml = topPriorityFinding
      ? `
        <div class="priority-card ${standardTopPriorityTone.toneClass}">
          <div class="priority-header-row">
            <span class="priority-badge ${standardTopPriorityTone.badgeClass}">${this.escapeHtml(standardTopPriorityTone.label)}</span>
          </div>
          <p class="priority-head">${this.escapeHtml(topPriorityFinding.priorityCode)}: ${this.escapeHtml(topPriorityFinding.priorityLabel)}</p>
          <p class="priority-sub">${this.escapeHtml(topPriorityFinding.sectionLabel)} | ${this.escapeHtml(topPriorityFinding.itemLabel)}</p>
          <p><strong>Issue Observed:</strong> ${this.escapeHtml(topPriorityFinding.issueObserved)}</p>
          <p><strong>Risk If Ignored:</strong> ${this.escapeHtml(topPriorityFinding.riskIfIgnored)}</p>
          <p><strong>Recommended Action:</strong> ${this.escapeHtml(topPriorityFinding.recommendedAction)}</p>
        </div>
      `
      : "<p>No immediate safety concern was identified during this inspection.</p>";
    const standardMainConcern = topPriorityFinding
      ? `${topPriorityFinding.itemLabel} flagged as ${topPriorityFinding.priorityCode} attention.`
      : "No main concern identified during this inspection.";
    const standardRecommendedNextStep = (() => {
      if (!topPriorityFinding) {
        return "Continue regular maintenance and schedule the next routine inspection.";
      }
      if (
        topPriorityFinding.itemLabel.toLowerCase() === "firebox"
        && /refractory/i.test(topPriorityFinding.recommendedAction)
      ) {
        return "Approve Firebox Refractory Repair";
      }
      const normalized = topPriorityFinding.recommendedAction.replace(/[.\s]+$/g, "").trim();
      if (normalized.length > 0) {
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
      }
      return `Approve ${topPriorityFinding.itemLabel} repair`;
    })();
    const standardReportTypeLabel = input.inspection.report_type === "wood_burning_fireplace"
      ? "Standard Safety Inspection"
      : input.inspection.report_type;
    const standardNextStepSupportText = (() => {
      if (!topPriorityFinding) {
        return "Continue regular maintenance to help protect long-term fireplace performance.";
      }
      if (
        topPriorityFinding.itemLabel.toLowerCase() === "firebox"
        && /refractory/i.test(topPriorityFinding.recommendedAction)
      ) {
        return "This repair is recommended to reduce further deterioration and help maintain safe fireplace operation.";
      }
      return "This action is recommended to address the documented concern and support safe fireplace operation.";
    })();
    const standardInspectorDisplay = inspectorName || "Office Review Pending";
    const standardCompanyNameDisplay = requiredFieldByKey.get("company_name") || "Phoenix Chimney Fireplace";
    const standardCompanyPhoneDisplay = requiredFieldByKey.get("company_phone") || requiredFieldByKey.get("office_phone") || "";
    const standardCompanyEmailDisplay = requiredFieldByKey.get("company_email") || requiredFieldByKey.get("office_email") || "";
    const standardCustomerReportNumber = `R-${input.reportVersion.replace(/^v-/i, "")}`;
    const standardDecisionHeadline = topPriorityFinding
      ? `Recommended action: ${standardRecommendedNextStep}`
      : "No critical repair approval is required at this time.";
    const renderTokenList = (values: string[]) => values.length
      ? `
        <div class="token-list">
          ${values.map((value) => `<span class="token-chip">${this.escapeHtml(value)}</span>`).join("")}
        </div>
      `
      : "";
    const standardKeyFindingsHtml = priorityRecommendations.length
      ? `
        <ul class="key-findings-list">
          ${priorityRecommendations.slice(0, 3).map((entry) => {
            const tone = resolveStandardPriorityTone(entry.priorityCode);
            return `
            <li class="key-finding-item ${tone.toneClass}">
              <div class="priority-header-row">
                <span class="priority-badge ${tone.badgeClass}">${this.escapeHtml(entry.priorityCode)} | ${this.escapeHtml(tone.label)}</span>
              </div>
              <p><strong>${this.escapeHtml(entry.itemLabel)}:</strong> ${this.escapeHtml(entry.issueObserved)}</p>
              <p><strong>Priority:</strong> ${this.escapeHtml(entry.priorityLabel)}</p>
              <p><strong>Recommended Action:</strong> ${this.escapeHtml(entry.recommendedAction)}</p>
            </li>
          `;
          }).join("\n")}
        </ul>
      `
      : "<p class=\"summary-copy\">No flagged findings were recorded in this report.</p>";
    const standardFlaggedFindingsHtml = priorityRecommendations.length
      ? priorityRecommendations.map((entry) => {
        const tone = resolveStandardPriorityTone(entry.priorityCode);
        return `
        <article class="priority-card priority-detail-card ${tone.toneClass}">
          <div class="priority-header-row">
            <span class="priority-badge ${tone.badgeClass}">${this.escapeHtml(tone.label)}</span>
          </div>
          <p class="priority-head">${this.escapeHtml(entry.priorityCode)}: ${this.escapeHtml(entry.priorityLabel)}</p>
          <p class="priority-sub">${this.escapeHtml(entry.sectionLabel)} | ${this.escapeHtml(entry.itemLabel)}</p>
          <p><strong>Issue Observed:</strong> ${this.escapeHtml(entry.issueObserved)}</p>
          <p><strong>Risk If Ignored:</strong> ${this.escapeHtml(entry.riskIfIgnored)}</p>
          <p><strong>Recommended Action:</strong> ${this.escapeHtml(entry.recommendedAction)}</p>
        </article>
      `;
      }).join("\n")
      : "<p>No attention-required findings were recorded.</p>";
    const standardVerifiedAreasHtml = customerVisibleStandardSections
      .map(([sectionLabel, sectionItems]) => {
        const verifiedItems = sectionItems
          .filter((item) => item.status === "satisfactory")
          .map((item) => item.item_label);
        const notApplicableItems = sectionItems
          .filter((item) => item.status === "na")
          .map((item) => item.item_label);
        if (!verifiedItems.length && !notApplicableItems.length) {
          return "";
        }
        return `
          <article class="verified-area-card">
            <p class="verified-area-title">${this.escapeHtml(sectionLabel)}</p>
            ${verifiedItems.length ? `<div><p class="verified-copy"><strong>Verified</strong></p>${renderTokenList(verifiedItems)}</div>` : ""}
            ${notApplicableItems.length ? `<div><p class="verified-copy"><strong>Not Applicable</strong></p>${renderTokenList(notApplicableItems)}</div>` : ""}
          </article>
        `;
      })
      .filter(Boolean)
      .join("\n");
    const prioritizedEvidenceEntries = [...input.evidenceEntries]
      .sort((a, b) => Number(Boolean(b.imageDataUri)) - Number(Boolean(a.imageDataUri)));
    const standardEvidencePreviewHtml = prioritizedEvidenceEntries.some((entry) => Boolean(entry.imageDataUri))
      ? prioritizedEvidenceEntries.filter((entry) => Boolean(entry.imageDataUri)).slice(0, 2).map((entry) => {
        const created = entry.capturedAt ? new Date(entry.capturedAt).toLocaleString() : "N/A";
        return `
          <article class="evidence-card evidence-card-compact">
            ${entry.imageDataUri ? `<img class="evidence-image" src="${entry.imageDataUri}" alt="Inspection evidence ${this.escapeHtml(entry.id)}" />` : ""}
            <h4>${this.escapeHtml(entry.relatedItemLabel)}</h4>
            <p>${this.escapeHtml(entry.caption)}</p>
            <p class="meta">Captured: ${this.escapeHtml(created)}</p>
          </article>
        `;
      }).join("\n")
      : "";

    if (input.inspection.workflow_type === "compliance_wett") {
      const wettId = requiredFieldByKey.get("wett_id")
        || requiredFieldByKey.get("wett_license_number")
        || requiredFieldByKey.get("wett_registration_id")
        || "";
      const homeownerName = requiredFieldByKey.get("homeowner_name") || customerLabel;
      const siteAddress = requiredFieldByKey.get("site_full_address") || propertyLabel;
      const wettCustomerReportNumber = input.customerReportNumber?.trim() || `R-${input.reportVersion.replace(/^v-/i, "")}`;
      const wettRows = input.items.map((item) => {
        const statusLabel = item.status === "unsatisfactory"
          ? "Deficiency Noted"
          : item.status === "na"
            ? "Not Verified / Not Accessible"
            : "Compliant";
        const section = item.section_key.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
        const rowClass = item.status === "unsatisfactory" ? "row-unsat" : item.status === "na" ? "row-na" : "";
        return `
          <tr class="${rowClass}">
            <td>
              <div class="component">${this.escapeHtml(item.item_label)}</div>
              <div class="section">${this.escapeHtml(section)}</div>
            </td>
            <td class="italic">Referencing applicable CSA B365 requirements for visible and accessible components.</td>
            <td class="status-cell">${this.escapeHtml(statusLabel)}</td>
          </tr>
        `;
      }).join("\n");

      const wettMetadataRows = [
        ["Homeowner Name", homeownerName],
        ["Site Address", siteAddress],
        ["Inspection Date", inspectionDateLabel],
        ["Inspector Name", inspectorName],
        ["WETT Credential / Registration ID", wettId],
        ["Report Number", wettCustomerReportNumber],
      ]
        .map(([label, value]) => `
          <div class="meta-row">
            <span class="meta-label">${this.escapeHtml(label)}</span>
            <span class="meta-value">${this.escapeHtml(value)}</span>
          </div>
        `)
        .join("\n");

      const deficiencyRows = input.items
        .filter((item) => item.status === "unsatisfactory")
        .map((item) => `
          <div class="deficiency-card">
            <p class="def-title">Correction Required | ${this.escapeHtml(item.item_label)}</p>
            <p class="def-copy">${this.escapeHtml(item.recommendation_text?.trim() || "Deficiency documented. Corrective action required before compliance confirmation.")}</p>
          </div>
        `)
        .join("\n");

      return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4; margin: 20mm 12mm 18mm 12mm; }
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 10px; gap: 12px; }
            .brand-kicker { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; }
            .wett-title { font-size: 36px; font-weight: 900; color: #1e3a8a; line-height: 1; }
            .wett-sub { margin-top: 4px; font-size: 16px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #334155; }
            .wett-note { margin-top: 4px; font-size: 10px; color: #64748b; font-style: italic; line-height: 1.4; max-width: 360px; }
            .header-meta { text-align: right; border-left: 2px solid #1e3a8a; padding-left: 10px; }
            .header-meta p { margin: 0 0 3px; font-size: 11px; }
            .notice { border: 1px solid #cbd5e1; background: #f8fafc; padding: 7px 8px; margin-bottom: 10px; font-size: 9px; line-height: 1.45; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-bottom: 10px; }
            h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #1e3a8a; margin: 10px 0 5px; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            thead { display: table-header-group; }
            tr { break-inside: avoid; page-break-inside: avoid; }
            th, td { border: 1px solid #cbd5e1; padding: 5px; vertical-align: top; }
            th { background: #f1f5f9; text-align: left; text-transform: uppercase; font-size: 9px; }
            .section { margin-top: 2px; font-size: 9px; text-transform: uppercase; color: #64748b; }
            .component { font-weight: 700; }
            .status-cell { text-align: center; font-weight: 700; }
            .row-unsat { background: #fef2f2; }
            .row-na { background: #f8fafc; }
            .meta-row { border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px; min-height: 46px; }
            .meta-label { display: block; font-size: 9px; color: #475569; text-transform: uppercase; }
            .meta-value { display: block; margin-top: 2px; font-size: 10px; font-weight: 600; color: #0f172a; line-height: 1.35; }
            .deficiency-card { border-left: 4px solid #dc2626; background: #fef2f2; padding: 7px; margin-bottom: 5px; break-inside: avoid; page-break-inside: avoid; }
            .def-title { margin: 0; font-size: 10px; font-weight: 700; color: #7f1d1d; text-transform: uppercase; }
            .def-copy { margin: 3px 0 0; font-size: 9px; line-height: 1.4; color: #334155; }
            .signature { margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
            .cert-box { border: 2px solid #1e3a8a; border-radius: 4px; padding: 6px; text-align: center; }
            .cert-top { background: #1e3a8a; color: #fff; font-size: 9px; font-weight: 800; text-transform: uppercase; padding: 1px 4px; }
            .cert-id { margin-top: 4px; font-size: 9px; font-weight: 700; color: #1e3a8a; text-transform: uppercase; }
            .sig-label { margin-bottom: 4px; font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 700; }
            .sig-line { width: 200px; border-bottom: 1px solid #94a3b8; padding-bottom: 2px; font-family: "Times New Roman", serif; font-size: 18px; font-style: italic; }
            .verify { border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; padding: 6px; font-size: 9px; line-height: 1.4; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <header class="header">
            <div>
              <div class="brand-kicker">Phoenix Chimney Fireplace</div>
              <div class="wett-title">WETT</div>
              <div class="wett-sub">Site Basic / Level 1 Inspection</div>
              <p class="wett-note">Referencing applicable CSA B365 requirements for visible and accessible components.</p>
            </div>
            <div class="header-meta">
              <p><strong>Report Number:</strong> ${this.escapeHtml(wettCustomerReportNumber)}</p>
              <p><strong>Date:</strong> ${this.escapeHtml(inspectionDateLabel)}</p>
              <p><strong>Version:</strong> ${this.escapeHtml(input.reportVersion)}</p>
            </div>
          </header>

          <section class="notice">
            <strong>NOTICE:</strong> ${this.escapeHtml(input.disclaimers.main)}
            ${input.disclaimers.limitations ? ` ${this.escapeHtml(input.disclaimers.limitations)}` : ""}
          </section>

          <section>
            <div class="meta-grid">
              ${wettMetadataRows}
            </div>
          </section>

          <section>
            <h2>Technical Compliance Grid</h2>
            <table>
              <thead>
                <tr>
                  <th style="width: 35%;">System Component</th>
                  <th>Site Basic Requirement</th>
                  <th style="width: 20%; text-align: center;">Compliance</th>
                </tr>
              </thead>
              <tbody>
                ${wettRows || `<tr><td colspan="3">No checklist items available.</td></tr>`}
              </tbody>
            </table>
          </section>

          <section>
            <h2>Deficiencies &amp; Required Actions</h2>
            ${deficiencyRows || "<p>No deficiencies were documented on visible and accessible components.</p>"}
          </section>

          <section class="signature">
            <div style="display:flex; align-items:flex-end; gap: 14px;">
              <div class="cert-box">
                <div class="cert-top">WETT-Certified Inspector</div>
                <div class="cert-id">Site Basic / Level 1 | ${this.escapeHtml(wettId)}</div>
              </div>
              <div>
                <p class="sig-label">Inspector Signature</p>
                <div class="sig-line">${this.escapeHtml(inspectorName)}</div>
              </div>
            </div>
            <div class="verify">
              <div><strong>Report Verification</strong></div>
              <div>Report Number: ${this.escapeHtml(wettCustomerReportNumber)}</div>
              <div>Version: ${this.escapeHtml(input.reportVersion)}</div>
              <div>Generated: ${this.escapeHtml(input.generatedAt.toISOString())}</div>
            </div>
          </section>
        </body>
      </html>
    `.trim();
    }

    if (input.inspection.workflow_type === "gas_simplified") {
      const gasCustomerReportNumber = input.customerReportNumber?.trim() || `R-${input.reportVersion.replace(/^v-/i, "")}`;
      const applianceType = requiredFieldByKey.get("appliance_type") || "Not recorded";
      const manufacturer = requiredFieldByKey.get("manufacturer") || "Not recorded";
      const model = requiredFieldByKey.get("model") || "Not recorded";
      const serialNumber = requiredFieldByKey.get("serial_number") || "Not recorded";
      const location = requiredFieldByKey.get("location") || "Not recorded";
      const ventingType = requiredFieldByKey.get("venting_type") || "Not recorded";
      const gasLicenseHolder = input.inspection.gas_license_holder_name?.trim() || "Phoenix Chimney Fireplace";
      const gasLicenseNumber = input.inspection.gas_license_number?.trim() || "";
      const gasItemsByKey = new Map(input.items.map((item) => [item.item_key, item]));
      const gasSectionOrder = [
        "appliance_information",
        "pilot_ignition",
        "burner_flame",
        "gas_valve_controls",
        "venting",
        "co_check",
        "gas_leak_check",
        "safety_concerns",
        "recommendations",
      ] as const;
      const resolveGasCheckResult = (itemKey: string) => {
        const item = gasItemsByKey.get(itemKey);
        if (!item) {
          return "Not Recorded";
        }
        if (item.status === "satisfactory") {
          return "Satisfactory";
        }
        if (item.status === "unsatisfactory") {
          return "Concern Noted";
        }
        return "Not Verified";
      };
      const unsatisfactoryItems = input.items.filter((item) => item.status === "unsatisfactory");
      const mainConcernItem = unsatisfactoryItems[0] ?? null;
      const mainConcern = mainConcernItem?.item_label || "No primary concern documented.";
      const requiredAction = mainConcernItem?.recommendation_text?.trim() || "Continue operation only if all inspection findings remain satisfactory and routine maintenance is current.";
      const resolveGasRisk = (item: InspectionItemEntity) => {
        switch (item.item_key) {
          case "pilot_ignition_operation":
            return "Ignition reliability concern may affect safe light-off and startup performance.";
          case "burner_flame_pattern":
            return "Combustion or flame pattern concern may affect safe and efficient appliance operation.";
          case "gas_valve_controls_response":
            return "Control response concern may affect safe adjustment or shutoff performance.";
          case "venting_integrity":
            return "Venting concern may affect draft performance and exhaust discharge.";
          case "co_check_result":
            return "Combustion by-product concern requires immediate technical review.";
          case "gas_leak_check_result":
            return "Possible gas leakage concern requires immediate correction and re-test.";
          case "visible_safety_concerns":
            return "Visible safety or clearance concern requires correction before continued use.";
          default:
            return "Service deficiency noted during visual and operational inspection.";
        }
      };
      const resolveGasUseStatus = (item: InspectionItemEntity) => {
        if (item.status !== "unsatisfactory") {
          return "Safe to Use";
        }
        if (this.isGasUnsafeItem(item)) {
          return "Unsafe - Do Not Use";
        }
        return "Service Recommended";
      };
      const groupedGasSections = gasSectionOrder
        .map((sectionKey) => ({
          sectionKey,
          label: this.resolveSectionLabel(sectionKey),
          items: input.items.filter((item) => item.section_key === sectionKey),
        }))
        .filter((section) => section.items.length > 0);
      const gasChecklistRowsHtml = groupedGasSections.flatMap((section) => section.items.map((item) => {
        const statusLabel = item.status === "na" ? "Not Verified" : item.status === "satisfactory" ? "Satisfactory" : "Concern Noted";
        const recommendation = item.recommendation_text?.trim() || (item.status === "satisfactory" ? "No corrective action required." : "No action recorded.");
        const rowClass = item.status === "unsatisfactory" ? "row-unsat" : item.status === "na" ? "row-na" : "";
        return `
          <tr class="${rowClass}">
            <td>${this.escapeHtml(section.label)}</td>
            <td>${this.escapeHtml(item.item_label)}</td>
            <td>${this.escapeHtml(statusLabel)}</td>
            <td>${this.escapeHtml(recommendation)}</td>
          </tr>
        `;
      })).join("\n");
      const deficiencyCards = unsatisfactoryItems.map((item) => `
        <article class="deficiency-card">
          <p class="deficiency-title">Deficiency</p>
          <p class="deficiency-copy">${this.escapeHtml(item.item_label)}</p>
          <p class="deficiency-title">Risk / Safety Concern</p>
          <p class="deficiency-copy">${this.escapeHtml(resolveGasRisk(item))}</p>
          <p class="deficiency-title">Required Action</p>
          <p class="deficiency-copy">${this.escapeHtml(item.recommendation_text?.trim() || "Service and re-evaluate by a qualified gas technician.")}</p>
          <p class="deficiency-title">Use Status</p>
          <p class="deficiency-copy deficiency-status">${this.escapeHtml(resolveGasUseStatus(item))}</p>
        </article>
      `).join("\n");
      return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4; margin: 20mm 12mm 18mm 12mm; }
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
            .page-header { border-bottom: 2px solid #334155; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; gap: 12px; }
            .brand-kicker { font-size: 10px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; }
            .brand { font-size: 24px; font-weight: 800; letter-spacing: -0.01em; color: #0f172a; }
            .sub { font-size: 10px; text-transform: uppercase; color: #475569; letter-spacing: 0.08em; }
            .header-meta { text-align: right; }
            .header-meta p { margin: 0 0 3px; font-size: 10px; color: #334155; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; margin: 10px 0 12px; }
            .meta-row { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; background: #f8fafc; }
            .meta-label { display: block; font-size: 10px; color: #475569; text-transform: uppercase; }
            .meta-value { font-size: 12px; color: #0f172a; font-weight: 600; }
            .summary-grid { display: grid; grid-template-columns: 0.95fr 1.05fr; gap: 10px; margin-bottom: 12px; }
            .status-summary { border: 1px solid #cbd5e1; border-left: 4px solid #1e293b; border-radius: 6px; padding: 10px; background: #f8fafc; }
            .summary-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #ffffff; }
            .status-title { margin: 0; font-size: 10px; text-transform: uppercase; color: #475569; letter-spacing: 0.08em; }
            .status-label { margin: 4px 0 2px; font-size: 15px; text-transform: uppercase; font-weight: 800; }
            .legal { font-size: 10px; color: #334155; line-height: 1.45; margin-top: 6px; }
            .summary-list { margin: 0; display: grid; gap: 6px; }
            .summary-line { display: grid; grid-template-columns: 140px 1fr; gap: 8px; font-size: 10px; line-height: 1.4; }
            .summary-line strong { color: #334155; text-transform: uppercase; font-size: 9px; letter-spacing: 0.06em; }
            h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; margin: 14px 0 6px; }
            h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #334155; margin: 0 0 6px; }
            table { width: 100%; border-collapse: collapse; }
            thead { display: table-header-group; }
            tr { break-inside: avoid; page-break-inside: avoid; }
            th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; }
            th { background: #334155; color: #fff; text-align: left; font-size: 10px; text-transform: uppercase; }
            .section { font-size: 10px; text-transform: uppercase; color: #475569; }
            .component { font-weight: 700; margin-top: 2px; }
            .section-group h3 { margin: 10px 0 6px; font-size: 11px; text-transform: uppercase; color: #334155; letter-spacing: 0.06em; }
            .row-unsat { background: #fff7ed; }
            .row-na { background: #f8fafc; color: #64748b; }
            .details-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px; }
            .checklist-page { break-before: page; page-break-before: always; }
            .deficiency-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
            .deficiency-card { border: 1px solid #fed7aa; border-radius: 6px; background: #fff7ed; padding: 8px; break-inside: avoid; page-break-inside: avoid; }
            .deficiency-title { margin: 0 0 2px; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #9a3412; }
            .deficiency-copy { margin: 0 0 6px; font-size: 10px; line-height: 1.4; color: #334155; }
            .deficiency-status { font-weight: 700; color: #7c2d12; }
            .signature-block { margin-top: 16px; padding-top: 10px; border-top: 1px solid #cbd5e1; break-inside: avoid; page-break-inside: avoid; }
            .verification-card { border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; padding: 10px; }
            .small { font-size: 10px; color: #475569; }
          </style>
        </head>
        <body>
          <header class="page-header">
            <div>
              <div class="brand-kicker">Phoenix Chimney Fireplace</div>
              <div class="brand">Gas Appliance Report</div>
              <div class="sub">Operational And Visual Inspection Record</div>
            </div>
            <div class="header-meta">
              <p><strong>Report Number:</strong> ${this.escapeHtml(gasCustomerReportNumber)}</p>
              <p><strong>Date:</strong> ${this.escapeHtml(inspectionDateLabel)}</p>
            </div>
          </header>

          <section class="meta-grid">
            <div class="meta-row"><span class="meta-label">Customer</span><span class="meta-value">${this.escapeHtml(customerLabel)}</span></div>
            <div class="meta-row"><span class="meta-label">Service Address</span><span class="meta-value">${this.escapeHtml(propertyLabel)}</span></div>
            <div class="meta-row"><span class="meta-label">Inspection Date</span><span class="meta-value">${this.escapeHtml(inspectionDateLabel)}</span></div>
            <div class="meta-row"><span class="meta-label">Report Number</span><span class="meta-value">${this.escapeHtml(gasCustomerReportNumber)}</span></div>
          </section>

          <section class="summary-grid">
            <div class="status-summary">
              <p class="status-title">${this.escapeHtml(statusSummary.context)}</p>
              <p class="status-label">${this.escapeHtml(statusSummary.label)}</p>
              <p class="legal">${this.escapeHtml(statusSummary.note)}</p>
            </div>
            <div class="summary-card">
              <h2 style="margin-top:0;">Gas Safety Summary</h2>
              <div class="summary-list">
                <div class="summary-line"><strong>Observed Status</strong><span>${this.escapeHtml(statusSummary.label)}</span></div>
                <div class="summary-line"><strong>Appliance Type</strong><span>${this.escapeHtml(applianceType)}</span></div>
                <div class="summary-line"><strong>Main Concern</strong><span>${this.escapeHtml(mainConcern)}</span></div>
                <div class="summary-line"><strong>Required Action</strong><span>${this.escapeHtml(requiredAction)}</span></div>
                <div class="summary-line"><strong>Gas License Holder</strong><span>${this.escapeHtml(gasLicenseHolder)}</span></div>
                <div class="summary-line"><strong>Gas License Number</strong><span>${this.escapeHtml(gasLicenseNumber)}</span></div>
                <div class="summary-line"><strong>CO Check Result</strong><span>${this.escapeHtml(resolveGasCheckResult("co_check_result"))}</span></div>
                <div class="summary-line"><strong>Gas Leak Check Result</strong><span>${this.escapeHtml(resolveGasCheckResult("gas_leak_check_result"))}</span></div>
              </div>
            </div>
          </section>

          <section>
            <h2>Appliance Details</h2>
            <div class="details-grid">
              <div class="meta-row"><span class="meta-label">Appliance Type</span><span class="meta-value">${this.escapeHtml(applianceType)}</span></div>
              <div class="meta-row"><span class="meta-label">Manufacturer</span><span class="meta-value">${this.escapeHtml(manufacturer)}</span></div>
              <div class="meta-row"><span class="meta-label">Model</span><span class="meta-value">${this.escapeHtml(model)}</span></div>
              <div class="meta-row"><span class="meta-label">Serial Number</span><span class="meta-value">${this.escapeHtml(serialNumber)}</span></div>
              <div class="meta-row"><span class="meta-label">Location</span><span class="meta-value">${this.escapeHtml(location)}</span></div>
              <div class="meta-row"><span class="meta-label">Venting Type</span><span class="meta-value">${this.escapeHtml(ventingType)}</span></div>
            </div>
          </section>

          <section class="checklist-page">
            <h2>Gas Appliance Checklist</h2>
            <table>
              <thead>
                <tr>
                  <th style="width: 20%;">Section</th>
                  <th style="width: 30%;">Inspection Item</th>
                  <th style="width: 14%;">Status</th>
                  <th style="width: 36%;">Notes / Action</th>
                </tr>
              </thead>
              <tbody>
                ${gasChecklistRowsHtml || `<tr><td colspan="4">No checklist items available.</td></tr>`}
              </tbody>
            </table>
          </section>

          <section>
            <h2>Deficiencies &amp; Required Actions</h2>
            ${deficiencyCards ? `<div class="deficiency-grid">${deficiencyCards}</div>` : "<p>No deficiencies requiring corrective action were documented.</p>"}
          </section>

          <section>
            <h2>Limitations</h2>
            <p class="legal">${this.escapeHtml(input.disclaimers.main)}</p>
            ${input.disclaimers.limitations ? `<p class="legal">${this.escapeHtml(input.disclaimers.limitations)}</p>` : ""}
            ${input.disclaimers.workflowSpecific ? `<p class="legal">${this.escapeHtml(input.disclaimers.workflowSpecific)}</p>` : ""}
          </section>

          <section class="signature-block">
            <div class="verification-card">
              <p class="small"><strong>Reviewed by Phoenix Chimney Fireplace</strong></p>
              <p class="small">Gas License Holder: ${this.escapeHtml(gasLicenseHolder)}</p>
              <p class="small">Gas License Number: ${this.escapeHtml(gasLicenseNumber)}</p>
              <p class="small">Report Verification | Report Number: ${this.escapeHtml(gasCustomerReportNumber)} | Version: ${this.escapeHtml(input.reportVersion)}</p>
            </div>
          </section>
        </body>
      </html>
    `.trim();
    }

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4; margin: 20mm 12mm 18mm 12mm; }
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
            .page-header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
            .brand { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
            .brand span { color: #ea580c; }
            .meta-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 8px 0 10px; }
            .meta-row { border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 7px; }
            .meta-label { display: block; font-size: 10px; color: #475569; text-transform: uppercase; }
            .meta-value { font-size: 12px; color: #0f172a; font-weight: 600; }
            .summary { border: 1px solid #e2e8f0; border-left: 4px solid #1e293b; border-radius: 6px; padding: 10px; margin-bottom: 12px; }
            .disclaimer { font-size: 10px; color: #334155; line-height: 1.5; margin-top: 6px; }
            h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; margin: 14px 0 6px; }
            table { width: 100%; border-collapse: collapse; }
            thead { display: table-header-group; }
            tr { break-inside: avoid; page-break-inside: avoid; }
            th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; }
            th { background: #1e293b; color: #fff; text-align: left; font-size: 10px; text-transform: uppercase; }
            .section { font-size: 10px; text-transform: uppercase; color: #475569; }
            .component { font-weight: 700; margin-top: 2px; }
            .section-group h3 { margin: 10px 0 6px; font-size: 11px; text-transform: uppercase; color: #334155; letter-spacing: 0.06em; }
            .row-unsat { background: #fff7ed; }
            .row-na { background: #f8fafc; color: #64748b; }
            .evidence-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .evidence-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; break-inside: avoid; page-break-inside: avoid; min-height: 88px; }
            .evidence-image { width: 100%; max-height: 170px; object-fit: cover; border-radius: 4px; margin-bottom: 6px; }
            .evidence-card h4 { margin: 0 0 4px; font-size: 11px; }
            .evidence-card p { margin: 0; font-size: 10px; line-height: 1.4; }
            .evidence-card .meta { margin-top: 5px; color: #475569; }
            .evidence-card-compact { min-height: 0; }
            .priority-card { border: 1px solid #dbe2ea; border-radius: 12px; background: #ffffff; padding: 10px; font-size: 10px; line-height: 1.5; box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06); }
            .priority-detail-card { margin-bottom: 8px; }
            .priority-header-row { display: flex; justify-content: flex-start; margin-bottom: 6px; }
            .priority-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 8px; font-size: 9px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
            .priority-badge-critical { background: #fee2e2; color: #991b1b; }
            .priority-badge-repair { background: #ffedd5; color: #9a3412; }
            .priority-badge-maintenance { background: #fef3c7; color: #92400e; }
            .priority-badge-upgrade { background: #dbeafe; color: #1d4ed8; }
            .priority-badge-clear { background: #dcfce7; color: #166534; }
            .priority-tone-critical { border-color: #fecaca; background: linear-gradient(180deg, #fff5f5 0%, #ffffff 100%); }
            .priority-tone-repair { border-color: #fed7aa; background: linear-gradient(180deg, #fff7ed 0%, #ffffff 100%); }
            .priority-tone-maintenance { border-color: #fde68a; background: linear-gradient(180deg, #fffbeb 0%, #ffffff 100%); }
            .priority-tone-upgrade { border-color: #bfdbfe; background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%); }
            .priority-tone-clear { border-color: #bbf7d0; background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%); }
            .priority-head { margin: 0; font-size: 10px; font-weight: 700; color: #0f172a; }
            .priority-sub { margin: 2px 0 4px; color: #64748b; text-transform: uppercase; font-size: 9px; }
            .diagram-card { border: 1px solid #cbd5e1; border-radius: 14px; background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%); padding: 12px; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06); }
            .diagram-shell { border: 1px solid #d7dee7; border-radius: 10px; background: #ffffff; padding: 10px; }
            .diagram-note { margin-top: 8px; font-size: 10px; color: #334155; }
            .diagram-focus { margin-top: 10px; border-radius: 10px; padding: 8px 10px; background: #fff7ed; border: 1px solid #fed7aa; }
            .diagram-focus-label { display: block; font-size: 9px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #9a3412; }
            .diagram-focus-copy { display: block; margin-top: 4px; font-size: 12px; font-weight: 700; color: #7c2d12; }
            .list-line { margin: 0; font-size: 11px; color: #1e293b; line-height: 1.5; }
            .page-one-shell { }
            .hero-grid { display: grid; grid-template-columns: minmax(0, 0.98fr) minmax(0, 1.02fr); gap: 10px; align-items: start; }
            .hero-stack { display: grid; gap: 8px; }
            .summary-shell { border: 1px solid #d7dee7; border-radius: 16px; padding: 12px; background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%); box-shadow: 0 10px 22px rgba(15, 23, 42, 0.07); }
            .summary-heading-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
            .summary-kicker { display: block; font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; }
            .summary-headline { margin: 4px 0 0; font-size: 18px; line-height: 1.1; color: #0f172a; }
            .summary-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 8px; margin-bottom: 8px; }
            .summary-metric { border: 1px solid #d7dee7; border-radius: 12px; background: rgba(255, 255, 255, 0.92); padding: 8px; }
            .summary-metric-label { display: block; margin-bottom: 3px; font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; }
            .summary-metric-value { display: block; font-size: 16px; font-weight: 800; color: #0f172a; text-transform: uppercase; }
            .summary-status-value { font-size: 14px; }
            .summary-card-copy { margin: 0; font-size: 10px; color: #475569; line-height: 1.45; }
            .summary-copy-strong { margin: 0; font-size: 12px; line-height: 1.45; color: #0f172a; }
            .summary-copy-strong strong { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 4px; }
            .next-step-card { border: 1px solid #cbd5e1; border-radius: 14px; padding: 10px; background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); box-shadow: 0 7px 16px rgba(15, 23, 42, 0.05); }
            .next-step-label { display: block; font-size: 9px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; }
            .next-step-value { display: block; margin-top: 4px; font-size: 16px; line-height: 1.15; font-weight: 800; color: #0f172a; }
            .next-step-support { margin: 6px 0 0; font-size: 10px; line-height: 1.45; color: #334155; }
            .summary-copy { margin: 6px 0 0; font-size: 11px; line-height: 1.5; color: #1e293b; }
            .summary-copy:first-of-type { margin-top: 0; }
            .card-block { border: 1px solid #d7dee7; border-radius: 14px; background: #ffffff; padding: 10px; box-shadow: 0 7px 16px rgba(15, 23, 42, 0.05); }
            .card-title { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; }
            .priority-compact .priority-card { margin: 0; }
            .key-findings-list { margin: 0; padding-left: 0; list-style: none; }
            .key-finding-item { margin-bottom: 8px; padding: 8px; border-radius: 12px; font-size: 10px; line-height: 1.4; color: #1e293b; }
            .key-finding-item:last-child { margin-bottom: 0; }
            .token-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
            .token-chip { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 8px; background: #eef2f7; color: #334155; font-size: 9px; font-weight: 700; }
            .verified-area-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .verified-area-card { border: 1px solid #d7dee7; border-radius: 12px; background: #f8fafc; padding: 8px; font-size: 10px; line-height: 1.4; }
            .verified-area-title { margin: 0 0 4px; font-size: 10px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.06em; }
            .verified-copy { margin: 6px 0 0; font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
            .page-one-evidence { margin-top: 10px; }
            .page-one-evidence-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .support-card { border: 1px solid #d7dee7; border-radius: 14px; background: #ffffff; padding: 10px; box-shadow: 0 6px 14px rgba(15, 23, 42, 0.04); }
            .checklist-page { break-before: page; page-break-before: always; }
            .signature-block { margin-top: 12px; padding-top: 10px; border-top: 1px solid #cbd5e1; }
            .signature-line { margin-top: 12px; border-bottom: 1px solid #94a3b8; width: 220px; padding-bottom: 2px; font-family: "Times New Roman", serif; font-size: 18px; }
            .verification-inline { margin-top: 8px; padding-top: 8px; border-top: 1px solid #cbd5e1; }
            .verification-inline .small { margin: 2px 0 0; }
            .small { font-size: 10px; color: #475569; }
          </style>
        </head>
        <body>
          <header class="page-header">
            <div class="brand">PHOENIX <span>CHIMNEY</span></div>
            <div class="small">Inspection Report | ${this.escapeHtml(standardReportTypeLabel)} | ${this.escapeHtml(standardCompanyNameDisplay)}</div>
          </header>

          <section class="meta-grid">
            <div class="meta-row"><span class="meta-label">Customer</span><span class="meta-value">${this.escapeHtml(customerLabel)}</span></div>
            <div class="meta-row"><span class="meta-label">Service Address</span><span class="meta-value">${this.escapeHtml(propertyLabel)}</span></div>
            <div class="meta-row"><span class="meta-label">Inspection Date</span><span class="meta-value">${this.escapeHtml(inspectionDateLabel)}</span></div>
            <div class="meta-row"><span class="meta-label">Report Number</span><span class="meta-value">${this.escapeHtml(standardCustomerReportNumber)}</span></div>
          </section>

          <section class="page-one-shell">
            <div class="hero-grid">
              <div class="hero-stack">
                <div class="summary-shell ${standardTopPriorityTone.toneClass}">
                  <div class="summary-heading-row">
                    <div>
                      <span class="summary-kicker">Customer Summary</span>
                      <p class="summary-headline">${this.escapeHtml(standardDecisionHeadline)}</p>
                    </div>
                    <span class="priority-badge ${standardTopPriorityTone.badgeClass}">${this.escapeHtml(standardTopPriorityTone.label)}</span>
                  </div>
                  <div class="summary-grid">
                    <div class="summary-metric ${standardTopPriorityTone.toneClass}">
                      <span class="summary-metric-label">Observed Status</span>
                      <span class="summary-metric-value summary-status-value">${this.escapeHtml(statusSummary.label)}</span>
                      <p class="summary-card-copy">Customer decision view based on the highest documented inspection priority.</p>
                    </div>
                    <div class="summary-metric">
                      <span class="summary-metric-label">Safety Score</span>
                      <span class="summary-metric-value">${this.escapeHtml(String(input.scores.safety_score ?? 0))}/100</span>
                      <p class="summary-card-copy">Visual inspection scoring for the inspected accessible components.</p>
                    </div>
                  </div>
                  <p class="summary-copy-strong"><strong>Main Concern</strong>${this.escapeHtml(standardMainConcern)}</p>
                </div>

                <div class="next-step-card ${standardTopPriorityTone.toneClass}">
                  <span class="next-step-label">Recommended Next Step</span>
                  <span class="next-step-value">${this.escapeHtml(standardRecommendedNextStep)}</span>
                  <p class="next-step-support">${this.escapeHtml(standardNextStepSupportText)}</p>
                </div>

                <div class="card-block">
                  <h2 class="card-title">Key Findings</h2>
                  ${standardKeyFindingsHtml}
                </div>
              </div>

              <div class="diagram-card">
                <h2 class="card-title">System Diagram</h2>
                <div class="diagram-shell">
                  ${standardDiagramSvg}
                </div>
                <p class="diagram-note">Main issue location: ${this.escapeHtml(standardPrimaryIssueLocation || "General inspection review")}</p>
                <div class="diagram-focus">
                  <span class="diagram-focus-label">Issue Focus</span>
                  <span class="diagram-focus-copy">${this.escapeHtml(topPriorityFinding?.itemLabel || standardPrimaryIssueLocation || "General inspection review")}</span>
                </div>
              </div>
            </div>

            ${standardEvidencePreviewHtml ? `
              <div class="page-one-evidence card-block">
                <h2 class="card-title">Visual Evidence</h2>
                <div class="page-one-evidence-grid">
                  ${standardEvidencePreviewHtml}
                </div>
              </div>
            ` : ""}
          </section>

          <section class="checklist-page support-card">
            <h2 class="card-title">Supporting Inspection Details</h2>
            <p class="list-line"><strong>Inspection Areas Reviewed:</strong> ${this.escapeHtml(inspectionAreasReviewedText)}</p>
          </section>

          <section class="support-card">
            <h2 class="card-title">Attention-Required Findings</h2>
            ${standardFlaggedFindingsHtml}
          </section>

          <section class="support-card">
            <h2 class="card-title">Verified Areas</h2>
            <div class="verified-area-grid">
              ${standardVerifiedAreasHtml || "<p>Verified areas were not recorded in this report.</p>"}
            </div>
          </section>

          <section class="support-card">
            <h2 class="card-title">Visual Evidence</h2>
            ${evidenceCards ? `<div class="evidence-grid">${evidenceCards}</div>` : "<p>No visual evidence was attached to this report.</p>"}
          </section>

          <section class="support-card">
            <h2 class="card-title">Limitations</h2>
            <p class="disclaimer">${this.escapeHtml(input.disclaimers.main)}</p>
            ${input.disclaimers.limitations ? `<p class="disclaimer">${this.escapeHtml(input.disclaimers.limitations)}</p>` : ""}
            ${input.disclaimers.workflowSpecific ? `<p class="disclaimer">${this.escapeHtml(input.disclaimers.workflowSpecific)}</p>` : ""}
            <p class="disclaimer">${this.escapeHtml(statusSummary.note)}</p>
            <div class="verification-inline">
              <p class="small">Verification | Reviewed by ${this.escapeHtml(standardCompanyNameDisplay)}${standardCompanyPhoneDisplay ? ` | ${this.escapeHtml(standardCompanyPhoneDisplay)}` : ""}${standardCompanyEmailDisplay ? ` | ${this.escapeHtml(standardCompanyEmailDisplay)}` : ""} | Digitally Verified | Report Number: ${this.escapeHtml(standardCustomerReportNumber)} | Version: ${this.escapeHtml(input.reportVersion)}</p>
            </div>
          </section>
        </body>
      </html>
    `.trim();
  }

  private renderPdfHeaderTemplate(reportLabel: string, reportLabelText = "Report ID") {
    return `
      <div style="width:100%; font-size:8px; color:#334155; padding:0 12mm; display:flex; justify-content:flex-end;">
        <span>Phoenix Inspection Report | ${this.escapeHtml(reportLabelText)}: ${this.escapeHtml(reportLabel)}</span>
      </div>
    `.trim();
  }

  private renderPdfFooterTemplate(input: {
    companyName: string;
    reportLabel: string;
    reportLabelText: string;
    generatedAt: Date;
    reportVersion: string;
  }) {
    return `
      <div style="width:100%; font-size:8px; color:#334155; padding:0 12mm; display:flex; justify-content:space-between;">
        <span>${this.escapeHtml(input.companyName)}</span>
        <span>${this.escapeHtml(input.reportLabelText)}: ${this.escapeHtml(input.reportLabel)} | Version: ${this.escapeHtml(input.reportVersion)}</span>
        <span>Generated: ${this.escapeHtml(input.generatedAt.toISOString())} | Page <span class="pageNumber"></span>/<span class="totalPages"></span></span>
      </div>
    `.trim();
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private resolveSectionLabel(sectionKey: string) {
    const sectionLabels: Record<string, string> = {
      appliance_condition: "Fireplace / Interior",
      venting: "Venting / Draft / Operation",
      safety: "Safety Concerns",
      appliance_information: "Appliance Information",
      pilot_ignition: "Pilot / Ignition",
      burner_flame: "Burner / Flame",
      gas_valve_controls: "Gas Valve / Controls",
      co_check: "CO Check",
      gas_leak_check: "Gas Leak Check",
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
    return sectionKey.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
  }

  private resolveStandardRecommendationPriority(input: {
    itemKey: string;
    status: InspectionItemEntity["status"];
    recommendationText: string | null;
  }) {
    if (input.status !== "unsatisfactory") {
      return null;
    }

    const recommendation = input.recommendationText?.trim() ?? "";
    const explicit = recommendation.match(/\bP([1-4])\b/i);
    const code = explicit
      ? (`P${explicit[1]}` as "P1" | "P2" | "P3" | "P4")
      : this.deriveStandardPriorityFromSignals(`${input.itemKey} ${recommendation}`);

    const labelByCode: Record<"P1" | "P2" | "P3" | "P4", string> = {
      P1: "Safety Concern / Action Required Before Continued Use",
      P2: "Recommended Repair / Prevent Further Damage",
      P3: "Preventive Maintenance / System Longevity",
      P4: "Optional Upgrade / Performance or Protection Improvement",
    };

    return {
      code,
      label: labelByCode[code],
    };
  }

  private deriveStandardPriorityFromSignals(signalSource: string) {
    const signal = signalSource.toLowerCase();
    if (/(unsafe|hazard|critical|co|carbon\s*monoxide|smoke|fire\s*risk|do\s*not\s*use)/.test(signal)) {
      return "P1" as const;
    }
    if (/(water|weather|flashing|leak|moisture|crown|chase|cap|damage)/.test(signal)) {
      return "P2" as const;
    }
    if (/(maintenance|service|clean|sweep|creosote|draft|vent)/.test(signal)) {
      return "P3" as const;
    }
    return "P2" as const;
  }

  private resolveStandardSectionSort(sectionKey: string) {
    const index = this.standardSectionOrder.indexOf(sectionKey as (typeof this.standardSectionOrder)[number]);
    return index === -1 ? 999 : index;
  }

  private sortItemsForWorkflow(items: InspectionItemEntity[], workflowType: InspectionEntity["workflow_type"]) {
    if (workflowType !== "safety_standard") {
      return [...items];
    }
    return [...items].sort((a, b) => {
      const sectionOrderDiff = this.resolveStandardSectionSort(a.section_key) - this.resolveStandardSectionSort(b.section_key);
      if (sectionOrderDiff !== 0) {
        return sectionOrderDiff;
      }
      const sortOrderDiff = a.sort_order - b.sort_order;
      if (sortOrderDiff !== 0) {
        return sortOrderDiff;
      }
      return a.created_at.getTime() - b.created_at.getTime();
    });
  }

  private hasStandardDefectSignals(item: InspectionItemEntity) {
    const signal = `${item.item_key} ${item.recommendation_text ?? ""}`.toLowerCase();
    if (/(no\s+(immediate\s+)?(defect|hazard|risk|damage|issue|concern))/i.test(signal)) {
      return false;
    }
    return /(hazard|unsafe|critical|crack|leak|moisture|damage|deterioration|structural|blockage|backdraft|smoke|\bco\b|carbon\s*monoxide|fire\s*risk|do\s*not\s*use|staining|rust|defect)/.test(
      signal,
    );
  }

  private resolveStandardPenalty(item: InspectionItemEntity) {
    const priority = this.resolveStandardRecommendationPriority({
      itemKey: item.item_key,
      status: item.status,
      recommendationText: item.recommendation_text,
    });
    if (!priority) {
      return 0;
    }

    if (priority.code === "P4") {
      return this.hasStandardDefectSignals(item) ? 4 : 0;
    }

    const weightedPenalties: Record<"P1" | "P2" | "P3", number> = {
      P1: 22,
      P2: 12,
      P3: 6,
    };
    return weightedPenalties[priority.code];
  }

  private resolveStandardIssueLocation(sectionKey: string) {
    const map: Record<string, string> = {
      appliance_condition: "Firebox",
      venting: "Flue / Liner",
      safety: "Damper",
      fireplace_interior: "Firebox",
      chimney_exterior: "Crown / Chase Cover",
      venting_draft_operation: "Flue / Liner",
      water_weather_protection: "Flashing Area",
      safety_concerns: "Damper",
      recommendations: "Smoke Chamber",
    };
    return map[sectionKey] ?? "Crown / Chase Cover";
  }

  private renderStandardSystemDiagramSvg(mainIssueLocation: string | null) {
    const isMatch = (zone: string) => mainIssueLocation?.toLowerCase() === zone.toLowerCase();
    const fill = (zone: string) => (isMatch(zone) ? "#f59e0b" : "#e2e8f0");
    const stroke = (zone: string) => (isMatch(zone) ? "#b45309" : "#64748b");
    return `
      <svg viewBox="0 0 760 420" role="img" aria-label="Chimney and fireplace side-view system diagram" style="width:100%; height:auto;">
        <rect x="30" y="30" width="190" height="320" fill="${fill("Brickwork / Exterior Wall")}" stroke="${stroke("Brickwork / Exterior Wall")}" stroke-width="2" />
        <rect x="95" y="52" width="60" height="20" fill="${fill("Chimney Cap / Shroud")}" stroke="${stroke("Chimney Cap / Shroud")}" stroke-width="2" />
        <rect x="80" y="74" width="90" height="16" fill="${fill("Crown / Chase Cover")}" stroke="${stroke("Crown / Chase Cover")}" stroke-width="2" />
        <rect x="108" y="90" width="34" height="210" fill="${fill("Flue / Liner")}" stroke="${stroke("Flue / Liner")}" stroke-width="2" />
        <polygon points="65,220 185,220 160,265 90,265" fill="${fill("Smoke Chamber")}" stroke="${stroke("Smoke Chamber")}" stroke-width="2" />
        <rect x="88" y="270" width="74" height="20" fill="${fill("Damper")}" stroke="${stroke("Damper")}" stroke-width="2" />
        <rect x="68" y="292" width="114" height="58" fill="${fill("Firebox")}" stroke="${stroke("Firebox")}" stroke-width="2" />
        <rect x="80" y="352" width="40" height="18" fill="${fill("Ash Cleanout / Ash Door")}" stroke="${stroke("Ash Cleanout / Ash Door")}" stroke-width="2" />
        <rect x="20" y="176" width="210" height="20" fill="${fill("Flashing Area")}" stroke="${stroke("Flashing Area")}" stroke-width="2" />

        <line x1="155" y1="62" x2="300" y2="62" stroke="#475569" stroke-width="1.5" />
        <text x="308" y="66" font-size="12" fill="#1e293b">Chimney Cap / Shroud</text>

        <line x1="170" y1="82" x2="300" y2="82" stroke="#475569" stroke-width="1.5" />
        <text x="308" y="86" font-size="12" fill="#1e293b">Crown / Chase Cover</text>

        <line x1="142" y1="150" x2="300" y2="150" stroke="#475569" stroke-width="1.5" />
        <text x="308" y="154" font-size="12" fill="#1e293b">Flue / Liner</text>

        <line x1="220" y1="185" x2="300" y2="185" stroke="#475569" stroke-width="1.5" />
        <text x="308" y="189" font-size="12" fill="#1e293b">Flashing Area</text>

        <line x1="175" y1="250" x2="300" y2="250" stroke="#475569" stroke-width="1.5" />
        <text x="308" y="254" font-size="12" fill="#1e293b">Smoke Chamber</text>

        <line x1="163" y1="280" x2="300" y2="280" stroke="#475569" stroke-width="1.5" />
        <text x="308" y="284" font-size="12" fill="#1e293b">Damper</text>

        <line x1="182" y1="322" x2="300" y2="322" stroke="#475569" stroke-width="1.5" />
        <text x="308" y="326" font-size="12" fill="#1e293b">Firebox</text>

        <line x1="120" y1="362" x2="300" y2="362" stroke="#475569" stroke-width="1.5" />
        <text x="308" y="366" font-size="12" fill="#1e293b">Ash Cleanout / Ash Door</text>

        <line x1="30" y1="340" x2="300" y2="390" stroke="#475569" stroke-width="1.5" />
        <text x="308" y="394" font-size="12" fill="#1e293b">Brickwork / Exterior Wall</text>
      </svg>
    `.trim();
  }

  private parseStructuredRecommendation(recommendationText: string | null) {
    if (!recommendationText?.trim()) {
      return null;
    }
    const issueObserved = recommendationText.match(/Issue Observed:\s*(.+)/i)?.[1]?.trim() ?? "";
    const riskIfIgnored = recommendationText.match(/Risk If Ignored:\s*(.+)/i)?.[1]?.trim() ?? "";
    const recommendedAction = recommendationText.match(/Recommended Action:\s*(.+)/i)?.[1]?.trim() ?? "";
    const priorityLevel = recommendationText.match(/Priority Level:\s*(P[1-4])/i)?.[1]?.toUpperCase() ?? "";
    if (!issueObserved && !riskIfIgnored && !recommendedAction && !priorityLevel) {
      return null;
    }
    return {
      issueObserved,
      riskIfIgnored,
      recommendedAction,
      priorityLevel,
    };
  }

  private resolveReportStatusSummary(input: {
    workflowType: InspectionEntity["workflow_type"];
    inspectionStatus: InspectionEntity["status"];
    mandatoryRequiredMissingCount: number;
    satisfactoryCount: number;
    unsatisfactoryCount: number;
  }) {
    const hasAnyCompleted = input.satisfactoryCount > 0 || input.unsatisfactoryCount > 0;

    if (input.workflowType === "compliance_wett") {
      if (input.inspectionStatus === "fail") {
        return {
          context: "Inspection Result",
          label: "Not Compliant / Correction Required",
          note: "Result reflects visible/accessed component deficiencies recorded during inspection.",
        };
      }
      if (input.mandatoryRequiredMissingCount > 0 || !hasAnyCompleted) {
        return {
          context: "Inspection Result",
          label: "Incomplete",
          note: "Mandatory WETT inputs are incomplete or checklist observations are not finalized.",
        };
      }
      if (input.unsatisfactoryCount > 0) {
        return {
          context: "Inspection Result",
          label: "Deficiencies Noted",
          note: "Deficiencies were documented on visible/accessed components requiring follow-up review.",
        };
      }
      return {
        context: "Inspection Result",
        label: "Compliant Based On Visible/Accessed Components",
        note: "No visible/accessed deficiencies were documented at the time of inspection.",
      };
    }

    if (input.inspectionStatus === "fail") {
      if (input.workflowType === "safety_standard") {
        return {
          context: "Observed Status",
          label: "Safety Concern / Recommended Repair",
          note: "Documented findings include a Safety Concern. Prioritize Recommended Repair actions to Prevent Further Damage and support safe, reliable system operation.",
        };
      }
      return {
        context: "Observed Status",
        label: "Unsafe / Do Not Use",
        note: "Do not use until documented deficiencies are corrected and re-evaluated by qualified personnel.",
      };
    }
    if (input.workflowType === "gas_simplified" && input.unsatisfactoryCount > 0) {
      return {
        context: "Observed Status",
        label: "Service Recommended / Attention Required",
        note: "Service-related deficiencies were documented; review recommendations and correct affected components before continued routine operation.",
      };
    }
    if (!hasAnyCompleted) {
      return {
        context: "Observed Status",
        label: "Incomplete",
        note: "Inspection observations are incomplete and pending final documented findings.",
      };
    }
    if (input.unsatisfactoryCount > 0) {
      return {
        context: "Observed Status",
        label: "Attention Required",
        note: "Deficiencies were observed and documented; review recommendations before continued use.",
      };
    }
    return {
      context: "Observed Status",
      label: "Passed / Satisfactory",
      note: "Accessible visual observations were recorded as satisfactory at the time of inspection.",
    };
  }

  private async buildPhotoDataUri(photo: InspectionPhotoEntity) {
    const safeName = photo.storage_key.replace(/[^a-zA-Z0-9._-]/g, "");
    if (!safeName) {
      return null;
    }
    const absolutePath = join(this.uploadsRoot, safeName);
    try {
      const fileBuffer = await fs.readFile(absolutePath);
      // Avoid bloating PDFs with very large raw photo payloads.
      if (fileBuffer.byteLength > 700 * 1024) {
        return null;
      }
      const lowerName = safeName.toLowerCase();
      const mimeType = lowerName.endsWith(".png")
        ? "image/png"
        : lowerName.endsWith(".webp")
          ? "image/webp"
          : lowerName.endsWith(".gif")
            ? "image/gif"
            : "image/jpeg";
      return `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
    } catch {
      return null;
    }
  }

  private computeScoreAndStatus(items: InspectionItemEntity[], workflowType: InspectionEntity["workflow_type"]) {
    if (workflowType === "compliance_wett") {
      const hasNa = items.some((item) => item.is_legal_mandatory && item.status === "na");
      const compliance_status = hasNa ? "incomplete" : "ready_to_generate";
      return {
        safety_score: null as number | null,
        compliance_status,
        inspection_status: hasNa ? ("warning" as const) : ("pass" as const),
      };
    }

    const requiredItems = items.filter((item) => item.is_required);
    if (requiredItems.length === 0) {
      return {
        safety_score: 100,
        compliance_status: null,
        inspection_status: "pass" as const,
      };
    }

    if (workflowType === "safety_standard") {
      const evaluatedItems = requiredItems.filter((item) => item.status !== "na");
      const unsatisfactoryItems = evaluatedItems.filter((item) => item.status === "unsatisfactory");
      const hasP1Unsatisfactory = unsatisfactoryItems.some((item) => {
        const priority = this.resolveStandardRecommendationPriority({
          itemKey: item.item_key,
          status: item.status,
          recommendationText: item.recommendation_text,
        });
        return priority?.code === "P1";
      });

      const totalPenalty = unsatisfactoryItems.reduce((sum, item) => sum + this.resolveStandardPenalty(item), 0);
      const safetyScore = Math.max(0, Math.min(100, 100 - totalPenalty));
      const inspectionStatus = hasP1Unsatisfactory
        ? ("fail" as const)
        : unsatisfactoryItems.length > 0
          ? ("warning" as const)
          : evaluatedItems.length === 0
            ? ("warning" as const)
            : ("pass" as const);

      return {
        safety_score: safetyScore,
        compliance_status: null,
        inspection_status: inspectionStatus,
      };
    }

    if (workflowType === "gas_simplified") {
      let score = 100;
      for (const item of requiredItems) {
        if (item.status === "unsatisfactory") {
          score -= Math.round(100 / requiredItems.length);
        }
        if (item.status === "na") {
          score -= Math.round(50 / requiredItems.length);
        }
      }
      score = Math.max(0, Math.min(100, score));

      const unsatisfactoryItems = requiredItems.filter((item) => item.status === "unsatisfactory");
      const hasUnsafeGasFinding = unsatisfactoryItems.some((item) => this.isGasUnsafeItem(item));
      const hasServiceConcern = unsatisfactoryItems.length > 0;
      const hasNa = requiredItems.some((item) => item.status === "na");

      return {
        safety_score: score,
        compliance_status: null,
        inspection_status: hasUnsafeGasFinding
          ? ("fail" as const)
          : hasServiceConcern || hasNa
            ? ("warning" as const)
            : ("pass" as const),
      };
    }

    let score = 100;
    for (const item of requiredItems) {
      if (item.status === "unsatisfactory") {
        score -= Math.round(100 / requiredItems.length);
      }
      if (item.status === "na") {
        score -= Math.round(50 / requiredItems.length);
      }
    }
    score = Math.max(0, Math.min(100, score));

    const hasUnsatisfactory = requiredItems.some((item) => item.status === "unsatisfactory");
    const hasNa = requiredItems.some((item) => item.status === "na");
    return {
      safety_score: score,
      compliance_status: null,
      inspection_status: hasUnsatisfactory ? ("fail" as const) : hasNa ? ("warning" as const) : ("pass" as const),
    };
  }

  private isGasUnsafeItem(item: InspectionItemEntity) {
    if (item.status !== "unsatisfactory") {
      return false;
    }

    if (["co_check_result", "gas_leak_check_result", "visible_safety_concerns"].includes(item.item_key)) {
      return true;
    }

    if (item.item_key === "venting_integrity") {
      return true;
    }

    const text = `${item.item_key} ${item.recommendation_text ?? ""}`.toLowerCase();
    return /(do\s*not\s*use|unsafe|shut\s*down|disable\s*appliance|gas\s*leak|carbon\s*monoxide|\bco\b|venting\s*(failure|unsafe|hazard)|exhaust\s*spillage)/.test(text);
  }

  private escapePdfText(value: string) {
    return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  private buildSimplePdf(lines: string[]) {
    const content = [
      "BT",
      "/F1 10 Tf",
      "40 800 Td",
      ...lines.flatMap((line, index) =>
        index === 0
          ? [`(${this.escapePdfText(line)}) Tj`]
          : ["0 -14 Td", `(${this.escapePdfText(line)}) Tj`],
      ),
      "ET",
    ].join("\n");

    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(pdf, "utf8"));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xrefStart = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index < offsets.length; index += 1) {
      pdf += `${offsets[index].toString().padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return Buffer.from(pdf, "utf8");
  }

  private resolveImageExtension(mimeType: string, originalName: string) {
    if (mimeType === "image/png") return "png";
    if (mimeType === "image/webp") return "webp";
    if (mimeType === "image/gif") return "gif";
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
    const fromName = originalName.split(".").pop()?.toLowerCase();
    if (fromName && ["png", "jpg", "jpeg", "webp", "gif"].includes(fromName)) {
      return fromName === "jpeg" ? "jpg" : fromName;
    }
    return "jpg";
  }

  private buildPublicJobCodeAttempt(sourceId: string, attempt: number) {
    const seed = `${sourceId}:${attempt}`;
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = ((hash * 31) + seed.charCodeAt(index)) >>> 0;
    }
    return hash.toString(36).toUpperCase().padStart(7, "0").slice(-7);
  }

  private async buildPublicJobCodeMap() {
    const jobRows = await this.jobsRepository.createQueryBuilder("job")
      .select(["job.id", "job.created_at"])
      .orderBy("job.created_at", "ASC")
      .addOrderBy("job.id", "ASC")
      .getMany();

    const reserved = new Set<string>();
    const codeMap = new Map<string, string>();
    for (const row of jobRows) {
      let assigned: string | null = null;
      for (let attempt = 0; attempt < 1000; attempt += 1) {
        const candidate = this.buildPublicJobCodeAttempt(row.id, attempt);
        if (reserved.has(candidate)) {
          continue;
        }
        assigned = candidate;
        reserved.add(candidate);
        codeMap.set(row.id, candidate);
        break;
      }
      if (!assigned) {
        apiError(500, "public_job_code_generation_failed", "Unable to allocate unique public job code.");
      }
    }
    return codeMap;
  }

  private buildQuoteNumber(jobCode: string) {
    return `Q-${jobCode}`;
  }

  private buildInvoiceNumber(jobCode: string) {
    return `INV-${jobCode}`;
  }

  private buildReportNumber(jobCode: string) {
    return `R-${jobCode}`;
  }

  private reportTypeToServiceType(reportType: InspectionReportType): ServiceType {
    if (reportType === "wood_stove") {
      return "cleaning";
    }
    return "inspection";
  }

  private async createInspectionJob(
    customer: CustomerEntity,
    propertyAddress: string,
    reportType: InspectionReportType,
    actor: ActorContext,
  ) {
    return this.jobsRepository.save(
      this.jobsRepository.create({
        customer_id: customer.id,
        service_id: null,
        assigned_technician_id: null,
        title: `Inspection for ${customer.full_name}`,
        description: "Created from inspections modal.",
        lead_source: customer.source ?? "website",
        requested_service_type: this.reportTypeToServiceType(reportType),
        status: "scheduled",
        service_address_line_1: propertyAddress,
        service_address_line_2: null,
        service_city: customer.service_city ?? "",
        service_state_or_region: customer.service_state_or_region,
        service_postal_code: customer.service_postal_code ?? "",
        scheduled_for: null,
        scheduled_window: null,
        requested_at: new Date(),
        created_by_auth_user_id: actor.user.id,
        updated_by_auth_user_id: actor.user.id,
      }),
    );
  }

  private async resolveOrCreateDraftCustomer() {
    const existing = await this.customersRepository.findOne({ where: { email: "internal-draft@phoenix.local" } });
    if (existing) {
      return existing;
    }
    return this.customersRepository.save(
      this.customersRepository.create({
        full_name: "Internal Draft",
        phone: "0000000000",
        email: "internal-draft@phoenix.local",
        external_client_number: null,
        company_name: null,
        service_address_line_1: "",
        service_address_line_2: null,
        service_city: "",
        service_state_or_region: null,
        service_postal_code: "",
        source: "other",
        preferred_service_type: "inspection",
        notes: "System draft customer for inspection demos.",
      }),
    );
  }
}
