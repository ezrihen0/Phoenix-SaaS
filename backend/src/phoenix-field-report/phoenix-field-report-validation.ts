import { apiError } from "../common/api-response";
import {
  PHOENIX_FIELD_REPORT_WORK_DATE_MAX,
  PHOENIX_FIELD_REPORT_WORK_DATE_MIN,
} from "./phoenix-field-report.constants";
import type {
  MichaelReportCompanyParts,
  MichaelReportDraftBody,
  MichaelReportJobPayload,
  MichaelReportPaymentMethodUi,
  MichaelReportProductLine,
} from "./phoenix-field-report.types";

const paymentMethods: MichaelReportPaymentMethodUi[] = [
  "cash",
  "e_transfer",
  "card",
  "cheque",
  "other",
  "not_paid",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${label} is too long.`);
  }

  return trimmed;
}

function optionalString(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${label} is too long.`);
  }

  return trimmed;
}

function requireUuid(value: unknown, label: string) {
  const raw = requireString(value, label, 36);
  if (!/^[0-9a-f-]{36}$/i.test(raw)) {
    throw new Error(`${label} must be a UUID.`);
  }

  return raw;
}

function parseProductLine(value: unknown, index: number): MichaelReportProductLine {
  const row = isRecord(value) ? value : {};
  const description = requireString(row.description, `entries[${index}].productLines.description`, 2000);
  const warrantyEnabled = row.warrantyEnabled === true;
  let warrantyMonths: number | null = null;

  if (warrantyEnabled) {
    const months = row.warrantyMonths;
    if (typeof months !== "number" || !Number.isInteger(months) || months <= 0) {
      throw new Error(`entries[${index}].warrantyMonths must be a positive integer when warranty is enabled.`);
    }

    warrantyMonths = months;
  }

  return { description, warrantyEnabled, warrantyMonths };
}

function parseCompanyParts(value: unknown, index: number): MichaelReportCompanyParts {
  const row = isRecord(value) ? value : {};
  const rawCost = row.costIncludingTaxCents;
  const costIncludingTaxCents =
    rawCost === undefined || rawCost === null
      ? 0
      : typeof rawCost === "number"
        ? rawCost
        : Number(rawCost);

  if (!Number.isInteger(costIncludingTaxCents) || costIncludingTaxCents < 0) {
    throw new Error(`entries[${index}].companyParts.costIncludingTaxCents must be a non-negative integer.`);
  }

  return {
    description: requireString(row.description, `entries[${index}].companyParts.description`, 2000),
    quantity: requireString(row.quantity, `entries[${index}].companyParts.quantity`, 64),
    costIncludingTaxCents,
    partsCostConfirmed: row.partsCostConfirmed === true,
  };
}

export function assertPartsCostConfirmed(payload: MichaelReportJobPayload, index: number) {
  if (payload.companyParts.partsCostConfirmed !== true) {
    throw new Error(
      `Job ${index + 1}: confirm "Parts cost including tax (CAD)" (enter 0 if no parts were used).`,
    );
  }
}

export function assertAllPartsCostsConfirmed(entries: MichaelReportJobPayload[]) {
  entries.forEach((entry, index) => assertPartsCostConfirmed(entry, index));
}

export function assertWorkCompletedDateInWindow(dateOnly: string) {
  if (dateOnly < PHOENIX_FIELD_REPORT_WORK_DATE_MIN || dateOnly > PHOENIX_FIELD_REPORT_WORK_DATE_MAX) {
    throw new Error(
      `Work completion date must be between ${PHOENIX_FIELD_REPORT_WORK_DATE_MIN} and ${PHOENIX_FIELD_REPORT_WORK_DATE_MAX} inclusive.`,
    );
  }
}

export function parseWorkCompletedDate(value: unknown, label: string) {
  const raw = requireString(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`${label} must be YYYY-MM-DD.`);
  }

  assertWorkCompletedDateInWindow(raw);
  return raw;
}

export function parseOptionalPaymentDate(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const raw = requireString(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`${label} must be YYYY-MM-DD.`);
  }

  return raw;
}

