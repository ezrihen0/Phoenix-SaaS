import { roleHasPermission } from "../auth/permissions";

export const inventoryItemTypes = [
  "part",
  "consumable",
  "tool",
  "equipment",
  "material",
  "other",
] as const;

export const inventoryUnitOfMeasures = [
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

export const inventoryLocationTypes = [
  "warehouse",
  "company_vehicle",
  "technician_vehicle",
  "technician_kit",
  "job_site",
  "other",
] as const;

export const inventoryTechnicianVisibleLocationTypes = [
  "company_vehicle",
  "technician_vehicle",
  "technician_kit",
] as const;

export const inventoryMovementTypes = [
  "received",
  "transfer",
  "used",
  "adjustment",
  "damaged",
  "returned",
] as const;

export const inventoryActiveStates = ["active", "archived", "all"] as const;

export type InventoryItemType = (typeof inventoryItemTypes)[number];
export type InventoryUnitOfMeasure = (typeof inventoryUnitOfMeasures)[number];
export type InventoryLocationType = (typeof inventoryLocationTypes)[number];
export type InventoryMovementType = (typeof inventoryMovementTypes)[number];
export type InventoryActiveState = (typeof inventoryActiveStates)[number];

export function isInventoryOfficeRole(role: string | null | undefined) {
  return roleHasPermission(role, "inventory.view");
}

export function canManageInventory(role: string | null | undefined) {
  return roleHasPermission(role, "inventory.manage");
}

export function getInventoryMovementLabel(value: InventoryMovementType) {
  switch (value) {
    case "received":
      return "Received";
    case "transfer":
      return "Transfer";
    case "used":
      return "Used";
    case "adjustment":
      return "Adjustment";
    case "damaged":
      return "Damaged";
    case "returned":
      return "Returned";
    default:
      return value;
  }
}