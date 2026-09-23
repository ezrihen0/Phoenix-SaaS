import { createHash } from "crypto";
import { Injectable } from "@nestjs/common";

import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import type { CustomerEntity } from "../database/entities/customer.entity";
import type { InvoiceEntity } from "../database/entities/invoice.entity";
import type { InvoiceLineItemEntity } from "../database/entities/invoice-line-item.entity";
import type { JobEntity } from "../database/entities/job.entity";
import type { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import {
  INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION,
  type InvoiceCustomerFacingSnapshot,
} from "./invoice-customer-facing-snapshot.types";
import { resolveInvoiceDisplayNumber } from "./invoice-display-number";

export type InvoiceSnapshotFreezeVia = "email" | "sms" | "portal";

@Injectable()
export class InvoiceCustomerFacingSnapshotService {
  constructor(private readonly documentBrandingSnapshotService: DocumentBrandingSnapshotService) {}

  parseSnapshot(raw: string | null | undefined): InvoiceCustomerFacingSnapshot | null {
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as InvoiceCustomerFacingSnapshot;
      if (parsed.schema_version !== INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  hashSnapshot(snapshot: InvoiceCustomerFacingSnapshot) {
    return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  }

  isFrozen(invoice: Pick<InvoiceEntity, "customer_facing_snapshot_json">) {
    return Boolean(this.parseSnapshot(invoice.customer_facing_snapshot_json));
  }

  buildSnapshot(input: {
    invoice: InvoiceEntity;
    lineItems: InvoiceLineItemEntity[];
    customer: CustomerEntity | null;
    job: JobEntity;
    orgSettings: OrganizationSettingEntity | null;
    documentNumber: string;
    frozenAt: Date;
    frozenVia: InvoiceSnapshotFreezeVia;
  }): InvoiceCustomerFacingSnapshot {
    const branding = this.documentBrandingSnapshotService.fromOrganizationSettings(input.orgSettings);
    const billToLines = this.buildAddressLines(input.customer);
    const serviceLines = billToLines;

    const sortedLines = [...input.lineItems].sort((left, right) => left.sort_order - right.sort_order);

    return {
      schema_version: INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION,
      frozen_at: input.frozenAt.toISOString(),
      frozen_via: input.frozenVia,
      invoice_id: input.invoice.id,
      document_number: input.documentNumber,
      issued_at: input.invoice.issued_at.toISOString(),
      due_at: input.invoice.due_at ? input.invoice.due_at.toISOString() : null,
      description: input.invoice.description?.trim() || null,
      business: {
        businessName: branding.businessName,
        displayInitials: branding.displayInitials,
        phone: branding.phone,
        email: branding.email,
        website: branding.website,
        logoUrl: branding.logoUrl,
        accentColor: branding.accentColor,
        paymentInstructions: branding.paymentInstructions,
        businessLicense: branding.businessLicense,
        gstNumber: branding.gstNumber,
        warrantyMessage: branding.warrantyMessage,
        invoicePdfFooter: branding.invoicePdfFooter,
        companyAddress: branding.companyAddress,
      },
      bill_to: {
        name: input.customer?.full_name ?? "Customer",
        company: input.customer?.company_name ?? null,
        email: input.customer?.email ?? null,
        phone: input.customer?.phone ?? null,
        address_lines: billToLines,
      },
      service_location: {
        address_lines: serviceLines,
      },
      job_reference: {
        job_id: input.job.id,
        title: input.job.title,
        service_type: input.job.requested_service_type ?? null,
      },
      financial: {
        subtotal_cents: input.invoice.subtotal_cents || input.invoice.amount_cents,
        tax_rate_bps: input.invoice.tax_rate_bps_snapshot ?? 0,
        tax_cents: input.invoice.tax_cents ?? 0,
        total_cents: input.invoice.total_cents || input.invoice.amount_cents,
        discount_cents: 0,
      },
      lines: sortedLines.map((lineItem) => ({
        id: lineItem.id,
        name: lineItem.name_snapshot,
        description: lineItem.description_snapshot,
        quantity: lineItem.quantity,
        unit_price_cents: lineItem.unit_price_cents_snapshot,
        line_subtotal_cents: lineItem.line_subtotal_cents,
        warranty_months: lineItem.warranty_months_snapshot,
      })),
    };
  }

  applyBrandingSnapshotFromCustomerFacing(invoice: InvoiceEntity, snapshot: InvoiceCustomerFacingSnapshot) {
    invoice.branding_snapshot_json = JSON.stringify({
      businessName: snapshot.business.businessName,
      displayInitials: snapshot.business.displayInitials,
      phone: snapshot.business.phone,
      email: snapshot.business.email,
      website: snapshot.business.website,
      logoUrl: snapshot.business.logoUrl,
      accentColor: snapshot.business.accentColor,
      paymentInstructions: snapshot.business.paymentInstructions,
      businessLicense: snapshot.business.businessLicense,
      gstNumber: snapshot.business.gstNumber,
      warrantyMessage: snapshot.business.warrantyMessage,
      invoicePdfFooter: snapshot.business.invoicePdfFooter,
    });
  }

  freezeInvoiceRecord(input: {
    invoice: InvoiceEntity;
    lineItems: InvoiceLineItemEntity[];
    customer: CustomerEntity | null;
    job: JobEntity;
    orgSettings: OrganizationSettingEntity | null;
    documentNumber: string;
    frozenAt: Date;
    frozenVia: InvoiceSnapshotFreezeVia;
  }) {
    const existing = this.parseSnapshot(input.invoice.customer_facing_snapshot_json);
    if (existing) {
      return existing;
    }

    const snapshot = this.buildSnapshot(input);
    input.invoice.customer_facing_snapshot_json = JSON.stringify(snapshot);
    this.applyBrandingSnapshotFromCustomerFacing(input.invoice, snapshot);
    return snapshot;
  }

  resolveDisplayNumber(invoice: InvoiceEntity) {
    const frozen = this.parseSnapshot(invoice.customer_facing_snapshot_json);
    if (frozen?.document_number) {
      return frozen.document_number;
    }

    return resolveInvoiceDisplayNumber(invoice);
  }

  private buildAddressLines(customer: CustomerEntity | null) {
    if (!customer) {
      return [];
    }

    return [
      customer.service_address_line_1,
      customer.service_address_line_2,
      [customer.service_city, customer.service_state_or_region].filter(Boolean).join(", "),
      customer.service_postal_code,
    ].filter((entry): entry is string => Boolean(entry && entry.trim()));
  }
}
