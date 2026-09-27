export type EstimateLifecycleStatus =
  | "draft"
  | "sent"
  | "approved"
  | "void"
  | "converted";

export type EstimatePersistedStatus = "draft" | "sent" | "approved" | "rejected";

export function formatEstimateLifecycleStatus(status: EstimateLifecycleStatus) {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "approved":
      return "Approved";
    case "void":
      return "Voided";
    case "converted":
      return "Converted to invoice";
    default:
      return status;
  }
}

export function formatEstimatePersistedStatus(status: EstimatePersistedStatus) {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}
