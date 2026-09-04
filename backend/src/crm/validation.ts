import { jobStatuses, jobTypes, leadDispositions, leadDispositionReasons, leadStatuses } from "./constants";
import type {
  InvoicePaymentEntryType,
  InvoicePaymentMethod,
  InvoiceStatus,
  JobStatus,
  JobType,
  LeadDisposition,
  LeadDispositionReason,
  LeadSource,
  LeadStatus,
  QuoteStatus,
  ServiceType,
} from "./constants";

type RecordValue = Record<string, unknown>;

export type CreateLeadPayload = {
  fullName: string;
  phone: string;
  email: string | null;
  serviceAddressLine1: string;
  serviceAddressLine2: string | null;
  serviceCity: string;
  serviceStateOrRegion: string | null;
  servicePostalCode: string;
  source: LeadSource;
  serviceType: ServiceType;
  description: string | null;
};

export type UpdateLeadPayload = {
  fullName?: string;
  phone?: string;
  email?: string | null;
  serviceAddressLine1?: string;
  serviceAddressLine2?: string | null;
  serviceCity?: string;
  serviceStateOrRegion?: string | null;
  servicePostalCode?: string;
  source?: LeadSource;
  serviceType?: ServiceType;
  description?: string | null;
  status?: LeadStatus;
};

export type LeadDispositionPayload = {
  disposition: LeadDisposition;
  dispositionReason: LeadDispositionReason;
  dispositionNote: string | null;
};

export type CreateCustomerPayload = {
  fullName: string;
  phone: string;
  email: string | null;
  companyName: string | null;
  serviceAddressLine1: string;
  serviceAddressLine2: string | null;
  serviceCity: string;
  serviceStateOrRegion: string | null;
  servicePostalCode: string;
  notes: string | null;
};

export type UpdateCustomerPayload = {
  fullName?: string;
  phone?: string;
  email?: string | null;
  companyName?: string | null;
  serviceAddressLine1?: string;
  serviceAddressLine2?: string | null;
  serviceCity?: string;
  serviceStateOrRegion?: string | null;
  servicePostalCode?: string;
  notes?: string | null;
  preferredServiceType?: ServiceType | null;
};

export type ConvertLeadPayload = {
  title: string;
  description: string | null;
  assignedTechnicianId: string | null;
  serviceId: string | null;
  scheduledFor: string | null;
  scheduledWindow: string | null;
  jobType: JobType | null;
};

export type CreateJobPayload = {
  customerId: string | null;
  leadId: string | null;
  jobType: JobType;
  serviceType: ServiceType;
  serviceId: string | null;
  serviceAddressLine1: string;
  serviceAddressLine2: string | null;
  serviceCity: string;
  serviceStateOrRegion: string | null;
  servicePostalCode: string;
  scheduledFor: string | null;
  scheduledWindow: string | null;
  assignedTechnicianId: string | null;
  customerConcern: string | null;
  internalNotes: string | null;
};

export type UpdateJobPayload = {
  title?: string;
  description?: string | null;
  assignedTechnicianId?: string | null;
  serviceId?: string | null;
  scheduledFor?: string | null;
  scheduledWindow?: string | null;
  jobType?: JobType;
};

export type JobStatusPayload = {
  status: JobStatus;
  note: string | null;
};

export type CreateJobNotePayload = {
  findings: string | null;
  recommendations: string | null;
  photoUrls: string[];
};

export type PricebookItemDocumentLineInput = {
  kind: "pricebook_item";
  documentLineKey: string;
  pricebookItemId: string;
  quantity: string;
  sortOrder: number;
  unitPriceCentsOverride?: number;
  nameOverride?: string | null;
  descriptionOverride?: string | null;
  nameTranslationRecordId?: string | null;
  descriptionTranslationRecordId?: string | null;
  warrantyMonthsOverride?: number | null;
  pricebookBundleId?: string | null;
  bundleRequirementId?: string | null;
  catalogUnitPriceCentsSnapshot?: number | null;
};

