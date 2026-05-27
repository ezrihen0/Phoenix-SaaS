"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  BadgeDollarSign,
  Boxes,
  ClipboardList,
  Copy,
  FileText,
  LoaderCircle,
  RotateCcw,
  Save,
  ShieldCheck,
  Tag,
  Trash2,
  Undo2,
} from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";
import { crmApiFetch } from "@/lib/crm/browser-api";
import type { SessionRole } from "@/lib/auth/server-session";
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

const SHOW_LEGACY_PRICEBOOK_FORM = false;

type PricebookFormProps = {
  mode: "create" | "edit";
  initialItem?: PricebookItem | null;
  sessionRole?: SessionRole | null;
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

type PricebookFormViewProps = {
  mode: "create" | "edit";
  formState: FormState;
  currentItem: PricebookItem | null;
  costPreview: { combinedCostsCents: number; spreadCents: number };
  errorMessage: string | null;
  successMessage: string | null;
  isSaving: boolean;
  isDuplicating: boolean;
  isChangingArchiveState: boolean;
  canManage: boolean;
  canView: boolean;
  fieldsDisabled: boolean;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onSave: () => void;
  onDuplicate: () => void;
  onArchiveToggle: () => void;
};

function panelClass() {
  return "rounded-[28px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)] backdrop-blur-xl";
}

function canViewPricebookRole(sessionRole: SessionRole | null | undefined) {
  return sessionRole === "owner"
    || sessionRole === "admin"
    || sessionRole === "office_admin"
    || sessionRole === "viewer";
}

function canManagePricebookRole(sessionRole: SessionRole | null | undefined) {
  return sessionRole === "owner"
    || sessionRole === "admin"
    || sessionRole === "office_admin";
}

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

function SectionCard({
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
  className = "",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  icon?: typeof FileText;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${panelClass()} overflow-hidden ${className}`.trim()}>
      <div className="border-b border-[color:var(--cmp-border-subtle)] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{eyebrow}</p>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-[color:var(--sem-display-headline)]">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{description}</p> : null}
          </div>
          {Icon ? (
            <div className="rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-2 text-[color:var(--sem-text-muted)]">
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[color:var(--sem-text-secondary)]">{label}</span>
      {children}
      {note ? <span className="block text-xs leading-5 text-[color:var(--sem-text-muted)]">{note}</span> : null}
    </label>
  );
}

function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "emerald" | "amber" | "rose" | "violet" }) {
  const tones = {
    neutral: "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-text-secondary)]",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    violet: "border-violet-500/30 bg-violet-500/10 text-violet-200",
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${checked
        ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-text-primary)]"
        : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] text-[color:var(--sem-text-primary)] hover:border-[color:var(--cmp-border-accent)]"}`}
    >
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {description ? <span className="mt-1 block text-xs text-[color:var(--sem-text-muted)]">{description}</span> : null}
      </span>
      <span className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-[color:var(--sem-accent-primary)]" : "bg-[color:var(--cmp-border-subtle)]"}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}

function CurrencyInput({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <div className="flex h-11 items-center rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] transition focus-within:border-[color:var(--cmp-border-accent)] focus-within:ring-2 focus-within:ring-[color:var(--cmp-focus-ring)]">
        <span className="border-r border-[color:var(--cmp-border-subtle)] px-3 font-[family:var(--font-geist-mono)] text-sm text-[color:var(--sem-text-muted)]">$</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          disabled={disabled}
          className="h-full min-w-0 flex-1 bg-transparent px-3 font-[family:var(--font-geist-mono)] text-sm text-[color:var(--sem-text-primary)] outline-none disabled:cursor-not-allowed"
        />
      </div>
    </Field>
  );
}

function AccessRestrictedPanel({
  mode,
  sessionRole,
}: {
  mode: "create" | "edit";
  sessionRole: SessionRole | null | undefined;
}) {
  return (
    <BoardShell gridOpacity="subtle">
      <div className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <section className={`${panelClass()} p-8`}>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-accent-primary)]">Access restricted</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">
            {mode === "create" ? "Item creation unavailable" : "Pricebook item unavailable"}
          </h1>
          <p className="mt-4 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
            {mode === "create"
              ? "Creating catalog items requires owner, admin, or office admin access with pricebook management permissions."
              : sessionRole === "viewer"
                ? "Your role can browse the catalog list but cannot open the item builder for editing."
                : "Your account role does not include pricebook catalog access."}
          </p>
          <Link href="/pricebook" className="theme-btn-secondary mt-6 inline-flex items-center rounded-2xl px-4 py-3 text-sm font-medium">
            Back to Revenue Control Center
          </Link>
        </section>
      </div>
    </BoardShell>
  );
}

