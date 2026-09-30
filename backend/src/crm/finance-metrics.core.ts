import type { InvoicePaymentLifecycleStatus } from "./invoice-financial-lifecycle.core";

const COLLECTIBLE_OPEN_LIFECYCLES = new Set<InvoicePaymentLifecycleStatus>([
  "sent",
  "partial",
  "refunded",
]);

export function isCollectibleOpenInvoice(
  lifecycleStatus: InvoicePaymentLifecycleStatus,
  balanceCents: number,
) {
  return balanceCents > 0 && COLLECTIBLE_OPEN_LIFECYCLES.has(lifecycleStatus);
}

/** Cash received minus refunds. Adjustments are write-offs, not cash. */
export function cashCollectedCentsFromPayments(
  payments: Array<{ entry_type: string; amount_cents: number }>,
) {
  return payments.reduce((sum, payment) => {
    if (payment.entry_type === "payment") {
      return sum + payment.amount_cents;
    }

    if (payment.entry_type === "refund") {
      return sum - payment.amount_cents;
    }

    return sum;
  }, 0);
}
