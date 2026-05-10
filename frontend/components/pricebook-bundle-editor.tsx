"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LoaderCircle, Plus, Save, Trash2, Undo2 } from "lucide-react";

import {
  MasterMobileList,
  MasterTable,
  MasterTableRow,
  type MasterTableState,
} from "@/components/master-table";
import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  buildPricebookBundleQuery,
  formatCurrencyFromCents,
  formatDateTime,
  getPricebookItemTypeLabel,
  itemStatusLabel,
  type PricebookBundle,
  type PricebookBundleDetail,
  type PricebookBundleFilters,
  type PricebookBundleItem,
  type PricebookBundleListResult,
  type PricebookItem,
  type PricebookItemListResult,
} from "@/lib/crm/pricebook-model";

type PricebookBundlesWorkspaceProps = {
  initialResult: PricebookBundleListResult;
  initialFilters: PricebookBundleFilters;
  loadError?: string | null;
};

type PricebookBundleEditorProps = {
  initialBundle: PricebookBundleDetail;
};

function buildBundlePageHref(filters: PricebookBundleFilters) {
  const params = buildPricebookBundleQuery(filters);
  const serialized = params.toString();
  return serialized ? `/pricebook/bundles?${serialized}` : "/pricebook/bundles";
}

function BundleStatusBadge({ bundle }: { bundle: PricebookBundle }) {
  const active = bundle.is_active && !bundle.archived_at;

  return (
    <span
      className={active
        ? "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]"
        : "theme-status-error inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]"}
    >
      {active ? "Active" : "Archived"}
    </span>
  );
}

const bundleColumns = [
  { key: "actions", label: "Actions" },
  { key: "name", label: "Bundle" },
  { key: "status", label: "Status" },
  { key: "updated", label: "Last Updated" },
];

const bundleItemColumns = [
  { key: "item", label: "Item" },
  { key: "quantity", label: "Default Quantity" },
  { key: "sort", label: "Sort Order" },
  { key: "actions", label: "Actions" },
];