function PricebookItemBuilderView({
  mode,
  formState,
  currentItem,
  costPreview,
  errorMessage,
  successMessage,
  isSaving,
  isDuplicating,
  isChangingArchiveState,
  canManage,
  fieldsDisabled,
  updateField,
  onSave,
  onDuplicate,
  onArchiveToggle,
}: PricebookFormViewProps) {
  const parsedTags = useMemo(() => normalizeTags(formState.tags), [formState.tags]);
  const isLaborSide = formState.itemType === "labor" || formState.unitOfMeasure === "hour";
  const isMaterialSide = formState.itemType === "product" || formState.itemType === "part";
  const actionsBusy = isSaving || isDuplicating || isChangingArchiveState;

  function applyLaborServicePreset() {
    if (fieldsDisabled) {
      return;
    }

    updateField("itemType", "labor");
    updateField("unitOfMeasure", "hour");
  }

  function applyMaterialPartPreset() {
    if (fieldsDisabled) {
      return;
    }

    updateField("itemType", "part");
    updateField("unitOfMeasure", "each");
  }

  const inputClass = "theme-input-control h-11 w-full rounded-xl px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60";
  const monoInputClass = `${inputClass} font-[family:var(--font-geist-mono)]`;
  const textareaClass = "theme-input-control min-h-[120px] w-full resize-none rounded-xl px-3 py-3 text-sm leading-6 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <BoardShell gridOpacity="subtle">
      <div className="mx-auto max-w-[92rem] px-5 py-6 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:px-8">
        <header className={`${panelClass()} p-6`}>
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-[color:var(--sem-text-muted)]">
                <ClipboardList className="h-3.5 w-3.5" />
                Universal entry desk
              </p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] sm:text-5xl">
                {mode === "create" ? "Create Pricebook Item" : "Pricebook Item Builder"}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)]">
                Structured item setup for services, labor, materials, parts, fees, repairs, and install work.
              </p>
              {!canManage ? (
                <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-muted)]">
                  Read-only catalog view. Changes require owner, admin, or office admin access.
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 xl:items-end">
              <Link href="/pricebook" className="theme-control-surface inline-flex items-center rounded-2xl px-4 py-2.5 text-sm font-medium">
                Back to Revenue Control Center
              </Link>
              <div className="flex flex-wrap justify-end gap-2">
                <StatusBadge tone={formState.isActive ? "emerald" : "rose"}>
                  {formState.isActive ? "Active" : "Archived"}
                </StatusBadge>
                <StatusBadge>{getPricebookItemTypeLabel(formState.itemType)}</StatusBadge>
                <StatusBadge>{getPricebookUnitLabel(formState.unitOfMeasure)}</StatusBadge>
                {formState.isPopular ? <StatusBadge tone="violet">Popular</StatusBadge> : null}
                {formState.requiresPermit ? <StatusBadge tone="amber">Permit</StatusBadge> : null}
              </div>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div className="theme-alert-error mt-5 rounded-[20px] border px-4 py-3 text-sm">{errorMessage}</div>
        ) : null}

        {successMessage ? (
          <div className="mt-5 rounded-[20px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {successMessage}
          </div>
        ) : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.65fr)]">
          <div className="space-y-5">
            <SectionCard
              eyebrow="Zone 1"
              title="Item Identity"
              description="SKU, naming, type, and customer/internal descriptions."
              icon={FileText}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
                  <Toggle
                    checked={isLaborSide}
                    onChange={() => applyLaborServicePreset()}
                    label="Labor / Service"
                    description="Preset labor + hourly unit. Item type and unit selects remain editable below."
                    disabled={fieldsDisabled}
                  />
                  <Toggle
                    checked={isMaterialSide}
                    onChange={() => applyMaterialPartPreset()}
                    label="Material / Part"
                    description="Preset part + each unit. Item type and unit selects remain editable below."
                    disabled={fieldsDisabled}
                  />
                </div>

                <Field label="Code / SKU">
                  <input
                    value={formState.internalSku}
                    onChange={(event) => updateField("internalSku", event.target.value)}
                    disabled={fieldsDisabled}
                    className={monoInputClass}
                    placeholder="SERVICE-CODE-001"
                  />
                </Field>
                <Field label="Item Name">
                  <input
                    value={formState.name}
                    onChange={(event) => updateField("name", event.target.value)}
                    disabled={fieldsDisabled}
                    className={inputClass}
                    placeholder="Diagnostic Inspection"
                  />
                </Field>
                <Field label="Item Type">
                  <select
                    value={formState.itemType}
                    onChange={(event) => updateField("itemType", event.target.value as PricebookItemType)}
                    disabled={fieldsDisabled}
                    className={inputClass}
                  >
                    {PRICEBOOK_ITEM_TYPES.map((itemType) => (
                      <option key={itemType} value={itemType}>{getPricebookItemTypeLabel(itemType)}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Unit of Measure">
                  <select
                    value={formState.unitOfMeasure}
                    onChange={(event) => updateField("unitOfMeasure", event.target.value as PricebookUnitOfMeasure)}
                    disabled={fieldsDisabled}
                    className={inputClass}
                  >
                    {PRICEBOOK_UNIT_OF_MEASURES.map((unitOfMeasure) => (
                      <option key={unitOfMeasure} value={unitOfMeasure}>{getPricebookUnitLabel(unitOfMeasure)}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid gap-4 lg:col-span-2 lg:grid-cols-2">
                  <Field label="Customer Description">
                    <textarea
                      value={formState.customerDescription}
                      onChange={(event) => updateField("customerDescription", event.target.value)}
                      disabled={fieldsDisabled}
                      rows={4}
                      className={textareaClass}
                      placeholder="Customer-facing description"
                    />
                  </Field>
                  <Field label="Internal Description">
                    <textarea
                      value={formState.internalDescription}
                      onChange={(event) => updateField("internalDescription", event.target.value)}
                      disabled={fieldsDisabled}
                      rows={4}
                      className={textareaClass}
                      placeholder="Internal notes for staff"
                    />
                  </Field>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              eyebrow="Zone 3"
              title="Catalog Classification"
              description="Trade area, service area, and catalog tags."
              icon={Tag}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Trade Area">
                  <input
                    value={formState.tradeArea}
                    onChange={(event) => updateField("tradeArea", event.target.value)}
                    disabled={fieldsDisabled}
                    className={inputClass}
                    placeholder="HVAC, Plumbing, Electrical"
                  />
                </Field>
                <Field label="Service Area">
                  <input
                    value={formState.serviceArea}
                    onChange={(event) => updateField("serviceArea", event.target.value)}
                    disabled={fieldsDisabled}
                    className={inputClass}
                    placeholder="Panel Work, Water Heaters"
                  />
                </Field>
                <Field label="Tags" note="Comma-separated. Saving uses existing normalizeTags behavior.">
                  <input
                    value={formState.tags}
                    onChange={(event) => updateField("tags", event.target.value)}
                    disabled={fieldsDisabled}
                    className={inputClass}
                    placeholder="diagnostic, popular"
                  />
                </Field>
                <div className="space-y-2">
                  <span className="text-sm font-medium text-[color:var(--sem-text-secondary)]">Popular Item</span>
                  <Toggle
                    checked={formState.isPopular}
                    onChange={(value) => updateField("isPopular", value)}
                    label="Feature in catalog"
                    description="Keeps the existing isPopular field only."
                    disabled={fieldsDisabled}
                  />
                </div>
                <div className="flex flex-wrap gap-2 rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-3 lg:col-span-2">
                  {parsedTags.length > 0 ? parsedTags.map((tag) => (
                    <StatusBadge key={tag}>{tag}</StatusBadge>
                  )) : (
                    <span className="text-sm text-[color:var(--sem-text-muted)]">No tags configured.</span>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              eyebrow="Zone 5"
              title="Inventory Readiness"
              description="Supplier metadata and future tracking mode only. No live inventory sync."
              icon={Boxes}
            >
              <div className="grid gap-4 lg:grid-cols-3">
                <Field label="Supplier Name">
                  <input
                    value={formState.supplierName}
                    onChange={(event) => updateField("supplierName", event.target.value)}
                    disabled={fieldsDisabled}
                    className={inputClass}
                    placeholder="Supplier"
                  />
                </Field>
                <Field label="Supplier SKU">
                  <input
                    value={formState.supplierSku}
                    onChange={(event) => updateField("supplierSku", event.target.value)}
                    disabled={fieldsDisabled}
                    className={monoInputClass}
                    placeholder="SUP-SKU"
                  />
                </Field>
                <Field label="Inventory Tracking Mode">
                  <select
                    value={formState.inventoryTrackingMode}
                    onChange={(event) => updateField("inventoryTrackingMode", event.target.value as PricebookInventoryTrackingMode)}
                    disabled={fieldsDisabled}
                    className={inputClass}
                  >
                    {PRICEBOOK_INVENTORY_TRACKING_MODES.map((modeValue) => (
                      <option key={modeValue} value={modeValue}>{getInventoryTrackingLabel(modeValue)}</option>
                    ))}
                  </select>
                </Field>
                <div className="lg:col-span-3">
                  <Field label="Inventory Notes" note="Metadata only. Does not update inventory stock or movements.">
                    <textarea
                      value={formState.inventoryNotes}
                      onChange={(event) => updateField("inventoryNotes", event.target.value)}
                      disabled={fieldsDisabled}
                      rows={4}
                      className={textareaClass}
                      placeholder="Future inventory handling guidance only."
                    />
                  </Field>
                </div>
              </div>
            </SectionCard>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <SectionCard
              eyebrow="Zone 2"
              title="Pricing Structure"
              description="Customer price, costs, and labor minutes."
              icon={BadgeDollarSign}
            >
              <div className="space-y-4">
                <CurrencyInput
                  label="Customer Price"
                  value={formState.customerPrice}
                  onChange={(value) => updateField("customerPrice", value)}
                  disabled={fieldsDisabled}
                />
                <CurrencyInput
                  label="Minimum Price"
                  value={formState.minimumPrice}
                  onChange={(value) => updateField("minimumPrice", value)}
                  disabled={fieldsDisabled}
                />
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                  <CurrencyInput label="Base Cost" value={formState.baseCost} onChange={(value) => updateField("baseCost", value)} disabled={fieldsDisabled} />
                  <CurrencyInput label="Material" value={formState.materialCost} onChange={(value) => updateField("materialCost", value)} disabled={fieldsDisabled} />
                  <CurrencyInput label="Labor" value={formState.laborCost} onChange={(value) => updateField("laborCost", value)} disabled={fieldsDisabled} />
                </div>
                <Field label="Labor Minutes">
                  <div className="flex h-11 items-center rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)]">
                    <input
                      value={formState.estimatedLaborMinutes}
                      onChange={(event) => updateField("estimatedLaborMinutes", event.target.value)}
                      inputMode="numeric"
                      disabled={fieldsDisabled}
                      className="h-full min-w-0 flex-1 bg-transparent px-3 font-[family:var(--font-geist-mono)] text-sm text-[color:var(--sem-text-primary)] outline-none disabled:cursor-not-allowed"
                    />
                    <span className="border-l border-[color:var(--cmp-border-subtle)] px-3 font-[family:var(--font-geist-mono)] text-sm text-[color:var(--sem-text-muted)]">min</span>
                  </div>
                </Field>

                <div className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">Pricing check — unsaved</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <div className="rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-3">
                      <p className="text-xs text-[color:var(--sem-text-muted)]">Combined costs</p>
                      <p className="mt-1 font-[family:var(--font-geist-mono)] text-lg font-semibold text-[color:var(--sem-text-primary)]">
                        {formatCurrencyFromCents(costPreview.combinedCostsCents)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-3">
                      <p className="text-xs text-[color:var(--sem-text-muted)]">Spread</p>
                      <p className={`mt-1 font-[family:var(--font-geist-mono)] text-lg font-semibold ${costPreview.spreadCents < 0 ? "text-rose-300" : "text-[color:var(--sem-text-primary)]"}`}>
                        {formatCurrencyFromCents(costPreview.spreadCents)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[color:var(--sem-text-muted)]">
                    Visual helper only. Mirrors the existing client-side calculator and is not margin analytics.
                  </p>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              eyebrow="Zone 4"
              title="Warranty & Compliance"
              description="Per-item warranty and permit flags."
              icon={ShieldCheck}
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Field label="Warranty Months">
                  <input
                    value={formState.warrantyMonths}
                    onChange={(event) => updateField("warrantyMonths", event.target.value)}
                    inputMode="numeric"
                    disabled={fieldsDisabled}
                    className={monoInputClass}
                    placeholder="12"
                  />
                </Field>
                <Field label="Sort Order">
                  <input
                    value={formState.sortOrder}
                    onChange={(event) => updateField("sortOrder", event.target.value)}
                    inputMode="numeric"
                    disabled={fieldsDisabled}
                    className={monoInputClass}
                    placeholder="0"
                  />
                </Field>
              </div>
              <div className="mt-4 space-y-3">
                <Toggle
                  checked={formState.requiresPermit}
                  onChange={(value) => updateField("requiresPermit", value)}
                  label="Requires Permit"
                  description="Flags regulatory work in the catalog."
                  disabled={fieldsDisabled}
                />
                <Toggle
                  checked={formState.isActive}
                  onChange={(value) => updateField("isActive", value)}
                  label="Active Item"
                  description="Controls active/archive state metadata."
                  disabled={fieldsDisabled}
                />
              </div>
            </SectionCard>
          </aside>
        </div>

        <div className="mt-5 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4 text-xs leading-6 text-[color:var(--sem-text-muted)]">
          Saved items are pickable on job quotes and invoices, but edits do not rewrite existing document line snapshots. Inventory tracking modes remain metadata only — no live stock deduction or inventory auto-sync.
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)]/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-[92rem] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {mode === "edit" && canManage ? (
                <>
                  <button
                    type="button"
                    onClick={onDuplicate}
                    disabled={actionsBusy}
                    className="theme-control-surface inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDuplicating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                    Duplicate Item
                  </button>
                  <button
                    type="button"
                    onClick={onArchiveToggle}
                    disabled={actionsBusy}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isChangingArchiveState ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : currentItem?.is_active ? (
                      <Archive className="h-4 w-4" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    {currentItem?.is_active ? "Archive Item" : "Restore Item"}
                  </button>
                </>
              ) : mode === "create" && canManage ? (
                <p className="text-sm text-[color:var(--sem-text-muted)]">New item mode · save creates the catalog record.</p>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Link href="/pricebook" className="theme-control-surface rounded-xl px-4 py-2.5 text-sm font-medium">
                Cancel
              </Link>
              {canManage ? (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={actionsBusy}
                  className="theme-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {mode === "create" ? "Create Item" : "Save Changes"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </BoardShell>
  );
}

function LegacyPricebookFormView({
  mode,
  formState,
  currentItem,
  costPreview,
  errorMessage,
  successMessage,
  isSaving,
  isDuplicating,
  isChangingArchiveState,
  updateField,
  onSave,
  onDuplicate,
  onArchiveToggle,
}: PricebookFormViewProps) {
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
              <Link href="/pricebook" className="theme-control-surface inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium">
                Back to workspace
              </Link>
              {mode === "edit" ? (
                <>
                  <button type="button" onClick={onDuplicate} disabled={isDuplicating || isSaving || isChangingArchiveState} className="theme-btn-secondary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">
                    {isDuplicating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                    Duplicate
                  </button>
                  <button type="button" onClick={onArchiveToggle} disabled={isDuplicating || isSaving || isChangingArchiveState} className="theme-control-surface inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">
                    {isChangingArchiveState ? <LoaderCircle className="h-4 w-4 animate-spin" /> : currentItem?.is_active ? <Trash2 className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
                    {currentItem?.is_active ? "Delete" : "Restore"}
                  </button>
                </>
              ) : null}
              <button type="button" onClick={onSave} disabled={isSaving || isDuplicating || isChangingArchiveState} className="theme-btn-secondary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {mode === "create" ? "Create item" : "Save changes"}
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Combined costs</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{formatCurrencyFromCents(costPreview.combinedCostsCents)}</p>
            </article>
            <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Current spread</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{formatCurrencyFromCents(costPreview.spreadCents)}</p>
            </article>
            <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Item state</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{formState.isActive ? "Active" : "Archived"}</p>
            </article>
          </div>

          {errorMessage ? <div className="mt-6 rounded-[20px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{errorMessage}</div> : null}
          {successMessage ? <div className="mt-6 rounded-[20px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{successMessage}</div> : null}

          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <section className="space-y-6">
              <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
                <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Identity</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Internal SKU</span><input value={formState.internalSku} onChange={(event) => updateField("internalSku", event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="GAS-CLEAN-001" /></label>
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Name</span><input value={formState.name} onChange={(event) => updateField("name", event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="Gas fireplace cleaning" /></label>
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Item type</span><select value={formState.itemType} onChange={(event) => updateField("itemType", event.target.value as PricebookItemType)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm">{PRICEBOOK_ITEM_TYPES.map((itemType) => <option key={itemType} value={itemType}>{getPricebookItemTypeLabel(itemType)}</option>)}</select></label>
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Unit of measure</span><select value={formState.unitOfMeasure} onChange={(event) => updateField("unitOfMeasure", event.target.value as PricebookUnitOfMeasure)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm">{PRICEBOOK_UNIT_OF_MEASURES.map((unitOfMeasure) => <option key={unitOfMeasure} value={unitOfMeasure}>{getPricebookUnitLabel(unitOfMeasure)}</option>)}</select></label>
                </div>
              </div>
              <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
                <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Descriptions</h2>
                <div className="mt-5 grid gap-4">
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Customer description</span><textarea value={formState.customerDescription} onChange={(event) => updateField("customerDescription", event.target.value)} rows={4} className="theme-input-control min-h-[120px] w-full rounded-[18px] px-4 py-3 text-sm" placeholder="What the customer should see on future estimates or invoices." /></label>
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Internal description</span><textarea value={formState.internalDescription} onChange={(event) => updateField("internalDescription", event.target.value)} rows={4} className="theme-input-control min-h-[120px] w-full rounded-[18px] px-4 py-3 text-sm" placeholder="Internal notes for the field team or office staff." /></label>
                </div>
              </div>
              <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
                <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Pricing and Labor</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {(["baseCost", "materialCost", "laborCost", "customerPrice", "minimumPrice"] as const).map((field) => (
                    <label key={field} className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">{field}</span><input inputMode="decimal" value={formState[field]} onChange={(event) => updateField(field, event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="0.00" /></label>
                  ))}
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Estimated labor minutes</span><input inputMode="numeric" value={formState.estimatedLaborMinutes} onChange={(event) => updateField("estimatedLaborMinutes", event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="Optional" /></label>
                </div>
              </div>
            </section>
            <section className="space-y-6">
              <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
                <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Routing and Tags</h2>
                <div className="mt-5 grid gap-4">
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Trade area</span><input value={formState.tradeArea} onChange={(event) => updateField("tradeArea", event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="Gas, Wood, Masonry" /></label>
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Service area</span><input value={formState.serviceArea} onChange={(event) => updateField("serviceArea", event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="North Zone, East Route" /></label>
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Tags</span><input value={formState.tags} onChange={(event) => updateField("tags", event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="seasonal, premium, field-favorite" /></label>
                </div>
              </div>
              <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
                <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Inventory-ready details</h2>
                <div className="mt-5 grid gap-4">
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Inventory tracking mode</span><select value={formState.inventoryTrackingMode} onChange={(event) => updateField("inventoryTrackingMode", event.target.value as PricebookInventoryTrackingMode)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm">{PRICEBOOK_INVENTORY_TRACKING_MODES.map((modeValue) => <option key={modeValue} value={modeValue}>{getInventoryTrackingLabel(modeValue)}</option>)}</select></label>
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Supplier name</span><input value={formState.supplierName} onChange={(event) => updateField("supplierName", event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="Primary supplier" /></label>
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Supplier SKU</span><input value={formState.supplierSku} onChange={(event) => updateField("supplierSku", event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="SUP-001" /></label>
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Inventory notes</span><textarea value={formState.inventoryNotes} onChange={(event) => updateField("inventoryNotes", event.target.value)} rows={4} className="theme-input-control min-h-[120px] w-full rounded-[18px] px-4 py-3 text-sm" placeholder="Future inventory handling guidance only." /></label>
                </div>
              </div>
              <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
                <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Flags</h2>
                <div className="mt-5 grid gap-4">
                  <label className="theme-control-surface flex items-center justify-between gap-4 rounded-[20px] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]"><span>Popular item</span><input type="checkbox" checked={formState.isPopular} onChange={(event) => updateField("isPopular", event.target.checked)} className="h-4 w-4" /></label>
                  <label className="theme-control-surface flex items-center justify-between gap-4 rounded-[20px] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]"><span>Requires permit</span><input type="checkbox" checked={formState.requiresPermit} onChange={(event) => updateField("requiresPermit", event.target.checked)} className="h-4 w-4" /></label>
                  <label className="theme-control-surface flex items-center justify-between gap-4 rounded-[20px] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]"><span>Active item</span><input type="checkbox" checked={formState.isActive} onChange={(event) => updateField("isActive", event.target.checked)} className="h-4 w-4" /></label>
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Warranty months</span><input inputMode="numeric" value={formState.warrantyMonths} onChange={(event) => updateField("warrantyMonths", event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="Optional" /></label>
                  <label className="block space-y-2"><span className="text-sm text-[color:var(--sem-text-secondary)]">Sort order</span><input inputMode="numeric" value={formState.sortOrder} onChange={(event) => updateField("sortOrder", event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" /></label>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

export function PricebookForm({ mode, initialItem = null, sessionRole = null }: PricebookFormProps) {
  const router = useRouter();
  const [currentItem, setCurrentItem] = useState<PricebookItem | null>(initialItem);
  const [formState, setFormState] = useState<FormState>(() => buildInitialState(initialItem));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isChangingArchiveState, setIsChangingArchiveState] = useState(false);

  const canManage = canManagePricebookRole(sessionRole);
  const canView = canViewPricebookRole(sessionRole);
  const blocked = mode === "create" ? !canManage : !canView;
  const fieldsDisabled = !canManage;

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

  if (blocked) {
    return <AccessRestrictedPanel mode={mode} sessionRole={sessionRole} />;
  }

  const viewProps: PricebookFormViewProps = {
    mode,
    formState,
    currentItem,
    costPreview,
    errorMessage,
    successMessage,
    isSaving,
    isDuplicating,
    isChangingArchiveState,
    canManage,
    canView,
    fieldsDisabled,
    updateField,
    onSave: () => void handleSave(),
    onDuplicate: () => void handleDuplicate(),
    onArchiveToggle: () => void handleArchiveToggle(),
  };

  if (SHOW_LEGACY_PRICEBOOK_FORM) {
    return <LegacyPricebookFormView {...viewProps} />;
  }

  return <PricebookItemBuilderView {...viewProps} />;
}
