"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, PackagePlus, RefreshCcw, Search, ShieldCheck, Truck, Warehouse } from "lucide-react";

import {
  MasterMobileList,
  MasterTable,
  MasterTableRow,
  type MasterTableState,
} from "@/components/master-table";
import { InventoryItemForm } from "@/components/inventory-item-form";
import { InventoryLocationForm } from "@/components/inventory-location-form";
import { InventoryMovementHistory } from "@/components/inventory-movement-history";
import { InventoryReceiveStockDialog } from "@/components/inventory-receive-stock-dialog";
import { InventoryTransferStockDialog } from "@/components/inventory-transfer-stock-dialog";
import { InventoryUseStockDialog } from "@/components/inventory-use-stock-dialog";
import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  formatInventoryCurrencyFromCents,
  formatInventoryDateTime,
  getInventoryItemTypeLabel,
  getInventoryLocationTypeLabel,
  inventoryStatusLabel,
  type InventoryItem,
  type InventoryLocation,
  type InventoryMovement,
  type InventoryMovementListResult,
  type InventoryMovementType,
  type InventoryStockResult,
  type InventoryTechnicianOption,
} from "@/lib/crm/inventory-model";

type InventoryStockTableProps = {
  sessionRole: string | null;
  initialItems: InventoryItem[];
  initialLocations: InventoryLocation[];
  initialStockResult: InventoryStockResult;
  initialMovementResult: InventoryMovementListResult;
  initialTechnicians: InventoryTechnicianOption[];
  loadError?: string | null;
};

const itemColumns = [
  { key: "actions", label: "Actions", align: "center" as const },
  { key: "sku", label: "SKU", align: "center" as const },
  { key: "name", label: "Name" },
  { key: "type", label: "Type", align: "center" as const },
  { key: "unit", label: "Unit", align: "center" as const },
  { key: "cost", label: "Default Cost", align: "center" as const },
  { key: "supplier", label: "Supplier", align: "center" as const },
  { key: "reorder", label: "Reorder", align: "center" as const },
  { key: "status", label: "Status", align: "center" as const },
];

const locationColumns = [
  { key: "actions", label: "Actions", align: "center" as const },
  { key: "name", label: "Location" },
  { key: "type", label: "Type", align: "center" as const },
  { key: "assignment", label: "Assignment", align: "center" as const },
  { key: "vehicle", label: "Vehicle", align: "center" as const },
  { key: "status", label: "Status", align: "center" as const },
];

const stockColumns = [
  { key: "item", label: "Item" },
  { key: "type", label: "Type", align: "center" as const },
  { key: "locations", label: "Locations", align: "center" as const },
  { key: "total", label: "Total", align: "center" as const },
  { key: "reorder", label: "Reorder", align: "center" as const },
];

