import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import { PhoenixFieldHistoricalReportBatchEntity } from "../database/entities/phoenix-field-historical-report-batch.entity";
import { PhoenixFieldHistoricalReportEntryEntity } from "../database/entities/phoenix-field-historical-report-entry.entity";
import { PhoenixFieldReportAccessService } from "./phoenix-field-report-access.service";
import type {
  MichaelReportBatchResponse,
  MichaelReportDraftBody,
  MichaelReportEmailProviderStatus,
  MichaelReportImportStatus,
  MichaelReportJobPayload,
} from "./phoenix-field-report.types";

@Injectable()
export class PhoenixFieldReportDraftService {
  constructor(
    private readonly accessService: PhoenixFieldReportAccessService,
    @InjectRepository(PhoenixFieldHistoricalReportBatchEntity)
    private readonly batchRepository: Repository<PhoenixFieldHistoricalReportBatchEntity>,
    @InjectRepository(PhoenixFieldHistoricalReportEntryEntity)
    private readonly entryRepository: Repository<PhoenixFieldHistoricalReportEntryEntity>,
  ) {}

  async getOrCreateDraftBatch(actor: ActorContext) {
    const organizationId = this.accessService.requirePhoenixOrganizationId(actor);
    await this.accessService.assertOrgFeatureOpen(organizationId);
    const userId = actor.user.id;

    let batch = await this.batchRepository.findOne({
      where: {
        organization_id: organizationId,
        created_by_auth_user_id: userId,
        status: "draft",
      },
      relations: { entries: true },
      order: { created_at: "DESC" },
    });

    if (!batch) {
      batch = await this.batchRepository.save(
        this.batchRepository.create({
          organization_id: organizationId,
          created_by_auth_user_id: userId,
          status: "draft",
        }),
      );
      batch.entries = [];
    }

    return batch;
  }

  async findLatestSubmittedBatch(actor: ActorContext) {
    const organizationId = this.accessService.requirePhoenixOrganizationId(actor);
    const userId = actor.user.id;

    return this.batchRepository.findOne({
      where: {
        organization_id: organizationId,
        created_by_auth_user_id: userId,
        submitted_at: Not(IsNull()),
      },
      relations: { entries: true },
      order: { submitted_at: "DESC", created_at: "DESC" },
    });
  }

  async saveDraft(actor: ActorContext, body: MichaelReportDraftBody, options?: { persistReportEmail?: boolean }) {
    const organizationId = this.accessService.requirePhoenixOrganizationId(actor);
    await this.accessService.assertOrgFeatureOpen(organizationId);
    const batch = await this.getOrCreateDraftBatch(actor);
    if (options?.persistReportEmail && body.reportRecipientEmail.trim()) {
      batch.report_recipient_email = body.reportRecipientEmail.trim();
      await this.batchRepository.save(batch);
    }

    const existingEntries = await this.entryRepository.find({
      where: { batch_id: batch.id },
    });
    const existingByClientKey = new Map(existingEntries.map((entry) => [entry.client_row_key, entry]));
    const incomingKeys = new Set(body.entries.map((entry) => entry.clientRowKey));

    for (const existing of existingEntries) {
      if (!incomingKeys.has(existing.client_row_key)) {
        if (existing.status === "draft") {
          await this.entryRepository.remove(existing);
        }
      }
    }

    for (const [index, payload] of body.entries.entries()) {
      const existing = existingByClientKey.get(payload.clientRowKey);
      if (existing && existing.status !== "draft") {
        continue;
      }

      if (existing) {
        existing.sort_order = index;
        existing.payload_json = payload as unknown as Record<string, unknown>;
        existing.status = "draft";
        await this.entryRepository.save(existing);
      } else {
        await this.entryRepository.save(
          this.entryRepository.create({
            batch_id: batch.id,
            organization_id: batch.organization_id,
            client_row_key: payload.clientRowKey,
            sort_order: index,
            status: "draft",
            payload_json: payload as unknown as Record<string, unknown>,
          }),
        );
      }
    }

    return this.loadBatchResponse(batch.id);
  }

  async loadBatchResponse(batchId: string): Promise<MichaelReportBatchResponse> {
    const batch = await this.batchRepository.findOne({
      where: { id: batchId },
      relations: { entries: true },
    });

    if (!batch) {
      apiError(404, "michael_report_batch_not_found", "The report batch could not be found.");
    }

    const entries = [...(batch.entries ?? [])].sort((left, right) => left.sort_order - right.sort_order);

    const importStatus = this.mapImportStatus(batch.status);
    const emailProviderStatus = this.mapEmailProviderStatus(batch.status);
    let emailStatus: MichaelReportBatchResponse["emailStatus"] = "not_sent";
    if (emailProviderStatus === "accepted") {
      emailStatus = "sent";
    } else if (emailProviderStatus === "failed") {
      emailStatus = "failed";
    }

    const orgFeatureClosed = await this.accessService.isOrgFeatureClosed(batch.organization_id);

    return {
      batchId: batch.id,
      status: batch.status,
      reportRecipientEmail: batch.report_recipient_email,
      importStatus,
      emailProviderStatus,
      emailDeliveryVerified: Boolean(batch.email_delivery_verified_at),
      emailDeliveryVerifiedAt: batch.email_delivery_verified_at?.toISOString() ?? null,
      emailStatus,
      emailLastError: batch.email_last_error,
      orgFeatureClosed,
      entries: entries.map((entry) => ({
        id: entry.id,
        clientRowKey: entry.client_row_key,
        sortOrder: entry.sort_order,
        status: entry.status,
        payload: entry.payload_json as unknown as MichaelReportJobPayload,
        customerId: entry.customer_id,
        jobId: entry.job_id,
        invoiceId: entry.invoice_id,
        paymentId: entry.payment_id,
        lastErrorCode: entry.last_error_code,
        lastErrorMessage: entry.last_error_message,
      })),
    };
  }

  private mapImportStatus(status: PhoenixFieldHistoricalReportBatchEntity["status"]): MichaelReportImportStatus {
    if (status === "draft") {
      return "draft";
    }

    if (status === "import_partial") {
      return "import_partial";
    }

    if (status === "imported" || status === "email_pending" || status === "email_sent" || status === "email_failed") {
      return "imported";
    }

    return "import_pending";
  }

  private mapEmailProviderStatus(status: PhoenixFieldHistoricalReportBatchEntity["status"]): MichaelReportEmailProviderStatus {
    if (status === "email_pending") {
      return "pending";
    }

    if (status === "email_sent") {
      return "accepted";
    }

    if (status === "email_failed") {
      return "failed";
    }

    return "not_sent";
  }
}
