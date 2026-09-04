export const PRICEBOOK_ITEM_TYPES = [
  "service",
  "product",
  "part",
  "fee",
  "discount",
  "labor",
  "travel",
  "inspection",
  "repair",
  "install",
] as const;

export const PRICEBOOK_UNIT_OF_MEASURES = [
  "each",
  "hour",
  "visit",
  "linear_foot",
  "square_foot",
  "set",
  "custom",
] as const;

export const PRICEBOOK_INVENTORY_TRACKING_MODES = [
  "none",
  "future_tracked",
  "consumable_future",
  "serialized_future",
  "vehicle_stock_future",
] as const;

export const PRICEBOOK_ACTIVE_STATES = ["active", "archived", "all"] as const;

export type PricebookItemType = (typeof PRICEBOOK_ITEM_TYPES)[number];
export type PricebookUnitOfMeasure = (typeof PRICEBOOK_UNIT_OF_MEASURES)[number];
export type PricebookInventoryTrackingMode = (typeof PRICEBOOK_INVENTORY_TRACKING_MODES)[number];
export type PricebookActiveState = (typeof PRICEBOOK_ACTIVE_STATES)[number];

export type PricebookSystem = {
  id: string;
  name: string;
  code: string;
};

export type PricebookSystemListResult = {
  systems: PricebookSystem[];
};

export type PricebookCategory = {
  id: string;
  name: string;
  system_id: string | null;
  system: PricebookSystem | null;
};

export type PricebookCategoryListResult = {
  categories: PricebookCategory[];
};

export type PricebookNavigationSummary = {
  total_count: number;
  systems: Array<PricebookSystem & { item_count: number }>;
  categories: Array<PricebookCategory & { item_count: number }>;
};

