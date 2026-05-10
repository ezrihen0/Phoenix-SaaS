import Link from "next/link";
import { ArrowLeft, ArrowRight, Receipt, Search, UserRound } from "lucide-react";

import { requireServerRoles } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { getJobStatusLabel, type JobStatus } from "@/lib/crm/statuses";
import type { Database } from "@/lib/types/database";

type SearchParam = string | string[] | undefined;

type NewInvoicePageContext = {
  searchParams: Promise<{
    customerId?: SearchParam;
    q?: SearchParam;
  }>;
};

type CustomerRecord = Pick<
  Database["public"]["Tables"]["customers"]["Row"],
  "id" | "full_name" | "email" | "phone" | "service_city" | "service_state_or_region"
>;

type RelatedJobRecord = Pick<
  Database["public"]["Tables"]["jobs"]["Row"],
  "id" | "title" | "status" | "scheduled_for" | "updated_at"
> & {
  technician?: {
    display_name: string;
  } | null;
};

type CustomerDetailResponse = {
  customer: CustomerRecord;
  relatedJobs: RelatedJobRecord[];
};

type InvoiceLifecycleStatus = "sent" | "partial" | "paid" | "refunded" | "overpaid";

type InvoiceListItem = {
  id: string;
  job_id: string;
  document_number: string;
  lifecycle_status: InvoiceLifecycleStatus;
  total_cents: number;
  amount_paid_cents: number;
  refunded_cents?: number;
  balance_cents: number;
  status: "unpaid" | "paid";
  issued_at: string;
  paid_at: string | null;
};

type CustomerListItem = Pick<
  Database["public"]["Tables"]["customers"]["Row"],
  "id" | "full_name" | "phone" | "email" | "service_city" | "service_state_or_region"
> & {
  relatedJobCount: number;
};