export type PricebookBundleDocumentLineInput = {
  kind: "pricebook_bundle";
  pricebookBundleId: string;
  sortOrder: number;
  quantityMultiplier?: string;
};

export type ManualDocumentLineInput = {
  kind: "manual";
  documentLineKey: string;
  name: string;
  quantity: string;
  unitPriceCents: number;
  sortOrder: number;
  description?: string | null;
  nameTranslationRecordId?: string | null;
  descriptionTranslationRecordId?: string | null;
};

export type DocumentLineItemInput =
  | PricebookItemDocumentLineInput
  | PricebookBundleDocumentLineInput
  | ManualDocumentLineInput;

export type UpsertQuotePayload = {
  description: string;
  priceCents: number;
  status: QuoteStatus;
  lineItems?: DocumentLineItemInput[];
  taxRateBps?: number;
};

export type UpsertInvoicePayload = {
  description: string | null;
  amountCents: number;
  status: InvoiceStatus;
  lineItems?: DocumentLineItemInput[];
  taxRateBps?: number;
};

export type RecordInvoicePaymentPayload = {
  idempotencyKey: string;
  entryType: InvoicePaymentEntryType;
  amountCents: number;
  method: InvoicePaymentMethod;
  reference: string | null;
  note: string | null;
  occurredAt: string | null;
};

export type SignDocumentPayload = {
  signedByName: string;
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string) {
  if (!isRecord(value)) {
    throw new Error(`${label} payload must be a JSON object.`);
  }

  return value;
}

function requireTrimmedString(
  value: unknown,
  fieldName: string,
  maxLength = 255,
) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error(`${fieldName} is required.`);
  }

  if (trimmedValue.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or less.`);
  }

  return trimmedValue;
}

function optionalTrimmedString(
  value: unknown,
  fieldName: string,
  maxLength = 255,
) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requireTrimmedString(value, fieldName, maxLength);
}

function requireEmail(value: unknown, fieldName: string) {
  const email = requireTrimmedString(value, fieldName, 320).toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    throw new Error(`${fieldName} must be a valid email address.`);
  }

  return email;
}

function optionalEmail(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requireEmail(value, fieldName);
}

function requireNonNegativeInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }

  return value;
}

function optionalNonNegativeInteger(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return requireNonNegativeInteger(value, fieldName);
}

function optionalNullableNonNegativeInteger(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return requireNonNegativeInteger(value, fieldName);
}

function normalizePositiveDecimalString(rawValue: string, fieldName: string) {
  if (!/^\d+(\.\d{1,3})?$/.test(rawValue)) {
    throw new Error(`${fieldName} must be a positive decimal with up to three decimal places.`);
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }

  return parsedValue.toFixed(3).replace(/\.000$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function requirePositiveDecimalString(value: unknown, fieldName: string) {
  if (typeof value === "number") {
    return normalizePositiveDecimalString(String(value), fieldName);
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or number.`);
  }

  return normalizePositiveDecimalString(value.trim(), fieldName);
}

function optionalPositiveDecimalString(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return requirePositiveDecimalString(value, fieldName);
}

function requireEnumValue<T extends readonly string[]>(
  value: unknown,
  fieldName: string,
  allowedValues: T,
): T[number] {
  if (typeof value !== "string" || !allowedValues.includes(value)) {
    throw new Error(`${fieldName} must be one of: ${allowedValues.join(", ")}.`);
  }

  return value;
}

function optionalEnumValue<T extends readonly string[]>(
  value: unknown,
  fieldName: string,
  allowedValues: T,
) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return requireEnumValue(value, fieldName, allowedValues);
}

function requireUuid(value: unknown, fieldName: string) {
  const parsedValue = requireTrimmedString(value, fieldName, 64);
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(parsedValue)) {
    throw new Error(`${fieldName} must be a valid UUID.`);
  }

  return parsedValue;
}

function optionalUuid(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requireUuid(value, fieldName);
}

