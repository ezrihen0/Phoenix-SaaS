import type { InvoiceStatus } from "./constants";
import type { InvoicePaymentEntity } from "../database/entities/invoice-payment.entity";

export type InvoicePaymentLifecycleStatus =
  | "sent"
  | "partial"
  | "paid"
  | "refunded"
  | "overpaid"
  | "void"
  | "cancelled";

export type InvoicePaidReason =
  | "ledger_full_payment"
  | "legacy_status_migration"
  | "zero_total"
  | null;

export type InvoiceLedgerSummary = {
  totalCents: number;
  grossPaidCents: number;
  refundedCents: number;
  netPaidCents: number;
  balanceCents: number;
  overpaymentCents: number;
  paidAt: Date | null;
  paidReason: InvoicePaidReason;
  lifecycleStatus: InvoicePaymentLifecycleStatus;
  legacyStatus: InvoiceStatus;
};

export type SummarizeInvoiceLedgerInput = {
  totalCents: number;
  legacyStatus: InvoiceStatus;
  legacyPaidAt: Date | null;
  payments: InvoicePaymentEntity[];
  voidedAt?: Date | null;
  cancelledAt?: Date | null;
};

export function summarizeInvoiceLedger(input: SummarizeInvoiceLedgerInput): InvoiceLedgerSummary {
  if (input.voidedAt) {
    return buildTerminalDocumentSummary(input, "void");
  }

  if (input.cancelledAt) {
    return buildTerminalDocumentSummary(input, "cancelled");
  }

  const totalCents = Math.max(0, input.totalCents);
  const payments = [...input.payments].sort(
    (left, right) => left.occurred_at.getTime() - right.occurred_at.getTime(),
  );

  if (payments.length === 0) {
    const legacyPaid = input.legacyStatus === "paid";
    const netPaidCents = legacyPaid ? totalCents : 0;
    const overpaymentCents = 0;

    return {
      totalCents,
      grossPaidCents: legacyPaid ? totalCents : 0,
      refundedCents: 0,
      netPaidCents,
      balanceCents: legacyPaid ? 0 : totalCents,
      overpaymentCents,
      paidAt: legacyPaid ? input.legacyPaidAt : null,
      paidReason: legacyPaid ? "legacy_status_migration" : null,
      lifecycleStatus: legacyPaid ? "paid" : "sent",
      legacyStatus: input.legacyStatus,
    };
  }

  const grossPaidCents = payments.reduce((sum, payment) => {
    if (payment.entry_type === "payment" || payment.entry_type === "adjustment") {
      return sum + payment.amount_cents;
    }

    return sum;
  }, 0);
  const refundedCents = payments.reduce((sum, payment) => {
    if (payment.entry_type === "refund") {
      return sum + payment.amount_cents;
    }

    return sum;
  }, 0);
  const netPaidCents = grossPaidCents - refundedCents;
  const overpaymentCents = Math.max(0, netPaidCents - totalCents);
  const balanceCents = Math.max(0, totalCents - netPaidCents);

  const paidEntries = payments.filter(
    (payment) => payment.entry_type === "payment" || payment.entry_type === "adjustment",
  );

  const lifecycleStatus = deriveLifecycleStatus({
    totalCents,
    refundedCents,
    netPaidCents,
    balanceCents,
    overpaymentCents,
  });

  const paidAt = lifecycleStatus === "paid" || lifecycleStatus === "overpaid"
    ? resolvePaidAt({
      totalCents,
      netPaidCents,
      paidEntries,
      legacyPaidAt: input.legacyPaidAt,
    })
    : null;

  const paidReason = lifecycleStatus === "paid" || lifecycleStatus === "overpaid"
    ? totalCents === 0
      ? "zero_total"
      : "ledger_full_payment"
    : null;

  return {
    totalCents,
    grossPaidCents,
    refundedCents,
    netPaidCents,
    balanceCents,
    overpaymentCents,
    paidAt,
    paidReason,
    lifecycleStatus,
    legacyStatus: input.legacyStatus,
  };
}

function buildTerminalDocumentSummary(
  input: SummarizeInvoiceLedgerInput,
  lifecycleStatus: "void" | "cancelled",
): InvoiceLedgerSummary {
  const totalCents = Math.max(0, input.totalCents);
  const payments = [...input.payments].sort(
    (left, right) => left.occurred_at.getTime() - right.occurred_at.getTime(),
  );
  const grossPaidCents = payments.reduce((sum, payment) => {
    if (payment.entry_type === "payment" || payment.entry_type === "adjustment") {
      return sum + payment.amount_cents;
    }

    return sum;
  }, 0);
  const refundedCents = payments.reduce((sum, payment) => {
    if (payment.entry_type === "refund") {
      return sum + payment.amount_cents;
    }

    return sum;
  }, 0);
  const netPaidCents = grossPaidCents - refundedCents;

  return {
    totalCents,
    grossPaidCents,
    refundedCents,
    netPaidCents,
    balanceCents: 0,
    overpaymentCents: Math.max(0, netPaidCents - totalCents),
    paidAt: null,
    paidReason: null,
    lifecycleStatus,
    legacyStatus: input.legacyStatus,
  };
}

function deriveLifecycleStatus(values: {
  totalCents: number;
  refundedCents: number;
  netPaidCents: number;
  balanceCents: number;
  overpaymentCents: number;
}): InvoicePaymentLifecycleStatus {
  if (values.netPaidCents <= 0) {
    return values.refundedCents > 0 ? "refunded" : "sent";
  }

  if (values.overpaymentCents > 0) {
    return "overpaid";
  }

  if (values.balanceCents === 0) {
    return "paid";
  }

  return "partial";
}

function resolvePaidAt(options: {
  totalCents: number;
  netPaidCents: number;
  paidEntries: InvoicePaymentEntity[];
  legacyPaidAt: Date | null;
}) {
  if (options.totalCents <= 0) {
    return options.paidEntries[options.paidEntries.length - 1]?.occurred_at ?? options.legacyPaidAt;
  }

  let running = 0;
  for (const payment of options.paidEntries) {
    running += payment.amount_cents;
    if (running >= options.totalCents) {
      return payment.occurred_at;
    }
  }

  return options.paidEntries[options.paidEntries.length - 1]?.occurred_at ?? options.legacyPaidAt;
}