export function parseMichaelReportJobPayload(value: unknown, index: number): MichaelReportJobPayload {
  const row = isRecord(value) ? value : {};

  const paymentMethodRaw = requireString(row.paymentMethod, `entries[${index}].paymentMethod`, 32);
  if (!paymentMethods.includes(paymentMethodRaw as MichaelReportPaymentMethodUi)) {
    throw new Error(`entries[${index}].paymentMethod is invalid.`);
  }

  const paymentMethod = paymentMethodRaw as MichaelReportPaymentMethodUi;
  const amountReceivedCents = typeof row.amountReceivedCents === "number" ? row.amountReceivedCents : Number(row.amountReceivedCents);
  if (!Number.isInteger(amountReceivedCents) || amountReceivedCents < 0) {
    throw new Error(`entries[${index}].amountReceivedCents must be a non-negative integer.`);
  }

  const totalChargedCents = typeof row.totalChargedCents === "number" ? row.totalChargedCents : Number(row.totalChargedCents);
  if (!Number.isInteger(totalChargedCents) || totalChargedCents < 0) {
    throw new Error(`entries[${index}].totalChargedCents must be a non-negative integer.`);
  }

  if (amountReceivedCents > totalChargedCents) {
    throw new Error(`entries[${index}].amountReceivedCents cannot exceed totalChargedCents.`);
  }

  const productLinesRaw = row.productLines;
  if (!Array.isArray(productLinesRaw) || productLinesRaw.length === 0) {
    throw new Error(`entries[${index}].productLines must include at least one line.`);
  }

  const paymentDate = parseOptionalPaymentDate(row.paymentDate, `entries[${index}].paymentDate`);
  if (amountReceivedCents > 0 && !paymentDate) {
    throw new Error(`entries[${index}].paymentDate is required when money was received.`);
  }

  if (paymentMethod === "not_paid" && amountReceivedCents > 0) {
    throw new Error(`entries[${index}] cannot be not paid when amount received is greater than zero.`);
  }

  const customerId = row.customerId === undefined || row.customerId === null || row.customerId === ""
    ? null
    : requireUuid(row.customerId, `entries[${index}].customerId`);

  return {
    clientRowKey: requireUuid(row.clientRowKey, `entries[${index}].clientRowKey`),
    workCompletedDate: parseWorkCompletedDate(row.workCompletedDate, `entries[${index}].workCompletedDate`),
    customerName: requireString(row.customerName, `entries[${index}].customerName`, 255),
    serviceAddressLine1: requireString(row.serviceAddressLine1, `entries[${index}].serviceAddressLine1`, 255),
    serviceAddressLine2: optionalString(row.serviceAddressLine2, `entries[${index}].serviceAddressLine2`, 255),
    serviceCity: requireString(row.serviceCity, `entries[${index}].serviceCity`, 120),
    serviceStateOrRegion: requireString(row.serviceStateOrRegion, `entries[${index}].serviceStateOrRegion`, 120),
    servicePostalCode: requireString(row.servicePostalCode, `entries[${index}].servicePostalCode`, 20),
    customerEmail: optionalString(row.customerEmail, `entries[${index}].customerEmail`, 320),
    productLines: productLinesRaw.map((line, lineIndex) => parseProductLine(line, lineIndex)),
    totalChargedCents,
    companyParts: parseCompanyParts(row.companyParts, index),
    customerLeftReview: row.customerLeftReview === true,
    paymentMethod,
    amountReceivedCents,
    paymentDate,
    customerId,
    createNewCustomer: row.createNewCustomer === true,
  };
}

export function parseMichaelReportDraftBody(
  body: unknown,
  options?: { requireReportEmail?: boolean; requirePartsCostConfirmed?: boolean },
) {
  if (!isRecord(body)) {
    apiError(400, "invalid_payload", "Request body must be a JSON object.");
  }

  try {
    const reportRecipientEmail = options?.requireReportEmail
      ? requireString(body.reportRecipientEmail, "reportRecipientEmail", 320)
      : optionalString(body.reportRecipientEmail, "reportRecipientEmail", 320) ?? "";
    const entriesRaw = body.entries;
    if (!Array.isArray(entriesRaw)) {
      throw new Error("entries must be an array.");
    }

    const entries = entriesRaw.map((entry, index) => parseMichaelReportJobPayload(entry, index));
    if (options?.requirePartsCostConfirmed) {
      assertAllPartsCostsConfirmed(entries);
    }

    return {
      reportRecipientEmail,
      entries,
    };
  } catch (error) {
    apiError(400, "invalid_michael_report_payload", error instanceof Error ? error.message : "Invalid payload.");
  }
}

export function dateOnlyToUtcNoon(dateOnly: string) {
  return new Date(`${dateOnly}T12:00:00.000Z`);
}