function optionalIsoDateTime(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsedValue = requireTrimmedString(value, fieldName, 64);
  const date = new Date(parsedValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO datetime string.`);
  }

  return date.toISOString();
}

function requireIsoDateTime(value: unknown, fieldName: string) {
  const parsedValue = requireTrimmedString(value, fieldName, 64);
  const date = new Date(parsedValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO datetime string.`);
  }

  return date.toISOString();
}

function optionalStringArray(value: unknown, fieldName: string, maxItems = 12) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }

  if (value.length > maxItems) {
    throw new Error(`${fieldName} must include ${maxItems} items or fewer.`);
  }

  return value.map((item, index) =>
    requireTrimmedString(item, `${fieldName}[${index}]`, 500),
  );
}

const leadSources = [
  "phone",
  "website",
  "google",
  "facebook",
  "referral",
  "repeat_customer",
  "other",
] as const;

const serviceTypes = ["inspection", "cleaning", "repair", "rebuild"] as const;
const operationalJobTypes = jobTypes;
const quoteStatuses = ["draft", "sent", "approved", "rejected"] as const;
const invoiceStatuses = ["unpaid", "paid"] as const;
const invoicePaymentEntryTypes = ["payment", "refund", "adjustment"] as const;
const invoicePaymentMethods = ["cash", "check", "card_manual", "bank_transfer", "other"] as const;
const documentLineItemKinds = ["pricebook_item", "pricebook_bundle", "manual"] as const;

export function parseCreateLeadPayload(jsonBody: unknown): CreateLeadPayload {
  const payload = requireRecord(jsonBody, "Lead");

  return {
    fullName: requireTrimmedString(payload.fullName, "fullName"),
    phone: requireTrimmedString(payload.phone, "phone", 32),
    email: optionalEmail(payload.email, "email"),
    serviceAddressLine1: requireTrimmedString(
      payload.serviceAddressLine1,
      "serviceAddressLine1",
    ),
    serviceAddressLine2: optionalTrimmedString(
      payload.serviceAddressLine2,
      "serviceAddressLine2",
    ),
    serviceCity: requireTrimmedString(payload.serviceCity, "serviceCity", 120),
    serviceStateOrRegion: optionalTrimmedString(
      payload.serviceStateOrRegion,
      "serviceStateOrRegion",
      120,
    ),
    servicePostalCode: requireTrimmedString(
      payload.servicePostalCode,
      "servicePostalCode",
      20,
    ),
    source: requireEnumValue(payload.source ?? "website", "source", leadSources),
    serviceType: requireEnumValue(payload.serviceType, "serviceType", serviceTypes),
    description: optionalTrimmedString(payload.description, "description", 3000),
  };
}

export function parseUpdateLeadPayload(jsonBody: unknown): UpdateLeadPayload {
  const payload = requireRecord(jsonBody, "Lead update");

  return {
    fullName:
      payload.fullName === undefined
        ? undefined
        : requireTrimmedString(payload.fullName, "fullName"),
    phone:
      payload.phone === undefined
        ? undefined
        : requireTrimmedString(payload.phone, "phone", 32),
    email:
      payload.email === undefined
        ? undefined
        : optionalEmail(payload.email, "email"),
    serviceAddressLine1:
      payload.serviceAddressLine1 === undefined
        ? undefined
        : requireTrimmedString(payload.serviceAddressLine1, "serviceAddressLine1"),
    serviceAddressLine2:
      payload.serviceAddressLine2 === undefined
        ? undefined
        : optionalTrimmedString(payload.serviceAddressLine2, "serviceAddressLine2"),
    serviceCity:
      payload.serviceCity === undefined
        ? undefined
        : requireTrimmedString(payload.serviceCity, "serviceCity", 120),
    serviceStateOrRegion:
      payload.serviceStateOrRegion === undefined
        ? undefined
        : optionalTrimmedString(
            payload.serviceStateOrRegion,
            "serviceStateOrRegion",
            120,
          ),
    servicePostalCode:
      payload.servicePostalCode === undefined
        ? undefined
        : requireTrimmedString(payload.servicePostalCode, "servicePostalCode", 20),
    source: optionalEnumValue(payload.source, "source", leadSources),
    serviceType: optionalEnumValue(payload.serviceType, "serviceType", serviceTypes),
    description:
      payload.description === undefined
        ? undefined
        : optionalTrimmedString(payload.description, "description", 3000),
    status: optionalEnumValue(payload.status, "status", leadStatuses),
  };
}

