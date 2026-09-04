"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";
import { crmApiFetch } from "@/lib/crm/browser-api";
import type { SessionRole } from "@/lib/auth/server-session";
import {
  parseCadPriceToCents,
  parseRequiredCategory,
  parseRequiredItemName,
  parseWarrantyDurationMonths,
  type PricebookCategory,
  type PricebookItem,
  type PricebookSystem,
} from "@/lib/crm/pricebook-model";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

type PricebookAddItemFormProps = {
  sessionRole?: SessionRole | null;
  systems?: PricebookSystem[];
  categories?: PricebookCategory[];
};

function canManagePricebookRole(sessionRole: SessionRole | null | undefined) {
  return sessionRole === "owner"
    || sessionRole === "admin"
    || sessionRole === "office_admin";
}

function panelClass() {
  return "rounded-[28px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)] backdrop-blur-xl";
}

function Field({
  label,
  required = false,
  note,
  children,
}: {
  label: string;
  required?: boolean;
  note?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[color:var(--sem-text-secondary)]">
        {label}
        {required ? <span className="ml-1 text-[color:var(--sem-accent-primary)]">*</span> : null}
      </span>
      {children}
      {note ? <span className="block text-xs leading-5 text-[color:var(--sem-text-muted)]">{note}</span> : null}
    </label>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("The image could not be read."));
    };
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

