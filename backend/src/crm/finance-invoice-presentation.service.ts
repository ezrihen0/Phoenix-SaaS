import { Injectable } from "@nestjs/common";

import type { CustomerEntity } from "../database/entities/customer.entity";
import type { InvoiceEntity } from "../database/entities/invoice.entity";
import type { JobEntity } from "../database/entities/job.entity";
import { classifyFinanceInvoiceOrigin } from "./finance-invoice-origin";
import type { InvoiceLedgerSummary } from "./invoice-financial-lifecycle.core";
import { summarizeInvoiceLedger } from "./invoice-financial-lifecycle.core";
import { InvoiceCustomerFacingSnapshotService } from "./invoice-customer-facing-snapshot.service";
import { InvoicePaymentLedgerService } from "./invoice-payment-ledger.service";
import { resolveInvoiceDisplayNumber } from "./invoice-display-number";

export type FinanceInvoiceListPresentation = {
  document_number: string;
  display_document_number: string;
  finance_origin: ReturnType<typeof classifyFinanceInvoiceOrigin>;
  total_cents: number;
  amount_paid_cents: number;
  refunded_cents: number;
  balance_cents: number;
  overpayment_cents: number;
  lifecycle_status: InvoiceLedgerSummary["lifecycleStatus"];
  snapshot_frozen: boolean;
};

@Injectable()
export class FinanceInvoicePresentationService {
  constructor(
    private readonly invoicePaymentLedgerService: InvoicePaymentLedgerService,
    private readonly invoiceCustomerFacingSnapshotService: InvoiceCustomerFacingSnapshotService,
  ) {}

  summarizeLedger(invoice: InvoiceEntity): InvoiceLedgerSummary {
    return this.invoicePaymentLedgerService.summarizeInvoice({
      totalCents: invoice.total_cents || invoice.amount_cents,
      legacyStatus: invoice.status,
      legacyPaidAt: invoice.paid_at,
      payments: invoice.payments ?? [],
      voidedAt: invoice.voided_at,
      cancelledAt: invoice.cancelled_at,
    });
  }

  buildListPresentation(invoice: InvoiceEntity): FinanceInvoiceListPresentation {
    const ledgerSummary = this.summarizeLedger(invoice);
    const displayDocumentNumber = this.invoiceCustomerFacingSnapshotService.resolveDisplayNumber(invoice);

    return {
      document_number: displayDocumentNumber,
      display_document_number: displayDocumentNumber,
      finance_origin: classifyFinanceInvoiceOrigin(invoice),
      total_cents: ledgerSummary.totalCents,
      amount_paid_cents: ledgerSummary.netPaidCents,
      refunded_cents: ledgerSummary.refundedCents,
      balance_cents: ledgerSummary.balanceCents,
      overpayment_cents: ledgerSummary.overpaymentCents,
      lifecycle_status: ledgerSummary.lifecycleStatus,
      snapshot_frozen: this.invoiceCustomerFacingSnapshotService.isFrozen(invoice),
    };
  }

  summarizeCustomerOpenFinance(invoices: InvoiceEntity[]) {
    let openBalanceCents = 0;
    let openInvoiceCount = 0;

    for (const invoice of invoices) {
      const ledger = this.summarizeLedger(invoice);
      const isOpen =
        ledger.lifecycleStatus === "sent"
        || ledger.lifecycleStatus === "partial"
        || ledger.lifecycleStatus === "refunded";

      if (isOpen && ledger.balanceCents > 0) {
        openInvoiceCount += 1;
        openBalanceCents += ledger.balanceCents;
      }
    }

    return { open_balance_cents: openBalanceCents, open_invoice_count: openInvoiceCount };
  }

  buildListItem(
    invoice: InvoiceEntity,
    job: JobEntity | null,
    customer: CustomerEntity | null,
    jobTitle: string,
  ) {
    const presentation = this.buildListPresentation(invoice);

    return {
      id: invoice.id,
      job_id: invoice.job_id,
      document_number: presentation.document_number,
      display_document_number: presentation.display_document_number,
      finance_origin: presentation.finance_origin,
      total_cents: presentation.total_cents,
      amount_paid_cents: presentation.amount_paid_cents,
      refunded_cents: presentation.refunded_cents,
      balance_cents: presentation.balance_cents,
      overpayment_cents: presentation.overpayment_cents,
      lifecycle_status: presentation.lifecycle_status,
      snapshot_frozen: presentation.snapshot_frozen,
      status: invoice.status,
      issued_at: invoice.issued_at?.toISOString() ?? invoice.created_at.toISOString(),
      customer_id: job?.customer_id ?? customer?.id ?? null,
      customer_name: customer?.full_name ?? "Customer pending",
      job_title: jobTitle,
      source_estimate_id: invoice.source_quote_id,
    };
  }
}

/** Pure helper for scripts/tests without Nest DI */
export function summarizeCustomerOpenFinanceFromRows(
  invoices: Array<Pick<InvoiceEntity, "total_cents" | "amount_cents" | "status" | "paid_at" | "voided_at" | "cancelled_at"> & {
    payments?: InvoiceEntity["payments"];
  }>,
) {
  let openBalanceCents = 0;
  let openInvoiceCount = 0;

  for (const invoice of invoices) {
    const ledger = summarizeInvoiceLedger({
      totalCents: invoice.total_cents || invoice.amount_cents,
      legacyStatus: invoice.status,
      legacyPaidAt: invoice.paid_at,
      payments: invoice.payments ?? [],
      voidedAt: invoice.voided_at,
      cancelledAt: invoice.cancelled_at,
    });

    const isOpen =
      ledger.lifecycleStatus === "sent"
      || ledger.lifecycleStatus === "partial"
      || ledger.lifecycleStatus === "refunded";

    if (isOpen && ledger.balanceCents > 0) {
      openInvoiceCount += 1;
      openBalanceCents += ledger.balanceCents;
    }
  }

  return { open_balance_cents: openBalanceCents, open_invoice_count: openInvoiceCount };
}
