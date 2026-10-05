import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { randomUUID } from "crypto";

import type { ActorContext } from "../common/request-types";
import { BranchScopeService } from "../crm/branch-scope.service";
import { persistInvoiceHeaderAndLineItems } from "../crm/crm-document-persistence";
import { DocumentSnapshotService, type SnapshotLineDraft } from "../crm/document-snapshot.service";
import { computeTaxInclusiveDocumentTotals } from "../crm/money-engine.core";
import { InvoiceNumberingService } from "../crm/invoice-numbering.service";
import { InvoicePaymentRecordingService } from "../crm/invoice-payment-recording.service";
import { resolveNativeUpsertInvoiceStatus } from "../crm/invoice-native-ledger-policy";
import { classifyFinanceInvoiceOrigin } from "../crm/finance-invoice-origin";
import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { JobNoteEntity } from "../database/entities/job-note.entity";
import { JobStatusEventEntity } from "../database/entities/job-status-event.entity";
import { PhoenixFieldHistoricalReportEntryEntity } from "../database/entities/phoenix-field-historical-report-entry.entity";
import {
  PHOENIX_FIELD_REPORT_PLACEHOLDER_PHONE,
  PHOENIX_FIELD_REPORT_SUMMARY_LINE_NAME,
} from "./phoenix-field-report.constants";
import { PhoenixFieldReportCustomerMatchService } from "./phoenix-field-report-customer-match";
import { PhoenixFieldReportPreviewService } from "./phoenix-field-report-preview.service";
import { buildPhoenixMichaelFieldReportNotes } from "./phoenix-field-report-provenance";
import type { MichaelReportJobPayload } from "./phoenix-field-report.types";
import { mapUiPaymentMethodToNative } from "./phoenix-field-report.types";
import { dateOnlyToUtcNoon } from "./phoenix-field-report-validation";

