import type { InvoicePaymentMethod } from "../crm/constants";
import type { PhoenixFieldReportBatchStatus } from "../database/entities/phoenix-field-historical-report-batch.entity";
import type { PhoenixFieldReportEntryStatus } from "../database/entities/phoenix-field-historical-report-entry.entity";

export type MichaelReportPaymentMethodUi =
  | "cash"
  | "e_transfer"
  | "card"
  | "cheque"
  | "other"
  | "not_paid";

export type MichaelReportProductLine = {
  description: string;
  warrantyEnabled: boolean;
  warrantyMonths: number | null;
};

export type MichaelReportCompanyParts = {
  description: string;
  quantity: string;
  /** Company parts spend in CAD cents, tax included (entered value is not tax-adjusted). */
  costIncludingTaxCents: number;
  /** Must be true before preview/submit (0 cost is allowed when no parts were used). */
  partsCostConfirmed: boolean;
};

export type MichaelReportJobPayload = {
  clientRowKey: string;
  workCompletedDate: string;
  customerName: string;
  serviceAddressLine1: string;
  serviceAddressLine2: string | null;
  serviceCity: string;
  serviceStateOrRegion: string;
  servicePostalCode: string;
  customerEmail: string | null;
  productLines: MichaelReportProductLine[];
  totalChargedCents: number;
  companyParts: MichaelReportCompanyParts;
  customerLeftReview: boolean;
  paymentMethod: MichaelReportPaymentMethodUi;
  amountReceivedCents: number;
  paymentDate: string | null;
  customerId: string | null;
  createNewCustomer: boolean;
};

export type MichaelReportDraftBody = {
  reportRecipientEmail: string;
  entries: MichaelReportJobPayload[];
};

export type MichaelReportCustomerCandidate = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
  serviceAddressLine1: string;
  matchReasons: string[];
};

export type MichaelReportPreviewRow = MichaelReportJobPayload & {
  taxRateBps: number | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number;
  saleExcludingTaxCents: number | null;
  saleIncludingTaxCents: number;
  partsCostIncludingTaxCents: number;
  remainingAfterPartsCents: number | null;
  taxError: string | null;
  customerCandidates: MichaelReportCustomerCandidate[];
  customerMatchRequired: boolean;
  possibleDuplicateJob: {
    jobId: string;
    invoiceId: string | null;
    documentNumber: string | null;
    reasons: string[];
  } | null;
  issues: string[];
};

export type MichaelReportImportStatus =
  | "draft"
  | "imported"
  | "import_partial"
  | "import_pending";

export type MichaelReportEmailProviderStatus = "not_sent" | "pending" | "accepted" | "failed";

export type MichaelReportBatchResponse = {
  batchId: string;
  status: PhoenixFieldReportBatchStatus;
  /** Server draft revision time (ISO). Used to avoid restoring stale data over newer edits. */
  draftUpdatedAt: string | null;
  /** Present after submit — reuse for idempotent resubmit on refresh. */
  submissionIdempotencyKey: string | null;
  reportRecipientEmail: string | null;
  importStatus: MichaelReportImportStatus;
  emailProviderStatus: MichaelReportEmailProviderStatus;
  emailDeliveryVerified: boolean;
  emailDeliveryVerifiedAt: string | null;
  /** @deprecated Use emailProviderStatus — means provider accepted, not inbox delivery. */
  emailStatus: "not_sent" | "sent" | "failed";
  emailLastError: string | null;
  orgFeatureClosed: boolean;
  totals: Record<string, unknown> | null;
  pdfAvailable: boolean;
  entries: Array<{
    id: string;
    clientRowKey: string;
    sortOrder: number;
    status: PhoenixFieldReportEntryStatus;
    payload: MichaelReportJobPayload;
    customerId: string | null;
    jobId: string | null;
    invoiceId: string | null;
    paymentId: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  }>;
};

export type MichaelReportSubmitResult = MichaelReportBatchResponse & {
  totals: Record<string, unknown>;
  pdfAvailable: boolean;
};

export function mapUiPaymentMethodToNative(method: MichaelReportPaymentMethodUi): InvoicePaymentMethod | null {
  switch (method) {
    case "cash":
      return "cash";
    case "e_transfer":
      return "bank_transfer";
    case "card":
      return "card_manual";
    case "cheque":
      return "check";
    case "other":
      return "other";
    case "not_paid":
      return null;
    default:
      return null;
  }
}