export type PricebookItem = {
  id: string;
  internal_sku: string;
  name: string;
  customer_description: string | null;
  internal_description: string | null;
  item_type: PricebookItemType;
  category_id: string | null;
  category: PricebookCategory | null;
  system_id: string | null;
  system: PricebookSystem | null;
  trade_area: string | null;
  service_area: string | null;
  tags: string[];
  unit_of_measure: PricebookUnitOfMeasure;
  base_cost_cents: number;
  material_cost_cents: number;
  labor_cost_cents: number;
  customer_price_cents: number;
  minimum_price_cents: number | null;
  estimated_labor_minutes: number | null;
  warranty_months: number | null;
  image_url?: string | null;
  requires_permit: boolean;
  inventory_tracking_mode: PricebookInventoryTrackingMode;
  supplier_name: string | null;
  supplier_sku: string | null;
  inventory_notes: string | null;
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  deleted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PricebookItemListResult = {
  items: PricebookItem[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type PricebookBundle = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  deleted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PricebookBundleItem = {
  id: string;
  bundle_id: string;
  pricebook_item_id: string;
  default_quantity: string;
  sort_order: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  deleted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  pricebook_item: PricebookItem | null;
};

export type PricebookBundleListResult = {
  items: PricebookBundle[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type PricebookBundleRequirement = {
  id: string;
  bundle_id: string;
  label: string;
  category_id: string;
  default_quantity: string;
  sort_order: number;
  category: PricebookCategory | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PricebookBundleDetail = PricebookBundle & {
  items: PricebookBundleItem[];
  requirements: PricebookBundleRequirement[];
};

export type PricebookItemFilters = {
  q: string;
  itemType: string;
  systemId: string;
  categoryId: string;
  tradeArea: string;
  activeState: PricebookActiveState;
  popularOnly: boolean;
  page: number;
  pageSize: number;
};

export type PricebookBundleFilters = {
  q: string;
  activeState: PricebookActiveState;
  page: number;
  pageSize: number;
};

function titleCaseWords(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatCurrencyFromCents(cents: number | null | undefined) {
  if (typeof cents !== "number") {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function getPricebookItemTypeLabel(value: PricebookItemType) {
  return titleCaseWords(value);
}

export function getPricebookUnitLabel(value: PricebookUnitOfMeasure) {
  if (value === "linear_foot") {
    return "Linear Foot";
  }

  if (value === "square_foot") {
    return "Square Foot";
  }

  return titleCaseWords(value);
}

export function getInventoryTrackingLabel(value: PricebookInventoryTrackingMode) {
  if (value === "future_tracked") {
    return "Future Tracked";
  }

  if (value === "consumable_future") {
    return "Consumable Future";
  }

  if (value === "serialized_future") {
    return "Serialized Future";
  }

  if (value === "vehicle_stock_future") {
    return "Vehicle Stock Future";
  }

  return titleCaseWords(value);
}

export function buildPricebookItemQuery(filters: Partial<PricebookItemFilters>) {
  const params = new URLSearchParams();

  if (filters.q?.trim()) {
    params.set("q", filters.q.trim());
  }

  if (filters.itemType?.trim()) {
    params.set("itemType", filters.itemType.trim());
  }

  if (filters.systemId?.trim()) {
    params.set("systemId", filters.systemId.trim());
  }

  if (filters.categoryId?.trim()) {
    params.set("categoryId", filters.categoryId.trim());
  }

  if (filters.tradeArea?.trim()) {
    params.set("tradeArea", filters.tradeArea.trim());
  }

  if (filters.activeState && filters.activeState !== "active") {
    params.set("activeState", filters.activeState);
  }

  if (filters.popularOnly) {
    params.set("popularOnly", "true");
  }

  if (filters.page && filters.page > 1) {
    params.set("page", String(filters.page));
  }

  if (filters.pageSize && filters.pageSize !== 50) {
    params.set("pageSize", String(filters.pageSize));
  }

  return params;
}

export function buildPricebookNavigationSummaryQuery(
  filters: Pick<PricebookItemFilters, "q" | "itemType" | "tradeArea" | "activeState" | "popularOnly">,
) {
  const params = new URLSearchParams();

  if (filters.q?.trim()) {
    params.set("q", filters.q.trim());
  }

  if (filters.itemType?.trim()) {
    params.set("itemType", filters.itemType.trim());
  }

  if (filters.tradeArea?.trim()) {
    params.set("tradeArea", filters.tradeArea.trim());
  }

  if (filters.activeState && filters.activeState !== "active") {
    params.set("activeState", filters.activeState);
  }

  if (filters.popularOnly) {
    params.set("popularOnly", "true");
  }

  return params;
}

export function buildPricebookBundleQuery(filters: Partial<PricebookBundleFilters>) {
  const params = new URLSearchParams();

  if (filters.q?.trim()) {
    params.set("q", filters.q.trim());
  }

  if (filters.activeState && filters.activeState !== "active") {
    params.set("activeState", filters.activeState);
  }

  if (filters.page && filters.page > 1) {
    params.set("page", String(filters.page));
  }

  if (filters.pageSize && filters.pageSize !== 50) {
    params.set("pageSize", String(filters.pageSize));
  }

  return params;
}

export function itemHasWarranty(warrantyMonths: number | null | undefined) {
  return typeof warrantyMonths === "number" && Number.isInteger(warrantyMonths) && warrantyMonths > 0;
}

export function parseRequiredCategory(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Category is required.");
  }

  if (trimmed.length > 120) {
    throw new Error("Category must be 120 characters or less.");
  }

  return trimmed;
}

export function parseRequiredItemName(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Item Name is required.");
  }

  if (trimmed.length > 255) {
    throw new Error("Item Name must be 255 characters or less.");
  }

  return trimmed;
}

export function parseCadPriceToCents(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Price is required.");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Price must be a CAD amount with up to two decimals.");
  }

  const cents = Math.round(Number(trimmed) * 100);

  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error("Price must be 0 or greater.");
  }

  return cents;
}

export function parseWarrantyDurationMonths(value: string, warrantyEnabled: boolean) {
  if (!warrantyEnabled) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Warranty Duration is required when Warranty is on.");
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error("Warranty Duration must be a positive whole number of months.");
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Warranty Duration must be a positive whole number of months.");
  }

  return parsed;
}

export function itemStatusLabel(item: Pick<PricebookItem, "is_active" | "archived_at">) {
  return item.is_active && !item.archived_at ? "Active" : "Archived";
}

export function bundleStatusLabel(bundle: Pick<PricebookBundle, "is_active" | "archived_at">) {
  return bundle.is_active && !bundle.archived_at ? "Active" : "Archived";
}