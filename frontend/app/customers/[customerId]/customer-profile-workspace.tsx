"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Copy,
  DollarSign,
  FileText,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";
import { MetricTile, metricTileHoverClassName } from "@/components/board/metric-tile";
import { crmApiFetch } from "@/lib/crm/browser-api";
import { openJobStatuses } from "@/lib/crm/data";
import { formatAddress, formatDate, formatDateTime } from "@/lib/crm/display";
import { formatLocalizedCurrency } from "@/lib/i18n/formatters";
import { getJobStatusLabel, getServiceTypeLabel } from "@/lib/crm/statuses";
import { mintStaffPortalMagicLink } from "@/lib/portal/staff-magic-link-api";
import type { Database } from "@/lib/types/database";
import type { InspectionListRow } from "@/lib/inspections/browser-api";

const SHOW_LEGACY_CUSTOMER_PROFILE = false;

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

type ServiceType = Database["public"]["Enums"]["service_type"];

type CustomerEditFormState = {
  fullName: string;
  phone: string;
  email: string;
  companyName: string;
  serviceAddressLine1: string;
  serviceAddressLine2: string;
  serviceCity: string;
  serviceStateOrRegion: string;
  servicePostalCode: string;
  notes: string;
  preferredServiceType: ServiceType | "";
};

type CustomerTab = "info" | "jobs" | "estimates" | "invoices" | "inspections";

type BadgeTone = "default" | "success" | "warning" | "error";

const ITEMS_PER_PAGE = 4;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function relationValue<T>(value: RelatedValue<T> | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatCurrency(cents: number, locale: string) {
  return formatLocalizedCurrency(cents / 100, locale as never, "USD");
}

function formatOptionalDate(value: string | null, locale: string) {
  return value ? formatDate(value, locale) : "-";
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

function formatLifecycleStatus(status: CustomerRecord["lifecycle_status"]) {
  if (!status) return null;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function reportTypeLabel(reportType: string) {
  if (reportType === "wood_burning_fireplace") return "Wood Fireplace";
  if (reportType === "wood_stove") return "Wood Stove";
  if (reportType === "wett_inspection") return "WETT";
  if (reportType === "gas_fireplace") return "Gas Fireplace";
  return reportType.replaceAll("_", " ");
}

function statusBadgeClass(tone: BadgeTone = "default") {
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

function toEditFormState(customer: CustomerRecord): CustomerEditFormState {
  return {
    fullName: customer.full_name,
    phone: customer.phone,
    email: customer.email ?? "",
    companyName: customer.company_name ?? "",
    serviceAddressLine1: customer.service_address_line_1,
    serviceAddressLine2: customer.service_address_line_2 ?? "",
    serviceCity: customer.service_city,
    serviceStateOrRegion: customer.service_state_or_region ?? "",
    servicePostalCode: customer.service_postal_code,
    notes: customer.notes ?? "",
    preferredServiceType: customer.preferred_service_type ?? "",
  };
}

function trimRequired(value: string) {
  return value.trim();
}

function trimOptional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getCustomerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function formatRelativeActivity(valueMs: number, locale: string) {
  if (!Number.isFinite(valueMs)) return "-";
  const now = new Date();
  const then = new Date(valueMs);
  const dayMs = 86_400_000;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfThen) / dayMs);

  if (dayDiff <= 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return `${dayDiff} days ago`;
  return formatDate(then.toISOString(), locale);
}

function deriveCustomerMetrics(params: {
  customer: CustomerRecord;
  relatedJobs: CustomerJobSummary[];
  invoices: InvoiceListItem[];
  estimates: EstimateListItem[];
  inspections: InspectionListRow[];
  activeJobs: number;
}) {
  const { customer, relatedJobs, invoices, estimates, inspections, activeJobs } = params;
  const totalRevenueCents = invoices.reduce((total, invoice) => total + invoice.total_cents, 0);
  const openBalanceCents = invoices.reduce((total, invoice) => total + (invoice.balance_cents > 0 ? invoice.balance_cents : 0), 0);
  const unpaidInvoiceCount = invoices.filter((invoice) => invoice.balance_cents > 0).length;
  const pendingEstimates = estimates.filter((estimate) => estimate.lifecycle_status === "sent").length;
  const now = Date.now();

  const nextVisitJob = relatedJobs
    .filter((job): job is CustomerJobSummary & { scheduled_for: string } => {
      if (!job.scheduled_for || !openJobStatuses.includes(job.status)) {
        return false;
      }
      return new Date(job.scheduled_for).getTime() >= now;
    })
    .sort((left, right) => new Date(left.scheduled_for).getTime() - new Date(right.scheduled_for).getTime())[0] ?? null;

  const timestamps = [new Date(customer.updated_at).getTime()];
  for (const job of relatedJobs) {
    timestamps.push(new Date(job.updated_at).getTime());
    if (job.scheduled_for) timestamps.push(new Date(job.scheduled_for).getTime());
  }
  for (const invoice of invoices) timestamps.push(new Date(invoice.issued_at).getTime());
  for (const estimate of estimates) {
    if (estimate.sent_at) timestamps.push(new Date(estimate.sent_at).getTime());
    if (estimate.approved_at) timestamps.push(new Date(estimate.approved_at).getTime());
  }
  for (const inspection of inspections) timestamps.push(new Date(inspection.updated_at).getTime());

  const lastActivityMs = timestamps.reduce((max, value) => (Number.isFinite(value) ? Math.max(max, value) : max), 0);

  return {
    totalRevenueCents,
    openBalanceCents,
    unpaidInvoiceCount,
    pendingEstimates,
    nextVisitJob,
    lastActivityMs,
    activeJobs,
  };
}

function buildMapsHref(customer: CustomerRecord) {
  const query = formatAddress(
    customer.service_address_line_1,
    customer.service_address_line_2,
    customer.service_city,
    customer.service_state_or_region,
    customer.service_postal_code,
  );
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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
  const t = useTranslations("customerProfile");
  const actionT = useTranslations("common.actions");
  const paginationT = useTranslations("common.pagination");
  if (totalCount <= ITEMS_PER_PAGE) {
    return null;
  }

  const start = (page - 1) * ITEMS_PER_PAGE + 1;
  const end = Math.min(page * ITEMS_PER_PAGE, totalCount);

  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-[color:var(--cmp-border-subtle)] pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[color:var(--sem-text-muted)]">
        {t("showing", { start, end, totalCount })}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="theme-btn-secondary rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionT("prev")}
        </button>
        <span className="text-sm text-[color:var(--sem-text-secondary)]">
          {paginationT("pageOf", { page, totalPages })}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="theme-btn-secondary rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionT("next")}
        </button>
      </div>
    </div>
  );
}

function CustomerPortalMintSection({ customerId, className = "" }: { customerId: string; className?: string }) {
  const t = useTranslations("customerProfile");
  const locale = useLocale();
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
      setError(err instanceof Error ? err.message : t("portalLinkError"));
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
    <section className={cx("theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5", className)}>
      <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{t("customerPortal")}</p>
      <p className="mt-3 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
        {t("customerPortalDescription")}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void mint()}
          className="theme-btn-secondary rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? t("generating") : t("generatePortalLink")}
        </button>
        {minted ? (
          <button
            type="button"
            onClick={() => void copyLink()}
            className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
          >
            <Copy className="h-4 w-4" />
            {t("copyLink")}
          </button>
        ) : null}
      </div>
      {minted ? (
        <p className="mt-4 text-sm text-[color:var(--sem-text-secondary)]">
          <span className="font-semibold text-[color:var(--sem-text-primary)]">{t("expires", { date: formatDateTime(minted.expires_at, locale) })}</span>
        </p>
      ) : null}
      {error ? (
        <p className="theme-alert-error mt-4 rounded-[16px] border px-4 py-3 text-sm">{error}</p>
      ) : null}
    </section>
  );
}

