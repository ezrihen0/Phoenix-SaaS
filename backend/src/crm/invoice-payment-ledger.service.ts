import { Injectable } from "@nestjs/common";

import type { InvoiceStatus } from "./constants";
import { InvoicePaymentEntity } from "../database/entities/invoice-payment.entity";

export type InvoicePaymentLifecycleStatus =
  | "sent"
  | "partial"
  | "paid"
  | "refunded"
  | "overpaid";

export type InvoiceLedgerSummary = {
  totalCents: number;
  grossPaidCents: number;
  refundedCents: number;
  netPaidCents: number;
  balanceCents: number;
  paidAt: Date | null;
  lifecycleStatus: InvoicePaymentLifecycleStatus;
  legacyStatus: InvoiceStatus;
};

@Injectable()
export class InvoicePaymentLedgerService {
  summarizeInvoice(options: {
    totalCents: number;
    legacyStatus: InvoiceStatus;
    legacyPaidAt: Date | null;
    payments: InvoicePaymentEntity[];
  }): InvoiceLedgerSummary {
    const totalCents = Math.max(0, options.totalCents);
    const payments = [...options.payments].sort(
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

    if (payments.length === 0) {
      const legacyPaid = options.legacyStatus === "paid";

      return {
        totalCents,
        grossPaidCents: legacyPaid ? totalCents : 0,
        refundedCents: 0,
        netPaidCents: legacyPaid ? totalCents : 0,
        balanceCents: legacyPaid ? 0 : totalCents,
        paidAt: legacyPaid ? options.legacyPaidAt : null,
        lifecycleStatus: legacyPaid ? "paid" : "sent",
        legacyStatus: options.legacyStatus,
      };
    }

    const paidEntries = payments.filter(
      (payment) => payment.entry_type === "payment" || payment.entry_type === "adjustment",
    );
    const balanceCents = Math.max(0, totalCents - netPaidCents);
    const paidAt = netPaidCents >= totalCents && totalCents > 0
      ? paidEntries[paidEntries.length - 1]?.occurred_at ?? options.legacyPaidAt
      : options.legacyPaidAt;

    return {
      totalCents,
      grossPaidCents,
      refundedCents,
      netPaidCents,
      balanceCents,
      paidAt,
      lifecycleStatus: this.deriveLifecycleStatus({
        totalCents,
        refundedCents,
        netPaidCents,
        balanceCents,
      }),
      legacyStatus: options.legacyStatus,
    };
  }

  private deriveLifecycleStatus(values: {
    totalCents: number;
    refundedCents: number;
    netPaidCents: number;
    balanceCents: number;
  }): InvoicePaymentLifecycleStatus {
    if (values.netPaidCents <= 0) {
      return values.refundedCents > 0 ? "refunded" : "sent";
    }

    if (values.netPaidCents > values.totalCents) {
      return "overpaid";
    }

    if (values.balanceCents === 0) {
      return "paid";
    }

    return "partial";
  }
}