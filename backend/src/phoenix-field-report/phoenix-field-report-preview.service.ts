import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import type { ActorContext } from "../common/request-types";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { PhoenixFieldReportAccessService } from "./phoenix-field-report-access.service";
import { PhoenixFieldReportCustomerMatchService } from "./phoenix-field-report-customer-match";
import { readPartsCostIncludingTaxCents } from "./phoenix-field-report-financials";
import { PhoenixFieldReportFinancialsService } from "./phoenix-field-report-financials.service";
import type { MichaelReportDraftBody, MichaelReportPreviewRow } from "./phoenix-field-report.types";
import { dateOnlyToUtcNoon } from "./phoenix-field-report-validation";

@Injectable()
export class PhoenixFieldReportPreviewService {
  constructor(
    private readonly accessService: PhoenixFieldReportAccessService,
    private readonly financialsService: PhoenixFieldReportFinancialsService,
    private readonly customerMatchService: PhoenixFieldReportCustomerMatchService,
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoicesRepository: Repository<InvoiceEntity>,
  ) {}

  async preview(actor: ActorContext, body: MichaelReportDraftBody) {
    const organizationId = this.accessService.requirePhoenixOrganizationId(actor);
    await this.accessService.assertOrgFeatureOpen(organizationId);
    const rows: MichaelReportPreviewRow[] = [];

    for (const payload of body.entries) {
      const issues: string[] = [];
      const { financials, taxError, taxRateBps } = await this.financialsService.computeForPayload(
        organizationId,
        payload,
      );
      const subtotalCents = financials?.saleExcludingTaxCents ?? null;
      const taxCents = financials?.taxCents ?? null;

      if (taxError) {
        issues.push(taxError);
      }

      const customerCandidates = await this.customerMatchService.findCustomerCandidates(organizationId, payload);
      const customerMatchRequired = this.customerMatchService.customerResolutionRequired(payload, customerCandidates);

      if (customerMatchRequired) {
        issues.push("Select an existing customer or confirm creating a new customer.");
      }

      const possibleDuplicateJob = await this.findPossibleDuplicateJob(organizationId, payload);

      if (possibleDuplicateJob) {
        issues.push("A similar completed job and invoice may already exist.");
      }

      if (payload.companyParts.partsCostConfirmed !== true) {
        issues.push('Confirm "Parts cost including tax (CAD)" (enter 0 if no parts were used).');
      }

      rows.push({
        ...payload,
        taxRateBps,
        subtotalCents,
        taxCents,
        totalCents: payload.totalChargedCents,
        saleExcludingTaxCents: financials?.saleExcludingTaxCents ?? null,
        saleIncludingTaxCents: payload.totalChargedCents,
        partsCostIncludingTaxCents: readPartsCostIncludingTaxCents(payload.companyParts),
        remainingAfterPartsCents: financials?.remainingAfterPartsCents ?? null,
        taxError,
        customerCandidates,
        customerMatchRequired,
        possibleDuplicateJob,
        issues,
      });
    }

    return { rows };
  }

  private async findPossibleDuplicateJob(organizationId: string, payload: MichaelReportPreviewRow | MichaelReportDraftBody["entries"][number]) {
    if (!payload.customerId) {
      return null;
    }

    const completedAt = dateOnlyToUtcNoon(payload.workCompletedDate);
    const dayStart = new Date(completedAt);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(completedAt);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const jobs = await this.jobsRepository.find({
      where: {
        organization_id: organizationId,
        customer_id: payload.customerId,
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

    const invoice = await this.invoicesRepository.findOne({
      where: {
        organization_id: organizationId,
        job_id: matchingJob.id,
      },
    });

    if (invoice && invoice.total_cents !== payload.totalChargedCents) {
      return null;
    }

    return {
      jobId: matchingJob.id,
      invoiceId: invoice?.id ?? null,
      documentNumber: invoice?.document_number ?? null,
      reasons: ["same_customer_completion_date_and_total"],
    };
  }
}
