import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  CloudSun,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { SessionRole } from "@/lib/auth/server-session";
import { formatDateTime } from "@/lib/crm/display";
import type {
  DashboardControlItem,
  OfficeDashboardResponse,
} from "@/lib/crm/home-dashboard-types";
import { formatCurrencyFromCents } from "@/lib/crm/invoice-line-model";
import { canAccessShellHref } from "@/lib/navigation/shell-nav-policy";

const panelClass =
  "theme-surface-card rounded-[20px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] shadow-[0_12px_40px_color-mix(in_srgb,var(--bg-canvas)_72%,transparent)] backdrop-blur-md";

type QueueConfig = {
  id: "followUps" | "quotes" | "unpaid" | "todayJobs";
  label: string;
  items: DashboardControlItem[];
  fallbackHref: string;
};

function sumAmountCents(items: DashboardControlItem[]) {
  return items.reduce((total, item) => total + (item.amountCents ?? 0), 0);
}

function formatControlPreview(item: DashboardControlItem) {
  const parts = [
    item.customerName || item.title,
    item.amountCents !== null ? formatCurrencyFromCents(item.amountCents) : null,
    item.scheduledFor ? formatDateTime(item.scheduledFor) : null,
    item.statusLabel || null,
  ].filter(Boolean);

  return parts.join(" · ");
}

function resolveQueueItemHref(item: DashboardControlItem, fallbackHref: string) {
  if (item.jobId) {
    return `/jobs/${item.jobId}`;
  }

  return fallbackHref;
}

function resolveSafeFallbackHref(role: SessionRole | null, preferredHref: string) {
  if (canAccessShellHref(preferredHref, role)) {
    return preferredHref;
  }

  if (canAccessShellHref("/jobs", role)) {
    return "/jobs";
  }

  return "/home";
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
  const queueConfigs: QueueConfig[] = [
    {
      id: "followUps",
      label: t("followUps"),
      items: controls.followUpsNeeded,
      fallbackHref: resolveSafeFallbackHref(role, "/calls"),
    },
    {
      id: "quotes",
      label: t("salesQueue"),
      items: controls.quotesWaitingApproval,
      fallbackHref: resolveSafeFallbackHref(role, "/estimates"),
    },
    {
      id: "unpaid",
      label: t("collectionsQueue"),
      items: controls.unpaidInvoices,
      fallbackHref: resolveSafeFallbackHref(role, "/invoices"),
    },
    {
      id: "todayJobs",
      label: t("todayJobsQueue"),
      items: controls.todaysScheduledJobs,
      fallbackHref: resolveSafeFallbackHref(role, "/jobs"),
    },
  ];

  const priorityQueue = queueConfigs.find((queue) => queue.items.length > 0) ?? null;
  const nextAction = priorityQueue?.items[0] ?? null;
  const nextActionHref = nextAction && priorityQueue
    ? resolveQueueItemHref(nextAction, priorityQueue.fallbackHref)
    : resolveSafeFallbackHref(role, "/jobs");

  const upcomingQueueItems = queueConfigs
    .flatMap((queue) => queue.items.slice(0, 2).map((item) => ({
      id: `${queue.id}-${item.id}`,
      label: queue.label,
      item,
      href: resolveQueueItemHref(item, queue.fallbackHref),
    })))
    .slice(0, 8);

  return (
    <main className="space-y-3 px-4 pb-24 pt-4 text-[color:var(--sem-text-primary)]">
      <header className={`${panelClass} p-4`}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">
            {t("eyebrow")}
          </p>
          <span className="theme-status-success inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
            {t("ready")}
          </span>
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">
          {t("terminalTitle")}
        </h1>
        <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">{t("subtitle")}</p>
      </header>

      <section className={`${panelClass} p-3`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="theme-status-info flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border">
              <CloudSun className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
                {t("fieldConditions")}
              </p>
              <p className="text-xs text-[color:var(--sem-text-secondary)]">{t("routePlanningReady")}</p>
            </div>
          </div>
          <span className="theme-badge shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
            {t("weatherNotConnected")}
          </span>
        </div>
      </section>

      <section className={`${panelClass} overflow-hidden`}>
        <div className="border-b border-[color:var(--cmp-border-subtle)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-accent-primary)]">
              {t("urgentRuntimeContract")}
            </p>
            <span className="theme-badge rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
              {t("nextAction")}
            </span>
          </div>
          <h2 className="mt-2 text-base font-semibold text-[color:var(--sem-display-headline)]">
            {nextAction ? (nextAction.title || nextAction.customerName) : t("noUrgentQueueTitle")}
          </h2>
          <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">
            {nextAction ? formatControlPreview(nextAction) : t("noUrgentQueueSubtitle")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 px-4 py-3">
          <div className="rounded-[14px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
            <div className="flex items-center gap-2 text-[color:var(--sem-state-error)]">
              <CircleDollarSign className="h-4 w-4" />
              <span className="text-[10px] uppercase tracking-[0.16em]">{t("openAr")}</span>
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums">{summary.unpaidInvoices}</p>
            <p className="mt-1 text-[11px] text-[color:var(--sem-text-secondary)]">
              {arExposure > 0
                ? t("openArHelperAmount", {
                  count: summary.unpaidInvoices,
                  amount: formatCurrencyFromCents(arExposure),
                })
                : t("openArHelper", { count: summary.unpaidInvoices })}
            </p>
          </div>
          <div className="rounded-[14px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
            <div className="flex items-center gap-2 text-[color:var(--sem-state-info)]">
              <CalendarDays className="h-4 w-4" />
              <span className="text-[10px] uppercase tracking-[0.16em]">{t("jobsToday")}</span>
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums">{summary.jobsScheduledToday}</p>
            <p className="mt-1 text-[11px] text-[color:var(--sem-text-secondary)]">
              {t("activeJobs")}: {summary.activeJobs}
            </p>
          </div>
        </div>

        <div className="border-t border-[color:var(--cmp-border-subtle)] px-4 pb-4 pt-3">
          <Link
            href={nextActionHref}
            className="theme-btn-primary inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[14px] px-3 py-2 text-sm font-semibold"
          >
            {nextAction ? t("openRecord") : t("openJobsFallback")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className={`${panelClass} overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--cmp-border-subtle)] px-4 py-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
                {t("upcomingQueue")}
              </p>
              <h2 className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{t("pipelineTitle")}</h2>
            </div>
          </div>
          <span className="theme-badge rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
            {upcomingQueueItems.length}
          </span>
        </div>

        {upcomingQueueItems.length > 0 ? (
          <div className="divide-y divide-[color:var(--cmp-border-subtle)]">
            {upcomingQueueItems.map((entry) => (
              <Link
                key={entry.id}
                href={entry.href}
                className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-[color:var(--cmp-hover-surface)]"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--sem-text-muted)]">
                    {entry.label}
                  </p>
                  <p className="truncate text-sm font-medium text-[color:var(--sem-text-primary)]">
                    {entry.item.title || entry.item.customerName}
                  </p>
                  <p className="mt-1 truncate text-xs text-[color:var(--sem-text-secondary)]">
                    {formatControlPreview(entry.item)}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)]" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-[color:var(--sem-text-secondary)]">{t("upcomingQueueEmpty")}</p>
        )}
      </section>
    </main>
  );
}
