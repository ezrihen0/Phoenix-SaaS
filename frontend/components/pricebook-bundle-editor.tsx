"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowLeft,
  Boxes,
  ClipboardList,
  Layers3,
  LoaderCircle,
  PackagePlus,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Undo2,
} from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";
import { MetricTile } from "@/components/board/metric-tile";
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

const SHOW_LEGACY_PRICEBOOK_BUNDLES = false;

type PricebookBundlesWorkspaceProps = {
  sessionRole?: SessionRole | null;
  initialResult: PricebookBundleListResult;
  initialFilters: PricebookBundleFilters;
  loadError?: string | null;
};

type PricebookBundleEditorProps = {
  sessionRole?: SessionRole | null;
  initialBundle: PricebookBundleDetail;
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

function buildBundlePageHref(filters: PricebookBundleFilters, nextPage?: number) {
  const params = buildPricebookBundleQuery({
    ...filters,
    page: nextPage ?? filters.page,
  });
  const serialized = params.toString();
  return serialized ? `/pricebook/bundles?${serialized}` : "/pricebook/bundles";
}

function BundleStatusBadge({ bundle }: { bundle: Pick<PricebookBundle, "is_active" | "archived_at"> }) {
  const active = bundle.is_active && !bundle.archived_at;

  return (
    <span
      className={active
        ? "inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200"
        : "inline-flex rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-200"}
    >
      {active ? "Active" : "Archived"}
    </span>
  );
}

function SectionCard({
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  icon?: typeof Boxes;
  children: ReactNode;
}) {
  return (
    <section className={`${panelClass()} min-w-0`}>
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

function AccessRestrictedPanel({ mode }: { mode: "list" | "detail" }) {
  return (
    <BoardShell gridOpacity="subtle">
      <div className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <section className={`${panelClass()} p-8`}>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-accent-primary)]">Access restricted</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">
            {mode === "list" ? "Bundle desk unavailable" : "Bundle composer unavailable"}
          </h1>
          <p className="mt-4 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
            Your account role does not include pricebook catalog access. Contact an office administrator if you need bundle visibility.
          </p>
          <Link href="/pricebook" className="theme-btn-secondary mt-6 inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium">
            <ArrowLeft className="h-4 w-4" />
            Back to Revenue Control Center
          </Link>
        </section>
      </div>
    </BoardShell>
  );
}

const legacyBundleColumns = [
  { key: "actions", label: "Actions" },
  { key: "name", label: "Bundle" },
  { key: "status", label: "Status" },
  { key: "updated", label: "Last Updated" },
];

const legacyBundleItemColumns = [
  { key: "item", label: "Item" },
  { key: "quantity", label: "Default Quantity" },
  { key: "sort", label: "Sort Order" },
  { key: "actions", label: "Actions" },
];

function LegacyPricebookBundlesWorkspace({
  initialResult,
  initialFilters,
  loadError = null,
}: PricebookBundlesWorkspaceProps) {
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
            </div>
            <Link href="/pricebook" className="theme-control-surface inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium">
              Back to items
            </Link>
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-[20px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{errorMessage}</div>
          ) : null}

          <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
              <h2 className="text-lg font-semibold">Create bundle</h2>
              <div className="mt-5 grid gap-4">
                <input value={newName} onChange={(event) => setNewName(event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="Bundle name" />
                <textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} rows={4} className="theme-input-control min-h-[120px] w-full rounded-[18px] px-4 py-3 text-sm" />
                <button type="button" onClick={() => void createBundle()} disabled={busyActionId === "create"} className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:opacity-60">
                  {busyActionId === "create" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create bundle
                </button>
              </div>
            </div>
            <div className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6">
              <h2 className="text-lg font-semibold">Filter bundles</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm" placeholder="Search" />
                <select value={activeState} onChange={(event) => setActiveState(event.target.value as PricebookBundleFilters["activeState"])} className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm">
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="all">All</option>
                </select>
              </div>
              <button type="button" onClick={applyFilters} className="theme-btn-secondary mt-4 inline-flex rounded-full px-5 py-3 text-sm font-medium">Apply bundle filters</button>
            </div>
          </section>

          <section className="mt-8 theme-surface-card rounded-[28px] border p-4 sm:p-5">
            <MasterTable columns={legacyBundleColumns} colSpan={legacyBundleColumns.length} state={tableState}>
              {initialResult.items.map((bundle) => (
                <MasterTableRow key={bundle.id}>
                  <td className="master-table-cell align-middle">
                    <Link href={`/pricebook/bundles/${bundle.id}`} className="theme-control-surface inline-flex rounded-full px-3 py-2 text-xs font-medium">Open</Link>
                    <button type="button" onClick={() => void toggleBundleArchive(bundle)} disabled={busyActionId === bundle.id} className="theme-control-surface ml-2 inline-flex rounded-full px-3 py-2 text-xs font-medium disabled:opacity-60">
                      {bundle.is_active ? "Delete" : "Restore"}
                    </button>
                  </td>
                  <td className="master-table-cell align-middle">{bundle.name}</td>
                  <td className="master-table-cell align-middle"><BundleStatusBadge bundle={bundle} /></td>
                  <td className="master-table-cell align-middle">{formatDateTime(bundle.updated_at)}</td>
                </MasterTableRow>
              ))}
            </MasterTable>
          </section>
        </section>
      </div>
    </main>
  );
}

function BundleCompositionDeskWorkspace({
  sessionRole,
  initialResult,
  initialFilters,
  loadError = null,
}: PricebookBundlesWorkspaceProps) {
  const router = useRouter();
  const canManage = canManagePricebookRole(sessionRole);
  const [query, setQuery] = useState(initialFilters.q);
  const [activeState, setActiveState] = useState(initialFilters.activeState);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(loadError);

  const activeInView = useMemo(
    () => initialResult.items.filter((bundle) => bundle.is_active && !bundle.archived_at).length,
    [initialResult.items],
  );

  const totalPages = Math.max(1, Math.ceil(initialResult.totalCount / initialResult.pageSize));
  const tableEmpty = !loadError && initialResult.items.length === 0;

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

  const inputClass = "theme-input-control h-11 w-full rounded-xl px-3 text-sm";

  return (
    <BoardShell gridOpacity="subtle">
      <div className="mx-auto max-w-[94rem] px-5 py-6 lg:px-8">
        <header className={`${panelClass()} p-6`}>
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-[color:var(--sem-text-muted)]">
                <Boxes className="h-3.5 w-3.5" />
                Bundle composition
              </p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] sm:text-5xl">
                Bundle Composition Desk
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)]">
                Reusable sales packages that expand into quote or invoice line items at pick time.
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-muted)]">
                Bundles expand into document line snapshots when selected. Later bundle edits do not rewrite existing quotes, invoices, PDFs, signatures, or payments.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/pricebook" className="theme-control-surface inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium">
                <ArrowLeft className="h-4 w-4" />
                Back to Revenue Control Center
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile icon={Layers3} label="Bundles in view" value={initialResult.items.length} helper="Current page rows" />
            <MetricTile icon={ShieldCheck} label="Active in view" value={activeInView} helper="Current page · is_active" />
            <MetricTile icon={ClipboardList} label="Filtered total" value={initialResult.totalCount} helper="Matches current filters" />
            <MetricTile icon={SlidersHorizontal} label="Filter state" value={initialFilters.activeState} helper={`Page ${initialResult.page} · size ${initialResult.pageSize}`} />
          </div>
        </header>

        {loadError ? (
          <div className="theme-alert-error mt-5 rounded-[20px] border px-4 py-3 text-sm">{loadError}</div>
        ) : null}

        {errorMessage ? (
          <div className="theme-alert-error mt-5 rounded-[20px] border px-4 py-3 text-sm">{errorMessage}</div>
        ) : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {canManage ? (
            <SectionCard eyebrow="Create" title="New package template" description="Creates a bundle and opens the line composer." icon={Plus}>
              <div className="space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[color:var(--sem-text-secondary)]">Bundle name</span>
                  <input value={newName} onChange={(event) => setNewName(event.target.value)} className={inputClass} placeholder="Premium service bundle" />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[color:var(--sem-text-secondary)]">Description</span>
                  <textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} rows={4} className="theme-input-control min-h-[120px] w-full resize-none rounded-xl px-3 py-3 text-sm leading-6" placeholder="Optional internal description" />
                </label>
                <button type="button" onClick={() => void createBundle()} disabled={busyActionId === "create"} className="theme-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">
                  {busyActionId === "create" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create bundle
                </button>
              </div>
            </SectionCard>
          ) : (
            <SectionCard eyebrow="Read-only" title="Bundle creation" description="Creating packages requires owner, admin, or office admin access." icon={ShieldCheck}>
              <p className="text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                You can browse bundle templates but cannot create or archive packages with your current role.
              </p>
            </SectionCard>
          )}

          <SectionCard eyebrow="Filters" title="Package library filters" description="Search and state filters use existing query behavior." icon={SlidersHorizontal}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_140px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--sem-text-muted)]" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search bundle name or description..." />
              </div>
              <select value={activeState} onChange={(event) => setActiveState(event.target.value as PricebookBundleFilters["activeState"])} className={inputClass}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
              <button type="button" onClick={applyFilters} className="theme-btn-secondary h-11 rounded-xl px-4 text-sm font-medium">
                Apply
              </button>
            </div>
          </SectionCard>
        </div>

        <section className={`${panelClass()} mt-5 min-w-0`}>
          <div className="border-b border-[color:var(--cmp-border-subtle)] px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Package library</p>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-[color:var(--sem-display-headline)]">Reusable bundle templates</h2>
            <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">
              Page {initialResult.page} · showing {initialResult.items.length} of {initialResult.totalCount} filtered bundles
            </p>
          </div>

          <div className="crm-table-frame hidden min-w-0 lg:block">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Bundle</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Updated</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--cmp-border-subtle)]">
                {tableEmpty ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm text-[color:var(--sem-text-secondary)]">
                      No bundle templates match the current filters.
                    </td>
                  </tr>
                ) : initialResult.items.map((bundle) => (
                  <tr key={bundle.id} className="transition hover:bg-[color:var(--cmp-hover-surface)]">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-[color:var(--sem-text-primary)]">{bundle.name}</p>
                      <p className="mt-1 max-w-xl text-sm text-[color:var(--sem-text-secondary)]">{bundle.description || "No description"}</p>
                    </td>
                    <td className="px-5 py-4"><BundleStatusBadge bundle={bundle} /></td>
                    <td className="px-5 py-4 font-[family:var(--font-geist-mono)] text-xs text-[color:var(--sem-text-muted)]">{formatDateTime(bundle.updated_at)}</td>
                    <td className="master-table-actions-cell px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/pricebook/bundles/${bundle.id}`} className="theme-control-surface inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-xs font-medium">
                          Open
                        </Link>
                        {canManage ? (
                          <button type="button" onClick={() => void toggleBundleArchive(bundle)} disabled={busyActionId === bundle.id} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-100 disabled:cursor-not-allowed disabled:opacity-60">
                            {busyActionId === bundle.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : bundle.is_active ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            {bundle.is_active ? "Archive" : "Restore"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden">
            <MasterMobileList
              items={initialResult.items}
              emptyState="No bundle templates match the current filters."
              renderItem={(bundle) => (
                <article key={bundle.id} className="border-t border-[color:var(--cmp-border-subtle)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">{bundle.name}</h2>
                      <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{bundle.description || "No description"}</p>
                    </div>
                    <BundleStatusBadge bundle={bundle} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/pricebook/bundles/${bundle.id}`} className="theme-control-surface rounded-xl px-3 py-2 text-xs font-medium">Open</Link>
                    {canManage ? (
                      <button type="button" onClick={() => void toggleBundleArchive(bundle)} disabled={busyActionId === bundle.id} className="theme-control-surface rounded-xl px-3 py-2 text-xs font-medium disabled:opacity-60">
                        {bundle.is_active ? "Archive" : "Restore"}
                      </button>
                    ) : null}
                  </div>
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
                previousHref={buildBundlePageHref(initialFilters, Math.max(1, initialResult.page - 1))}
                nextHref={buildBundlePageHref(initialFilters, Math.min(totalPages, initialResult.page + 1))}
              />
            </div>
          ) : null}
        </section>
      </div>
    </BoardShell>
  );
}

function LegacyPricebookBundleEditor({ initialBundle }: PricebookBundleEditorProps) {
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
        <DesktopOptimizedNotice href="/pricebook" />
        <section className="theme-surface-modal rounded-[36px] border p-7 sm:p-8">
          <h1 className="text-4xl font-semibold">{initialBundle.name}</h1>
          {errorMessage ? <div className="mt-6 rounded-[20px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{errorMessage}</div> : null}
          <div className="mt-8 flex gap-3">
            <Link href="/pricebook/bundles" className="theme-control-surface rounded-full px-5 py-3 text-sm">Back</Link>
            <button type="button" onClick={() => void toggleBundleArchive()} disabled={savingBundle} className="theme-control-surface rounded-full px-5 py-3 text-sm">{initialBundle.is_active ? "Delete" : "Restore"}</button>
            <button type="button" onClick={() => void saveBundle()} disabled={savingBundle} className="theme-btn-secondary rounded-full px-5 py-3 text-sm">Save bundle</button>
          </div>
          <div className="mt-8 grid gap-4">
            <input value={bundleName} onChange={(event) => setBundleName(event.target.value)} className="theme-input-control h-12 rounded-[18px] px-4 text-sm" />
            <textarea value={bundleDescription} onChange={(event) => setBundleDescription(event.target.value)} rows={4} className="theme-input-control min-h-[120px] rounded-[18px] px-4 py-3 text-sm" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bundleActive} onChange={(event) => setBundleActive(event.target.checked)} className="h-4 w-4" /> Active bundle</label>
          </div>
          <div className="mt-8 flex gap-3">
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="theme-input-control h-12 flex-1 rounded-[18px] px-4 text-sm" />
            <button type="button" onClick={() => void searchItems()} disabled={searching} className="theme-btn-secondary rounded-full px-5 py-3 text-sm">Search</button>
          </div>
          <div className="mt-4 space-y-3">
            {searchResults.map((item) => (
              <div key={item.id} className="rounded-[20px] border p-4">
                <p>{item.name}</p>
                <button type="button" onClick={() => void addBundleItem(item)} disabled={searchResultIds.has(item.id) || busyRowId === `add:${item.id}`} className="theme-btn-secondary mt-2 rounded-full px-4 py-2 text-sm">{searchResultIds.has(item.id) ? "Added" : "Add"}</button>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <MasterTable columns={legacyBundleItemColumns} colSpan={legacyBundleItemColumns.length} state={bundleItemsState}>
              {initialBundle.items.map((bundleItem) => (
                <MasterTableRow key={bundleItem.id}>
                  <td className="master-table-cell">{bundleItem.pricebook_item?.name ?? "Unknown item"}</td>
                  <td className="master-table-cell"><input value={quantityByItemId[bundleItem.id] ?? bundleItem.default_quantity} onChange={(event) => setQuantityByItemId((current) => ({ ...current, [bundleItem.id]: event.target.value }))} className="theme-input-control h-11 rounded-[14px] px-3 text-sm" /></td>
                  <td className="master-table-cell"><input value={sortOrderByItemId[bundleItem.id] ?? String(bundleItem.sort_order)} onChange={(event) => setSortOrderByItemId((current) => ({ ...current, [bundleItem.id]: event.target.value }))} className="theme-input-control h-11 rounded-[14px] px-3 text-sm" /></td>
                  <td className="master-table-cell">
                    <button type="button" onClick={() => void updateBundleItem(bundleItem)} disabled={busyRowId === `update:${bundleItem.id}`} className="theme-control-surface rounded-full px-3 py-2 text-xs">Save</button>
                    <button type="button" onClick={() => void removeBundleItem(bundleItem)} disabled={busyRowId === `remove:${bundleItem.id}`} className="theme-control-surface ml-2 rounded-full px-3 py-2 text-xs">Remove</button>
                  </td>
                </MasterTableRow>
              ))}
            </MasterTable>
          </div>
        </section>
      </div>
    </main>
  );
}

function BundleLineComposer({
  sessionRole,
  initialBundle,
}: PricebookBundleEditorProps) {
  const router = useRouter();
  const canManage = canManagePricebookRole(sessionRole);
  const fieldsDisabled = !canManage;

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
  const inputClass = "theme-input-control h-11 w-full rounded-xl px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60";
  const monoInputClass = `${inputClass} font-[family:var(--font-geist-mono)] text-right`;
  const actionsBusy = savingBundle || busyRowId !== null;

  return (
    <BoardShell gridOpacity="subtle">
      <div className="mx-auto max-w-[94rem] px-5 py-6 pb-32 lg:px-8">
        <header className={`${panelClass()} p-6`}>
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-[color:var(--sem-text-muted)]">
                <Boxes className="h-3.5 w-3.5" />
                Bundle line composer
              </p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] sm:text-5xl">
                Bundle Line Composer
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)]">
                Compose reusable package lines with default quantities and sort order.
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-muted)]">
                Bundles expand into document line snapshots when selected. Later bundle edits do not rewrite existing quotes, invoices, PDFs, signatures, or payments.
              </p>
              {!canManage ? (
                <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-muted)]">
                  Read-only catalog view. Changes require owner, admin, or office admin access.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/pricebook/bundles" className="theme-control-surface inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium">
                <ArrowLeft className="h-4 w-4" />
                Back to bundles
              </Link>
              <Link href="/pricebook" className="theme-control-surface inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium">
                Revenue Control Center
              </Link>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <BundleStatusBadge bundle={initialBundle} />
            <span className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-2.5 py-1 font-[family:var(--font-geist-mono)] text-xs text-[color:var(--sem-text-secondary)]">
              {initialBundle.items.length} lines
            </span>
          </div>
        </header>

        {errorMessage ? (
          <div className="theme-alert-error mt-5 rounded-[20px] border px-4 py-3 text-sm">{errorMessage}</div>
        ) : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="space-y-5">
            <SectionCard eyebrow="Metadata" title="Package identity" description="Name, description, and active state. Same PATCH payload as before." icon={Boxes}>
              <div className="space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[color:var(--sem-text-secondary)]">Bundle name</span>
                  <input value={bundleName} onChange={(event) => setBundleName(event.target.value)} disabled={fieldsDisabled} className={inputClass} />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[color:var(--sem-text-secondary)]">Description</span>
                  <textarea value={bundleDescription} onChange={(event) => setBundleDescription(event.target.value)} disabled={fieldsDisabled} rows={4} className="theme-input-control min-h-[120px] w-full resize-none rounded-xl px-3 py-3 text-sm leading-6 disabled:cursor-not-allowed disabled:opacity-60" />
                </label>
                <label className="theme-control-surface flex items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
                  <span>Active bundle</span>
                  <input type="checkbox" checked={bundleActive} onChange={(event) => setBundleActive(event.target.checked)} disabled={fieldsDisabled} className="h-4 w-4" />
                </label>
              </div>
            </SectionCard>

            {canManage ? (
              <SectionCard eyebrow="Catalog" title="Add from pricebook" description="Search returns up to 12 active catalog items per query." icon={PackagePlus}>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--sem-text-muted)]" />
                    <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search SKU or item name..." />
                  </div>
                  <button type="button" onClick={() => void searchItems()} disabled={searching} className="theme-btn-secondary inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">
                    {searching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Search
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {searchResults.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="font-semibold text-[color:var(--sem-text-primary)]">{item.name}</p>
                          <p className="mt-1 font-[family:var(--font-geist-mono)] text-xs text-[color:var(--sem-text-muted)]">{item.internal_sku}</p>
                          <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">
                            {getPricebookItemTypeLabel(item.item_type)} · {formatCurrencyFromCents(item.customer_price_cents)} · {itemStatusLabel(item)}
                          </p>
                        </div>
                        <div className="grid gap-2 max-sm:grid-cols-1 sm:grid-cols-[96px_80px_auto]">
                          <input value={quantityByItemId[item.id] ?? "1.000"} onChange={(event) => setQuantityByItemId((current) => ({ ...current, [item.id]: event.target.value }))} className={monoInputClass} placeholder="1.000" title="Default quantity" />
                          <input value={sortOrderByItemId[item.id] ?? String(nextSortOrder)} onChange={(event) => setSortOrderByItemId((current) => ({ ...current, [item.id]: event.target.value }))} className={monoInputClass} placeholder={String(nextSortOrder)} title="Sort order" />
                          <button type="button" onClick={() => void addBundleItem(item)} disabled={searchResultIds.has(item.id) || busyRowId === `add:${item.id}`} className="theme-btn-secondary inline-flex h-11 items-center justify-center gap-1 rounded-xl px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60">
                            {busyRowId === `add:${item.id}` ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                            {searchResultIds.has(item.id) ? "Added" : "Add"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {searchQuery && !searching && searchResults.length === 0 ? (
                    <p className="text-sm text-[color:var(--sem-text-secondary)]">No active pricebook items matched that search.</p>
                  ) : null}
                </div>
                <p className="mt-3 text-xs leading-5 text-[color:var(--sem-text-muted)]">
                  Search uses active items only with a 12-result cap. Duplicate membership remains blocked by the server.
                </p>
              </SectionCard>
            ) : null}
          </div>

          <div className="space-y-5">
            <section className={`${panelClass()} min-w-0`}>
              <div className="border-b border-[color:var(--cmp-border-subtle)] px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Composition table</p>
                    <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-[color:var(--sem-display-headline)]">Bundle line template</h2>
                    <p className="mt-1 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                      Default quantities and sort order are editable inline. No live invoice rewrite.
                    </p>
                  </div>
                  <span className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-3 py-1 font-[family:var(--font-geist-mono)] text-xs text-[color:var(--sem-text-secondary)]">
                    {initialBundle.items.length} lines
                  </span>
                </div>
              </div>

              <div className="crm-table-frame hidden min-w-0 lg:block">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Catalog item</th>
                      <th className="px-5 py-3 font-semibold">Type</th>
                      <th className="px-5 py-3 text-right font-semibold">Default qty</th>
                      <th className="px-5 py-3 text-right font-semibold">Sort</th>
                      {canManage ? <th className="px-5 py-3 text-right font-semibold">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--cmp-border-subtle)]">
                    {initialBundle.items.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 5 : 4} className="px-5 py-10 text-center text-sm text-[color:var(--sem-text-secondary)]">
                          No items are in this bundle yet.
                        </td>
                      </tr>
                    ) : initialBundle.items.map((bundleItem) => {
                      const item = bundleItem.pricebook_item;

                      return (
                        <tr key={bundleItem.id} className="hover:bg-[color:var(--cmp-hover-surface)]">
                          <td className="px-5 py-4 align-top">
                            <p className="font-semibold text-[color:var(--sem-text-primary)]">{item?.name ?? "Unknown item"}</p>
                            <p className="mt-1 font-[family:var(--font-geist-mono)] text-xs text-[color:var(--sem-text-muted)]">{item?.internal_sku ?? bundleItem.pricebook_item_id}</p>
                            <p className="mt-1 font-[family:var(--font-geist-mono)] text-xs text-[color:var(--sem-text-muted)]">
                              {item ? formatCurrencyFromCents(item.customer_price_cents) : "-"}
                            </p>
                          </td>
                          <td className="px-5 py-4 align-top text-[color:var(--sem-text-secondary)]">
                            {item ? getPricebookItemTypeLabel(item.item_type) : "-"}
                          </td>
                          <td className="px-5 py-4 text-right align-top">
                            <input value={quantityByItemId[bundleItem.id] ?? bundleItem.default_quantity} onChange={(event) => setQuantityByItemId((current) => ({ ...current, [bundleItem.id]: event.target.value }))} disabled={fieldsDisabled} className={`${monoInputClass} ml-auto w-24`} />
                          </td>
                          <td className="px-5 py-4 text-right align-top">
                            <input value={sortOrderByItemId[bundleItem.id] ?? String(bundleItem.sort_order)} onChange={(event) => setSortOrderByItemId((current) => ({ ...current, [bundleItem.id]: event.target.value }))} disabled={fieldsDisabled} className={`${monoInputClass} ml-auto w-20`} />
                          </td>
                          {canManage ? (
                            <td className="master-table-actions-cell px-5 py-4 text-right align-top">
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => void updateBundleItem(bundleItem)} disabled={busyRowId === `update:${bundleItem.id}`} className="theme-control-surface inline-flex min-h-11 items-center gap-1 rounded-xl px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60">
                                  {busyRowId === `update:${bundleItem.id}` ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                  Save
                                </button>
                                <button type="button" onClick={() => void removeBundleItem(bundleItem)} disabled={busyRowId === `remove:${bundleItem.id}`} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-100 disabled:cursor-not-allowed disabled:opacity-60">
                                  {busyRowId === `remove:${bundleItem.id}` ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                  Remove
                                </button>
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
                  items={initialBundle.items}
                  emptyState="No items are in this bundle yet."
                  renderItem={(bundleItem) => {
                    const item = bundleItem.pricebook_item;

                    return (
                      <article key={bundleItem.id} className="border-t border-[color:var(--cmp-border-subtle)] p-4">
                        <h3 className="text-base font-semibold text-[color:var(--sem-text-primary)]">{item?.name ?? "Unknown item"}</h3>
                        <p className="mt-1 font-[family:var(--font-geist-mono)] text-xs text-[color:var(--sem-text-muted)]">{item?.internal_sku ?? "-"}</p>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <input value={quantityByItemId[bundleItem.id] ?? bundleItem.default_quantity} onChange={(event) => setQuantityByItemId((current) => ({ ...current, [bundleItem.id]: event.target.value }))} disabled={fieldsDisabled} className={monoInputClass} />
                          <input value={sortOrderByItemId[bundleItem.id] ?? String(bundleItem.sort_order)} onChange={(event) => setSortOrderByItemId((current) => ({ ...current, [bundleItem.id]: event.target.value }))} disabled={fieldsDisabled} className={monoInputClass} />
                        </div>
                        {canManage ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={() => void updateBundleItem(bundleItem)} disabled={busyRowId === `update:${bundleItem.id}`} className="theme-control-surface rounded-xl px-3 py-2 text-xs font-medium disabled:opacity-60">Save</button>
                            <button type="button" onClick={() => void removeBundleItem(bundleItem)} disabled={busyRowId === `remove:${bundleItem.id}`} className="theme-control-surface rounded-xl px-3 py-2 text-xs font-medium disabled:opacity-60">Remove</button>
                          </div>
                        ) : null}
                      </article>
                    );
                  }}
                />
              </div>
            </section>

            <div className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4 text-xs leading-6 text-[color:var(--sem-text-muted)]">
              Saved bundle lines expand into quote and invoice line snapshots when selected from the pricebook picker. Existing documents are not rewritten by bundle edits.
            </div>
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)]/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-[94rem] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {canManage ? (
                <button type="button" onClick={() => void toggleBundleArchive()} disabled={actionsBusy} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-100 disabled:cursor-not-allowed disabled:opacity-60">
                  {savingBundle ? <LoaderCircle className="h-4 w-4 animate-spin" /> : initialBundle.is_active ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                  {initialBundle.is_active ? "Archive Bundle" : "Restore Bundle"}
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Link href="/pricebook/bundles" className="theme-control-surface rounded-xl px-4 py-2.5 text-sm font-medium">
                Cancel
              </Link>
              {canManage ? (
                <button type="button" onClick={() => void saveBundle()} disabled={actionsBusy} className="theme-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">
                  {savingBundle ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save bundle
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </BoardShell>
  );
}

export function PricebookBundlesWorkspace(props: PricebookBundlesWorkspaceProps) {
  if (!canViewPricebookRole(props.sessionRole)) {
    return <AccessRestrictedPanel mode="list" />;
  }

  if (SHOW_LEGACY_PRICEBOOK_BUNDLES) {
    return <LegacyPricebookBundlesWorkspace {...props} />;
  }

  return <BundleCompositionDeskWorkspace {...props} />;
}

export function PricebookBundleEditor(props: PricebookBundleEditorProps) {
  if (!canViewPricebookRole(props.sessionRole)) {
    return <AccessRestrictedPanel mode="detail" />;
  }

  if (SHOW_LEGACY_PRICEBOOK_BUNDLES) {
    return <LegacyPricebookBundleEditor {...props} />;
  }

  return <BundleLineComposer {...props} />;
}
