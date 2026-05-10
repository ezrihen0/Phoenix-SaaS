"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  INVENTORY_ITEM_TYPES,
  INVENTORY_UNIT_OF_MEASURES,
  formatInventoryCurrencyFromCents,
  getInventoryItemTypeLabel,
  getInventoryUnitLabel,
  type InventoryItem,
  type InventoryItemType,
  type InventoryUnitOfMeasure,
} from "@/lib/crm/inventory-model";

type InventoryItemFormProps = {
  open: boolean;
  mode: "create" | "edit";
  initialItem?: InventoryItem | null;
  onClose: () => void;
  onSaved: (item: InventoryItem) => void;
};

type FormState = {
  internalSku: string;
  name: string;
  itemType: InventoryItemType;
  unitOfMeasure: InventoryUnitOfMeasure;
  defaultCostBeforeTax: string;
  defaultTax: string;
  defaultTotalPaid: string;
  supplierName: string;
  supplierSku: string;
  reorderPoint: string;
  notes: string;
  isActive: boolean;
};

function buildInitialState(item?: InventoryItem | null): FormState {
  return {
    internalSku: item?.internal_sku ?? "",
    name: item?.name ?? "",
    itemType: item?.item_type ?? "part",
    unitOfMeasure: item?.unit_of_measure ?? "each",
    defaultCostBeforeTax: item?.default_cost_before_tax_cents ? (item.default_cost_before_tax_cents / 100).toFixed(2) : "",
    defaultTax: item?.default_tax_cents ? (item.default_tax_cents / 100).toFixed(2) : "",
    defaultTotalPaid: item?.default_total_paid_cents ? (item.default_total_paid_cents / 100).toFixed(2) : "",
    supplierName: item?.supplier_name ?? "",
    supplierSku: item?.supplier_sku ?? "",
    reorderPoint: item?.reorder_point ?? "",
    notes: item?.notes ?? "",
    isActive: item?.is_active ?? true,
  };
}

function parseCurrencyToCents(value: string, fieldName: string, allowNull = false) {
  const trimmed = value.trim();

  if (!trimmed) {
    return allowNull ? null : 0;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`${fieldName} must be a dollar value with up to two decimals.`);
  }

  return Math.round(Number(trimmed) * 100);
}

function previewCurrencyToCents(value: string) {
  const trimmed = value.trim();

  if (!trimmed || !/^\d+(\.\d{0,2})?$/.test(trimmed)) {
    return 0;
  }

  return Math.round(Number(trimmed) * 100);
}

function parseDecimal(value: string, fieldName: string, allowNull = false) {
  const trimmed = value.trim();

  if (!trimmed) {
    return allowNull ? null : "0";
  }

  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) {
    throw new Error(`${fieldName} must be a positive number with up to 4 decimals.`);
  }

  return trimmed;
}

