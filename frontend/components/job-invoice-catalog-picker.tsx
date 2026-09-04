"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Layers3, LoaderCircle, Package2, Plus, X } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  formatCentsInput,
  invoiceLineFromPricebookItem,
  invoiceLineFromResolvedRequirement,
  normalizeQuantityInput,
  parseCurrencyInputToCents,
  type InvoiceBuilderLine,
} from "@/lib/crm/invoice-line-model";
import {
  buildPricebookBundleQuery,
  buildPricebookItemQuery,
  formatCurrencyFromCents,
  itemHasWarranty,
  parseWarrantyDurationMonths,
  type PricebookBundle,
  type PricebookBundleDetail,
  type PricebookBundleListResult,
  type PricebookBundleRequirement,
  type PricebookCategory,
  type PricebookCategoryListResult,
  type PricebookItem,
  type PricebookItemListResult,
  type PricebookSystem,
  type PricebookSystemListResult,
} from "@/lib/crm/pricebook-model";

type JobInvoiceCatalogPickerProps = {
  onAddLines: (lines: InvoiceBuilderLine[]) => void;
  onClose: () => void;
};

type FlowMode = "choose" | "single" | "bundle";
type SingleStep = "system" | "category" | "items" | "configure";
type BundleStep = "list" | "wizard" | "confirm";

type BundleLineDraft = {
  requirement: PricebookBundleRequirement;
  item: PricebookItem;
  quantity: string;
  warrantyEnabled: boolean;
  warrantyMonthsInput: string;
};

const panelClass = "rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70";
const inputClass =
  "w-full rounded-[16px] border border-white/10 bg-black/35 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none transition focus:border-[color:rgba(212,175,55,0.34)]";
const buttonSecondaryClass =
  "rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/74 transition hover:border-white/20 hover:text-white";
const buttonPrimaryClass =
  "inline-flex items-center gap-2 rounded-full border border-[color:rgba(212,175,55,0.24)] px-4 py-2 text-xs uppercase tracking-[0.18em] text-[#f7df97] transition hover:border-[color:rgba(212,175,55,0.34)] hover:text-[#fde8a5]";

function ChoiceCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[20px] border border-white/10 bg-black/20 p-4 text-left transition hover:border-[color:rgba(212,175,55,0.24)] hover:bg-black/30"
    >
      <p className="font-medium text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/54">{description}</p>
    </button>
  );
}

