import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import { PhoenixFieldHistoricalReportBatchEntity } from "../database/entities/phoenix-field-historical-report-batch.entity";
import { PhoenixFieldHistoricalReportEntryEntity } from "../database/entities/phoenix-field-historical-report-entry.entity";
import { PhoenixFieldHistoricalReportOrgLockEntity } from "../database/entities/phoenix-field-historical-report-org-lock.entity";
import { PhoenixFieldReportAccessService } from "./phoenix-field-report-access.service";
import { PhoenixFieldReportDraftService } from "./phoenix-field-report-draft.service";
import { PhoenixFieldReportEmailService } from "./phoenix-field-report-email.service";
import { PhoenixFieldReportImportService } from "./phoenix-field-report-import.service";
import { PhoenixFieldReportPdfService } from "./phoenix-field-report-pdf.service";
import { aggregateEntryFinancials } from "./phoenix-field-report-financials";
import { PhoenixFieldReportFinancialsService } from "./phoenix-field-report-financials.service";
import type { MichaelReportDraftBody, MichaelReportJobPayload, MichaelReportSubmitResult } from "./phoenix-field-report.types";

@Injectable()
export class PhoenixFieldReportService {
  constructor(
    private readonly accessService: PhoenixFieldReportAccessService,
    private readonly draftService: PhoenixFieldReportDraftService,
    private readonly importService: PhoenixFieldReportImportService,
    private readonly emailService: PhoenixFieldReportEmailService,
    private readonly pdfService: PhoenixFieldReportPdfService,
    private readonly financialsService: PhoenixFieldReportFinancialsService,
    @InjectRepository(PhoenixFieldHistoricalReportBatchEntity)
    private readonly batchRepository: Repository<PhoenixFieldHistoricalReportBatchEntity>,
    @InjectRepository(PhoenixFieldHistoricalReportEntryEntity)
    private readonly entryRepository: Repository<PhoenixFieldHistoricalReportEntryEntity>,
    @InjectRepository(PhoenixFieldHistoricalReportOrgLockEntity)
    private readonly orgLockRepository: Repository<PhoenixFieldHistoricalReportOrgLockEntity>,
  ) {}

  async getDraft(actor: ActorContext) {
    this.accessService.assertActorMayAccess(actor);
    const organizationId = this.accessService.requirePhoenixOrganizationId(actor);

    if (await this.accessService.isOrgFeatureClosed(organizationId)) {
      const submitted = await this.draftService.findLatestSubmittedBatch(actor);
      if (!submitted) {
        apiError(
          404,
          "michael_report_closed",
          "This one-time historical work report tool has been closed.",
        );
      }

      return this.draftService.loadBatchResponse(submitted.id);
    }

    const userId = actor.user.id;
    const openDraft = await this.batchRepository.findOne({
      where: {
        organization_id: organizationId,
        created_by_auth_user_id: userId,
        status: "draft",
      },
      order: { updated_at: "DESC" },
    });

    if (openDraft) {
      return this.draftService.loadBatchResponse(openDraft.id);
    }

    const submitted = await this.draftService.findLatestSubmittedBatch(actor);
    if (submitted) {
      return this.draftService.loadBatchResponse(submitted.id);
    }

    const batch = await this.draftService.getOrCreateDraftBatch(actor);
    return this.draftService.loadBatchResponse(batch.id);
  }

  async getFeatureStatus(actor: ActorContext) {
    this.accessService.assertActorMayAccess(actor);
    const organizationId = this.accessService.requirePhoenixOrganizationId(actor);
    const orgFeatureClosed = await this.accessService.isOrgFeatureClosed(organizationId);

    return {
      envEnabled: this.accessService.isFeatureEnabled(),
      orgFeatureClosed,
      featureAvailable: this.accessService.isFeatureEnabled() && !orgFeatureClosed,
      isOwner: this.accessService.isOwnerEmail(actor.user.email),
    };
  }

  async saveDraft(actor: ActorContext, body: MichaelReportDraftBody) {
    return this.draftService.saveDraft(actor, body);
  }

