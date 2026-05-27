import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Flame,
  Hammer,
  PhoneCall,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { formatCurrencyFromCents } from "@/lib/crm/invoice-line-model";
import type {
  DashboardControlItem,
  OfficeDashboardResponse,
} from "@/lib/crm/home-dashboard-types";
import { canAccessShellHref } from "@/lib/navigation/shell-nav-policy";
import type { SessionRole } from "@/lib/auth/server-session";
import { formatDateTime } from "@/lib/crm/display";

const panelClass =
  "theme-surface-card rounded-[20px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] shadow-[0_12px_40px_color-mix(in_srgb,var(--bg-canvas)_72%,transparent)] backdrop-blur-md";

function sumAmountCents(items: DashboardControlItem[]) {
  return items.reduce((total, item) => total + (item.amountCents ?? 0), 0);
}

function formatControlPreview(item: DashboardControlItem) {
  const parts = [
    item.customerName || item.title,
    item.amountCents !== null ? formatCurrencyFromCents(item.amountCents) : null,
    item.scheduledFor ? formatDateTime(item.scheduledFor) : null,
  ].filter(Boolean);

  return parts.join(" · ");
}

type MobileHomeBoardProps = {
  role: SessionRole | null;
  dashboard: OfficeDashboardResponse | null;
  loadError: string | null;
};

export default async function MobileHomeBoard({
  role,
  dashboard,
  loadError,
}: MobileHomeBoardProps) {
  const t = await getTranslations("home.mobile");

  if (loadError) {
    return (
      <main className="px-4 py-4 text-[color:var(--sem-text-primary)]">
        <section className="theme-alert-error rounded-[20px] border px-4 py-3 text-sm">{loadError}</section>
      </main>
    );
  }

  if (!dashboard) {
    return null;
  }

  const { summary, controls } = dashboard;
  const arExposure = sumAmountCents(controls.unpaidInvoices);
  const followUps = controls.followUpsNeeded.slice(0, 3);
  const canLeads = canAccessShellHref("/leads", role);
  const canCalls = canAccessShellHref("/calls", role);
  const canInvoices = canAccessShellHref("/invoices", role);
  const canJobs = canAccessShellHref("/jobs", role);

  return (
    <main className="space-y-4 px-4 py-4 text-[color:var(--sem-text-primary)]">
      <header className={`${panelClass} p-4`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">
          {t("eyebrow")}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">{t("subtitle")}</p>
      </header>

      <section className={`${panelClass} p-4`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">
          {t("todaySummary")}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
            <div className="flex items-center gap-2 text-[color:var(--sem-state-info)]">
              <CalendarDays className="h-4 w-4" />
              <span className="text-[10px] uppercase tracking-[0.16em]">{t("jobsToday")}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{summary.jobsScheduledToday}</p>
          </div>
          <div className="rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
            <div className="flex items-center gap-2 text-[color:var(--sem-state-success)]">
              <Hammer className="h-4 w-4" />
              <span className="text-[10px] uppercase tracking-[0.16em]">{t("activeJobs")}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{summary.activeJobs}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-3">
        {canLeads ? (
          <Link
            href="/leads"
            className={`${panelClass} flex items-center justify-between gap-3 p-4 transition hover:border-[color:var(--cmp-border-accent)]`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="theme-status-warning flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border">
                <Flame className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{t("newLeads")}</p>
                <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">
                  {t("newLeadsHelper", { count: summary.newLeads })}
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
          </Link>
        ) : null}

        {canCalls ? (
          <Link
            href="/calls"
            className={`${panelClass} flex items-center justify-between gap-3 p-4 transition hover:border-[color:var(--cmp-border-accent)]`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="theme-status-info flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border">
                <PhoneCall className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{t("callsDesk")}</p>
                <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">{t("callsDeskHelper")}</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
          </Link>
        ) : null}

        {canJobs ? (
          <Link
            href="/jobs"
            className={`${panelClass} flex items-center justify-between gap-3 p-4 transition hover:border-[color:var(--cmp-border-accent)]`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="theme-status-info flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border">
                <BriefcaseBusiness className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{t("operationsDesk")}</p>
                <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">{t("operationsDeskHelper")}</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
          </Link>
        ) : null}

        {canInvoices ? (
          <Link
            href="/invoices"
            className={`${panelClass} flex items-center justify-between gap-3 p-4 transition hover:border-[color:var(--cmp-border-accent)]`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="theme-status-error flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border">
                <CircleDollarSign className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{t("openAr")}</p>
                <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">
                  {arExposure > 0
                    ? t("openArHelperAmount", {
                        count: summary.unpaidInvoices,
                        amount: formatCurrencyFromCents(arExposure),
                      })
                    : t("openArHelper", { count: summary.unpaidInvoices })}
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
          </Link>
        ) : null}
      </div>

      <section className={`${panelClass} overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--cmp-border-subtle)] px-4 py-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
                {t("followUps")}
              </p>
              <h2 className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{t("followUpsTitle")}</h2>
            </div>
          </div>
          <span className="theme-badge rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
            {controls.followUpsNeeded.length}
          </span>
        </div>
        {followUps.length > 0 ? (
          <div className="divide-y divide-[color:var(--cmp-border-subtle)]">
            {followUps.map((item) => (
              <div key={item.id} className="px-4 py-3">
                <p className="truncate text-sm font-medium text-[color:var(--sem-text-primary)]">
                  {item.title || item.customerName}
                </p>
                <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">{formatControlPreview(item)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-[color:var(--sem-text-secondary)]">{t("followUpsEmpty")}</p>
        )}
      </section>
    </main>
  );
}
