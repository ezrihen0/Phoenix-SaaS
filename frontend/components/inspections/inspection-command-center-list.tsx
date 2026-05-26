"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardCheck, ClipboardList, FileCheck2, FileText, Lock, Plus, Search, XCircle } from "lucide-react";

import { MetricTile } from "@/components/board/metric-tile";

import type { SessionRole } from "@/lib/auth/server-session";
import {
  createInspection,
  listInspections,
  searchInspectionCustomers,
  searchInspectionJobs,
  type InspectionCustomerSearchRow,
  type InspectionJobSearchRow,
  type InspectionListRow,
  type InspectionActiveState,
} from "@/lib/inspections/browser-api";

import {
  InspectionCreateModal,
  type InspectionSource,
  type InspectionType,
} from "./inspection-create-modal";
import {
  InspectionCommandHeader,
  InspectionCommandShell,
  InspectionLightPanel,
  inspectionBadgeClass,
  inspectionOpsZoneClass,
} from "./inspection-command-shell";
import {
  canManageInspections,
  archiveReasonCodeLabel,
  formatInspectionDate,
  jurisdictionLabel,
  reportTypeLabel,
  StatusPill,
  workflowTypeLabel,
} from "./inspection-labels";

type InspectionCommandCenterListProps = {
  permissions: string[];
  sessionRole: SessionRole | null;
};

