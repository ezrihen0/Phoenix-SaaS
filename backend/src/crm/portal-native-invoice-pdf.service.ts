import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import { sanitizeInvoiceDescription, sanitizeUserFacingText } from "./user-facing-text";
import { resolveInvoiceDisplayNumber } from "./invoice-display-number";
import { InvoicePaymentLedgerService } from "./invoice-payment-ledger.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoicePdfViewModelService } from "./invoice-pdf-view-model.service";

@Injectable()
export class PortalNativeInvoicePdfService {
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoicesRepository: Repository<InvoiceEntity>,
    @InjectRepository(OrganizationSettingEntity)
    private readonly organizationSettingsRepository: Repository<OrganizationSettingEntity>,
    private readonly invoicePaymentLedgerService: InvoicePaymentLedgerService,
    private readonly invoicePdfViewModelService: InvoicePdfViewModelService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  async renderForPortal(input: { organizationId: string; customerId: string; invoiceId: string }) {
    const invoice = await this.invoicesRepository.findOne({
      where: {
        id: input.invoiceId,
        organization_id: input.organizationId,
      },
      relations: {
        line_items: true,
        payments: true,
        job: {
          customer: true,
        },
      },
    });

    if (!invoice) {
      apiError(404, "invoice_not_found", "The invoice could not be found.");
    }

    invoice.line_items = (invoice.line_items ?? []).slice().sort((left, right) => left.sort_order - right.sort_order);

    const job = invoice.job as JobEntity | undefined;
    if (!job || job.customer_id !== input.customerId) {
      apiError(404, "invoice_not_found", "The invoice could not be found.");
    }

    const customer = job.customer as CustomerEntity | undefined;
    const orgSettings = await this.findOrganizationSettings(input.organizationId);
    const dueDays = orgSettings?.default_due_days ?? 30;
    const ledgerSummary = this.invoicePaymentLedgerService.summarizeInvoice({
      totalCents: invoice.total_cents || invoice.amount_cents,
      legacyStatus: invoice.status,
      legacyPaidAt: invoice.paid_at,
      payments: invoice.payments ?? [],
      voidedAt: invoice.voided_at,
      cancelledAt: invoice.cancelled_at,
    });

    const viewModel = this.invoicePdfViewModelService.build({
      invoice,
      customer: customer ?? null,
      job,
      orgSettings,
      ledgerSummary,
      dueDays,
      formatCents: (cents) => this.formatCents(cents),
      formatDisplayDate: (value) => this.formatDisplayDate(value),
      formatDueDate: (dueAt, issuedAt, fallbackDueDays) =>
        this.formatDueDate(dueAt, issuedAt, fallbackDueDays),
      sanitizeDescription: (value) =>
        this.normalizeOptionalString(sanitizeInvoiceDescription(value)) ?? "",
      sanitizeLineText: (value) => sanitizeUserFacingText(value ?? "") || null,
    });

    const buffer = this.invoicePdfService.renderInvoicePdf(viewModel);
    const documentNumber = resolveInvoiceDisplayNumber(invoice);
    return {
      buffer,
      filename: `invoice-${documentNumber}.pdf`,
    };
  }

  private async findOrganizationSettings(organizationId: string) {
    return this.organizationSettingsRepository.findOne({
      where: {
        organization_id: organizationId,
        settings_key: `${organizationId}:default`,
      },
    });
  }

  private formatCents(cents: number | null | undefined) {
    if (typeof cents !== "number" || !Number.isFinite(cents)) {
      return "$0.00";
    }
    return `$${(cents / 100).toFixed(2)}`;
  }

  private formatDisplayDate(value: Date) {
    return value.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  private formatDueDate(dueAt: Date | null | undefined, issuedAt: Date, fallbackDueDays = 30) {
    if (dueAt) {
      return this.formatDisplayDate(dueAt);
    }
    const fallback = new Date(issuedAt.getTime() + fallbackDueDays * 86_400_000);
    return this.formatDisplayDate(fallback);
  }

  private normalizeOptionalString(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized?.length ? normalized : null;
  }
}
