import {
  pricebookActiveStates,
  pricebookInventoryTrackingModes,
  pricebookItemTypes,
  pricebookUnitOfMeasures,
  type PricebookActiveState,
  type PricebookInventoryTrackingMode,
  type PricebookItemType,
  type PricebookUnitOfMeasure,
} from "./constants";
import { parseOptionalPricebookImage, type PricebookImageInput } from "./pricebook-image";

type RecordValue = Record<string, unknown>;

export type PricebookItemListQuery = {
  q: string;
  itemType?: PricebookItemType;
  systemId?: string;
  categoryId?: string;
  tradeArea?: string;
  activeState: PricebookActiveState;
  popularOnly: boolean;
  page: number;
  pageSize: number;
};

export type PricebookCategoryListQuery = {
  systemId?: string;
};

export type PricebookNavigationSummaryQuery = {
  q: string;
  itemType?: PricebookItemType;
  tradeArea?: string;
  activeState: PricebookActiveState;
  popularOnly: boolean;
};

export type PricebookBundleListQuery = {
  q: string;
  activeState: PricebookActiveState;
  page: number;
  pageSize: number;
};

export type CreatePricebookItemPayload = {
  internalSku: string | null;
  name: string;
  customerDescription: string | null;
  internalDescription: string | null;
  itemType: PricebookItemType;
  systemId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  tradeArea: string | null;
  serviceArea: string | null;
  tags: string[];
  unitOfMeasure: PricebookUnitOfMeasure;
  baseCostCents: number;
  materialCostCents: number;
  laborCostCents: number;
  customerPriceCents: number;
  minimumPriceCents: number | null;
  estimatedLaborMinutes: number | null;
  warrantyMonths: number | null;
  requiresPermit: boolean;
  inventoryTrackingMode: PricebookInventoryTrackingMode;
  supplierName: string | null;
  supplierSku: string | null;
  inventoryNotes: string | null;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
  image: PricebookImageInput | null;
};

export type UpdatePricebookItemPayload = {
  internalSku?: string;
  name?: string;
  customerDescription?: string | null;
  internalDescription?: string | null;
  itemType?: PricebookItemType;
  systemId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  tradeArea?: string | null;
  serviceArea?: string | null;
  tags?: string[];
  unitOfMeasure?: PricebookUnitOfMeasure;
  baseCostCents?: number;
  materialCostCents?: number;
  laborCostCents?: number;
  customerPriceCents?: number;
  minimumPriceCents?: number | null;
  estimatedLaborMinutes?: number | null;
  warrantyMonths?: number | null;
  requiresPermit?: boolean;
  inventoryTrackingMode?: PricebookInventoryTrackingMode;
  supplierName?: string | null;
  supplierSku?: string | null;
  inventoryNotes?: string | null;
  isPopular?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

export type CreatePricebookBundlePayload = {
  name: string;
  description: string | null;
  isActive: boolean;
};

export type UpdatePricebookBundlePayload = {
  name?: string;
  description?: string | null;
  isActive?: boolean;
};

export type CreatePricebookBundleItemPayload = {
  pricebookItemId: string;
  defaultQuantity: string;
  sortOrder: number;
};

export type UpdatePricebookBundleItemPayload = {
  defaultQuantity?: string;
  sortOrder?: number;
};

export type CreatePricebookBundleRequirementPayload = {
  label: string;
  categoryId: string;
  defaultQuantity: string;
  sortOrder: number;
};

export type UpdatePricebookBundleRequirementPayload = {
  label?: string;
  categoryId?: string;
  defaultQuantity?: string;
  sortOrder?: number;
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

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function requireTrimmedString(value: unknown, fieldName: string, maxLength = 255) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${fieldName} is required.`);
  }

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

function optionalTrimmedString(value: unknown, fieldName: string, maxLength = 255) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requireTrimmedString(value, fieldName, maxLength);
}

function requireNonNegativeInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }

  return value;
}

function optionalNonNegativeInteger(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  return requireNonNegativeInteger(value, fieldName);
}

export function parseWarrantyMonths(value: unknown, fieldName = "warrantyMonths") {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be a positive whole number of months, or null when warranty is off.`);
  }

  if (value === 0) {
    return null;
  }

  if (value < 1) {
    throw new Error(`${fieldName} must be a positive whole number of months.`);
  }

  return value;
}

export function persistWarrantyMonths(value: number | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === "number" && value > 0 ? value : null;
}

