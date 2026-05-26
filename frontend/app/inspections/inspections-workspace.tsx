"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";

import { InspectionCommandCenterList } from "@/components/inspections/inspection-command-center-list";
import type { SessionRole } from "@/lib/auth/server-session";
import { MasterMobileList, MasterTable, MasterTableRow, type MasterTableState } from "@/components/master-table";
import {
  createInspection,
  listInspections,
  searchInspectionCustomers,
  searchInspectionJobs,
  type InspectionCustomerSearchRow,
  type InspectionJobSearchRow,
  type InspectionListRow,
} from "@/lib/inspections/browser-api";

const columns = [
  { key: "actions", label: "Actions", align: "center" as const },
  { key: "client", label: "Client Name", align: "center" as const },
  { key: "address", label: "Address", align: "center" as const },
  { key: "report", label: "Report Type", align: "center" as const },
  { key: "status", label: "Workflow Status", align: "center" as const },
  { key: "updated", label: "Last Updated", align: "center" as const },
];

type InspectionSource = "new_customer" | "existing_customer" | "existing_job" | "internal_draft";
type InspectionType = "standard" | "wett" | "gas";

const inspectionActionIconBaseClass = "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)]";
const inspectionOpenIconClass = `${inspectionActionIconBaseClass} bg-amber-500 hover:bg-amber-600`;

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function reportTypeLabel(reportType: string) {
  if (reportType === "wood_burning_fireplace") return "Wood Fireplace";
  if (reportType === "wood_stove") return "Wood Stove";
  if (reportType === "wett_inspection") return "WETT";
  if (reportType === "gas_fireplace") return "Gas Fireplace";
  return reportType.replaceAll("_", " ");
}

