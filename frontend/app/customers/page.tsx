import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowLeft,
  Briefcase,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Search,
  UserRound,
  UsersRound,
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
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireOfficeCrmRoute } from "@/lib/auth/server-session";
import { openJobStatuses } from "@/lib/crm/data";
import { formatAddress, formatDate } from "@/lib/crm/display";
import type { Database } from "@/lib/types/database";

const SHOW_LEGACY_CUSTOMERS_LIST = false;

type SearchParam = string | string[] | undefined;

type CustomerSegment = "all" | "company" | "individual";

type CustomersPageContext = {
  searchParams: Promise<{
    page?: SearchParam;
    pageSize?: SearchParam;
    q?: SearchParam;
    segment?: SearchParam;
    region?: SearchParam;
  }>;
};

type CustomerRecord = Database["public"]["Tables"]["customers"]["Row"];
type CustomerLifecycleStatus = Database["public"]["Enums"]["customer_lifecycle_status"];
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

type CityOption = {
  key: string;
  label: string;
  count: number;
};

const customerActionIconBaseClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cmp-focus-ring)]";
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

function normalizeCityKey(city: string) {
  return city.trim().toLowerCase();
}

function hasCompanyOnFile(customer: CustomerListItem) {
  return Boolean(customer.company_name?.trim());
}

function activeJobCount(customer: CustomerListItem) {
  return customer.relatedJobs.filter((job) => openJobStatuses.includes(job.status)).length;
}

function isNewThisMonth(createdAt: string) {
  const created = new Date(createdAt);
  const now = new Date();
  return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
}

function customerMatchesSearch(customer: CustomerListItem, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    customer.full_name,
    customer.company_name ?? "",
    customer.phone,
    customer.email ?? "",
    customer.service_address_line_1,
    customer.service_address_line_2 ?? "",
    customer.service_city,
    customer.service_state_or_region ?? "",
    customer.service_postal_code,
    customer.notes ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function resolveCustomerLifecycleStatus(customer: CustomerListItem): CustomerLifecycleStatus {
  if (
    customer.lifecycle_status === "prospect" ||
    customer.lifecycle_status === "active" ||
    customer.lifecycle_status === "past" ||
    customer.lifecycle_status === "archived"
  ) {
    return customer.lifecycle_status;
  }

  return activeJobCount(customer) > 0 ? "active" : "past";
}

function customerLifecycleBadgeClass(status: CustomerLifecycleStatus) {
  if (status === "prospect") {
    return "theme-status-warning inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }

  if (status === "active") {
    return "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }

  if (status === "past") {
    return "theme-control-surface inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]";
  }

  return "theme-alert-error inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
}

function customerLifecycleLabel(status: CustomerLifecycleStatus) {
  if (status === "prospect") {
    return "Prospect";
  }

  if (status === "active") {
    return "Active";
  }

  if (status === "past") {
    return "Past";
  }

  return "Archived";
}

function getCustomerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function buildCityOptions(customers: CustomerListItem[]): CityOption[] {
  const cityMap = new Map<string, CityOption>();

  for (const customer of customers) {
    const city = customer.service_city.trim();
    if (!city) {
      continue;
    }

    const key = normalizeCityKey(city);
    const existing = cityMap.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }

    cityMap.set(key, { key, label: city, count: 1 });
  }

  return Array.from(cityMap.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function parseSegment(value: string | undefined): CustomerSegment {
  if (value === "company" || value === "individual") {
    return value;
  }
  return "all";
}

function segmentFilterClass(active: boolean) {
  return active
    ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-selected-surface)] text-[color:var(--sem-accent-primary)] shadow-[0_0_24px_color-mix(in_srgb,var(--sem-accent-primary)_15%,transparent)]"
    : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] hover:bg-[color:var(--cmp-surface-soft)] hover:text-[color:var(--sem-text-primary)]";
}

function companyBadgeClass(hasCompany: boolean) {
  return hasCompany
    ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]"
    : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/80 text-[color:var(--sem-text-secondary)]";
}

