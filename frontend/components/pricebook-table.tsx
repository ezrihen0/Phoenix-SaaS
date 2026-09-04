"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Boxes,
  ChevronRight,
  Clock3,
  DollarSign,
  FolderKanban,
  LoaderCircle,
  Package2,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  Undo2,
  Wrench,
  X,
} from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";
import { metricTileHoverClassName } from "@/components/board/metric-tile";
import { DesktopOptimizedNotice } from "@/components/mobile/desktop-optimized-notice";
import {
  MasterMobileList,
  MasterTable,
  MasterTablePagination,
  MasterTableRow,
  type MasterTableState,
} from "@/components/master-table";
import { crmApiFetch } from "@/lib/crm/browser-api";
import type { SessionRole } from "@/lib/auth/server-session";
import {
  isPricebookItemInventoryEligible,
  openPricebookInventoryPurchase,
} from "@/lib/crm/pricebook-inventory-bridge";
import {
  PRICEBOOK_ITEM_TYPES,
  buildPricebookItemQuery,
  formatCurrencyFromCents,
  getInventoryTrackingLabel,
  getPricebookItemTypeLabel,
  getPricebookUnitLabel,
  itemHasWarranty,
  itemStatusLabel,
  type PricebookCategory,
  type PricebookItem,
  type PricebookItemFilters,
  type PricebookItemListResult,
  type PricebookItemType,
  type PricebookNavigationSummary,
  type PricebookSystem,
} from "@/lib/crm/pricebook-model";

const SHOW_LEGACY_PRICEBOOK = false;

type PricebookTableProps = {
  sessionRole?: SessionRole | null;
  initialResult: PricebookItemListResult;
  initialFilters: PricebookItemFilters;
  catalogSystems?: PricebookSystem[];
  catalogCategories?: PricebookCategory[];
  navigationSummary?: PricebookNavigationSummary | null;
  loadError?: string | null;
};

type CategoryCard = {
  key: string;
  name: string;
  count: number;
  kind: "system" | "category" | "type";
  systemId?: string;
  categoryId?: string;
  itemType?: string;
};

type PricingModel = {
  label: string;
  detail: string;
  className: string;
  icon: "clock" | "search" | "tag" | "dollar";
};

function panelClass() {
  return "rounded-[28px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)] backdrop-blur-xl";
}

function canViewPricebookRole(sessionRole: SessionRole | null | undefined) {
  return sessionRole === "owner"
    || sessionRole === "admin"
    || sessionRole === "office_admin"
    || sessionRole === "viewer"
    || sessionRole === "technician";
}

function canManagePricebookRole(sessionRole: SessionRole | null | undefined) {
  return sessionRole === "owner"
    || sessionRole === "admin"
    || sessionRole === "office_admin";
}

function getItemCategoryLabel(item: PricebookItem) {
  if (item.category?.name?.trim()) {
    return item.category.name.trim();
  }

  if (item.system?.name?.trim()) {
    return item.system.name.trim();
  }

  return getPricebookItemTypeLabel(item.item_type);
}

function NavigationFolderButton({
  title,
  count,
  active,
  subtitle,
  onClick,
}: {
  title: string;
  count: number;
  active: boolean;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[22px] border p-4 text-left transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)] ${active
        ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-surface-soft)]"
        : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{title}</span>
        <ChevronRight className="h-4 w-4 text-[color:var(--sem-text-muted)]" />
      </div>
      <p className="mt-2 font-[family:var(--font-geist-mono)] text-2xl font-semibold text-[color:var(--sem-display-headline)]">
        {String(count).padStart(2, "0")}
      </p>
      <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{subtitle}</p>
    </button>
  );
}

function getPricingModel(item: PricebookItem): PricingModel {
  if (item.unit_of_measure === "hour") {
    return {
      label: "Hourly Rate",
      detail: `${formatCurrencyFromCents(item.customer_price_cents)}/hr`,
      icon: "clock",
      className: "border-sky-500/30 bg-sky-500/10 text-sky-200",
    };
  }

  if (item.customer_price_cents === 0 && item.minimum_price_cents == null) {
    return {
      label: "TBD / On-Site",
      detail: "Field-priced",
      icon: "search",
      className: "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-text-secondary)]",
    };
  }

  if (["linear_foot", "square_foot", "set"].includes(item.unit_of_measure)) {
    return {
      label: "Unit-Based",
      detail: `${formatCurrencyFromCents(item.customer_price_cents)}/${getPricebookUnitLabel(item.unit_of_measure).toLowerCase()}`,
      icon: "tag",
      className: "border-violet-500/30 bg-violet-500/10 text-violet-200",
    };
  }

  return {
    label: "Flat-Rate",
    detail: formatCurrencyFromCents(item.customer_price_cents),
    icon: "dollar",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  };
}

function PricingModelIcon({ icon }: { icon: PricingModel["icon"] }) {
  if (icon === "clock") {
    return <Clock3 className="h-3.5 w-3.5" />;
  }

  if (icon === "search") {
    return <Search className="h-3.5 w-3.5" />;
  }

  if (icon === "tag") {
    return <Tag className="h-3.5 w-3.5" />;
  }

  return <DollarSign className="h-3.5 w-3.5" />;
}