  async submit(actor: ActorContext, body: MichaelReportDraftBody, submissionIdempotencyKey: string) {
    const organizationId = this.accessService.requirePhoenixOrganizationId(actor);
    await this.accessService.assertOrgFeatureOpen(organizationId);
    const normalizedKey = submissionIdempotencyKey.trim();
    if (!normalizedKey || normalizedKey.length > 64) {
      apiError(400, "invalid_idempotency_key", "Idempotency-Key header is required (max 64 characters).");
    }

    const existing = await this.batchRepository.findOne({
      where: { submission_idempotency_key: normalizedKey },
      relations: { entries: true },
    });

    if (existing) {
      return this.buildSubmitResult(existing.id);
    }

    const userId = actor.user.id;
    const openDraft = await this.batchRepository.findOne({
      where: {
        organization_id: organizationId,
        created_by_auth_user_id: userId,
        status: "draft",
      },
    });

    if (!openDraft) {
      const alreadySubmitted = await this.draftService.findLatestSubmittedBatch(actor);
      if (alreadySubmitted) {
        return this.buildSubmitResult(alreadySubmitted.id);
      }
    }

    await this.draftService.saveDraft(actor, body, { persistReportEmail: true });
    const draftBatch =
      openDraft ?? (await this.draftService.getOrCreateDraftBatch(actor));
    draftBatch.report_recipient_email = body.reportRecipientEmail.trim();
    await this.batchRepository.save(draftBatch);
    const entries = await this.entryRepository.find({
      where: { batch_id: draftBatch.id },
      order: { sort_order: "ASC" },
    });

    if (entries.length === 0) {
      apiError(400, "empty_report", "Add at least one job before submitting.");
    }

    if (!body.reportRecipientEmail.trim()) {
      apiError(400, "report_email_required", "Enter the email address where you want to receive your report.");
    }

    draftBatch.submission_idempotency_key = normalizedKey;
    draftBatch.submitted_at = new Date();
    draftBatch.submitted_by_auth_user_id = actor.user.id;
    draftBatch.status = "import_partial";
    await this.batchRepository.save(draftBatch);

    for (const entry of entries) {
      if (entry.status === "imported") {
        continue;
      }

      const payload = entry.payload_json as unknown as MichaelReportJobPayload;
      await this.importService.importEntry({
        actor,
        organizationId,
        batchId: draftBatch.id,
        entry,
        payload,
      });
    }

    const refreshedEntries = await this.entryRepository.find({ where: { batch_id: draftBatch.id } });
    const failedCount = refreshedEntries.filter((entry) => entry.status === "failed" || entry.status === "duplicate_blocked").length;
    draftBatch.status = failedCount > 0 ? "import_partial" : "imported";
    draftBatch.totals_json = await this.computeTotals(organizationId, refreshedEntries);
    await this.batchRepository.save(draftBatch);

    await this.emailService.persistPdf(draftBatch.id);
    await this.emailService.sendReportEmail(draftBatch.id);

    return this.buildSubmitResult(draftBatch.id);
  }

  async retryFailedImports(actor: ActorContext, batchId: string) {
    const organizationId = this.accessService.requirePhoenixOrganizationId(actor);
    const batch = await this.batchRepository.findOne({ where: { id: batchId, organization_id: organizationId } });
    if (!batch) {
      apiError(404, "michael_report_batch_not_found", "The report batch could not be found.");
    }

    const entries = await this.entryRepository.find({
      where: { batch_id: batchId, status: "failed" },
    });

    for (const entry of entries) {
      const payload = entry.payload_json as unknown as MichaelReportJobPayload;
      await this.importService.importEntry({
        actor,
        organizationId,
        batchId,
        entry,
        payload,
      });
    }

    const refreshedEntries = await this.entryRepository.find({ where: { batch_id: batchId } });
    const failedCount = refreshedEntries.filter((entry) => entry.status === "failed" || entry.status === "duplicate_blocked").length;
    batch.status = failedCount > 0 ? "import_partial" : "imported";
    batch.totals_json = await this.computeTotals(organizationId, refreshedEntries);
    await this.batchRepository.save(batch);

    return this.buildSubmitResult(batchId);
  }

