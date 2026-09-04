import { normalizeName } from "./workiz-customer-csv-parser";
import { normalizeEmail } from "./workiz-invoice-parser";
import type { CustomerCrossCheckResult, PhoenixInvoiceRecord } from "./workiz-invoice-pdf-matcher";
import type { WorkizPdfNormalizedInvoice } from "./workiz-invoice-pdf-normalizer";

/** @deprecated Use ConflictResolution for new code */
export type CustomerConflictReview =
  | "no_conflict"
  | "cosmetic_allowed"
  | "historical_data_difference"
  | "material_excluded";

export type ConflictResolution =
  | "no_conflict"
  | "HISTORICAL_DATA_DIFFERENCE"
  | "TRUE_IDENTITY_CONFLICT"
  | "UNRESOLVED";

export type HistoricalConflictReview = {
  resolution: ConflictResolution;
  review: CustomerConflictReview;
  reason: string;
  conflictFields: string[];
};

function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function isMaterialNameConflict(pdfName: string | null | undefined, wfName: string | null | undefined): boolean {
  const pdf = normalizeName(pdfName ?? "");
  const wf = normalizeName(wfName ?? "");
  if (!pdf || !wf) return false;
  if (pdf === wf) return false;
  if (pdf.includes(wf) || wf.includes(pdf)) return false;

  const pdfFirst = pdf.split(" ")[0] ?? "";
  const wfFirst = wf.split(" ")[0] ?? "";
  if (pdfFirst.length >= 2 && pdfFirst === wfFirst) return false;

  return true;
}

function financialEvidenceConsistent(
  normalized: WorkizPdfNormalizedInvoice,
  matchedInvoice: PhoenixInvoiceRecord,
): { consistent: boolean; reason: string } {
  const pdfTotal = normalized.financials.total_cents;
  if (pdfTotal == null) {
    return { consistent: true, reason: "PDF total unavailable; invoice code match accepted" };
  }

  const totalDelta = Math.abs(matchedInvoice.totalCents - pdfTotal);
  if (totalDelta > 2) {
    return {
      consistent: false,
      reason: `Total mismatch: PDF ${pdfTotal} cents vs DB ${matchedInvoice.totalCents} cents`,
    };
  }

  return { consistent: true, reason: "Invoice code and total align" };
}

export function reviewHistoricalCustomerConflict(input: {
  customerCheck: CustomerCrossCheckResult | null;
  normalized: WorkizPdfNormalizedInvoice;
  matchedInvoice: PhoenixInvoiceRecord;
  exactInvoiceCodeMatch: boolean;
}): HistoricalConflictReview {
  const { customerCheck, normalized, matchedInvoice, exactInvoiceCodeMatch } = input;
  const conflictFields = customerCheck?.conflictFields ?? [];

  if (!exactInvoiceCodeMatch) {
    return {
      resolution: "UNRESOLVED",
      review: "material_excluded",
      reason: "Invoice code does not exactly match Phoenix Workiz invoice",
      conflictFields,
    };
  }

  const financialCheck = financialEvidenceConsistent(normalized, matchedInvoice);
  if (!financialCheck.consistent) {
    return {
      resolution: "TRUE_IDENTITY_CONFLICT",
      review: "material_excluded",
      reason: financialCheck.reason,
      conflictFields,
    };
  }

  if (!customerCheck || customerCheck.outcome === "CUSTOMER_MATCH") {
    return {
      resolution: "no_conflict",
      review: "no_conflict",
      reason: "Customer fields align",
      conflictFields: [],
    };
  }

  if (customerCheck.outcome === "INSUFFICIENT_DATA") {
    return {
      resolution: "HISTORICAL_DATA_DIFFERENCE",
      review: "historical_data_difference",
      reason: "Exact invoice match with consistent financials; insufficient customer cross-check data treated as historical snapshot",
      conflictFields,
    };
  }

  const nameField = customerCheck.fields.find((field) => field.field === "name");
  const phoneField = customerCheck.fields.find((field) => field.field === "phone");
  const emailField = customerCheck.fields.find((field) => field.field === "email");

  const pdfEmail = normalizeEmail(emailField?.pdfValue);
  const wfEmail = normalizeEmail(emailField?.wizfieldValue);
  const emailMatchesExactly = Boolean(pdfEmail && wfEmail && pdfEmail === wfEmail);

  if (
    isMaterialNameConflict(nameField?.pdfValue, nameField?.wizfieldValue)
    && !emailMatchesExactly
  ) {
    return {
      resolution: "TRUE_IDENTITY_CONFLICT",
      review: "material_excluded",
      reason: `Material name conflict: PDF "${nameField?.pdfValue ?? "?"}" vs Customer Master "${nameField?.wizfieldValue ?? "?"}"`,
      conflictFields,
    };
  }

  const phoneConflict = Boolean(phoneField?.conflict);
  const emailConflict = Boolean(emailField?.conflict);

  if (phoneConflict && emailConflict) {
    const pdfPhone = phoneDigits(phoneField?.pdfValue);
    const wfPhone = phoneDigits(phoneField?.wizfieldValue);
    if (pdfEmail && wfEmail && pdfPhone.length >= 10 && wfPhone.length >= 10) {
      return {
        resolution: "TRUE_IDENTITY_CONFLICT",
        review: "material_excluded",
        reason: "Both phone and email differ materially between PDF and Customer Master",
        conflictFields,
      };
    }
  }

  if (conflictFields.length > 0) {
    const fieldsLabel = conflictFields.join(", ");
    return {
      resolution: "HISTORICAL_DATA_DIFFERENCE",
      review: "historical_data_difference",
      reason: `Exact invoice match; ${fieldsLabel} difference preserved as historical transaction snapshot (Customer Master unchanged)`,
      conflictFields,
    };
  }

  return {
    resolution: "no_conflict",
    review: "no_conflict",
    reason: "Customer fields align",
    conflictFields: [],
  };
}

