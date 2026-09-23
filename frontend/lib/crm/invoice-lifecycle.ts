export type InvoiceLifecycleStatus =
  | "sent"
  | "partial"
  | "paid"
  | "refunded"
  | "overpaid"
  | "void"
  | "cancelled";

export function formatInvoiceLifecycleStatus(
  status: InvoiceLifecycleStatus,
  options?: { snapshotFrozen?: boolean },
) {
  if (options?.snapshotFrozen && status === "sent") {
    return "Sent — locked";
  }

  switch (status) {
    case "sent":
      return "Awaiting payment";
    case "partial":
      return "Partially paid";
    case "paid":
      return "Paid in full";
    case "refunded":
      return "Refunded";
    case "overpaid":
      return "Overpaid";
    case "void":
      return "Void";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}