export function InventoryItemForm({
  open,
  mode,
  initialItem = null,
  onClose,
  onSaved,
}: InventoryItemFormProps) {
  const [formState, setFormState] = useState<FormState>(() => buildInitialState(initialItem));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setFormState(buildInitialState(initialItem));
    setErrorMessage(null);
  }, [initialItem, open]);

  if (!open) {
    return null;
  }

  async function handleSave() {
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const payload = {
        internalSku: formState.internalSku.trim(),
        name: formState.name.trim(),
        itemType: formState.itemType,
        unitOfMeasure: formState.unitOfMeasure,
        defaultCostBeforeTaxCents: parseCurrencyToCents(formState.defaultCostBeforeTax, "Default cost before tax"),
        defaultTaxCents: parseCurrencyToCents(formState.defaultTax, "Default tax", true),
        defaultTotalPaidCents: parseCurrencyToCents(formState.defaultTotalPaid, "Default total paid", true),
        supplierName: formState.supplierName.trim() || null,
        supplierSku: formState.supplierSku.trim() || null,
        reorderPoint: parseDecimal(formState.reorderPoint, "Reorder point", true),
        notes: formState.notes.trim() || null,
        isActive: formState.isActive,
      };

      const result = mode === "create"
        ? await crmApiFetch<InventoryItem>("/api/inventory/items", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        : await crmApiFetch<InventoryItem>(`/api/inventory/items/${initialItem?.id ?? ""}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

      onSaved(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The inventory item could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-10 backdrop-blur-sm">
      <div className="theme-surface-modal w-full max-w-3xl rounded-[32px] border border-[color:var(--cmp-border-subtle)] p-6 shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--sem-accent-primary)]">Inventory Item</p>
            <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">
              {mode === "create" ? "Add inventory item" : "Edit inventory item"}
            </h2>
            <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
              Keep inventory items separate from pricebook products. This record tracks physical stock metadata only.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="theme-control-surface rounded-full px-4 py-2 text-sm font-medium"
          >
            Close
          </button>
        </div>

        {errorMessage ? (
          <div className="mt-5 rounded-[20px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Internal SKU</span>
            <input
              value={formState.internalSku}
              onChange={(event) => updateField("internalSku", event.target.value)}
              className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
              placeholder="INV-001"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Item name</span>
            <input
              value={formState.name}
              onChange={(event) => updateField("name", event.target.value)}
              className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
              placeholder="Thermocouple"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Item type</span>
            <select
              value={formState.itemType}
              onChange={(event) => updateField("itemType", event.target.value as InventoryItemType)}
              className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
            >
              {INVENTORY_ITEM_TYPES.map((itemType) => (
                <option key={itemType} value={itemType}>{getInventoryItemTypeLabel(itemType)}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Unit of measure</span>
            <select
              value={formState.unitOfMeasure}
              onChange={(event) => updateField("unitOfMeasure", event.target.value as InventoryUnitOfMeasure)}
              className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
            >
              {INVENTORY_UNIT_OF_MEASURES.map((unit) => (
                <option key={unit} value={unit}>{getInventoryUnitLabel(unit)}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Default cost before tax</span>
            <input
              value={formState.defaultCostBeforeTax}
              onChange={(event) => updateField("defaultCostBeforeTax", event.target.value)}
              className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
              placeholder="87.62"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Default tax paid</span>
            <input
              value={formState.defaultTax}
              onChange={(event) => updateField("defaultTax", event.target.value)}
              className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
              placeholder="4.38"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Default total paid</span>
            <input
              value={formState.defaultTotalPaid}
              onChange={(event) => updateField("defaultTotalPaid", event.target.value)}
              className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
              placeholder="92.00"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Reorder point</span>
            <input
              value={formState.reorderPoint}
              onChange={(event) => updateField("reorderPoint", event.target.value)}
              className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
              placeholder="3"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Supplier name</span>
            <input
              value={formState.supplierName}
              onChange={(event) => updateField("supplierName", event.target.value)}
              className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
              placeholder="Supplier name"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Supplier SKU</span>
            <input
              value={formState.supplierSku}
              onChange={(event) => updateField("supplierSku", event.target.value)}
              className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
              placeholder="SUP-001"
            />
          </label>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Notes</span>
            <textarea
              value={formState.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              rows={4}
              className="theme-input-control min-h-[120px] w-full rounded-[18px] px-4 py-3 text-sm"
              placeholder="Inventory handling notes, supplier context, or physical shelf reminders."
            />
          </label>
          <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Cost preview</p>
            <p className="mt-3 text-xl font-semibold text-[color:var(--sem-text-primary)]">
              {formatInventoryCurrencyFromCents(previewCurrencyToCents(formState.defaultCostBeforeTax))}
            </p>
            <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
              Keep purchase cost fields here only. This record does not affect invoices automatically.
            </p>
            <label className="theme-control-surface mt-5 flex items-center gap-3 rounded-[18px] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
              <input
                type="checkbox"
                checked={formState.isActive}
                onChange={(event) => updateField("isActive", event.target.checked)}
                className="h-4 w-4"
              />
              Active item
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="theme-control-surface rounded-full px-5 py-3 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {mode === "create" ? "Create item" : "Save item"}
          </button>
        </div>
      </div>
    </div>
  );
}