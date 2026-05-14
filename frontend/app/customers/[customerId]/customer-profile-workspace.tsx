"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BriefcaseBusiness,
  ChevronRight,
  ClipboardList,
  Copy,
  FileText,
  Mail,
  MapPin,
  Phone,
  Receipt,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { openJobStatuses } from "@/lib/crm/data";
import { formatAddress, formatDate, formatDateTime } from "@/lib/crm/display";
import { getJobStatusLabel, getServiceTypeLabel } from "@/lib/crm/statuses";
import { mintStaffPortalMagicLink } from "@/lib/portal/staff-magic-link-api";
import type { Database } from "@/lib/types/database";
import type { InspectionListRow } from "@/lib/inspections/browser-api";

type CustomerRecord = Database["public"]["Tables"]["customers"]["Row"];
type RelatedValue<T> = T | T[] | null;
type TechnicianRecord = Pick<
  Database["public"]["Tables"]["technicians"]["Row"],
  "id" | "display_name" | "phone" | "is_active"
>;
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
> & {
  technician: RelatedValue<TechnicianRecord>;
};

type InvoiceListItem = {
  id: string;
  job_id: string;
  document_number: string;
  total_cents: number;
  amount_paid_cents: number;
  refunded_cents?: number;
  balance_cents: number;
  lifecycle_status: "sent" | "partial" | "paid" | "refunded" | "overpaid";
  status: "unpaid" | "paid";
  issued_at: string;
  customer_name: string;
  job_title: string;
};

type EstimateStatus = "draft" | "sent" | "approved" | "rejected";
type EstimateLifecycleStatus = "draft" | "sent" | "approved" | "void" | "converted";

type EstimateListItem = {
  id: string;
  job_id: string;
  customer_id: string;
  customer_name: string;
  job_title: string;
  document_number: string;
  lifecycle_status: EstimateLifecycleStatus;
  description: string;
  price_cents: number;
  status: EstimateStatus;
  sent_at: string | null;
  approved_at: string | null;
};

type CustomerProfileWorkspaceProps = {
  customer: CustomerRecord;
  relatedJobs: CustomerJobSummary[];
  invoices: InvoiceListItem[];
  estimates: EstimateListItem[];
  inspections: InspectionListRow[];
  loadError: string | null;
  canMintPortalMagicLink?: boolean;
};

type CustomerTab = "info" | "jobs" | "estimates" | "invoices" | "inspections";

const ITEMS_PER_PAGE = 4;