export function PricebookAddItemForm({
  sessionRole = null,
  systems = [],
  categories = [],
}: PricebookAddItemFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sortedSystems = useMemo(
    () => [...systems].sort((left, right) => left.name.localeCompare(right.name)),
    [systems],
  );
  const [selectedSystemId, setSelectedSystemId] = useState(sortedSystems[0]?.id ?? "");
  const categoriesForSystem = useMemo(
    () => categories
      .filter((category) => category.system_id === selectedSystemId)
      .sort((left, right) => left.name.localeCompare(right.name)),
    [categories, selectedSystemId],
  );

  const [categoryMode, setCategoryMode] = useState<"existing" | "new">(categoriesForSystem.length > 0 ? "existing" : "new");
  const [existingCategoryId, setExistingCategoryId] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [name, setName] = useState("");
  const [customerDescription, setCustomerDescription] = useState("");
  const [price, setPrice] = useState("");
  const [materialCost, setMaterialCost] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierSku, setSupplierSku] = useState("");
  const [warrantyEnabled, setWarrantyEnabled] = useState(false);
  const [warrantyMonths, setWarrantyMonths] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const canManage = canManagePricebookRole(sessionRole);
  const inputClass = "theme-input-control h-11 w-full rounded-xl px-3 text-sm";
  const textareaClass = "theme-input-control min-h-[112px] w-full resize-none rounded-xl px-3 py-3 text-sm leading-6";

  function selectedCategoryPayload() {
    if (categoryMode === "new") {
      return {
        systemId: selectedSystemId,
        category: parseRequiredCategory(newCategory),
      };
    }

    const category = categoriesForSystem.find((entry) => entry.id === existingCategoryId);

    if (!category) {
      throw new Error("Category is required.");
    }

    return {
      systemId: selectedSystemId,
      categoryId: category.id,
    };
  }

  function handleWarrantyEnabledChange(enabled: boolean) {
    setWarrantyEnabled(enabled);
    if (!enabled) {
      setWarrantyMonths("");
    }
  }

  async function handleImageChange(file: File | null) {
    if (!file) {
      setImagePreview(null);
      setImageDataUrl(null);
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setErrorMessage("Image must be a JPEG, PNG, or WebP file.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setErrorMessage("Image must be 2 MB or smaller.");
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setImagePreview(dataUrl);
    setImageDataUrl(dataUrl);
    setErrorMessage(null);
  }

  async function handleCreate() {
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const created = await crmApiFetch<PricebookItem>("/api/pricebook/items", {
        method: "POST",
        body: JSON.stringify({
          ...selectedCategoryPayload(),
          name: parseRequiredItemName(name),
          customerDescription: customerDescription.trim() || null,
          customerPriceCents: parseCadPriceToCents(price),
          materialCostCents: parseCadPriceToCents(materialCost),
          supplierName: supplierName.trim() || null,
          supplierSku: supplierSku.trim() || null,
          warrantyEnabled,
          warrantyMonths: parseWarrantyDurationMonths(warrantyMonths, warrantyEnabled),
          imageDataUrl,
        }),
      });

      router.push(`/pricebook/${created.id}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The item could not be created.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!canManage) {
    return (
      <BoardShell gridOpacity="subtle">
        <div className="mx-auto max-w-xl px-5 py-16 lg:px-8">
          <section className={`${panelClass()} p-8`}>
            <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">Add New Item</h1>
            <p className="mt-4 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
              Creating catalog items requires owner, admin, or office admin access with pricebook management permissions.
            </p>
            <Link href="/pricebook" className="theme-btn-secondary mt-6 inline-flex items-center rounded-2xl px-4 py-3 text-sm font-medium">
              Back to Pricebook
            </Link>
          </section>
        </div>
      </BoardShell>
    );
  }

  return (
    <BoardShell gridOpacity="subtle">
      <div className="mx-auto max-w-xl px-5 py-6 lg:px-8">
        <section className={`${panelClass()} p-6 sm:p-8`}>
          <h1 className="font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)]">
            Add New Item
          </h1>
          <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            Create a catalog item that can later be copied onto estimates and invoices.
          </p>

          {errorMessage ? (
            <div className="theme-alert-error mt-5 rounded-[20px] border px-4 py-3 text-sm">{errorMessage}</div>
          ) : null}

          <div className="mt-6 space-y-5">
            <Field label="System" required>
              <select
                value={selectedSystemId}
                onChange={(event) => {
                  setSelectedSystemId(event.target.value);
                  setExistingCategoryId("");
                  setCategoryMode("new");
                }}
                className={inputClass}
              >
                <option value="">Select a system</option>
                {sortedSystems.map((system) => (
                  <option key={system.id} value={system.id}>{system.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Category" required>
              <div className="space-y-3">
                {categoriesForSystem.length > 0 ? (
                  <select
                    value={categoryMode === "new" ? "__new__" : existingCategoryId}
                    onChange={(event) => {
                      if (event.target.value === "__new__") {
                        setCategoryMode("new");
                        return;
                      }

                      setCategoryMode("existing");
                      setExistingCategoryId(event.target.value);
                    }}
                    className={inputClass}
                    disabled={!selectedSystemId}
                  >
                    <option value="">Select a category</option>
                    {categoriesForSystem.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                    <option value="__new__">Create new category</option>
                  </select>
                ) : null}
                {categoryMode === "new" || categoriesForSystem.length === 0 ? (
                  <input
                    value={newCategory}
                    onChange={(event) => {
                      setCategoryMode("new");
                      setNewCategory(event.target.value);
                    }}
                    className={inputClass}
                    placeholder="Parts, Labor, Service"
                    disabled={!selectedSystemId}
                  />
                ) : null}
              </div>
            </Field>

            <Field label="Item Name" required>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={inputClass}
                placeholder="OEM SIT Pilot Assembly"
              />
            </Field>

            <Field label="Customer Description" note="This description can later be copied into invoice and estimate lines.">
              <textarea
                value={customerDescription}
                onChange={(event) => setCustomerDescription(event.target.value)}
                className={textareaClass}
                placeholder="Optional customer-facing description"
              />
            </Field>

            <Field label="Customer Price" required note="Invoice default price. Use $0.00 when pricing is set on the job or invoice.">
              <div className="flex h-11 items-center rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)]">
                <span className="border-r border-[color:var(--cmp-border-subtle)] px-3 text-sm text-[color:var(--sem-text-muted)]">CAD</span>
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  inputMode="decimal"
                  className="h-full min-w-0 flex-1 bg-transparent px-3 font-[family:var(--font-geist-mono)] text-sm text-[color:var(--sem-text-primary)] outline-none"
                  placeholder="0.00"
                />
              </div>
            </Field>

            <Field label="Material / Purchase Cost" required note="Fire-Parts purchase cost. Stored separately from customer price.">
              <div className="flex h-11 items-center rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)]">
                <span className="border-r border-[color:var(--cmp-border-subtle)] px-3 text-sm text-[color:var(--sem-text-muted)]">CAD</span>
                <input
                  value={materialCost}
                  onChange={(event) => setMaterialCost(event.target.value)}
                  inputMode="decimal"
                  className="h-full min-w-0 flex-1 bg-transparent px-3 font-[family:var(--font-geist-mono)] text-sm text-[color:var(--sem-text-primary)] outline-none"
                  placeholder="0.00"
                />
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Supplier" required>
                <input
                  value={supplierName}
                  onChange={(event) => setSupplierName(event.target.value)}
                  className={inputClass}
                  placeholder="Fire-Parts"
                />
              </Field>
              <Field label="Supplier SKU" required>
                <input
                  value={supplierSku}
                  onChange={(event) => setSupplierSku(event.target.value)}
                  className={`${inputClass} font-[family:var(--font-geist-mono)]`}
                  placeholder="FP9903"
                />
              </Field>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleWarrantyEnabledChange(!warrantyEnabled)}
                className={`flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition ${warrantyEnabled
                  ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-surface-soft)]"
                  : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]"}`}
              >
                <span>
                  <span className="block text-sm font-semibold text-[color:var(--sem-text-primary)]">Warranty</span>
                  <span className="mt-1 block text-xs text-[color:var(--sem-text-muted)]">
                    Off by default. Turn on only when this item includes a warranty.
                  </span>
                </span>
                <span className={`relative h-6 w-11 rounded-full transition ${warrantyEnabled ? "bg-[color:var(--sem-accent-primary)]" : "bg-[color:var(--cmp-border-subtle)]"}`}>
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${warrantyEnabled ? "left-6" : "left-1"}`} />
                </span>
              </button>

              {warrantyEnabled ? (
                <Field label="Warranty Duration" required note="Positive whole number of months, for example 3, 12, or 36.">
                  <div className="flex h-11 items-center rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)]">
                    <input
                      value={warrantyMonths}
                      onChange={(event) => setWarrantyMonths(event.target.value)}
                      inputMode="numeric"
                      className="h-full min-w-0 flex-1 bg-transparent px-3 font-[family:var(--font-geist-mono)] text-sm text-[color:var(--sem-text-primary)] outline-none"
                      placeholder="12"
                    />
                    <span className="border-l border-[color:var(--cmp-border-subtle)] px-3 text-sm text-[color:var(--sem-text-muted)]">months</span>
                  </div>
                </Field>
              ) : null}
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium text-[color:var(--sem-text-secondary)]">Image</span>
              <p className="text-xs leading-5 text-[color:var(--sem-text-muted)]">
                Optional catalog photo. It does not appear on invoice PDFs.
              </p>
              {imagePreview ? (
                <div className="flex items-center gap-4 rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-3">
                  <img src={imagePreview} alt="Item preview" className="h-16 w-16 rounded-lg object-cover" />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="theme-control-surface rounded-xl px-3 py-2 text-sm"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImagePreview(null);
                        setImageDataUrl(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-[color:var(--cmp-border-subtle)] px-3 py-2 text-sm text-[color:var(--sem-text-secondary)]"
                    >
                      <X className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--cmp-border-subtle)] px-4 py-6 text-sm text-[color:var(--sem-text-secondary)]"
                >
                  <ImagePlus className="h-4 w-4" />
                  Add image
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => void handleImageChange(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-end gap-3">
            <Link href="/pricebook" className="theme-control-surface rounded-xl px-4 py-2.5 text-sm font-medium">
              Cancel
            </Link>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={isSaving}
              className="theme-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              Create Item
            </button>
          </div>
        </section>
      </div>
    </BoardShell>
  );
}