export function InventoryStockTable({
  sessionRole,
  initialItems,
  initialLocations,
  initialStockResult,
  initialMovementResult,
  initialTechnicians,
  loadError = null,
}: InventoryStockTableProps) {
  const router = useRouter();
  const isOfficeRole = sessionRole !== "technician";
  const [itemQuery, setItemQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [movementQuery, setMovementQuery] = useState("");
  const [movementTypeFilter, setMovementTypeFilter] = useState<InventoryMovementType | "">("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [itemFormMode, setItemFormMode] = useState<"create" | "edit" | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [locationFormMode, setLocationFormMode] = useState<"create" | "edit" | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<InventoryLocation | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [movementDialogMode, setMovementDialogMode] = useState<"used" | "adjustment" | "damaged" | "returned" | null>(null);
  const [isSettingUpDefaults, setIsSettingUpDefaults] = useState(false);

  const filteredItems = useMemo(
    () => initialItems.filter((item) => {
      const search = itemQuery.trim().toLowerCase();

      if (!search) {
        return true;
      }

      return [item.internal_sku, item.name, item.supplier_name, item.supplier_sku]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    }),
    [initialItems, itemQuery],
  );

  const filteredLocations = useMemo(
    () => initialLocations.filter((location) => {
      if (!itemQuery.trim()) {
        return true;
      }

      const haystack = [location.name, location.vehicle_label, location.license_plate, location.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(itemQuery.trim().toLowerCase());
    }),
    [initialLocations, itemQuery],
  );

  const filteredStockRows = useMemo(
    () => initialStockResult.rows.filter((row) => {
      const search = itemQuery.trim().toLowerCase();

      if (search) {
        const haystack = [row.internal_sku, row.name, row.supplier_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(search)) {
          return false;
        }
      }

      if (locationFilter && !row.locations.some((location) => location.location_id === locationFilter)) {
        return false;
      }

      if (lowStockOnly && row.low_stock_locations.length === 0) {
        return false;
      }

      return true;
    }),
    [initialStockResult.rows, itemQuery, locationFilter, lowStockOnly],
  );

  const filteredLowStockRows = useMemo(
    () => initialStockResult.lowStockRows.filter((row) => !locationFilter || row.location_id === locationFilter),
    [initialStockResult.lowStockRows, locationFilter],
  );

  const filteredMovements = useMemo(
    () => initialMovementResult.movements.filter((movement) => {
      if (movementTypeFilter && movement.movement_type !== movementTypeFilter) {
        return false;
      }

      if (!movementQuery.trim()) {
        return true;
      }

      const haystack = [
        movement.item_name,
        movement.item_sku,
        movement.from_location_name,
        movement.to_location_name,
        movement.note,
        movement.supplier_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(movementQuery.trim().toLowerCase());
    }),
    [initialMovementResult.movements, movementQuery, movementTypeFilter],
  );

  const itemTableState: MasterTableState = filteredItems.length === 0
    ? { status: "empty", message: "No inventory items match the current view." }
    : { status: "ready" };
  const locationTableState: MasterTableState = filteredLocations.length === 0
    ? { status: "empty", message: "No inventory locations match the current view." }
    : { status: "ready" };
  const stockTableState: MasterTableState = loadError
    ? { status: "error", message: loadError }
    : filteredStockRows.length === 0
      ? { status: "empty", message: "No stock rows match the current filters." }
      : { status: "ready" };

  async function handleArchive(endpoint: string, resourceLabel: string) {
    const confirmed = typeof window === "undefined" ? true : window.confirm(`Archive this ${resourceLabel}?`);

    if (!confirmed) {
      return;
    }

    setActionError(null);
    setBusyActionId(endpoint);

    try {
      await crmApiFetch(endpoint, { method: "DELETE" });
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `The ${resourceLabel} could not be archived.`);
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleCreateDefaultLocations() {
    setActionError(null);
    setIsSettingUpDefaults(true);

    try {
      const defaults = [
        { name: "Main Warehouse", locationType: "warehouse", isCompanyOwned: true, vehicleLabel: null },
        { name: "Tech 1 Stock", locationType: "technician_vehicle", isCompanyOwned: true, vehicleLabel: "Tech 1 Stock" },
        { name: "Tech 2 Stock", locationType: "technician_vehicle", isCompanyOwned: true, vehicleLabel: "Tech 2 Stock" },
        { name: "Tech 3 Stock", locationType: "technician_vehicle", isCompanyOwned: true, vehicleLabel: "Tech 3 Stock" },
        { name: "Tech 4 Stock", locationType: "technician_vehicle", isCompanyOwned: true, vehicleLabel: "Tech 4 Stock" },
      ] as const;

      for (const location of defaults) {
        await crmApiFetch("/api/inventory/locations", {
          method: "POST",
          body: JSON.stringify({
            name: location.name,
            locationType: location.locationType,
            assignedUserId: null,
            isCompanyOwned: location.isCompanyOwned,
            vehicleLabel: location.vehicleLabel,
            licensePlate: null,
            notes: null,
            isActive: true,
          }),
        });
      }

      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The default location helper could not complete.");
    } finally {
      setIsSettingUpDefaults(false);
    }
  }

  function handleDialogSaved() {
    setItemFormMode(null);
    setSelectedItem(null);
    setLocationFormMode(null);
    setSelectedLocation(null);
    setReceiveOpen(false);
    setTransferOpen(false);
    setMovementDialogMode(null);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="mx-auto max-w-[92rem] px-6 py-12 lg:px-10">
        <section className="inventory-display-panel theme-surface-modal rounded-[36px] border border-[color:var(--cmp-border-subtle)] p-7 shadow-[0_28px_80px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <p className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--sem-accent-primary)]">Inventory Engine</p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                Manual, movement-based stock control across warehouse, vehicles, kits, and job usage.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                Inventory stays separate from pricebook and invoices. Stock on hand is calculated only from receive, transfer, use, damage, return, and adjustment movements.
              </p>
            </div>

            {isOfficeRole ? (
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => { setSelectedItem(null); setItemFormMode("create"); }} className="theme-btn-secondary rounded-full px-5 py-3 text-sm font-medium">Add item</button>
                <button type="button" onClick={() => { setSelectedLocation(null); setLocationFormMode("create"); }} className="theme-control-surface rounded-full px-5 py-3 text-sm font-medium">Add location</button>
                <button type="button" onClick={() => setReceiveOpen(true)} className="theme-control-surface rounded-full px-5 py-3 text-sm font-medium">Receive stock</button>
                <button type="button" onClick={() => setTransferOpen(true)} className="theme-control-surface rounded-full px-5 py-3 text-sm font-medium">Transfer stock</button>
              </div>
            ) : (
              <div className="theme-surface-card max-w-sm rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5 text-sm text-[color:var(--sem-text-secondary)]">
                Technician access is read-only in V1. You can see inventory assigned to your own vehicle or kit locations only.
              </div>
            )}
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Inventory items</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{initialItems.length}</p>
            </article>
            <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Locations</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{initialLocations.length}</p>
            </article>
            <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Stock rows</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{initialStockResult.rows.length}</p>
            </article>
            <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Low stock</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{initialStockResult.lowStockRows.length}</p>
            </article>
          </div>

          <section className="mt-8 theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
              <label className="block space-y-2">
                <span className="text-sm text-[color:var(--sem-text-secondary)]">Search stock, items, or locations</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--sem-text-muted)]" />
                  <input value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] pl-11 pr-4 text-sm" placeholder="SKU, item, supplier, location" />
                </div>
              </label>
              <label className="block space-y-2">
                <span className="text-sm text-[color:var(--sem-text-secondary)]">Filter location</span>
                <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm">
                  <option value="">All visible locations</option>
                  {initialLocations.filter((location) => location.is_active).map((location) => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
              </label>
              <label className="theme-control-surface flex items-center gap-3 rounded-[18px] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)] xl:mt-7">
                <input type="checkbox" checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} className="h-4 w-4" />
                Low stock only
              </label>
            </div>
          </section>

          {actionError ? (
            <div className="mt-6 rounded-[20px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {actionError}
            </div>
          ) : null}

          {isOfficeRole && initialLocations.length === 0 ? (
            <section className="mt-8 rounded-[28px] border border-dashed border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-hover-surface)]/60 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">First-Run Setup</p>
                  <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Create default inventory locations?</h2>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
                    This helper creates Main Warehouse plus Tech 1-4 stock locations only after you confirm. No products are seeded and nothing is created silently.
                  </p>
                </div>
                <button type="button" onClick={() => void handleCreateDefaultLocations()} disabled={isSettingUpDefaults} className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">
                  {isSettingUpDefaults ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  Create default locations
                </button>
              </div>
            </section>
          ) : null}

          {isOfficeRole ? (
            <section className="mt-8">
              <div className="mb-4 flex items-center gap-2 text-sm text-[color:var(--sem-text-secondary)]">
                <PackagePlus className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                Inventory items
              </div>
              <div className="hidden lg:block">
                <MasterTable columns={itemColumns} colSpan={itemColumns.length} state={itemTableState}>
                  {filteredItems.map((item) => (
                    <MasterTableRow key={item.id}>
                      <td className="master-table-cell text-center align-middle">
                        <div className="flex items-center justify-center gap-2">
                          <button type="button" onClick={() => { setSelectedItem(item); setItemFormMode("edit"); }} className="theme-control-surface rounded-full px-3 py-2 text-xs font-medium">Edit</button>
                          <button type="button" onClick={() => void handleArchive(`/api/inventory/items/${item.id}`, "inventory item")} disabled={busyActionId === `/api/inventory/items/${item.id}`} className="theme-control-surface rounded-full px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60">Archive</button>
                        </div>
                      </td>
                      <td className="master-table-cell text-center align-middle font-mono text-xs text-[color:var(--sem-text-secondary)]">{item.internal_sku}</td>
                      <td className="master-table-cell align-middle">
                        <div>
                          <p className="font-semibold text-[color:var(--sem-text-primary)]">{item.name}</p>
                          <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">Updated {formatInventoryDateTime(item.updated_at)}</p>
                        </div>
                      </td>
                      <td className="master-table-cell text-center align-middle">{getInventoryItemTypeLabel(item.item_type)}</td>
                      <td className="master-table-cell text-center align-middle">{item.unit_of_measure}</td>
                      <td className="master-table-cell text-center align-middle font-medium">{formatInventoryCurrencyFromCents(item.default_cost_before_tax_cents)}</td>
                      <td className="master-table-cell text-center align-middle">{item.supplier_name ?? "-"}</td>
                      <td className="master-table-cell text-center align-middle">{item.reorder_point ?? "-"}</td>
                      <td className="master-table-cell text-center align-middle">
                        <span className="theme-control-surface-soft inline-flex rounded-full px-3 py-1 text-xs font-medium">
                          {inventoryStatusLabel(item)}
                        </span>
                      </td>
                    </MasterTableRow>
                  ))}
                </MasterTable>
              </div>
              <div className="lg:hidden">
                <MasterMobileList
                  items={filteredItems}
                  emptyState={<span>No inventory items match the current view.</span>}
                  renderItem={(item) => (
                    <article key={item.id} className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">{item.internal_sku}</p>
                      <h3 className="mt-2 text-lg font-semibold text-[color:var(--sem-text-primary)]">{item.name}</h3>
                      <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{getInventoryItemTypeLabel(item.item_type)} • {item.unit_of_measure}</p>
                    </article>
                  )}
                />
              </div>
            </section>
          ) : null}

          <section className="mt-8">
            <div className="mb-4 flex items-center gap-2 text-sm text-[color:var(--sem-text-secondary)]">
              {isOfficeRole ? <Warehouse className="h-4 w-4 text-[color:var(--sem-accent-primary)]" /> : <Truck className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />}
              {isOfficeRole ? "Locations" : "Assigned locations"}
            </div>
            <div className="hidden lg:block">
              <MasterTable columns={locationColumns} colSpan={locationColumns.length} state={locationTableState}>
                {filteredLocations.map((location) => (
                  <MasterTableRow key={location.id}>
                    <td className="master-table-cell text-center align-middle">
                      {isOfficeRole ? (
                        <div className="flex items-center justify-center gap-2">
                          <button type="button" onClick={() => { setSelectedLocation(location); setLocationFormMode("edit"); }} className="theme-control-surface rounded-full px-3 py-2 text-xs font-medium">Edit</button>
                          <button type="button" onClick={() => void handleArchive(`/api/inventory/locations/${location.id}`, "inventory location")} disabled={busyActionId === `/api/inventory/locations/${location.id}`} className="theme-control-surface rounded-full px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60">Archive</button>
                        </div>
                      ) : <span className="text-xs text-[color:var(--sem-text-muted)]">Read only</span>}
                    </td>
                    <td className="master-table-cell align-middle">
                      <div>
                        <p className="font-semibold text-[color:var(--sem-text-primary)]">{location.name}</p>
                        <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">Updated {formatInventoryDateTime(location.updated_at)}</p>
                      </div>
                    </td>
                    <td className="master-table-cell text-center align-middle">{getInventoryLocationTypeLabel(location.location_type)}</td>
                    <td className="master-table-cell text-center align-middle">{location.assigned_user_id ?? "Unassigned"}</td>
                    <td className="master-table-cell text-center align-middle">{location.vehicle_label ?? location.license_plate ?? "-"}</td>
                    <td className="master-table-cell text-center align-middle">
                      <span className="theme-control-surface-soft inline-flex rounded-full px-3 py-1 text-xs font-medium">
                        {inventoryStatusLabel(location)}
                      </span>
                    </td>
                  </MasterTableRow>
                ))}
              </MasterTable>
            </div>
            <div className="lg:hidden">
              <MasterMobileList
                items={filteredLocations}
                emptyState={<span>No inventory locations match the current view.</span>}
                renderItem={(location) => (
                  <article key={location.id} className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-4">
                    <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">{location.name}</h3>
                    <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{getInventoryLocationTypeLabel(location.location_type)}</p>
                    <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{location.vehicle_label ?? location.license_plate ?? location.assigned_user_id ?? "Unassigned"}</p>
                  </article>
                )}
              />
            </div>
          </section>

          <section className="mt-8">
            <div className="mb-4 flex items-center gap-2 text-sm text-[color:var(--sem-text-secondary)]">
              <ShieldCheck className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
              Stock on hand
            </div>
            <div className="hidden lg:block">
              <MasterTable columns={stockColumns} colSpan={stockColumns.length} state={stockTableState}>
                {filteredStockRows.map((row) => (
                  <MasterTableRow key={row.item_id}>
                    <td className="master-table-cell align-middle">
                      <div>
                        <p className="font-semibold text-[color:var(--sem-text-primary)]">{row.name}</p>
                        <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{row.internal_sku}</p>
                      </div>
                    </td>
                    <td className="master-table-cell text-center align-middle">{getInventoryItemTypeLabel(row.item_type)}</td>
                    <td className="master-table-cell text-center align-middle">
                      <div className="inline-grid gap-1 text-left">
                        {row.locations.map((location) => (
                          <p key={location.location_id} className="text-sm text-[color:var(--sem-text-secondary)]">{location.location_name}: {location.quantity_display}</p>
                        ))}
                      </div>
                    </td>
                    <td className="master-table-cell text-center align-middle font-semibold text-[color:var(--sem-text-primary)]">{row.total_quantity_display}</td>
                    <td className="master-table-cell text-center align-middle">{row.reorder_point_display ?? "-"}</td>
                  </MasterTableRow>
                ))}
              </MasterTable>
            </div>
            <div className="lg:hidden">
              <MasterMobileList
                items={filteredStockRows}
                emptyState={<span>No stock rows match the current filters.</span>}
                renderItem={(row) => (
                  <article key={row.item_id} className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-4">
                    <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">{row.name}</h3>
                    <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{row.internal_sku} • {row.total_quantity_display} total</p>
                    <div className="mt-3 space-y-1 text-sm text-[color:var(--sem-text-secondary)]">
                      {row.locations.map((location) => (
                        <p key={location.location_id}>{location.location_name}: {location.quantity_display}</p>
                      ))}
                    </div>
                  </article>
                )}
              />
            </div>
          </section>

          <section className="mt-8 grid gap-4 lg:grid-cols-2">
            <article className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Low Stock</p>
                  <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Items below reorder point</h2>
                </div>
                <span className="theme-control-surface-soft rounded-full px-4 py-2 text-sm font-medium">{filteredLowStockRows.length} rows</span>
              </div>
              <div className="mt-5 space-y-3">
                {filteredLowStockRows.length === 0 ? (
                  <p className="text-sm text-[color:var(--sem-text-secondary)]">No low-stock rows are visible in the current filter set.</p>
                ) : filteredLowStockRows.map((row) => (
                  <div key={`${row.item_id}:${row.location_id}`} className="rounded-[20px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                    <p className="font-semibold text-[color:var(--sem-text-primary)]">{row.name}</p>
                    <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{row.location_name} • {row.quantity_display} left • reorder at {row.reorder_point_display}</p>
                  </div>
                ))}
              </div>
            </article>

            {isOfficeRole ? (
              <article className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Office Actions</p>
                <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Manual stock movements</h2>
                <p className="mt-3 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
                  Use office-only manual actions to record usage, adjustments, damaged stock, and returns. Nothing auto-deducts from invoices or estimates in this version.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" onClick={() => setMovementDialogMode("used")} className="theme-control-surface rounded-full px-4 py-3 text-sm font-medium">Use on job</button>
                  <button type="button" onClick={() => setMovementDialogMode("adjustment")} className="theme-control-surface rounded-full px-4 py-3 text-sm font-medium">Adjust stock</button>
                  <button type="button" onClick={() => setMovementDialogMode("damaged")} className="theme-control-surface rounded-full px-4 py-3 text-sm font-medium">Mark damaged</button>
                  <button type="button" onClick={() => setMovementDialogMode("returned")} className="theme-control-surface rounded-full px-4 py-3 text-sm font-medium">Return stock</button>
                </div>
              </article>
            ) : (
              <article className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Read Only</p>
                <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Technician scope</h2>
                <p className="mt-3 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
                  This view is limited to assigned vehicle and kit locations. Receiving, transfers, usage posting, adjustments, damage, returns, and archive actions are disabled for technicians in V1.
                </p>
              </article>
            )}
          </section>

          <section className="mt-8 theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Movement History</p>
                <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Chronological stock activity</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm text-[color:var(--sem-text-secondary)]">Search history</span>
                  <input value={movementQuery} onChange={(event) => setMovementQuery(event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="Item, SKU, note, location" />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm text-[color:var(--sem-text-secondary)]">Movement type</span>
                  <select value={movementTypeFilter} onChange={(event) => setMovementTypeFilter(event.target.value as InventoryMovementType | "")} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm">
                    <option value="">All movement types</option>
                    <option value="received">Received</option>
                    <option value="transfer">Transfer</option>
                    <option value="used">Used</option>
                    <option value="adjustment">Adjustment</option>
                    <option value="damaged">Damaged</option>
                    <option value="returned">Returned</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-6">
              <InventoryMovementHistory movements={filteredMovements as InventoryMovement[]} loadError={loadError} />
            </div>
          </section>
          <style jsx global>{`
            .inventory-display-panel .master-table {
              table-layout: fixed;
            }

            .inventory-display-panel .master-table-header-cell,
            .inventory-display-panel .master-table-cell {
              vertical-align: middle;
            }

            .inventory-display-panel .master-table-row {
              transition: background-color 160ms ease, border-color 160ms ease;
            }

            .inventory-display-panel .master-table-row:hover .master-table-cell {
              background: color-mix(in srgb, var(--cmp-hover-surface) 72%, transparent);
            }
          `}</style>
        </section>
      </div>

      <InventoryItemForm
        open={itemFormMode !== null}
        mode={itemFormMode ?? "create"}
        initialItem={selectedItem}
        onClose={() => { setItemFormMode(null); setSelectedItem(null); }}
        onSaved={handleDialogSaved}
      />
      <InventoryLocationForm
        open={locationFormMode !== null}
        mode={locationFormMode ?? "create"}
        initialLocation={selectedLocation}
        technicians={initialTechnicians}
        onClose={() => { setLocationFormMode(null); setSelectedLocation(null); }}
        onSaved={handleDialogSaved}
      />
      <InventoryReceiveStockDialog
        open={receiveOpen}
        items={initialItems}
        locations={initialLocations}
        onClose={() => setReceiveOpen(false)}
        onSaved={handleDialogSaved}
      />
      <InventoryTransferStockDialog
        open={transferOpen}
        items={initialItems}
        locations={initialLocations}
        onClose={() => setTransferOpen(false)}
        onSaved={handleDialogSaved}
      />
      <InventoryUseStockDialog
        open={movementDialogMode !== null}
        mode={movementDialogMode ?? "used"}
        items={initialItems}
        locations={initialLocations}
        onClose={() => setMovementDialogMode(null)}
        onSaved={handleDialogSaved}
      />
    </main>
  );
}