function relationValue<T>(value: RelatedValue<T> | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatOptionalDate(value: string | null) {
  return value ? formatDate(value) : "-";
}

function formatInvoiceStatus(status: InvoiceListItem["lifecycle_status"]) {
  if (status === "partial") return "Partial";
  if (status === "refunded") return "Refunded";
  if (status === "overpaid") return "Overpaid";
  return status === "paid" ? "Paid" : "Sent";
}

function formatEstimateStatus(status: EstimateLifecycleStatus) {
  if (status === "void") return "Voided";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function reportTypeLabel(reportType: string) {
  if (reportType === "wood_burning_fireplace") return "Wood Fireplace";
  if (reportType === "wood_stove") return "Wood Stove";
  if (reportType === "wett_inspection") return "WETT";
  if (reportType === "gas_fireplace") return "Gas Fireplace";
  return reportType.replaceAll("_", " ");
}

function statusBadgeClass(tone: "default" | "success" | "warning" | "error" = "default") {
  if (tone === "success") {
    return "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }

  if (tone === "warning") {
    return "theme-status-warning inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }

  if (tone === "error") {
    return "theme-status-error inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
  }

  return "theme-badge inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]";
}

function invoiceBadgeTone(status: InvoiceListItem["lifecycle_status"]) {
  if (status === "paid" || status === "overpaid") return "success";
  if (status === "partial" || status === "refunded") return "warning";
  return "default";
}

function estimateBadgeTone(status: EstimateLifecycleStatus) {
  if (status === "approved" || status === "converted") return "success";
  if (status === "void") return "error";
  if (status === "sent") return "warning";
  return "default";
}

function inspectionBadgeTone(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("pass") || normalized.includes("generated") || normalized.includes("complete")) return "success";
  if (normalized.includes("warning")) return "warning";
  if (normalized.includes("fail") || normalized.includes("blocked") || normalized.includes("unsatisfactory")) return "error";
  return "default";
}

function parsePage(value: string | null) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(1, page), totalPages);
}

function usePagedItems<T>(items: T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const currentPage = clampPage(page, totalPages);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;

  return {
    currentPage,
    totalPages,
    pageItems: items.slice(startIndex, startIndex + ITEMS_PER_PAGE),
  };
}

function EmptyState({ label, href, actionLabel }: { label: string; href?: string; actionLabel?: string }) {
  return (
    <div className="theme-control-surface rounded-[24px] border px-5 py-8 text-center">
      <p className="text-sm text-[color:var(--sem-text-secondary)]">{label}</p>
      {href && actionLabel ? (
        <Link href={href} className="theme-btn-secondary mt-4 inline-flex rounded-full px-4 py-2 text-sm">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function PaginationFooter({
  page,
  totalPages,
  totalCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  if (totalCount <= ITEMS_PER_PAGE) {
    return null;
  }

  const start = (page - 1) * ITEMS_PER_PAGE + 1;
  const end = Math.min(page * ITEMS_PER_PAGE, totalCount);

  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-[color:var(--cmp-border-subtle)] pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[color:var(--sem-text-muted)]">
        Showing {start}-{end} of {totalCount}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="theme-btn-secondary rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm text-[color:var(--sem-text-secondary)]">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="theme-btn-secondary rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function CustomerPortalMintSection({ customerId }: { customerId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<{ raw_token: string; expires_at: string } | null>(null);

  async function mint() {
    setBusy(true);
    setError(null);

    try {
      const payload = await mintStaffPortalMagicLink(customerId);
      setMinted(payload);
    } catch (err) {
      setMinted(null);
      setError(err instanceof Error ? err.message : "Could not generate portal link.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!minted) {
      return;
    }

    const url = `${window.location.origin}/access/${minted.raw_token}`;
    await navigator.clipboard.writeText(url);
  }

  return (
    <section className="theme-surface-card mt-5 rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
      <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Customer portal</p>
      <p className="mt-3 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
        Generate a one-time secure link the customer opens in their browser. Links expire after seven days and can only be used once.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void mint()}
          className="theme-btn-secondary rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate portal link"}
        </button>
        {minted ? (
          <button
            type="button"
            onClick={() => void copyLink()}
            className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
          >
            <Copy className="h-4 w-4" />
            Copy link
          </button>
        ) : null}
      </div>
      {minted ? (
        <p className="mt-4 text-sm text-[color:var(--sem-text-secondary)]">
          Expires{" "}
          <span className="font-semibold text-[color:var(--sem-text-primary)]">{formatDateTime(minted.expires_at)}</span>
          .
        </p>
      ) : null}
      {error ? (
        <p className="theme-alert-error mt-4 rounded-[16px] border px-4 py-3 text-sm">{error}</p>
      ) : null}
    </section>
  );
}

export default function CustomerProfileWorkspace({
  customer,
  relatedJobs,
  invoices,
  estimates,
  inspections,
  loadError,
  canMintPortalMagicLink = false,
}: CustomerProfileWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") ?? "info") as CustomerTab;
  const safeActiveTab: CustomerTab = ["info", "jobs", "estimates", "invoices", "inspections"].includes(activeTab) ? activeTab : "info";
  const jobsPage = parsePage(searchParams.get("jobsPage"));
  const estimatesPage = parsePage(searchParams.get("estimatesPage"));
  const invoicesPage = parsePage(searchParams.get("invoicesPage"));
  const inspectionsPage = parsePage(searchParams.get("inspectionsPage"));
  const activeJobs = relatedJobs.filter((job) => openJobStatuses.includes(job.status)).length;
  const totalRevenueCents = invoices.reduce((total, invoice) => total + invoice.total_cents, 0);

  const jobs = usePagedItems(relatedJobs, jobsPage);
  const pagedEstimates = usePagedItems(estimates, estimatesPage);
  const pagedInvoices = usePagedItems(invoices, invoicesPage);
  const pagedInspections = usePagedItems(inspections, inspectionsPage);

  const tabs = useMemo(() => [
    { id: "info" as const, label: "Customer Info", count: 1, icon: UserRound },
    { id: "jobs" as const, label: "Related Jobs", count: relatedJobs.length, icon: BriefcaseBusiness },
    { id: "estimates" as const, label: "Estimates", count: estimates.length, icon: FileText },
    { id: "invoices" as const, label: "Invoices", count: invoices.length, icon: Receipt },
    { id: "inspections" as const, label: "Inspections", count: inspections.length, icon: ShieldCheck },
  ], [estimates.length, inspections.length, invoices.length, relatedJobs.length]);

  function updateQuery(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setTab(tab: CustomerTab) {
    updateQuery({ tab: tab === "info" ? null : tab });
  }

  function setPage(key: string, page: number) {
    updateQuery({ [key]: page <= 1 ? null : String(page) });
  }

  const tabNavigation = (
    <div className="flex gap-2 overflow-x-auto border-t border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/70 px-5 py-4 backdrop-blur-xl sm:px-7">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = safeActiveTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={[
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition",
              active
                ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-selected-surface)] text-[color:var(--sem-accent-primary)]"
                : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] hover:text-[color:var(--sem-text-primary)]",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
            {tab.id !== "info" ? (
              <span className="rounded-full bg-[color:var(--cmp-surface-panel)] px-2 py-0.5 text-xs">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="mx-auto max-w-6xl px-6 py-6 lg:px-10">
        <section className="theme-surface-modal overflow-hidden rounded-[36px] border border-[color:var(--cmp-border-subtle)] shadow-[0_32px_90px_rgba(15,23,42,0.08)]">
          <div className="p-5 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">Customer Profile</p>
                <h1 className="mt-3 max-w-3xl font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                  {customer.full_name}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                  Review customer information, jobs, estimates, invoices, and inspections from one tabbed profile.
                </p>
              </div>

              <div className="grid min-w-[240px] gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <article className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Total Revenue</p>
                  <p className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(totalRevenueCents)}</p>
                </article>
                <article className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Total Invoices</p>
                  <p className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{invoices.length}</p>
                </article>
              </div>
            </div>
          </div>

          {tabNavigation}
        </section>

        {loadError ? (
          <div className="theme-alert-error mt-6 rounded-[20px] border px-4 py-3 text-sm">{loadError}</div>
        ) : null}

        <section className="theme-surface-modal mt-4 overflow-hidden rounded-[32px] border border-[color:var(--cmp-border-subtle)]">
          <div className="p-5 sm:p-6">
            {safeActiveTab === "info" ? (
              <>
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                  <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Customer Info</p>
                  <div className="mt-5 grid gap-4 text-sm text-[color:var(--sem-text-secondary)]">
                    <div className="flex items-start gap-3">
                      <UserRound className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                      <div>
                        <p className="text-[color:var(--sem-text-primary)]">{customer.full_name}</p>
                        <p className="mt-1 text-[color:var(--sem-text-muted)]">Created {formatDate(customer.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Phone className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                      <a href={`tel:${customer.phone}`} className="transition hover:text-[color:var(--sem-text-primary)]">{customer.phone}</a>
                    </div>
                    <div className="flex items-start gap-3">
                      <Mail className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                      {customer.email ? (
                        <a href={`mailto:${customer.email}`} className="transition hover:text-[color:var(--sem-text-primary)]">{customer.email}</a>
                      ) : (
                        <span className="text-[color:var(--sem-text-muted)]">No email on file</span>
                      )}
                    </div>
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                      <span>{formatAddress(customer.service_address_line_1, customer.service_address_line_2, customer.service_city, customer.service_state_or_region, customer.service_postal_code)}</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <ClipboardList className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                      <span className="whitespace-pre-line">{customer.notes?.trim() || "No customer notes yet."}</span>
                    </div>
                  </div>
                </section>

                <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Record Summary</p>
                  <div className="mt-5 grid gap-3">
                    <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                      <p className="text-xs text-[color:var(--sem-text-muted)]">Last updated</p>
                      <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{formatDate(customer.updated_at)}</p>
                    </div>
                    <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                      <p className="text-xs text-[color:var(--sem-text-muted)]">Related jobs</p>
                      <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{relatedJobs.length} total, {activeJobs} active</p>
                    </div>
                    <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                      <p className="text-xs text-[color:var(--sem-text-muted)]">Invoices</p>
                      <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{invoices.length} invoices, {formatCurrency(totalRevenueCents)} total</p>
                    </div>
                  </div>
                </section>
              </div>
              {canMintPortalMagicLink ? <CustomerPortalMintSection customerId={customer.id} /> : null}
            </>
            ) : null}

            {safeActiveTab === "jobs" ? (
              <section>
                <TabHeader title="Related Jobs" href={`/jobs/new?customerId=${customer.id}`} actionLabel="Add New Job" />
                {relatedJobs.length === 0 ? <EmptyState label="No jobs are linked to this customer yet." href={`/jobs/new?customerId=${customer.id}`} actionLabel="Create Job" /> : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      {jobs.pageItems.map((job) => {
                        const technician = relationValue(job.technician);
                        return (
                          <RecordCard key={job.id} title={job.title} href={`/jobs/${job.id}`} badge={getJobStatusLabel(job.status)} badgeTone={openJobStatuses.includes(job.status) ? "warning" : "success"}>
                            <p>{getServiceTypeLabel(job.requested_service_type)}</p>
                            <p>{formatDateTime(job.scheduled_for)}{job.scheduled_window ? ` - ${job.scheduled_window}` : ""}</p>
                            <p>Technician: {technician?.display_name ?? "Unassigned"}</p>
                          </RecordCard>
                        );
                      })}
                    </div>
                    <PaginationFooter page={jobs.currentPage} totalPages={jobs.totalPages} totalCount={relatedJobs.length} onPageChange={(page) => setPage("jobsPage", page)} />
                  </>
                )}
              </section>
            ) : null}

            {safeActiveTab === "estimates" ? (
              <section>
                <TabHeader title="Estimates" href={`/estimates/new?customerId=${customer.id}`} actionLabel="Add New Estimate" />
                {estimates.length === 0 ? <EmptyState label="No estimates are linked to this customer yet." href={`/estimates/new?customerId=${customer.id}`} actionLabel="Create Estimate" /> : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      {pagedEstimates.pageItems.map((estimate) => (
                        <RecordCard key={estimate.id} title={estimate.document_number} href={`/estimates/${estimate.id}`} badge={formatEstimateStatus(estimate.lifecycle_status)} badgeTone={estimateBadgeTone(estimate.lifecycle_status)}>
                          <p>{estimate.job_title}</p>
                          <p>{formatCurrency(estimate.price_cents)}</p>
                          <p>Sent: {formatOptionalDate(estimate.sent_at)}</p>
                        </RecordCard>
                      ))}
                    </div>
                    <PaginationFooter page={pagedEstimates.currentPage} totalPages={pagedEstimates.totalPages} totalCount={estimates.length} onPageChange={(page) => setPage("estimatesPage", page)} />
                  </>
                )}
              </section>
            ) : null}

            {safeActiveTab === "invoices" ? (
              <section>
                <TabHeader title="Invoices" href={`/invoices/new?customerId=${customer.id}`} actionLabel="Add New Invoice" />
                {invoices.length === 0 ? <EmptyState label="No invoices are linked to this customer yet." href={`/invoices/new?customerId=${customer.id}`} actionLabel="Create Invoice" /> : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      {pagedInvoices.pageItems.map((invoice) => (
                        <RecordCard key={invoice.id} title={invoice.document_number} href={`/invoices/${invoice.id}`} badge={formatInvoiceStatus(invoice.lifecycle_status)} badgeTone={invoiceBadgeTone(invoice.lifecycle_status)}>
                          <p>{invoice.job_title}</p>
                          <p>Total: {formatCurrency(invoice.total_cents)}</p>
                          <p>Balance: {formatCurrency(invoice.balance_cents)}</p>
                        </RecordCard>
                      ))}
                    </div>
                    <PaginationFooter page={pagedInvoices.currentPage} totalPages={pagedInvoices.totalPages} totalCount={invoices.length} onPageChange={(page) => setPage("invoicesPage", page)} />
                  </>
                )}
              </section>
            ) : null}

            {safeActiveTab === "inspections" ? (
              <section>
                <TabHeader title="Inspections" href="/inspections" actionLabel="Open Inspections" />
                {inspections.length === 0 ? <EmptyState label="No inspections are linked to this customer yet." href="/inspections" actionLabel="Create Inspection" /> : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      {pagedInspections.pageItems.map((inspection) => (
                        <RecordCard key={inspection.id} title={inspection.client_name ?? "Inspection"} href={`/inspections/${inspection.id}/workspace`} badge={inspection.status} badgeTone={inspectionBadgeTone(inspection.status)}>
                          <p>{reportTypeLabel(inspection.report_type)}</p>
                          <p>{inspection.address ?? "No address snapshot"}</p>
                          <p>Updated: {formatDateTime(inspection.updated_at)}</p>
                        </RecordCard>
                      ))}
                    </div>
                    <PaginationFooter page={pagedInspections.currentPage} totalPages={pagedInspections.totalPages} totalCount={inspections.length} onPageChange={(page) => setPage("inspectionsPage", page)} />
                  </>
                )}
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function TabHeader({ title, href, actionLabel }: { title: string; href: string; actionLabel: string }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-2xl font-semibold text-[color:var(--sem-text-primary)]">{title}</h2>
      <Link href={href} className="theme-btn-secondary inline-flex items-center justify-center rounded-full px-4 py-2 text-sm">
        {actionLabel}
      </Link>
    </div>
  );
}

function RecordCard({
  title,
  href,
  badge,
  badgeTone,
  children,
}: {
  title: string;
  href: string;
  badge: string;
  badgeTone: "default" | "success" | "warning" | "error";
  children: React.ReactNode;
}) {
  return (
    <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">{title}</h3>
          <div className="mt-3 space-y-1 text-sm text-[color:var(--sem-text-secondary)]">{children}</div>
        </div>
        <span className={statusBadgeClass(badgeTone)}>{badge}</span>
      </div>
      <Link href={href} className="mt-4 inline-flex items-center gap-2 text-sm text-[color:var(--sem-accent-primary)]">
        Open
        <ChevronRight className="h-4 w-4" />
      </Link>
    </article>
  );
}
