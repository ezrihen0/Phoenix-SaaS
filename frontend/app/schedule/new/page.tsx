import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarPlus, Search, UserRound, UserRoundPlus } from "lucide-react";

import { requireOfficeCrmRoute } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { buildCustomerCreateHref } from "@/lib/crm/customer-create-return";
import type { Database } from "@/lib/types/database";

type SearchParam = string | string[] | undefined;

type ScheduleNewJobPageContext = {
  searchParams: Promise<{
    customerId?: SearchParam;
    mode?: SearchParam;
    q?: SearchParam;
  }>;
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

export default async function ScheduleNewJobPage({ searchParams }: ScheduleNewJobPageContext) {
  await requireOfficeCrmRoute("/schedule/new");

  const resolvedSearchParams = await searchParams;
  const customerId = (firstValue(resolvedSearchParams.customerId) ?? "").trim();
  const mode = (firstValue(resolvedSearchParams.mode) ?? "").trim();
  const query = (firstValue(resolvedSearchParams.q) ?? "").trim();

  if (customerId) {
    redirect(`/jobs/new?customerId=${encodeURIComponent(customerId)}`);
  }

  const showExistingPicker = mode === "existing";

  if (!showExistingPicker) {
    return (
      <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
        <div className="mx-auto max-w-4xl px-6 py-10 lg:px-10">
          <section className="theme-surface-modal rounded-[36px] p-7 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">Schedule Job</p>
                <h1 className="mt-4 max-w-2xl font-[family:var(--font-flat-display)] text-3xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-4xl lg:text-5xl">
                  Schedule a new job
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                  Start with a new or existing customer, then continue into job intake and scheduling without repeating customer setup.
                </p>
              </div>
              <Link
                href="/schedule"
                className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to schedule
              </Link>
            </div>
          </section>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Link
              href="/schedule/new?mode=existing"
              className="theme-surface-modal group flex flex-col rounded-[32px] border border-[color:var(--cmp-border-subtle)] p-6 transition hover:border-[color:var(--cmp-border-accent)]"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
                <UserRound className="h-6 w-6" />
              </span>
              <h2 className="mt-5 font-[family:var(--font-flat-display)] text-2xl tracking-tight text-[color:var(--sem-text-primary)]">
                Existing customer
              </h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                Search your customer list, pick the account, and open job intake with their details prefilled.
              </p>
              <span className="theme-btn-primary mt-6 inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition group-hover:opacity-95">
                Choose customer
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>

            <Link
              href={buildCustomerCreateHref("/jobs/new")}
              className="theme-surface-modal group flex flex-col rounded-[32px] border border-[color:var(--cmp-border-subtle)] p-6 transition hover:border-[color:var(--cmp-border-accent)]"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
                <UserRoundPlus className="h-6 w-6" />
              </span>
              <h2 className="mt-5 font-[family:var(--font-flat-display)] text-2xl tracking-tight text-[color:var(--sem-text-primary)]">
                New customer
              </h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                Add a customer record first, then return here to job intake with the new account already linked.
              </p>
              <span className="theme-btn-secondary mt-6 inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition group-hover:opacity-95">
                Create customer
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

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
              <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">Schedule Job</p>
              <h1 className="mt-4 max-w-3xl font-[family:var(--font-flat-display)] text-2xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-3xl lg:text-4xl">
                Choose an existing customer
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                Select the customer for this visit. You will continue to job intake with their profile and service address loaded.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/schedule/new"
                className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Change choice
              </Link>
              <Link
                href={buildCustomerCreateHref("/jobs/new")}
                className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition"
              >
                <UserRoundPlus className="h-4 w-4" />
                New customer
              </Link>
            </div>
          </div>
        </section>

        <section className="theme-surface-modal mt-6 overflow-x-auto rounded-[32px] p-4 sm:p-6">
          <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end" method="get">
            <input type="hidden" name="mode" value="existing" />
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

          <div className="crm-table-frame mt-6 overflow-x-auto">
            <table className="crm-table text-left text-sm">
              <thead className="bg-[color:var(--cmp-surface-card)] text-xs uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                <tr>
                  <th className="px-5 py-4">Customer</th>
                  <th className="hidden px-5 py-4 sm:table-cell">Contact</th>
                  <th className="hidden px-5 py-4 md:table-cell">Location</th>
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
                      <p className="mt-0.5 text-xs text-[color:var(--sem-text-secondary)] sm:hidden">{customer.phone}</p>
                    </td>
                    <td className="hidden px-5 py-4 text-[color:var(--sem-text-secondary)] sm:table-cell">
                      <p>{customer.phone}</p>
                      <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{customer.email ?? "No email"}</p>
                    </td>
                    <td className="hidden px-5 py-4 text-[color:var(--sem-text-secondary)] md:table-cell">
                      {[customer.service_city, customer.service_state_or_region].filter(Boolean).join(", ") || "Address pending"}
                    </td>
                    <td className="px-5 py-4 text-[color:var(--sem-text-secondary)]">{customer.relatedJobCount}</td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/jobs/new?customerId=${encodeURIComponent(customer.id)}`}
                        className="theme-btn-primary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition"
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

        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-[color:var(--sem-text-muted)]">
          <CalendarPlus className="h-3.5 w-3.5" />
          Job intake opens on the standard new job workspace after customer selection.
        </p>
      </div>
    </main>
  );
}
