"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, FileText, Plus, Search } from "lucide-react";

import type { SessionRole } from "@/lib/auth/server-session";
import {
  createInspection,
  listInspections,
  searchInspectionCustomers,
  searchInspectionJobs,
  type InspectionCustomerSearchRow,
  type InspectionJobSearchRow,
  type InspectionListRow,
} from "@/lib/inspections/browser-api";

import {
  InspectionCreateModal,
  type InspectionSource,
  type InspectionType,
} from "./inspection-create-modal";
import {
  canManageInspections,
  formatInspectionDate,
  jurisdictionLabel,
  MetricCard,
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
      const data = await listInspections({ q, reportType, status: statusFilter || undefined });
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
    <main className="min-h-screen bg-zinc-50 pb-20 text-zinc-950">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 px-6 py-4 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-[96rem] flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-zinc-950 p-1.5 text-white"><ClipboardCheck className="h-4 w-4" /></span>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-400">Inspection Command Center</p>
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-950">Field Inspection & Report Confidence Desk</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Create, review, and prepare field inspections for report-ready customer communication. Reports are generated from the recorded checklist, required fields, photos, and server-side report gates.
            </p>
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setIsCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              <Plus className="h-4 w-4" />
              New inspection
            </button>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-[96rem] space-y-5 px-6 pt-6">
        {!canManage ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Read-only view{sessionRole ? ` (${sessionRole})` : ""}. Inspection management requires the inspections.admin permission.
          </p>
        ) : null}

        <section className="rounded-[24px] border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[280px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-zinc-400"
                placeholder="Search by client, address, or report type"
                value={q}
                onChange={(event) => setQ(event.target.value)}
              />
            </div>
            <select className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm" value={reportType} onChange={(e) => setReportType(e.target.value)}>
              <option value="">All report types</option>
              <option value="wood_burning_fireplace">Wood Fireplace</option>
              <option value="wood_stove">Wood Stove</option>
              <option value="wett_inspection">WETT Site Basic</option>
              <option value="gas_fireplace">Gas Fireplace</option>
            </select>
            <select className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="pass">Pass</option>
              <option value="warning">Warning</option>
              <option value="fail">Fail</option>
            </select>
            <button type="button" className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium hover:bg-zinc-50" onClick={() => void load()}>
              Search
            </button>
          </div>
          {error ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="In view" value={listStats.total} note="Current list result" />
          <MetricCard label="Pass" value={listStats.pass} note="status = pass" tone="emerald" />
          <MetricCard label="Warning" value={listStats.warning} note="status = warning" tone="amber" />
          <MetricCard label="Fail" value={listStats.fail} note="status = fail" tone="rose" />
          <MetricCard label="Sent / locked" value={listStats.sent} note="sent_to_customer_at set" tone="emerald" />
          <MetricCard label="Compliance generated" value={listStats.complianceGenerated} note="compliance_status = generated (WETT path)" />
        </section>

        <section className="rounded-[24px] border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">Inspection library</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">Active records</h2>
            </div>
            <FileText className="h-4 w-4 text-zinc-400" />
          </div>

          {busy ? (
            <p className="mt-4 text-sm text-zinc-500">Loading inspections...</p>
          ) : null}

          {!busy && pagedRows.length === 0 ? (
            <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
              No inspections found. {canManage ? "Create one to begin." : "Try adjusting filters or contact an office admin."}
            </p>
          ) : null}

          <div className="mt-4 space-y-2">
            {pagedRows.map((row) => (
              <article key={row.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-zinc-300">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-zinc-950">{row.client_name ?? "Unknown client"}</p>
                      <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] text-zinc-600">{reportTypeLabel(row.report_type)}</span>
                      <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] text-zinc-600">{workflowTypeLabel(row.workflow_type)}</span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">{row.address ?? "Unknown address"}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] text-zinc-500">{jurisdictionLabel(row.province_code, row.country_code)}</span>
                      <StatusPill status={row.compliance_status ?? row.status} />
                      {row.sent_to_customer_at ? <StatusPill status="sent" /> : null}
                      <span className="font-mono text-[10px] text-zinc-400">{formatInspectionDate(row.updated_at)}</span>
                    </div>
                  </div>
                  <Link
                    href={`/inspections/${row.id}/workspace`}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                  >
                    <FileText className="h-4 w-4" />
                    Open workspace
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {rows.length > 0 ? (
            <div className="mt-5 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <p className="text-zinc-600">
                Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={currentPage <= 1} className="rounded-full border border-zinc-200 px-4 py-2 text-xs disabled:opacity-50">
                  Prev
                </button>
                <span className="font-mono text-xs text-zinc-500">Page {currentPage} of {totalPages}</span>
                <button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage >= totalPages} className="rounded-full border border-zinc-200 px-4 py-2 text-xs disabled:opacity-50">
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </section>
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
    </main>
  );
}
