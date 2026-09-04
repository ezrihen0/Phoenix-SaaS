import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { crmApiFetch } from "@/lib/crm/browser-api";
import type { InventoryItem, InventoryListResult } from "@/lib/crm/inventory-model";
import type { PricebookItem, PricebookItemType, PricebookUnitOfMeasure } from "@/lib/crm/pricebook-model";

const GAS_LABOR_CATEGORY = "Gas Labor & Services";

function mapPricebookItemType(itemType: PricebookItemType): InventoryItem["item_type"] {
  if (itemType === "part" || itemType === "product" || itemType === "repair" || itemType === "install") {
    return "part";
  }

  if (itemType === "service" || itemType === "labor" || itemType === "travel" || itemType === "inspection") {
    return "other";
  }

  return "material";
}

function mapPricebookUnit(unit: PricebookUnitOfMeasure): InventoryItem["unit_of_measure"] {
  if (unit === "each" || unit === "set") {
    return unit;
  }

  if (unit === "linear_foot") {
    return "foot";
  }

  if (unit === "square_foot") {
    return "custom";
  }

  if (unit === "hour" || unit === "visit" || unit === "custom") {
    return "custom";
  }

  return "each";
}

export function isGasSystemPricebookItem(item: Pick<PricebookItem, "system">) {
  return item.system?.code === "gas";
}

export function isPricebookItemInventoryEligible(item: PricebookItem) {
  if (!isGasSystemPricebookItem(item)) {
    return false;
  }

  if (item.category?.name === GAS_LABOR_CATEGORY) {
    return false;
  }

  if (item.item_type === "service" || item.item_type === "labor") {
    return false;
  }

  return true;
}

export async function ensureInventoryItemForPricebook(item: PricebookItem): Promise<InventoryItem> {
  const catalog = await crmApiFetch<InventoryListResult>(
    `/api/inventory/items?activeState=all&q=${encodeURIComponent(item.internal_sku)}`,
  );
  const existing = catalog.items.find((row) => row.internal_sku === item.internal_sku);

  if (existing) {
    return existing;
  }

  const defaultCostCents = item.material_cost_cents > 0
    ? item.material_cost_cents
    : item.base_cost_cents;

  return crmApiFetch<InventoryItem>("/api/inventory/items", {
    method: "POST",
    body: JSON.stringify({
      internalSku: item.internal_sku,
      name: item.name,
      itemType: mapPricebookItemType(item.item_type),
      unitOfMeasure: mapPricebookUnit(item.unit_of_measure),
      defaultCostBeforeTaxCents: defaultCostCents,
      supplierName: item.supplier_name,
      supplierSku: item.supplier_sku,
      notes: `Linked from Gas pricebook item ${item.internal_sku}.`,
      isActive: true,
    }),
  });
}

export async function openPricebookInventoryPurchase(item: PricebookItem, router: AppRouterInstance) {
  if (!isPricebookItemInventoryEligible(item)) {
    throw new Error("This catalog item is not eligible for inventory receiving.");
  }

  if (item.inventory_tracking_mode === "none") {
    await crmApiFetch(`/api/pricebook/items/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        inventoryTrackingMode: "future_tracked",
      }),
    });
  }

  const inventoryItem = await ensureInventoryItemForPricebook(item);
  router.push(`/inventory?receiveSku=${encodeURIComponent(inventoryItem.internal_sku)}`);
}
