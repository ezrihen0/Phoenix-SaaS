import { createHash } from "crypto";
import { Injectable } from "@nestjs/common";

import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import type { CustomerEntity } from "../database/entities/customer.entity";
import type { InvoiceEntity } from "../database/entities/invoice.entity";
import type { InvoiceLineItemEntity } from "../database/entities/invoice-line-item.entity";
import type { JobEntity } from "../database/entities/job.entity";
import type { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import type { BranchEntity } from "../database/entities/branch.entity";
import type { QuoteEntity } from "../database/entities/quote.entity";
import type { QuoteLineItemEntity } from "../database/entities/quote-line-item.entity";
import { buildBranchDocumentSnapshot } from "./branch-document-snapshot";
import {
  INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION,
  INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V3,
  isSupportedCustomerFacingSnapshot,
  type CustomerFacingSnapshotCopyBlock,
  type CustomerFacingSnapshotFreezeVia,
  type InvoiceCustomerFacingSnapshot,
  type InvoiceCustomerFacingSnapshotAny,
  type InvoiceCustomerFacingSnapshotV3,
} from "./invoice-customer-facing-snapshot.types";
import { resolveInvoiceDisplayNumber } from "./invoice-display-number";

export type InvoiceSnapshotFreezeVia = Extract<
  CustomerFacingSnapshotFreezeVia,
  "email" | "sms" | "portal"
>;

export type EstimateSnapshotFreezeVia = Extract<
  CustomerFacingSnapshotFreezeVia,
  "sent" | "approved" | "signed"
>;

type DocumentLineSnapshot = {
  id: string;
  name: string;
  description: string | null;
  quantity: string;
  unit_price_cents: number;
  line_subtotal_cents: number;
  warranty_months: number | null;
};

@Injectable()
export class InvoiceCustomerFacingSnapshotService {
  constructor(private readonly documentBrandingSnapshotService: DocumentBrandingSnapshotService) {}

  parseSnapshot(raw: string | null | undefined): InvoiceCustomerFacingSnapshotAny | null {
    if (!raw) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isSupportedCustomerFacingSnapshot(parsed)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  hashSnapshot(snapshot: InvoiceCustomerFacingSnapshotAny) {
    return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  }

  isFrozen(record: Pick<InvoiceEntity, "customer_facing_snapshot_json"> | Pick<QuoteEntity, "customer_facing_snapshot_json">) {
    return Boolean(this.parseSnapshot(record.customer_facing_snapshot_json));
  }

  shouldFreezeEstimate(quote: Pick<QuoteEntity, "status" | "sent_at" | "approved_at" | "signed_at">) {
    return quote.status !== "draft"
      || Boolean(quote.sent_at)
      || Boolean(quote.approved_at)
      || Boolean(quote.signed_at);
  }

  resolveEstimateFreezeVia(
    quote: Pick<QuoteEntity, "signed_at" | "approved_at" | "sent_at" | "status">,
  ): EstimateSnapshotFreezeVia {
    if (quote.signed_at) {
      return "signed";
    }

    if (quote.approved_at) {
      return "approved";
    }

    return "sent";
  }

  buildSnapshotV3(input: {
    documentKind: "invoice" | "estimate";
    documentId: string;
    organizationId: string;
    documentNumber: string;
    description: string | null;
    issuedAt: Date;
    dueAt: Date | null;
    financial: InvoiceCustomerFacingSnapshotV3["financial"];
    lineItems: DocumentLineSnapshot[];
    customer: CustomerEntity | null;
    job: JobEntity;
    orgSettings: OrganizationSettingEntity | null;
    frozenAt: Date;
    frozenVia: CustomerFacingSnapshotFreezeVia;
    branch?: BranchEntity | null;
    signature?: InvoiceCustomerFacingSnapshotV3["signature"];
  }): InvoiceCustomerFacingSnapshotV3 {
    const branding = this.documentBrandingSnapshotService.fromOrganizationSettings(input.orgSettings);
    const copy = this.buildCopyBlock(input.description, branding);

    const snapshot: InvoiceCustomerFacingSnapshotV3 = {
      schema_version: INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V3,
      document_kind: input.documentKind,
      document_id: input.documentId,
      invoice_id: input.documentKind === "invoice" ? input.documentId : undefined,
      estimate_id: input.documentKind === "estimate" ? input.documentId : undefined,
      frozen_at: input.frozenAt.toISOString(),
      frozen_via: input.frozenVia,
      document_number: input.documentNumber,
      issued_at: input.issuedAt.toISOString(),
      due_at: input.dueAt ? input.dueAt.toISOString() : null,
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
        address_lines: this.buildCustomerBillToAddressLines(input.customer),
      },
      service_location: {
        address_lines: this.buildJobServiceAddressLines(input.job),
      },
      job_reference: {
        job_id: input.job.id,
        title: input.job.title,
        service_type: input.job.requested_service_type ?? null,
      },
      financial: input.financial,
      lines: input.lineItems,
      copy,
      provenance: {
        organization_id: input.organizationId,
      },
      signature: input.signature ?? {
        approved_at: null,
        signed_at: null,
        signed_by_name: null,
      },
    };

    if (input.branch) {
      snapshot.branch = buildBranchDocumentSnapshot(input.branch);
    }

    return snapshot;
  }

  /** @deprecated v1 builder retained for contract tests; new freezes use v3 */
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
    const v3 = this.buildSnapshotV3({
      documentKind: "invoice",
      documentId: input.invoice.id,
      organizationId: input.invoice.organization_id ?? "",
      documentNumber: input.documentNumber,
      description: input.invoice.description?.trim() || null,
      issuedAt: input.invoice.issued_at,
      dueAt: input.invoice.due_at,
      financial: {
        subtotal_cents: input.invoice.subtotal_cents || input.invoice.amount_cents,
        tax_rate_bps: input.invoice.tax_rate_bps_snapshot ?? 0,
        tax_cents: input.invoice.tax_cents ?? 0,
        total_cents: input.invoice.total_cents || input.invoice.amount_cents,
        discount_cents: 0,
      },
      lineItems: this.mapInvoiceLines(input.lineItems),
      customer: input.customer,
      job: input.job,
      orgSettings: input.orgSettings,
      frozenAt: input.frozenAt,
      frozenVia: input.frozenVia,
      signature: {
        approved_at: input.invoice.approved_at?.toISOString() ?? null,
        signed_at: input.invoice.signed_at?.toISOString() ?? null,
        signed_by_name: input.invoice.signed_by_name,
      },
    });

    return {
      schema_version: INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION,
      frozen_at: v3.frozen_at,
      frozen_via: input.frozenVia,
      invoice_id: input.invoice.id,
      document_number: v3.document_number,
      issued_at: v3.issued_at,
      due_at: v3.due_at,
      description: v3.copy.description,
      business: v3.business,
      bill_to: v3.bill_to,
      service_location: v3.service_location,
      job_reference: v3.job_reference,
      financial: v3.financial,
      lines: v3.lines,
    };
  }

  applyBrandingSnapshotFromCustomerFacing(
    invoice: InvoiceEntity,
    snapshot: Pick<InvoiceCustomerFacingSnapshotAny, "business">,
  ) {
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
    branch?: BranchEntity | null;
    organizationId: string;
  }) {
    const existing = this.parseSnapshot(input.invoice.customer_facing_snapshot_json);
    if (existing) {
      return existing;
    }

    const snapshot = this.buildSnapshotV3({
      documentKind: "invoice",
      documentId: input.invoice.id,
      organizationId: input.organizationId,
      documentNumber: input.documentNumber,
      description: input.invoice.description?.trim() || null,
      issuedAt: input.invoice.issued_at,
      dueAt: input.invoice.due_at,
      financial: {
        subtotal_cents: input.invoice.subtotal_cents || input.invoice.amount_cents,
        tax_rate_bps: input.invoice.tax_rate_bps_snapshot ?? 0,
        tax_cents: input.invoice.tax_cents ?? 0,
        total_cents: input.invoice.total_cents || input.invoice.amount_cents,
        discount_cents: 0,
      },
      lineItems: this.mapInvoiceLines(input.lineItems),
      customer: input.customer,
      job: input.job,
      orgSettings: input.orgSettings,
      frozenAt: input.frozenAt,
      frozenVia: input.frozenVia,
      branch: input.branch,
      signature: {
        approved_at: input.invoice.approved_at?.toISOString() ?? null,
        signed_at: input.invoice.signed_at?.toISOString() ?? null,
        signed_by_name: input.invoice.signed_by_name,
      },
    });

    input.invoice.customer_facing_snapshot_json = JSON.stringify(snapshot);
    this.applyBrandingSnapshotFromCustomerFacing(input.invoice, snapshot);
    return snapshot;
  }

  freezeEstimateRecord(input: {
    quote: QuoteEntity;
    lineItems: QuoteLineItemEntity[];
    customer: CustomerEntity | null;
    job: JobEntity;
    orgSettings: OrganizationSettingEntity | null;
    frozenAt: Date;
    frozenVia: EstimateSnapshotFreezeVia;
    branch?: BranchEntity | null;
    organizationId: string;
  }) {
    const existing = this.parseSnapshot(input.quote.customer_facing_snapshot_json);
    if (existing) {
      return existing;
    }

    const documentNumber = `EST-${input.quote.id.slice(0, 8).toUpperCase()}`;
    const snapshot = this.buildSnapshotV3({
      documentKind: "estimate",
      documentId: input.quote.id,
      organizationId: input.organizationId,
      documentNumber,
      description: input.quote.description?.trim() || null,
      issuedAt: input.quote.sent_at ?? input.quote.created_at,
      dueAt: null,
      financial: {
        subtotal_cents: input.quote.subtotal_cents || input.quote.price_cents,
        tax_rate_bps: input.quote.tax_rate_bps_snapshot ?? 0,
        tax_cents: input.quote.tax_cents ?? 0,
        total_cents: input.quote.total_cents || input.quote.price_cents,
        discount_cents: 0,
      },
      lineItems: this.mapQuoteLines(input.lineItems),
      customer: input.customer,
      job: input.job,
      orgSettings: input.orgSettings,
      frozenAt: input.frozenAt,
      frozenVia: input.frozenVia,
      branch: input.branch,
      signature: {
        approved_at: input.quote.approved_at?.toISOString() ?? null,
        signed_at: input.quote.signed_at?.toISOString() ?? null,
        signed_by_name: input.quote.signed_by_name,
      },
    });

    input.quote.customer_facing_snapshot_json = JSON.stringify(snapshot);
    return snapshot;
  }

  resolveDisplayNumber(invoice: InvoiceEntity) {
    const frozen = this.parseSnapshot(invoice.customer_facing_snapshot_json);
    if (frozen?.document_number) {
      return frozen.document_number;
    }

    return resolveInvoiceDisplayNumber(invoice);
  }

  private mapInvoiceLines(lineItems: InvoiceLineItemEntity[]): DocumentLineSnapshot[] {
    return [...lineItems]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((lineItem) => ({
        id: lineItem.id,
        name: lineItem.name_snapshot,
        description: lineItem.description_snapshot,
        quantity: lineItem.quantity,
        unit_price_cents: lineItem.unit_price_cents_snapshot,
        line_subtotal_cents: lineItem.line_subtotal_cents,
        warranty_months: lineItem.warranty_months_snapshot,
      }));
  }

  private mapQuoteLines(lineItems: QuoteLineItemEntity[]): DocumentLineSnapshot[] {
    return [...lineItems]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((lineItem) => ({
        id: lineItem.id,
        name: lineItem.name_snapshot,
        description: lineItem.description_snapshot,
        quantity: lineItem.quantity,
        unit_price_cents: lineItem.unit_price_cents_snapshot,
        line_subtotal_cents: lineItem.line_subtotal_cents,
        warranty_months: lineItem.warranty_months_snapshot,
      }));
  }

  private buildCopyBlock(
    description: string | null,
    branding: ReturnType<DocumentBrandingSnapshotService["fromOrganizationSettings"]>,
  ): CustomerFacingSnapshotCopyBlock {
    return {
      description: description?.trim() || null,
      customer_notes: null,
      terms_text: branding.invoicePdfFooter,
      warranty_text: branding.warrantyMessage,
      payment_instructions: branding.paymentInstructions,
      footer: branding.invoicePdfFooter,
    };
  }

  buildCustomerBillToAddressLines(customer: CustomerEntity | null) {
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

  buildJobServiceAddressLines(job: JobEntity) {
    return [
      job.service_address_line_1,
      job.service_address_line_2,
      [job.service_city, job.service_state_or_region].filter(Boolean).join(", "),
      job.service_postal_code,
    ].filter((entry): entry is string => Boolean(entry && entry.trim()));
  }
}
