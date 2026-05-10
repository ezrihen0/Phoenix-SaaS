"use client";

import {
  MasterMobileList,
  MasterTable,
  MasterTableRow,
  type MasterTableState,
} from "@/components/master-table";
import {
  formatInventoryCurrencyFromCents,
  formatInventoryDateTime,
  getInventoryMovementTypeLabel,
  type InventoryMovement,
} from "@/lib/crm/inventory-model";

type InventoryMovementHistoryProps = {
  movements: InventoryMovement[];
  loadError?: string | null;
};

const columns = [
  { key: "when", label: "When", align: "center" as const },
  { key: "type", label: "Type", align: "center" as const },
  { key: "item", label: "Item" },
  { key: "locations", label: "Locations", align: "center" as const },
  { key: "cost", label: "Cost", align: "center" as const },
  { key: "detail", label: "Detail" },
];

export function InventoryMovementHistory({ movements, loadError = null }: InventoryMovementHistoryProps) {
  const tableState: MasterTableState = loadError
    ? { status: "error", message: loadError }
    : movements.length === 0
      ? { status: "empty", message: "No inventory movements have been recorded yet." }
      : { status: "ready" };

  return (
    <>
      <div className="hidden lg:block">
        <MasterTable columns={columns} colSpan={columns.length} state={tableState}>
          {movements.map((movement) => (
            <MasterTableRow key={movement.id}>
              <td className="master-table-cell text-center align-middle">{formatInventoryDateTime(movement.occurred_at ?? movement.created_at)}</td>
              <td className="master-table-cell text-center align-middle">
                <span className="theme-control-surface-soft inline-flex rounded-full px-3 py-1 text-xs font-medium">
                  {getInventoryMovementTypeLabel(movement.movement_type)}
                </span>
              </td>
              <td className="master-table-cell align-middle">
                <div>
                  <p className="font-semibold text-[color:var(--sem-text-primary)]">{movement.item_name ?? "Unknown item"}</p>
                  <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{movement.item_sku ?? "-"} • {movement.quantity_display}</p>
                </div>
              </td>
              <td className="master-table-cell text-center align-middle">
                <p className="text-[color:var(--sem-text-primary)]">{movement.from_location_name ?? "-"}</p>
                <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">to {movement.to_location_name ?? "-"}</p>
              </td>
              <td className="master-table-cell text-center align-middle font-medium">{formatInventoryCurrencyFromCents(movement.unit_cost_before_tax_cents)}</td>
              <td className="master-table-cell align-middle">
                <p className="text-sm text-[color:var(--sem-text-secondary)]">{movement.note ?? "No note"}</p>
                <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">
                  {movement.job_id ? `Job ${movement.job_id}` : movement.supplier_invoice_number ? `Invoice ${movement.supplier_invoice_number}` : "Audit record"}
                </p>
              </td>
            </MasterTableRow>
          ))}
        </MasterTable>
      </div>

      <div className="lg:hidden">
        <MasterMobileList
          items={movements}
          emptyState={<span>No inventory movements have been recorded yet.</span>}
          renderItem={(movement) => (
            <article key={movement.id} className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{movement.item_name ?? "Unknown item"}</span>
                <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">{getInventoryMovementTypeLabel(movement.movement_type)}</span>
              </div>
              <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{movement.quantity_display} • {movement.item_sku ?? "-"}</p>
              <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{movement.from_location_name ?? "-"} to {movement.to_location_name ?? "-"}</p>
              <p className="mt-3 text-xs text-[color:var(--sem-text-muted)]">{formatInventoryDateTime(movement.occurred_at ?? movement.created_at)}</p>
            </article>
          )}
        />
      </div>
    </>
  );
}
