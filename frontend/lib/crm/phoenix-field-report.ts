import { crmApiFetch } from "@/lib/crm/browser-api";

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
  costIncludingTaxCents: number;
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

export type MichaelReportBatchResponse = {
  batchId: string;
  status: string;
  reportRecipientEmail: string | null;
  importStatus: "draft" | "imported" | "import_partial" | "import_pending";
  emailProviderStatus: "not_sent" | "pending" | "accepted" | "failed";
  emailDeliveryVerified: boolean;
  emailDeliveryVerifiedAt: string | null;
  emailStatus: "not_sent" | "sent" | "failed";
  emailLastError: string | null;
  orgFeatureClosed: boolean;
  entries: Array<{
    id: string;
    clientRowKey: string;
    sortOrder: number;
    status: string;
    payload: MichaelReportJobPayload;
    customerId: string | null;
    jobId: string | null;
    invoiceId: string | null;
    paymentId: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  }>;
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
  customerCandidates: Array<{
    id: string;
    fullName: string;
    email: string | null;
    phone: string;
    serviceAddressLine1: string;
    matchReasons: string[];
  }>;
  customerMatchRequired: boolean;
  possibleDuplicateJob: {
    jobId: string;
    invoiceId: string | null;
    documentNumber: string | null;
    reasons: string[];
  } | null;
  issues: string[];
};

export function createEmptyJob(): MichaelReportJobPayload {
  return {
    clientRowKey: crypto.randomUUID(),
    workCompletedDate: "2026-09-11",
    customerName: "",
    serviceAddressLine1: "",
    serviceAddressLine2: null,
    serviceCity: "",
    serviceStateOrRegion: "AB",
    servicePostalCode: "",
    customerEmail: null,
    productLines: [{ description: "", warrantyEnabled: false, warrantyMonths: null }],
    totalChargedCents: 0,
    companyParts: { description: "None", quantity: "0", costIncludingTaxCents: 0, partsCostConfirmed: false },
    customerLeftReview: false,
    paymentMethod: "not_paid",
    amountReceivedCents: 0,
    paymentDate: null,
    customerId: null,
    createNewCustomer: false,
  };
}

export function dollarsToCents(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.round(parsed * 100);
}

export function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2);
}

export async function fetchMichaelReportFeatureStatus() {
  return crmApiFetch<{
    envEnabled: boolean;
    orgFeatureClosed: boolean;
    featureAvailable: boolean;
    isOwner: boolean;
  }>("/api/phoenix-field-report/status");
}

export async function fetchMichaelReportDraft() {
  return crmApiFetch<MichaelReportBatchResponse>("/api/phoenix-field-report/draft");
}

export async function saveMichaelReportDraft(body: MichaelReportDraftBody) {
  return crmApiFetch<MichaelReportBatchResponse>("/api/phoenix-field-report/draft", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function previewMichaelReport(body: MichaelReportDraftBody) {
  return crmApiFetch<{ rows: MichaelReportPreviewRow[] }>("/api/phoenix-field-report/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function submitMichaelReport(body: MichaelReportDraftBody, idempotencyKey: string) {
  return crmApiFetch<MichaelReportBatchResponse & { totals: Record<string, unknown>; pdfAvailable: boolean }>(
    "/api/phoenix-field-report/submit",
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    },
  );
}

export async function retryMichaelReportEmail(batchId: string) {
  return crmApiFetch<MichaelReportBatchResponse>(`/api/phoenix-field-report/batches/${batchId}/retry-email`, {
    method: "POST",
  });
}

export async function retryMichaelReportFailedImports(batchId: string) {
  return crmApiFetch<MichaelReportBatchResponse>(
    `/api/phoenix-field-report/batches/${batchId}/retry-failed-imports`,
    { method: "POST" },
  );
}

export async function verifyMichaelReportEmailDelivery(batchId: string) {
  return crmApiFetch<MichaelReportBatchResponse & { totals: Record<string, unknown>; pdfAvailable: boolean }>(
    `/api/phoenix-field-report/batches/${batchId}/verify-email-delivery`,
    { method: "POST" },
  );
}

export async function closeMichaelReportFeature(batchId: string) {
  return crmApiFetch<MichaelReportBatchResponse & { totals: Record<string, unknown>; pdfAvailable: boolean; orgFeatureClosed: boolean }>(
    `/api/phoenix-field-report/batches/${batchId}/close-feature`,
    { method: "POST" },
  );
}
