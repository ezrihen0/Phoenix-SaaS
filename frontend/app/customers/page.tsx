import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  ClipboardList,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";

import {
  MasterMobileList,
  MasterTable,
  MasterTablePagination,
  MasterTableRow,
  type MasterTableState,
} from "@/components/master-table";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireOfficeCrmRoute } from "@/lib/auth/server-session";
import { openJobStatuses } from "@/lib/crm/data";
import { formatAddress, formatDate } from "@/lib/crm/display";
import type { Database } from "@/lib/types/database";

type SearchParam = string | string[] | undefined;

type CustomersPageContext = {
  searchParams: Promise<{
    page?: SearchParam;
    pageSize?: SearchParam;
  }>;
};

type CustomerRecord = Database["public"]["Tables"]["customers"]["Row"];
type CustomerJobSummary = Pick<
  Database["public"]["Tables"]["jobs"]["Row"],
  | "id"
  | "customer_id"
  | "title"
  | "description"
  | "requested_service_type"
  | "status"
  | "scheduled_for"
  | "scheduled_window"
  | "created_at"
  | "updated_at"
>;

type CustomerListItem = CustomerRecord & {
  relatedJobs: CustomerJobSummary[];
};

const customerActionIconBaseClass = "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)]";
const customerOpenIconClass = `${customerActionIconBaseClass} bg-sky-600 hover:bg-sky-700`;
const customerJobIconClass = `${customerActionIconBaseClass} bg-orange-600 hover:bg-orange-700`;

function firstValue(value: SearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

function buildQueryString(params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim()) {
      searchParams.set(key, value);
    }
  }

  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
}

function activeJobCount(customer: CustomerListItem) {
  return customer.relatedJobs.filter((job) => openJobStatuses.includes(job.status)).length;
}