function inspectionStatusBadgeClass(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("pass")) {
    return "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }
  if (normalized.includes("fail")) {
    return "theme-status-error inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }
  if (normalized.includes("warning")) {
    return "theme-status-warning inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }
  if (normalized.includes("generated") || normalized.includes("complete") || normalized.includes("ready")) {
    return "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }
  if (normalized.includes("blocked") || normalized.includes("unsatisfactory")) {
    return "theme-status-error inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }
  return "theme-badge inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
}

export function LegacyInspectionsWorkspace() {
  const router = useRouter();
  const [rows, setRows] = useState<InspectionListRow[]>([]);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [reportType, setReportType] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createSource, setCreateSource] = useState<InspectionSource>("existing_customer");
  const [inspectionType, setInspectionType] = useState<InspectionType>("standard");
  const [propertyAddress, setPropertyAddress] = useState("");

  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPropertyAddress, setNewPropertyAddress] = useState("");

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerOptions, setCustomerOptions] = useState<InspectionCustomerSearchRow[]>([]);
  const [customerSearchBusy, setCustomerSearchBusy] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<InspectionCustomerSearchRow | null>(null);

  const [jobQuery, setJobQuery] = useState("");
  const [jobOptions, setJobOptions] = useState<InspectionJobSearchRow[]>([]);
  const [jobSearchBusy, setJobSearchBusy] = useState(false);
  const [selectedJob, setSelectedJob] = useState<InspectionJobSearchRow | null>(null);

  async function load() {
    setBusy(true);
    try {
      const data = await listInspections({ q, reportType });
      setRows(data);
      setPage(1);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load inspections.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emptyMessage = useMemo(
    () => (busy ? "Loading inspections..." : "No inspections found. Create one to begin."),
    [busy],
  );
  const tableState: MasterTableState = busy
    ? { status: "empty", message: "Loading inspections..." }
    : rows.length
      ? { status: "ready" }
      : { status: "empty", message: "No inspections found. Create one to begin." };
  const pageSize = 10;
  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function resetCreateModal() {
    setCreateSource("existing_customer");
    setInspectionType("standard");
    setPropertyAddress("");
    setNewFirstName("");
    setNewLastName("");
    setNewPhone("");
    setNewEmail("");
    setNewPropertyAddress("");
    setCustomerQuery("");
    setCustomerOptions([]);
    setSelectedCustomer(null);
    setJobQuery("");
    setJobOptions([]);
    setSelectedJob(null);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setCreateBusy(false);
    resetCreateModal();
  }

  async function handleCreateInspection() {
    const normalizedPropertyAddress = propertyAddress.trim();
    const normalizedNewPropertyAddress = newPropertyAddress.trim();

    if (createSource === "new_customer") {
      if (!newFirstName.trim() || !newLastName.trim() || !newPhone.trim() || !normalizedNewPropertyAddress) {
        setError("New Customer requires first name, last name, phone, and property address.");
        return;
      }
    }
    if (createSource === "existing_customer" && !selectedCustomer?.id) {
      setError("Select an existing customer before creating an inspection.");
      return;
    }
    if (createSource === "existing_job" && !selectedJob?.id) {
      setError("Select an existing job before creating an inspection.");
      return;
    }
    if (createSource === "existing_customer" && normalizedPropertyAddress.length > 0 && normalizedPropertyAddress.length < 5) {
      setError("Property address must be at least 5 characters when provided.");
      return;
    }

    const reportTypeValue = inspectionType === "wett"
      ? "wett_inspection"
      : inspectionType === "gas"
        ? "gas_fireplace"
        : "wood_burning_fireplace";

    try {
      setCreateBusy(true);
      setError(null);
      const workspace = await createInspection({
        source: createSource,
        report_type: reportTypeValue,
        customer_id: createSource === "existing_customer" ? selectedCustomer?.id ?? null : undefined,
        job_id: createSource === "existing_job" ? selectedJob?.id ?? null : undefined,
        property_address: createSource === "existing_customer" ? (normalizedPropertyAddress || null) : undefined,
        new_customer: createSource === "new_customer"
          ? {
            first_name: newFirstName.trim(),
            last_name: newLastName.trim(),
            phone: newPhone.trim(),
            email: newEmail.trim() || null,
            property_address: normalizedNewPropertyAddress,
          }
          : undefined,
      });
      closeCreateModal();
      router.push(`/inspections/${workspace.inspectionMeta.id}/workspace`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setCreateBusy(false);
    }
  }

  useEffect(() => {
    if (!isCreateModalOpen || createSource !== "existing_customer") {
      return;
    }
    const normalized = customerQuery.trim();
    const timer = window.setTimeout(async () => {
      if (normalized.length < 2) {
        setCustomerOptions([]);
        setCustomerSearchBusy(false);
        return;
      }
      try {
        setCustomerSearchBusy(true);
        const rows = await searchInspectionCustomers(normalized);
        setCustomerOptions(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Customer search failed.");
      } finally {
        setCustomerSearchBusy(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isCreateModalOpen, createSource, customerQuery]);

  useEffect(() => {
    if (!isCreateModalOpen || createSource !== "existing_job") {
      return;
    }
    const normalized = jobQuery.trim();
    const timer = window.setTimeout(async () => {
      if (normalized.length < 2) {
        setJobOptions([]);
        setJobSearchBusy(false);
        return;
      }
      try {
        setJobSearchBusy(true);
        const rows = await searchInspectionJobs(normalized);
        setJobOptions(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Job search failed.");
      } finally {
        setJobSearchBusy(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isCreateModalOpen, createSource, jobQuery]);

  return (
    <main className="space-y-5 px-4 pt-6 lg:px-6">
      <section className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[linear-gradient(170deg,rgba(8,8,8,0.96),rgba(19,19,19,0.9))] p-4 shadow-[0_28px_80px_rgba(0,0,0,0.32)]">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="theme-input-control h-10 min-w-[280px] rounded-[14px] px-3 text-sm"
            placeholder="Search by client, address, or report type"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <select
            className="theme-input-control h-10 rounded-[14px] px-3 text-sm"
            value={reportType}
            onChange={(event) => setReportType(event.target.value)}
          >
            <option value="">All report types</option>
            <option value="wood_burning_fireplace">Wood Burning Fireplace</option>
            <option value="wood_stove">Wood Stove</option>
            <option value="wett_inspection">WETT Inspection</option>
            <option value="gas_fireplace">Gas Fireplace</option>
          </select>
          <button className="theme-btn-secondary h-10 rounded-[14px] px-4 text-sm" onClick={() => void load()}>
            Search
          </button>
          <button
            className="theme-btn-primary h-10 rounded-[14px] px-4 text-sm"
            onClick={() => {
              setError(null);
              setIsCreateModalOpen(true);
            }}
          >
            New Inspection
          </button>
        </div>
        {error ? <p className="theme-alert-error mt-3 rounded-[12px] border px-3 py-2 text-sm">{error}</p> : null}
      </section>

      <section className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(12,12,12,0.92))] p-3">
        <div className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/96 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.05)] sm:p-5">
          <div className="mb-5 flex flex-col gap-3 border-b border-[color:var(--cmp-border-subtle)] pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Inspection workspace</p>
              <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                Use ledger, hybrid, or grid views to review inspection records.
              </p>
            </div>
            <div className="theme-control-surface inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-xs text-[color:var(--sem-text-secondary)] sm:self-auto">
              <span className="font-medium text-[color:var(--sem-text-primary)]">{rows.length}</span>
              total records
            </div>
          </div>
          <div className="hidden lg:block">
            <input id="inspection-display-ledger" className="sr-only" type="radio" name="inspection-display-mode" defaultChecked />
            <input id="inspection-display-hybrid" className="sr-only" type="radio" name="inspection-display-mode" />
            <input id="inspection-display-grid" className="sr-only" type="radio" name="inspection-display-mode" />
            <style
              dangerouslySetInnerHTML={{
                __html: `
                  .inspection-display-panel { display: none; }
                  #inspection-display-ledger:checked ~ .inspection-display-panels .inspection-display-panel-ledger { display: block; }
                  #inspection-display-hybrid:checked ~ .inspection-display-panels .inspection-display-panel-hybrid { display: block; }
                  #inspection-display-grid:checked ~ .inspection-display-panels .inspection-display-panel-grid { display: block; }
                  .inspection-display-panel-ledger .master-table { table-layout: fixed; }
                  .inspection-display-panel-ledger .master-table-header-cell,
                  .inspection-display-panel-ledger .master-table-cell {
                    border-right: 1px solid var(--cmp-border-subtle);
                    vertical-align: middle;
                  }
                  .inspection-display-panel-ledger .master-table-header-cell:nth-child(1),
                  .inspection-display-panel-ledger .master-table-cell:nth-child(1) { width: 8rem; text-align: center; }
                  .inspection-display-panel-ledger .master-table-header-cell:nth-child(2),
                  .inspection-display-panel-ledger .master-table-cell:nth-child(2) { width: 15rem; text-align: center; }
                  .inspection-display-panel-ledger .master-table-header-cell:nth-child(3),
                  .inspection-display-panel-ledger .master-table-cell:nth-child(3) { text-align: center; }
                  .inspection-display-panel-ledger .master-table-header-cell:nth-child(4),
                  .inspection-display-panel-ledger .master-table-cell:nth-child(4) { width: 12rem; text-align: center; }
                  .inspection-display-panel-ledger .master-table-header-cell:nth-child(5),
                  .inspection-display-panel-ledger .master-table-cell:nth-child(5) { width: 12rem; text-align: center; }
                  .inspection-display-panel-ledger .master-table-header-cell:nth-child(6),
                  .inspection-display-panel-ledger .master-table-cell:nth-child(6) { width: 12rem; text-align: center; }
                  .inspection-display-panel-ledger .master-table-header-cell:last-child,
                  .inspection-display-panel-ledger .master-table-cell:last-child { border-right: 0; }
                  .inspection-display-panel-ledger .master-table-row:nth-child(even) {
                    background: color-mix(in srgb, var(--cmp-surface-canvas) 82%, transparent);
                  }
                `,
              }}
            />
            <div className="mb-5 flex flex-wrap gap-2">
              <label htmlFor="inspection-display-ledger" className="cursor-pointer rounded-full border px-4 py-2 text-xs uppercase tracking-[0.18em]">Ledger</label>
              <label htmlFor="inspection-display-hybrid" className="cursor-pointer rounded-full border px-4 py-2 text-xs uppercase tracking-[0.18em]">Hybrid</label>
              <label htmlFor="inspection-display-grid" className="cursor-pointer rounded-full border px-4 py-2 text-xs uppercase tracking-[0.18em]">Grid</label>
            </div>
            <div className="inspection-display-panels">
              <div className="inspection-display-panel inspection-display-panel-ledger">
                <MasterTable columns={columns} colSpan={6} state={tableState}>
                  {pagedRows.map((row) => (
                    <MasterTableRow key={row.id}>
                      <td className="master-table-cell text-center">
                        <Link href={`/inspections/${row.id}/workspace`} title="Open inspection" aria-label="Open inspection" className={inspectionOpenIconClass}>
                          <FileText className="h-[0.8rem] w-[0.8rem]" />
                        </Link>
                      </td>
                      <td className="master-table-cell text-center">{row.client_name ?? "Unknown client"}</td>
                      <td className="master-table-cell text-center">
                        <p className="truncate text-[color:var(--sem-text-primary)]" title={row.address ?? "Unknown address"}>
                          {row.address ?? "Unknown address"}
                        </p>
                      </td>
                      <td className="master-table-cell text-center">
                        <span className="font-medium text-[color:var(--sem-text-primary)]">{reportTypeLabel(row.report_type)}</span>
                      </td>
                      <td className="master-table-cell text-center">
                        <span className={inspectionStatusBadgeClass(row.compliance_status ?? row.status)}>
                          {row.compliance_status ?? row.status}
                        </span>
                      </td>
                      <td className="master-table-cell text-center">{formatDateTime(row.updated_at)}</td>
                    </MasterTableRow>
                  ))}
                </MasterTable>
              </div>
              <div className="inspection-display-panel inspection-display-panel-hybrid space-y-3">
                {pagedRows.map((row) => (
                  <article key={row.id} className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[color:var(--sem-text-primary)]">{row.client_name ?? "Unknown client"}</p>
                        <p className="text-sm text-[color:var(--sem-text-secondary)]">{row.address ?? "Unknown address"}</p>
                        <div className="mt-3">
                          <span className={inspectionStatusBadgeClass(row.compliance_status ?? row.status)}>
                            {row.compliance_status ?? row.status}
                          </span>
                        </div>
                      </div>
                      <Link href={`/inspections/${row.id}/workspace`} className={inspectionOpenIconClass} title="Open inspection" aria-label="Open inspection">
                        <FileText className="h-[0.8rem] w-[0.8rem]" />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
              <div className="inspection-display-panel inspection-display-panel-grid">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {pagedRows.map((row) => (
                    <article key={row.id} className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-[color:var(--sem-text-primary)]">{row.client_name ?? "Unknown client"}</p>
                        <Link href={`/inspections/${row.id}/workspace`} className={inspectionOpenIconClass} title="Open inspection" aria-label="Open inspection">
                          <FileText className="h-[0.8rem] w-[0.8rem]" />
                        </Link>
                      </div>
                      <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{row.address ?? "Unknown address"}</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-xs text-[color:var(--sem-text-secondary)]">{reportTypeLabel(row.report_type)}</p>
                        <span className={inspectionStatusBadgeClass(row.compliance_status ?? row.status)}>
                          {row.compliance_status ?? row.status}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="lg:hidden">
            <MasterMobileList
              items={pagedRows}
              emptyState={emptyMessage}
              renderItem={(row) => (
                <article key={row.id} className="master-mobile-card theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] p-4 text-sm text-[color:var(--sem-text-secondary)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-[color:var(--sem-text-primary)]">{row.client_name ?? "Unknown client"}</p>
                      <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{row.report_type}</p>
                    </div>
                    <Link href={`/inspections/${row.id}/workspace`} title="Open inspection" aria-label="Open inspection" className={inspectionOpenIconClass}>
                      <FileText className="h-[0.8rem] w-[0.8rem]" />
                    </Link>
                  </div>
                  <p className="mt-2">{row.address ?? "Unknown address"}</p>
                  <p className="mt-2 text-xs">{formatDateTime(row.updated_at)}</p>
                </article>
              )}
            />
          </div>
          {rows.length ? (
            <div className="mt-5 flex items-center justify-between rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3 text-sm">
              <p className="text-[color:var(--sem-text-secondary)]">
                Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                  className="theme-btn-secondary rounded-full px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="text-[color:var(--sem-text-secondary)]">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="theme-btn-secondary rounded-full px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4">
          <section className="theme-surface-card w-full max-w-[760px] rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(10,10,10,0.9))] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.38)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[color:var(--text-primary)]">Create Inspection</h2>
              <button className="theme-btn-ghost rounded-[10px] px-3 py-1 text-xs" onClick={closeCreateModal} disabled={createBusy}>
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Source</span>
                <select
                  className="theme-input-control h-10 w-full rounded-[12px] px-3 text-sm"
                  value={createSource}
                  onChange={(event) => setCreateSource(event.target.value as InspectionSource)}
                  disabled={createBusy}
                >
                  <option value="new_customer">New Customer</option>
                  <option value="existing_customer">Existing Customer</option>
                  <option value="existing_job">Existing Job</option>
                  <option value="internal_draft">Internal Draft</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Inspection Type</span>
                <select
                  className="theme-input-control h-10 w-full rounded-[12px] px-3 text-sm"
                  value={inspectionType}
                  onChange={(event) => setInspectionType(event.target.value as InspectionType)}
                  disabled={createBusy}
                >
                  <option value="standard">STANDARD</option>
                  <option value="wett">WETT</option>
                  <option value="gas">GAS</option>
                </select>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Source Data</span>
                <p className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-soft)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
                  {createSource === "internal_draft"
                    ? "Internal Draft / Not Sendable"
                    : "Search and select by public references. Internal UUIDs stay hidden."}
                </p>
              </label>

              {createSource === "new_customer" ? (
                <>
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">First Name</span>
                    <input
                      className="theme-input-control h-10 w-full rounded-[12px] px-3 text-sm"
                      placeholder="First name"
                      value={newFirstName}
                      onChange={(event) => setNewFirstName(event.target.value)}
                      disabled={createBusy}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Last Name</span>
                    <input
                      className="theme-input-control h-10 w-full rounded-[12px] px-3 text-sm"
                      placeholder="Last name"
                      value={newLastName}
                      onChange={(event) => setNewLastName(event.target.value)}
                      disabled={createBusy}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Phone</span>
                    <input
                      className="theme-input-control h-10 w-full rounded-[12px] px-3 text-sm"
                      placeholder="Phone"
                      value={newPhone}
                      onChange={(event) => setNewPhone(event.target.value)}
                      disabled={createBusy}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Email</span>
                    <input
                      className="theme-input-control h-10 w-full rounded-[12px] px-3 text-sm"
                      placeholder="Email (optional)"
                      value={newEmail}
                      onChange={(event) => setNewEmail(event.target.value)}
                      disabled={createBusy}
                    />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Property Address</span>
                    <input
                      className="theme-input-control h-10 w-full rounded-[12px] px-3 text-sm"
                      placeholder="Street address"
                      value={newPropertyAddress}
                      onChange={(event) => setNewPropertyAddress(event.target.value)}
                      disabled={createBusy}
                    />
                  </label>
                </>
              ) : null}

              {createSource === "existing_customer" ? (
                <label className="space-y-2 md:col-span-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Customer Search</span>
                  <input
                    className="theme-input-control h-10 w-full rounded-[12px] px-3 text-sm"
                    placeholder="Min 2 chars: name, phone, email"
                    value={customerQuery}
                    onChange={(event) => {
                      setCustomerQuery(event.target.value);
                      setSelectedCustomer(null);
                    }}
                    disabled={createBusy}
                  />
                  {customerSearchBusy ? <p className="text-xs text-[color:var(--text-secondary)]">Searching customers...</p> : null}
                  {selectedCustomer ? (
                    <p className="rounded-[10px] border border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] px-2 py-1 text-xs text-[color:var(--status-success-text)]">
                      Selected: {selectedCustomer.full_name} · {selectedCustomer.phone}
                    </p>
                  ) : null}
                  <div className="max-h-[160px] space-y-1 overflow-auto">
                    {customerOptions.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        className="theme-btn-ghost w-full rounded-[10px] px-3 py-2 text-left text-xs"
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setCustomerQuery(customer.full_name);
                        }}
                      >
                        {customer.full_name} · {customer.phone}{customer.email ? ` · ${customer.email}` : ""}
                      </button>
                    ))}
                  </div>
                </label>
              ) : null}

              {createSource === "existing_customer" ? (
                <label className="space-y-2 md:col-span-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Property Address (Optional Override)</span>
                  <input
                    className="theme-input-control h-10 w-full rounded-[12px] px-3 text-sm"
                    placeholder="Use customer default if left blank"
                    value={propertyAddress}
                    onChange={(event) => setPropertyAddress(event.target.value)}
                    disabled={createBusy}
                  />
                </label>
              ) : null}

              {createSource === "existing_job" ? (
                <label className="space-y-2 md:col-span-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Job Search</span>
                  <input
                    className="theme-input-control h-10 w-full rounded-[12px] px-3 text-sm"
                    placeholder="Min 2 chars: job code, customer, phone, address"
                    value={jobQuery}
                    onChange={(event) => {
                      setJobQuery(event.target.value);
                      setSelectedJob(null);
                    }}
                    disabled={createBusy}
                  />
                  {jobSearchBusy ? <p className="text-xs text-[color:var(--text-secondary)]">Searching jobs...</p> : null}
                  {selectedJob ? (
                    <p className="rounded-[10px] border border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] px-2 py-1 text-xs text-[color:var(--status-success-text)]">
                      Selected Job Number: {selectedJob.job_code} · Invoice: {selectedJob.invoice_number}
                    </p>
                  ) : null}
                  <div className="max-h-[180px] space-y-1 overflow-auto">
                    {jobOptions.map((job) => (
                      <button
                        key={job.id}
                        type="button"
                        className="theme-btn-ghost w-full rounded-[10px] px-3 py-2 text-left text-xs"
                        onClick={() => {
                          setSelectedJob(job);
                          setJobQuery(`${job.job_code} · ${job.customer_name}`);
                        }}
                      >
                        Job {job.job_code} · {job.customer_name} · {job.customer_phone}
                        <br />
                        {job.service_address}
                        <br />
                        {job.quote_number} · {job.invoice_number} · {job.report_number}
                      </button>
                    ))}
                  </div>
                </label>
              ) : null}

              {createSource === "internal_draft" ? (
                <p className="md:col-span-2 rounded-[12px] border border-[color:var(--status-warning-border)] bg-[color:var(--status-warning-bg)] px-3 py-2 text-xs text-[color:var(--status-warning-text)]">
                  Internal Draft / Not Sendable. Workspace and preview are available, but Generate/Send stay blocked until conversion.
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="theme-btn-secondary rounded-[12px] px-4 py-2 text-sm" onClick={closeCreateModal} disabled={createBusy}>
                Cancel
              </button>
              <button className="theme-btn-primary rounded-[12px] px-4 py-2 text-sm" onClick={() => void handleCreateInspection()} disabled={createBusy}>
                {createBusy ? "Creating..." : "Create"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export const SHOW_LEGACY_INSPECTIONS = false;

type InspectionsWorkspaceProps = {
  permissions: string[];
  sessionRole: SessionRole | null;
};

export default function InspectionsWorkspace({ permissions, sessionRole }: InspectionsWorkspaceProps) {
  if (SHOW_LEGACY_INSPECTIONS) {
    return <LegacyInspectionsWorkspace />;
  }

  return <InspectionCommandCenterList permissions={permissions} sessionRole={sessionRole} />;
}