function ActionButton({
  icon: Icon,
  label,
  href,
  primary = false,
}: {
  icon: LucideIcon;
  label: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "group flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition",
        primary
          ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] text-[color:var(--sem-accent-primary)] shadow-[0_0_30px_color-mix(in_srgb,var(--sem-accent-primary)_15%,transparent)] hover:bg-[color:var(--cmp-surface-soft)]"
          : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-surface-soft)] hover:text-[color:var(--sem-text-primary)]",
      )}
    >
      <span className="flex items-center gap-3">
        <span className={cx("flex h-9 w-9 items-center justify-center rounded-xl", primary ? "bg-[color:var(--cmp-surface-soft)]" : "bg-[color:var(--cmp-surface-panel)]/80")}>
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </span>
      <ChevronRight className="h-4 w-4 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
    </Link>
  );
}

function ActivityFeedList({ children }: { children: ReactNode }) {
  return (
    <div className="relative space-y-5 before:absolute before:left-[17px] before:top-3 before:h-[calc(100%-24px)] before:w-px before:bg-gradient-to-b before:from-[color:var(--sem-accent-primary)] before:via-[color:var(--cmp-border-subtle)] before:to-transparent">
      {children}
    </div>
  );
}

function ActivityTimelineCard({
  icon: Icon,
  time,
  title,
  meta,
  badge,
  badgeTone,
  amount,
  href,
  children,
}: {
  icon: LucideIcon;
  time: string;
  title: string;
  meta?: string;
  badge: string;
  badgeTone: BadgeTone;
  amount?: string | null;
  href: string;
  children?: ReactNode;
}) {
  const t = useTranslations("customerProfile");

  return (
    <article className="relative pl-12">
      <div className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)] shadow-[0_0_0_5px_color-mix(in_srgb,var(--cmp-surface-canvas)_75%,transparent)]">
        <span className="flex h-7 w-7 items-center justify-center rounded-xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/80 p-5 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_22%,transparent)] transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-surface-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[color:var(--sem-text-muted)]">{time}</p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--sem-text-primary)]">{title}</h3>
            {meta ? <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{meta}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {amount ? (
              <span className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/80 px-3 py-1 text-sm font-semibold text-[color:var(--sem-text-primary)]">
                {amount}
              </span>
            ) : null}
            <span className={statusBadgeClass(badgeTone)}>{badge}</span>
          </div>
        </div>

        {children ? <div className="mt-4 space-y-1 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{children}</div> : null}

        <Link href={href} className="mt-4 inline-flex items-center gap-2 text-sm text-[color:var(--sem-accent-primary)]">
          {t("open")}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

function FilterPillBar({
  tabs,
  activeTab,
  onSelect,
}: {
  tabs: Array<{ id: CustomerTab; label: string; count: number; icon: LucideIcon }>;
  activeTab: CustomerTab;
  onSelect: (tab: CustomerTab) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={cx(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
              active
                ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-selected-surface)] text-[color:var(--sem-accent-primary)] shadow-[0_0_24px_color-mix(in_srgb,var(--sem-accent-primary)_15%,transparent)]"
                : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[color:var(--sem-text-secondary)] hover:bg-[color:var(--cmp-surface-soft)] hover:text-[color:var(--sem-text-primary)]",
            )}
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
}

function CustomerContextSidebar({
  customerRecord,
  metrics,
  tags,
  formattedAddress,
  mapsHref,
  canMintPortalMagicLink,
  locale,
}: {
  customerRecord: CustomerRecord;
  metrics: ReturnType<typeof deriveCustomerMetrics>;
  tags: string[];
  formattedAddress: string;
  mapsHref: string;
  canMintPortalMagicLink: boolean;
  locale: string;
}) {
  const t = useTranslations("customerProfile");

  return (
    <aside className="top-4 h-fit rounded-[32px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] backdrop-blur-xl lg:sticky">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] font-[family:var(--font-flat-display)] text-xl text-[color:var(--sem-accent-primary)] shadow-[0_0_30px_color-mix(in_srgb,var(--sem-accent-primary)_18%,transparent)]">
          {getCustomerInitials(customerRecord.full_name)}
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--sem-accent-primary)]">{t("customer360")}</p>
          <h2 className="mt-2 truncate text-xl font-semibold tracking-tight text-[color:var(--sem-text-primary)]">{customerRecord.full_name}</h2>
          {customerRecord.company_name ? (
            <p className="mt-1 truncate text-sm text-[color:var(--sem-text-secondary)]">{customerRecord.company_name}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className={`rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 p-3 ${metricTileHoverClassName}`}>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">{t("totalRevenue")}</p>
          <p className="mt-1 text-lg font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(metrics.totalRevenueCents, locale)}</p>
        </div>
        <div className={cx("rounded-2xl border p-3", metricTileHoverClassName, metrics.openBalanceCents > 0 ? "border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)]" : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70")}>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">{t("openBalance")}</p>
          <p className="mt-1 text-lg font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(metrics.openBalanceCents, locale)}</p>
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/80 px-3 py-1 text-xs text-[color:var(--sem-text-secondary)]">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-6 space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--sem-text-muted)]">{t("quickActions")}</p>
        <ActionButton icon={Plus} label={t("addNewJob")} href={`/jobs/new?customerId=${customerRecord.id}`} primary />
        <ActionButton icon={FileText} label={t("addNewEstimate")} href={`/estimates/new?customerId=${customerRecord.id}`} />
        <ActionButton icon={MessageSquare} label={t("sendSms")} href={`/messaging?lane=customers&customerId=${customerRecord.id}`} />
        {customerRecord.phone ? (
          <a
            href={`tel:${customerRecord.phone}`}
            className="group flex items-center justify-between rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 px-4 py-3 text-left text-sm font-medium text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-surface-soft)] hover:text-[color:var(--sem-text-primary)]"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--cmp-surface-panel)]/80">
                <Phone className="h-4 w-4" />
              </span>
              {t("callCustomer")}
            </span>
            <ChevronRight className="h-4 w-4 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
          </a>
        ) : null}
      </div>

      <div className="mt-7 border-t border-[color:var(--cmp-border-subtle)] pt-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--sem-text-muted)]">{t("contactSection")}</p>
        <div className="mt-4 space-y-3 text-sm">
          {customerRecord.phone ? (
            <a className="flex items-center gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 p-3 text-[color:var(--sem-text-secondary)] hover:bg-[color:var(--cmp-surface-soft)]" href={`tel:${customerRecord.phone}`}>
              <Phone className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
              {customerRecord.phone}
            </a>
          ) : null}
          {customerRecord.email ? (
            <a className="flex items-center gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 p-3 text-[color:var(--sem-text-secondary)] hover:bg-[color:var(--cmp-surface-soft)]" href={`mailto:${customerRecord.email}`}>
              <Mail className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
              <span className="truncate">{customerRecord.email}</span>
            </a>
          ) : (
            <div className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 p-3 text-[color:var(--sem-text-muted)]">{t("noEmailOnFile")}</div>
          )}
          <a className="flex items-start gap-3 rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 p-3 text-[color:var(--sem-text-secondary)] hover:bg-[color:var(--cmp-surface-soft)]" href={mapsHref} target="_blank" rel="noreferrer">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--sem-accent-primary)]" />
            <span>{formattedAddress}</span>
          </a>
        </div>
      </div>

      <div className="mt-7 border-t border-[color:var(--cmp-border-subtle)] pt-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--sem-text-muted)]">{t("propertyNotes")}</p>
        <div className="mt-4 space-y-3">
          {customerRecord.preferred_service_type ? (
            <div className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Preferred service</p>
              <p className="mt-1 text-sm leading-5 text-[color:var(--sem-text-secondary)]">{getServiceTypeLabel(customerRecord.preferred_service_type, locale)}</p>
            </div>
          ) : null}
          <div className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 p-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Notes</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-5 text-[color:var(--sem-text-secondary)]">{customerRecord.notes?.trim() || t("noCustomerNotes")}</p>
          </div>
        </div>
      </div>

      {canMintPortalMagicLink ? <CustomerPortalMintSection customerId={customerRecord.id} className="mt-7" /> : null}
    </aside>
  );
}

