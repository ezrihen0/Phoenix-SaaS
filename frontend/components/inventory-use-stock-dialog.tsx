"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import type { InventoryItem, InventoryLocation } from "@/lib/crm/inventory-model";

type InventoryUseStockDialogProps = {
  open: boolean;
  mode: "used" | "adjustment" | "damaged" | "returned";
  items: InventoryItem[];
  locations: InventoryLocation[];
  onClose: () => void;
  onSaved: (createdCount: number) => void;
};

type UseLine = {
  inventoryItemId: string;
  quantity: string;
  note: string;
};

function buildLine(): UseLine {
  return {
    inventoryItemId: "",
    quantity: "1",
    note: "",
  };
}

function parseQuantity(value: string) {
  const trimmed = value.trim();

  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) {
    throw new Error("Quantities must be positive values with up to 4 decimals.");
  }

  return trimmed;
}

export function InventoryUseStockDialog({
  open,
  mode,
  items,
  locations,
  onClose,
  onSaved,
}: InventoryUseStockDialogProps) {
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [jobId, setJobId] = useState("");
  const [adjustDirection, setAdjustDirection] = useState<"increase" | "decrease">("decrease");
  const [lines, setLines] = useState<UseLine[]>([buildLine()]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setFromLocationId("");
    setToLocationId("");
    setOccurredAt("");
    setJobId("");
    setAdjustDirection("decrease");
    setLines([buildLine()]);
    setErrorMessage(null);
  }, [mode, open]);

  const activeItems = useMemo(() => items.filter((item) => item.is_active), [items]);
  const activeLocations = useMemo(() => locations.filter((location) => location.is_active), [locations]);

  if (!open) {
    return null;
  }

  function updateLine(index: number, nextLine: Partial<UseLine>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...nextLine } : line)));
  }

  const title = (() => {
    if (mode === "used") {
      return "Use stock on job";
    }

    if (mode === "adjustment") {
      return "Manual adjustment";
    }

    if (mode === "damaged") {
      return "Mark damaged stock";
    }

    return "Return stock";
  })();

  async function handleSave() {
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const normalizedLines = lines.map((line, index) => {
        if (!line.inventoryItemId) {
          throw new Error(`Line ${index + 1} is missing an inventory item.`);
        }

        return {
          inventoryItemId: line.inventoryItemId,
          quantity: parseQuantity(line.quantity),
          note: line.note.trim() || null,
        };
      });

      const endpoint = mode === "used" ? "/api/inventory/use" : "/api/inventory/adjust";
      const payload = mode === "used"
        ? {
          fromLocationId,
          jobId: jobId.trim() || null,
          occurredAt: occurredAt || null,
          lines: normalizedLines,
        }
        : {
          movementType: mode,
          fromLocationId: mode === "returned" ? null : (mode === "adjustment" && adjustDirection === "increase" ? null : fromLocationId || null),
          toLocationId: mode === "damaged" ? null : (mode === "adjustment" && adjustDirection === "decrease" ? null : toLocationId || null),
          occurredAt: occurredAt || null,
          lines: normalizedLines,
        };

      const result = await crmApiFetch<{ created: number }>(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      onSaved(result.created);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The stock movement could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-10 backdrop-blur-sm">
      <div className="theme-surface-modal w-full max-w-5xl rounded-[32px] border border-[color:var(--cmp-border-subtle)] p-6 shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--sem-accent-primary)]">Inventory Movement</p>
            <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{title}</h2>
            <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
              Every stock change remains auditable as a movement record. Technicians are read-only in this version.
            </p>
          </div>
          <button type="button" onClick={onClose} className="theme-control-surface rounded-full px-4 py-2 text-sm font-medium">Close</button>
        </div>

        {errorMessage ? (
          <div className="mt-5 rounded-[20px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {(mode === "used" || mode === "damaged" || (mode === "adjustment" && adjustDirection === "decrease")) ? (
            <label className="block space-y-2">
              <span className="text-sm text-[color:var(--sem-text-secondary)]">From location</span>
              <select value={fromLocationId} onChange={(event) => setFromLocationId(event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm">
                <option value="">Select location</option>
                {activeLocations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>
          ) : null}

          {(mode === "returned" || (mode === "adjustment" && adjustDirection === "increase")) ? (
            <label className="block space-y-2">
              <span className="text-sm text-[color:var(--sem-text-secondary)]">To location</span>
              <select value={toLocationId} onChange={(event) => setToLocationId(event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm">
                <option value="">Select location</option>
                {activeLocations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </label>
          ) : null}

          {mode === "adjustment" ? (
            <label className="block space-y-2">
              <span className="text-sm text-[color:var(--sem-text-secondary)]">Adjustment direction</span>
              <select value={adjustDirection} onChange={(event) => setAdjustDirection(event.target.value as "increase" | "decrease")} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm">
                <option value="decrease">Decrease stock</option>
                <option value="increase">Increase stock</option>
              </select>
            </label>
          ) : null}

          {mode === "used" ? (
            <label className="block space-y-2">
              <span className="text-sm text-[color:var(--sem-text-secondary)]">Job id</span>
              <input value={jobId} onChange={(event) => setJobId(event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="Optional job UUID" />
            </label>
          ) : null}

          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Movement date</span>
            <input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" />
          </label>
        </div>

        <div className="mt-6 space-y-4">
          {lines.map((line, index) => (
            <div key={`use-line-${index}`} className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_11rem_minmax(0,1fr)]">
                <label className="block space-y-2">
                  <span className="text-sm text-[color:var(--sem-text-secondary)]">Inventory item</span>
                  <select value={line.inventoryItemId} onChange={(event) => updateLine(index, { inventoryItemId: event.target.value })} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm">
                    <option value="">Select item</option>
                    {activeItems.map((item) => (
                      <option key={item.id} value={item.id}>{item.internal_sku} • {item.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm text-[color:var(--sem-text-secondary)]">Quantity</span>
                  <input value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="1" />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm text-[color:var(--sem-text-secondary)]">Line note</span>
                  <input value={line.note} onChange={(event) => updateLine(index, { note: event.target.value })} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="Optional note" />
                </label>
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} disabled={lines.length === 1} className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />
                  Remove line
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setLines((current) => [...current, buildLine()])} className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium">
            <Plus className="h-4 w-4" />
            Add line
          </button>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="theme-control-surface rounded-full px-5 py-3 text-sm font-medium">Cancel</button>
            <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save movement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}