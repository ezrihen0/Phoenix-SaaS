type WarrantyEligibleInvoice = {
  paid_at?: string | null;
  balance_cents: number;
  lifecycle_status?: string;
};

/**
 * Matches backend warranty generate gate: ledger.paidAt || ledger.balanceCents <= 0.
 * List API omits paid_at — treat paid/overpaid lifecycle as equivalent.
 */
export function canViewWarrantyCertificate(invoice: WarrantyEligibleInvoice): boolean {
  if (invoice.paid_at) {
    return true;
  }

  if (invoice.balance_cents <= 0) {
    return true;
  }

  if (invoice.lifecycle_status === "paid" || invoice.lifecycle_status === "overpaid") {
    return true;
  }

  return false;
}