function OperationalSnapshotPanel({
  metrics,
  relatedJobsCount,
  inspectionsCount,
  locale,
}: {
  metrics: ReturnType<typeof deriveCustomerMetrics>;
  relatedJobsCount: number;
  inspectionsCount: number;
  locale: string;
}) {
  const t = useTranslations("customerProfile");

  return (
    <aside className="h-fit rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/80 p-5">
      <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--sem-text-muted)]">{t("operationalSnapshot")}</p>
      <div className="mt-5 space-y-3">
        <div className="rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] p-4">
          <div className="flex items-center gap-3 text-[color:var(--sem-accent-primary)]">
            <BriefcaseBusiness className="h-4 w-4" />
            <span className="text-sm font-semibold">{t("relatedJobs")}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">
            {t("relatedJobsSummary", { total: relatedJobsCount, active: metrics.activeJobs })}
          </p>
        </div>

        {metrics.unpaidInvoiceCount > 0 ? (
          <div className="rounded-2xl border border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)] p-4">
            <div className="flex items-center gap-3 text-[color:var(--sem-text-primary)]">
              <DollarSign className="h-4 w-4" />
              <span className="text-sm font-semibold">{t("invoices")}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">
              {t("unpaidInvoicesSnapshot", {
                count: metrics.unpaidInvoiceCount,
                amount: formatCurrency(metrics.openBalanceCents, locale),
              })}
            </p>
          </div>
        ) : null}

        {metrics.pendingEstimates > 0 ? (
          <div className="rounded-2xl border border-[color:var(--cmp-status-warning-border)] bg-[color:var(--cmp-status-warning-bg)] p-4">
            <div className="flex items-center gap-3 text-[color:var(--sem-text-primary)]">
              <FileText className="h-4 w-4" />
              <span className="text-sm font-semibold">{t("estimates")}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">
              {t("estimatesPendingSnapshot", { count: metrics.pendingEstimates })}
            </p>
          </div>
        ) : null}

        <div className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 p-4">
          <div className="flex items-center gap-3 text-[color:var(--sem-text-primary)]">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-sm font-semibold">{t("inspections")}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">{inspectionsCount}</p>
        </div>

        <div className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{t("lastActivity")}</p>
          <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">
            {metrics.lastActivityMs > 0 ? formatRelativeActivity(metrics.lastActivityMs, locale) : t("noActivityYet")}
          </p>
        </div>

        {metrics.nextVisitJob ? (
          <div className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/50 p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{t("nextVisit")}</p>
            <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{formatDateTime(metrics.nextVisitJob.scheduled_for, locale)}</p>
            <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">{metrics.nextVisitJob.title}</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function CustomerInfoPanel({
  customerRecord,
  relatedJobs,
  invoices,
  activeJobs,
  totalRevenueCents,
  isEditingCustomer,
  editForm,
  savePending,
  saveError,
  saveSuccess,
  serviceTypeOptions,
  locale,
  onOpenEdit,
  onCloseEdit,
  onUpdateField,
  onSave,
}: {
  customerRecord: CustomerRecord;
  relatedJobs: CustomerJobSummary[];
  invoices: InvoiceListItem[];
  activeJobs: number;
  totalRevenueCents: number;
  isEditingCustomer: boolean;
  editForm: CustomerEditFormState;
  savePending: boolean;
  saveError: string | null;
  saveSuccess: string | null;
  serviceTypeOptions: ServiceType[];
  locale: string;
  onOpenEdit: () => void;
  onCloseEdit: () => void;
  onUpdateField: <Key extends keyof CustomerEditFormState>(key: Key, value: CustomerEditFormState[Key]) => void;
  onSave: () => void;
}) {
  const t = useTranslations("customerProfile");

  return (
    <>
      {saveSuccess ? (
        <div className="theme-status-success mb-5 rounded-[16px] border px-4 py-3 text-sm">
          {saveSuccess}
        </div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{t("customerInfo")}</p>
            <button
              type="button"
              onClick={isEditingCustomer ? onCloseEdit : onOpenEdit}
              className="theme-btn-secondary rounded-full px-4 py-2 text-sm"
            >
              {isEditingCustomer ? "Cancel" : "Edit customer"}
            </button>
          </div>
          {isEditingCustomer ? (
            <form
              className="mt-4 grid gap-3 text-sm"
              onSubmit={(event) => {
                event.preventDefault();
                onSave();
              }}
            >
              <label className="grid gap-1">
                <span>Name</span>
                <input value={editForm.fullName} onChange={(event) => onUpdateField("fullName", event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
              </label>
              <label className="grid gap-1">
                <span>Phone</span>
                <input value={editForm.phone} onChange={(event) => onUpdateField("phone", event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
              </label>
              <label className="grid gap-1">
                <span>Email</span>
                <input value={editForm.email} onChange={(event) => onUpdateField("email", event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
              </label>
              <label className="grid gap-1">
                <span>Company</span>
                <input value={editForm.companyName} onChange={(event) => onUpdateField("companyName", event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
              </label>
              <label className="grid gap-1">
                <span>Service Address Line 1</span>
                <input value={editForm.serviceAddressLine1} onChange={(event) => onUpdateField("serviceAddressLine1", event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
              </label>
              <label className="grid gap-1">
                <span>Service Address Line 2</span>
                <input value={editForm.serviceAddressLine2} onChange={(event) => onUpdateField("serviceAddressLine2", event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 sm:col-span-2">
                  <span>City</span>
                  <input value={editForm.serviceCity} onChange={(event) => onUpdateField("serviceCity", event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
                </label>
                <label className="grid gap-1">
                  <span>Region</span>
                  <input value={editForm.serviceStateOrRegion} onChange={(event) => onUpdateField("serviceStateOrRegion", event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
                </label>
              </div>
              <label className="grid gap-1">
                <span>Postal Code</span>
                <input value={editForm.servicePostalCode} onChange={(event) => onUpdateField("servicePostalCode", event.target.value)} className="theme-control-surface rounded-[14px] border px-3 py-2" />
              </label>
              <label className="grid gap-1">
                <span>Preferred Service Type</span>
                <select value={editForm.preferredServiceType} onChange={(event) => onUpdateField("preferredServiceType", event.target.value as ServiceType | "")} className="theme-control-surface rounded-[14px] border px-3 py-2">
                  <option value="">No preference</option>
                  {serviceTypeOptions.map((serviceType) => (
                    <option key={serviceType} value={serviceType}>
                      {getServiceTypeLabel(serviceType, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span>Notes</span>
                <textarea value={editForm.notes} onChange={(event) => onUpdateField("notes", event.target.value)} rows={3} className="theme-control-surface rounded-[14px] border px-3 py-2" />
              </label>
              {saveError ? (
                <p className="theme-alert-error rounded-[14px] border px-3 py-2 text-sm">{saveError}</p>
              ) : null}
              <div className="flex justify-end">
                <button type="submit" disabled={savePending} className="theme-btn-secondary rounded-full px-4 py-2 text-sm disabled:opacity-60">
                  {savePending ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          ) : null}
          <div className="mt-5 grid gap-4 text-sm text-[color:var(--sem-text-secondary)]">
            <div className="flex items-start gap-3">
              <UserRound className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
              <div>
                <p className="text-[color:var(--sem-text-primary)]">{customerRecord.full_name}</p>
                <p className="mt-1 text-[color:var(--sem-text-muted)]">{t("created", { date: formatDate(customerRecord.created_at, locale) })}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
              <a href={`tel:${customerRecord.phone}`} className="transition hover:text-[color:var(--sem-text-primary)]">{customerRecord.phone}</a>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
              {customerRecord.email ? (
                <a href={`mailto:${customerRecord.email}`} className="transition hover:text-[color:var(--sem-text-primary)]">{customerRecord.email}</a>
              ) : (
                <span className="text-[color:var(--sem-text-muted)]">{t("noEmailOnFile")}</span>
              )}
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
              <span>{formatAddress(customerRecord.service_address_line_1, customerRecord.service_address_line_2, customerRecord.service_city, customerRecord.service_state_or_region, customerRecord.service_postal_code)}</span>
            </div>
            <div className="flex items-start gap-3">
              <ClipboardList className="mt-0.5 h-4 w-4 text-[color:var(--sem-accent-primary)]" />
              <span className="whitespace-pre-line">{customerRecord.notes?.trim() || t("noCustomerNotes")}</span>
            </div>
          </div>
        </section>

        <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{t("recordSummary")}</p>
          <div className="mt-5 grid gap-3">
            <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
              <p className="text-xs text-[color:var(--sem-text-muted)]">{t("lastUpdated")}</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{formatDate(customerRecord.updated_at, locale)}</p>
            </div>
            <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
              <p className="text-xs text-[color:var(--sem-text-muted)]">{t("relatedJobs")}</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{t("relatedJobsSummary", { total: relatedJobs.length, active: activeJobs })}</p>
            </div>
            <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
              <p className="text-xs text-[color:var(--sem-text-muted)]">{t("invoices")}</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{t("invoicesSummary", { count: invoices.length, total: formatCurrency(totalRevenueCents, locale) })}</p>
            </div>
          </div>
        </section>
      </div>
    </>
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
  badgeTone: BadgeTone;
  children: ReactNode;
}) {
  const t = useTranslations("customerProfile");
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
        {t("open")}
        <ChevronRight className="h-4 w-4" />
      </Link>
    </article>
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
  const locale = useLocale();
  const t = useTranslations("customerProfile");
  const [customerRecord, setCustomerRecord] = useState<CustomerRecord>(customer);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editForm, setEditForm] = useState<CustomerEditFormState>(() => toEditFormState(customer));
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
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

  const metrics = useMemo(
    () => deriveCustomerMetrics({ customer: customerRecord, relatedJobs, invoices, estimates, inspections, activeJobs }),
    [activeJobs, customerRecord, estimates, inspections, invoices, relatedJobs],
  );

  const formattedAddress = formatAddress(
    customerRecord.service_address_line_1,
    customerRecord.service_address_line_2,
    customerRecord.service_city,
    customerRecord.service_state_or_region,
    customerRecord.service_postal_code,
  );
  const mapsHref = buildMapsHref(customerRecord);

  const tags = useMemo(() => {
    const result: string[] = [];
    const lifecycle = formatLifecycleStatus(customerRecord.lifecycle_status);
    if (lifecycle) result.push(lifecycle);
    if (metrics.openBalanceCents > 0) result.push(t("balanceDue"));
    if (metrics.activeJobs > 0) result.push(t("openJobsTag", { count: metrics.activeJobs }));
    if (customerRecord.preferred_service_type) {
      result.push(getServiceTypeLabel(customerRecord.preferred_service_type, locale));
    }
    return result;
  }, [customerRecord.lifecycle_status, customerRecord.preferred_service_type, locale, metrics.activeJobs, metrics.openBalanceCents, t]);

  const tabs = useMemo(() => [
    { id: "info" as const, label: t("overview"), count: 1, icon: UserRound },
    { id: "jobs" as const, label: t("relatedJobs"), count: relatedJobs.length, icon: BriefcaseBusiness },
    { id: "estimates" as const, label: t("estimates"), count: estimates.length, icon: FileText },
    { id: "invoices" as const, label: t("invoices"), count: invoices.length, icon: Receipt },
    { id: "inspections" as const, label: t("inspections"), count: inspections.length, icon: ShieldCheck },
  ], [estimates.length, inspections.length, invoices.length, relatedJobs.length, t]);

  const serviceTypeOptions: ServiceType[] = ["inspection", "cleaning", "repair", "rebuild"];

  function updateEditField<Key extends keyof CustomerEditFormState>(key: Key, value: CustomerEditFormState[Key]) {
    setEditForm((current) => ({ ...current, [key]: value }));
  }

  function openEditPanel() {
    setEditForm(toEditFormState(customerRecord));
    setIsEditingCustomer(true);
    setSaveError(null);
    setSaveSuccess(null);
  }

  function closeEditPanel() {
    setIsEditingCustomer(false);
    setSaveError(null);
  }

  async function saveCustomerEdits() {
    const fullName = trimRequired(editForm.fullName);
    const phone = trimRequired(editForm.phone);
    const serviceAddressLine1 = trimRequired(editForm.serviceAddressLine1);
    const serviceCity = trimRequired(editForm.serviceCity);
    const servicePostalCode = trimRequired(editForm.servicePostalCode);

    if (!fullName || !phone || !serviceAddressLine1 || !serviceCity || !servicePostalCode) {
      setSaveError("Please fill customer name, phone, service address, city, and postal code before saving.");
      setSaveSuccess(null);
      return;
    }

    setSavePending(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const updatedCustomer = await crmApiFetch<CustomerRecord>(`/api/customers/${customerRecord.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName,
          phone,
          email: trimOptional(editForm.email),
          companyName: trimOptional(editForm.companyName),
          serviceAddressLine1,
          serviceAddressLine2: trimOptional(editForm.serviceAddressLine2),
          serviceCity,
          serviceStateOrRegion: trimOptional(editForm.serviceStateOrRegion),
          servicePostalCode,
          notes: trimOptional(editForm.notes),
          preferredServiceType: editForm.preferredServiceType || null,
        }),
      });

      setCustomerRecord(updatedCustomer);
      setEditForm(toEditFormState(updatedCustomer));
      setIsEditingCustomer(false);
      setSaveSuccess("Customer details were saved.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The customer details could not be saved.");
    } finally {
      setSavePending(false);
    }
  }

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

  const infoPanelProps = {
    customerRecord,
    relatedJobs,
    invoices,
    activeJobs,
    totalRevenueCents,
    isEditingCustomer,
    editForm,
    savePending,
    saveError,
    saveSuccess,
    serviceTypeOptions,
    locale,
    onOpenEdit: openEditPanel,
    onCloseEdit: closeEditPanel,
    onUpdateField: updateEditField,
    onSave: () => void saveCustomerEdits(),
  };

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

  function renderJobsTab(useTimeline: boolean) {
    return (
      <section>
        <TabHeader title={t("relatedJobs")} href={`/jobs/new?customerId=${customerRecord.id}`} actionLabel={t("addNewJob")} />
        {relatedJobs.length === 0 ? (
          <EmptyState label={t("noRelatedJobs")} href={`/jobs/new?customerId=${customerRecord.id}`} actionLabel={t("createJob")} />
        ) : (
          <>
            {useTimeline ? (
              <ActivityFeedList>
                {jobs.pageItems.map((job) => {
                  const technician = relationValue(job.technician);
                  return (
                    <ActivityTimelineCard
                      key={job.id}
                      icon={BriefcaseBusiness}
                      time={formatDateTime(job.scheduled_for, locale)}
                      title={job.title}
                      meta={t("technician", { name: technician?.display_name ?? t("unassigned") })}
                      badge={getJobStatusLabel(job.status, locale)}
                      badgeTone={openJobStatuses.includes(job.status) ? "warning" : "success"}
                      href={`/jobs/${job.id}`}
                    >
                      <p>{getServiceTypeLabel(job.requested_service_type, locale)}</p>
                      {job.scheduled_window ? <p>{job.scheduled_window}</p> : null}
                      {job.description ? <p>{job.description}</p> : null}
                    </ActivityTimelineCard>
                  );
                })}
              </ActivityFeedList>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {jobs.pageItems.map((job) => {
                  const technician = relationValue(job.technician);
                  return (
                    <RecordCard key={job.id} title={job.title} href={`/jobs/${job.id}`} badge={getJobStatusLabel(job.status, locale)} badgeTone={openJobStatuses.includes(job.status) ? "warning" : "success"}>
                      <p>{getServiceTypeLabel(job.requested_service_type, locale)}</p>
                      <p>{formatDateTime(job.scheduled_for, locale)}{job.scheduled_window ? ` - ${job.scheduled_window}` : ""}</p>
                      <p>{t("technician", { name: technician?.display_name ?? t("unassigned") })}</p>
                    </RecordCard>
                  );
                })}
              </div>
            )}
            <PaginationFooter page={jobs.currentPage} totalPages={jobs.totalPages} totalCount={relatedJobs.length} onPageChange={(page) => setPage("jobsPage", page)} />
          </>
        )}
      </section>
    );
  }

  function renderEstimatesTab(useTimeline: boolean) {
    return (
      <section>
        <TabHeader title={t("estimates")} href={`/estimates/new?customerId=${customerRecord.id}`} actionLabel={t("addNewEstimate")} />
        {estimates.length === 0 ? (
          <EmptyState label={t("noEstimates")} href={`/estimates/new?customerId=${customerRecord.id}`} actionLabel={t("createEstimate")} />
        ) : (
          <>
            {useTimeline ? (
              <ActivityFeedList>
                {pagedEstimates.pageItems.map((estimate) => (
                  <ActivityTimelineCard
                    key={estimate.id}
                    icon={FileText}
                    time={t("sentDate", { date: formatOptionalDate(estimate.sent_at, locale) })}
                    title={estimate.document_number}
                    meta={estimate.job_title}
                    badge={formatEstimateStatus(estimate.lifecycle_status)}
                    badgeTone={estimateBadgeTone(estimate.lifecycle_status)}
                    amount={formatCurrency(estimate.price_cents, locale)}
                    href={`/estimates/${estimate.id}`}
                  >
                    {estimate.description ? <p>{estimate.description}</p> : null}
                  </ActivityTimelineCard>
                ))}
              </ActivityFeedList>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {pagedEstimates.pageItems.map((estimate) => (
                  <RecordCard key={estimate.id} title={estimate.document_number} href={`/estimates/${estimate.id}`} badge={formatEstimateStatus(estimate.lifecycle_status)} badgeTone={estimateBadgeTone(estimate.lifecycle_status)}>
                    <p>{estimate.job_title}</p>
                    <p>{formatCurrency(estimate.price_cents, locale)}</p>
                    <p>{t("sentDate", { date: formatOptionalDate(estimate.sent_at, locale) })}</p>
                  </RecordCard>
                ))}
              </div>
            )}
            <PaginationFooter page={pagedEstimates.currentPage} totalPages={pagedEstimates.totalPages} totalCount={estimates.length} onPageChange={(page) => setPage("estimatesPage", page)} />
          </>
        )}
      </section>
    );
  }

  function renderInvoicesTab(useTimeline: boolean) {
    return (
      <section>
        <TabHeader title={t("invoices")} href={`/invoices/new?customerId=${customerRecord.id}`} actionLabel={t("addNewInvoice")} />
        {invoices.length === 0 ? (
          <EmptyState label={t("noInvoices")} href={`/invoices/new?customerId=${customerRecord.id}`} actionLabel={t("createInvoice")} />
        ) : (
          <>
            {useTimeline ? (
              <ActivityFeedList>
                {pagedInvoices.pageItems.map((invoice) => (
                  <ActivityTimelineCard
                    key={invoice.id}
                    icon={Receipt}
                    time={formatDate(invoice.issued_at, locale)}
                    title={invoice.document_number}
                    meta={invoice.job_title}
                    badge={formatInvoiceStatus(invoice.lifecycle_status)}
                    badgeTone={invoiceBadgeTone(invoice.lifecycle_status)}
                    amount={formatCurrency(invoice.total_cents, locale)}
                    href={`/invoices/${invoice.id}`}
                  >
                    <p>{t("invoiceBalance", { amount: formatCurrency(invoice.balance_cents, locale) })}</p>
                  </ActivityTimelineCard>
                ))}
              </ActivityFeedList>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {pagedInvoices.pageItems.map((invoice) => (
                  <RecordCard key={invoice.id} title={invoice.document_number} href={`/invoices/${invoice.id}`} badge={formatInvoiceStatus(invoice.lifecycle_status)} badgeTone={invoiceBadgeTone(invoice.lifecycle_status)}>
                    <p>{invoice.job_title}</p>
                    <p>{t("invoiceTotal", { amount: formatCurrency(invoice.total_cents, locale) })}</p>
                    <p>{t("invoiceBalance", { amount: formatCurrency(invoice.balance_cents, locale) })}</p>
                  </RecordCard>
                ))}
              </div>
            )}
            <PaginationFooter page={pagedInvoices.currentPage} totalPages={pagedInvoices.totalPages} totalCount={invoices.length} onPageChange={(page) => setPage("invoicesPage", page)} />
          </>
        )}
      </section>
    );
  }

  function renderInspectionsTab(useTimeline: boolean) {
    return (
      <section>
        <TabHeader title={t("inspections")} href="/inspections" actionLabel={t("openInspections")} />
        {inspections.length === 0 ? (
          <EmptyState label={t("noInspections")} href="/inspections" actionLabel={t("openInspections")} />
        ) : (
          <>
            {useTimeline ? (
              <ActivityFeedList>
                {pagedInspections.pageItems.map((inspection) => (
                  <ActivityTimelineCard
                    key={inspection.id}
                    icon={ClipboardList}
                    time={t("updated", { date: formatDateTime(inspection.updated_at, locale) })}
                    title={inspection.client_name ?? t("inspections")}
                    meta={reportTypeLabel(inspection.report_type)}
                    badge={inspection.status}
                    badgeTone={inspectionBadgeTone(inspection.status)}
                    href={`/inspections/${inspection.id}/workspace`}
                  >
                    <p>{inspection.address ?? t("noAddressSnapshot")}</p>
                  </ActivityTimelineCard>
                ))}
              </ActivityFeedList>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {pagedInspections.pageItems.map((inspection) => (
                  <RecordCard key={inspection.id} title={inspection.client_name ?? t("inspections")} href={`/inspections/${inspection.id}/workspace`} badge={inspection.status} badgeTone={inspectionBadgeTone(inspection.status)}>
                    <p>{reportTypeLabel(inspection.report_type)}</p>
                    <p>{inspection.address ?? t("noAddressSnapshot")}</p>
                    <p>{t("updated", { date: formatDateTime(inspection.updated_at, locale) })}</p>
                  </RecordCard>
                ))}
              </div>
            )}
            <PaginationFooter page={pagedInspections.currentPage} totalPages={pagedInspections.totalPages} totalCount={inspections.length} onPageChange={(page) => setPage("inspectionsPage", page)} />
          </>
        )}
      </section>
    );
  }

  if (SHOW_LEGACY_CUSTOMER_PROFILE) {
    return (
      <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
        <div className="mx-auto max-w-6xl px-6 py-6 lg:px-10">
          <section className="theme-surface-modal overflow-hidden rounded-[36px] border border-[color:var(--cmp-border-subtle)] shadow-[0_32px_90px_rgba(15,23,42,0.08)]">
            <div className="p-5 sm:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">{t("profile")}</p>
                  <h1 className="mt-3 max-w-3xl font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                    {customerRecord.full_name}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                    {t("description")}
                  </p>
                </div>

                <div className="grid min-w-[240px] gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <article className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">{t("totalRevenue")}</p>
                    <p className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{formatCurrency(totalRevenueCents, locale)}</p>
                  </article>
                  <article className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">{t("totalInvoices")}</p>
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
                  <CustomerInfoPanel {...infoPanelProps} />
                  {canMintPortalMagicLink ? <CustomerPortalMintSection customerId={customerRecord.id} className="mt-5" /> : null}
                </>
              ) : null}
              {safeActiveTab === "jobs" ? renderJobsTab(false) : null}
              {safeActiveTab === "estimates" ? renderEstimatesTab(false) : null}
              {safeActiveTab === "invoices" ? renderInvoicesTab(false) : null}
              {safeActiveTab === "inspections" ? renderInspectionsTab(false) : null}
            </div>
          </section>
        </div>
      </main>
    );
  }

  const nextVisitLabel = metrics.nextVisitJob
    ? formatDate(metrics.nextVisitJob.scheduled_for, locale)
    : t("noScheduledVisit");
  const lastActivityLabel = metrics.lastActivityMs > 0
    ? formatRelativeActivity(metrics.lastActivityMs, locale)
    : t("noActivityYet");

  return (
    <BoardShell gridOpacity="subtle">
      <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8">
        <header className="mb-6 rounded-[34px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
                  <Sparkles className="h-4 w-4" />
                </span>
                <p className="text-xs uppercase tracking-[0.34em] text-[color:var(--sem-accent-primary)]">{t("customer360")}</p>
              </div>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] md:text-5xl">
                {customerRecord.full_name}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                {t("description")}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={`/messaging?lane=customers&customerId=${customerRecord.id}`} className="theme-btn-secondary rounded-2xl px-4 py-3 text-sm font-medium">
                {t("sendSms")}
              </Link>
              <Link href={`/jobs/new?customerId=${customerRecord.id}`} className="theme-btn-primary rounded-2xl px-4 py-3 text-sm font-semibold">
                {t("addNewJob")}
              </Link>
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile icon={BadgeDollarSign} label={t("totalRevenue")} value={formatCurrency(metrics.totalRevenueCents, locale)} helper={t("invoicesSummary", { count: invoices.length, total: formatCurrency(metrics.totalRevenueCents, locale) })} />
          <MetricTile icon={AlertTriangle} label={t("openBalance")} value={formatCurrency(metrics.openBalanceCents, locale)} helper={metrics.unpaidInvoiceCount > 0 ? t("unpaidInvoicesSnapshot", { count: metrics.unpaidInvoiceCount, amount: formatCurrency(metrics.openBalanceCents, locale) }) : t("totalInvoices")} />
          <MetricTile icon={CalendarClock} label={t("nextVisit")} value={nextVisitLabel} helper={metrics.nextVisitJob?.title ?? t("noScheduledVisit")} />
          <MetricTile icon={Activity} label={t("lastActivity")} value={lastActivityLabel} helper={formatDate(customerRecord.updated_at, locale)} />
        </section>

        {loadError ? (
          <div className="theme-alert-error mb-6 rounded-[20px] border px-4 py-3 text-sm">{loadError}</div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(320px,390px)_minmax(0,1fr)]">
          <CustomerContextSidebar
            customerRecord={customerRecord}
            metrics={metrics}
            tags={tags}
            formattedAddress={formattedAddress}
            mapsHref={mapsHref}
            canMintPortalMagicLink={canMintPortalMagicLink}
            locale={locale}
          />

          <section className="rounded-[34px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 border-b border-[color:var(--cmp-border-subtle)] pb-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--sem-text-muted)]">{t("unifiedActivityFeed")}</p>
                <h2 className="mt-2 font-[family:var(--font-flat-display)] text-3xl tracking-tight text-[color:var(--sem-display-headline)]">{t("activityFeedTitle")}</h2>
              </div>
            </div>

            <div className="mt-5">
              <FilterPillBar tabs={tabs} activeTab={safeActiveTab} onSelect={setTab} />
            </div>

            <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0">
                {safeActiveTab === "info" ? <CustomerInfoPanel {...infoPanelProps} /> : null}
                {safeActiveTab === "jobs" ? renderJobsTab(true) : null}
                {safeActiveTab === "estimates" ? renderEstimatesTab(true) : null}
                {safeActiveTab === "invoices" ? renderInvoicesTab(true) : null}
                {safeActiveTab === "inspections" ? renderInspectionsTab(true) : null}
              </div>

              <OperationalSnapshotPanel
                metrics={metrics}
                relatedJobsCount={relatedJobs.length}
                inspectionsCount={inspections.length}
                locale={locale}
              />
            </div>
          </section>
        </div>
      </div>
    </BoardShell>
  );
}