function customerStatusBadgeClass(openJobs: number) {
  if (openJobs > 0) {
    return "theme-status-warning inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }

  return "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
}

export default async function CustomersPage({ searchParams }: CustomersPageContext) {
  await requireOfficeCrmRoute("/customers");
  const resolvedSearchParams = await searchParams;
  const pageValue = Number.parseInt((firstValue(resolvedSearchParams.page) ?? "1").trim(), 10);
  const pageSizeValue = Number.parseInt((firstValue(resolvedSearchParams.pageSize) ?? "10").trim(), 10);
  const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const pageSize = Number.isFinite(pageSizeValue) && [10, 25, 50, 100].includes(pageSizeValue) ? pageSizeValue : 10;

  let customers: CustomerListItem[] = [];
  let relatedJobs: CustomerJobSummary[] = [];
  let loadError: string | null = null;

  try {
    customers = await serverApiFetch<CustomerListItem[]>("/api/customers");
    relatedJobs = customers.flatMap((customer) => customer.relatedJobs ?? []);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The customer list could not be loaded.";
  }

  const activeCustomerCount = customers.filter((customer) => customer.relatedJobs.some((job) => openJobStatuses.includes(job.status))).length;
  const totalCount = customers.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedCustomers = customers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const previousPageHref = buildQueryString({
    page: String(Math.max(1, currentPage - 1)),
    pageSize: String(pageSize),
  });
  const nextPageHref = buildQueryString({
    page: String(Math.min(totalPages, currentPage + 1)),
    pageSize: String(pageSize),
  });
  const tableState: MasterTableState = loadError
    ? { status: "error", message: "Customer list unavailable." }
    : totalCount === 0
      ? { status: "empty", message: "No customers have been created yet." }
      : { status: "ready" };

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_48%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_36%)]"
        />
        <div
          aria-hidden="true"
          className="absolute left-[-6rem] top-24 h-56 w-56 rounded-full bg-[color:var(--sem-accent-primary)]/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute right-[-3rem] top-14 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl"
        />

        <div className="relative mx-auto max-w-[88rem] px-6 py-14 lg:px-10">
          <section className="theme-surface-modal relative overflow-hidden rounded-[40px] border border-[color:var(--cmp-border-subtle)] p-7 shadow-[0_32px_90px_rgba(15,23,42,0.08)] sm:p-8 lg:p-10">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(14,165,233,0.45),transparent)]"
            />

            <div className="relative space-y-10">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl">
                  <div className="inline-flex items-center gap-3 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/85 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)] backdrop-blur">
                    <span className="h-2 w-2 rounded-full bg-[color:var(--sem-accent-primary)]" />
                    Customer workspace
                  </div>
                  <h1 className="mt-6 font-[family:var(--font-flat-display)] text-4xl leading-[0.95] tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl lg:text-6xl">
                    Customers
                  </h1>
                  <p className="mt-5 max-w-2xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                    Review contact details, service addresses, notes, and related jobs in the same ledger layout used by invoices.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3 text-xs text-[color:var(--sem-text-secondary)]">
                    <div className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2">
                      <span className="font-medium text-[color:var(--sem-text-primary)]">{totalCount}</span>
                      records in view
                    </div>
                    <div className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2">
                      <span className="font-medium text-[color:var(--sem-text-primary)]">{activeCustomerCount}</span>
                      with open jobs
                    </div>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-3 xl:max-w-sm xl:items-end">
                  <Link
                    href="/jobs"
                    className="theme-btn-secondary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)] xl:self-end"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to jobs
                  </Link>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="theme-surface-card relative overflow-hidden rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5 sm:p-6">
                  <div
                    aria-hidden="true"
                    className="absolute right-[-2rem] top-[-2rem] h-24 w-24 rounded-full bg-[color:var(--sem-accent-primary)]/10 blur-2xl"
                  />
                  <div className="relative">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Total customers</p>
                      <div className="rounded-full border border-[color:var(--cmp-border-subtle)] p-2 text-[color:var(--sem-accent-primary)]">
                        <UserRound className="h-4 w-4" />
                      </div>
                    </div>
                    <p className="mt-5 text-4xl font-semibold leading-none text-[color:var(--sem-text-primary)]">{customers.length}</p>
                    <p className="mt-3 text-sm text-[color:var(--sem-text-secondary)]">Full customer ledger currently visible in this workspace.</p>
                  </div>
                </div>

                <div className="theme-surface-card relative overflow-hidden rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5 sm:p-6">
                  <div
                    aria-hidden="true"
                    className="absolute left-[-1rem] top-[-2rem] h-24 w-24 rounded-full bg-[color:var(--sem-accent-primary)]/10 blur-2xl"
                  />
                  <div className="relative">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">With open jobs</p>
                      <div className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-accent-primary)]">
                        Active
                      </div>
                    </div>
                    <p className="mt-5 text-4xl font-semibold leading-none text-[color:var(--sem-text-primary)]">{activeCustomerCount}</p>
                    <p className="mt-3 text-sm text-[color:var(--sem-text-secondary)]">Customers with at least one open operational job.</p>
                  </div>
                </div>

                <div className="theme-surface-card relative overflow-hidden rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5 sm:p-6">
                  <div
                    aria-hidden="true"
                    className="absolute bottom-[-2rem] right-[-1rem] h-24 w-24 rounded-full bg-[color:var(--sem-accent-primary)]/10 blur-2xl"
                  />
                  <div className="relative">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Related jobs</p>
                      <div className="rounded-full border border-[color:var(--cmp-border-subtle)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-secondary)]">
                        Linked
                      </div>
                    </div>
                    <p className="mt-5 text-4xl font-semibold leading-none text-[color:var(--sem-text-primary)]">{relatedJobs.length}</p>
                    <p className="mt-3 text-sm text-[color:var(--sem-text-secondary)]">Total jobs linked to the visible customer records.</p>
                  </div>
                </div>
              </div>

              {loadError ? (
                <div className="theme-alert-error rounded-[24px] border px-5 py-4 text-sm shadow-sm">
                  {loadError}
                </div>
              ) : null}

              {totalCount ? (
                <div className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/96 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.05)] sm:p-5">
                  <style
                    dangerouslySetInnerHTML={{
                      __html: `
                        .customer-display-panel .master-table {
                          table-layout: fixed;
                        }
                        .customer-display-panel .master-table-header-cell,
                        .customer-display-panel .master-table-cell {
                          border-right: 1px solid var(--cmp-border-subtle);
                          vertical-align: middle;
                        }
                        .customer-display-panel .master-table-header-cell:nth-child(1),
                        .customer-display-panel .master-table-cell:nth-child(1) {
                          width: 9rem;
                          text-align: center;
                        }
                        .customer-display-panel .master-table-header-cell:nth-child(2),
                        .customer-display-panel .master-table-cell:nth-child(2) {
                          text-align: center;
                        }
                        .customer-display-panel .master-table-header-cell:nth-child(3),
                        .customer-display-panel .master-table-cell:nth-child(3),
                        .customer-display-panel .master-table-header-cell:nth-child(4),
                        .customer-display-panel .master-table-cell:nth-child(4) {
                          width: 13rem;
                          text-align: center;
                        }
                        .customer-display-panel .master-table-header-cell:nth-child(5),
                        .customer-display-panel .master-table-cell:nth-child(5),
                        .customer-display-panel .master-table-header-cell:nth-child(6),
                        .customer-display-panel .master-table-cell:nth-child(6),
                        .customer-display-panel .master-table-header-cell:nth-child(7),
                        .customer-display-panel .master-table-cell:nth-child(7) {
                          width: 10rem;
                          text-align: center;
                        }
                        .customer-display-panel .master-table-header-cell:last-child,
                        .customer-display-panel .master-table-cell:last-child {
                          border-right: 0;
                        }
                      `,
                    }}
                  />
                  <div className="mb-5 flex flex-col gap-3 border-b border-[color:var(--cmp-border-subtle)] pb-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Customer workspace</p>
                      <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                        Use the action icons to open a customer record or create a linked job while keeping the ledger compact.
                      </p>
                    </div>
                    <div className="theme-control-surface inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-xs text-[color:var(--sem-text-secondary)] sm:self-auto">
                      <span className="font-medium text-[color:var(--sem-text-primary)]">{totalCount}</span>
                      total records
                    </div>
                  </div>

                  <div className="customer-display-panel hidden lg:block">
                    <MasterTable
                      columns={[
                        { key: "actions", label: "Actions", align: "center" },
                        { key: "customer", label: "Customer Name", align: "center" },
                        { key: "phone", label: "Phone", align: "center" },
                        { key: "email", label: "Email", align: "center" },
                        { key: "openJobs", label: "Open Jobs", align: "center" },
                        { key: "totalJobs", label: "Total Jobs", align: "center" },
                        { key: "updated", label: "Updated", align: "center" },
                      ]}
                      state={tableState}
                    >
                      {pagedCustomers.map((customer) => {
                        const openJobs = activeJobCount(customer);

                        return (
                          <MasterTableRow key={customer.id}>
                            <td className="master-table-cell master-table-actions-cell align-middle">
                              <div className="flex items-center justify-center gap-2">
                                <Link
                                  href={`/customers/${customer.id}`}
                                  title="Open customer"
                                  aria-label="Open customer"
                                  className={customerOpenIconClass}
                                >
                                  <UserRound className="h-[0.8rem] w-[0.8rem]" />
                                </Link>
                                <Link
                                  href={`/jobs/new?customerId=${customer.id}`}
                                  title="Create job"
                                  aria-label="Create job"
                                  className={customerJobIconClass}
                                >
                                  <Briefcase className="h-[0.8rem] w-[0.8rem]" />
                                </Link>
                              </div>
                            </td>
                            <td className="master-table-cell text-center">
                              <p className="font-semibold text-[color:var(--sem-text-primary)]">{customer.full_name}</p>
                              <p className="mt-1 truncate text-xs text-[color:var(--sem-text-muted)]">
                                {formatAddress(
                                  customer.service_address_line_1,
                                  customer.service_address_line_2,
                                  customer.service_city,
                                  customer.service_state_or_region,
                                  customer.service_postal_code,
                                )}
                              </p>
                            </td>
                            <td className="master-table-cell text-center">
                              <a href={`tel:${customer.phone}`} className="whitespace-nowrap font-medium text-[color:var(--sem-text-primary)] transition hover:text-[color:var(--sem-accent-primary)]">
                                {customer.phone}
                              </a>
                            </td>
                            <td className="master-table-cell text-center">
                              {customer.email ? (
                                <a href={`mailto:${customer.email}`} className="truncate text-[color:var(--sem-text-primary)] transition hover:text-[color:var(--sem-accent-primary)]">
                                  {customer.email}
                                </a>
                              ) : (
                                <span className="text-[color:var(--sem-text-muted)]">No email</span>
                              )}
                            </td>
                            <td className="master-table-cell text-center">
                              <span className={customerStatusBadgeClass(openJobs)}>
                                {openJobs}
                              </span>
                            </td>
                            <td className="master-table-cell text-center font-medium text-[color:var(--sem-text-primary)]">
                              {customer.relatedJobs.length}
                            </td>
                            <td className="master-table-cell text-center">
                              <span className="whitespace-nowrap">{formatDate(customer.updated_at)}</span>
                            </td>
                          </MasterTableRow>
                        );
                      })}
                    </MasterTable>
                  </div>

                  <div className="lg:hidden">
                    <MasterMobileList
                      items={pagedCustomers}
                      emptyState="No customers have been created yet."
                      renderItem={(customer) => {
                        const openJobs = activeJobCount(customer);

                        return (
                          <article key={customer.id} className="master-mobile-card theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-subtle)] p-4 text-sm text-[color:var(--sem-text-secondary)] shadow-[0_18px_34px_rgba(15,23,42,0.04)]">
                            <div className="space-y-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-[color:var(--sem-text-primary)]">{customer.full_name}</p>
                                  <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">{formatDate(customer.updated_at)}</p>
                                </div>
                                <span className={customerStatusBadgeClass(openJobs)}>{openJobs} open</span>
                              </div>
                              <div className="grid gap-2">
                                <span className="inline-flex items-start gap-2">
                                  <Phone className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                                  {customer.phone}
                                </span>
                                <span className="inline-flex items-start gap-2">
                                  <Mail className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                                  {customer.email ?? "No email"}
                                </span>
                                <span className="inline-flex items-start gap-2">
                                  <MapPin className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                                  {formatAddress(
                                    customer.service_address_line_1,
                                    customer.service_address_line_2,
                                    customer.service_city,
                                    customer.service_state_or_region,
                                    customer.service_postal_code,
                                  )}
                                </span>
                              </div>
                              <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)]/60 px-4 py-3">
                                <p className="inline-flex items-start gap-2">
                                  <ClipboardList className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                                  <span className="whitespace-pre-line">{customer.notes?.trim() || "No customer notes yet."}</span>
                                </p>
                                <p className="mt-3 text-xs text-[color:var(--sem-text-muted)]">
                                  {customer.relatedJobs.length} total linked job{customer.relatedJobs.length === 1 ? "" : "s"}
                                </p>
                              </div>
                              <div className="border-t border-[color:var(--cmp-border-subtle)] pt-3">
                                <div className="flex items-center justify-center gap-2">
                                  <Link
                                    href={`/customers/${customer.id}`}
                                    title="Open customer"
                                    aria-label="Open customer"
                                    className={customerOpenIconClass}
                                  >
                                    <UserRound className="h-[0.8rem] w-[0.8rem]" />
                                  </Link>
                                  <Link
                                    href={`/jobs/new?customerId=${customer.id}`}
                                    title="Create job"
                                    aria-label="Create job"
                                    className={customerJobIconClass}
                                  >
                                    <Briefcase className="h-[0.8rem] w-[0.8rem]" />
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      }}
                    />
                  </div>
                </div>
              ) : loadError ? null : (
                <div className="theme-surface-card rounded-[30px] border border-dashed border-[color:var(--cmp-border-subtle)] px-6 py-10 text-center text-sm text-[color:var(--sem-text-secondary)]">
                  <div className="mx-auto flex max-w-md flex-col items-center">
                    <div className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-3 text-[color:var(--sem-accent-primary)]">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Customer workspace</p>
                    <p className="mt-3 text-base font-medium text-[color:var(--sem-text-primary)]">No customers have been created yet.</p>
                    <p className="mt-2 leading-7">
                      Create a customer from the job workflow to populate this workspace.
                    </p>
                  </div>
                </div>
              )}

              <div className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3">
                <MasterTablePagination
                  page={currentPage}
                  pageSize={pageSize}
                  totalCount={totalCount}
                  totalPages={totalPages}
                  previousHref={previousPageHref}
                  nextHref={nextPageHref}
                />
              </div>

              {activeCustomerCount ? (
                <p className="text-xs text-[color:var(--sem-text-muted)]">{activeCustomerCount} customers currently have open jobs.</p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
