export const INVENTORY_ITEM_TYPES = [
  "part",
  "consumable",
  "tool",
  "equipment",
  "material",
  "other",
] as const;

export const INVENTORY_UNIT_OF_MEASURES = [
  "each",
  "tube",
  "box",
  "roll",
  "liter",
  "meter",
  "foot",
  "set",
  "custom",
] as const;

export const INVENTORY_LOCATION_TYPES = [
  "warehouse",
  "company_vehicle",
  "technician_vehicle",
  "technician_kit",
  "job_site",
  "other",
] as const;

export const INVENTORY_MOVEMENT_TYPES = [
  "received",
  "transfer",
  "used",
  "adjustment",
  "damaged",
  "returned",
] as const;

export const INVENTORY_ACTIVE_STATES = ["active", "archived", "all"] as const;

export type InventoryItemType = (typeof INVENTORY_ITEM_TYPES)[number];
export type InventoryUnitOfMeasure = (typeof INVENTORY_UNIT_OF_MEASURES)[number];
export type InventoryLocationType = (typeof INVENTORY_LOCATION_TYPES)[number];
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];
export type InventoryActiveState = (typeof INVENTORY_ACTIVE_STATES)[number];

export type InventoryItem = {
  id: string;
  internal_sku: string;
  name: string;
  item_type: InventoryItemType;
  unit_of_measure: InventoryUnitOfMeasure;
  default_cost_before_tax_cents: number;
  default_tax_cents: number | null;
  default_total_paid_cents: number | null;
  supplier_name: string | null;
  supplier_sku: string | null;
  reorder_point: string | null;
  notes: string | null;
  is_active: boolean;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  deleted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type InventoryLocation = {
  id: string;
  name: string;
  location_type: InventoryLocationType;
  assigned_user_id: string | null;
  is_company_owned: boolean;
  vehicle_label: string | null;
  license_plate: string | null;
  notes: string | null;
  is_active: boolean;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  deleted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type InventoryMovement = {
  id: string;
  inventory_item_id: string;
  movement_type: InventoryMovementType;
  quantity: string;
  quantity_number: number;
  quantity_display: string;
  from_location_id: string | null;
  to_location_id: string | null;
  unit_cost_before_tax_cents: number | null;
  tax_paid_cents: number | null;
  total_paid_cents: number | null;
  supplier_name: string | null;
  supplier_invoice_number: string | null;
  job_id: string | null;
  invoice_id: string | null;
  note: string | null;
  created_by_user_id: string | null;
  occurred_at: string | null;
  created_at: string;
  item_name: string | null;
  item_sku: string | null;
  item_type: InventoryItemType | null;
  unit_of_measure: InventoryUnitOfMeasure | null;
  from_location_name: string | null;
  to_location_name: string | null;
};

export type InventoryListResult = {
  items: InventoryItem[];
  totalCount: number;
};

export type InventoryLocationListResult = {
  locations: InventoryLocation[];
  totalCount: number;
};

export type InventoryStockLocationRow = {
  location_id: string;
  location_name: string;
  location_type: InventoryLocationType;
  assigned_user_id: string | null;
  quantity: number;
  quantity_display: string;
};

export type InventoryLowStockRow = {
  item_id: string;
  internal_sku: string;
  name: string;
  unit_of_measure: InventoryUnitOfMeasure;
  location_id: string;
  location_name: string;
  quantity: number;
  quantity_display: string;
  reorder_point: number;
  reorder_point_display: string;
};

export type InventoryStockRow = {
  item_id: string;
  internal_sku: string;
  name: string;
  item_type: InventoryItemType;
  unit_of_measure: InventoryUnitOfMeasure;
  supplier_name: string | null;
  reorder_point: number | null;
  reorder_point_display: string | null;
  is_active: boolean;
  total_quantity: number;
  total_quantity_display: string;
  locations: InventoryStockLocationRow[];
  low_stock_locations: Array<{
    location_id: string;
    location_name: string;
    quantity: number;
    quantity_display: string;
    reorder_point: number;
    reorder_point_display: string;
  }>;
};

export type InventoryStockResult = {
  rows: InventoryStockRow[];
  lowStockRows: InventoryLowStockRow[];
  totals: {
    itemCount: number;
    locationCount: number;
    lowStockCount: number;
  };
};

export type InventoryMovementListResult = {
  movements: InventoryMovement[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type InventoryTechnicianOption = {
  id: string;
  auth_user_id: string | null;
  display_name: string;
  phone: string | null;
  is_active: boolean;
};

function titleCaseWords(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatInventoryCurrencyFromCents(cents: number | null | undefined) {
  if (typeof cents !== "number") {
    return "-";
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

export function formatInventoryDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function formatInventoryQuantity(value: number | string | null | undefined) {
  const resolved = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseFloat(value)
      : Number.NaN;

  if (!Number.isFinite(resolved)) {
    return "0";
  }

  return resolved.toFixed(4).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function getInventoryItemTypeLabel(value: InventoryItemType) {
  return titleCaseWords(value);
}

export function getInventoryUnitLabel(value: InventoryUnitOfMeasure) {
  return titleCaseWords(value);
}

export function getInventoryLocationTypeLabel(value: InventoryLocationType) {
  return titleCaseWords(value);
}

export function getInventoryMovementTypeLabel(value: InventoryMovementType) {
  return titleCaseWords(value);
}

export function inventoryStatusLabel(record: Pick<InventoryItem | InventoryLocation, "is_active" | "archived_at">) {
  return record.is_active && !record.archived_at ? "Active" : "Archived";
}