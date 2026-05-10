"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LoaderCircle, Package2, Pencil, Search, Trash2, Undo2 } from "lucide-react";

import {
  MasterMobileList,
  MasterTable,
  MasterTablePagination,
  MasterTableRow,
  type MasterTableState,
} from "@/components/master-table";
import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  PRICEBOOK_ITEM_TYPES,
  buildPricebookItemQuery,
  formatCurrencyFromCents,
  getPricebookItemTypeLabel,
  itemStatusLabel,
  type PricebookItem,
  type PricebookItemFilters,
  type PricebookItemListResult,
  type PricebookItemType,
} from "@/lib/crm/pricebook-model";

type PricebookTableProps = {
  initialResult: PricebookItemListResult;
  initialFilters: PricebookItemFilters;
  loadError?: string | null;
};

const columns = [
  { key: "actions", label: "Actions", align: "center" as const },
  { key: "item", label: "Item", align: "center" as const },
  { key: "type", label: "Type", align: "center" as const },
  { key: "pricing", label: "Pricing", align: "center" as const },
  { key: "status", label: "Status", align: "center" as const },
];

const pricebookActionIconBaseClass = "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60";
const pricebookEditIconClass = `${pricebookActionIconBaseClass} bg-amber-500 hover:bg-amber-600`;
const pricebookDeleteIconClass = `${pricebookActionIconBaseClass} bg-rose-600 hover:bg-rose-700`;
const pricebookRestoreIconClass = `${pricebookActionIconBaseClass} bg-emerald-600 hover:bg-emerald-700`;

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

export function PricebookTable({ initialResult, initialFilters, loadError = null }: PricebookTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialFilters.q);
  const [itemType, setItemType] = useState(initialFilters.itemType);
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
            <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Items in view</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{initialResult.items.length}</p>
            </article>
            <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Total catalog</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{initialResult.totalCount}</p>
            </article>
            <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Popular items</p>
              <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{popularItems.length}</p>
            </article>
            <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
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
                <span className="text-sm text-[color:var(--sem-text-secondary)]">Trade area</span>
                <input
                  value={tradeArea}
                  onChange={(event) => setTradeArea(event.target.value)}
                  className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                  placeholder="Gas, Wood, Masonry"
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
              <style
                dangerouslySetInnerHTML={{
                  __html: `
                    .pricebook-display-panel .master-table {
                      table-layout: fixed;
                    }
                    .pricebook-display-panel .master-table-header-cell:nth-child(1),
                    .pricebook-display-panel .master-table-cell:nth-child(1) {
                      width: 8rem;
                    }
                    .pricebook-display-panel .master-table-header-cell:nth-child(2),
                    .pricebook-display-panel .master-table-cell:nth-child(2) {
                      width: 20rem;
                    }
                    .pricebook-display-panel .master-table-header-cell:nth-child(3),
                    .pricebook-display-panel .master-table-cell:nth-child(3),
                    .pricebook-display-panel .master-table-header-cell:nth-child(4),
                    .pricebook-display-panel .master-table-cell:nth-child(4),
                    .pricebook-display-panel .master-table-header-cell:nth-child(5),
                    .pricebook-display-panel .master-table-cell:nth-child(5) {
                      width: 12rem;
                    }
                  `,
                }}
              />
              <MasterTable columns={columns} colSpan={columns.length} state={tableState}>
                {initialResult.items.map((item) => {
                  const isBusy = busyActionId?.endsWith(item.id) ?? false;

                  return (
                    <MasterTableRow key={item.id}>
                      <td className="master-table-cell text-center align-middle">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Link
                            href={`/pricebook/${item.id}`}
                            aria-label={`Edit ${item.name}`}
                            title="Edit"
                            className={pricebookEditIconClass}
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
                              className={pricebookDeleteIconClass}
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
                              className={pricebookRestoreIconClass}
                            >
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
                        <Link
                          href={`/pricebook/${item.id}`}
                          aria-label={`Edit ${item.name}`}
                          title="Edit"
                          className={pricebookEditIconClass}
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
                            className={pricebookDeleteIconClass}
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
                            className={pricebookRestoreIconClass}
                          >
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