export function parseLeadDispositionPayload(jsonBody: unknown): LeadDispositionPayload {
  const payload = requireRecord(jsonBody, "Lead disposition");

  const disposition = requireEnumValue(payload.disposition, "disposition", leadDispositions);
  const dispositionReason = requireEnumValue(
    payload.dispositionReason,
    "dispositionReason",
    leadDispositionReasons,
  );
  const dispositionNote = optionalTrimmedString(payload.dispositionNote, "dispositionNote", 3000);

  if (dispositionReason === "other" && !dispositionNote?.trim()) {
    throw new Error("dispositionNote is required when dispositionReason is other.");
  }

  return {
    disposition,
    dispositionReason,
    dispositionNote: dispositionNote ?? null,
  };
}

export function parseCreateCustomerPayload(jsonBody: unknown): CreateCustomerPayload {
  const payload = requireRecord(jsonBody, "Customer");

  return {
    fullName: requireTrimmedString(payload.fullName, "fullName"),
    phone: requireTrimmedString(payload.phone, "phone", 64),
    email: optionalEmail(payload.email, "email"),
    companyName: optionalTrimmedString(payload.companyName, "companyName"),
    serviceAddressLine1: requireTrimmedString(
      payload.serviceAddressLine1,
      "serviceAddressLine1",
    ),
    serviceAddressLine2: optionalTrimmedString(
      payload.serviceAddressLine2,
      "serviceAddressLine2",
    ),
    serviceCity: optionalTrimmedString(payload.serviceCity, "serviceCity", 120) ?? "",
    serviceStateOrRegion: optionalTrimmedString(
      payload.serviceStateOrRegion,
      "serviceStateOrRegion",
      120,
    ),
    servicePostalCode: optionalTrimmedString(payload.servicePostalCode, "servicePostalCode", 20) ?? "",
    notes: optionalTrimmedString(payload.notes, "notes", 3000),
  };
}

export function parseUpdateCustomerPayload(jsonBody: unknown): UpdateCustomerPayload {
  const payload = requireRecord(jsonBody, "Customer update");

  return {
    fullName:
      payload.fullName === undefined
        ? undefined
        : requireTrimmedString(payload.fullName, "fullName"),
    phone:
      payload.phone === undefined
        ? undefined
        : requireTrimmedString(payload.phone, "phone", 64),
    email:
      payload.email === undefined
        ? undefined
        : optionalEmail(payload.email, "email"),
    companyName:
      payload.companyName === undefined
        ? undefined
        : optionalTrimmedString(payload.companyName, "companyName"),
    serviceAddressLine1:
      payload.serviceAddressLine1 === undefined
        ? undefined
        : requireTrimmedString(payload.serviceAddressLine1, "serviceAddressLine1"),
    serviceAddressLine2:
      payload.serviceAddressLine2 === undefined
        ? undefined
        : optionalTrimmedString(payload.serviceAddressLine2, "serviceAddressLine2"),
    serviceCity:
      payload.serviceCity === undefined
        ? undefined
        : requireTrimmedString(payload.serviceCity, "serviceCity", 120),
    serviceStateOrRegion:
      payload.serviceStateOrRegion === undefined
        ? undefined
        : optionalTrimmedString(
            payload.serviceStateOrRegion,
            "serviceStateOrRegion",
            120,
          ),
    servicePostalCode:
      payload.servicePostalCode === undefined
        ? undefined
        : requireTrimmedString(payload.servicePostalCode, "servicePostalCode", 20),
    notes:
      payload.notes === undefined
        ? undefined
        : optionalTrimmedString(payload.notes, "notes", 3000),
    preferredServiceType:
      payload.preferredServiceType === undefined
        ? undefined
        : optionalEnumValue(payload.preferredServiceType, "preferredServiceType", serviceTypes),
  };
}

