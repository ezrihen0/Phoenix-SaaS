const FINANCE_ERROR_MESSAGES: Record<string, string> = {
  invoice_customer_snapshot_frozen:
    "This invoice was already sent. Customer-facing amounts and lines cannot be changed.",
  totals_mismatch:
    "The total you entered does not match the line items. Refresh totals or update lines before saving.",
  invoice_already_converted:
    "This estimate was already converted to an invoice with line items.",
  estimate_not_approved:
    "Convert only after the estimate is approved or signed.",
  invoice_payment_manage_forbidden:
    "Your account cannot record payments on this invoice.",
};

export function financeApiErrorMessage(code: string | undefined, fallback: string) {
  if (!code) {
    return fallback;
  }

  return FINANCE_ERROR_MESSAGES[code] ?? fallback;
}
