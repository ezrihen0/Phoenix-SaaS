"use client";

import type {
  InspectionCustomerSearchRow,
  InspectionJobSearchRow,
} from "@/lib/inspections/browser-api";

export type InspectionSource = "new_customer" | "existing_customer" | "existing_job" | "internal_draft";
export type InspectionType = "standard" | "wett" | "gas";

type InspectionCreateModalProps = {
  open: boolean;
  createBusy: boolean;
  createSource: InspectionSource;
  inspectionType: InspectionType;
  propertyAddress: string;
  newFirstName: string;
  newLastName: string;
  newPhone: string;
  newEmail: string;
  newPropertyAddress: string;
  customerQuery: string;
  customerOptions: InspectionCustomerSearchRow[];
  customerSearchBusy: boolean;
  selectedCustomer: InspectionCustomerSearchRow | null;
  jobQuery: string;
  jobOptions: InspectionJobSearchRow[];
  jobSearchBusy: boolean;
  selectedJob: InspectionJobSearchRow | null;
  canManage: boolean;
  onClose: () => void;
  onCreate: () => void;
  onCreateSourceChange: (source: InspectionSource) => void;
  onInspectionTypeChange: (type: InspectionType) => void;
  onPropertyAddressChange: (value: string) => void;
  onNewFirstNameChange: (value: string) => void;
  onNewLastNameChange: (value: string) => void;
  onNewPhoneChange: (value: string) => void;
  onNewEmailChange: (value: string) => void;
  onNewPropertyAddressChange: (value: string) => void;
  onCustomerQueryChange: (value: string) => void;
  onSelectCustomer: (customer: InspectionCustomerSearchRow) => void;
  onJobQueryChange: (value: string) => void;
  onSelectJob: (job: InspectionJobSearchRow) => void;
};

const REPORT_TYPE_OPTIONS: Array<{ id: InspectionType; label: string; helper: string }> = [
  { id: "standard", label: "Standard", helper: "Wood burning fireplace safety workflow" },
  { id: "wett", label: "WETT Site Basic", helper: "Compliance workflow with mandatory fields" },
  { id: "gas", label: "Gas", helper: "Gas fireplace simplified workflow" },
];

export function InspectionCreateModal(props: InspectionCreateModalProps) {
  if (!props.open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4">
      <section className="max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-[22px] border border-zinc-200 bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">New inspection</p>
            <h2 className="text-lg font-semibold text-zinc-950">Create inspection record</h2>
          </div>
          <button
            type="button"
            className="rounded-xl border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
            onClick={props.onClose}
            disabled={props.createBusy}
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Source</span>
            <select
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-400"
              value={props.createSource}
              onChange={(event) => props.onCreateSourceChange(event.target.value as InspectionSource)}
              disabled={props.createBusy || !props.canManage}
            >
              <option value="new_customer">New Customer</option>
              <option value="existing_customer">Existing Customer</option>
              <option value="existing_job">Existing Job</option>
              <option value="internal_draft">Internal Draft</option>
            </select>
          </label>

          <div className="space-y-2 md:col-span-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Report type</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {REPORT_TYPE_OPTIONS.map((option) => {
                const active = props.inspectionType === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={props.createBusy || !props.canManage}
                    onClick={() => props.onInspectionTypeChange(option.id)}
                    className={`rounded-xl border p-3 text-left transition ${active ? "border-zinc-900 bg-zinc-950 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300"}`}
                  >
                    <p className="text-sm font-semibold">{option.label}</p>
                    <p className={`mt-1 text-[11px] leading-5 ${active ? "text-zinc-300" : "text-zinc-500"}`}>{option.helper}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-2">
            <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600">
              {props.createSource === "internal_draft"
                ? "Internal Draft / Not Sendable. Generate and mark-sent stay blocked until conversion."
                : "Search and select by public references. Internal UUIDs stay hidden."}
            </p>
          </div>

          {props.createSource === "new_customer" ? (
            <>
              <label className="space-y-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">First Name</span>
                <input className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm" value={props.newFirstName} onChange={(e) => props.onNewFirstNameChange(e.target.value)} disabled={props.createBusy} />
              </label>
              <label className="space-y-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Last Name</span>
                <input className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm" value={props.newLastName} onChange={(e) => props.onNewLastNameChange(e.target.value)} disabled={props.createBusy} />
              </label>
              <label className="space-y-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Phone</span>
                <input className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm" value={props.newPhone} onChange={(e) => props.onNewPhoneChange(e.target.value)} disabled={props.createBusy} />
              </label>
              <label className="space-y-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Email</span>
                <input className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm" value={props.newEmail} onChange={(e) => props.onNewEmailChange(e.target.value)} disabled={props.createBusy} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Property Address</span>
                <input className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm" value={props.newPropertyAddress} onChange={(e) => props.onNewPropertyAddressChange(e.target.value)} disabled={props.createBusy} />
              </label>
            </>
          ) : null}

          {props.createSource === "existing_customer" ? (
            <>
              <label className="space-y-2 md:col-span-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Customer Search</span>
                <input
                  className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm"
                  placeholder="Min 2 chars: name, phone, email"
                  value={props.customerQuery}
                  onChange={(e) => props.onCustomerQueryChange(e.target.value)}
                  disabled={props.createBusy}
                />
                {props.customerSearchBusy ? <p className="text-xs text-zinc-500">Searching customers...</p> : null}
                {props.selectedCustomer ? (
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                    Selected: {props.selectedCustomer.full_name} · {props.selectedCustomer.phone}
                  </p>
                ) : null}
                <div className="max-h-[160px] space-y-1 overflow-auto">
                  {props.customerOptions.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs hover:bg-zinc-100"
                      onClick={() => props.onSelectCustomer(customer)}
                    >
                      {customer.full_name} · {customer.phone}{customer.email ? ` · ${customer.email}` : ""}
                    </button>
                  ))}
                </div>
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Property Address (Optional Override)</span>
                <input className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm" value={props.propertyAddress} onChange={(e) => props.onPropertyAddressChange(e.target.value)} disabled={props.createBusy} />
              </label>
            </>
          ) : null}

          {props.createSource === "existing_job" ? (
            <label className="space-y-2 md:col-span-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Job Search</span>
              <input
                className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm"
                placeholder="Min 2 chars: job code, customer, phone, address"
                value={props.jobQuery}
                onChange={(e) => props.onJobQueryChange(e.target.value)}
                disabled={props.createBusy}
              />
              {props.jobSearchBusy ? <p className="text-xs text-zinc-500">Searching jobs...</p> : null}
              {props.selectedJob ? (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                  Selected Job Number: {props.selectedJob.job_code} · Invoice: {props.selectedJob.invoice_number}
                </p>
              ) : null}
              <div className="max-h-[180px] space-y-1 overflow-auto">
                {props.jobOptions.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs hover:bg-zinc-100"
                    onClick={() => props.onSelectJob(job)}
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

          {props.createSource === "internal_draft" ? (
            <p className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Internal Draft / Not Sendable. Workspace and preview are available, but Generate/Mark sent stay blocked until conversion.
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50" onClick={props.onClose} disabled={props.createBusy}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            onClick={props.onCreate}
            disabled={props.createBusy || !props.canManage}
          >
            {props.createBusy ? "Creating..." : "Create inspection"}
          </button>
        </div>
      </section>
    </div>
  );
}
