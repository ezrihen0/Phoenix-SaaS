"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Copy, LoaderCircle, Save, Trash2, Undo2 } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  PRICEBOOK_INVENTORY_TRACKING_MODES,
  PRICEBOOK_ITEM_TYPES,
  PRICEBOOK_UNIT_OF_MEASURES,
  formatCurrencyFromCents,
  getInventoryTrackingLabel,
  getPricebookItemTypeLabel,
  getPricebookUnitLabel,
  type PricebookInventoryTrackingMode,
  type PricebookItem,
  type PricebookItemType,
  type PricebookUnitOfMeasure,
} from "@/lib/crm/pricebook-model";

type PricebookFormProps = {
  mode: "create" | "edit";
  initialItem?: PricebookItem | null;
};

type FormState = {
  internalSku: string;
  name: string;
  customerDescription: string;
  internalDescription: string;
  itemType: PricebookItemType;
  tradeArea: string;
  serviceArea: string;
  tags: string;
  unitOfMeasure: PricebookUnitOfMeasure;
  baseCost: string;
  materialCost: string;
  laborCost: string;
  customerPrice: string;
  minimumPrice: string;
  estimatedLaborMinutes: string;
  warrantyMonths: string;
  requiresPermit: boolean;
  inventoryTrackingMode: PricebookInventoryTrackingMode;
  supplierName: string;
  supplierSku: string;
  inventoryNotes: string;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: string;
};

function formatMoneyInput(cents: number | null | undefined) {
  if (typeof cents !== "number") {
    return "";
  }

  return (cents / 100).toFixed(2);
}

function buildInitialState(item?: PricebookItem | null): FormState {
  return {
    internalSku: item?.internal_sku ?? "",
    name: item?.name ?? "",
    customerDescription: item?.customer_description ?? "",
    internalDescription: item?.internal_description ?? "",
    itemType: item?.item_type ?? "service",
    tradeArea: item?.trade_area ?? "",
    serviceArea: item?.service_area ?? "",
    tags: item?.tags?.join(", ") ?? "",
    unitOfMeasure: item?.unit_of_measure ?? "each",
    baseCost: formatMoneyInput(item?.base_cost_cents ?? 0),
    materialCost: formatMoneyInput(item?.material_cost_cents ?? 0),
    laborCost: formatMoneyInput(item?.labor_cost_cents ?? 0),
    customerPrice: formatMoneyInput(item?.customer_price_cents ?? 0),
    minimumPrice: formatMoneyInput(item?.minimum_price_cents),
    estimatedLaborMinutes: item?.estimated_labor_minutes ? String(item.estimated_labor_minutes) : "",
    warrantyMonths: item?.warranty_months ? String(item.warranty_months) : "",
    requiresPermit: item?.requires_permit ?? false,
    inventoryTrackingMode: item?.inventory_tracking_mode ?? "none",
    supplierName: item?.supplier_name ?? "",
    supplierSku: item?.supplier_sku ?? "",
    inventoryNotes: item?.inventory_notes ?? "",
    isPopular: item?.is_popular ?? false,
    isActive: item?.is_active ?? true,
    sortOrder: item?.sort_order ? String(item.sort_order) : "0",
  };
}

function parseCurrencyToCents(value: string, fieldName: string, allowNull = false) {
  const trimmed = value.trim();

  if (!trimmed) {
    if (allowNull) {
      return null;
    }

    return 0;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`${fieldName} must be a dollar value with up to two decimals.`);
  }

  return Math.round(Number(trimmed) * 100);
}

function parseOptionalInteger(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Whole-number fields must be non-negative integers.");
  }

  return parsed;
}

function parseRequiredInteger(value: string, fallback = 0) {
  const trimmed = value.trim();

  if (!trimmed) {
    return fallback;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Sort order must be a non-negative integer.");
  }

  return parsed;
}

function normalizeTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function PricebookForm({ mode, initialItem = null }: PricebookFormProps) {
  const router = useRouter();
  const [currentItem, setCurrentItem] = useState<PricebookItem | null>(initialItem);
  const [formState, setFormState] = useState<FormState>(() => buildInitialState(initialItem));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isChangingArchiveState, setIsChangingArchiveState] = useState(false);

  useEffect(() => {
    setCurrentItem(initialItem);
    setFormState(buildInitialState(initialItem));
  }, [
    initialItem?.id,
    initialItem?.updated_at,
    initialItem?.archived_at,
    initialItem?.is_active,
  ]);

  const costPreview = useMemo(() => {
    const baseCost = Number(formState.baseCost || "0") || 0;
    const materialCost = Number(formState.materialCost || "0") || 0;
    const laborCost = Number(formState.laborCost || "0") || 0;
    const customerPrice = Number(formState.customerPrice || "0") || 0;
    const combinedCosts = baseCost + materialCost + laborCost;
    const spread = customerPrice - combinedCosts;

    return {
      combinedCostsCents: Math.round(combinedCosts * 100),
      spreadCents: Math.round(spread * 100),
    };
  }, [formState.baseCost, formState.customerPrice, formState.laborCost, formState.materialCost]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSave() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const payload = {
        internalSku: formState.internalSku.trim(),
        name: formState.name.trim(),
        customerDescription: formState.customerDescription.trim() || null,
        internalDescription: formState.internalDescription.trim() || null,
        itemType: formState.itemType,
        tradeArea: formState.tradeArea.trim() || null,
        serviceArea: formState.serviceArea.trim() || null,
        tags: normalizeTags(formState.tags),
        unitOfMeasure: formState.unitOfMeasure,
        baseCostCents: parseCurrencyToCents(formState.baseCost, "Base cost"),
        materialCostCents: parseCurrencyToCents(formState.materialCost, "Material cost"),
        laborCostCents: parseCurrencyToCents(formState.laborCost, "Labor cost"),
        customerPriceCents: parseCurrencyToCents(formState.customerPrice, "Customer price"),
        minimumPriceCents: parseCurrencyToCents(formState.minimumPrice, "Minimum price", true),
        estimatedLaborMinutes: parseOptionalInteger(formState.estimatedLaborMinutes),
        warrantyMonths: parseOptionalInteger(formState.warrantyMonths),
        requiresPermit: formState.requiresPermit,
        inventoryTrackingMode: formState.inventoryTrackingMode,
        supplierName: formState.supplierName.trim() || null,
        supplierSku: formState.supplierSku.trim() || null,
        inventoryNotes: formState.inventoryNotes.trim() || null,
        isPopular: formState.isPopular,
        isActive: formState.isActive,
        sortOrder: parseRequiredInteger(formState.sortOrder),
      };

      const result = mode === "create"
        ? await crmApiFetch<PricebookItem>("/api/pricebook/items", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        : await crmApiFetch<PricebookItem>(`/api/pricebook/items/${initialItem?.id ?? ""}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

      setSuccessMessage(mode === "create" ? "Pricebook item created." : "Pricebook item updated.");

      if (mode === "create") {
        router.push(`/pricebook/${result.id}`);
        router.refresh();
        return;
      }

      setCurrentItem(result);
      setFormState(buildInitialState(result));
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The item could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!currentItem) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsDuplicating(true);

    try {
      const result = await crmApiFetch<PricebookItem>(`/api/pricebook/items/${currentItem.id}/duplicate`, {
        method: "POST",
      });
      router.push(`/pricebook/${result.id}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The item could not be duplicated.");
    } finally {
      setIsDuplicating(false);
    }
  }

  async function handleArchiveToggle() {
    if (!currentItem) {
      return;
    }

    const actionLabel = currentItem.is_active ? "archive" : "restore";
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Are you sure you want to ${actionLabel} this pricebook item?`);

    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsChangingArchiveState(true);

    try {
      const result = await crmApiFetch<PricebookItem>(
        currentItem.is_active
          ? `/api/pricebook/items/${currentItem.id}`
          : `/api/pricebook/items/${currentItem.id}/restore`,
        currentItem.is_active
          ? { method: "DELETE" }
          : { method: "POST" },
      );
      setCurrentItem(result);
      setFormState(buildInitialState(result));
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The archive state could not be updated.");
    } finally {
      setIsChangingArchiveState(false);
    }
  }

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="mx-auto max-w-6xl px-6 py-12 lg:px-10">
        <section className="theme-surface-modal rounded-[36px] border border-[color:var(--cmp-border-subtle)] p-7 shadow-[0_28px_80px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--sem-accent-primary)]">
                {mode === "create" ? "New Pricebook Item" : "Edit Pricebook Item"}
              </p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                {mode === "create" ? "Add a reusable catalog item." : formState.name || "Update this catalog item."}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                Keep pricing flexible for field teams while storing all backend values as integer cents. Delete actions archive the item instead of removing history.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/pricebook"
                className="theme-control-surface inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium"
              >
                Back to workspace
              </Link>
              {mode === "edit" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleDuplicate()}
                    disabled={isDuplicating || isSaving || isChangingArchiveState}
                    className="theme-btn-secondary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDuplicating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleArchiveToggle()}
                    disabled={isDuplicating || isSaving || isChangingArchiveState}
                    className="theme-control-surface inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isChangingArchiveState ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : currentItem?.is_active ? (
                      <Trash2 className="h-4 w-4" />
                    ) : (
                      <Undo2 className="h-4 w-4" />
                    )}
                    {currentItem?.is_active ? "Delete" : "Restore"}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving || isDuplicating || isChangingArchiveState}
                className="theme-btn-secondary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {mode === "create" ? "Create item" : "Save changes"}
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Combined costs</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">
                {formatCurrencyFromCents(costPreview.combinedCostsCents)}
              </p>
            </article>
            <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Current spread</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">
                {formatCurrencyFromCents(costPreview.spreadCents)}
              </p>
            </article>
            <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Item state</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">
                {formState.isActive ? "Active" : "Archived"}
              </p>
            </article>
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-[20px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-6 rounded-[20px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {successMessage}
            </div>
          ) : null}

          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <section className="space-y-6">
              <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
                <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Identity</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Internal SKU</span>
                    <input
                      value={formState.internalSku}
                      onChange={(event) => updateField("internalSku", event.target.value)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      placeholder="GAS-CLEAN-001"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Name</span>
                    <input
                      value={formState.name}
                      onChange={(event) => updateField("name", event.target.value)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      placeholder="Gas fireplace cleaning"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Item type</span>
                    <select
                      value={formState.itemType}
                      onChange={(event) => updateField("itemType", event.target.value as PricebookItemType)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                    >
                      {PRICEBOOK_ITEM_TYPES.map((itemType) => (
                        <option key={itemType} value={itemType}>{getPricebookItemTypeLabel(itemType)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Unit of measure</span>
                    <select
                      value={formState.unitOfMeasure}
                      onChange={(event) => updateField("unitOfMeasure", event.target.value as PricebookUnitOfMeasure)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                    >
                      {PRICEBOOK_UNIT_OF_MEASURES.map((unitOfMeasure) => (
                        <option key={unitOfMeasure} value={unitOfMeasure}>{getPricebookUnitLabel(unitOfMeasure)}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
                <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Descriptions</h2>
                <div className="mt-5 grid gap-4">
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Customer description</span>
                    <textarea
                      value={formState.customerDescription}
                      onChange={(event) => updateField("customerDescription", event.target.value)}
                      rows={4}
                      className="theme-input-control min-h-[120px] w-full rounded-[18px] px-4 py-3 text-sm"
                      placeholder="What the customer should see on future estimates or invoices."
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Internal description</span>
                    <textarea
                      value={formState.internalDescription}
                      onChange={(event) => updateField("internalDescription", event.target.value)}
                      rows={4}
                      className="theme-input-control min-h-[120px] w-full rounded-[18px] px-4 py-3 text-sm"
                      placeholder="Internal notes for the field team or office staff."
                    />
                  </label>
                </div>
              </div>

              <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
                <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Pricing and Labor</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Base cost ($)</span>
                    <input
                      inputMode="decimal"
                      value={formState.baseCost}
                      onChange={(event) => updateField("baseCost", event.target.value)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      placeholder="0.00"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Material cost ($)</span>
                    <input
                      inputMode="decimal"
                      value={formState.materialCost}
                      onChange={(event) => updateField("materialCost", event.target.value)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      placeholder="0.00"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Labor cost ($)</span>
                    <input
                      inputMode="decimal"
                      value={formState.laborCost}
                      onChange={(event) => updateField("laborCost", event.target.value)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      placeholder="0.00"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Customer price ($)</span>
                    <input
                      inputMode="decimal"
                      value={formState.customerPrice}
                      onChange={(event) => updateField("customerPrice", event.target.value)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      placeholder="0.00"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Minimum price ($)</span>
                    <input
                      inputMode="decimal"
                      value={formState.minimumPrice}
                      onChange={(event) => updateField("minimumPrice", event.target.value)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      placeholder="Optional"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Estimated labor minutes</span>
                    <input
                      inputMode="numeric"
                      value={formState.estimatedLaborMinutes}
                      onChange={(event) => updateField("estimatedLaborMinutes", event.target.value)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      placeholder="Optional"
                    />
                  </label>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
                <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Routing and Tags</h2>
                <div className="mt-5 grid gap-4">
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Trade area</span>
                    <input
                      value={formState.tradeArea}
                      onChange={(event) => updateField("tradeArea", event.target.value)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      placeholder="Gas, Wood, Masonry"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Service area</span>
                    <input
                      value={formState.serviceArea}
                      onChange={(event) => updateField("serviceArea", event.target.value)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      placeholder="North Zone, East Route"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Tags</span>
                    <input
                      value={formState.tags}
                      onChange={(event) => updateField("tags", event.target.value)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      placeholder="seasonal, premium, field-favorite"
                    />
                  </label>
                </div>
              </div>

              <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
                <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Inventory-ready details</h2>
                <div className="mt-5 grid gap-4">
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Inventory tracking mode</span>
                    <select
                      value={formState.inventoryTrackingMode}
                      onChange={(event) => updateField("inventoryTrackingMode", event.target.value as PricebookInventoryTrackingMode)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                    >
                      {PRICEBOOK_INVENTORY_TRACKING_MODES.map((modeValue) => (
                        <option key={modeValue} value={modeValue}>{getInventoryTrackingLabel(modeValue)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Supplier name</span>
                    <input
                      value={formState.supplierName}
                      onChange={(event) => updateField("supplierName", event.target.value)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      placeholder="Primary supplier"
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
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Inventory notes</span>
                    <textarea
                      value={formState.inventoryNotes}
                      onChange={(event) => updateField("inventoryNotes", event.target.value)}
                      rows={4}
                      className="theme-input-control min-h-[120px] w-full rounded-[18px] px-4 py-3 text-sm"
                      placeholder="Future inventory handling guidance only."
                    />
                  </label>
                </div>
              </div>

              <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
                <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Flags</h2>
                <div className="mt-5 grid gap-4">
                  <label className="theme-control-surface flex items-center justify-between gap-4 rounded-[20px] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
                    <span>Popular item</span>
                    <input
                      type="checkbox"
                      checked={formState.isPopular}
                      onChange={(event) => updateField("isPopular", event.target.checked)}
                      className="h-4 w-4"
                    />
                  </label>
                  <label className="theme-control-surface flex items-center justify-between gap-4 rounded-[20px] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
                    <span>Requires permit</span>
                    <input
                      type="checkbox"
                      checked={formState.requiresPermit}
                      onChange={(event) => updateField("requiresPermit", event.target.checked)}
                      className="h-4 w-4"
                    />
                  </label>
                  <label className="theme-control-surface flex items-center justify-between gap-4 rounded-[20px] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
                    <span>Active item</span>
                    <input
                      type="checkbox"
                      checked={formState.isActive}
                      onChange={(event) => updateField("isActive", event.target.checked)}
                      className="h-4 w-4"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Warranty months</span>
                    <input
                      inputMode="numeric"
                      value={formState.warrantyMonths}
                      onChange={(event) => updateField("warrantyMonths", event.target.value)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      placeholder="Optional"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-[color:var(--sem-text-secondary)]">Sort order</span>
                    <input
                      inputMode="numeric"
                      value={formState.sortOrder}
                      onChange={(event) => updateField("sortOrder", event.target.value)}
                      className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                    />
                  </label>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}