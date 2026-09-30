import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import type { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import type { JobEntity } from "../database/entities/job.entity";
import type { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import type { BranchEntity } from "../database/entities/branch.entity";
import { InvoiceCustomerFacingSnapshotService, type InvoiceSnapshotFreezeVia } from "./invoice-customer-facing-snapshot.service";
import type { InvoiceCustomerFacingSnapshotAny } from "./invoice-customer-facing-snapshot.types";
import { InvoiceNumberingService } from "./invoice-numbering.service";

export type InvoiceSendPipelineInput = {
  organizationId: string;
  invoice: InvoiceEntity;
  job: JobEntity;
  customer: CustomerEntity | null;
  orgSettings: OrganizationSettingEntity | null;
  frozenVia: InvoiceSnapshotFreezeVia;
  branch?: BranchEntity | null;
};

@Injectable()
export class InvoiceSendPipelineService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly invoiceNumberingService: InvoiceNumberingService,
    private readonly invoiceCustomerFacingSnapshotService: InvoiceCustomerFacingSnapshotService,
  ) {}

  async finalizeCustomerFacingSend(input: InvoiceSendPipelineInput) {
    const frozenAt = new Date();

    return this.dataSource.transaction(async (manager) => {
      const invoiceRepo = manager.getRepository(InvoiceEntity);
      const lockedInvoice = await invoiceRepo.findOne({
        where: {
          id: input.invoice.id,
          organization_id: input.organizationId,
        },
        relations: {
          line_items: true,
        },
        lock: { mode: "pessimistic_write" },
      });

      if (!lockedInvoice) {
        throw new Error("invoice_not_found");
      }

      const documentNumber = await this.invoiceNumberingService.allocateDocumentNumberIfNeeded(
        manager,
        input.organizationId,
        lockedInvoice,
      );

      const lineItems = lockedInvoice.line_items ?? [];
      const snapshot = this.invoiceCustomerFacingSnapshotService.freezeInvoiceRecord({
        invoice: lockedInvoice,
        lineItems,
        customer: input.customer,
        job: input.job,
        orgSettings: input.orgSettings,
        documentNumber,
        frozenAt,
        frozenVia: input.frozenVia,
        branch: input.branch ?? null,
        organizationId: input.organizationId,
      });

      await invoiceRepo.save(lockedInvoice);

      input.invoice.document_number = lockedInvoice.document_number;
      input.invoice.customer_facing_snapshot_json = lockedInvoice.customer_facing_snapshot_json;
      input.invoice.branding_snapshot_json = lockedInvoice.branding_snapshot_json;

      return {
        documentNumber,
        snapshot,
      };
    });
  }

  /** Allocates the customer-facing number without freezing the invoice. */
  async reserveDocumentNumber(organizationId: string, invoice: InvoiceEntity) {
    return this.dataSource.transaction(async (manager) => {
      const invoiceRepo = manager.getRepository(InvoiceEntity);
      const lockedInvoice = await invoiceRepo.findOne({
        where: {
          id: invoice.id,
          organization_id: organizationId,
        },
        lock: { mode: "pessimistic_write" },
      });

      if (!lockedInvoice) {
        throw new Error("invoice_not_found");
      }

      const documentNumber = await this.invoiceNumberingService.allocateDocumentNumberIfNeeded(
        manager,
        organizationId,
        lockedInvoice,
      );
      await invoiceRepo.save(lockedInvoice);
      invoice.document_number = lockedInvoice.document_number;
      return documentNumber;
    });
  }

  buildUnsavedCustomerSnapshot(input: InvoiceSendPipelineInput & { documentNumber: string }) {
    const existing = this.invoiceCustomerFacingSnapshotService.parseSnapshot(input.invoice.customer_facing_snapshot_json);
    if (existing) {
      return existing;
    }

    const scratch = Object.assign(new InvoiceEntity(), input.invoice, {
      document_number: input.documentNumber,
      customer_facing_snapshot_json: null,
    });

    return this.invoiceCustomerFacingSnapshotService.freezeInvoiceRecord({
      invoice: scratch,
      lineItems: input.invoice.line_items ?? [],
      customer: input.customer,
      job: input.job,
      orgSettings: input.orgSettings,
      documentNumber: input.documentNumber,
      frozenAt: new Date(),
      frozenVia: input.frozenVia,
      branch: input.branch ?? null,
      organizationId: input.organizationId,
    });
  }

  async commitFrozenSnapshot(input: {
    organizationId: string;
    invoice: InvoiceEntity;
    snapshot: InvoiceCustomerFacingSnapshotAny;
  }) {
    const existing = this.invoiceCustomerFacingSnapshotService.parseSnapshot(input.invoice.customer_facing_snapshot_json);
    if (existing) {
      return existing;
    }

    input.invoice.customer_facing_snapshot_json = JSON.stringify(input.snapshot);
    this.invoiceCustomerFacingSnapshotService.applyBrandingSnapshotFromCustomerFacing(input.invoice, input.snapshot);
    await this.dataSource.getRepository(InvoiceEntity).save(input.invoice);
    return input.snapshot;
  }
}