/** Backward-compatible wrapper */
export function reviewCustomerConflict(customerCheck: CustomerCrossCheckResult | null): {
  review: CustomerConflictReview;
  reason: string;
} {
  if (!customerCheck || customerCheck.outcome === "CUSTOMER_MATCH") {
    return { review: "no_conflict", reason: "Customer fields align" };
  }
  if (customerCheck.outcome === "INSUFFICIENT_DATA") {
    return {
      review: "historical_data_difference",
      reason: "Insufficient customer data; treat as historical snapshot when invoice code matches",
    };
  }

  const nameField = customerCheck.fields.find((field) => field.field === "name");
  const phoneField = customerCheck.fields.find((field) => field.field === "phone");
  const emailField = customerCheck.fields.find((field) => field.field === "email");

  if (isMaterialNameConflict(nameField?.pdfValue, nameField?.wizfieldValue)) {
    return {
      review: "material_excluded",
      reason: `Material name conflict: PDF "${nameField?.pdfValue ?? "?"}" vs "${nameField?.wizfieldValue ?? "?"}"`,
    };
  }

  if (phoneField?.conflict && emailField?.conflict) {
    return {
      review: "material_excluded",
      reason: "Material conflict on phone and email",
    };
  }

  if (customerCheck.conflictFields.length > 0) {
    return {
      review: "historical_data_difference",
      reason: `Historical transaction difference on ${customerCheck.conflictFields.join(", ")}`,
    };
  }

  return { review: "no_conflict", reason: "Customer fields align" };
}

export function customerIdentityMatches(customerCheck: CustomerCrossCheckResult | null): boolean {
  if (!customerCheck) return false;
  const phoneField = customerCheck.fields.find((field) => field.field === "phone");
  const emailField = customerCheck.fields.find((field) => field.field === "email");
  const nameField = customerCheck.fields.find((field) => field.field === "name");

  const phoneOk = !phoneField?.pdfValue || !phoneField.wizfieldValue
    || phoneDigits(phoneField.pdfValue) === phoneDigits(phoneField.wizfieldValue);
  const emailOk = !emailField?.pdfValue || !emailField.wizfieldValue
    || normalizeEmail(emailField.pdfValue) === normalizeEmail(emailField.wizfieldValue);
  const nameOk = !nameField?.pdfValue || !nameField.wizfieldValue
    || normalizeName(nameField.pdfValue) === normalizeName(nameField.wizfieldValue);

  return phoneOk && emailOk && nameOk;
}