function PricingBadge({ item }: { item: PricebookItem }) {
  const model = getPricingModel(item);

  return (
    <div>
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${model.className}`}>
        <PricingModelIcon icon={model.icon} />
        {model.label}
      </div>
      <p className="mt-2 font-[family:var(--font-geist-mono)] text-xs text-[color:var(--sem-text-muted)]">{model.detail}</p>
    </div>
  );
}

function buildPageHref(filters: PricebookItemFilters, nextPage: number) {
  const params = buildPricebookItemQuery({
    ...filters,
    page: nextPage,
  });

  const serialized = params.toString();
  return serialized ? `/pricebook?${serialized}` : "/pricebook";
}

function StatusBadge({ item }: { item: PricebookItem }) {
  const active = item.is_active && !item.archived_at;

  return (
    <span
      className={active
        ? "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]"
        : "theme-status-error inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]"}
    >
      {itemStatusLabel(item)}
    </span>
  );
}

function InspectorInfoCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-4">
      <p className="text-xs text-[color:var(--sem-text-muted)]">{label}</p>
      <p className={`mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)] ${mono ? "font-[family:var(--font-geist-mono)]" : ""}`}>{value}</p>
    </div>
  );
}

function PricebookInspectorDrawer({
  item,
  canManage,
  onClose,
  onInventoryPurchase,
  inventoryBusy = false,
}: {
  item: PricebookItem;
  canManage: boolean;
  onClose: () => void;
  onInventoryPurchase?: () => void;
  inventoryBusy?: boolean;
}) {
  const pricingModel = getPricingModel(item);
  const isLabor = item.item_type === "labor";
  const isProductLike = item.item_type === "product" || item.item_type === "part";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[color:var(--cmp-overlay-backdrop)] backdrop-blur-sm" onClick={onClose}>
      <aside
        className="h-full w-full max-w-xl overflow-y-auto border-l border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Catalog inspector</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">{item.name}</h2>
            <p className="mt-1 font-[family:var(--font-geist-mono)] text-sm text-[color:var(--sem-text-muted)]">{item.internal_sku}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[color:var(--cmp-border-subtle)] p-2 text-[color:var(--sem-text-muted)] hover:bg-[color:var(--cmp-hover-surface)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge item={item} />
          {item.is_popular && item.is_active ? (
            <span className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-2.5 py-1 text-[11px] text-[color:var(--sem-text-secondary)]">
              Popular
            </span>
          ) : null}
          {item.requires_permit ? (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-100">
              Permit required
            </span>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <InspectorInfoCard label="Category" value={getItemCategoryLabel(item)} />
          <InspectorInfoCard label="Pricing model" value={pricingModel.label} mono />
          <InspectorInfoCard label="Customer price" value={formatCurrencyFromCents(item.customer_price_cents)} mono />
          <InspectorInfoCard
            label="Warranty"
            value={itemHasWarranty(item.warranty_months) ? `${item.warranty_months} months` : "No warranty set"}
          />
        </div>

        <div className="mt-6 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-[color:var(--sem-text-muted)]" />
            <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">Item details</p>
          </div>

          {isLabor ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InspectorInfoCard
                label="Estimated duration"
                value={item.estimated_labor_minutes != null ? `${item.estimated_labor_minutes} min` : "Not set"}
              />
              <InspectorInfoCard
                label="Technician rate"
                value={`${formatCurrencyFromCents(item.customer_price_cents)}/hr`}
                mono
              />
            </div>
          ) : isProductLike ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InspectorInfoCard label="Vendor / supplier" value={item.supplier_name || "Not set"} />
              <InspectorInfoCard label="Supplier SKU" value={item.supplier_sku || "Not set"} mono />
              <InspectorInfoCard label="Base cost" value={formatCurrencyFromCents(item.base_cost_cents)} mono />
              <InspectorInfoCard label="Material cost" value={formatCurrencyFromCents(item.material_cost_cents)} mono />
              <InspectorInfoCard label="Customer price" value={formatCurrencyFromCents(item.customer_price_cents)} mono />
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InspectorInfoCard label="Base cost" value={formatCurrencyFromCents(item.base_cost_cents)} mono />
              <InspectorInfoCard label="Material cost" value={formatCurrencyFromCents(item.material_cost_cents)} mono />
              <InspectorInfoCard label="Labor cost" value={formatCurrencyFromCents(item.labor_cost_cents)} mono />
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InspectorInfoCard label="Item type" value={getPricebookItemTypeLabel(item.item_type)} />
            <InspectorInfoCard label="Unit of measure" value={getPricebookUnitLabel(item.unit_of_measure)} />
            <InspectorInfoCard label="System" value={item.system?.name?.trim() || "Not set"} />
            <InspectorInfoCard label="Category" value={item.category?.name?.trim() || "Not set"} />
            <InspectorInfoCard label="Trade area (legacy)" value={item.trade_area?.trim() || "Not set"} />
            <InspectorInfoCard label="Service area" value={item.service_area?.trim() || "Not set"} />
            <InspectorInfoCard label="Minimum price" value={item.minimum_price_cents != null ? formatCurrencyFromCents(item.minimum_price_cents) : "No minimum"} mono />
            <InspectorInfoCard label="Inventory tracking" value={getInventoryTrackingLabel(item.inventory_tracking_mode)} />
          </div>

          {item.tags.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs text-[color:var(--sem-text-muted)]">Tags</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-2 py-0.5 text-[11px] text-[color:var(--sem-text-secondary)]">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs text-[color:var(--sem-text-muted)]">Customer description</p>
              <p className="mt-2 rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-3 py-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                {item.customer_description?.trim() || "No customer description set."}
              </p>
            </div>
            {item.internal_description?.trim() ? (
              <div>
                <p className="text-xs text-[color:var(--sem-text-muted)]">Internal description</p>
                <p className="mt-2 rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-3 py-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                  {item.internal_description}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4">
          <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">Line-item readiness</p>
          <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-muted)]">
            Active catalog items can be added to job quotes and invoices through the existing pricebook picker. Catalog edits do not rewrite existing document line snapshots.
          </p>
        </div>

        {isPricebookItemInventoryEligible(item) && canManage && onInventoryPurchase ? (
          <div className="mt-6 rounded-[24px] border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] p-4">
            <div className="flex items-start gap-3">
              <Boxes className="mt-0.5 h-5 w-5 text-[color:var(--sem-accent-primary)]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">Inventory</p>
                <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">
                  Link this Gas part to inventory and open receive stock when you are ready to buy.
                </p>
                <button
                  type="button"
                  disabled={inventoryBusy}
                  onClick={onInventoryPurchase}
                  className="theme-control-surface mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {inventoryBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Package2 className="h-4 w-4" />}
                  Receive stock
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {canManage ? (
          <div className="mt-6">
            <Link
              href={`/pricebook/${item.id}`}
              className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium"
            >
              <Pencil className="h-4 w-4" />
              Edit item
            </Link>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function ReadOnlyScopeCard({ sessionRole }: { sessionRole: SessionRole | null | undefined }) {
  return (
    <article className={`${panelClass()} p-5`}>
      <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-accent-primary)]">Read-only access</p>
      <h2 className="mt-2 text-lg font-semibold text-[color:var(--sem-display-headline)]">Catalog view only</h2>
      <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
        {sessionRole === "viewer"
          ? "Your role can browse the service catalog but cannot create, edit, archive, or restore pricebook items."
          : "Your role does not include pricebook catalog access. Contact an office administrator if you need catalog visibility."}
      </p>
    </article>
  );
}

function PricebookControlDesk({
  sessionRole,
  initialResult,
  initialFilters,
  catalogSystems = [],
  catalogCategories = [],
  navigationSummary = null,
  loadError = null,
}: PricebookTableProps) {
  const router = useRouter();
  const canManage = canManagePricebookRole(sessionRole);
  const canView = canViewPricebookRole(sessionRole);

  const [query, setQuery] = useState(initialFilters.q);
  const [itemType, setItemType] = useState(initialFilters.itemType);
  const [systemId, setSystemId] = useState(initialFilters.systemId);
  const [categoryId, setCategoryId] = useState(initialFilters.categoryId);
  const [tradeArea, setTradeArea] = useState(initialFilters.tradeArea);
  const [activeState, setActiveState] = useState(initialFilters.activeState);
  const [popularOnly, setPopularOnly] = useState(initialFilters.popularOnly);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [inventoryBusyId, setInventoryBusyId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<PricebookItem | null>(null);

  const popularItems = useMemo(
    () => initialResult.items.filter((item) => item.is_popular && item.is_active).slice(0, 4),
    [initialResult.items],
  );

  const selectedCategoryId = initialFilters.categoryId.trim();
  const selectedSystemId = initialFilters.systemId.trim()
    || catalogCategories.find((category) => category.id === selectedCategoryId)?.system_id?.trim()
    || "";
  const selectedSystem = catalogSystems.find((system) => system.id === selectedSystemId) ?? null;
  const selectedCategory = catalogCategories.find((category) => category.id === selectedCategoryId) ?? null;
  const navigationLevel = selectedCategoryId ? "category" : selectedSystemId ? "system" : "root";
  const catalogTotal = navigationSummary?.total_count ?? initialResult.totalCount;

  const systemCards = useMemo(
    () => [...catalogSystems]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((system) => ({
        system,
        count: navigationSummary?.systems?.find((entry) => entry.id === system.id)?.item_count ?? 0,
      })),
    [catalogSystems, navigationSummary],
  );

  const categoryCardsForSystem = useMemo(
    () => catalogCategories
      .filter((category) => category.system_id === selectedSystemId)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((category) => ({
        category,
        count: navigationSummary?.categories?.find((entry) => entry.id === category.id)?.item_count ?? 0,
      })),
    [catalogCategories, navigationSummary, selectedSystemId],
  );

  const activeNavigationKey = selectedCategoryId
    ? `category:${selectedCategoryId}`
    : selectedSystemId
      ? `system:${selectedSystemId}`
      : "All";

  async function runItemAction(item: PricebookItem, action: "archive" | "restore") {
    setActionError(null);
    setBusyActionId(`${action}:${item.id}`);

    try {
      if (action === "archive") {
        const confirmed = typeof window === "undefined"
          ? true
          : window.confirm("Delete will archive this pricebook item. Continue?");

        if (!confirmed) {
          setBusyActionId(null);
          return;
        }

        await crmApiFetch<PricebookItem>(`/api/pricebook/items/${item.id}`, {
          method: "DELETE",
        });
      }

      if (action === "restore") {
        await crmApiFetch<PricebookItem>(`/api/pricebook/items/${item.id}/restore`, {
          method: "POST",
        });
      }

      setSelectedItem(null);
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The item action could not be completed.");
    } finally {
      setBusyActionId(null);
    }
  }

  async function runInventoryPurchase(item: PricebookItem) {
    setActionError(null);
    setInventoryBusyId(item.id);

    try {
      await openPricebookInventoryPurchase(item, router);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Inventory could not be opened.");
    } finally {
      setInventoryBusyId(null);
    }
  }

  function pushFilters(next: {
    q?: string;
    itemType?: string;
    systemId?: string;
    categoryId?: string;
    tradeArea?: string;
    activeState?: PricebookItemFilters["activeState"];
    popularOnly?: boolean;
    page?: number;
  }) {
    const params = buildPricebookItemQuery({
      q: next.q ?? query,
      itemType: next.itemType ?? itemType,
      systemId: next.systemId ?? systemId,
      categoryId: next.categoryId ?? categoryId,
      tradeArea: next.tradeArea ?? tradeArea,
      activeState: next.activeState ?? activeState,
      popularOnly: next.popularOnly ?? popularOnly,
      page: next.page ?? 1,
      pageSize: initialFilters.pageSize,
    });
    const serialized = params.toString();
    router.push(serialized ? `/pricebook?${serialized}` : "/pricebook");
  }

  function applyFilters() {
    pushFilters({});
  }

  function applyCategoryFilter(category: CategoryCard | "all") {
    if (category === "all") {
      setSystemId("");
      setCategoryId("");
      setTradeArea("");
      setItemType("");
      pushFilters({ systemId: "", categoryId: "", tradeArea: "", itemType: "", page: 1 });
      return;
    }

    if (category.kind === "system") {
      setSystemId(category.systemId ?? "");
      setCategoryId("");
      setTradeArea("");
      setItemType("");
      pushFilters({
        systemId: category.systemId ?? "",
        categoryId: "",
        tradeArea: "",
        itemType: "",
        page: 1,
      });
      return;
    }

    if (category.kind === "category") {
      setCategoryId(category.categoryId ?? "");
      setSystemId(category.systemId ?? "");
      setTradeArea("");
      setItemType("");
      pushFilters({
        categoryId: category.categoryId ?? "",
        systemId: category.systemId ?? "",
        tradeArea: "",
        itemType: "",
        page: 1,
      });
      return;
    }

    setItemType(category.itemType ?? "");
    setSystemId("");
    setCategoryId("");
    setTradeArea("");
    pushFilters({
      itemType: category.itemType ?? "",
      systemId: "",
      categoryId: "",
      tradeArea: "",
      page: 1,
    });
  }

  const totalPages = Math.max(1, Math.ceil(initialResult.totalCount / initialResult.pageSize));
  const tableEmpty = !loadError && initialResult.items.length === 0;

  return (
    <BoardShell gridOpacity="subtle">
      <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
        <DesktopOptimizedNotice href="/pricebook" />
        <header className={`${panelClass()} p-5 sm:p-7`}>
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-[color:var(--sem-text-muted)]">
                <FolderKanban className="h-3.5 w-3.5" />
                Revenue engine
              </p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] sm:text-5xl">
                Pricebook Revenue Control Center
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                Reusable service catalog for field pricing, estimates, invoices, and bundles.
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-muted)]">
                Catalog changes do not rewrite existing invoices, estimates, PDFs, signatures, or payments.
              </p>
            </div>

            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Link href="/pricebook/new" className="theme-btn-primary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
                  <Plus className="h-4 w-4" />
                  Create item
                </Link>
                <Link href="/pricebook/bundles" className="theme-control-surface inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium">
                  <Boxes className="h-4 w-4" />
                  Manage bundles
                </Link>
              </div>
            ) : canView ? (
              <ReadOnlyScopeCard sessionRole={sessionRole} />
            ) : null}
          </div>

        </header>

        {!canView ? (
          <section className={`${panelClass()} mt-6 p-6`}>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-accent-primary)]">Access restricted</p>
            <h2 className="mt-2 text-xl font-semibold text-[color:var(--sem-display-headline)]">Pricebook catalog unavailable</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">
              {loadError ?? "Your account role does not include pricebook catalog access."}
            </p>
          </section>
        ) : (
          <>
            {loadError ? (
              <div className="theme-alert-error mt-6 rounded-[20px] border px-4 py-3 text-sm">{loadError}</div>
            ) : null}

            {actionError ? (
              <div className="theme-alert-error mt-6 rounded-[20px] border px-4 py-3 text-sm">{actionError}</div>
            ) : null}

            <div className={`mt-6 grid min-w-0 gap-4${popularItems.length > 0 ? " xl:grid-cols-[1.45fr_0.85fr]" : ""}`}>
              <section className={`${panelClass()} min-w-0`} aria-label="Service catalog">
                <div className="border-b border-[color:var(--cmp-border-subtle)] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">
                    Catalog navigation
                  </p>

                  <nav aria-label="Pricebook hierarchy" className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => applyCategoryFilter("all")}
                      className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1.5 text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-accent)]"
                    >
                      Pricebook
                    </button>
                    {selectedSystem ? (
                      <>
                        <ChevronRight className="h-4 w-4 text-[color:var(--sem-text-muted)]" />
                        <button
                          type="button"
                          onClick={() => applyCategoryFilter({
                            key: `system:${selectedSystem.id}`,
                            name: selectedSystem.name,
                            count: 0,
                            kind: "system",
                            systemId: selectedSystem.id,
                          })}
                          className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1.5 text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-accent)]"
                        >
                          {selectedSystem.name}
                        </button>
                      </>
                    ) : null}
                    {selectedCategory ? (
                      <>
                        <ChevronRight className="h-4 w-4 text-[color:var(--sem-text-muted)]" />
                        <span className="rounded-full border border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-surface-soft)] px-3 py-1.5 font-medium text-[color:var(--sem-text-primary)]">
                          {selectedCategory.name}
                        </span>
                      </>
                    ) : null}
                  </nav>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {navigationLevel === "root" ? (
                      <>
                        <NavigationFolderButton
                          title="All"
                          count={catalogTotal}
                          active={activeNavigationKey === "All"}
                          subtitle="Filtered catalog total"
                          onClick={() => applyCategoryFilter("all")}
                        />
                        {systemCards.map(({ system, count }) => (
                          <NavigationFolderButton
                            key={system.id}
                            title={system.name}
                            count={count}
                            active={activeNavigationKey === `system:${system.id}`}
                            subtitle="System"
                            onClick={() => applyCategoryFilter({
                              key: `system:${system.id}`,
                              name: system.name,
                              count,
                              kind: "system",
                              systemId: system.id,
                            })}
                          />
                        ))}
                      </>
                    ) : null}

                    {navigationLevel === "system" && selectedSystem ? (
                      categoryCardsForSystem.map(({ category, count }) => (
                        <NavigationFolderButton
                          key={category.id}
                          title={category.name}
                          count={count}
                          active={activeNavigationKey === `category:${category.id}`}
                          subtitle={`${selectedSystem.name} category`}
                          onClick={() => applyCategoryFilter({
                            key: `category:${category.id}`,
                            name: category.name,
                            count,
                            kind: "category",
                            categoryId: category.id,
                            systemId: selectedSystem.id,
                          })}
                        />
                      ))
                    ) : null}

                    {navigationLevel === "category" && selectedSystem ? (
                      categoryCardsForSystem.map(({ category, count }) => (
                        <NavigationFolderButton
                          key={category.id}
                          title={category.name}
                          count={count}
                          active={activeNavigationKey === `category:${category.id}`}
                          subtitle={`${selectedSystem.name} category`}
                          onClick={() => applyCategoryFilter({
                            key: `category:${category.id}`,
                            name: category.name,
                            count,
                            kind: "category",
                            categoryId: category.id,
                            systemId: selectedSystem.id,
                          })}
                        />
                      ))
                    ) : null}
                  </div>
                </div>

                <div className="border-b border-[color:var(--cmp-border-subtle)] p-5">
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.6fr)]">
                    <label className="block space-y-2 lg:col-span-2 xl:col-span-1">
                      <span className="text-sm text-[color:var(--sem-text-secondary)]">Search</span>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--sem-text-muted)]" />
                        <input
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          className="theme-input-control h-12 w-full rounded-[18px] pl-11 pr-4 text-sm"
                          placeholder="SKU, name, description, tag"
                        />
                      </div>
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm text-[color:var(--sem-text-secondary)]">Item type</span>
                      <select
                        value={itemType}
                        onChange={(event) => setItemType(event.target.value)}
                        className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      >
                        <option value="">All types</option>
                        {PRICEBOOK_ITEM_TYPES.map((typeValue) => (
                          <option key={typeValue} value={typeValue}>{getPricebookItemTypeLabel(typeValue)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm text-[color:var(--sem-text-secondary)]">Trade area (legacy)</span>
                      <input
                        value={tradeArea}
                        onChange={(event) => setTradeArea(event.target.value)}
                        className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                        placeholder="Legacy trade area filter"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm text-[color:var(--sem-text-secondary)]">State</span>
                      <select
                        value={activeState}
                        onChange={(event) => setActiveState(event.target.value as PricebookItemFilters["activeState"])}
                        className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                      >
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                        <option value="all">All</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <label className="theme-control-surface inline-flex items-center gap-3 rounded-full px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
                      <input
                        type="checkbox"
                        checked={popularOnly}
                        onChange={(event) => setPopularOnly(event.target.checked)}
                        className="h-4 w-4"
                      />
                      Popular items only
                    </label>

                    <button
                      type="button"
                      onClick={applyFilters}
                      className="theme-btn-secondary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium"
                    >
                      Apply filters
                    </button>
                  </div>
                </div>

                <div className="border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-5 py-3">
                  <p className="text-sm text-[color:var(--sem-text-secondary)]">
                    Page {initialResult.page} · showing {initialResult.items.length} of {initialResult.totalCount} filtered items
                  </p>
                </div>

                <div className="crm-table-frame hidden min-w-0 lg:block">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Code / SKU</th>
                        <th className="px-5 py-3 font-semibold">Item name & description</th>
                        <th className="px-5 py-3 font-semibold">Category</th>
                        <th className="px-5 py-3 font-semibold">Pricing structure</th>
                        <th className="px-5 py-3 text-right font-semibold">Base / default</th>
                        {canManage ? <th className="px-5 py-3 text-right font-semibold">Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--cmp-border-subtle)]">
                      {tableEmpty ? (
                        <tr>
                          <td colSpan={canManage ? 6 : 5} className="px-5 py-10 text-center text-sm text-[color:var(--sem-text-secondary)]">
                            No pricebook items match the current filters.
                          </td>
                        </tr>
                      ) : initialResult.items.map((item) => {
                        const isBusy = busyActionId?.endsWith(item.id) ?? false;

                        return (
                          <tr
                            key={item.id}
                            onClick={() => setSelectedItem(item)}
                            className="cursor-pointer transition hover:bg-[color:var(--cmp-hover-surface)]"
                          >
                            <td className="px-5 py-4 align-top">
                              <p className="font-[family:var(--font-geist-mono)] text-xs font-medium text-[color:var(--sem-text-muted)]">{item.internal_sku}</p>
                            </td>
                            <td className="px-5 py-4 align-top">
                              <p className="font-semibold text-[color:var(--sem-text-primary)]">{item.name}</p>
                              <p className="mt-1 line-clamp-2 text-sm text-[color:var(--sem-text-secondary)]">
                                {item.customer_description?.trim() || "No customer description"}
                              </p>
                              {item.tags.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {item.tags.map((tag) => (
                                    <span key={tag} className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-2 py-0.5 text-[11px] text-[color:var(--sem-text-muted)]">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-5 py-4 align-top">
                              <span className="inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-2.5 py-1 text-xs text-[color:var(--sem-text-secondary)]">
                                {getItemCategoryLabel(item)}
                              </span>
                              {item.system?.name?.trim() && item.category?.name?.trim() ? (
                                <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">{item.system.name}</p>
                              ) : null}
                              {item.service_area?.trim() ? (
                                <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">{item.service_area}</p>
                              ) : null}
                            </td>
                            <td className="px-5 py-4 align-top">
                              <PricingBadge item={item} />
                            </td>
                            <td className="px-5 py-4 text-right align-top">
                              <p className="font-[family:var(--font-geist-mono)] text-sm font-semibold text-[color:var(--sem-text-primary)]">
                                {formatCurrencyFromCents(item.customer_price_cents)}
                              </p>
                              <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">
                                {item.minimum_price_cents != null ? `Min ${formatCurrencyFromCents(item.minimum_price_cents)}` : "No minimum"}
                              </p>
                            </td>
                            {canManage ? (
                              <td className="master-table-actions-cell px-5 py-4 text-right align-top">
                                <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                                  {isPricebookItemInventoryEligible(item) ? (
                                    <button
                                      type="button"
                                      aria-label={`Receive stock for ${item.name}`}
                                      title="Receive stock"
                                      disabled={inventoryBusyId === item.id || isBusy}
                                      onClick={() => void runInventoryPurchase(item)}
                                      className="theme-control-surface inline-flex h-11 w-11 items-center justify-center rounded-full"
                                    >
                                      {inventoryBusyId === item.id
                                        ? <LoaderCircle className="h-4 w-4 animate-spin" />
                                        : <Boxes className="h-4 w-4" />}
                                    </button>
                                  ) : null}
                                  <Link
                                    href={`/pricebook/${item.id}`}
                                    aria-label={`Edit ${item.name}`}
                                    title="Edit"
                                    className="theme-control-surface inline-flex h-11 w-11 items-center justify-center rounded-full"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Link>
                                  {item.is_active ? (
                                    <button
                                      type="button"
                                      aria-label={`Delete ${item.name}`}
                                      title="Delete"
                                      onClick={() => void runItemAction(item, "archive")}
                                      disabled={isBusy}
                                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {busyActionId === `archive:${item.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      aria-label={`Restore ${item.name}`}
                                      title="Restore"
                                      onClick={() => void runItemAction(item, "restore")}
                                      disabled={isBusy}
                                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {busyActionId === `restore:${item.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                                    </button>
                                  )}
                                </div>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="lg:hidden">
                  <MasterMobileList
                    items={initialResult.items}
                    emptyState="No pricebook items match the current filters."
                    renderItem={(item) => (
                      <article
                        key={item.id}
                        className="border-t border-[color:var(--cmp-border-subtle)] p-4"
                        onClick={() => setSelectedItem(item)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-[family:var(--font-geist-mono)] text-xs text-[color:var(--sem-text-muted)]">{item.internal_sku}</p>
                            <h2 className="mt-2 text-lg font-semibold text-[color:var(--sem-text-primary)]">{item.name}</h2>
                            <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{getItemCategoryLabel(item)}</p>
                          </div>
                          <StatusBadge item={item} />
                        </div>
                        <div className="mt-4">
                          <PricingBadge item={item} />
                        </div>
                        <p className="mt-4 font-[family:var(--font-geist-mono)] text-sm text-[color:var(--sem-text-secondary)]">
                          {formatCurrencyFromCents(item.customer_price_cents)}
                        </p>
                        {canManage ? (
                          <div className="mt-4 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                            {isPricebookItemInventoryEligible(item) ? (
                              <button
                                type="button"
                                disabled={inventoryBusyId === item.id}
                                onClick={() => void runInventoryPurchase(item)}
                                className="theme-control-surface rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                              >
                                {inventoryBusyId === item.id ? "Opening inventory…" : "Receive stock"}
                              </button>
                            ) : null}
                            <Link href={`/pricebook/${item.id}`} className="theme-control-surface rounded-full px-3 py-1.5 text-xs font-medium">Edit</Link>
                            {item.is_active ? (
                              <button type="button" onClick={() => void runItemAction(item, "archive")} disabled={busyActionId === `archive:${item.id}`} className="theme-control-surface rounded-full px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60">Archive</button>
                            ) : (
                              <button type="button" onClick={() => void runItemAction(item, "restore")} disabled={busyActionId === `restore:${item.id}`} className="theme-control-surface rounded-full px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60">Restore</button>
                            )}
                          </div>
                        ) : null}
                      </article>
                    )}
                  />
                </div>

                {initialResult.totalCount > initialResult.pageSize ? (
                  <div className="border-t border-[color:var(--cmp-border-subtle)] p-5">
                    <MasterTablePagination
                      page={initialResult.page}
                      pageSize={initialResult.pageSize}
                      totalCount={initialResult.totalCount}
                      totalPages={totalPages}
                      previousHref={buildPageHref(initialFilters, Math.max(1, initialResult.page - 1))}
                      nextHref={buildPageHref(initialFilters, Math.min(totalPages, initialResult.page + 1))}
                    />
                  </div>
                ) : null}
              </section>

              {popularItems.length > 0 ? (
              <aside className="space-y-4">
                  <section className={`${panelClass()} p-5`}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Catalog signals</p>
                    <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">Popular items on current page</p>
                    <div className="mt-4 space-y-3">
                      {popularItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="w-full rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-3 text-left transition hover:border-[color:var(--cmp-border-accent)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{item.name}</p>
                              <p className="mt-1 font-[family:var(--font-geist-mono)] text-xs text-[color:var(--sem-text-muted)]">{item.internal_sku}</p>
                            </div>
                            <span className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-2 py-0.5 text-[11px] text-[color:var(--sem-text-secondary)]">
                              Popular
                            </span>
                          </div>
                          <p className="mt-2 font-[family:var(--font-geist-mono)] text-xs text-[color:var(--sem-text-secondary)]">
                            {formatCurrencyFromCents(item.customer_price_cents)}
                          </p>
                        </button>
                      ))}
                    </div>
                  </section>
              </aside>
              ) : null}
            </div>
          </>
        )}

        {selectedItem ? (
          <PricebookInspectorDrawer
            item={selectedItem}
            canManage={canManage}
            onClose={() => setSelectedItem(null)}
            onInventoryPurchase={() => void runInventoryPurchase(selectedItem)}
            inventoryBusy={inventoryBusyId === selectedItem.id}
          />
        ) : null}
      </div>
    </BoardShell>
  );
}

/* Legacy rollback path — set SHOW_LEGACY_PRICEBOOK = true to restore pre-redesign UI */

const legacyColumns = [
  { key: "actions", label: "Actions", align: "center" as const },
  { key: "item", label: "Item", align: "center" as const },
  { key: "type", label: "Type", align: "center" as const },
  { key: "pricing", label: "Pricing", align: "center" as const },
  { key: "status", label: "Status", align: "center" as const },
];

const pricebookActionIconBaseClass = "inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60";
const pricebookEditIconClass = `${pricebookActionIconBaseClass} bg-amber-500 hover:bg-amber-600`;
const pricebookDeleteIconClass = `${pricebookActionIconBaseClass} bg-rose-600 hover:bg-rose-700`;
const pricebookRestoreIconClass = `${pricebookActionIconBaseClass} bg-emerald-600 hover:bg-emerald-700`;

function LegacyPricebookTable({ initialResult, initialFilters, loadError = null }: PricebookTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialFilters.q);
  const [itemType, setItemType] = useState(initialFilters.itemType);
  const [systemId, setSystemId] = useState(initialFilters.systemId);
  const [categoryId, setCategoryId] = useState(initialFilters.categoryId);
  const [tradeArea, setTradeArea] = useState(initialFilters.tradeArea);
  const [activeState, setActiveState] = useState(initialFilters.activeState);
  const [popularOnly, setPopularOnly] = useState(initialFilters.popularOnly);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const popularItems = useMemo(
    () => initialResult.items.filter((item) => item.is_popular && item.is_active).slice(0, 4),
    [initialResult.items],
  );

  async function runItemAction(item: PricebookItem, action: "archive" | "restore") {
    setActionError(null);
    setBusyActionId(`${action}:${item.id}`);

    try {
      if (action === "archive") {
        const confirmed = typeof window === "undefined"
          ? true
          : window.confirm("Delete will archive this pricebook item. Continue?");

        if (!confirmed) {
          setBusyActionId(null);
          return;
        }

        await crmApiFetch<PricebookItem>(`/api/pricebook/items/${item.id}`, {
          method: "DELETE",
        });
      }

      if (action === "restore") {
        await crmApiFetch<PricebookItem>(`/api/pricebook/items/${item.id}/restore`, {
          method: "POST",
        });
      }

      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The item action could not be completed.");
    } finally {
      setBusyActionId(null);
    }
  }

  function applyFilters() {
    const params = buildPricebookItemQuery({
      q: query,
      itemType,
      systemId,
      categoryId,
      tradeArea,
      activeState,
      popularOnly,
      page: 1,
      pageSize: initialFilters.pageSize,
    });
    const serialized = params.toString();
    router.push(serialized ? `/pricebook?${serialized}` : "/pricebook");
  }

  const tableState: MasterTableState = loadError
    ? { status: "error", message: loadError }
    : initialResult.items.length === 0
      ? { status: "empty", message: "No pricebook items match the current filters." }
      : { status: "ready" };

  const totalPages = Math.max(1, Math.ceil(initialResult.totalCount / initialResult.pageSize));

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="mx-auto max-w-[92rem] px-6 py-12 lg:px-10">
        <section className="theme-surface-modal rounded-[36px] border border-[color:var(--cmp-border-subtle)] p-7 shadow-[0_28px_80px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--sem-accent-primary)]">Pricebook Workspace</p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                Fast item management for field pricing and future invoice reuse.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                Search, edit, archive, and restore reusable catalog items without touching invoices, estimates, PDFs, signatures, or payments.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/pricebook/new" className="theme-btn-secondary inline-flex items-center rounded-full px-5 py-3 text-sm font-medium">
                Create item
              </Link>
              <Link href="/pricebook/bundles" className="theme-control-surface inline-flex items-center rounded-full px-5 py-3 text-sm font-medium">
                Manage bundles
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <article className={`theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5 ${metricTileHoverClassName}`}>
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Items in view</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{initialResult.items.length}</p>
            </article>
            <article className={`theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5 ${metricTileHoverClassName}`}>
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Total catalog</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{initialResult.totalCount}</p>
            </article>
            <article className={`theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5 ${metricTileHoverClassName}`}>
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Popular items</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{popularItems.length}</p>
            </article>
            <article className={`theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5 ${metricTileHoverClassName}`}>
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">View state</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{activeState}</p>
            </article>
          </div>

          {popularItems.length > 0 ? (
            <section className="mt-8">
              <div className="mb-4 flex items-center gap-2 text-sm text-[color:var(--sem-text-secondary)]">
                <Package2 className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                Popular items
              </div>
              <div className="grid gap-4 lg:grid-cols-4">
                {popularItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`/pricebook/${item.id}`}
                    className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5 transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
                  >
                    <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{item.internal_sku}</p>
                    <h2 className="mt-3 text-lg font-semibold text-[color:var(--sem-text-primary)]">{item.name}</h2>
                    <p className="mt-3 text-sm text-[color:var(--sem-text-secondary)]">{formatCurrencyFromCents(item.customer_price_cents)}</p>
                    <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">{getPricebookItemTypeLabel(item.item_type)}</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-8 theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.6fr)]">
              <label className="block space-y-2">
                <span className="text-sm text-[color:var(--sem-text-secondary)]">Search</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--sem-text-muted)]" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="theme-input-control h-12 w-full rounded-[18px] pl-11 pr-4 text-sm"
                    placeholder="SKU, name, description, tag"
                  />
                </div>
              </label>
              <label className="block space-y-2">
                <span className="text-sm text-[color:var(--sem-text-secondary)]">Item type</span>
                <select
                  value={itemType}
                  onChange={(event) => setItemType(event.target.value)}
                  className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                >
                  <option value="">All types</option>
                  {PRICEBOOK_ITEM_TYPES.map((typeValue) => (
                    <option key={typeValue} value={typeValue}>{getPricebookItemTypeLabel(typeValue)}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm text-[color:var(--sem-text-secondary)]">Trade area (legacy)</span>
                <input
                  value={tradeArea}
                  onChange={(event) => setTradeArea(event.target.value)}
                  className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                  placeholder="Legacy trade area filter"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm text-[color:var(--sem-text-secondary)]">State</span>
                <select
                  value={activeState}
                  onChange={(event) => setActiveState(event.target.value as PricebookItemFilters["activeState"])}
                  className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="all">All</option>
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="theme-control-surface inline-flex items-center gap-3 rounded-full px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
                <input
                  type="checkbox"
                  checked={popularOnly}
                  onChange={(event) => setPopularOnly(event.target.checked)}
                  className="h-4 w-4"
                />
                Popular items only
              </label>

              <button
                type="button"
                onClick={applyFilters}
                className="theme-btn-secondary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium"
              >
                Apply filters
              </button>
            </div>
          </section>

          {actionError ? (
            <div className="mt-6 rounded-[20px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {actionError}
            </div>
          ) : null}

          <section className="mx-auto mt-8 max-w-[86rem] theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-5">
            <div className="pricebook-display-panel hidden lg:block">
              <MasterTable columns={legacyColumns} colSpan={legacyColumns.length} state={tableState}>
                {initialResult.items.map((item) => {
                  const isBusy = busyActionId?.endsWith(item.id) ?? false;

                  return (
                    <MasterTableRow key={item.id}>
                      <td className="master-table-cell master-table-actions-cell text-center align-middle">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Link href={`/pricebook/${item.id}`} aria-label={`Edit ${item.name}`} title="Edit" className={pricebookEditIconClass}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                          {item.is_active ? (
                            <button type="button" aria-label={`Delete ${item.name}`} title="Delete" onClick={() => void runItemAction(item, "archive")} disabled={isBusy} className={pricebookDeleteIconClass}>
                              {busyActionId === `archive:${item.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </button>
                          ) : (
                            <button type="button" aria-label={`Restore ${item.name}`} title="Restore" onClick={() => void runItemAction(item, "restore")} disabled={isBusy} className={pricebookRestoreIconClass}>
                              {busyActionId === `restore:${item.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="master-table-cell text-center align-middle">
                        <div className="mx-auto max-w-[18rem]">
                          <p className="font-semibold text-[color:var(--sem-text-primary)]">{item.name}</p>
                          <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{item.internal_sku}</p>
                        </div>
                      </td>
                      <td className="master-table-cell text-center align-middle">
                        <div>
                          <p>{getPricebookItemTypeLabel(item.item_type)}</p>
                          <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{item.unit_of_measure}</p>
                        </div>
                      </td>
                      <td className="master-table-cell text-center align-middle">
                        <p className="font-semibold text-[color:var(--sem-text-primary)]">{formatCurrencyFromCents(item.customer_price_cents)}</p>
                        <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">Min {formatCurrencyFromCents(item.minimum_price_cents)}</p>
                      </td>
                      <td className="master-table-cell text-center align-middle">
                        <StatusBadge item={item} />
                      </td>
                    </MasterTableRow>
                  );
                })}
              </MasterTable>
            </div>

            <div className="lg:hidden">
              <MasterMobileList
                items={initialResult.items}
                emptyState="No pricebook items match the current filters."
                renderItem={(item) => {
                  const isBusy = busyActionId?.endsWith(item.id) ?? false;

                  return (
                    <article key={item.id} className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">{item.internal_sku}</p>
                          <h2 className="mt-2 text-lg font-semibold text-[color:var(--sem-text-primary)]">{item.name}</h2>
                          <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{getPricebookItemTypeLabel(item.item_type)}</p>
                        </div>
                        <StatusBadge item={item} />
                      </div>
                      <p className="mt-4 text-sm text-[color:var(--sem-text-secondary)]">{formatCurrencyFromCents(item.customer_price_cents)}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link href={`/pricebook/${item.id}`} aria-label={`Edit ${item.name}`} title="Edit" className={pricebookEditIconClass}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                        {item.is_active ? (
                          <button type="button" aria-label={`Delete ${item.name}`} title="Delete" onClick={() => void runItemAction(item, "archive")} disabled={isBusy} className={pricebookDeleteIconClass}>
                            {busyActionId === `archive:${item.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        ) : (
                          <button type="button" aria-label={`Restore ${item.name}`} title="Restore" onClick={() => void runItemAction(item, "restore")} disabled={isBusy} className={pricebookRestoreIconClass}>
                            {busyActionId === `restore:${item.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                }}
              />
            </div>

            {initialResult.totalCount > initialResult.pageSize ? (
              <div className="mt-6">
                <MasterTablePagination
                  page={initialResult.page}
                  pageSize={initialResult.pageSize}
                  totalCount={initialResult.totalCount}
                  totalPages={totalPages}
                  previousHref={buildPageHref(initialFilters, Math.max(1, initialResult.page - 1))}
                  nextHref={buildPageHref(initialFilters, Math.min(totalPages, initialResult.page + 1))}
                />
              </div>
            ) : null}
          </section>
        </section>
      </div>
    </main>
  );
}

export function PricebookTable(props: PricebookTableProps) {
  if (SHOW_LEGACY_PRICEBOOK) {
    return <LegacyPricebookTable {...props} />;
  }

  return <PricebookControlDesk {...props} />;
}