  async verifyEmailDelivery(actor: ActorContext, batchId: string) {
    this.accessService.assertActorIsOwner(actor);
    const organizationId = this.accessService.requirePhoenixOrganizationId(actor);
    const batch = await this.batchRepository.findOne({ where: { id: batchId, organization_id: organizationId } });
    if (!batch) {
      apiError(404, "michael_report_batch_not_found", "The report batch could not be found.");
    }

    if (batch.status !== "email_sent") {
      apiError(
        400,
        "email_not_accepted",
        "Delivery can only be verified after the email provider has accepted the report message.",
      );
    }

    batch.email_delivery_verified_at = new Date();
    batch.email_delivery_verified_by_auth_user_id = actor.user.id;
    await this.batchRepository.save(batch);

    return this.buildSubmitResult(batchId);
  }

  async closeFeature(actor: ActorContext, batchId: string) {
    this.accessService.assertActorIsOwner(actor);
    const organizationId = this.accessService.requirePhoenixOrganizationId(actor);
    const batch = await this.batchRepository.findOne({ where: { id: batchId, organization_id: organizationId } });
    if (!batch) {
      apiError(404, "michael_report_batch_not_found", "The report batch could not be found.");
    }

    if (!batch.submitted_at) {
      apiError(400, "batch_not_submitted", "Submit the historical report before closing the tool.");
    }

    if (!batch.email_delivery_verified_at) {
      apiError(
        400,
        "delivery_not_verified",
        "Confirm inbox receipt of the emailed report before closing this one-time tool.",
      );
    }

    const existingLock = await this.accessService.isOrgFeatureClosed(organizationId);
    if (!existingLock) {
      await this.orgLockRepository.save(
        this.orgLockRepository.create({
          organization_id: organizationId,
          owner_closed_at: new Date(),
          owner_closed_by_auth_user_id: actor.user.id,
          closing_batch_id: batchId,
        }),
      );
    }

    return {
      ...(await this.buildSubmitResult(batchId)),
      orgFeatureClosed: true,
    };
  }

  async retryEmail(actor: ActorContext, batchId: string) {
    this.accessService.requirePhoenixOrganizationId(actor);
    const batch = await this.batchRepository.findOne({ where: { id: batchId } });
    if (!batch) {
      apiError(404, "michael_report_batch_not_found", "The report batch could not be found.");
    }

    await this.emailService.sendReportEmail(batchId);
    return this.buildSubmitResult(batchId);
  }

  async getPdfBuffer(actor: ActorContext, batchId: string) {
    this.accessService.requirePhoenixOrganizationId(actor);
    const batch = await this.batchRepository.findOne({ where: { id: batchId } });
    if (!batch) {
      apiError(404, "michael_report_batch_not_found", "The report batch could not be found.");
    }

    await this.emailService.persistPdf(batchId);
    return this.pdfService.renderBatchPdf(batchId);
  }

  private async computeTotals(organizationId: string, entries: PhoenixFieldHistoricalReportEntryEntity[]) {
    let receivedCents = 0;
    const byMethod: Record<string, number> = {};
    const financialRows = [];

    for (const entry of entries) {
      const payload = entry.payload_json as unknown as MichaelReportJobPayload;
      receivedCents += payload.amountReceivedCents;
      byMethod[payload.paymentMethod] = (byMethod[payload.paymentMethod] ?? 0) + payload.amountReceivedCents;

      const { financials } = await this.financialsService.computeForPayload(organizationId, payload);
      if (financials) {
        financialRows.push(financials);
      }
    }

    const saleSummary = aggregateEntryFinancials(financialRows);

    return {
      saleExcludingTaxCents: saleSummary.saleExcludingTaxCents,
      taxCents: saleSummary.taxCents,
      saleIncludingTaxCents: saleSummary.saleIncludingTaxCents,
      partsCostIncludingTaxCents: saleSummary.partsCostIncludingTaxCents,
      remainingAfterPartsCents: saleSummary.remainingAfterPartsCents,
      salesCentsTaxInclusive: saleSummary.saleIncludingTaxCents,
      receivedCents,
      outstandingCents: saleSummary.saleIncludingTaxCents - receivedCents,
      receivedByPaymentMethod: byMethod,
    };
  }

  private async buildSubmitResult(batchId: string): Promise<MichaelReportSubmitResult> {
    const response = await this.draftService.loadBatchResponse(batchId);
    const batch = await this.batchRepository.findOne({ where: { id: batchId } });
    return {
      ...response,
      totals: (batch?.totals_json as Record<string, unknown>) ?? {},
      pdfAvailable: Boolean(batch?.pdf_storage_key),
    };
  }
}