export function parseCreateWarrantyMonths(payload: RecordValue) {
  const warrantyEnabled = optionalBoolean(payload.warrantyEnabled, "warrantyEnabled");

  if (warrantyEnabled === false) {
    return null;
  }

  if (warrantyEnabled === true) {
    const months = parseWarrantyMonths(payload.warrantyMonths);

    if (months == null) {
      throw new Error("warrantyMonths is required when warranty is on.");
    }

    return months;
  }

  return parseWarrantyMonths(payload.warrantyMonths) ?? null;
}

function optionalUuid(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requireUuid(value, fieldName);
}

function parseOptionalCategoryName(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requireTrimmedString(value, "category", 120);
}

function parseCreateCategoryRef(payload: RecordValue) {
  const categoryId = optionalUuid(payload.categoryId, "categoryId");
  const categoryName = parseOptionalCategoryName(payload.category);
  const systemId = optionalUuid(payload.systemId, "systemId");

  if (!categoryId && !categoryName) {
    throw new Error("category is required.");
  }

  if (categoryName && !categoryId && !systemId) {
    throw new Error("systemId is required when creating a category by name.");
  }

  return { categoryId, categoryName, systemId };
}

function parseOptionalInternalSku(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requireTrimmedString(value, "internalSku", 128);
}

function requireBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean.`);
  }

  return value;
}

function optionalBoolean(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  return requireBoolean(value, fieldName);
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
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
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

function parseBooleanQuery(value: unknown, fieldName: string) {
  const rawValue = firstQueryValue(value);

  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return false;
  }

  if (rawValue === true || rawValue === "true" || rawValue === "1") {
    return true;
  }

  if (rawValue === false || rawValue === "false" || rawValue === "0") {
    return false;
  }

  throw new Error(`${fieldName} must be true or false.`);
}

function parseOptionalQueryString(value: unknown, fieldName: string, maxLength = 255) {
  const rawValue = firstQueryValue(value);

  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return undefined;
  }

  return requireTrimmedString(rawValue, fieldName, maxLength);
}

function parseIntegerQuery(
  value: unknown,
  fieldName: string,
  fallback: number,
  minValue: number,
  maxValue: number,
) {
  const rawValue = firstQueryValue(value);

  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < minValue || parsed > maxValue) {
    throw new Error(`${fieldName} must be an integer between ${minValue} and ${maxValue}.`);
  }

  return parsed;
}

function optionalStringArray(value: unknown, fieldName: string, maxItems = 25) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }

  if (value.length > maxItems) {
    throw new Error(`${fieldName} must include ${maxItems} items or fewer.`);
  }

  return value.map((item, index) => requireTrimmedString(item, `${fieldName}[${index}]`, 120));
}

function normalizeQuantity(value: unknown, fieldName: string) {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error(`${fieldName} must be a positive number.`);
  }

  const rawValue = typeof value === "string" ? value.trim() : String(value);

  if (!/^\d+(\.\d{1,3})?$/.test(rawValue)) {
    throw new Error(`${fieldName} must be a positive number with up to three decimal places.`);
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }

  return parsed.toFixed(3);
}

function validateMinimumPrice(minimumPriceCents: number | null | undefined, customerPriceCents: number | undefined) {
  if (
    minimumPriceCents !== null
    && minimumPriceCents !== undefined
    && customerPriceCents !== undefined
    && minimumPriceCents > customerPriceCents
  ) {
    throw new Error("minimumPriceCents cannot be greater than customerPriceCents.");
  }
}

export function parsePricebookItemListQuery(queryValue: unknown): PricebookItemListQuery {
  const query = requireRecord(queryValue, "Pricebook item list query");
  const itemType = optionalEnumValue(firstQueryValue(query.itemType), "itemType", pricebookItemTypes);
  const activeState = firstQueryValue(query.activeState) === undefined
    ? "active"
    : requireEnumValue(firstQueryValue(query.activeState), "activeState", pricebookActiveStates);

  return {
    q: parseOptionalQueryString(query.q, "q", 255) ?? "",
    itemType,
    systemId: parseOptionalQueryString(firstQueryValue(query.systemId), "systemId", 64),
    categoryId: parseOptionalQueryString(firstQueryValue(query.categoryId), "categoryId", 64),
    tradeArea: parseOptionalQueryString(query.tradeArea, "tradeArea", 120),
    activeState,
    popularOnly: parseBooleanQuery(query.popularOnly, "popularOnly"),
    page: parseIntegerQuery(query.page, "page", 1, 1, 100000),
    pageSize: parseIntegerQuery(query.pageSize, "pageSize", 25, 1, 100),
  };
}

export function parsePricebookCategoryListQuery(queryValue: unknown): PricebookCategoryListQuery {
  const query = requireRecord(queryValue, "Pricebook category list query");

  return {
    systemId: parseOptionalQueryString(firstQueryValue(query.systemId), "systemId", 64),
  };
}

export function parsePricebookNavigationSummaryQuery(queryValue: unknown): PricebookNavigationSummaryQuery {
  const query = requireRecord(queryValue, "Pricebook navigation summary query");
  const itemType = optionalEnumValue(firstQueryValue(query.itemType), "itemType", pricebookItemTypes);
  const activeState = firstQueryValue(query.activeState) === undefined
    ? "active"
    : requireEnumValue(firstQueryValue(query.activeState), "activeState", pricebookActiveStates);

  return {
    q: parseOptionalQueryString(query.q, "q", 255) ?? "",
    itemType,
    tradeArea: parseOptionalQueryString(query.tradeArea, "tradeArea", 120),
    activeState,
    popularOnly: parseBooleanQuery(query.popularOnly, "popularOnly"),
  };
}

export function parsePricebookBundleListQuery(queryValue: unknown): PricebookBundleListQuery {
  const query = requireRecord(queryValue, "Pricebook bundle list query");
  const activeState = firstQueryValue(query.activeState) === undefined
    ? "active"
    : requireEnumValue(firstQueryValue(query.activeState), "activeState", pricebookActiveStates);

  return {
    q: parseOptionalQueryString(query.q, "q", 255) ?? "",
    activeState,
    page: parseIntegerQuery(query.page, "page", 1, 1, 100000),
    pageSize: parseIntegerQuery(query.pageSize, "pageSize", 25, 1, 100),
  };
}

export function parseCreatePricebookItemPayload(jsonBody: unknown): CreatePricebookItemPayload {
  const payload = requireRecord(jsonBody, "Pricebook item");
  const customerPriceCents = requireNonNegativeInteger(payload.customerPriceCents, "customerPriceCents");
  const minimumPriceCents = optionalNonNegativeInteger(payload.minimumPriceCents, "minimumPriceCents");

  validateMinimumPrice(minimumPriceCents, customerPriceCents);

  return {
    internalSku: parseOptionalInternalSku(payload.internalSku),
    name: requireTrimmedString(payload.name, "name", 255),
    customerDescription: optionalTrimmedString(payload.customerDescription, "customerDescription", 4000),
    internalDescription: optionalTrimmedString(payload.internalDescription, "internalDescription", 4000),
    itemType: payload.itemType === undefined
      ? "product"
      : requireEnumValue(payload.itemType, "itemType", pricebookItemTypes),
    ...parseCreateCategoryRef(payload),
    tradeArea: optionalTrimmedString(payload.tradeArea, "tradeArea", 120),
    serviceArea: optionalTrimmedString(payload.serviceArea, "serviceArea", 120),
    tags: optionalStringArray(payload.tags, "tags"),
    unitOfMeasure: payload.unitOfMeasure === undefined
      ? "each"
      : requireEnumValue(payload.unitOfMeasure, "unitOfMeasure", pricebookUnitOfMeasures),
    baseCostCents: payload.baseCostCents === undefined
      ? 0
      : requireNonNegativeInteger(payload.baseCostCents, "baseCostCents"),
    materialCostCents: payload.materialCostCents === undefined
      ? 0
      : requireNonNegativeInteger(payload.materialCostCents, "materialCostCents"),
    laborCostCents: payload.laborCostCents === undefined
      ? 0
      : requireNonNegativeInteger(payload.laborCostCents, "laborCostCents"),
    customerPriceCents,
    minimumPriceCents: minimumPriceCents ?? null,
    estimatedLaborMinutes: optionalNonNegativeInteger(payload.estimatedLaborMinutes, "estimatedLaborMinutes") ?? null,
    warrantyMonths: parseCreateWarrantyMonths(payload),
    requiresPermit: payload.requiresPermit === undefined
      ? false
      : requireBoolean(payload.requiresPermit, "requiresPermit"),
    inventoryTrackingMode: payload.inventoryTrackingMode === undefined
      ? "none"
      : requireEnumValue(payload.inventoryTrackingMode, "inventoryTrackingMode", pricebookInventoryTrackingModes),
    supplierName: optionalTrimmedString(payload.supplierName, "supplierName", 255),
    supplierSku: optionalTrimmedString(payload.supplierSku, "supplierSku", 128),
    inventoryNotes: optionalTrimmedString(payload.inventoryNotes, "inventoryNotes", 4000),
    isPopular: payload.isPopular === undefined ? false : requireBoolean(payload.isPopular, "isPopular"),
    isActive: payload.isActive === undefined ? true : requireBoolean(payload.isActive, "isActive"),
    sortOrder: payload.sortOrder === undefined ? 0 : requireNonNegativeInteger(payload.sortOrder, "sortOrder"),
    image: parseOptionalPricebookImage(payload.imageDataUrl),
  };
}

export function parseUpdatePricebookItemPayload(jsonBody: unknown): UpdatePricebookItemPayload {
  const payload = requireRecord(jsonBody, "Pricebook item update");
  const nextPayload: UpdatePricebookItemPayload = {};

  if (payload.internalSku !== undefined) {
    nextPayload.internalSku = requireTrimmedString(payload.internalSku, "internalSku", 128);
  }

  if (payload.name !== undefined) {
    nextPayload.name = requireTrimmedString(payload.name, "name", 255);
  }

  if (payload.customerDescription !== undefined) {
    nextPayload.customerDescription = optionalTrimmedString(payload.customerDescription, "customerDescription", 4000);
  }

  if (payload.internalDescription !== undefined) {
    nextPayload.internalDescription = optionalTrimmedString(payload.internalDescription, "internalDescription", 4000);
  }

  if (payload.itemType !== undefined) {
    nextPayload.itemType = requireEnumValue(payload.itemType, "itemType", pricebookItemTypes);
  }

  if (payload.categoryId !== undefined || payload.category !== undefined) {
    nextPayload.categoryId = payload.categoryId === undefined
      ? undefined
      : optionalUuid(payload.categoryId, "categoryId");
    nextPayload.categoryName = payload.category === undefined
      ? undefined
      : parseOptionalCategoryName(payload.category);
  }

  if (payload.systemId !== undefined) {
    nextPayload.systemId = payload.systemId === undefined
      ? undefined
      : optionalUuid(payload.systemId, "systemId");
  }

  if (payload.tradeArea !== undefined) {
    nextPayload.tradeArea = optionalTrimmedString(payload.tradeArea, "tradeArea", 120);
  }

  if (payload.serviceArea !== undefined) {
    nextPayload.serviceArea = optionalTrimmedString(payload.serviceArea, "serviceArea", 120);
  }

  if (payload.tags !== undefined) {
    nextPayload.tags = optionalStringArray(payload.tags, "tags");
  }

  if (payload.unitOfMeasure !== undefined) {
    nextPayload.unitOfMeasure = requireEnumValue(payload.unitOfMeasure, "unitOfMeasure", pricebookUnitOfMeasures);
  }

  if (payload.baseCostCents !== undefined) {
    nextPayload.baseCostCents = requireNonNegativeInteger(payload.baseCostCents, "baseCostCents");
  }

  if (payload.materialCostCents !== undefined) {
    nextPayload.materialCostCents = requireNonNegativeInteger(payload.materialCostCents, "materialCostCents");
  }

  if (payload.laborCostCents !== undefined) {
    nextPayload.laborCostCents = requireNonNegativeInteger(payload.laborCostCents, "laborCostCents");
  }

  if (payload.customerPriceCents !== undefined) {
    nextPayload.customerPriceCents = requireNonNegativeInteger(payload.customerPriceCents, "customerPriceCents");
  }

  if (payload.minimumPriceCents !== undefined) {
    nextPayload.minimumPriceCents = optionalNonNegativeInteger(payload.minimumPriceCents, "minimumPriceCents");
  }

  if (payload.estimatedLaborMinutes !== undefined) {
    nextPayload.estimatedLaborMinutes = optionalNonNegativeInteger(payload.estimatedLaborMinutes, "estimatedLaborMinutes");
  }

  if (payload.warrantyMonths !== undefined) {
    nextPayload.warrantyMonths = parseWarrantyMonths(payload.warrantyMonths) ?? null;
  }

  if (payload.requiresPermit !== undefined) {
    nextPayload.requiresPermit = requireBoolean(payload.requiresPermit, "requiresPermit");
  }

  if (payload.inventoryTrackingMode !== undefined) {
    nextPayload.inventoryTrackingMode = requireEnumValue(
      payload.inventoryTrackingMode,
      "inventoryTrackingMode",
      pricebookInventoryTrackingModes,
    );
  }

  if (payload.supplierName !== undefined) {
    nextPayload.supplierName = optionalTrimmedString(payload.supplierName, "supplierName", 255);
  }

  if (payload.supplierSku !== undefined) {
    nextPayload.supplierSku = optionalTrimmedString(payload.supplierSku, "supplierSku", 128);
  }

  if (payload.inventoryNotes !== undefined) {
    nextPayload.inventoryNotes = optionalTrimmedString(payload.inventoryNotes, "inventoryNotes", 4000);
  }

  if (payload.isPopular !== undefined) {
    nextPayload.isPopular = requireBoolean(payload.isPopular, "isPopular");
  }

  if (payload.isActive !== undefined) {
    nextPayload.isActive = requireBoolean(payload.isActive, "isActive");
  }

  if (payload.sortOrder !== undefined) {
    nextPayload.sortOrder = requireNonNegativeInteger(payload.sortOrder, "sortOrder");
  }

  validateMinimumPrice(nextPayload.minimumPriceCents, nextPayload.customerPriceCents);
  return nextPayload;
}

export function parseCreatePricebookBundlePayload(jsonBody: unknown): CreatePricebookBundlePayload {
  const payload = requireRecord(jsonBody, "Pricebook bundle");

  return {
    name: requireTrimmedString(payload.name, "name", 255),
    description: optionalTrimmedString(payload.description, "description", 4000),
    isActive: payload.isActive === undefined ? true : requireBoolean(payload.isActive, "isActive"),
  };
}

export function parseUpdatePricebookBundlePayload(jsonBody: unknown): UpdatePricebookBundlePayload {
  const payload = requireRecord(jsonBody, "Pricebook bundle update");
  const nextPayload: UpdatePricebookBundlePayload = {};

  if (payload.name !== undefined) {
    nextPayload.name = requireTrimmedString(payload.name, "name", 255);
  }

  if (payload.description !== undefined) {
    nextPayload.description = optionalTrimmedString(payload.description, "description", 4000);
  }

  if (payload.isActive !== undefined) {
    nextPayload.isActive = requireBoolean(payload.isActive, "isActive");
  }

  return nextPayload;
}

export function parseCreatePricebookBundleItemPayload(jsonBody: unknown): CreatePricebookBundleItemPayload {
  const payload = requireRecord(jsonBody, "Pricebook bundle item");

  return {
    pricebookItemId: requireUuid(payload.pricebookItemId, "pricebookItemId"),
    defaultQuantity: payload.defaultQuantity === undefined
      ? "1.000"
      : normalizeQuantity(payload.defaultQuantity, "defaultQuantity"),
    sortOrder: payload.sortOrder === undefined ? 0 : requireNonNegativeInteger(payload.sortOrder, "sortOrder"),
  };
}

export function parseUpdatePricebookBundleItemPayload(jsonBody: unknown): UpdatePricebookBundleItemPayload {
  const payload = requireRecord(jsonBody, "Pricebook bundle item update");
  const nextPayload: UpdatePricebookBundleItemPayload = {};

  if (payload.defaultQuantity !== undefined) {
    nextPayload.defaultQuantity = normalizeQuantity(payload.defaultQuantity, "defaultQuantity");
  }

  if (payload.sortOrder !== undefined) {
    nextPayload.sortOrder = requireNonNegativeInteger(payload.sortOrder, "sortOrder");
  }

  return nextPayload;
}

export function parseCreatePricebookBundleRequirementPayload(jsonBody: unknown): CreatePricebookBundleRequirementPayload {
  const payload = requireRecord(jsonBody, "Pricebook bundle requirement");

  return {
    label: requireTrimmedString(payload.label, "label", 255),
    categoryId: requireUuid(payload.categoryId, "categoryId"),
    defaultQuantity: payload.defaultQuantity === undefined
      ? "1.000"
      : normalizeQuantity(payload.defaultQuantity, "defaultQuantity"),
    sortOrder: payload.sortOrder === undefined ? 0 : requireNonNegativeInteger(payload.sortOrder, "sortOrder"),
  };
}

export function parseUpdatePricebookBundleRequirementPayload(jsonBody: unknown): UpdatePricebookBundleRequirementPayload {
  const payload = requireRecord(jsonBody, "Pricebook bundle requirement update");
  const nextPayload: UpdatePricebookBundleRequirementPayload = {};

  if (payload.label !== undefined) {
    nextPayload.label = requireTrimmedString(payload.label, "label", 255);
  }

  if (payload.categoryId !== undefined) {
    nextPayload.categoryId = requireUuid(payload.categoryId, "categoryId");
  }

  if (payload.defaultQuantity !== undefined) {
    nextPayload.defaultQuantity = normalizeQuantity(payload.defaultQuantity, "defaultQuantity");
  }

  if (payload.sortOrder !== undefined) {
    nextPayload.sortOrder = requireNonNegativeInteger(payload.sortOrder, "sortOrder");
  }

  return nextPayload;
}

export function parseUuidParam(value: unknown, fieldName: string) {
  return requireUuid(value, fieldName);
}