export function parseConvertLeadPayload(jsonBody: unknown): ConvertLeadPayload {
  const payload = requireRecord(jsonBody, "Lead conversion");

  return {
    title: requireTrimmedString(payload.title, "title", 180),
    description: optionalTrimmedString(payload.description, "description", 3000),
    assignedTechnicianId: optionalUuid(payload.assignedTechnicianId, "assignedTechnicianId"),
    serviceId: optionalUuid(payload.serviceId, "serviceId"),
    scheduledFor: optionalIsoDateTime(payload.scheduledFor, "scheduledFor"),
    scheduledWindow: optionalTrimmedString(payload.scheduledWindow, "scheduledWindow", 120),
    jobType: optionalEnumValue(payload.jobType, "jobType", operationalJobTypes) ?? null,
  };
}

export function parseCreateJobPayload(jsonBody: unknown): CreateJobPayload {
  const payload = requireRecord(jsonBody, "Job");
  const customerId = optionalUuid(payload.customerId, "customerId");
  const leadId = optionalUuid(payload.leadId, "leadId");

  if ((customerId && leadId) || (!customerId && !leadId)) {
    throw new Error("Provide exactly one job source: customerId or leadId.");
  }

  const scheduledFor = optionalIsoDateTime(payload.scheduledFor, "scheduledFor");
  const assignedTechnicianId = optionalUuid(payload.assignedTechnicianId, "assignedTechnicianId");

  if (!scheduledFor && assignedTechnicianId) {
    throw new Error("Unscheduled jobs cannot assign a technician.");
  }

  if (scheduledFor && !assignedTechnicianId) {
    throw new Error("Scheduled jobs require an assigned technician.");
  }

  return {
    customerId,
    leadId,
    jobType: requireEnumValue(payload.jobType, "jobType", operationalJobTypes),
    serviceType: requireEnumValue(payload.serviceType, "serviceType", serviceTypes),
    serviceId: optionalUuid(payload.serviceId, "serviceId"),
    serviceAddressLine1: requireTrimmedString(
      payload.serviceAddressLine1,
      "serviceAddressLine1",
    ),
    serviceAddressLine2: optionalTrimmedString(
      payload.serviceAddressLine2,
      "serviceAddressLine2",
    ),
    serviceCity: requireTrimmedString(payload.serviceCity, "serviceCity", 120),
    serviceStateOrRegion: optionalTrimmedString(
      payload.serviceStateOrRegion,
      "serviceStateOrRegion",
      120,
    ),
    servicePostalCode: requireTrimmedString(
      payload.servicePostalCode,
      "servicePostalCode",
      20,
    ),
    scheduledFor,
    scheduledWindow: optionalTrimmedString(payload.scheduledWindow, "scheduledWindow", 120),
    assignedTechnicianId,
    customerConcern: optionalTrimmedString(payload.customerConcern, "customerConcern", 3000),
    internalNotes: optionalTrimmedString(payload.internalNotes, "internalNotes", 3000),
  };
}

export function parseUpdateJobPayload(jsonBody: unknown): UpdateJobPayload {
  const payload = requireRecord(jsonBody, "Job update");

  return {
    title:
      payload.title === undefined
        ? undefined
        : requireTrimmedString(payload.title, "title", 180),
    description:
      payload.description === undefined
        ? undefined
        : optionalTrimmedString(payload.description, "description", 3000),
    assignedTechnicianId:
      payload.assignedTechnicianId === undefined
        ? undefined
        : optionalUuid(payload.assignedTechnicianId, "assignedTechnicianId"),
    serviceId:
      payload.serviceId === undefined
        ? undefined
        : optionalUuid(payload.serviceId, "serviceId"),
    scheduledFor:
      payload.scheduledFor === undefined
        ? undefined
        : optionalIsoDateTime(payload.scheduledFor, "scheduledFor"),
    scheduledWindow:
      payload.scheduledWindow === undefined
        ? undefined
        : optionalTrimmedString(payload.scheduledWindow, "scheduledWindow", 120),
    jobType:
      payload.jobType === undefined
        ? undefined
        : requireEnumValue(payload.jobType, "jobType", operationalJobTypes),
  };
}