type CustomersListResponse = {
  items: CustomerListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

function firstValue(value: SearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatInvoiceLifecycle(status: InvoiceLifecycleStatus) {
  if (status === "partial") {
    return "Partial";
  }

  if (status === "refunded") {
    return "Refunded";
  }

  if (status === "overpaid") {
    return "Overpaid";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function invoiceLifecycleClass(status: InvoiceLifecycleStatus) {
  if (status === "partial" || status === "refunded") {
    return "theme-status-warning inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }

  if (status === "paid" || status === "overpaid") {
    return "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }

  return "theme-badge inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
}

function buildCustomerQuery(q: string) {
  const params = new URLSearchParams({
    paginate: "true",
    page: "1",
    pageSize: "24",
  });

  if (q.trim()) {
    params.set("q", q.trim());
  }

  return params.toString();
}

export default async function NewInvoicePage({ searchParams }: NewInvoicePageContext) {
  await requireServerRoles("/invoices/new", ["owner", "office_admin", "technician"]);

  const resolvedSearchParams = await searchParams;
  const customerId = (firstValue(resolvedSearchParams.customerId) ?? "").trim();
  const query = (firstValue(resolvedSearchParams.q) ?? "").trim();

  if (!customerId) {
    let customers: CustomerListItem[] = [];
    let loadError: string | null = null;

    try {
      const result = await serverApiFetch<CustomersListResponse>(`/api/customers?${buildCustomerQuery(query)}`);
      customers = result.items;
    } catch (error) {
      loadError = error instanceof Error ? error.message : "The customer list could not be loaded.";
    }

    return (
      <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
        <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
          <section className="theme-surface-modal rounded-[36px] p-7 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">Create Invoice</p>
                <h1 className="mt-4 max-w-3xl font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                  Choose a customer first.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                  Select a customer, then choose the job where you want to create or update an invoice.
                </p>
              </div>
              <Link
                href="/invoices"
                className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to invoices
              </Link>
            </div>
          </section>

          <section className="theme-surface-modal mt-6 rounded-[32px] p-6">
            <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end" method="get">
              <label className="space-y-2">
                <span className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Search customer</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--sem-text-muted)]" />
                  <input
                    name="q"
                    defaultValue={query}
                    placeholder="Name, email, phone"
                    className="theme-input-control w-full rounded-[18px] py-3 pl-11 pr-4 text-sm transition placeholder:text-[color:var(--sem-text-muted)]"
                  />
                </div>
              </label>

              <button
                type="submit"
                className="theme-btn-secondary h-[46px] rounded-[18px] px-5 text-sm font-medium transition"
              >
                Search
              </button>
            </form>

            {loadError ? (
              <div className="theme-alert-error mt-5 rounded-[22px] px-4 py-3 text-sm">
                {loadError}
              </div>
            ) : null}

            <div className="crm-table-frame mt-6">
              <table className="crm-table text-left text-sm">
                <thead className="bg-[color:var(--cmp-surface-card)] text-xs uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                  <tr>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">Contact</th>
                    <th className="px-5 py-4">Location</th>
                    <th className="px-5 py-4">Jobs</th>
                    <th className="px-5 py-4 text-right">Select</th>
                  </tr>
                </thead>
                <tbody className="bg-[color:var(--cmp-surface-panel)]">
                  {customers.length ? customers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-[color:var(--cmp-surface-panel)]">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[color:var(--sem-text-primary)]">{customer.full_name}</p>
                        <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">#{customer.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-5 py-4 text-[color:var(--sem-text-secondary)]">
                        <p>{customer.phone}</p>
                        <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{customer.email ?? "No email"}</p>
                      </td>
                      <td className="px-5 py-4 text-[color:var(--sem-text-secondary)]">
                        {[customer.service_city, customer.service_state_or_region].filter(Boolean).join(", ") || "Address pending"}
                      </td>
                      <td className="px-5 py-4 text-[color:var(--sem-text-secondary)]">{customer.relatedJobCount}</td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/invoices/new?customerId=${encodeURIComponent(customer.id)}`}
                          className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] transition"
                        >
                          Continue
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-sm text-[color:var(--sem-text-muted)]">
                        {loadError ? "Customers unavailable." : "No customers matched your search."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    );
  }

  let detail: CustomerDetailResponse | null = null;
  let customerInvoices: InvoiceListItem[] = [];
  let loadError: string | null = null;

  try {
    detail = await serverApiFetch<CustomerDetailResponse>(`/api/customers/${customerId}`);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The selected customer could not be loaded.";
  }

  if (detail) {
    try {
      customerInvoices = await serverApiFetch<InvoiceListItem[]>(`/api/invoices?customerId=${encodeURIComponent(customerId)}`);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Customer invoices could not be loaded.";
    }
  }

  const customer = detail?.customer ?? null;
  const relatedJobs = detail?.relatedJobs ?? [];
  const invoiceByJobId = new Map(customerInvoices.map((invoice) => [invoice.job_id, invoice]));
  const balanceDueCents = customerInvoices.reduce((sum, invoice) => sum + invoice.balance_cents, 0);

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
        <section className="theme-surface-modal rounded-[36px] p-7 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">Create Invoice</p>
              <h1 className="mt-4 max-w-3xl font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                {customer ? customer.full_name : "Select a customer"}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                Choose a customer job, then open the invoice section to create or update billing.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/invoices"
                className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to invoices
              </Link>
              <Link
                href="/invoices/new"
                className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)]"
              >
                Switch customer
              </Link>
            </div>
          </div>

          {customer ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <article className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Jobs</p>
                <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{relatedJobs.length}</p>
              </article>
              <article className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Invoices</p>
                <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{customerInvoices.length}</p>
              </article>
              <article className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Balance Due</p>
                <p className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(balanceDueCents)}</p>
              </article>
            </div>
          ) : null}
        </section>

        <section className="theme-surface-modal mt-6 rounded-[32px] p-6">
          {loadError ? (
            <div className="theme-alert-error rounded-[22px] px-4 py-3 text-sm">
              {loadError}
            </div>
          ) : null}

          <div className="crm-table-frame">
            <table className="crm-table text-left text-sm">
              <thead className="bg-[color:var(--cmp-surface-card)] text-xs uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                <tr>
                  <th className="px-5 py-4">Job</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Scheduled</th>
                  <th className="px-5 py-4">Invoice</th>
                  <th className="px-5 py-4">Balance</th>
                  <th className="px-5 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="bg-[color:var(--cmp-surface-panel)]">
                {relatedJobs.length ? relatedJobs.map((job) => {
                  const jobInvoice = invoiceByJobId.get(job.id);
                  const jobStatus = job.status as JobStatus;

                  return (
                    <tr key={job.id} className="hover:bg-[color:var(--cmp-surface-panel)]">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[color:var(--sem-text-primary)]">{job.title}</p>
                        <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">#{job.id.slice(0, 8)}{job.technician?.display_name ? ` · ${job.technician.display_name}` : ""}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
                          {getJobStatusLabel(jobStatus)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[color:var(--sem-text-secondary)]">{formatDateTime(job.scheduled_for)}</td>
                      <td className="px-5 py-4">
                        {jobInvoice ? (
                          <div className="space-y-2">
                            <p className="text-xs text-[color:var(--sem-text-secondary)]">{jobInvoice.document_number}</p>
                            <span className={invoiceLifecycleClass(jobInvoice.lifecycle_status)}>
                              {formatInvoiceLifecycle(jobInvoice.lifecycle_status)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-[color:var(--sem-text-muted)]">
                            <Receipt className="h-4 w-4" />
                            <span className="text-xs">No invoice yet</span>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-[color:var(--sem-text-secondary)]">
                        {jobInvoice ? formatCurrency(jobInvoice.balance_cents) : "-"}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={jobInvoice ? `/invoices/${jobInvoice.id}` : `/jobs/${job.id}`}
                          className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] transition"
                        >
                          {jobInvoice ? "Open Invoice" : "Create Invoice"}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-[color:var(--sem-text-muted)]">
                      No jobs found for this customer. Create a job first, then return to invoice setup.
                      <div className="mt-4">
                        <Link
                          href={`/jobs/new?customerId=${encodeURIComponent(customerId)}`}
                          className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] transition"
                        >
                          <UserRound className="h-3.5 w-3.5" />
                          Create Job
                        </Link>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
