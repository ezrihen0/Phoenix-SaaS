export const pricebookItemTypes = [
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

export const pricebookUnitOfMeasures = [
  "each",
  "hour",
  "visit",
  "linear_foot",
  "square_foot",
  "set",
  "custom",
] as const;

export const pricebookInventoryTrackingModes = [
  "none",
  "future_tracked",
  "consumable_future",
  "serialized_future",
  "vehicle_stock_future",
] as const;

export const pricebookActiveStates = ["active", "archived", "all"] as const;

export type PricebookItemType = (typeof pricebookItemTypes)[number];
export type PricebookUnitOfMeasure = (typeof pricebookUnitOfMeasures)[number];
export type PricebookInventoryTrackingMode = (typeof pricebookInventoryTrackingModes)[number];
export type PricebookActiveState = (typeof pricebookActiveStates)[number];