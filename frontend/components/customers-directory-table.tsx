"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ClipboardList,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

import { MasterMobileList } from "@/components/master-table";
import { deleteCustomers } from "@/lib/crm/customers-api";
import {
  activeJobCount,
  companyBadgeClass,
  customerLifecycleBadgeClass,
  customerLifecycleLabel,
  formatCustomerAddress,
  getCustomerInitials,
  hasCompanyOnFile,
  isNewThisMonth,
  resolveCustomerLifecycleStatus,
  type CustomerListItem,
} from "@/lib/crm/customer-directory-display";
import { formatDate } from "@/lib/crm/display";

type CustomersDirectoryTableProps = {
  customers: CustomerListItem[];
  canManageCustomers: boolean;
};

export function CustomersDirectoryTable({
  customers,
  canManageCustomers,
}: CustomersDirectoryTableProps) {
  const t = useTranslations("customers");
  const locale = useLocale();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const customerIds = useMemo(() => customers.map((customer) => customer.id), [customers]);
  const allSelected = customerIds.length > 0 && customerIds.every((id) => selectedIds.includes(id));
  const someSelected = selectedIds.length > 0;

  function toggleCustomer(customerId: string) {
    setSelectedIds((current) => (
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId]
    ));
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? [] : customerIds);
  }

  function handleDeleteSelected() {
    if (selectedIds.length === 0) {
      return;
    }

    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(t("deleteSelectedConfirm", { count: selectedIds.length }));

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      setMessage(null);
      setErrorMessage(null);

      try {
        const result = await deleteCustomers(selectedIds);

        if (result.deleted.length > 0 && result.failed.length === 0) {
          setMessage(t("deleteSuccess", { count: result.deleted.length }));
        } else if (result.deleted.length > 0 && result.failed.length > 0) {
          setMessage(t("deletePartial", { deleted: result.deleted.length, failed: result.failed.length }));
          setErrorMessage(result.failed.map((failure) => failure.message).join(" "));
        } else {
          setErrorMessage(result.failed[0]?.message ?? t("deleteFailed"));
        }

        setSelectedIds((current) => current.filter((id) => !result.deleted.includes(id)));
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : t("deleteFailed"));
      }
    });
  }

  function renderCustomerTableRow(customer: CustomerListItem) {
    const lifecycleStatus = resolveCustomerLifecycleStatus(customer);
    const openJobs = activeJobCount(customer);
    const hasCompany = hasCompanyOnFile(customer);
    const isNew = isNewThisMonth(customer.created_at);
    const formattedAddress = formatCustomerAddress(customer);
    const isSelected = selectedIds.includes(customer.id);

    return (
      <tr
        key={customer.id}
        className={`group border-b border-[color:var(--cmp-border-subtle)] transition hover:bg-[color:var(--cmp-surface-soft)] ${isSelected ? "bg-[color:var(--cmp-selected-surface)]/40" : ""}`}
      >
        {canManageCustomers ? (
          <td className="w-12 py-4 pl-5 pr-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleCustomer(customer.id)}
              aria-label={`Select ${customer.full_name}`}
              className="h-4 w-4"
            />
          </td>
        ) : null}
        <td className={`py-4 ${canManageCustomers ? "pr-4" : "pl-5 pr-4"}`}>
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
    const formattedAddress = formatCustomerAddress(customer);
    const isSelected = selectedIds.includes(customer.id);

    return (
      <article
        key={customer.id}
        className={`rounded-[26px] border bg-[color:var(--cmp-surface-card)]/80 p-4 shadow-[0_20px_60px_color-mix(in_srgb,var(--sem-board-glow)_22%,transparent)] ${isSelected ? "border-[color:var(--cmp-border-accent)]" : "border-[color:var(--cmp-border-subtle)]"}`}
      >
        {canManageCustomers ? (
          <label className="mb-3 flex items-center gap-2 text-sm text-[color:var(--sem-text-secondary)]">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleCustomer(customer.id)}
              className="h-4 w-4"
            />
            <span>Select</span>
          </label>
        ) : null}
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

  return (
    <>
      {canManageCustomers && someSelected ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] px-4 py-3">
          <p className="text-sm font-medium text-[color:var(--sem-text-primary)]">
            {t("selectedCount", { count: selectedIds.length })}
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={handleDeleteSelected}
            className="theme-control-surface inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold text-red-300 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            {isPending ? t("deleteSelected") + "…" : t("deleteSelected")}
          </button>
        </div>
      ) : null}

      <div className="mt-6 hidden overflow-hidden rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]/30 lg:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/70 text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">
            <tr>
              {canManageCustomers ? (
                <th className="w-12 py-4 pl-5 pr-2 font-medium">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label={t("selectAllOnPage")}
                    className="h-4 w-4"
                  />
                </th>
              ) : null}
              <th className={`py-4 font-medium ${canManageCustomers ? "pr-4" : "pl-5 pr-4"}`}>{t("columns.customerName")}</th>
              <th className="px-4 py-4 font-medium">{t("columns.phone")}</th>
              <th className="px-4 py-4 font-medium">{t("columns.email")}</th>
              <th className="px-4 py-4 font-medium">Status</th>
              <th className="px-4 py-4 font-medium">Summary</th>
              <th className="py-4 pl-4 pr-5 text-right font-medium">{t("columns.actions")}</th>
            </tr>
          </thead>
          <tbody>{customers.map((customer) => renderCustomerTableRow(customer))}</tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 lg:hidden">
        <MasterMobileList items={customers} emptyState={t("noCustomers")} renderItem={renderCustomerMobileCard} />
      </div>

      {message ? <p className="mt-4 text-sm text-[color:var(--sem-accent-primary)]">{message}</p> : null}
      {errorMessage ? <p className="mt-4 text-sm text-red-400">{errorMessage}</p> : null}
    </>
  );
}
