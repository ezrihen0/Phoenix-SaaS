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

const fieldLabelClass = "text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]";

export function InspectionCreateModal(props: InspectionCreateModalProps) {
  if (!props.open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <section className="theme-surface-modal max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6 shadow-[0_36px_120px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--cmp-border-subtle)] pb-4">
          <div>
            <p className={fieldLabelClass}>New inspection</p>
            <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Create inspection record</h2>
          </div>
          <button type="button" className="theme-btn-ghost rounded-xl px-3 py-1 text-xs" onClick={props.onClose} disabled={props.createBusy}>
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className={fieldLabelClass}>Source</span>
            <select
              className="theme-input-control h-10 w-full rounded-xl px-3 text-sm"
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
            <span className={fieldLabelClass}>Report type</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {REPORT_TYPE_OPTIONS.map((option) => {
                const active = props.inspectionType === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={props.createBusy || !props.canManage}
                    onClick={() => props.onInspectionTypeChange(option.id)}
                    className={`rounded-xl border p-3 text-left transition ${active ? "theme-selected-card" : "theme-control-surface hover:border-[color:var(--cmp-border-accent)]"}`}
                  >
                    <p className="text-sm font-semibold">{option.label}</p>
                    <p className="mt-1 text-[11px] leading-5 text-[color:var(--sem-text-secondary)]">{option.helper}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-2">
            <p className="theme-control-surface rounded-xl px-3 py-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">
              {props.createSource === "internal_draft"
                ? "Internal Draft / Not Sendable. Generate and mark-sent stay blocked until conversion."
                : "Search and select by public references. Internal UUIDs stay hidden."}
            </p>
          </div>

          {props.createSource === "new_customer" ? (
            <>
              <label className="space-y-2">
                <span className={fieldLabelClass}>First Name</span>
                <input className="theme-input-control h-10 w-full rounded-xl px-3 text-sm" value={props.newFirstName} onChange={(e) => props.onNewFirstNameChange(e.target.value)} disabled={props.createBusy} />
              </label>
              <label className="space-y-2">
                <span className={fieldLabelClass}>Last Name</span>
                <input className="theme-input-control h-10 w-full rounded-xl px-3 text-sm" value={props.newLastName} onChange={(e) => props.onNewLastNameChange(e.target.value)} disabled={props.createBusy} />
              </label>
              <label className="space-y-2">
                <span className={fieldLabelClass}>Phone</span>
                <input className="theme-input-control h-10 w-full rounded-xl px-3 text-sm" value={props.newPhone} onChange={(e) => props.onNewPhoneChange(e.target.value)} disabled={props.createBusy} />
              </label>
              <label className="space-y-2">
                <span className={fieldLabelClass}>Email</span>
                <input className="theme-input-control h-10 w-full rounded-xl px-3 text-sm" value={props.newEmail} onChange={(e) => props.onNewEmailChange(e.target.value)} disabled={props.createBusy} />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className={fieldLabelClass}>Property Address</span>
                <input className="theme-input-control h-10 w-full rounded-xl px-3 text-sm" value={props.newPropertyAddress} onChange={(e) => props.onNewPropertyAddressChange(e.target.value)} disabled={props.createBusy} />
              </label>
            </>
          ) : null}

          {props.createSource === "existing_customer" ? (
            <>
              <label className="space-y-2 md:col-span-2">
                <span className={fieldLabelClass}>Customer Search</span>
                <input
                  className="theme-input-control h-10 w-full rounded-xl px-3 text-sm"
                  placeholder="Min 2 chars: name, phone, email"
                  value={props.customerQuery}
                  onChange={(e) => props.onCustomerQueryChange(e.target.value)}
                  disabled={props.createBusy}
                />
                {props.customerSearchBusy ? <p className="text-xs text-[color:var(--sem-text-secondary)]">Searching customers...</p> : null}
                {props.selectedCustomer ? (
                  <p className="theme-alert-success rounded-xl px-2 py-1 text-xs">
                    Selected: {props.selectedCustomer.full_name} · {props.selectedCustomer.phone}
                  </p>
                ) : null}
                <div className="max-h-[160px] space-y-1 overflow-auto">
                  {props.customerOptions.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      className="theme-control-surface w-full rounded-xl px-3 py-2 text-left text-xs hover:border-[color:var(--cmp-border-accent)]"
                      onClick={() => props.onSelectCustomer(customer)}
                    >
                      {customer.full_name} · {customer.phone}{customer.email ? ` · ${customer.email}` : ""}
                    </button>
                  ))}
                </div>
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className={fieldLabelClass}>Property Address (Optional Override)</span>
                <input className="theme-input-control h-10 w-full rounded-xl px-3 text-sm" value={props.propertyAddress} onChange={(e) => props.onPropertyAddressChange(e.target.value)} disabled={props.createBusy} />
              </label>
            </>
          ) : null}

          {props.createSource === "existing_job" ? (
            <label className="space-y-2 md:col-span-2">
              <span className={fieldLabelClass}>Job Search</span>
              <input
                className="theme-input-control h-10 w-full rounded-xl px-3 text-sm"
                placeholder="Min 2 chars: job code, customer, phone, address"
                value={props.jobQuery}
                onChange={(e) => props.onJobQueryChange(e.target.value)}
                disabled={props.createBusy}
              />
              {props.jobSearchBusy ? <p className="text-xs text-[color:var(--sem-text-secondary)]">Searching jobs...</p> : null}
              {props.selectedJob ? (
                <p className="theme-alert-success rounded-xl px-2 py-1 text-xs">
                  Selected Job Number: {props.selectedJob.job_code} · Invoice: {props.selectedJob.invoice_number}
                </p>
              ) : null}
              <div className="max-h-[180px] space-y-1 overflow-auto">
                {props.jobOptions.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    className="theme-control-surface w-full rounded-xl px-3 py-2 text-left text-xs hover:border-[color:var(--cmp-border-accent)]"
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
            <p className="theme-alert-warning md:col-span-2 rounded-xl border px-3 py-2 text-xs">
              Internal Draft / Not Sendable. Workspace and preview are available, but Generate/Mark sent stay blocked until conversion.
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="theme-btn-secondary rounded-xl px-4 py-2 text-sm" onClick={props.onClose} disabled={props.createBusy}>
            Cancel
          </button>
          <button
            type="button"
            className="theme-btn-primary rounded-2xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
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
