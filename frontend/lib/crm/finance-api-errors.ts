const FINANCE_ERROR_MESSAGES: Record<string, string> = {
  invoice_customer_snapshot_frozen:
    "This invoice was already sent. Customer-facing amounts and lines cannot be changed.",
  estimate_customer_snapshot_frozen:
    "This estimate was already sent or approved. Customer-facing amounts and lines cannot be changed.",
  totals_mismatch:
    "The total you entered does not match the line items. Refresh totals or update lines before saving.",
  invoice_already_converted:
    "This estimate was already converted to an invoice with line items.",
  invoice_exists:
    "This job already has an invoice. Open the existing invoice to edit lines or record payment.",
  estimate_not_approved:
    "Convert only after the estimate is approved or signed.",
  invoice_locked:
    "This invoice is locked and cannot be replaced by conversion.",
  invoice_has_payments:
    "This invoice already has payments and cannot be replaced by conversion.",
  invoice_payment_manage_forbidden:
    "Your account cannot record payments on this invoice.",
  invoice_paid_requires_ledger:
    "Record a payment to mark this invoice paid. Paid status requires payment on file.",
  invoice_terminal:
    "This invoice is void or cancelled and cannot accept new payments.",
  invoice_refund_exceeds_net_paid:
    "Refund amount exceeds the net amount paid on this invoice.",
  invoice_view_forbidden: "Your account cannot view this invoice.",
  estimate_view_forbidden: "Your account cannot view this estimate.",
  invoice_list_failed: "The invoice list could not be loaded. Try again in a moment.",
  invoice_not_found: "That invoice could not be found.",
  estimate_not_found: "That estimate could not be found.",
  invoice_send_failed: "The invoice could not be sent. Check the customer email or phone and try again.",
  invoice_payment_failed: "The payment could not be recorded. Check the amount and try again.",
};

export function financeApiErrorMessage(code: string | undefined, fallback: string) {
  if (!code) {
    return fallback;
  }

  return FINANCE_ERROR_MESSAGES[code] ?? fallback;
}

/** Shown in support footnotes when a mapped API code exists. */
export function financeApiErrorSupportRef(code: string | undefined) {
  if (!code || !FINANCE_ERROR_MESSAGES[code]) {
    return null;
  }

  return `Reference: ${code}`;
}
