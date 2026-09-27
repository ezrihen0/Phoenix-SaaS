import { Injectable } from "@nestjs/common";

import type { CustomerEntity } from "../database/entities/customer.entity";
import type { InvoiceEntity } from "../database/entities/invoice.entity";
import type { JobEntity } from "../database/entities/job.entity";
import type { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import { InvoiceCustomerFacingSnapshotService } from "./invoice-customer-facing-snapshot.service";
import {
  isInvoiceCustomerFacingSnapshotV3,
  snapshotDescription,
} from "./invoice-customer-facing-snapshot.types";
import {
  resolveHistoricalDocumentRenderMode,
  type HistoricalDocumentRenderMode,
} from "./historical-document-render.types";
import type { InvoiceLedgerSummary } from "./invoice-financial-lifecycle.core";
import { resolveInvoiceDisplayNumber } from "./invoice-display-number";
import {
  PHOENIX_INVOICE_DOCUMENT_SECTION_ORDER,
  type PhoenixInvoiceDocumentViewModel,
} from "./phoenix-invoice-document-view-model.types";

@Injectable()
export class InvoicePdfViewModelService {
  constructor(
    private readonly invoiceCustomerFacingSnapshotService: InvoiceCustomerFacingSnapshotService,
    private readonly documentBrandingSnapshotService: DocumentBrandingSnapshotService,
  ) {}

  build(input: {
    invoice: InvoiceEntity;
    customer: CustomerEntity | null;
    job: JobEntity | null;
    orgSettings: OrganizationSettingEntity | null;
    ledgerSummary: InvoiceLedgerSummary;
    dueDays: number;
    formatCents: (cents: number) => string;
    formatDisplayDate: (value: Date) => string;
    formatDueDate: (dueAt: Date | null, issuedAt: Date, dueDays: number) => string | null;
    sanitizeDescription: (value: string) => string;
    sanitizeLineText: (value: string | null | undefined) => string | null;
  }): PhoenixInvoiceDocumentViewModel {
    const frozen = this.invoiceCustomerFacingSnapshotService.parseSnapshot(input.invoice.customer_facing_snapshot_json);
    const renderMode = resolveHistoricalDocumentRenderMode(frozen);
    if (renderMode === "frozen" && frozen) {
      return this.buildFromSnapshot(frozen, input);
    }

    return this.buildFromLiveRows(input, renderMode);
  }

  private buildFromSnapshot(
    snapshot: NonNullable<ReturnType<InvoiceCustomerFacingSnapshotService["parseSnapshot"]>>,
    input: {
      invoice: InvoiceEntity;
      ledgerSummary: InvoiceLedgerSummary;
      dueDays: number;
      formatCents: (cents: number) => string;
      formatDisplayDate: (value: Date) => string;
      formatDueDate: (dueAt: Date | null, issuedAt: Date, dueDays: number) => string | null;
    },
  ): PhoenixInvoiceDocumentViewModel {
    const taxRateBps = snapshot.financial.tax_rate_bps;
    const taxLabel = taxRateBps > 0 ? `Tax (${(taxRateBps / 100).toFixed(2)}%)` : "Tax";
    const copy = isInvoiceCustomerFacingSnapshotV3(snapshot)
      ? snapshot.copy
      : {
          description: snapshot.description,
          customer_notes: null,
          terms_text: snapshot.business.invoicePdfFooter,
          warranty_text: snapshot.business.warrantyMessage,
          payment_instructions: snapshot.business.paymentInstructions,
          footer: snapshot.business.invoicePdfFooter,
        };
    const branchLogo = isInvoiceCustomerFacingSnapshotV3(snapshot) ? snapshot.branch?.logo ?? null : null;

    const documentKind = isInvoiceCustomerFacingSnapshotV3(snapshot) ? snapshot.document_kind : "invoice";

    return this.composeViewModel({
      documentKind: documentKind === "estimate" ? "invoice" : documentKind,
      renderMode: "frozen",
      showDraftBanner: false,
      snapshotFrozen: true,
      businessHeader: {
        business_name: snapshot.business.businessName,
        display_initials: snapshot.business.displayInitials,
        logo_url: branchLogo ?? snapshot.business.logoUrl,
        phone: snapshot.business.phone,
        email: snapshot.business.email,
        website: snapshot.business.website,
        company_address: snapshot.business.companyAddress,
        business_license: snapshot.business.businessLicense,
        gst_number: snapshot.business.gstNumber,
        accent_color: snapshot.business.accentColor,
      },
      documentMeta: {
        document_number: snapshot.document_number,
        lifecycle_status: input.ledgerSummary.lifecycleStatus,
        issued_at: snapshot.issued_at,
        due_at: snapshot.due_at,
        issued_at_label: input.formatDisplayDate(new Date(snapshot.issued_at)),
        due_at_label: snapshot.due_at
          ? input.formatDisplayDate(new Date(snapshot.due_at))
          : input.formatDueDate(null, new Date(snapshot.issued_at), input.dueDays),
      },
      billTo: snapshot.bill_to,
      serviceLocation: snapshot.service_location.address_lines,
      jobReference: {
        title: snapshot.job_reference.title,
        service_type: snapshot.job_reference.service_type,
        label: `${snapshot.job_reference.title} (${snapshot.job_reference.service_type ?? "service"})`,
      },
      description: snapshotDescription(snapshot),
      lineItems: snapshot.lines.map((line) => ({
        id: line.id,
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unit_price_cents: line.unit_price_cents,
        line_subtotal_cents: line.line_subtotal_cents,
        unit_price_label: input.formatCents(line.unit_price_cents),
        line_subtotal_label: input.formatCents(line.line_subtotal_cents),
      })),
      financial: snapshot.financial,
      taxLabel,
      formatCents: input.formatCents,
      ledgerSummary: input.ledgerSummary,
      invoice: input.invoice,
      formatDisplayDate: input.formatDisplayDate,
      copyBlocks: {
        customer_notes: copy.customer_notes,
        warranty_text: copy.warranty_text,
        terms_text: copy.terms_text,
        payment_instructions: copy.payment_instructions,
        footer: copy.footer ?? copy.terms_text,
      },
    });
  }

  private buildFromLiveRows(
    input: {
      invoice: InvoiceEntity;
      customer: CustomerEntity | null;
      job: JobEntity | null;
      orgSettings: OrganizationSettingEntity | null;
      ledgerSummary: InvoiceLedgerSummary;
      dueDays: number;
      formatCents: (cents: number) => string;
      formatDisplayDate: (value: Date) => string;
      formatDueDate: (dueAt: Date | null, issuedAt: Date, dueDays: number) => string | null;
      sanitizeDescription: (value: string) => string;
      sanitizeLineText: (value: string | null | undefined) => string | null;
    },
    renderMode: HistoricalDocumentRenderMode,
  ): PhoenixInvoiceDocumentViewModel {
    const brandingSnapshot = this.documentBrandingSnapshotService.fromOrganizationSettings(input.orgSettings);

    const customerBillToLines = [
      input.customer?.service_address_line_1 ?? null,
      input.customer?.service_address_line_2 ?? null,
      [input.customer?.service_city, input.customer?.service_state_or_region].filter(Boolean).join(", "),
      input.customer?.service_postal_code ?? null,
    ].filter((entry): entry is string => Boolean(entry && entry.trim()));

    const serviceLocationLines = input.job
      ? [
          input.job.service_address_line_1,
          input.job.service_address_line_2,
          [input.job.service_city, input.job.service_state_or_region].filter(Boolean).join(", "),
          input.job.service_postal_code,
        ].filter((entry): entry is string => Boolean(entry && entry.trim()))
      : customerBillToLines;

    const sortedLineItems = [...(input.invoice.line_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const subtotalCents = input.invoice.subtotal_cents || input.invoice.amount_cents;
    const taxRateBps = input.invoice.tax_rate_bps_snapshot ?? 0;
    const taxLabel = taxRateBps > 0 ? `Tax (${(taxRateBps / 100).toFixed(2)}%)` : "Tax";
    const totalCents = input.invoice.total_cents || input.ledgerSummary.totalCents;

    return this.composeViewModel({
      documentKind: "invoice",
      renderMode,
      showDraftBanner: renderMode === "legacy_live",
      snapshotFrozen: false,
      businessHeader: {
        business_name: brandingSnapshot.businessName,
        display_initials: brandingSnapshot.displayInitials,
        logo_url: brandingSnapshot.logoUrl,
        phone: brandingSnapshot.phone,
        email: brandingSnapshot.email,
        website: brandingSnapshot.website,
        company_address: brandingSnapshot.companyAddress,
        business_license: brandingSnapshot.businessLicense,
        gst_number: brandingSnapshot.gstNumber,
        accent_color: brandingSnapshot.accentColor,
      },
      documentMeta: {
        document_number: resolveInvoiceDisplayNumber(input.invoice),
        lifecycle_status: input.ledgerSummary.lifecycleStatus,
        issued_at: input.invoice.issued_at.toISOString(),
        due_at: input.invoice.due_at ? input.invoice.due_at.toISOString() : null,
        issued_at_label: input.formatDisplayDate(input.invoice.issued_at),
        due_at_label: input.formatDueDate(input.invoice.due_at, input.invoice.issued_at, input.dueDays),
      },
      billTo: {
        name: input.customer?.full_name ?? "Customer",
        company: input.customer?.company_name ?? null,
        email: input.customer?.email ?? null,
        phone: input.customer?.phone ?? null,
        address_lines: customerBillToLines,
      },
      serviceLocation: serviceLocationLines,
      jobReference: {
        title: input.job?.title ?? null,
        service_type: input.job?.requested_service_type ?? null,
        label: input.job
          ? `${input.job.title} (${input.job.requested_service_type ?? "service"})`
          : null,
      },
      description: input.sanitizeDescription(input.invoice.description),
      lineItems: sortedLineItems.map((item) => ({
        id: item.id,
        name: input.sanitizeLineText(item.name_snapshot) || item.name_snapshot || "Item",
        description: input.sanitizeLineText(item.description_snapshot) || item.description_snapshot,
        quantity: String(item.quantity),
        unit_price_cents: item.unit_price_cents_snapshot,
        line_subtotal_cents: item.line_subtotal_cents,
        unit_price_label: input.formatCents(item.unit_price_cents_snapshot),
        line_subtotal_label: input.formatCents(item.line_subtotal_cents),
      })),
      financial: {
        subtotal_cents: subtotalCents,
        tax_rate_bps: taxRateBps,
        tax_cents: input.invoice.tax_cents ?? 0,
        total_cents: totalCents,
        discount_cents: 0,
      },
      taxLabel,
      formatCents: input.formatCents,
      ledgerSummary: input.ledgerSummary,
      invoice: input.invoice,
      formatDisplayDate: input.formatDisplayDate,
      copyBlocks: {
        customer_notes: null,
        warranty_text: brandingSnapshot.warrantyMessage,
        terms_text: brandingSnapshot.invoicePdfFooter,
        payment_instructions: brandingSnapshot.paymentInstructions,
        footer: brandingSnapshot.invoicePdfFooter,
      },
    });
  }

  private composeViewModel(input: {
    documentKind: PhoenixInvoiceDocumentViewModel["document_kind"];
    renderMode: PhoenixInvoiceDocumentViewModel["render_mode"];
    showDraftBanner: boolean;
    snapshotFrozen: boolean;
    businessHeader: PhoenixInvoiceDocumentViewModel["business_header"];
    documentMeta: Omit<PhoenixInvoiceDocumentViewModel["document_meta"], "issued_at" | "due_at"> & {
      issued_at: string;
      due_at: string | null;
    };
    billTo: PhoenixInvoiceDocumentViewModel["bill_to"];
    serviceLocation: string[];
    jobReference: PhoenixInvoiceDocumentViewModel["job_reference"];
    description: string | null;
    lineItems: PhoenixInvoiceDocumentViewModel["line_items"];
    financial: {
      subtotal_cents: number;
      tax_rate_bps: number;
      tax_cents: number;
      total_cents: number;
      discount_cents: number;
    };
    taxLabel: string;
    formatCents: (cents: number) => string;
    ledgerSummary: InvoiceLedgerSummary;
    invoice: InvoiceEntity;
    formatDisplayDate: (value: Date) => string;
    copyBlocks: PhoenixInvoiceDocumentViewModel["copy_blocks"];
  }): PhoenixInvoiceDocumentViewModel {
    const payments = (input.invoice.payments ?? [])
      .slice()
      .sort((left, right) => right.occurred_at.getTime() - left.occurred_at.getTime())
      .filter((payment) => payment.entry_type === "payment" || payment.entry_type === "adjustment")
      .map((payment) => ({
        occurred_at: payment.occurred_at.toISOString(),
        occurred_at_label: input.formatDisplayDate(payment.occurred_at),
        method: payment.method,
        amount_cents: payment.amount_cents,
        amount_label: input.formatCents(payment.amount_cents),
        reference: payment.reference,
      }));

    return {
      document_kind: input.documentKind,
      render_mode: input.renderMode,
      show_draft_banner: input.showDraftBanner,
      snapshot_frozen: input.snapshotFrozen,
      section_order: PHOENIX_INVOICE_DOCUMENT_SECTION_ORDER,
      business_header: input.businessHeader,
      document_meta: input.documentMeta,
      bill_to: input.billTo,
      service_location: { address_lines: input.serviceLocation },
      job_reference: input.jobReference,
      description: input.description,
      line_items: input.lineItems,
      financial_summary: {
        subtotal_cents: input.financial.subtotal_cents,
        tax_rate_bps: input.financial.tax_rate_bps,
        tax_cents: input.financial.tax_cents,
        total_cents: input.financial.total_cents,
        discount_cents: input.financial.discount_cents,
        subtotal_label: input.formatCents(input.financial.subtotal_cents),
        tax_label: input.taxLabel,
        tax_amount_label: input.formatCents(input.financial.tax_cents),
        total_label: input.formatCents(input.financial.total_cents),
        discount_label:
          input.financial.discount_cents > 0 ? input.formatCents(input.financial.discount_cents) : null,
      },
      payments_ledger: { payments },
      balance_due: {
        net_paid_cents: input.ledgerSummary.netPaidCents,
        balance_cents: input.ledgerSummary.balanceCents,
        overpayment_cents: input.ledgerSummary.overpaymentCents,
        paid_label:
          input.ledgerSummary.netPaidCents > 0 ? input.formatCents(input.ledgerSummary.netPaidCents) : null,
        balance_label:
          input.ledgerSummary.balanceCents > 0 ? input.formatCents(input.ledgerSummary.balanceCents) : null,
        overpayment_label:
          input.ledgerSummary.overpaymentCents > 0
            ? input.formatCents(input.ledgerSummary.overpaymentCents)
            : null,
      },
      copy_blocks: input.copyBlocks,
      footer: {
        generated_at: new Date().toISOString(),
      },
    };
  }
}
