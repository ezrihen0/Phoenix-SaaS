import { InventoryStockTable } from "@/components/inventory-stock-table";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerRoles } from "@/lib/auth/server-session";
import type {
  InventoryListResult,
  InventoryLocationListResult,
  InventoryMovementListResult,
  InventoryStockResult,
  InventoryTechnicianOption,
} from "@/lib/crm/inventory-model";

function canFetchItemCatalog(role: string | null) {
  return role === "owner" || role === "admin" || role === "office_admin";
}

export default async function InventoryPage() {
  const session = await requireServerRoles("/inventory", [
    "owner",
    "admin",
    "office_admin",
    "dispatcher",
    "technician",
  ]);
  const role = session.profile?.role ?? null;

  let itemsResult: InventoryListResult = { items: [], totalCount: 0 };
  let locationsResult: InventoryLocationListResult = { locations: [], totalCount: 0 };
  let stockResult: InventoryStockResult = {
    rows: [],
    lowStockRows: [],
    totals: { itemCount: 0, locationCount: 0, lowStockCount: 0 },
  };
  let movementResult: InventoryMovementListResult = {
    movements: [],
    totalCount: 0,
    page: 1,
    pageSize: 200,
  };
  let technicians: InventoryTechnicianOption[] = [];
  let loadError: string | null = null;
  let catalogLoadError: string | null = null;

  const loadErrors: string[] = [];

  try {
    locationsResult = await serverApiFetch<InventoryLocationListResult>("/api/inventory/locations?activeState=all");
  } catch (error) {
    loadErrors.push(error instanceof Error ? error.message : "Inventory locations could not be loaded.");
  }

  try {
    stockResult = await serverApiFetch<InventoryStockResult>("/api/inventory/stock?activeState=all");
  } catch (error) {
    loadErrors.push(error instanceof Error ? error.message : "Inventory stock could not be loaded.");
  }

  try {
    movementResult = await serverApiFetch<InventoryMovementListResult>("/api/inventory/movements?page=1&pageSize=200");
  } catch (error) {
    loadErrors.push(error instanceof Error ? error.message : "Inventory movements could not be loaded.");
  }

  if (canFetchItemCatalog(role)) {
    try {
      itemsResult = await serverApiFetch<InventoryListResult>("/api/inventory/items?activeState=all");
    } catch (error) {
      catalogLoadError = error instanceof Error ? error.message : "The item catalog could not be loaded.";
    }
  }

  if (role === "office_admin") {
    try {
      technicians = await serverApiFetch<InventoryTechnicianOption[]>("/api/technicians?active=true");
    } catch {
      technicians = [];
    }
  }

  if (loadErrors.length > 0) {
    loadError = loadErrors.join(" ");
  }

  return (
    <InventoryStockTable
      sessionRole={role}
      initialItems={itemsResult.items}
      initialLocations={locationsResult.locations}
      initialStockResult={stockResult}
      initialMovementResult={movementResult}
      initialTechnicians={technicians}
      loadError={loadError}
      catalogLoadError={catalogLoadError}
    />
  );
}