export function PricebookBundlesWorkspace({ initialResult, initialFilters, loadError = null }: PricebookBundlesWorkspaceProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialFilters.q);
  const [activeState, setActiveState] = useState(initialFilters.activeState);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(loadError);

  const tableState: MasterTableState = loadError
    ? { status: "error", message: loadError }
    : initialResult.items.length === 0
      ? { status: "empty", message: "No bundle templates match the current filters." }
      : { status: "ready" };

  async function createBundle() {
    setErrorMessage(null);
    setBusyActionId("create");

    try {
      const created = await crmApiFetch<PricebookBundle>("/api/pricebook/bundles", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          description: newDescription.trim() || null,
          isActive: true,
        }),
      });

      router.push(`/pricebook/bundles/${created.id}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The bundle could not be created.");
    } finally {
      setBusyActionId(null);
    }
  }

  async function toggleBundleArchive(bundle: PricebookBundle) {
    setErrorMessage(null);
    setBusyActionId(bundle.id);

    try {
      await crmApiFetch(
        bundle.is_active
          ? `/api/pricebook/bundles/${bundle.id}`
          : `/api/pricebook/bundles/${bundle.id}/restore`,
        bundle.is_active
          ? { method: "DELETE" }
          : { method: "POST" },
      );
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The bundle archive state could not be changed.");
    } finally {
      setBusyActionId(null);
    }
  }

  function applyFilters() {
    router.push(buildBundlePageHref({
      q: query,
      activeState,
      page: 1,
      pageSize: initialFilters.pageSize,
    }));
  }

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="mx-auto max-w-6xl px-6 py-12 lg:px-10">
        <section className="theme-surface-modal rounded-[36px] border border-[color:var(--cmp-border-subtle)] p-7 shadow-[0_28px_80px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--sem-accent-primary)]">Bundle Templates</p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                Group pricebook items into reusable templates.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                Build simple bundle templates now so future estimate and invoice builders can expand them into immutable snapshots later.
              </p>
            </div>

            <Link href="/pricebook" className="theme-control-surface inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium">
              Back to items
            </Link>
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-[20px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
              <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Create bundle</h2>
              <div className="mt-5 grid gap-4">
                <label className="block space-y-2">
                  <span className="text-sm text-[color:var(--sem-text-secondary)]">Bundle name</span>
                  <input
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                    placeholder="Premium gas service bundle"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm text-[color:var(--sem-text-secondary)]">Description</span>
                  <textarea
                    value={newDescription}
                    onChange={(event) => setNewDescription(event.target.value)}
                    rows={4}
                    className="theme-input-control min-h-[120px] w-full rounded-[18px] px-4 py-3 text-sm"
                    placeholder="Optional internal description for the bundle template."
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void createBundle()}
                  disabled={busyActionId === "create"}
                  className="theme-btn-secondary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyActionId === "create" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create bundle
                </button>
              </div>
            </div>

            <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
              <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Filter bundles</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <label className="block space-y-2">
                  <span className="text-sm text-[color:var(--sem-text-secondary)]">Search</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                    placeholder="Bundle name or description"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm text-[color:var(--sem-text-secondary)]">State</span>
                  <select
                    value={activeState}
                    onChange={(event) => setActiveState(event.target.value as PricebookBundleFilters["activeState"])}
                    className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="all">All</option>
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={applyFilters}
                className="theme-btn-secondary mt-4 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium"
              >
                Apply bundle filters
              </button>
            </div>
          </section>

          <section className="mt-8 theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-4 sm:p-5">
            <div className="hidden lg:block">
              <MasterTable columns={bundleColumns} colSpan={bundleColumns.length} state={tableState}>
                {initialResult.items.map((bundle) => (
                  <MasterTableRow key={bundle.id}>
                    <td className="master-table-cell align-middle">
                      <div className="flex items-center gap-2">
                        <Link href={`/pricebook/bundles/${bundle.id}`} className="theme-control-surface inline-flex rounded-full px-3 py-2 text-xs font-medium">
                          Open
                        </Link>
                        <button
                          type="button"
                          onClick={() => void toggleBundleArchive(bundle)}
                          disabled={busyActionId === bundle.id}
                          className="theme-control-surface inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyActionId === bundle.id ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : bundle.is_active ? (
                            <Trash2 className="h-3.5 w-3.5" />
                          ) : (
                            <Undo2 className="h-3.5 w-3.5" />
                          )}
                          {bundle.is_active ? "Delete" : "Restore"}
                        </button>
                      </div>
                    </td>
                    <td className="master-table-cell align-middle">
                      <p className="font-semibold text-[color:var(--sem-text-primary)]">{bundle.name}</p>
                      <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{bundle.description || "No description"}</p>
                    </td>
                    <td className="master-table-cell align-middle">
                      <BundleStatusBadge bundle={bundle} />
                    </td>
                    <td className="master-table-cell align-middle text-sm text-[color:var(--sem-text-secondary)]">
                      {formatDateTime(bundle.updated_at)}
                    </td>
                  </MasterTableRow>
                ))}
              </MasterTable>
            </div>

            <div className="lg:hidden">
              <MasterMobileList
                items={initialResult.items}
                emptyState="No bundle templates match the current filters."
                renderItem={(bundle) => (
                  <article key={bundle.id} className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">{bundle.name}</h2>
                        <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{bundle.description || "No description"}</p>
                      </div>
                      <BundleStatusBadge bundle={bundle} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={`/pricebook/bundles/${bundle.id}`} className="theme-control-surface inline-flex rounded-full px-3 py-2 text-xs font-medium">
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => void toggleBundleArchive(bundle)}
                        disabled={busyActionId === bundle.id}
                        className="theme-control-surface inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyActionId === bundle.id ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : bundle.is_active ? (
                          <Trash2 className="h-3.5 w-3.5" />
                        ) : (
                          <Undo2 className="h-3.5 w-3.5" />
                        )}
                        {bundle.is_active ? "Delete" : "Restore"}
                      </button>
                    </div>
                  </article>
                )}
              />
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

export function PricebookBundleEditor({ initialBundle }: PricebookBundleEditorProps) {
  const router = useRouter();
  const [bundleName, setBundleName] = useState(initialBundle.name);
  const [bundleDescription, setBundleDescription] = useState(initialBundle.description ?? "");
  const [bundleActive, setBundleActive] = useState(initialBundle.is_active);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PricebookItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingBundle, setSavingBundle] = useState(false);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [quantityByItemId, setQuantityByItemId] = useState<Record<string, string>>({});
  const [sortOrderByItemId, setSortOrderByItemId] = useState<Record<string, string>>({});

  const nextSortOrder = useMemo(() => {
    if (initialBundle.items.length === 0) {
      return 10;
    }

    return Math.max(...initialBundle.items.map((item) => item.sort_order)) + 10;
  }, [initialBundle.items]);

  async function saveBundle() {
    setErrorMessage(null);
    setSavingBundle(true);

    try {
      await crmApiFetch<PricebookBundle>(`/api/pricebook/bundles/${initialBundle.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: bundleName,
          description: bundleDescription.trim() || null,
          isActive: bundleActive,
        }),
      });
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The bundle could not be saved.");
    } finally {
      setSavingBundle(false);
    }
  }

  async function toggleBundleArchive() {
    setErrorMessage(null);
    setSavingBundle(true);

    try {
      await crmApiFetch(
        initialBundle.is_active
          ? `/api/pricebook/bundles/${initialBundle.id}`
          : `/api/pricebook/bundles/${initialBundle.id}/restore`,
        initialBundle.is_active
          ? { method: "DELETE" }
          : { method: "POST" },
      );
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The bundle state could not be updated.");
    } finally {
      setSavingBundle(false);
    }
  }

  async function searchItems() {
    setErrorMessage(null);
    setSearching(true);

    try {
      const params = new URLSearchParams();
      params.set("activeState", "active");
      params.set("pageSize", "12");
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }

      const result = await crmApiFetch<PricebookItemListResult>(`/api/pricebook/items?${params.toString()}`);
      setSearchResults(result.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Pricebook search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function addBundleItem(item: PricebookItem) {
    setErrorMessage(null);
    setBusyRowId(`add:${item.id}`);

    try {
      await crmApiFetch(`/api/pricebook/bundles/${initialBundle.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          pricebookItemId: item.id,
          defaultQuantity: quantityByItemId[item.id]?.trim() || "1.000",
          sortOrder: Number(sortOrderByItemId[item.id]?.trim() || String(nextSortOrder)),
        }),
      });
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The item could not be added to the bundle.");
    } finally {
      setBusyRowId(null);
    }
  }

  async function updateBundleItem(bundleItem: PricebookBundleItem) {
    setErrorMessage(null);
    setBusyRowId(`update:${bundleItem.id}`);

    try {
      await crmApiFetch(`/api/pricebook/bundles/${initialBundle.id}/items/${bundleItem.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          defaultQuantity: quantityByItemId[bundleItem.id]?.trim() || bundleItem.default_quantity,
          sortOrder: Number(sortOrderByItemId[bundleItem.id]?.trim() || String(bundleItem.sort_order)),
        }),
      });
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The bundle item could not be updated.");
    } finally {
      setBusyRowId(null);
    }
  }

  async function removeBundleItem(bundleItem: PricebookBundleItem) {
    setErrorMessage(null);
    setBusyRowId(`remove:${bundleItem.id}`);

    try {
      await crmApiFetch(`/api/pricebook/bundles/${initialBundle.id}/items/${bundleItem.id}`, {
        method: "DELETE",
      });
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The bundle item could not be removed.");
    } finally {
      setBusyRowId(null);
    }
  }

  const searchResultIds = new Set(initialBundle.items.map((item) => item.pricebook_item_id));
  const bundleItemsState: MasterTableState = initialBundle.items.length
    ? { status: "ready" }
    : { status: "empty", message: "No items are in this bundle yet." };

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <section className="theme-surface-modal rounded-[36px] border border-[color:var(--cmp-border-subtle)] p-7 shadow-[0_28px_80px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--sem-accent-primary)]">Bundle Detail</p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                {initialBundle.name}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                Keep bundle templates minimal. They are reusable item groups only and do not create dynamic pricing or inventory logic.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/pricebook/bundles" className="theme-control-surface inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium">
                Back to bundles
              </Link>
              <button
                type="button"
                onClick={() => void toggleBundleArchive()}
                disabled={savingBundle}
                className="theme-control-surface inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingBundle ? <LoaderCircle className="h-4 w-4 animate-spin" /> : initialBundle.is_active ? <Trash2 className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
                {initialBundle.is_active ? "Delete" : "Restore"}
              </button>
              <button
                type="button"
                onClick={() => void saveBundle()}
                disabled={savingBundle}
                className="theme-btn-secondary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingBundle ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save bundle
              </button>
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-[20px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
              <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Bundle settings</h2>
              <div className="mt-5 grid gap-4">
                <label className="block space-y-2">
                  <span className="text-sm text-[color:var(--sem-text-secondary)]">Name</span>
                  <input
                    value={bundleName}
                    onChange={(event) => setBundleName(event.target.value)}
                    className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm text-[color:var(--sem-text-secondary)]">Description</span>
                  <textarea
                    value={bundleDescription}
                    onChange={(event) => setBundleDescription(event.target.value)}
                    rows={4}
                    className="theme-input-control min-h-[120px] w-full rounded-[18px] px-4 py-3 text-sm"
                  />
                </label>
                <label className="theme-control-surface flex items-center justify-between gap-4 rounded-[20px] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
                  <span>Active bundle</span>
                  <input
                    type="checkbox"
                    checked={bundleActive}
                    onChange={(event) => setBundleActive(event.target.checked)}
                    className="h-4 w-4"
                  />
                </label>
              </div>
            </div>

            <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
              <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Search pricebook items</h2>
              <div className="mt-5 flex flex-col gap-4 sm:flex-row">
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="theme-input-control h-12 flex-1 rounded-[18px] px-4 text-sm"
                  placeholder="Search by SKU, name, description, tag"
                />
                <button
                  type="button"
                  onClick={() => void searchItems()}
                  disabled={searching}
                  className="theme-btn-secondary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {searching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Search
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {searchResults.map((item) => (
                  <article key={item.id} className="theme-control-surface rounded-[20px] border px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">{item.internal_sku}</p>
                        <h3 className="mt-2 text-base font-semibold text-[color:var(--sem-text-primary)]">{item.name}</h3>
                        <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                          {getPricebookItemTypeLabel(item.item_type)} • {formatCurrencyFromCents(item.customer_price_cents)} • {itemStatusLabel(item)}
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[120px_120px_auto]">
                        <input
                          value={quantityByItemId[item.id] ?? "1.000"}
                          onChange={(event) => setQuantityByItemId((current) => ({ ...current, [item.id]: event.target.value }))}
                          className="theme-input-control h-11 rounded-[14px] px-3 text-sm"
                          placeholder="1.000"
                        />
                        <input
                          value={sortOrderByItemId[item.id] ?? String(nextSortOrder)}
                          onChange={(event) => setSortOrderByItemId((current) => ({ ...current, [item.id]: event.target.value }))}
                          className="theme-input-control h-11 rounded-[14px] px-3 text-sm"
                          placeholder={String(nextSortOrder)}
                        />
                        <button
                          type="button"
                          onClick={() => void addBundleItem(item)}
                          disabled={searchResultIds.has(item.id) || busyRowId === `add:${item.id}`}
                          className="theme-btn-secondary inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyRowId === `add:${item.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          {searchResultIds.has(item.id) ? "Added" : "Add"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {searchQuery && !searching && searchResults.length === 0 ? (
                  <p className="text-sm text-[color:var(--sem-text-secondary)]">No active pricebook items matched that search.</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="mt-8 theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-4 sm:p-5">
            <div className="hidden lg:block">
              <MasterTable columns={bundleItemColumns} colSpan={bundleItemColumns.length} state={bundleItemsState}>
                {initialBundle.items.map((bundleItem) => (
                  <MasterTableRow key={bundleItem.id}>
                    <td className="master-table-cell align-middle">
                      <div>
                        <p className="font-semibold text-[color:var(--sem-text-primary)]">{bundleItem.pricebook_item?.name ?? "Unknown item"}</p>
                        <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{bundleItem.pricebook_item?.internal_sku ?? bundleItem.pricebook_item_id}</p>
                      </div>
                    </td>
                    <td className="master-table-cell align-middle">
                      <input
                        value={quantityByItemId[bundleItem.id] ?? bundleItem.default_quantity}
                        onChange={(event) => setQuantityByItemId((current) => ({ ...current, [bundleItem.id]: event.target.value }))}
                        className="theme-input-control h-11 w-full rounded-[14px] px-3 text-sm"
                      />
                    </td>
                    <td className="master-table-cell align-middle">
                      <input
                        value={sortOrderByItemId[bundleItem.id] ?? String(bundleItem.sort_order)}
                        onChange={(event) => setSortOrderByItemId((current) => ({ ...current, [bundleItem.id]: event.target.value }))}
                        className="theme-input-control h-11 w-full rounded-[14px] px-3 text-sm"
                      />
                    </td>
                    <td className="master-table-cell align-middle">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void updateBundleItem(bundleItem)}
                          disabled={busyRowId === `update:${bundleItem.id}`}
                          className="theme-control-surface inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyRowId === `update:${bundleItem.id}` ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeBundleItem(bundleItem)}
                          disabled={busyRowId === `remove:${bundleItem.id}`}
                          className="theme-control-surface inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyRowId === `remove:${bundleItem.id}` ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          Remove
                        </button>
                      </div>
                    </td>
                  </MasterTableRow>
                ))}
              </MasterTable>
            </div>

            <div className="lg:hidden">
              <MasterMobileList
                items={initialBundle.items}
                emptyState="No items are in this bundle yet."
                renderItem={(bundleItem) => (
                  <article key={bundleItem.id} className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-4">
                    <h3 className="text-base font-semibold text-[color:var(--sem-text-primary)]">{bundleItem.pricebook_item?.name ?? "Unknown item"}</h3>
                    <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                      {bundleItem.pricebook_item ? formatCurrencyFromCents(bundleItem.pricebook_item.customer_price_cents) : "-"}
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <input
                        value={quantityByItemId[bundleItem.id] ?? bundleItem.default_quantity}
                        onChange={(event) => setQuantityByItemId((current) => ({ ...current, [bundleItem.id]: event.target.value }))}
                        className="theme-input-control h-11 rounded-[14px] px-3 text-sm"
                      />
                      <input
                        value={sortOrderByItemId[bundleItem.id] ?? String(bundleItem.sort_order)}
                        onChange={(event) => setSortOrderByItemId((current) => ({ ...current, [bundleItem.id]: event.target.value }))}
                        className="theme-input-control h-11 rounded-[14px] px-3 text-sm"
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void updateBundleItem(bundleItem)}
                        disabled={busyRowId === `update:${bundleItem.id}`}
                        className="theme-control-surface inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyRowId === `update:${bundleItem.id}` ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeBundleItem(bundleItem)}
                        disabled={busyRowId === `remove:${bundleItem.id}`}
                        className="theme-control-surface inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyRowId === `remove:${bundleItem.id}` ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Remove
                      </button>
                    </div>
                  </article>
                )}
              />
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}