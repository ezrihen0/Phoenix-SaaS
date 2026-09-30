export type InvoicePaymentEntryType = "payment" | "refund" | "adjustment";

export function formatPaymentEntryType(entryType: InvoicePaymentEntryType) {
  switch (entryType) {
    case "payment":
      return "Payment";
    case "refund":
      return "Refund";
    case "adjustment":
      return "Adjustment";
    default:
      return entryType;
  }
}