export default async function CustomersPage({ searchParams }: CustomersPageContext) {
  await requireOfficeCrmRoute("/customers");
  const locale = await getLocale();
  const t = await getTranslations("customers");
  const resolvedSearchParams = await searchParams;
  const pageValue = Number.parseInt((firstValue(resolvedSearchParams.page) ?? "1").trim(), 10);
  const pageSizeValue = Number.parseInt((firstValue(resolvedSearchParams.pageSize) ?? "10").trim(), 10);
  const query = (firstValue(resolvedSearchParams.q) ?? "").trim().toLowerCase();
  const segment = parseSegment((firstValue(resolvedSearchParams.segment) ?? "").trim().toLowerCase());
  const regionParam = (firstValue(resolvedSearchParams.region) ?? "").trim();
  const regionKey = regionParam ? normalizeCityKey(decodeURIComponent(regionParam)) : "";
  const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const pageSize = Number.isFinite(pageSizeValue) && [10, 25, 50, 100].includes(pageSizeValue) ? pageSizeValue : 10;

  let customers: CustomerListItem[] = [];
  let loadError: string | null = null;

  try {
    customers = await serverApiFetch<CustomerListItem[]>("/api/customers");
  } catch (error) {
    loadError = error instanceof Error ? error.message : t("listUnavailable");
  }

  const searchMatchedCustomers = customers.filter((customer) => customerMatchesSearch(customer, query));
  const cityOptions = buildCityOptions(searchMatchedCustomers);

  const segmentFilteredCustomers = searchMatchedCustomers.filter((customer) => {
    if (segment === "company") {
      return hasCompanyOnFile(customer);
    }
    if (segment === "individual") {
      return !hasCompanyOnFile(customer);
    }
    return true;
  });

  const filteredCustomers = segmentFilteredCustomers.filter((customer) => {
    if (!regionKey) {
      return true;
    }
    return normalizeCityKey(customer.service_city) === regionKey;
  });

  const relatedJobs = filteredCustomers.flatMap((customer) => customer.relatedJobs ?? []);
  const activeCustomerCount = filteredCustomers.filter((customer) =>
    customer.relatedJobs.some((job) => openJobStatuses.includes(job.status)),
  ).length;
  const newThisMonthCount = filteredCustomers.filter((customer) => isNewThisMonth(customer.created_at)).length;
  const totalCount = filteredCustomers.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedCustomers = filteredCustomers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function listQuery(overrides: Record<string, string | null | undefined> = {}) {
    return buildQueryString({
      q: query || null,
      pageSize: String(pageSize),
      segment: segment === "all" ? null : segment,
      region: regionKey || null,
      ...overrides,
    });
  }

  const previousPageHref = listQuery({ page: currentPage > 1 ? String(currentPage - 1) : null });
  const nextPageHref = listQuery({ page: currentPage < totalPages ? String(currentPage + 1) : null });

  const tableState: MasterTableState = loadError
    ? { status: "error", message: t("listUnavailable") }
    : totalCount === 0
      ? { status: "empty", message: t("noCustomers") }
      : { status: "ready" };

  const segmentFilters: Array<{ key: CustomerSegment; label: string }> = [
    { key: "all", label: t("segmentAll") },
    { key: "company", label: t("segmentHasCompany") },
    { key: "individual", label: t("segmentIndividual") },
  ];

  function renderCustomerTableRow(customer: CustomerListItem) {
    const lifecycleStatus = resolveCustomerLifecycleStatus(customer);
    const openJobs = activeJobCount(customer);
    const hasCompany = hasCompanyOnFile(customer);
    const isNew = isNewThisMonth(customer.created_at);
    const formattedAddress = formatAddress(
      customer.service_address_line_1,
      customer.service_address_line_2,
      customer.service_city,
      customer.service_state_or_region,
      customer.service_postal_code,
    );

    return (
      <tr key={customer.id} className="group border-b border-[color:var(--cmp-border-subtle)] transition hover:bg-[color:var(--cmp-surface-soft)]">
        <td className="py-4 pl-5 pr-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-sm font-semibold text-[color:var(--sem-accent-primary)]">
              {getCustomerInitials(customer.full_name)}
              {openJobs > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[color:var(--cmp-surface-canvas)] bg-[color:var(--sem-state-warning)]" />
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-semibold text-[color:var(--sem-text-primary)]">{customer.full_name}</p>
                {isNew ? (
                  <span className="rounded-full border border-[color:var(--cmp-status-success-border)] bg-[color:var(--cmp-status-success-bg)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--cmp-status-success-text)]">
                    {t("newThisMonth")}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-sm text-[color:var(--sem-text-secondary)]">
                {customer.company_name?.trim() || formattedAddress}
              </p>
            </div>
          </div>
        </td>
        <td className="px-4 py-4">
          <div className="space-y-1.5 text-sm">
            <a className="flex items-center gap-2 text-[color:var(--sem-text-primary)] hover:text-[color:var(--sem-accent-primary)]" href={`tel:${customer.phone}`}>
              <Phone className="h-3.5 w-3.5 text-[color:var(--sem-text-muted)]" />
              {customer.phone}
            </a>
            {customer.email ? (
              <a className="flex items-center gap-2 text-[color:var(--sem-text-secondary)] hover:text-[color:var(--sem-accent-primary)]" href={`mailto:${customer.email}`}>
                <Mail className="h-3.5 w-3.5 text-[color:var(--sem-text-muted)]" />
                {customer.email}
              </a>
            ) : (
              <span className="flex items-center gap-2 text-[color:var(--sem-text-muted)]">
                <Mail className="h-3.5 w-3.5" />
                {t("noEmail")}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-4">
          <div className="flex max-w-[310px] items-start gap-2 text-sm text-[color:var(--sem-text-secondary)]">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
            <span className="line-clamp-2">{formattedAddress}</span>
          </div>
        </td>
        <td className="px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${companyBadgeClass(hasCompany)}`}>
              {hasCompany ? t("hasCompanyBadge") : t("individualBadge")}
            </span>
            <span className={customerLifecycleBadgeClass(lifecycleStatus)}>{customerLifecycleLabel(lifecycleStatus)}</span>
          </div>
        </td>
        <td className="px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/80 px-2.5 py-1 text-xs text-[color:var(--sem-text-secondary)]">
              {openJobs} {t("open")}
            </span>
            <span className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/80 px-2.5 py-1 text-xs text-[color:var(--sem-text-secondary)]">
              {customer.relatedJobs.length} {t("columns.totalJobs").toLowerCase()}
            </span>
          </div>
          <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">
            {t("lastUpdated")}: {formatDate(customer.updated_at, locale)}
          </p>
        </td>
        <td className="py-4 pl-4 pr-5">
          <div className="flex items-center justify-end gap-2 opacity-80 transition group-hover:opacity-100">
            <a
              href={`tel:${customer.phone}`}
              title={t("callCustomer")}
              aria-label={t("callCustomer")}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-accent)] hover:text-[color:var(--sem-accent-primary)]"
            >
              <Phone className="h-4 w-4" />
            </a>
            <Link
              href={`/messaging?lane=customers&customerId=${customer.id}`}
              title={t("sendSms")}
              aria-label={t("sendSms")}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-accent)] hover:text-[color:var(--sem-accent-primary)]"
            >
              <MessageSquare className="h-4 w-4" />
            </Link>
            <Link
              href={`/customers/${customer.id}`}
              className="flex h-9 items-center gap-2 rounded-xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] px-3 text-sm font-semibold text-[color:var(--sem-accent-primary)] transition hover:bg-[color:var(--cmp-surface-soft)]"
            >
              {t("openProfile")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </td>
      </tr>
    );
  }

  function renderCustomerMobileCard(customer: CustomerListItem) {
    const lifecycleStatus = resolveCustomerLifecycleStatus(customer);
    const openJobs = activeJobCount(customer);
    const hasCompany = hasCompanyOnFile(customer);
    const formattedAddress = formatAddress(
      customer.service_address_line_1,
      customer.service_address_line_2,
      customer.service_city,
      customer.service_state_or_region,
      customer.service_postal_code,
    );

    return (
      <article key={customer.id} className="rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/80 p-4 shadow-[0_20px_60px_color-mix(in_srgb,var(--sem-board-glow)_22%,transparent)]">
        <div className="flex items-start gap-3">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-sm font-semibold text-[color:var(--sem-accent-primary)]">
            {getCustomerInitials(customer.full_name)}
            {openJobs > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[color:var(--cmp-surface-canvas)] bg-[color:var(--sem-state-warning)]" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-[color:var(--sem-text-primary)]">{customer.full_name}</h3>
                <p className="truncate text-sm text-[color:var(--sem-text-secondary)]">{customer.company_name?.trim() || formattedAddress}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${companyBadgeClass(hasCompany)}`}>
                {hasCompany ? t("hasCompanyBadge") : t("individualBadge")}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-[color:var(--sem-text-muted)]" />
                {customer.phone}
              </p>
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[color:var(--sem-text-muted)]" />
                {customer.email ?? t("noEmail")}
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
                <span>{formattedAddress}</span>
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/80 px-2.5 py-1 text-xs text-[color:var(--sem-text-secondary)]">
                {openJobs} {t("open")}
              </span>
              <span className={customerLifecycleBadgeClass(lifecycleStatus)}>{customerLifecycleLabel(lifecycleStatus)}</span>
            </div>

            <div className="mt-4 rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 px-4 py-3">
              <p className="inline-flex items-start gap-2 text-sm">
                <ClipboardList className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                <span className="whitespace-pre-line">{customer.notes?.trim() || t("noCustomerNotes")}</span>
              </p>
              <p className="mt-3 text-xs text-[color:var(--sem-text-muted)]">
                {t("totalLinkedJobs", { count: customer.relatedJobs.length })} • {t("lastUpdated")}: {formatDate(customer.updated_at, locale)}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <a href={`tel:${customer.phone}`} className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 px-3 py-2 text-center text-sm font-medium text-[color:var(--sem-text-secondary)]">
                {t("callCustomer")}
              </a>
              <Link href={`/messaging?lane=customers&customerId=${customer.id}`} className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 px-3 py-2 text-center text-sm font-medium text-[color:var(--sem-text-secondary)]">
                {t("sendSms")}
              </Link>
              <Link href={`/customers/${customer.id}`} className="rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] px-3 py-2 text-center text-sm font-semibold text-[color:var(--sem-accent-primary)]">
                {t("openProfile")}
              </Link>
            </div>
          </div>
        </div>
      </article>
    );
  }

  if (SHOW_LEGACY_CUSTOMERS_LIST) {
    return (
      <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
        <div className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_48%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_36%)]"
          />
          <div className="relative mx-auto max-w-[88rem] px-6 py-14 lg:px-10">
            <section className="theme-surface-modal relative overflow-hidden rounded-[40px] border border-[color:var(--cmp-border-subtle)] p-7 shadow-[0_32px_90px_rgba(15,23,42,0.08)] sm:p-8 lg:p-10">
              <div className="relative space-y-10">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                  <div className="max-w-3xl">
                    <h1 className="font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                      {t("title")}
                    </h1>
                    <p className="mt-5 text-sm leading-7 text-[color:var(--sem-text-secondary)]">{t("description")}</p>
                  </div>
                  <Link href="/jobs" className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm">
                    <ArrowLeft className="h-4 w-4" />
                    {t("backToJobs")}
                  </Link>
                </div>

                <section className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] p-5">
                  <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]" method="GET">
                    <input type="hidden" name="segment" value={segment === "all" ? "" : segment} />
                    <input type="hidden" name="region" value={regionKey} />
                    <label className="space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">{t("searchLabel")}</span>
                      <input name="q" defaultValue={query} placeholder={t("searchPlaceholder")} className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm outline-none" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">Page size</span>
                      <select name="pageSize" defaultValue={String(pageSize)} className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm outline-none">
                        {[10, 25, 50, 100].map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-end">
                      <button type="submit" className="theme-btn-secondary w-full rounded-full px-5 py-3 text-sm">{t("searchAction")}</button>
                    </div>
                  </form>
                </section>

                {loadError ? <div className="theme-alert-error rounded-[24px] border px-5 py-4 text-sm">{loadError}</div> : null}

                {totalCount ? (
                  <div className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] p-4 sm:p-5">
                    <MasterTable
                      columns={[
                        { key: "actions", label: t("columns.actions"), align: "center" },
                        { key: "customer", label: t("columns.customerName"), align: "center" },
                        { key: "phone", label: t("columns.phone"), align: "center" },
                        { key: "email", label: t("columns.email"), align: "center" },
                        { key: "lifecycle", label: "Lifecycle", align: "center" },
                        { key: "totalJobs", label: t("columns.totalJobs"), align: "center" },
                        { key: "updated", label: t("columns.updated"), align: "center" },
                      ]}
                      state={tableState}
                    >
                      {pagedCustomers.map((customer) => {
                        const lifecycleStatus = resolveCustomerLifecycleStatus(customer);
                        return (
                          <MasterTableRow key={customer.id}>
                            <td className="master-table-cell master-table-actions-cell align-middle">
                              <div className="flex items-center justify-center gap-2">
                                <Link href={`/customers/${customer.id}`} className={customerOpenIconClass} title={t("openCustomer")} aria-label={t("openCustomer")}>
                                  <UserRound className="h-[0.8rem] w-[0.8rem]" />
                                </Link>
                                <Link href={`/jobs/new?customerId=${customer.id}`} className={customerJobIconClass} title={t("createJob")} aria-label={t("createJob")}>
                                  <Briefcase className="h-[0.8rem] w-[0.8rem]" />
                                </Link>
                              </div>
                            </td>
                            <td className="master-table-cell text-center">
                              <p className="font-semibold">{customer.full_name}</p>
                            </td>
                            <td className="master-table-cell text-center">{customer.phone}</td>
                            <td className="master-table-cell text-center">{customer.email ?? t("noEmail")}</td>
                            <td className="master-table-cell text-center">
                              <span className={customerLifecycleBadgeClass(lifecycleStatus)}>{customerLifecycleLabel(lifecycleStatus)}</span>
                            </td>
                            <td className="master-table-cell text-center">{customer.relatedJobs.length}</td>
                            <td className="master-table-cell text-center">{formatDate(customer.updated_at, locale)}</td>
                          </MasterTableRow>
                        );
                      })}
                    </MasterTable>
                  </div>
                ) : loadError ? null : (
                  <div className="theme-surface-card rounded-[30px] border border-dashed px-6 py-10 text-center text-sm">{t("noCustomers")}</div>
                )}

                <MasterTablePagination
                  page={currentPage}
                  pageSize={pageSize}
                  totalCount={totalCount}
                  totalPages={totalPages}
                  previousHref={previousPageHref}
                  nextHref={nextPageHref}
                />
              </div>
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <BoardShell gridOpacity="subtle">
      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8">
        <DesktopOptimizedNotice href="/customers" />
        <header className="rounded-[34px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
                  <UsersRound className="h-5 w-5" />
                </span>
                <p className="text-xs uppercase tracking-[0.34em] text-[color:var(--sem-accent-primary)]">{t("commandIndex")}</p>
              </div>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] md:text-5xl">
                {t("title")}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">{t("description")}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/jobs" className="theme-btn-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium">
                <ArrowLeft className="h-4 w-4" />
                {t("backToJobs")}
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile icon={UsersRound} label={t("totalCustomers")} value={totalCount} helper={t("totalCustomersHelper")} />
          <MetricTile icon={BriefcaseBusiness} label={t("openJobsTitle")} value={activeCustomerCount} helper={t("openJobsHelper")} />
          <MetricTile icon={CheckCircle2} label={t("newThisMonth")} value={newThisMonthCount} helper={t("newThisMonthHelper")} />
          <MetricTile icon={Briefcase} label={t("relatedJobsTitle")} value={relatedJobs.length} helper={t("relatedJobsHelper")} />
        </section>

        <section className="mt-6 rounded-[34px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 border-b border-[color:var(--cmp-border-subtle)] pb-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--sem-text-muted)]">{t("directoryCommandBar")}</p>
              <h2 className="mt-2 font-[family:var(--font-flat-display)] text-2xl tracking-tight text-[color:var(--sem-display-headline)]">{t("findCustomer")}</h2>
            </div>

            <form className="flex min-w-0 flex-1 flex-col gap-3 xl:max-w-3xl xl:flex-row" method="GET">
              {segment !== "all" ? <input type="hidden" name="segment" value={segment} /> : null}
              {regionKey ? <input type="hidden" name="region" value={regionKey} /> : null}
              <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3 text-sm text-[color:var(--sem-text-secondary)] focus-within:border-[color:var(--cmp-border-accent)]">
                <Search className="h-4 w-4 shrink-0" />
                <input
                  name="q"
                  defaultValue={query}
                  placeholder={t("searchPlaceholder")}
                  className="min-w-0 flex-1 bg-transparent text-[color:var(--sem-text-primary)] outline-none placeholder:text-[color:var(--sem-text-muted)]"
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3 text-sm">
                <span className="shrink-0 text-[color:var(--sem-text-muted)]">Page size</span>
                <select name="pageSize" defaultValue={String(pageSize)} className="bg-transparent text-[color:var(--sem-text-primary)] outline-none">
                  {[10, 25, 50, 100].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="theme-btn-primary rounded-2xl px-4 py-3 text-sm font-semibold">
                {t("searchAction")}
              </button>
            </form>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {segmentFilters.map((filter) => (
              <Link
                key={filter.key}
                href={listQuery({ segment: filter.key === "all" ? null : filter.key, page: null })}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${segmentFilterClass(segment === filter.key)}`}
              >
                {filter.label}
              </Link>
            ))}
          </div>

          {cityOptions.length > 0 ? (
            <div className="mt-5 flex flex-col gap-3 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/40 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">{t("regionLabel")}</p>
                  {cityOptions.length <= 8 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={listQuery({ region: null, page: null })}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${segmentFilterClass(!regionKey)}`}
                      >
                        {t("allCities")}
                      </Link>
                      {cityOptions.map((city) => (
                        <Link
                          key={city.key}
                          href={listQuery({ region: city.key, page: null })}
                          className={`rounded-full border px-3 py-1.5 text-sm transition ${segmentFilterClass(regionKey === city.key)}`}
                        >
                          {city.label} ({city.count})
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>

                {cityOptions.length > 8 ? (
                  <form method="GET" className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-md">
                    <input type="hidden" name="q" value={query} />
                    <input type="hidden" name="pageSize" value={String(pageSize)} />
                    {segment !== "all" ? <input type="hidden" name="segment" value={segment} /> : null}
                    <select name="region" defaultValue={regionKey} className="theme-input-control min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm">
                      <option value="">{t("allCities")}</option>
                      {cityOptions.map((city) => (
                        <option key={city.key} value={city.key}>
                          {city.label} ({city.count})
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="theme-btn-secondary rounded-2xl px-4 py-3 text-sm">
                      {t("applyRegion")}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ) : null}

          {loadError ? (
            <div className="theme-alert-error mt-6 rounded-[20px] border px-4 py-3 text-sm">{loadError}</div>
          ) : null}

          {totalCount > 0 ? (
            <>
              <div className="mt-6 hidden overflow-hidden rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/30 lg:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">
                    <tr>
                      <th className="py-4 pl-5 pr-4 font-medium">{t("columns.customerName")}</th>
                      <th className="px-4 py-4 font-medium">{t("columns.phone")}</th>
                      <th className="px-4 py-4 font-medium">{t("columns.email")}</th>
                      <th className="px-4 py-4 font-medium">Status</th>
                      <th className="px-4 py-4 font-medium">Summary</th>
                      <th className="py-4 pl-4 pr-5 text-right font-medium">{t("columns.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>{pagedCustomers.map((customer) => renderCustomerTableRow(customer))}</tbody>
                </table>
              </div>

              <div className="mt-6 grid gap-4 lg:hidden">
                <MasterMobileList items={pagedCustomers} emptyState={t("noCustomers")} renderItem={renderCustomerMobileCard} />
              </div>
            </>
          ) : loadError ? null : (
            <div className="theme-surface-card mt-6 rounded-[28px] border border-dashed border-[color:var(--cmp-border-subtle)] px-6 py-10 text-center text-sm text-[color:var(--sem-text-secondary)]">
              <div className="mx-auto flex max-w-md flex-col items-center">
                <div className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-3 text-[color:var(--sem-accent-primary)]">
                  <UserRound className="h-5 w-5" />
                </div>
                <p className="mt-4 text-base font-medium text-[color:var(--sem-text-primary)]">{t("noCustomers")}</p>
                <p className="mt-2 leading-7">{t("createFromJobWorkflow")}</p>
              </div>
            </div>
          )}

          <div className="mt-5 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/40 px-4 py-3">
            <MasterTablePagination
              page={currentPage}
              pageSize={pageSize}
              totalCount={totalCount}
              totalPages={totalPages}
              previousHref={previousPageHref}
              nextHref={nextPageHref}
            />
          </div>

          {activeCustomerCount > 0 ? (
            <p className="mt-4 text-xs text-[color:var(--sem-text-muted)]">{t("openJobsFooter", { count: activeCustomerCount })}</p>
          ) : null}
        </section>
      </div>
    </BoardShell>
  );
}
