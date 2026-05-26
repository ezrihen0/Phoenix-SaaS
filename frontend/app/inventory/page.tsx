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

  try {
    const [locationsResponse, stockResponse, movementResponse, itemResponse, technicianResponse] = await Promise.all([
      serverApiFetch<InventoryLocationListResult>("/api/inventory/locations?activeState=all"),
      serverApiFetch<InventoryStockResult>("/api/inventory/stock?activeState=all"),
      serverApiFetch<InventoryMovementListResult>("/api/inventory/movements?page=1&pageSize=200"),
      role === "technician"
        ? Promise.resolve({ items: [], totalCount: 0 } satisfies InventoryListResult)
        : serverApiFetch<InventoryListResult>("/api/inventory/items?activeState=all"),
      role === "office_admin"
        ? serverApiFetch<InventoryTechnicianOption[]>("/api/technicians?active=true").catch(() => [])
        : Promise.resolve([] as InventoryTechnicianOption[]),
    ]);

    locationsResult = locationsResponse;
    stockResult = stockResponse;
    movementResult = movementResponse;
    itemsResult = itemResponse;
    technicians = technicianResponse;
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The inventory workspace could not be loaded.";
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
    />
  );
}