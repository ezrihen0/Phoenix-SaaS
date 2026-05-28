"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ClipboardList, Loader2, Search, UserRound, Wrench } from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";
import {
  createInspection,
  searchInspectionCustomers,
  searchInspectionJobs,
  type CreateInspectionInput,
  type InspectionCustomerSearchRow,
  type InspectionJobSearchRow,
  type InspectionWorkspacePayload,
} from "@/lib/inspections/browser-api";

type SourceMode = "existing_customer" | "existing_job" | "new_customer";

const REPORT_TYPE_OPTIONS: Array<{ value: string; label: string; helper: string }> = [
  { value: "wood_burning_fireplace", label: "Standard", helper: "Wood burning fireplace safety workflow" },
  { value: "wett_inspection", label: "WETT Site Basic", helper: "Compliance workflow with mandatory fields" },
  { value: "gas_fireplace", label: "Gas Fireplace", helper: "Gas fireplace simplified workflow" },
  { value: "wood_stove", label: "Wood Stove", helper: "Wood stove inspection report" },
];

const inputClass =
  "theme-input-control h-11 w-full rounded-xl border px-3 text-sm transition focus:outline-none focus:ring-2 focus:ring-[color:var(--cmp-focus-ring)]";
const labelClass = "text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]";

export default function NewInspectionPage() {
  const [source, setSource] = useState<SourceMode>("existing_customer");
  const [reportType, setReportType] = useState("wood_burning_fireplace");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Existing Customer
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<InspectionCustomerSearchRow[]>([]);
  const [customerSearchBusy, setCustomerSearchBusy] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<InspectionCustomerSearchRow | null>(null);

  // Existing Job
  const [jobQuery, setJobQuery] = useState("");
  const [jobResults, setJobResults] = useState<InspectionJobSearchRow[]>([]);
  const [jobSearchBusy, setJobSearchBusy] = useState(false);
  const [selectedJob, setSelectedJob] = useState<InspectionJobSearchRow | null>(null);

  // New Customer
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPropertyAddress, setNewPropertyAddress] = useState("");

  // Success state
  const [success, setSuccess] = useState<{ id: string; reportType: string } | null>(null);

  async function handleCustomerSearch() {
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomerResults([]);
      return;
    }
    setCustomerSearchBusy(true);
    try {
      const results = await searchInspectionCustomers(q);
      setCustomerResults(results);
    } catch {
      setCustomerResults([]);
    } finally {
      setCustomerSearchBusy(false);
    }
  }

  async function handleJobSearch() {
    const q = jobQuery.trim();
    if (q.length < 2) {
      setJobResults([]);
      return;
    }
    setJobSearchBusy(true);
    try {
      const results = await searchInspectionJobs(q);
      setJobResults(results);
    } catch {
      setJobResults([]);
    } finally {
      setJobSearchBusy(false);
    }
  }

  function validate(): string | null {
    if (source === "existing_customer" && !selectedCustomer?.id) {
      return "Select a customer before creating the inspection.";
    }
    if (source === "existing_job" && !selectedJob?.id) {
      return "Select a job before creating the inspection.";
    }
    if (source === "new_customer") {
      if (!newFirstName.trim()) return "First name is required.";
      if (!newLastName.trim()) return "Last name is required.";
      if (!newPhone.trim()) return "Phone is required.";
      if (!newPropertyAddress.trim()) return "Property address is required.";
    }
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const payload: CreateInspectionInput = {
        source,
        report_type: reportType,
      };

      if (source === "existing_customer") {
        payload.customer_id = selectedCustomer!.id;
      } else if (source === "existing_job") {
        payload.job_id = selectedJob!.id;
      } else if (source === "new_customer") {
        payload.new_customer = {
          first_name: newFirstName.trim(),
          last_name: newLastName.trim(),
          phone: newPhone.trim(),
          email: newEmail.trim() || null,
          property_address: newPropertyAddress.trim(),
        };
      }

      const workspace: InspectionWorkspacePayload = await createInspection(payload);
      setSuccess({ id: workspace.inspectionMeta.id, reportType: workspace.inspectionMeta.report_type });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The inspection could not be created.");
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setSource("existing_customer");
    setReportType("wood_burning_fireplace");
    setCustomerQuery("");
    setCustomerResults([]);
    setSelectedCustomer(null);
    setJobQuery("");
    setJobResults([]);
    setSelectedJob(null);
    setNewFirstName("");
    setNewLastName("");
    setNewPhone("");
    setNewEmail("");
    setNewPropertyAddress("");
    setError(null);
    setSuccess(null);
  }

  if (success) {
    return (
      <BoardShell>
        <div className="mx-auto max-w-lg px-4 py-8">
          <div className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--sem-state-success)_16%,transparent)]">
              <ClipboardList className="h-7 w-7 text-[color:var(--sem-state-success)]" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-[color:var(--sem-text-primary)]">Inspection created</h2>
            <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
              Report type: {REPORT_TYPE_OPTIONS.find((o) => o.value === success.reportType)?.label ?? success.reportType}
            </p>
            <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">
              ID: {success.id.slice(0, 8)}
            </p>
            <p className="mt-4 text-xs text-[color:var(--sem-text-muted)]">
              The inspection workspace requires a desktop browser. Open it from your computer to complete the report.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={resetForm}
                className="theme-btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold"
              >
                <ClipboardList className="h-4 w-4" />
                Create another
              </button>
              <Link
                href="/home"
                className="theme-btn-secondary inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </BoardShell>
    );
  }

  return (
    <BoardShell>
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="mb-8">
          <Link
            href="/home"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-[color:var(--sem-text-muted)] transition hover:text-[color:var(--sem-text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-2xl font-bold text-[color:var(--sem-text-primary)]">New Inspection</h1>
          <p className="mt-1 text-sm leading-relaxed text-[color:var(--sem-text-secondary)]">
            Inspections are created from a customer or job. Select the source for this report.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error ? (
            <div className="rounded-xl border border-[color:var(--sem-danger)] bg-[color:color-mix(in_srgb,var(--sem-danger)_8%,transparent)] px-4 py-3 text-sm text-[color:var(--sem-danger)]">
              {error}
            </div>
          ) : null}

          {/* Source selection */}
          <fieldset className="space-y-3">
            <legend className={labelClass}>Source</legend>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: "existing_customer" as const, label: "Customer", icon: UserRound },
                  { value: "existing_job" as const, label: "Job", icon: Wrench },
                  { value: "new_customer" as const, label: "New Customer", icon: UserRound },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSource(option.value);
                    setError(null);
                  }}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition ${
                    source === option.value
                      ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-selected-surface)] text-[color:var(--sem-accent-primary)]"
                      : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] text-[color:var(--sem-text-secondary)] hover:border-[color:var(--cmp-border-accent)]"
                  }`}
                >
                  <option.icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{option.label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* Report type */}
          <div className="space-y-3">
            <span className={labelClass}>Report type</span>
            <div className="grid grid-cols-2 gap-2">
              {REPORT_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={busy}
                  onClick={() => setReportType(option.value)}
                  className={`rounded-xl border p-3 text-left transition ${
                    reportType === option.value
                      ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-selected-surface)]"
                      : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] hover:border-[color:var(--cmp-border-accent)]"
                  }`}
                >
                  <p className={`text-sm font-semibold ${reportType === option.value ? "text-[color:var(--sem-accent-primary)]" : "text-[color:var(--sem-text-primary)]"}`}>
                    {option.label}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-[color:var(--sem-text-secondary)]">{option.helper}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Source-specific fields */}
          {source === "existing_customer" ? (
            <div className="space-y-3">
              <span className={labelClass}>Find customer</span>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--sem-text-muted)]" />
                  <input
                    type="text"
                    className={`${inputClass} pl-10`}
                    placeholder="Name, phone, or email (min 2 chars)"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCustomerSearch(); } }}
                    disabled={busy}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCustomerSearch}
                  disabled={busy || customerQuery.trim().length < 2}
                  className="theme-btn-secondary rounded-xl px-4 py-2 text-sm disabled:opacity-50"
                >
                  {customerSearchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                </button>
              </div>
              {selectedCustomer ? (
                <div className="rounded-xl border border-[color:var(--sem-state-success)] bg-[color:color-mix(in_srgb,var(--sem-state-success)_8%,transparent)] px-4 py-3 text-sm">
                  <p className="font-semibold text-[color:var(--sem-text-primary)]">{selectedCustomer.full_name}</p>
                  <p className="text-xs text-[color:var(--sem-text-secondary)]">{selectedCustomer.phone}{selectedCustomer.email ? ` · ${selectedCustomer.email}` : ""}</p>
                </div>
              ) : null}
              {customerResults.length > 0 && !selectedCustomer ? (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setSelectedCustomer(c); setCustomerResults([]); setCustomerQuery(""); }}
                      className="theme-control-surface w-full rounded-xl px-4 py-3 text-left text-sm transition hover:border-[color:var(--cmp-border-accent)]"
                    >
                      <p className="font-medium text-[color:var(--sem-text-primary)]">{c.full_name}</p>
                      <p className="text-xs text-[color:var(--sem-text-secondary)]">{c.phone}{c.email ? ` · ${c.email}` : ""}</p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {source === "existing_job" ? (
            <div className="space-y-3">
              <span className={labelClass}>Find job</span>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--sem-text-muted)]" />
                  <input
                    type="text"
                    className={`${inputClass} pl-10`}
                    placeholder="Job code, customer, phone, address (min 2 chars)"
                    value={jobQuery}
                    onChange={(e) => setJobQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleJobSearch(); } }}
                    disabled={busy}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleJobSearch}
                  disabled={busy || jobQuery.trim().length < 2}
                  className="theme-btn-secondary rounded-xl px-4 py-2 text-sm disabled:opacity-50"
                >
                  {jobSearchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                </button>
              </div>
              {selectedJob ? (
                <div className="rounded-xl border border-[color:var(--sem-state-success)] bg-[color:color-mix(in_srgb,var(--sem-state-success)_8%,transparent)] px-4 py-3 text-sm">
                  <p className="font-semibold text-[color:var(--sem-text-primary)]">{selectedJob.job_code}</p>
                  <p className="text-xs text-[color:var(--sem-text-secondary)]">{selectedJob.customer_name} · {selectedJob.customer_phone}</p>
                  <p className="text-xs text-[color:var(--sem-text-muted)]">{selectedJob.service_address}</p>
                </div>
              ) : null}
              {jobResults.length > 0 && !selectedJob ? (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {jobResults.map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => { setSelectedJob(j); setJobResults([]); setJobQuery(""); }}
                      className="theme-control-surface w-full rounded-xl px-4 py-3 text-left text-sm transition hover:border-[color:var(--cmp-border-accent)]"
                    >
                      <p className="font-medium text-[color:var(--sem-text-primary)]">{j.job_code}</p>
                      <p className="text-xs text-[color:var(--sem-text-secondary)]">{j.customer_name} · {j.customer_phone}</p>
                      <p className="text-xs text-[color:var(--sem-text-muted)]">{j.service_address}</p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {source === "new_customer" ? (
            <div className="space-y-4 rounded-2xl border border-[color:var(--cmp-border-subtle)] p-4">
              <span className={labelClass}>New customer details</span>
              <label className="block space-y-1.5">
                <span className={labelClass}>First name</span>
                <input type="text" className={inputClass} value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} disabled={busy} />
              </label>
              <label className="block space-y-1.5">
                <span className={labelClass}>Last name</span>
                <input type="text" className={inputClass} value={newLastName} onChange={(e) => setNewLastName(e.target.value)} disabled={busy} />
              </label>
              <label className="block space-y-1.5">
                <span className={labelClass}>Phone</span>
                <input type="tel" className={inputClass} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} disabled={busy} />
              </label>
              <label className="block space-y-1.5">
                <span className={labelClass}>Email (optional)</span>
                <input type="email" className={inputClass} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} disabled={busy} />
              </label>
              <label className="block space-y-1.5">
                <span className={labelClass}>Property address</span>
                <input type="text" className={inputClass} value={newPropertyAddress} onChange={(e) => setNewPropertyAddress(e.target.value)} disabled={busy} />
              </label>
            </div>
          ) : null}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[color:var(--sem-accent-primary)] px-6 py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 min-h-12"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <ClipboardList className="h-4 w-4" />
                  Create Inspection
                </>
              )}
            </button>
            <Link
              href="/home"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--cmp-border-subtle)] px-5 py-3.5 text-sm font-medium text-[color:var(--sem-text-secondary)] transition hover:bg-[color:var(--cmp-hover-surface)] min-h-12"
            >
              <ArrowLeft className="h-4 w-4" />
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </BoardShell>
  );
}