@Injectable()
export class PhoenixFieldReportImportService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly branchScopeService: BranchScopeService,
    private readonly documentSnapshotService: DocumentSnapshotService,
    private readonly invoiceNumberingService: InvoiceNumberingService,
    private readonly invoicePaymentRecordingService: InvoicePaymentRecordingService,
    private readonly customerMatchService: PhoenixFieldReportCustomerMatchService,
    private readonly previewService: PhoenixFieldReportPreviewService,
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
    @InjectRepository(PhoenixFieldHistoricalReportEntryEntity)
    private readonly entryRepository: Repository<PhoenixFieldHistoricalReportEntryEntity>,
  ) {}

  buildEntryImportKey(batchId: string, clientRowKey: string) {
    return `michael-report:${batchId}:${clientRowKey}`;
  }

  async importEntry(options: {
    actor: ActorContext;
    organizationId: string;
    batchId: string;
    entry: PhoenixFieldHistoricalReportEntryEntity;
    payload: MichaelReportJobPayload;
  }) {
    const { actor, organizationId, batchId, entry, payload } = options;

    if (entry.status === "imported" && entry.job_id && entry.invoice_id) {
      return entry;
    }

    const candidates = await this.customerMatchService.findCustomerCandidates(organizationId, payload);
    if (this.customerMatchService.customerResolutionRequired(payload, candidates)) {
      entry.status = "failed";
      entry.last_error_code = "customer_resolution_required";
      entry.last_error_message = "Select an existing customer or confirm creating a new customer.";
      return this.entryRepository.save(entry);
    }

    const preview = await this.previewService.preview(
      actor,
      {
        reportRecipientEmail: "preview@local",
        entries: [payload],
      },
      { allowClosedOrg: true },
    );
    const previewRow = preview.rows[0];

    if (previewRow.taxError || previewRow.subtotalCents === null || previewRow.taxRateBps === null) {
      entry.status = "failed";
      entry.last_error_code = "tax_context_missing";
      entry.last_error_message = previewRow.taxError ?? "Tax could not be resolved.";
      return this.entryRepository.save(entry);
    }

    const invoiceTotals = computeTaxInclusiveDocumentTotals(payload.totalChargedCents, previewRow.taxRateBps);
    const completedAt = dateOnlyToUtcNoon(payload.workCompletedDate);
    const entryImportKey = this.buildEntryImportKey(batchId, payload.clientRowKey);
    entry.entry_import_key = entryImportKey;

    try {
      const importResult = await this.dataSource.transaction(async (manager) => {
        const entryRepo = manager.getRepository(PhoenixFieldHistoricalReportEntryEntity);
        const lockedEntry = await entryRepo.findOne({
          where: { id: entry.id, organization_id: organizationId },
          lock: { mode: "pessimistic_write" },
        });

        if (!lockedEntry) {
          throw new Error("entry_not_found");
        }

        if (lockedEntry.status === "imported" && lockedEntry.invoice_id) {
          return lockedEntry;
        }

        const customerId = await this.resolveCustomerId(manager, organizationId, payload, batchId, lockedEntry.id);
        const duplicate = await this.findDuplicateJob(organizationId, customerId, payload);
        if (duplicate) {
          lockedEntry.status = "duplicate_blocked";
          lockedEntry.duplicate_job_json = duplicate as unknown as Record<string, unknown>;
          lockedEntry.last_error_code = "possible_duplicate_job";
          lockedEntry.last_error_message = "A similar job and invoice already exists.";
          return entryRepo.save(lockedEntry);
        }

        const branchId = await this.branchScopeService.resolveBranchIdFromServiceProvince(
          organizationId,
          payload.serviceStateOrRegion,
        );

        const jobRepo = manager.getRepository(JobEntity);
        const technicianId = actor.technician?.id ?? null;
        const soldItemsDescription = payload.productLines.map((line) => line.description).join("\n");

        const job = await jobRepo.save(
          jobRepo.create({
            organization_id: organizationId,
            branch_id: branchId,
            customer_id: customerId,
            assigned_technician_id: technicianId,
            title: `Historical field work for ${payload.customerName}`,
            description: soldItemsDescription,
            lead_source: "other",
            requested_service_type: "repair",
            job_type: "installation_repair",
            status: "completed",
            service_address_line_1: payload.serviceAddressLine1,
            service_address_line_2: payload.serviceAddressLine2,
            service_city: payload.serviceCity,
            service_state_or_region: payload.serviceStateOrRegion,
            service_postal_code: payload.servicePostalCode,
            scheduled_for: null,
            scheduled_window: null,
            requested_at: completedAt,
            completed_at: completedAt,
            created_by_auth_user_id: actor.user.id,
            updated_by_auth_user_id: actor.user.id,
          }),
        );

        const jobStatusEventsRepo = manager.getRepository(JobStatusEventEntity);
        await jobStatusEventsRepo.save(
          jobStatusEventsRepo.create({
            organization_id: organizationId,
            job_id: job.id,
            author_profile_id: actor.profile?.id ?? null,
            status: "completed",
            note: "Historical field work imported from Michael report.",
          }),
        );

        const partsCostIncl = payload.companyParts.costIncludingTaxCents ?? 0;
        const remainingAfterParts = payload.totalChargedCents - partsCostIncl;
        const internalNoteParts = [
          `Company parts: ${payload.companyParts.description} (${payload.companyParts.quantity})`,
          `Parts cost including tax: ${(partsCostIncl / 100).toFixed(2)} CAD`,
          `Remaining amount after parts: ${(remainingAfterParts / 100).toFixed(2)} CAD`,
          `Customer left review (reported): ${payload.customerLeftReview ? "Yes" : "No"}`,
          buildPhoenixMichaelFieldReportNotes({
            sourceSystem: "michael_field_report",
            batchId,
            entryId: lockedEntry.id,
            clientRowKey: payload.clientRowKey,
            submittedAt: new Date().toISOString(),
          }),
        ];

        const jobNotesRepo = manager.getRepository(JobNoteEntity);
        await jobNotesRepo.save(
          jobNotesRepo.create({
            organization_id: organizationId,
            job_id: job.id,
            author_profile_id: actor.profile?.id ?? null,
            findings: soldItemsDescription,
            recommendations: internalNoteParts.join("\n"),
            photo_urls: [],
          }),
        );

        const lineDrafts = this.buildLineDrafts(payload, invoiceTotals.subtotalCents);
        const financeOrigin = classifyFinanceInvoiceOrigin({
          branding_snapshot_json: null,
          customer_facing_snapshot_json: null,
        });
        const resolved = resolveNativeUpsertInvoiceStatus({
          requestedStatus: "unpaid",
          totalCents: invoiceTotals.totalCents,
          existingStatus: "unpaid",
          existingPaidAt: null,
          payments: [],
          financeOrigin,
        });

        const invoice = await persistInvoiceHeaderAndLineItems(manager, this.documentSnapshotService, {
          organizationId,
          jobId: job.id,
          existingInvoice: null,
          description: `Historical invoice — ${payload.customerName}`,
          invoiceTotals,
          status: resolved.status,
          paid_at: resolved.paidAt,
          due_at: completedAt,
          hasSnapshotLineItems: true,
          lineDrafts,
        });

        await manager.getRepository(InvoiceEntity).update(
          { id: invoice.id, organization_id: organizationId },
          { issued_at: completedAt },
        );

        await this.invoiceNumberingService.allocateDocumentNumberIfNeeded(manager, organizationId, invoice);

        lockedEntry.status = "imported";
        lockedEntry.customer_id = customerId;
        lockedEntry.job_id = job.id;
        lockedEntry.invoice_id = invoice.id;
        lockedEntry.imported_at = new Date();
        lockedEntry.last_error_code = null;
        lockedEntry.last_error_message = null;
        lockedEntry.payload_json = payload as unknown as Record<string, unknown>;

        return entryRepo.save(lockedEntry);
      });

      if (importResult.invoice_id && payload.amountReceivedCents > 0 && !importResult.payment_id) {
        const nativeMethod = mapUiPaymentMethodToNative(payload.paymentMethod);
        if (!nativeMethod) {
          throw new Error("payment_method_required");
        }

        const paymentResult = await this.invoicePaymentRecordingService.recordNativePayment({
          organizationId,
          invoiceId: importResult.invoice_id,
          actorUserId: actor.user.id,
          actorProfileId: actor.profile?.id ?? actor.user.id,
          payload: {
            idempotencyKey: `${entryImportKey}:payment`.slice(0, 64),
            entryType: "payment",
            amountCents: payload.amountReceivedCents,
            method: nativeMethod,
            reference: null,
            note: "Historical field payment (Michael report import)",
            occurredAt: payload.paymentDate
              ? dateOnlyToUtcNoon(payload.paymentDate).toISOString()
              : completedAt.toISOString(),
          },
        });

        importResult.payment_id = paymentResult.paymentId;
        return this.entryRepository.save(importResult);
      }

      return importResult;
    } catch (error) {
      entry.status = "failed";
      entry.last_error_code = "import_failed";
      entry.last_error_message = error instanceof Error ? error.message : "Import failed.";
      return this.entryRepository.save(entry);
    }
  }

  private buildLineDrafts(payload: MichaelReportJobPayload, summarySubtotalCents: number): SnapshotLineDraft[] {
    const drafts: SnapshotLineDraft[] = [];
    let sortOrder = 0;
    const soldItemsDescription = payload.productLines.map((line) => line.description).join("\n");

    drafts.push({
      pricebook_item_id: null,
      document_line_key: randomUUID(),
      sku_snapshot: "MANUAL",
      name_snapshot: PHOENIX_FIELD_REPORT_SUMMARY_LINE_NAME,
      description_snapshot: soldItemsDescription,
      item_type_snapshot: "manual",
      unit_of_measure_snapshot: null,
      unit_price_cents_snapshot: summarySubtotalCents,
      base_cost_cents_snapshot: null,
      material_cost_cents_snapshot: null,
      labor_cost_cents_snapshot: null,
      estimated_labor_minutes_snapshot: null,
      warranty_months_snapshot: null,
      pricebook_bundle_id: null,
      bundle_requirement_id: null,
      catalog_unit_price_cents_snapshot: null,
      quantity: "1",
      line_subtotal_cents: summarySubtotalCents,
      sort_order: sortOrder,
    });
    sortOrder += 1;

    for (const line of payload.productLines) {
      if (!line.warrantyEnabled || !line.warrantyMonths) {
        continue;
      }

      drafts.push({
        pricebook_item_id: null,
        document_line_key: randomUUID(),
        sku_snapshot: "WARRANTY-EVIDENCE",
        name_snapshot: line.description.slice(0, 255),
        description_snapshot: `Warranty evidence: ${line.warrantyMonths} months from completion date.`,
        item_type_snapshot: "manual",
        unit_of_measure_snapshot: null,
        unit_price_cents_snapshot: 0,
        base_cost_cents_snapshot: null,
        material_cost_cents_snapshot: null,
        labor_cost_cents_snapshot: null,
        estimated_labor_minutes_snapshot: null,
        warranty_months_snapshot: line.warrantyMonths,
        pricebook_bundle_id: null,
        bundle_requirement_id: null,
        catalog_unit_price_cents_snapshot: null,
        quantity: "1",
        line_subtotal_cents: 0,
        sort_order: sortOrder,
      });
      sortOrder += 1;
    }

    return drafts;
  }

  private async resolveCustomerId(
    manager: EntityManager,
    organizationId: string,
    payload: MichaelReportJobPayload,
    batchId: string,
    entryId: string,
  ) {
    const customerRepo = manager.getRepository(CustomerEntity);

    if (payload.customerId) {
      const existing = await customerRepo.findOne({
        where: { id: payload.customerId, organization_id: organizationId },
      });

      if (!existing) {
        throw new Error("customer_not_found");
      }

      return existing.id;
    }

    if (!payload.createNewCustomer) {
      throw new Error("customer_resolution_required");
    }

    const created = await customerRepo.save(
      customerRepo.create({
        organization_id: organizationId,
        full_name: payload.customerName,
        email: payload.customerEmail,
        phone: PHOENIX_FIELD_REPORT_PLACEHOLDER_PHONE,
        service_address_line_1: payload.serviceAddressLine1,
        service_address_line_2: payload.serviceAddressLine2,
        service_city: payload.serviceCity,
        service_state_or_region: payload.serviceStateOrRegion,
        service_postal_code: payload.servicePostalCode,
        source: "other",
        lifecycle_status: "active",
        notes: buildPhoenixMichaelFieldReportNotes({
          sourceSystem: "michael_field_report",
          batchId,
          entryId,
          clientRowKey: payload.clientRowKey,
          submittedAt: new Date().toISOString(),
        }),
      }),
    );

    return created.id;
  }

  private async findDuplicateJob(organizationId: string, customerId: string, payload: MichaelReportJobPayload) {
    const completedAt = dateOnlyToUtcNoon(payload.workCompletedDate);
    const dayStart = new Date(completedAt);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(completedAt);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const jobs = await this.dataSource.getRepository(JobEntity).find({
      where: {
        organization_id: organizationId,
        customer_id: customerId,
        status: "completed",
      },
    });

    const matchingJob = jobs.find((job) => {
      if (!job.completed_at) {
        return false;
      }

      const completedTime = job.completed_at.getTime();
      return completedTime >= dayStart.getTime() && completedTime <= dayEnd.getTime();
    });

    if (!matchingJob) {
      return null;
    }

    const invoice = await this.dataSource.getRepository(InvoiceEntity).findOne({
      where: {
        organization_id: organizationId,
        job_id: matchingJob.id,
      },
    });

    if (!invoice || invoice.total_cents !== payload.totalChargedCents) {
      return null;
    }

    return {
      jobId: matchingJob.id,
      invoiceId: invoice.id,
      documentNumber: invoice.document_number,
      reasons: ["same_customer_completion_date_and_total"],
    };
  }
}