export default function JobInvoiceCatalogPicker({ onAddLines, onClose }: JobInvoiceCatalogPickerProps) {
  const [mode, setMode] = useState<FlowMode>("choose");
  const [singleStep, setSingleStep] = useState<SingleStep>("system");
  const [bundleStep, setBundleStep] = useState<BundleStep>("list");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [systems, setSystems] = useState<PricebookSystem[]>([]);
  const [categories, setCategories] = useState<PricebookCategory[]>([]);
  const [items, setItems] = useState<PricebookItem[]>([]);
  const [bundles, setBundles] = useState<PricebookBundle[]>([]);

  const [selectedSystemId, setSelectedSystemId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedItem, setSelectedItem] = useState<PricebookItem | null>(null);
  const [singleQuantity, setSingleQuantity] = useState("1");
  const [singleUnitPriceInput, setSingleUnitPriceInput] = useState("");
  const [singleWarrantyEnabled, setSingleWarrantyEnabled] = useState(false);
  const [singleWarrantyMonthsInput, setSingleWarrantyMonthsInput] = useState("");

  const [selectedBundle, setSelectedBundle] = useState<PricebookBundleDetail | null>(null);
  const [requirementIndex, setRequirementIndex] = useState(0);
  const [requirementItems, setRequirementItems] = useState<PricebookItem[]>([]);
  const [requirementSelections, setRequirementSelections] = useState<Record<string, PricebookItem>>({});
  const [bundleLineDrafts, setBundleLineDrafts] = useState<BundleLineDraft[]>([]);

  const sortedRequirements = useMemo(() => {
    if (!selectedBundle) {
      return [];
    }

    return [...selectedBundle.requirements].sort((left, right) => left.sort_order - right.sort_order);
  }, [selectedBundle]);

  const currentRequirement = sortedRequirements[requirementIndex] ?? null;

  useEffect(() => {
    if (mode !== "single" || singleStep !== "system") {
      return;
    }

    let ignore = false;
    setIsLoading(true);
    setErrorMessage(null);

    void crmApiFetch<PricebookSystemListResult>("/api/pricebook/systems")
      .then((result) => {
        if (ignore) {
          return;
        }

        const nextSystems = [...result.systems].sort((left, right) => left.name.localeCompare(right.name));
        setSystems(nextSystems);
        setSelectedSystemId((current) => current || nextSystems[0]?.id || "");
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Systems could not be loaded.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [mode, singleStep]);

  useEffect(() => {
    if (mode !== "single" || singleStep !== "category" || !selectedSystemId) {
      return;
    }

    let ignore = false;
    setIsLoading(true);
    setErrorMessage(null);

    void crmApiFetch<PricebookCategoryListResult>(`/api/pricebook/categories?systemId=${encodeURIComponent(selectedSystemId)}`)
      .then((result) => {
        if (ignore) {
          return;
        }

        const nextCategories = [...result.categories].sort((left, right) => left.name.localeCompare(right.name));
        setCategories(nextCategories);
        setSelectedCategoryId((current) => current || nextCategories[0]?.id || "");
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Categories could not be loaded.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [mode, singleStep, selectedSystemId]);

  useEffect(() => {
    if (mode !== "single" || singleStep !== "items" || !selectedSystemId || !selectedCategoryId) {
      return;
    }

    let ignore = false;
    setIsLoading(true);
    setErrorMessage(null);

    const params = buildPricebookItemQuery({
      systemId: selectedSystemId,
      categoryId: selectedCategoryId,
      activeState: "active",
      pageSize: 50,
    });

    void crmApiFetch<PricebookItemListResult>(`/api/pricebook/items?${params.toString()}`)
      .then((result) => {
        if (ignore) {
          return;
        }

        setItems(result.items);
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Items could not be loaded.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [mode, singleStep, selectedSystemId, selectedCategoryId]);

  useEffect(() => {
    if (mode !== "bundle" || bundleStep !== "list") {
      return;
    }

    let ignore = false;
    setIsLoading(true);
    setErrorMessage(null);

    const params = buildPricebookBundleQuery({
      activeState: "active",
      pageSize: 50,
    });

    void crmApiFetch<PricebookBundleListResult>(`/api/pricebook/bundles?${params.toString()}`)
      .then((result) => {
        if (ignore) {
          return;
        }

        setBundles(result.items);
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Bundles could not be loaded.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [mode, bundleStep]);

  useEffect(() => {
    if (mode !== "bundle" || bundleStep !== "wizard" || !currentRequirement) {
      return;
    }

    let ignore = false;
    setIsLoading(true);
    setErrorMessage(null);

    const params = buildPricebookItemQuery({
      categoryId: currentRequirement.category_id,
      activeState: "active",
      pageSize: 50,
    });

    void crmApiFetch<PricebookItemListResult>(`/api/pricebook/items?${params.toString()}`)
      .then((result) => {
        if (ignore) {
          return;
        }

        setRequirementItems(result.items);
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Requirement items could not be loaded.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [mode, bundleStep, currentRequirement]);

  function resetSingleFlow() {
    setSingleStep("system");
    setSelectedSystemId("");
    setSelectedCategoryId("");
    setSelectedItem(null);
    setItems([]);
    setCategories([]);
    setSingleQuantity("1");
    setSingleUnitPriceInput("");
    setSingleWarrantyEnabled(false);
    setSingleWarrantyMonthsInput("");
  }

  function resetBundleFlow() {
    setBundleStep("list");
    setSelectedBundle(null);
    setRequirementIndex(0);
    setRequirementItems([]);
    setRequirementSelections({});
    setBundleLineDrafts([]);
  }

  function handleBack() {
    setErrorMessage(null);

    if (mode === "choose") {
      onClose();
      return;
    }

    if (mode === "single") {
      if (singleStep === "configure") {
        setSingleStep("items");
        return;
      }

      if (singleStep === "items") {
        setSingleStep("category");
        return;
      }

      if (singleStep === "category") {
        setSingleStep("system");
        return;
      }

      resetSingleFlow();
      setMode("choose");
      return;
    }

    if (bundleStep === "confirm") {
      setBundleStep("wizard");
      setRequirementIndex(sortedRequirements.length - 1);
      return;
    }

    if (bundleStep === "wizard" && requirementIndex > 0) {
      setRequirementIndex((current) => current - 1);
      return;
    }

    resetBundleFlow();
    setMode("choose");
  }

  function openSingleItemFlow() {
    resetSingleFlow();
    setMode("single");
    setSingleStep("system");
  }

  function openBundleFlow() {
    resetBundleFlow();
    setMode("bundle");
    setBundleStep("list");
  }

  function handleSelectItem(item: PricebookItem) {
    setSelectedItem(item);
    setSingleQuantity("1");
    setSingleUnitPriceInput(formatCentsInput(item.customer_price_cents));
    setSingleWarrantyEnabled(itemHasWarranty(item.warranty_months));
    setSingleWarrantyMonthsInput(itemHasWarranty(item.warranty_months) ? String(item.warranty_months) : "");
    setSingleStep("configure");
  }

  function handleAddSingleLine() {
    if (!selectedItem) {
      return;
    }

    try {
      const quantity = normalizeQuantityInput(singleQuantity, "Quantity");
      const unitPriceCents = parseCurrencyInputToCents(singleUnitPriceInput, "Unit price");
      const warrantyMonths = parseWarrantyDurationMonths(singleWarrantyMonthsInput, singleWarrantyEnabled);
      const line = invoiceLineFromPricebookItem(selectedItem);

      onAddLines([
        {
          ...line,
          quantity,
          unitPriceInput: formatCentsInput(unitPriceCents),
          unitPriceCents,
          warrantyEnabled: singleWarrantyEnabled,
          warrantyMonthsInput: singleWarrantyEnabled ? String(warrantyMonths) : "",
          warrantyMonths,
        },
      ]);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The line could not be added.");
    }
  }

  async function handleSelectBundle(bundle: PricebookBundle) {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const detail = await crmApiFetch<PricebookBundleDetail>(`/api/pricebook/bundles/${bundle.id}`);
      const requirements = [...detail.requirements].sort((left, right) => left.sort_order - right.sort_order);

      if (requirements.length === 0) {
        throw new Error("This bundle has no requirements configured.");
      }

      setSelectedBundle(detail);
      setRequirementIndex(0);
      setRequirementSelections({});
      setBundleStep("wizard");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The bundle could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSelectRequirementItem(item: PricebookItem) {
    if (!currentRequirement) {
      return;
    }

    const nextSelections = {
      ...requirementSelections,
      [currentRequirement.id]: item,
    };
    setRequirementSelections(nextSelections);

    if (requirementIndex < sortedRequirements.length - 1) {
      setRequirementIndex((current) => current + 1);
      return;
    }

    if (!selectedBundle) {
      return;
    }

    const drafts = sortedRequirements.map((requirement) => {
      const selected = nextSelections[requirement.id];

      if (!selected) {
        throw new Error(`Missing selection for ${requirement.label}.`);
      }

      return {
        requirement,
        item: selected,
        quantity: normalizeQuantityInput(requirement.default_quantity, "Quantity"),
        warrantyEnabled: itemHasWarranty(selected.warranty_months),
        warrantyMonthsInput: itemHasWarranty(selected.warranty_months) ? String(selected.warranty_months) : "",
      };
    });

    setBundleLineDrafts(drafts);
    setBundleStep("confirm");
  }

  function updateBundleDraft(
    requirementId: string,
    patch: Partial<Pick<BundleLineDraft, "quantity" | "warrantyEnabled" | "warrantyMonthsInput">>,
  ) {
    setBundleLineDrafts((current) =>
      current.map((draft) => (draft.requirement.id === requirementId ? { ...draft, ...patch } : draft)),
    );
  }

  function handleAddBundleLines() {
    if (!selectedBundle) {
      return;
    }

    try {
      const lines = bundleLineDrafts.map((draft) => {
        const quantity = normalizeQuantityInput(draft.quantity, "Quantity");
        const warrantyMonths = parseWarrantyDurationMonths(draft.warrantyMonthsInput, draft.warrantyEnabled);
        const line = invoiceLineFromResolvedRequirement(selectedBundle, draft.requirement, draft.item);

        return {
          ...line,
          quantity,
          warrantyEnabled: draft.warrantyEnabled,
          warrantyMonthsInput: draft.warrantyEnabled ? String(warrantyMonths) : "",
          warrantyMonths,
        };
      });

      onAddLines(lines);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Bundle lines could not be added.");
    }
  }

  return (
    <section className={panelClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-white">
          <Package2 className="h-4 w-4 text-[color:var(--flat-gold)]" />
          <h3 className="text-base font-semibold text-[#f5ecd2]">Add to Invoice</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/10 p-2 text-white/60 transition hover:border-white/20 hover:text-white"
          aria-label="Close catalog picker"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={handleBack} className={buttonSecondaryClass}>
          <span className="inline-flex items-center gap-2">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </span>
        </button>
        {mode === "bundle" && bundleStep === "wizard" && currentRequirement ? (
          <span className="text-xs uppercase tracking-[0.18em] text-white/42">
            Step {requirementIndex + 1} of {sortedRequirements.length}
          </span>
        ) : null}
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-[18px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="mt-4 inline-flex items-center gap-2 text-xs text-white/52">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          Loading catalog
        </div>
      ) : null}

      {mode === "choose" ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            title="Single item"
            description="Browse by system and category, then set quantity, price, and warranty before adding."
            onClick={openSingleItemFlow}
          />
          <ChoiceCard
            title="Add bundle"
            description="Pick a bundle and satisfy each requirement from its category. Bundle lines default to $0."
            onClick={openBundleFlow}
          />
        </div>
      ) : null}

      {mode === "single" && singleStep === "system" ? (
        <div className="mt-5 space-y-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/38">System</p>
          <div className="grid gap-2">
            {systems.map((system) => (
              <button
                key={system.id}
                type="button"
                onClick={() => {
                  setSelectedSystemId(system.id);
                  setSelectedCategoryId("");
                  setSingleStep("category");
                }}
                className={`rounded-[18px] border px-4 py-3 text-left transition ${
                  selectedSystemId === system.id
                    ? "border-[color:rgba(212,175,55,0.34)] bg-[color:rgba(212,175,55,0.08)] text-white"
                    : "border-white/10 bg-black/20 text-white/72 hover:border-white/20 hover:text-white"
                }`}
              >
                {system.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {mode === "single" && singleStep === "category" ? (
        <div className="mt-5 space-y-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/38">Category</p>
          <div className="grid gap-2">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setSelectedCategoryId(category.id);
                  setSingleStep("items");
                }}
                className={`rounded-[18px] border px-4 py-3 text-left transition ${
                  selectedCategoryId === category.id
                    ? "border-[color:rgba(212,175,55,0.34)] bg-[color:rgba(212,175,55,0.08)] text-white"
                    : "border-white/10 bg-black/20 text-white/72 hover:border-white/20 hover:text-white"
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {mode === "single" && singleStep === "items" ? (
        <div className="mt-5 space-y-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/38">Items</p>
          {items.length > 0 ? (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-[18px] border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{item.name}</p>
                      <p className="mt-1 text-xs text-white/44">{item.internal_sku}</p>
                      {item.customer_description ? (
                        <p className="mt-2 text-sm text-white/58">{item.customer_description}</p>
                      ) : null}
                    </div>
                    <button type="button" onClick={() => handleSelectItem(item)} className={buttonSecondaryClass}>
                      Select
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-white/44">
                    <span>{item.item_type}</span>
                    <span>{formatCurrencyFromCents(item.customer_price_cents)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/50">
              No active items found in this category.
            </div>
          )}
        </div>
      ) : null}

      {mode === "single" && singleStep === "configure" && selectedItem ? (
        <div className="mt-5 space-y-4 rounded-[20px] border border-white/10 bg-black/20 p-4">
          <div>
            <p className="font-medium text-white">{selectedItem.name}</p>
            <p className="mt-1 text-xs text-white/44">
              Catalog price {formatCurrencyFromCents(selectedItem.customer_price_cents)}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2 text-xs uppercase tracking-[0.18em] text-white/38">
              <span>Quantity</span>
              <input
                type="text"
                inputMode="decimal"
                value={singleQuantity}
                onChange={(event) => setSingleQuantity(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="space-y-2 text-xs uppercase tracking-[0.18em] text-white/38">
              <span>Unit Price</span>
              <input
                type="text"
                inputMode="decimal"
                value={singleUnitPriceInput}
                onChange={(event) => setSingleUnitPriceInput(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
            <label className="flex items-center justify-between gap-3 text-sm text-white/72">
              <span>Warranty</span>
              <input
                type="checkbox"
                checked={singleWarrantyEnabled}
                onChange={(event) => {
                  setSingleWarrantyEnabled(event.target.checked);
                  if (!event.target.checked) {
                    setSingleWarrantyMonthsInput("");
                  }
                }}
                className="h-4 w-4"
              />
            </label>
            {singleWarrantyEnabled ? (
              <label className="mt-3 block space-y-2 text-xs uppercase tracking-[0.18em] text-white/38">
                <span>Months</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={singleWarrantyMonthsInput}
                  onChange={(event) => setSingleWarrantyMonthsInput(event.target.value)}
                  className={inputClass}
                  placeholder="e.g. 12"
                />
              </label>
            ) : null}
          </div>

          <button type="button" onClick={handleAddSingleLine} className={buttonPrimaryClass}>
            <Plus className="h-3.5 w-3.5" />
            Add line
          </button>
        </div>
      ) : null}

      {mode === "bundle" && bundleStep === "list" ? (
        <div className="mt-5 space-y-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/38">Bundles</p>
          {bundles.length > 0 ? (
            <div className="space-y-3">
              {bundles.map((bundle) => (
                <div key={bundle.id} className="rounded-[18px] border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{bundle.name}</p>
                      {bundle.description ? (
                        <p className="mt-2 text-sm text-white/58">{bundle.description}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void handleSelectBundle(bundle);
                      }}
                      className={buttonSecondaryClass}
                    >
                      Select
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/50">
              No active bundles found.
            </div>
          )}
        </div>
      ) : null}

      {mode === "bundle" && bundleStep === "wizard" && selectedBundle && currentRequirement ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-[18px] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-2 text-white">
              <Layers3 className="h-4 w-4 text-[color:var(--flat-gold)]" />
              <p className="font-medium">{selectedBundle.name}</p>
            </div>
            <p className="mt-2 text-sm text-white/58">{currentRequirement.label}</p>
            <p className="mt-1 text-xs text-white/42">
              Category: {currentRequirement.category?.name ?? "Catalog category"}
            </p>
          </div>

          {requirementItems.length > 0 ? (
            <div className="space-y-3">
              {requirementItems.map((item) => (
                <div key={item.id} className="rounded-[18px] border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{item.name}</p>
                      <p className="mt-1 text-xs text-white/44">{item.internal_sku}</p>
                    </div>
                    <button type="button" onClick={() => handleSelectRequirementItem(item)} className={buttonSecondaryClass}>
                      Choose
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-white/44">
                    <span>{item.item_type}</span>
                    <span>Catalog {formatCurrencyFromCents(item.customer_price_cents)} · Invoice $0.00</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/50">
              No active items found for this requirement category.
            </div>
          )}
        </div>
      ) : null}

      {mode === "bundle" && bundleStep === "confirm" && selectedBundle ? (
        <div className="mt-5 space-y-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/38">Confirm bundle lines</p>
          {bundleLineDrafts.map((draft) => (
            <article key={draft.requirement.id} className="rounded-[18px] border border-white/10 bg-black/20 p-4">
              <p className="font-medium text-white">{draft.item.name}</p>
              <p className="mt-1 text-xs text-white/44">{draft.requirement.label}</p>
              <p className="mt-2 text-xs text-white/42">
                Catalog {formatCurrencyFromCents(draft.item.customer_price_cents)} · Invoice $0.00
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-xs uppercase tracking-[0.18em] text-white/38">
                  <span>Quantity</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft.quantity}
                    onChange={(event) => updateBundleDraft(draft.requirement.id, { quantity: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-3">
                  <label className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-white/38">
                    <span>Warranty</span>
                    <input
                      type="checkbox"
                      checked={draft.warrantyEnabled}
                      onChange={(event) =>
                        updateBundleDraft(draft.requirement.id, {
                          warrantyEnabled: event.target.checked,
                          warrantyMonthsInput: event.target.checked ? draft.warrantyMonthsInput : "",
                        })
                      }
                      className="h-4 w-4"
                    />
                  </label>
                  {draft.warrantyEnabled ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={draft.warrantyMonthsInput}
                      onChange={(event) =>
                        updateBundleDraft(draft.requirement.id, { warrantyMonthsInput: event.target.value })
                      }
                      className={`${inputClass} mt-3`}
                      placeholder="Months"
                    />
                  ) : null}
                </div>
              </div>
            </article>
          ))}

          <button type="button" onClick={handleAddBundleLines} className={buttonPrimaryClass}>
            <Plus className="h-3.5 w-3.5" />
            Add {bundleLineDrafts.length} lines
          </button>
        </div>
      ) : null}
    </section>
  );
}
