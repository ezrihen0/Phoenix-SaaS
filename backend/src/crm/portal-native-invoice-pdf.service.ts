import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import { resolveInvoiceDisplayNumber } from "./invoice-display-number";
import { InvoicePdfService } from "./invoice-pdf.service";
import { PhoenixInvoiceDocumentPresentationService } from "./phoenix-invoice-document-presentation.service";

@Injectable()
export class PortalNativeInvoicePdfService {
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoicesRepository: Repository<InvoiceEntity>,
    @InjectRepository(OrganizationSettingEntity)
    private readonly organizationSettingsRepository: Repository<OrganizationSettingEntity>,
    private readonly phoenixInvoiceDocumentPresentationService: PhoenixInvoiceDocumentPresentationService,
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
          branch: true,
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
    const documentView = this.phoenixInvoiceDocumentPresentationService.buildInvoiceDocumentView({
      invoice,
      customer: customer ?? null,
      job,
      orgSettings,
      branchTaxLabel: job.branch?.tax_label ?? null,
    });

    const buffer = this.invoicePdfService.renderInvoicePdf(documentView);
    const documentNumber = resolveInvoiceDisplayNumber(invoice);
    return {
      buffer,
      filename: `invoice-${documentNumber}.pdf`,
      document_view: documentView,
    };
  }

  async getDocumentViewForPortal(input: { organizationId: string; customerId: string; invoiceId: string }) {
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
          branch: true,
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

    return this.phoenixInvoiceDocumentPresentationService.buildInvoiceDocumentView({
      invoice,
      customer: customer ?? null,
      job,
      orgSettings,
      branchTaxLabel: job.branch?.tax_label ?? null,
    });
  }

  private async findOrganizationSettings(organizationId: string) {
    return this.organizationSettingsRepository.findOne({
      where: {
        organization_id: organizationId,
        settings_key: `${organizationId}:default`,
      },
    });
  }
}