export function parseJobStatusPayload(jsonBody: unknown): JobStatusPayload {
  const payload = requireRecord(jsonBody, "Job status");

  return {
    status: requireEnumValue(payload.status, "status", jobStatuses),
    note: optionalTrimmedString(payload.note, "note", 2000),
  };
}

export function parseCreateJobNotePayload(jsonBody: unknown): CreateJobNotePayload {
  const payload = requireRecord(jsonBody, "Job note");

  return {
    findings: optionalTrimmedString(payload.findings, "findings", 3000),
    recommendations: optionalTrimmedString(
      payload.recommendations,
      "recommendations",
      3000,
    ),
    photoUrls: optionalStringArray(payload.photoUrls, "photoUrls"),
  };
}

function parseDocumentLineItems(value: unknown): DocumentLineItemInput[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error("lineItems must be an array.");
  }

  return value.map((entry, index) => {
    const lineItem = requireRecord(entry, `lineItems[${index}]`);
    const kind = requireEnumValue(lineItem.kind, `lineItems[${index}].kind`, documentLineItemKinds);

    if (kind === "pricebook_item") {
      return {
        kind,
        documentLineKey: requireTrimmedString(lineItem.documentLineKey, `lineItems[${index}].documentLineKey`, 128),
        pricebookItemId: requireUuid(lineItem.pricebookItemId, `lineItems[${index}].pricebookItemId`),
        quantity: requirePositiveDecimalString(lineItem.quantity, `lineItems[${index}].quantity`),
        sortOrder: requireNonNegativeInteger(lineItem.sortOrder, `lineItems[${index}].sortOrder`),
        unitPriceCentsOverride: optionalNonNegativeInteger(
          lineItem.unitPriceCentsOverride,
          `lineItems[${index}].unitPriceCentsOverride`,
        ),
        nameOverride:
          lineItem.nameOverride === undefined
            ? undefined
            : optionalTrimmedString(
                lineItem.nameOverride,
                `lineItems[${index}].nameOverride`,
                255,
              ),
        descriptionOverride:
          lineItem.descriptionOverride === undefined
            ? undefined
            : optionalTrimmedString(
                lineItem.descriptionOverride,
                `lineItems[${index}].descriptionOverride`,
                3000,
              ),
        nameTranslationRecordId:
          lineItem.nameTranslationRecordId === undefined
            ? undefined
            : optionalUuid(lineItem.nameTranslationRecordId, `lineItems[${index}].nameTranslationRecordId`),
        descriptionTranslationRecordId:
          lineItem.descriptionTranslationRecordId === undefined
            ? undefined
            : optionalUuid(
                lineItem.descriptionTranslationRecordId,
                `lineItems[${index}].descriptionTranslationRecordId`,
              ),
        warrantyMonthsOverride:
          lineItem.warrantyMonthsOverride === undefined
            ? undefined
            : optionalNullableNonNegativeInteger(
                lineItem.warrantyMonthsOverride,
                `lineItems[${index}].warrantyMonthsOverride`,
              ),
        pricebookBundleId:
          lineItem.pricebookBundleId === undefined
            ? undefined
            : optionalUuid(lineItem.pricebookBundleId, `lineItems[${index}].pricebookBundleId`),
        bundleRequirementId:
          lineItem.bundleRequirementId === undefined
            ? undefined
            : optionalUuid(lineItem.bundleRequirementId, `lineItems[${index}].bundleRequirementId`),
        catalogUnitPriceCentsSnapshot:
          lineItem.catalogUnitPriceCentsSnapshot === undefined
            ? undefined
            : optionalNullableNonNegativeInteger(
                lineItem.catalogUnitPriceCentsSnapshot,
                `lineItems[${index}].catalogUnitPriceCentsSnapshot`,
              ),
      };
    }

    if (kind === "pricebook_bundle") {
      return {
        kind,
        pricebookBundleId: requireUuid(lineItem.pricebookBundleId, `lineItems[${index}].pricebookBundleId`),
        sortOrder: requireNonNegativeInteger(lineItem.sortOrder, `lineItems[${index}].sortOrder`),
        quantityMultiplier: optionalPositiveDecimalString(
          lineItem.quantityMultiplier,
          `lineItems[${index}].quantityMultiplier`,
        ),
      };
    }

    return {
      kind,
      documentLineKey: requireTrimmedString(lineItem.documentLineKey, `lineItems[${index}].documentLineKey`, 128),
      name: requireTrimmedString(lineItem.name, `lineItems[${index}].name`, 255),
      quantity: requirePositiveDecimalString(lineItem.quantity, `lineItems[${index}].quantity`),
      unitPriceCents: requireNonNegativeInteger(lineItem.unitPriceCents, `lineItems[${index}].unitPriceCents`),
      sortOrder: requireNonNegativeInteger(lineItem.sortOrder, `lineItems[${index}].sortOrder`),
      description:
        lineItem.description === undefined
          ? undefined
          : optionalTrimmedString(lineItem.description, `lineItems[${index}].description`, 3000),
      nameTranslationRecordId:
        lineItem.nameTranslationRecordId === undefined
          ? undefined
          : optionalUuid(lineItem.nameTranslationRecordId, `lineItems[${index}].nameTranslationRecordId`),
      descriptionTranslationRecordId:
        lineItem.descriptionTranslationRecordId === undefined
          ? undefined
          : optionalUuid(
              lineItem.descriptionTranslationRecordId,
              `lineItems[${index}].descriptionTranslationRecordId`,
            ),
    };
  });
}

