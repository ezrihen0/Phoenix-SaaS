import { Injectable } from "@nestjs/common";

import type { CustomerEntity } from "../database/entities/customer.entity";
import type { InvoiceEntity } from "../database/entities/invoice.entity";
import type { InvoicePaymentEntity } from "../database/entities/invoice-payment.entity";
import type { JobEntity } from "../database/entities/job.entity";
import type { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import type { InvoicePdfBrandingSnapshot } from "./invoice-pdf.service";
import { InvoiceCustomerFacingSnapshotService } from "./invoice-customer-facing-snapshot.service";
import type { InvoiceLedgerSummary } from "./invoice-financial-lifecycle.core";
import { resolveInvoiceDisplayNumber } from "./invoice-display-number";

export type InvoicePdfPaymentRow = {
  occurredAtLabel: string;
  method: string;
  amountLabel: string;
  reference: string | null;
};

export type InvoicePdfViewModel = {
  documentNumber: string;
  lifecycleStatus: string;
  issuedAtLabel: string;
  dueAtLabel: string | null;
  generatedAtIso: string;
  customerName: string;
  customerCompany: string | null;
  customerAddressLines: string[];
  customerEmail: string | null;
  customerPhone: string | null;
  serviceAddressLines: string[];
  jobReferenceLabel: string | null;
  description: string | null;
  lineItems: Array<{
    name: string;
    description?: string | null;
    quantity: string;
    rateLabel: string;
    amountLabel: string;
  }>;
  subtotalLabel: string;
  discountLabel: string | null;
  taxLabel: string;
  taxAmountLabel: string;
  totalLabel: string;
  payments: InvoicePdfPaymentRow[];
  paidLabel: string | null;
  balanceLabel: string | null;
  overpaymentLabel: string | null;
  branding: InvoicePdfBrandingSnapshot;
};

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
  }): InvoicePdfViewModel {
    const frozen = this.invoiceCustomerFacingSnapshotService.parseSnapshot(input.invoice.customer_facing_snapshot_json);
    if (frozen) {
      return this.buildFromSnapshot(frozen, input);
    }

    return this.buildFromLiveRows(input);
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
      payments?: InvoicePaymentEntity[];
    },
  ): InvoicePdfViewModel {
    const taxRateBps = snapshot.financial.tax_rate_bps;
    const taxLabel = taxRateBps > 0 ? `Tax (${(taxRateBps / 100).toFixed(2)}%)` : "Tax";
    const payments = (input.invoice.payments ?? [])
      .slice()
      .sort((left, right) => right.occurred_at.getTime() - left.occurred_at.getTime())
      .filter((payment) => payment.entry_type === "payment" || payment.entry_type === "adjustment")
      .map((payment) => ({
        occurredAtLabel: input.formatDisplayDate(payment.occurred_at),
        method: payment.method,
        amountLabel: input.formatCents(payment.amount_cents),
        reference: payment.reference,
      }));

    return {
      documentNumber: snapshot.document_number,
      lifecycleStatus: input.ledgerSummary.lifecycleStatus,
      issuedAtLabel: input.formatDisplayDate(new Date(snapshot.issued_at)),
      dueAtLabel: snapshot.due_at
        ? input.formatDisplayDate(new Date(snapshot.due_at))
        : input.formatDueDate(null, new Date(snapshot.issued_at), input.dueDays),
      generatedAtIso: new Date().toISOString(),
      customerName: snapshot.bill_to.name,
      customerCompany: snapshot.bill_to.company,
      customerAddressLines: snapshot.bill_to.address_lines,
      customerEmail: snapshot.bill_to.email,
      customerPhone: snapshot.bill_to.phone,
      serviceAddressLines: snapshot.service_location.address_lines,
      jobReferenceLabel: `${snapshot.job_reference.title} (${snapshot.job_reference.service_type ?? "service"})`,
      description: snapshot.description,
      lineItems: snapshot.lines.map((line) => ({
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        rateLabel: input.formatCents(line.unit_price_cents),
        amountLabel: input.formatCents(line.line_subtotal_cents),
      })),
      subtotalLabel: input.formatCents(snapshot.financial.subtotal_cents),
      discountLabel: snapshot.financial.discount_cents > 0 ? input.formatCents(snapshot.financial.discount_cents) : null,
      taxLabel,
      taxAmountLabel: input.formatCents(snapshot.financial.tax_cents),
      totalLabel: input.formatCents(snapshot.financial.total_cents),
      payments,
      paidLabel: input.ledgerSummary.netPaidCents > 0 ? input.formatCents(input.ledgerSummary.netPaidCents) : null,
      balanceLabel: input.ledgerSummary.balanceCents > 0 ? input.formatCents(input.ledgerSummary.balanceCents) : null,
      overpaymentLabel: input.ledgerSummary.overpaymentCents > 0
        ? input.formatCents(input.ledgerSummary.overpaymentCents)
        : null,
      branding: {
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
        companyAddress: snapshot.business.companyAddress,
      },
    };
  }

  private buildFromLiveRows(input: {
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
  }): InvoicePdfViewModel {
    const brandingSnapshot = this.documentBrandingSnapshotService.fromOrganizationSettings(input.orgSettings);
    const branding: InvoicePdfBrandingSnapshot = {
      businessName: brandingSnapshot.businessName,
      displayInitials: brandingSnapshot.displayInitials,
      phone: brandingSnapshot.phone,
      email: brandingSnapshot.email,
      website: brandingSnapshot.website,
      logoUrl: brandingSnapshot.logoUrl,
      accentColor: brandingSnapshot.accentColor,
      paymentInstructions: brandingSnapshot.paymentInstructions,
      businessLicense: brandingSnapshot.businessLicense,
      gstNumber: brandingSnapshot.gstNumber,
      warrantyMessage: brandingSnapshot.warrantyMessage,
      invoicePdfFooter: brandingSnapshot.invoicePdfFooter,
      companyAddress: brandingSnapshot.companyAddress,
    };

    const customerAddressLines = [
      input.customer?.service_address_line_1 ?? null,
      input.customer?.service_address_line_2 ?? null,
      [input.customer?.service_city, input.customer?.service_state_or_region].filter(Boolean).join(", "),
      input.customer?.service_postal_code ?? null,
    ].filter((entry): entry is string => Boolean(entry && entry.trim()));

    const sortedLineItems = [...(input.invoice.line_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const subtotalCents = input.invoice.subtotal_cents || input.invoice.amount_cents;
    const taxRateBps = input.invoice.tax_rate_bps_snapshot ?? 0;
    const taxLabel = taxRateBps > 0 ? `Tax (${(taxRateBps / 100).toFixed(2)}%)` : "Tax";
    const totalCents = input.invoice.total_cents || input.ledgerSummary.totalCents;

    const payments = (input.invoice.payments ?? [])
      .slice()
      .sort((left, right) => right.occurred_at.getTime() - left.occurred_at.getTime())
      .filter((payment) => payment.entry_type === "payment" || payment.entry_type === "adjustment")
      .map((payment) => ({
        occurredAtLabel: input.formatDisplayDate(payment.occurred_at),
        method: payment.method,
        amountLabel: input.formatCents(payment.amount_cents),
        reference: payment.reference,
      }));

    return {
      documentNumber: resolveInvoiceDisplayNumber(input.invoice),
      lifecycleStatus: input.ledgerSummary.lifecycleStatus,
      issuedAtLabel: input.formatDisplayDate(input.invoice.issued_at),
      dueAtLabel: input.formatDueDate(input.invoice.due_at, input.invoice.issued_at, input.dueDays),
      generatedAtIso: new Date().toISOString(),
      customerName: input.customer?.full_name ?? "Customer",
      customerCompany: input.customer?.company_name ?? null,
      customerAddressLines,
      customerEmail: input.customer?.email ?? null,
      customerPhone: input.customer?.phone ?? null,
      serviceAddressLines: customerAddressLines,
      jobReferenceLabel: input.job
        ? `${input.job.title} (${input.job.requested_service_type ?? "service"})`
        : null,
      description: input.sanitizeDescription(input.invoice.description),
      lineItems: sortedLineItems.map((item) => ({
        name: input.sanitizeLineText(item.name_snapshot) || item.name_snapshot || "Item",
        description: input.sanitizeLineText(item.description_snapshot) || item.description_snapshot,
        quantity: String(item.quantity),
        rateLabel: input.formatCents(item.unit_price_cents_snapshot),
        amountLabel: input.formatCents(item.line_subtotal_cents),
      })),
      subtotalLabel: input.formatCents(subtotalCents),
      discountLabel: null,
      taxLabel,
      taxAmountLabel: input.formatCents(input.invoice.tax_cents ?? 0),
      totalLabel: input.formatCents(totalCents),
      payments,
      paidLabel: input.ledgerSummary.netPaidCents > 0 ? input.formatCents(input.ledgerSummary.netPaidCents) : null,
      balanceLabel: input.ledgerSummary.balanceCents > 0 ? input.formatCents(input.ledgerSummary.balanceCents) : null,
      overpaymentLabel: input.ledgerSummary.overpaymentCents > 0
        ? input.formatCents(input.ledgerSummary.overpaymentCents)
        : null,
      branding,
    };
  }
}
