import type { InvoiceStatus } from "./constants";
import type { FinanceInvoiceOrigin } from "./finance-invoice-origin";
import {
  summarizeInvoiceLedger,
  type InvoiceLedgerSummary,
} from "./invoice-financial-lifecycle.core";
import type { InvoicePaymentEntity } from "../database/entities/invoice-payment.entity";

export function allowsLegacyStatusWithoutLedger(financeOrigin: FinanceInvoiceOrigin) {
  return financeOrigin === "workiz_historical";
}

export function summarizeInvoiceLedgerForInvoice(input: {
  totalCents: number;
  legacyStatus: InvoiceStatus;
  legacyPaidAt: Date | null;
  payments: InvoicePaymentEntity[];
  voidedAt?: Date | null;
  cancelledAt?: Date | null;
  financeOrigin: FinanceInvoiceOrigin;
}) {
  return summarizeInvoiceLedger({
    totalCents: input.totalCents,
    legacyStatus: input.legacyStatus,
    legacyPaidAt: input.legacyPaidAt,
    payments: input.payments,
    voidedAt: input.voidedAt,
    cancelledAt: input.cancelledAt,
    financeOrigin: input.financeOrigin,
  });
}

export function deriveLegacyInvoiceStatusFields(
  ledger: InvoiceLedgerSummary,
): { status: InvoiceStatus; paidAt: Date | null } {
  return {
    status:
      ledger.lifecycleStatus === "paid" || ledger.lifecycleStatus === "overpaid"
        ? "paid"
        : "unpaid",
    paidAt:
      ledger.lifecycleStatus === "paid" || ledger.lifecycleStatus === "overpaid"
        ? ledger.paidAt
        : null,
  };
}

export function resolveNativeUpsertInvoiceStatus(input: {
  requestedStatus: InvoiceStatus;
  totalCents: number;
  existingStatus: InvoiceStatus;
  existingPaidAt: Date | null;
  payments: InvoicePaymentEntity[];
  voidedAt?: Date | null;
  cancelledAt?: Date | null;
  financeOrigin: FinanceInvoiceOrigin;
}): { status: InvoiceStatus; paidAt: Date | null; ledger: InvoiceLedgerSummary } {
  const ledger = summarizeInvoiceLedgerForInvoice({
    totalCents: input.totalCents,
    legacyStatus: input.existingStatus,
    legacyPaidAt: input.existingPaidAt,
    payments: input.payments,
    voidedAt: input.voidedAt,
    cancelledAt: input.cancelledAt,
    financeOrigin: input.financeOrigin,
  });

  if (input.payments.length > 0) {
    return {
      ...deriveLegacyInvoiceStatusFields(ledger),
      ledger,
    };
  }

  if (
    input.requestedStatus === "paid"
    && !allowsLegacyStatusWithoutLedger(input.financeOrigin)
  ) {
    throw new NativeInvoicePaidRequiresLedgerError();
  }

  if (allowsLegacyStatusWithoutLedger(input.financeOrigin) && input.requestedStatus === "paid") {
    return {
      status: "paid",
      paidAt: input.existingPaidAt,
      ledger,
    };
  }

  return {
    status: "unpaid",
    paidAt: null,
    ledger,
  };
}

export class NativeInvoicePaidRequiresLedgerError extends Error {
  readonly code = "invoice_paid_requires_ledger";

  constructor() {
    super("Invoice paid status requires ledger payment evidence.");
    this.name = "NativeInvoicePaidRequiresLedgerError";
  }
}

export function computeGrossPaidBeforeRefundCents(payments: InvoicePaymentEntity[]) {
  return payments.reduce((sum, payment) => {
    if (payment.entry_type === "payment" || payment.entry_type === "adjustment") {
      return sum + payment.amount_cents;
    }

    return sum;
  }, 0);
}

export function computeRefundedCents(payments: InvoicePaymentEntity[]) {
  return payments.reduce((sum, payment) => {
    if (payment.entry_type === "refund") {
      return sum + payment.amount_cents;
    }

    return sum;
  }, 0);
}

export function computeNetPaidCents(payments: InvoicePaymentEntity[]) {
  return computeGrossPaidBeforeRefundCents(payments) - computeRefundedCents(payments);
}

export function assertRefundAmountAllowed(
  payments: InvoicePaymentEntity[],
  refundAmountCents: number,
) {
  const netPaid = computeNetPaidCents(payments);
  if (refundAmountCents > netPaid) {
    throw new RefundExceedsNetPaidError(refundAmountCents, netPaid);
  }
}

export class RefundExceedsNetPaidError extends Error {
  readonly code = "invoice_refund_exceeds_net_paid";

  constructor(
    readonly refundAmountCents: number,
    readonly netPaidCents: number,
  ) {
    super("Refund amount exceeds net paid on this invoice.");
    this.name = "RefundExceedsNetPaidError";
  }
}

export function assertInvoiceAcceptsLedgerEntry(invoice: {
  voided_at?: Date | null;
  cancelled_at?: Date | null;
}) {
  if (invoice.voided_at || invoice.cancelled_at) {
    throw new InvoiceTerminalForPaymentsError();
  }
}

/** Normal cash payments cannot exceed the open balance. Historical overpaid rows can still be summarized. */
export function assertPaymentDoesNotExceedBalance(input: {
  entryType: "payment" | "refund" | "adjustment";
  amountCents: number;
  balanceCents: number;
}) {
  if (input.entryType !== "payment") {
    return;
  }

  if (input.amountCents > input.balanceCents) {
    throw new PaymentExceedsBalanceError(input.amountCents, input.balanceCents);
  }
}

export class PaymentExceedsBalanceError extends Error {
  readonly code = "invoice_payment_exceeds_balance";

  constructor(
    readonly amountCents: number,
    readonly balanceCents: number,
  ) {
    super("Payment amount exceeds the remaining balance.");
    this.name = "PaymentExceedsBalanceError";
  }
}

export function assertInvoiceFinancialsMutable(ledgerEntryCount: number) {
  if (ledgerEntryCount > 0) {
    throw new InvoiceLedgerLocksFinancialsError();
  }
}

export class InvoiceReopenFrozenError extends Error {
  readonly code = "invoice_customer_snapshot_frozen";

  constructor() {
    super("This invoice was already sent to the customer and cannot be reopened.");
    this.name = "InvoiceReopenFrozenError";
  }
}

export function assertInvoiceCanBeReopened(isFrozen: boolean) {
  if (isFrozen) {
    throw new InvoiceReopenFrozenError();
  }
}

export class InvoiceLedgerLocksFinancialsError extends Error {
  readonly code = "invoice_has_ledger_activity";

  constructor() {
    super("This invoice already has recorded payments. Financial lines and totals cannot be changed.");
    this.name = "InvoiceLedgerLocksFinancialsError";
  }
}

export class InvoiceTerminalForPaymentsError extends Error {
  readonly code = "invoice_terminal";

  constructor() {
    super("Payments cannot be recorded on a void or cancelled invoice.");
    this.name = "InvoiceTerminalForPaymentsError";
  }
}