export function parseUpsertQuotePayload(jsonBody: unknown): UpsertQuotePayload {
  const payload = requireRecord(jsonBody, "Quote");

  return {
    description: requireTrimmedString(payload.description, "description", 3000),
    priceCents: requireNonNegativeInteger(payload.priceCents, "priceCents"),
    status: requireEnumValue(payload.status ?? "draft", "status", quoteStatuses),
    lineItems: parseDocumentLineItems(payload.lineItems),
    taxRateBps: optionalNonNegativeInteger(payload.taxRateBps, "taxRateBps") ?? 0,
  };
}

export function parseUpsertInvoicePayload(jsonBody: unknown): UpsertInvoicePayload {
  const payload = requireRecord(jsonBody, "Invoice");

  return {
    description: optionalTrimmedString(payload.description, "description", 3000),
    amountCents: requireNonNegativeInteger(payload.amountCents, "amountCents"),
    status: requireEnumValue(payload.status ?? "unpaid", "status", invoiceStatuses),
    lineItems: parseDocumentLineItems(payload.lineItems),
    taxRateBps: optionalNonNegativeInteger(payload.taxRateBps, "taxRateBps") ?? 0,
  };
}

export function parseRecordInvoicePaymentPayload(jsonBody: unknown): RecordInvoicePaymentPayload {
  const payload = requireRecord(jsonBody, "Invoice payment");

  return {
    idempotencyKey: requireTrimmedString(payload.idempotencyKey, "idempotencyKey", 64),
    entryType: requireEnumValue(payload.entryType, "entryType", invoicePaymentEntryTypes),
    amountCents: requireNonNegativeInteger(payload.amountCents, "amountCents"),
    method: requireEnumValue(payload.method ?? "other", "method", invoicePaymentMethods),
    reference: optionalTrimmedString(payload.reference, "reference", 255),
    note: optionalTrimmedString(payload.note, "note", 2000),
    occurredAt: optionalIsoDateTime(payload.occurredAt, "occurredAt"),
  };
}

export function parseSignDocumentPayload(jsonBody: unknown): SignDocumentPayload {
  const payload = requireRecord(jsonBody, "Document signature");

  return {
    signedByName: requireTrimmedString(payload.signedByName, "signedByName", 120),
  };
}
