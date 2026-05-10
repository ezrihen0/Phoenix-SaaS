import {
  inventoryActiveStates,
  inventoryItemTypes,
  inventoryLocationTypes,
  inventoryMovementTypes,
  inventoryUnitOfMeasures,
  type InventoryActiveState,
  type InventoryItemType,
  type InventoryLocationType,
  type InventoryMovementType,
  type InventoryUnitOfMeasure,
} from "./constants";

type InventoryLinePayload = {
  inventoryItemId: string;
  quantity: string;
  unitCostBeforeTaxCents?: number | null;
  taxPaidCents?: number | null;
  totalPaidCents?: number | null;
  note?: string | null;
};

export type InventoryItemListQuery = {
  q: string;
  activeState: InventoryActiveState;
};

export type InventoryLocationListQuery = {
  activeState: InventoryActiveState;
};

export type InventoryMovementListQuery = {
  q: string;
  movementType: InventoryMovementType | "";
  itemId: string;
  locationId: string;
  page: number;
  pageSize: number;
};

export type InventoryStockListQuery = {
  q: string;
  locationId: string;
  lowStockOnly: boolean;
  activeState: InventoryActiveState;
};

export type CreateInventoryItemPayload = {
  internalSku: string;
  name: string;
  itemType: InventoryItemType;
  unitOfMeasure: InventoryUnitOfMeasure;
  defaultCostBeforeTaxCents: number;
  defaultTaxCents: number | null;
  defaultTotalPaidCents: number | null;
  supplierName: string | null;
  supplierSku: string | null;
  reorderPoint: string | null;
  notes: string | null;
  isActive: boolean;
};

export type UpdateInventoryItemPayload = Partial<CreateInventoryItemPayload>;

export type CreateInventoryLocationPayload = {
  name: string;
  locationType: InventoryLocationType;
  assignedUserId: string | null;
  isCompanyOwned: boolean;
  vehicleLabel: string | null;
  licensePlate: string | null;
  notes: string | null;
  isActive: boolean;
};

export type UpdateInventoryLocationPayload = Partial<CreateInventoryLocationPayload>;

export type ReceiveInventoryPayload = {
  supplierName: string | null;
  supplierInvoiceNumber: string | null;
  occurredAt: Date | null;
  toLocationId: string;
  lines: Array<InventoryLinePayload>;
};

export type TransferInventoryPayload = {
  fromLocationId: string;
  toLocationId: string;
  occurredAt: Date | null;
  lines: Array<Pick<InventoryLinePayload, "inventoryItemId" | "quantity" | "note">>;
};

export type UseInventoryPayload = {
  fromLocationId: string;
  jobId: string | null;
  occurredAt: Date | null;
  lines: Array<Pick<InventoryLinePayload, "inventoryItemId" | "quantity" | "note">>;
};

export type AdjustInventoryPayload = {
  movementType: Extract<InventoryMovementType, "adjustment" | "damaged" | "returned">;
  fromLocationId: string | null;
  toLocationId: string | null;
  occurredAt: Date | null;
  lines: Array<Pick<InventoryLinePayload, "inventoryItemId" | "quantity" | "note">>;
};

function requireObject(value: unknown, fieldName: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string, maxLength = 255) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }

  return trimmed;
}

function optionalString(value: unknown, fieldName: string, maxLength = 255) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requireString(value, fieldName, maxLength);
}

function requireBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be true or false.`);
  }

  return value;
}

function requireInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer.`);
  }

  return value;
}

function optionalInteger(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requireInteger(value, fieldName);
}

function requireEnumValue<TValue extends string>(
  value: unknown,
  fieldName: string,
  allowedValues: readonly TValue[],
) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  if (!allowedValues.includes(value as TValue)) {
    throw new Error(`${fieldName} must be one of: ${allowedValues.join(", ")}.`);
  }

  return value as TValue;
}

function optionalDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a date string.`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return parsed;
}

function optionalUuid(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return parseUuidParam(value, fieldName);
}

function requireDecimalString(value: unknown, fieldName: string) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`${fieldName} must be a number.`);
  }

  const normalized = String(value).trim();

  if (!/^\d+(\.\d{1,4})?$/.test(normalized)) {
    throw new Error(`${fieldName} must be a positive number with up to 4 decimals.`);
  }

  return normalized;
}

function requireLines(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("At least one inventory line is required.");
  }

  return value.map((entry, index) => {
    const payload = requireObject(entry, `lines[${index}]`);

    return {
      inventoryItemId: parseUuidParam(payload.inventoryItemId, `lines[${index}].inventoryItemId`),
      quantity: requireDecimalString(payload.quantity, `lines[${index}].quantity`),
      unitCostBeforeTaxCents: optionalInteger(payload.unitCostBeforeTaxCents, `lines[${index}].unitCostBeforeTaxCents`),
      taxPaidCents: optionalInteger(payload.taxPaidCents, `lines[${index}].taxPaidCents`),
      totalPaidCents: optionalInteger(payload.totalPaidCents, `lines[${index}].totalPaidCents`),
      note: optionalString(payload.note, `lines[${index}].note`, 4000),
    };
  });
}

export function parseUuidParam(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    throw new Error(`${fieldName} must be a valid UUID.`);
  }

  return trimmed;
}

export function parseInventoryItemListQuery(query: Record<string, unknown>): InventoryItemListQuery {
  return {
    q: typeof query.q === "string" ? query.q.trim() : "",
    activeState: typeof query.activeState === "string"
      ? requireEnumValue(query.activeState, "activeState", inventoryActiveStates)
      : "active",
  };
}

export function parseInventoryLocationListQuery(query: Record<string, unknown>): InventoryLocationListQuery {
  return {
    activeState: typeof query.activeState === "string"
      ? requireEnumValue(query.activeState, "activeState", inventoryActiveStates)
      : "active",
  };
}

export function parseInventoryMovementListQuery(query: Record<string, unknown>): InventoryMovementListQuery {
  const page = Number.parseInt(typeof query.page === "string" ? query.page : "1", 10);
  const pageSize = Number.parseInt(typeof query.pageSize === "string" ? query.pageSize : "25", 10);

  return {
    q: typeof query.q === "string" ? query.q.trim() : "",
    movementType: typeof query.movementType === "string" && query.movementType
      ? requireEnumValue(query.movementType, "movementType", inventoryMovementTypes)
      : "",
    itemId: typeof query.itemId === "string" ? query.itemId.trim() : "",
    locationId: typeof query.locationId === "string" ? query.locationId.trim() : "",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && [10, 25, 50, 100].includes(pageSize) ? pageSize : 25,
  };
}

export function parseInventoryStockListQuery(query: Record<string, unknown>): InventoryStockListQuery {
  return {
    q: typeof query.q === "string" ? query.q.trim() : "",
    locationId: typeof query.locationId === "string" ? query.locationId.trim() : "",
    lowStockOnly: ["1", "true"].includes(String(query.lowStockOnly ?? "").trim().toLowerCase()),
    activeState: typeof query.activeState === "string"
      ? requireEnumValue(query.activeState, "activeState", inventoryActiveStates)
      : "active",
  };
}

export function parseCreateInventoryItemPayload(body: unknown): CreateInventoryItemPayload {
  const payload = requireObject(body, "body");

  return {
    internalSku: requireString(payload.internalSku, "internalSku", 128),
    name: requireString(payload.name, "name", 255),
    itemType: requireEnumValue(payload.itemType, "itemType", inventoryItemTypes),
    unitOfMeasure: requireEnumValue(payload.unitOfMeasure, "unitOfMeasure", inventoryUnitOfMeasures),
    defaultCostBeforeTaxCents: requireInteger(payload.defaultCostBeforeTaxCents ?? 0, "defaultCostBeforeTaxCents"),
    defaultTaxCents: optionalInteger(payload.defaultTaxCents, "defaultTaxCents"),
    defaultTotalPaidCents: optionalInteger(payload.defaultTotalPaidCents, "defaultTotalPaidCents"),
    supplierName: optionalString(payload.supplierName, "supplierName"),
    supplierSku: optionalString(payload.supplierSku, "supplierSku", 128),
    reorderPoint: payload.reorderPoint === undefined || payload.reorderPoint === null || payload.reorderPoint === ""
      ? null
      : requireDecimalString(payload.reorderPoint, "reorderPoint"),
    notes: optionalString(payload.notes, "notes", 4000),
    isActive: payload.isActive === undefined ? true : requireBoolean(payload.isActive, "isActive"),
  };
}

export function parseUpdateInventoryItemPayload(body: unknown): UpdateInventoryItemPayload {
  const payload = requireObject(body, "body");
  const nextPayload: UpdateInventoryItemPayload = {};

  if (payload.internalSku !== undefined) {
    nextPayload.internalSku = requireString(payload.internalSku, "internalSku", 128);
  }

  if (payload.name !== undefined) {
    nextPayload.name = requireString(payload.name, "name", 255);
  }

  if (payload.itemType !== undefined) {
    nextPayload.itemType = requireEnumValue(payload.itemType, "itemType", inventoryItemTypes);
  }

  if (payload.unitOfMeasure !== undefined) {
    nextPayload.unitOfMeasure = requireEnumValue(payload.unitOfMeasure, "unitOfMeasure", inventoryUnitOfMeasures);
  }

  if (payload.defaultCostBeforeTaxCents !== undefined) {
    nextPayload.defaultCostBeforeTaxCents = requireInteger(payload.defaultCostBeforeTaxCents, "defaultCostBeforeTaxCents");
  }

  if (payload.defaultTaxCents !== undefined) {
    nextPayload.defaultTaxCents = optionalInteger(payload.defaultTaxCents, "defaultTaxCents");
  }

  if (payload.defaultTotalPaidCents !== undefined) {
    nextPayload.defaultTotalPaidCents = optionalInteger(payload.defaultTotalPaidCents, "defaultTotalPaidCents");
  }

  if (payload.supplierName !== undefined) {
    nextPayload.supplierName = optionalString(payload.supplierName, "supplierName");
  }

  if (payload.supplierSku !== undefined) {
    nextPayload.supplierSku = optionalString(payload.supplierSku, "supplierSku", 128);
  }

  if (payload.reorderPoint !== undefined) {
    nextPayload.reorderPoint = payload.reorderPoint === null || payload.reorderPoint === ""
      ? null
      : requireDecimalString(payload.reorderPoint, "reorderPoint");
  }

  if (payload.notes !== undefined) {
    nextPayload.notes = optionalString(payload.notes, "notes", 4000);
  }

  if (payload.isActive !== undefined) {
    nextPayload.isActive = requireBoolean(payload.isActive, "isActive");
  }

  return nextPayload;
}

export function parseCreateInventoryLocationPayload(body: unknown): CreateInventoryLocationPayload {
  const payload = requireObject(body, "body");

  return {
    name: requireString(payload.name, "name", 255),
    locationType: requireEnumValue(payload.locationType, "locationType", inventoryLocationTypes),
    assignedUserId: optionalUuid(payload.assignedUserId, "assignedUserId"),
    isCompanyOwned: payload.isCompanyOwned === undefined ? true : requireBoolean(payload.isCompanyOwned, "isCompanyOwned"),
    vehicleLabel: optionalString(payload.vehicleLabel, "vehicleLabel", 120),
    licensePlate: optionalString(payload.licensePlate, "licensePlate", 40),
    notes: optionalString(payload.notes, "notes", 4000),
    isActive: payload.isActive === undefined ? true : requireBoolean(payload.isActive, "isActive"),
  };
}

export function parseUpdateInventoryLocationPayload(body: unknown): UpdateInventoryLocationPayload {
  const payload = requireObject(body, "body");
  const nextPayload: UpdateInventoryLocationPayload = {};

  if (payload.name !== undefined) {
    nextPayload.name = requireString(payload.name, "name", 255);
  }

  if (payload.locationType !== undefined) {
    nextPayload.locationType = requireEnumValue(payload.locationType, "locationType", inventoryLocationTypes);
  }

  if (payload.assignedUserId !== undefined) {
    nextPayload.assignedUserId = optionalUuid(payload.assignedUserId, "assignedUserId");
  }

  if (payload.isCompanyOwned !== undefined) {
    nextPayload.isCompanyOwned = requireBoolean(payload.isCompanyOwned, "isCompanyOwned");
  }

  if (payload.vehicleLabel !== undefined) {
    nextPayload.vehicleLabel = optionalString(payload.vehicleLabel, "vehicleLabel", 120);
  }

  if (payload.licensePlate !== undefined) {
    nextPayload.licensePlate = optionalString(payload.licensePlate, "licensePlate", 40);
  }

  if (payload.notes !== undefined) {
    nextPayload.notes = optionalString(payload.notes, "notes", 4000);
  }

  if (payload.isActive !== undefined) {
    nextPayload.isActive = requireBoolean(payload.isActive, "isActive");
  }

  return nextPayload;
}

export function parseReceiveInventoryPayload(body: unknown): ReceiveInventoryPayload {
  const payload = requireObject(body, "body");

  return {
    supplierName: optionalString(payload.supplierName, "supplierName"),
    supplierInvoiceNumber: optionalString(payload.supplierInvoiceNumber, "supplierInvoiceNumber", 128),
    occurredAt: optionalDate(payload.occurredAt, "occurredAt"),
    toLocationId: parseUuidParam(payload.toLocationId, "toLocationId"),
    lines: requireLines(payload.lines),
  };
}

export function parseTransferInventoryPayload(body: unknown): TransferInventoryPayload {
  const payload = requireObject(body, "body");

  return {
    fromLocationId: parseUuidParam(payload.fromLocationId, "fromLocationId"),
    toLocationId: parseUuidParam(payload.toLocationId, "toLocationId"),
    occurredAt: optionalDate(payload.occurredAt, "occurredAt"),
    lines: requireLines(payload.lines).map((line) => ({
      inventoryItemId: line.inventoryItemId,
      quantity: line.quantity,
      note: line.note ?? null,
    })),
  };
}

export function parseUseInventoryPayload(body: unknown): UseInventoryPayload {
  const payload = requireObject(body, "body");

  return {
    fromLocationId: parseUuidParam(payload.fromLocationId, "fromLocationId"),
    jobId: optionalUuid(payload.jobId, "jobId"),
    occurredAt: optionalDate(payload.occurredAt, "occurredAt"),
    lines: requireLines(payload.lines).map((line) => ({
      inventoryItemId: line.inventoryItemId,
      quantity: line.quantity,
      note: line.note ?? null,
    })),
  };
}

export function parseAdjustInventoryPayload(body: unknown): AdjustInventoryPayload {
  const payload = requireObject(body, "body");

  return {
    movementType: requireEnumValue(payload.movementType, "movementType", ["adjustment", "damaged", "returned"] as const),
    fromLocationId: optionalUuid(payload.fromLocationId, "fromLocationId"),
    toLocationId: optionalUuid(payload.toLocationId, "toLocationId"),
    occurredAt: optionalDate(payload.occurredAt, "occurredAt"),
    lines: requireLines(payload.lines).map((line) => ({
      inventoryItemId: line.inventoryItemId,
      quantity: line.quantity,
      note: line.note ?? null,
    })),
  };
}