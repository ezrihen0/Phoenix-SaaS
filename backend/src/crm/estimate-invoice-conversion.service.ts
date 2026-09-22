import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { QuoteEntity } from "../database/entities/quote.entity";
import { QuoteLineItemEntity } from "../database/entities/quote-line-item.entity";
import { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import { canManageInvoiceResource } from "../auth/permissions";
import { persistInvoiceHeaderAndLineItems } from "./crm-document-persistence";
import { DocumentSnapshotService } from "./document-snapshot.service";
import { MoneyEngineService } from "./money-engine.service";

@Injectable()
export class EstimateInvoiceConversionService {
  constructor(
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
    @InjectRepository(QuoteEntity)
    private readonly quotesRepository: Repository<QuoteEntity>,
    @InjectRepository(QuoteLineItemEntity)
    private readonly quoteLineItemsRepository: Repository<QuoteLineItemEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoicesRepository: Repository<InvoiceEntity>,
    @InjectRepository(OrganizationSettingEntity)
    private readonly organizationSettingsRepository: Repository<OrganizationSettingEntity>,
    private readonly documentSnapshotService: DocumentSnapshotService,
    private readonly moneyEngineService: MoneyEngineService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private isEstimateApprovedOrSigned(quote: QuoteEntity) {
    return Boolean(quote.approved_at || quote.signed_at);
  }

  private isDocumentLocked(approvedAt: Date | null, signedAt: Date | null) {
    return Boolean(approvedAt || signedAt);
  }

  async convertFromEstimate(input: {
    organizationId: string;
    jobId: string;
    estimateId: string | null;
    actor: ActorContext;
  }) {
    const job = await this.jobsRepository.findOne({
      where: {
        id: input.jobId,
        organization_id: input.organizationId,
      },
    });

    if (!job) {
      apiError(404, "job_not_found", "The job could not be found.");
    }

    if (!canManageInvoiceResource(input.actor, job.assigned_technician_id)) {
      apiError(403, "invoice_manage_forbidden", "This account cannot change invoices.");
    }

    const quote = input.estimateId
      ? await this.quotesRepository.findOne({
          where: {
            id: input.estimateId,
            organization_id: input.organizationId,
          },
        })
      : await this.quotesRepository.findOne({
          where: {
            job_id: input.jobId,
            organization_id: input.organizationId,
          },
        });

    if (!quote || quote.job_id !== input.jobId) {
      apiError(404, "estimate_not_found", "The estimate could not be found.");
    }

    if (!this.isEstimateApprovedOrSigned(quote)) {
      apiError(
        400,
        "estimate_not_approved",
        "Only approved or signed estimates can be converted into an invoice.",
      );
    }

    const existingInvoice = await this.invoicesRepository.findOne({
      where: {
        job_id: input.jobId,
        organization_id: input.organizationId,
      },
      relations: {
        line_items: true,
        payments: true,
      },
    });

    if (existingInvoice && this.isDocumentLocked(existingInvoice.approved_at, existingInvoice.signed_at)) {
      apiError(409, "invoice_locked", "This invoice is locked and cannot be replaced by conversion.");
    }

    if (existingInvoice?.payments?.length) {
      apiError(
        409,
        "invoice_has_payments",
        "This invoice already has ledger payments and cannot be replaced by conversion.",
      );
    }

    const existingLineCount = existingInvoice?.line_items?.length ?? 0;
    if (
      existingInvoice
      && existingInvoice.source_quote_id === quote.id
      && existingLineCount > 0
    ) {
      apiError(
        409,
        "invoice_already_converted",
        "This job invoice was already created from this estimate.",
      );
    }

    const quoteLineItems = await this.quoteLineItemsRepository.find({
      where: {
        quote_id: quote.id,
      },
      order: {
        sort_order: "ASC",
      },
    });

    if (quoteLineItems.length === 0) {
      apiError(400, "estimate_has_no_lines", "The estimate has no line items to convert.");
    }

    const lineDrafts = this.documentSnapshotService.copyQuoteLineSnapshotsToInvoiceDrafts(quoteLineItems);
    const invoiceTotals = this.moneyEngineService.computeSnapshotTotals(
      lineDrafts.map((lineDraft) => ({
        quantity: lineDraft.quantity,
        unitPriceCents: lineDraft.unit_price_cents_snapshot,
      })),
      quote.tax_rate_bps_snapshot ?? 0,
    );

    const timestamp = new Date();
    const orgSettings = await this.organizationSettingsRepository.findOne({
      where: {
        organization_id: input.organizationId,
      },
    });
    const dueDays = this.readDefaultDueDays(orgSettings);
    const issuedAt = existingInvoice?.issued_at ?? timestamp;
    const dueAt = existingInvoice?.due_at ?? this.computeDueAt(issuedAt, dueDays);
    const invoiceDescription = `Invoice from estimate for ${job.title}`;

    const invoice = await this.dataSource.transaction((manager) =>
      persistInvoiceHeaderAndLineItems(manager, this.documentSnapshotService, {
        organizationId: input.organizationId,
        jobId: input.jobId,
        existingInvoice: existingInvoice ?? null,
        description: invoiceDescription,
        invoiceTotals,
        status: existingInvoice?.status ?? "unpaid",
        paid_at: existingInvoice?.paid_at ?? null,
        due_at: dueAt,
        hasSnapshotLineItems: true,
        lineDrafts,
        sourceQuoteId: quote.id,
      }),
    );

    return invoice;
  }

  private readDefaultDueDays(settings: OrganizationSettingEntity | null) {
    const dueDays = settings?.default_due_days;
    if (typeof dueDays === "number" && Number.isInteger(dueDays) && dueDays >= 0 && dueDays <= 365) {
      return dueDays;
    }

    return 30;
  }

  private computeDueAt(issuedAt: Date, dueDays: number) {
    const dueAt = new Date(issuedAt);
    dueAt.setDate(dueAt.getDate() + dueDays);
    return dueAt;
  }
}