export function InspectionCommandCenterList({ permissions, sessionRole }: InspectionCommandCenterListProps) {
  const router = useRouter();
  const canManage = canManageInspections(permissions);
  const [rows, setRows] = useState<InspectionListRow[]>([]);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [reportType, setReportType] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeState, setActiveState] = useState<InspectionActiveState>("active");
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
      const data = await listInspections({ q, reportType, status: statusFilter || undefined, activeState });
      setRows(data);
      setPage(1);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load inspections.");
      setRows([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listStats = useMemo(() => ({
    total: rows.length,
    pass: rows.filter((row) => row.status === "pass").length,
    warning: rows.filter((row) => row.status === "warning").length,
    fail: rows.filter((row) => row.status === "fail").length,
    sent: rows.filter((row) => row.sent_to_customer_at).length,
    complianceGenerated: rows.filter((row) => row.compliance_status === "generated").length,
  }), [rows]);

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
        const results = await searchInspectionCustomers(normalized);
        setCustomerOptions(results);
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
        const results = await searchInspectionJobs(normalized);
        setJobOptions(results);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Job search failed.");
      } finally {
        setJobSearchBusy(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isCreateModalOpen, createSource, jobQuery]);

  return (
    <InspectionCommandShell>
      <InspectionCommandHeader
        eyebrow="Field Inspection Engine"
        title="Inspection Command Center"
        subtitle="Create, review, and prepare field inspections for report-ready customer communication. Reports are generated from the recorded checklist, required fields, photos, and server-side report gates."
        icon={<ClipboardCheck className="h-5 w-5" />}
        actions={canManage ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setIsCreateModalOpen(true);
            }}
            className="theme-btn-primary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            New inspection
          </button>
        ) : null}
      />

      <div className={inspectionOpsZoneClass()}>
        {!canManage ? (
          <p className="theme-alert-warning rounded-[20px] border px-4 py-3 text-sm">
            Read-only view{sessionRole ? ` (${sessionRole})` : ""}. Inspection management requires the inspections.admin permission.
          </p>
        ) : null}

        <section className="theme-control-surface rounded-2xl border border-[color:var(--cmp-border-subtle)] px-3 py-2.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="w-full lg:max-w-xl lg:flex-1">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)] lg:sr-only">
                Search
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--sem-text-muted)]" />
                <input
                  className="theme-input-control h-10 w-full rounded-xl pl-9 pr-3 text-sm"
                  placeholder="Search by client, address, or report type"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                />
              </div>
            </label>
            <label className="w-full lg:w-60">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)] lg:sr-only">
                Report type
              </span>
              <select className="theme-input-control h-10 w-full rounded-xl px-3 text-sm" value={reportType} onChange={(e) => setReportType(e.target.value)}>
                <option value="">All report types</option>
                <option value="wood_burning_fireplace">Wood Fireplace</option>
                <option value="wood_stove">Wood Stove</option>
                <option value="wett_inspection">WETT Site Basic</option>
                <option value="gas_fireplace">Gas Fireplace</option>
              </select>
            </label>
            <label className="w-full lg:w-48">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)] lg:sr-only">
                Status
              </span>
              <select className="theme-input-control h-10 w-full rounded-xl px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="pass">Pass</option>
                <option value="warning">Warning</option>
                <option value="fail">Fail</option>
              </select>
            </label>
            <label className="w-full lg:w-40">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)] lg:sr-only">
                Library
              </span>
              <select className="theme-input-control h-10 w-full rounded-xl px-3 text-sm" value={activeState} onChange={(e) => setActiveState(e.target.value as InspectionActiveState)}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
            </label>
            <button type="button" className="theme-btn-secondary h-10 w-full shrink-0 rounded-xl px-4 text-sm font-medium lg:w-auto" onClick={() => void load()}>
              Search
            </button>
          </div>
          {error ? <p className="theme-alert-error mt-2 rounded-xl border px-3 py-2 text-sm">{error}</p> : null}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <MetricTile icon={ClipboardList} label="In view" value={listStats.total} helper="Inspections in current list" />
          <MetricTile icon={CheckCircle2} label="Pass" value={listStats.pass} helper="Passed inspections in view" />
          <MetricTile icon={AlertTriangle} label="Warning" value={listStats.warning} helper="Inspections with warnings" />
          <MetricTile icon={XCircle} label="Fail" value={listStats.fail} helper="Failed inspections in view" />
          <MetricTile icon={Lock} label="Sent / locked" value={listStats.sent} helper="Reports marked sent" />
          <MetricTile icon={FileCheck2} label="Compliance generated" value={listStats.complianceGenerated} helper="WETT compliance reports generated" />
        </section>

        <InspectionLightPanel
          title={activeState === "archived" ? "Archived records" : activeState === "all" ? "All records" : "Active records"}
          eyebrow="Inspection library"
          icon={<FileText className="h-4 w-4" />}
        >
          {busy ? (
            <p className="text-sm text-[color:var(--sem-text-secondary)]">Loading inspections...</p>
          ) : null}

          {!busy && pagedRows.length === 0 ? (
            <p className="theme-control-surface rounded-[20px] px-4 py-6 text-sm text-[color:var(--sem-text-secondary)]">
              No inspections found. {canManage ? "Create one to begin." : "Try adjusting filters or contact an office admin."}
            </p>
          ) : null}

          <div className="space-y-2">
            {pagedRows.map((row) => (
              <article key={row.id} className="theme-surface-card rounded-[20px] border border-[color:var(--cmp-border-subtle)] p-4 transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-[color:var(--sem-text-primary)]">{row.client_name ?? "Unknown client"}</p>
                      <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${inspectionBadgeClass()}`}>{reportTypeLabel(row.report_type)}</span>
                      <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${inspectionBadgeClass()}`}>{workflowTypeLabel(row.workflow_type)}</span>
                    </div>
                    <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{row.address ?? "Unknown address"}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] text-[color:var(--sem-text-muted)]">{jurisdictionLabel(row.province_code, row.country_code)}</span>
                      <StatusPill status={row.compliance_status ?? row.status} />
                      {row.archived_at ? <StatusPill status="archived" /> : null}
                      {row.sent_to_customer_at ? <StatusPill status="sent" /> : null}
                      <span className="font-mono text-[10px] text-[color:var(--sem-text-muted)]">{formatInspectionDate(row.updated_at)}</span>
                    </div>
                    {row.archived_at && row.archive_reason ? (
                      <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">
                        {archiveReasonCodeLabel(row.archive_reason_code)} · {row.archive_reason}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={`/inspections/${row.id}/workspace`}
                    className="theme-btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold"
                  >
                    <FileText className="h-4 w-4" />
                    Open workspace
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {rows.length > 0 ? (
            <div className="theme-control-surface mt-5 flex items-center justify-between rounded-[18px] px-4 py-3 text-sm">
              <p className="text-[color:var(--sem-text-secondary)]">
                Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={currentPage <= 1} className="theme-btn-ghost rounded-full px-4 py-2 text-xs disabled:opacity-50">
                  Prev
                </button>
                <span className="font-mono text-xs text-[color:var(--sem-text-muted)]">Page {currentPage} of {totalPages}</span>
                <button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage >= totalPages} className="theme-btn-ghost rounded-full px-4 py-2 text-xs disabled:opacity-50">
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </InspectionLightPanel>
      </div>

      <InspectionCreateModal
        open={isCreateModalOpen}
        createBusy={createBusy}
        createSource={createSource}
        inspectionType={inspectionType}
        propertyAddress={propertyAddress}
        newFirstName={newFirstName}
        newLastName={newLastName}
        newPhone={newPhone}
        newEmail={newEmail}
        newPropertyAddress={newPropertyAddress}
        customerQuery={customerQuery}
        customerOptions={customerOptions}
        customerSearchBusy={customerSearchBusy}
        selectedCustomer={selectedCustomer}
        jobQuery={jobQuery}
        jobOptions={jobOptions}
        jobSearchBusy={jobSearchBusy}
        selectedJob={selectedJob}
        canManage={canManage}
        onClose={closeCreateModal}
        onCreate={() => void handleCreateInspection()}
        onCreateSourceChange={setCreateSource}
        onInspectionTypeChange={setInspectionType}
        onPropertyAddressChange={setPropertyAddress}
        onNewFirstNameChange={setNewFirstName}
        onNewLastNameChange={setNewLastName}
        onNewPhoneChange={setNewPhone}
        onNewEmailChange={setNewEmail}
        onNewPropertyAddressChange={setNewPropertyAddress}
        onCustomerQueryChange={(value) => {
          setCustomerQuery(value);
          setSelectedCustomer(null);
        }}
        onSelectCustomer={(customer) => {
          setSelectedCustomer(customer);
          setCustomerQuery(customer.full_name);
        }}
        onJobQueryChange={(value) => {
          setJobQuery(value);
          setSelectedJob(null);
        }}
        onSelectJob={(job) => {
          setSelectedJob(job);
          setJobQuery(`${job.job_code} · ${job.customer_name}`);
        }}
      />
    </InspectionCommandShell>
  );
}
