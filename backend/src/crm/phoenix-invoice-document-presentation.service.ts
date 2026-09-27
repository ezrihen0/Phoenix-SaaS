import { Injectable } from "@nestjs/common";

import type { CustomerEntity } from "../database/entities/customer.entity";
import type { InvoiceEntity } from "../database/entities/invoice.entity";
import type { JobEntity } from "../database/entities/job.entity";
import type { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import { sanitizeInvoiceDescription, sanitizeUserFacingText } from "./user-facing-text";
import { InvoicePaymentLedgerService } from "./invoice-payment-ledger.service";
import { InvoicePdfViewModelService } from "./invoice-pdf-view-model.service";
import type { PhoenixInvoiceDocumentViewModel } from "./phoenix-invoice-document-view-model.types";

@Injectable()
export class PhoenixInvoiceDocumentPresentationService {
  constructor(
    private readonly invoicePdfViewModelService: InvoicePdfViewModelService,
    private readonly invoicePaymentLedgerService: InvoicePaymentLedgerService,
  ) {}

  buildInvoiceDocumentView(input: {
    invoice: InvoiceEntity;
    customer: CustomerEntity | null;
    job: JobEntity | null;
    orgSettings: OrganizationSettingEntity | null;
    dueDays?: number;
  }): PhoenixInvoiceDocumentViewModel {
    const dueDays = input.dueDays ?? input.orgSettings?.default_due_days ?? 30;
    const ledgerSummary = this.invoicePaymentLedgerService.summarizeInvoice({
      totalCents: input.invoice.total_cents || input.invoice.amount_cents,
      legacyStatus: input.invoice.status,
      legacyPaidAt: input.invoice.paid_at,
      payments: input.invoice.payments ?? [],
      voidedAt: input.invoice.voided_at,
      cancelledAt: input.invoice.cancelled_at,
    });

    return this.invoicePdfViewModelService.build({
      invoice: input.invoice,
      customer: input.customer,
      job: input.job,
      orgSettings: input.orgSettings,
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
