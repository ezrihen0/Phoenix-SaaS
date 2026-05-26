import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Command,
  FileText,
  Gauge,
  Hammer,
  PhoneCall,
  Receipt,
  TrendingUp,
} from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";
import TechnicianHomeBoard from "@/components/home/technician-home-board";
import HomeIntelligenceStrip from "@/components/home/intelligence/home-intelligence-strip";
import type { AiBrainHomeBriefResponse } from "@/lib/ai/brain-brief-types";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { fetchBrainHomeBriefSilent } from "@/lib/api/server-brain-home-brief";
import { requireServerSession, type SessionRole } from "@/lib/auth/server-session";
import { formatDateTime } from "@/lib/crm/display";
import { formatCurrencyFromCents } from "@/lib/crm/invoice-line-model";
import {
  isOfficeDashboardResponse,
  type DashboardControlItem,
  type OfficeDashboardResponse,
} from "@/lib/crm/home-dashboard-types";
import { canAccessShellHref } from "@/lib/navigation/shell-nav-policy";

function isOfficeRole(role: SessionRole | null) {
  return role === "owner"
    || role === "admin"
    || role === "office_admin"
    || role === "dispatcher"
    || role === "viewer"
    || role === "csr";
}

const executivePanelClass =
  "theme-surface-card rounded-[24px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] shadow-[0_18px_55px_color-mix(in_srgb,var(--bg-canvas)_72%,transparent)] backdrop-blur-md";
const executiveMonoClass = "font-[family:var(--font-geist-mono)] tabular-nums tracking-tight";
const executiveEyebrowClass = "text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]";
const executiveTitleClass = "font-semibold text-[color:var(--sem-display-headline)]";
const executiveBodyClass = "text-[color:var(--sem-text-secondary)]";
const executiveDividerClass = "border-[color:var(--cmp-border-subtle)]";

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatControlItemDetail(item: DashboardControlItem) {
  const parts = [
    item.amountCents !== null ? formatCurrencyFromCents(item.amountCents) : null,
    item.statusLabel || null,
    item.technicianName || null,
    item.scheduledFor ? formatDateTime(item.scheduledFor) : item.occurredAt ? formatDateTime(item.occurredAt) : null,
    item.addressLabel || null,
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(" · ");
  }

  return item.customerName || item.title;
}

function controlItemHref(item: DashboardControlItem, fallbackHref: string) {
  if (item.jobId) {
    return `/jobs/${item.jobId}`;
  }

  return fallbackHref;
}

function sumAmountCents(items: DashboardControlItem[]) {
  return items.reduce((total, item) => total + (item.amountCents ?? 0), 0);
}

function buildBusinessTape(dashboard: OfficeDashboardResponse) {
  const { summary, controls } = dashboard;
  const arExposure = sumAmountCents(controls.unpaidInvoices);
  const arValue = arExposure > 0 ? formatCurrencyFromCents(arExposure) : String(summary.unpaidInvoices);

  return [
    {
      label: "OPEN A/R",
      value: arValue,
      sub: `${summary.unpaidInvoices} unpaid`,
      tone: summary.unpaidInvoices > 0 ? "red" : "slate",
    },
    {
      label: "JOBS TODAY",
      value: summary.jobsScheduledToday,
      sub: "scheduled",
      tone: "blue",
    },
    {
      label: "ACTIVE JOBS",
      value: summary.activeJobs,
      sub: "in motion",
      tone: "green",
    },
    {
      label: "HOT LEADS",
      value: summary.newLeads,
      sub: "new leads",
      tone: summary.newLeads > 0 ? "amber" : "slate",
    },
    {
      label: "FOLLOW-UP",
      value: controls.followUpsNeeded.length,
      sub: "priority items",
      tone: controls.followUpsNeeded.length > 0 ? "red" : "slate",
    },
    {
      label: "QUOTES",
      value: controls.quotesWaitingApproval.length,
      sub: "waiting approval",
      tone: controls.quotesWaitingApproval.length > 0 ? "amber" : "slate",
    },
  ] as const;
}

function buildPressureIndex(dashboard: OfficeDashboardResponse) {
  const { summary, controls } = dashboard;
  const pipelineDenom = Math.max(summary.newLeads + summary.contactedLeads, 1);

  return [
    {
      label: "A/R Pressure",
      value: clampPercent(summary.unpaidInvoices * 14),
      fill: "var(--sem-state-error)",
    },
    {
      label: "Operational Load",
      value: clampPercent(summary.activeJobs * 5 + summary.jobsScheduledToday * 8),
      fill: "var(--sem-state-info)",
    },
    {
      label: "Unresolved Risk",
      value: clampPercent(controls.followUpsNeeded.length * 18 + controls.quotesWaitingApproval.length * 10),
      fill: "var(--sem-state-error)",
    },
    {
      label: "Pipeline Motion",
      value: clampPercent((summary.contactedLeads / pipelineDenom) * 100),
      fill: "var(--sem-state-warning)",
    },
  ];
}

function toneDotClass(tone: string) {
  if (tone === "red") return "bg-[color:var(--sem-state-error)]";
  if (tone === "amber") return "bg-[color:var(--sem-state-warning)]";
  if (tone === "green") return "bg-[color:var(--sem-state-success)]";
  if (tone === "blue") return "bg-[color:var(--sem-state-info)]";
  return "bg-[color:var(--sem-text-muted)]";
}

function toneBadgeClass(tone: "slate" | "blue" | "green" | "amber" | "red") {
  if (tone === "red") return "theme-status-error inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold";
  if (tone === "amber") return "theme-status-warning inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold";
  if (tone === "green") return "theme-status-success inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold";
  if (tone === "blue") return "theme-status-info inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold";
  return "theme-badge inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold";
}

function toneIconClass(tone: "blue" | "green" | "red" | "amber") {
  if (tone === "red") return "theme-status-error flex h-10 w-10 items-center justify-center rounded-2xl border";
  if (tone === "amber") return "theme-status-warning flex h-10 w-10 items-center justify-center rounded-2xl border";
  if (tone === "green") return "theme-status-success flex h-10 w-10 items-center justify-center rounded-2xl border";
  return "theme-status-info flex h-10 w-10 items-center justify-center rounded-2xl border";
}

function toneMetricIconClass(tone: "blue" | "green" | "red" | "amber") {
  if (tone === "red") return "theme-status-error flex h-11 w-11 items-center justify-center rounded-2xl border";
  if (tone === "amber") return "theme-status-warning flex h-11 w-11 items-center justify-center rounded-2xl border";
  if (tone === "green") return "theme-status-success flex h-11 w-11 items-center justify-center rounded-2xl border";
  return "theme-status-info flex h-11 w-11 items-center justify-center rounded-2xl border";
}

function ExecutiveBadge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "blue" | "green" | "amber" | "red";
}) {
  return (
    <span className={toneBadgeClass(tone)}>
      {children}
    </span>
  );
}

function ExecutiveMetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  helper: string;
  tone: "blue" | "green" | "red" | "amber";
}) {
  return (
    <article className={`${executivePanelClass} p-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className={toneMetricIconClass(tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <ExecutiveBadge tone={tone}>Signal</ExecutiveBadge>
      </div>
      <p className={`mt-5 ${executiveEyebrowClass}`}>{label}</p>
      <p className={`mt-2 text-3xl ${executiveTitleClass} ${executiveMonoClass}`}>{value}</p>
      <p className={`mt-2 text-sm leading-5 ${executiveBodyClass}`}>{helper}</p>
    </article>
  );
}

function ControlListPanel({
  title,
  subtitle,
  items,
  tone,
  icon: Icon,
  fallbackHref,
  emptyLabel,
  openLabel,
}: {
  title: string;
  subtitle: string;
  items: DashboardControlItem[];
  tone: "blue" | "green" | "red" | "amber";
  icon: LucideIcon;
  fallbackHref: string;
  emptyLabel: string;
  openLabel: string;
}) {
  return (
    <section className={`${executivePanelClass} overflow-hidden`}>
      <div className={`flex items-center justify-between border-b ${executiveDividerClass} px-5 py-4`}>
        <div className="flex items-center gap-3">
          <div className={toneIconClass(tone)}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className={executiveEyebrowClass}>{subtitle}</p>
            <h2 className={`mt-1 text-xl ${executiveTitleClass}`}>{title}</h2>
          </div>
        </div>
        <ExecutiveBadge tone={tone}>
          {items.length} {items.length === 1 ? "item" : "items"}
        </ExecutiveBadge>
      </div>
      <div className={`divide-y ${executiveDividerClass}`}>
        {items.length > 0 ? items.slice(0, 6).map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-[color:var(--cmp-hover-surface)]">
            <div className="min-w-0">
              <p className={`truncate text-sm font-semibold ${executiveTitleClass}`}>{item.title || item.customerName}</p>
              <p className={`mt-1 text-sm ${executiveBodyClass}`}>{formatControlItemDetail(item)}</p>
            </div>
            <Link
              href={controlItemHref(item, fallbackHref)}
              className="theme-btn-primary inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
            >
              {openLabel}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )) : (
          <div className={`px-5 py-8 text-sm ${executiveBodyClass}`}>{emptyLabel}</div>
        )}
      </div>
    </section>
  );
}

function PressureIndexPanel({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: Array<{ label: string; value: number; fill: string }>;
}) {
  return (
    <section className={`${executivePanelClass} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={executiveEyebrowClass}>{subtitle}</p>
          <h2 className={`mt-1 text-2xl ${executiveTitleClass}`}>{title}</h2>
        </div>
        <Gauge className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
      </div>
      <div className="mt-5 space-y-4">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className={executiveBodyClass}>{row.label}</span>
              <span className={`font-semibold text-[color:var(--sem-text-primary)] ${executiveMonoClass}`}>{row.value}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[color:var(--cmp-surface-soft)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${row.value}%`, background: row.fill }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExecutiveDeskZones({
  role,
  desks,
}: {
  role: SessionRole | null;
  desks: Array<{
    title: string;
    subtitle: string;
    href: string;
    icon: LucideIcon;
  }>;
}) {
  const visibleDesks = desks.filter((desk) => canAccessShellHref(desk.href, role));

  if (visibleDesks.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {visibleDesks.map((desk) => {
        const Icon = desk.icon;

        return (
          <Link
            key={desk.href}
            href={desk.href}
            className={`${executivePanelClass} block p-5 transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-card)] text-[color:var(--sem-accent-primary)]">
                <Icon className="h-5 w-5" />
              </div>
              <ArrowRight className="h-5 w-5 text-[color:var(--sem-text-muted)]" />
            </div>
            <h3 className={`mt-5 text-xl ${executiveTitleClass}`}>{desk.title}</h3>
            <p className={`mt-2 text-sm leading-6 ${executiveBodyClass}`}>{desk.subtitle}</p>
          </Link>
        );
      })}
    </div>
  );
}

function OwnerExecutiveDesk({
  role,
  officeDashboard,
  brainHomeBrief,
  loadError,
  t,
}: {
  role: SessionRole | null;
  officeDashboard: OfficeDashboardResponse | null;
  brainHomeBrief: AiBrainHomeBriefResponse | null;
  loadError: string | null;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const businessTape = officeDashboard ? buildBusinessTape(officeDashboard) : [];
  const pressureRows = officeDashboard ? buildPressureIndex(officeDashboard) : [];

  const executiveDesks = [
    {
      title: t("desks.revenue.title"),
      subtitle: t("desks.revenue.subtitle"),
      href: "/invoices",
      icon: CircleDollarSign,
    },
    {
      title: t("desks.operations.title"),
      subtitle: t("desks.operations.subtitle"),
      href: "/jobs",
      icon: BriefcaseBusiness,
    },
    {
      title: t("desks.comms.title"),
      subtitle: t("desks.comms.subtitle"),
      href: "/calls",
      icon: PhoneCall,
    },
  ];

  return (
    <BoardShell gridOpacity="subtle">
      <main className="relative mx-auto max-w-[1600px] px-6 py-6 text-[color:var(--sem-text-primary)] lg:px-8">
        <header className={`${executivePanelClass} mb-5 px-5 py-4`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-card)] text-[color:var(--sem-accent-primary)]">
                <Command className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[color:var(--sem-accent-primary)]">
                  {t("commandFloorEyebrow")}
                </p>
                <h1 className={`mt-1 text-3xl tracking-tight ${executiveTitleClass}`}>{t("title")}</h1>
                <p className={`mt-1 text-sm ${executiveBodyClass}`}>{t("officeDescription")}</p>
              </div>
            </div>
            {officeDashboard ? (
              <ExecutiveBadge tone="blue">{t("liveDashboardSnapshot")}</ExecutiveBadge>
            ) : null}
          </div>
        </header>

        {loadError ? (
          <section className="theme-alert-error mb-5 rounded-[20px] border px-5 py-4 text-sm">
            {loadError}
          </section>
        ) : null}

        {officeDashboard ? (
          <>
            <section className={`${executivePanelClass} mb-5 overflow-hidden`}>
              <div className={`flex items-center justify-between border-b ${executiveDividerClass} px-4 py-2`}>
                <div className={`flex items-center gap-2 ${executiveEyebrowClass}`}>
                  <BarChart3 className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                  {t("businessTape.title")}
                </div>
                <span className={`text-[11px] text-[color:var(--sem-text-muted)] ${executiveMonoClass}`}>{t("businessTape.source")}</span>
              </div>
              <div className={`grid grid-cols-2 divide-x divide-y md:grid-cols-3 xl:grid-cols-6 xl:divide-y-0 ${executiveDividerClass}`}>
                {businessTape.map((item) => (
                  <div key={item.label} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]`}>{item.label}</p>
                      <span className={`h-2 w-2 rounded-full ${toneDotClass(item.tone)}`} />
                    </div>
                    <p className={`mt-1 text-xl ${executiveTitleClass} ${executiveMonoClass}`}>{item.value}</p>
                    <p className={`mt-1 text-xs ${executiveBodyClass}`}>{item.sub}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-5">
              <ExecutiveMetricCard
                icon={Hammer}
                label={t("summary.activeJobs.label")}
                value={officeDashboard.summary.activeJobs}
                helper={t("summary.activeJobs.helper")}
                tone="green"
              />
              <ExecutiveMetricCard
                icon={CalendarDays}
                label={t("summary.scheduledToday.label")}
                value={officeDashboard.summary.jobsScheduledToday}
                helper={t("summary.scheduledToday.helper")}
                tone="blue"
              />
              <ExecutiveMetricCard
                icon={CircleDollarSign}
                label={t("summary.unpaidInvoices.label")}
                value={officeDashboard.summary.unpaidInvoices}
                helper={t("summary.unpaidInvoices.helper")}
                tone="red"
              />
              <ExecutiveMetricCard
                icon={ClipboardList}
                label={t("summary.newLeads.label")}
                value={officeDashboard.summary.newLeads}
                helper={t("summary.newLeads.helper")}
                tone="amber"
              />
              <ExecutiveMetricCard
                icon={TrendingUp}
                label={t("summary.contactedLeads.label")}
                value={officeDashboard.summary.contactedLeads}
                helper={t("summary.contactedLeads.helper")}
                tone="blue"
              />
            </section>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="space-y-6">
                {canAccessShellHref("/invoices", role) ? (
                  <ControlListPanel
                    title={t("panels.revenuePressure.title")}
                    subtitle={t("panels.revenuePressure.subtitle")}
                    items={officeDashboard.controls.unpaidInvoices}
                    tone="red"
                    icon={Receipt}
                    fallbackHref="/invoices"
                    emptyLabel={t("panels.revenuePressure.empty")}
                    openLabel={t("panels.open")}
                  />
                ) : null}
                {canAccessShellHref("/estimates", role) ? (
                  <ControlListPanel
                    title={t("panels.salesDesk.title")}
                    subtitle={t("panels.salesDesk.subtitle")}
                    items={officeDashboard.controls.quotesWaitingApproval}
                    tone="amber"
                    icon={FileText}
                    fallbackHref="/estimates"
                    emptyLabel={t("panels.salesDesk.empty")}
                    openLabel={t("panels.open")}
                  />
                ) : null}
              </div>
              <div className="space-y-6">
                <HomeIntelligenceStrip brief={brainHomeBrief} variant="executive" />
                <PressureIndexPanel
                  title={t("pressureIndex.title")}
                  subtitle={t("pressureIndex.subtitle")}
                  rows={pressureRows}
                />
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <ControlListPanel
                title={t("panels.jobBoard.title")}
                subtitle={t("panels.jobBoard.subtitle")}
                items={officeDashboard.controls.todaysScheduledJobs}
                tone="blue"
                icon={BriefcaseBusiness}
                fallbackHref="/jobs"
                emptyLabel={t("panels.jobBoard.empty")}
                openLabel={t("panels.open")}
              />
              <ControlListPanel
                title={t("panels.commsQueue.title")}
                subtitle={t("panels.commsQueue.subtitle")}
                items={officeDashboard.controls.followUpsNeeded}
                tone="red"
                icon={PhoneCall}
                fallbackHref="/calls"
                emptyLabel={t("panels.commsQueue.empty")}
                openLabel={t("panels.open")}
              />
            </div>
          </>
        ) : null}

        <div className="mt-6">
          <ExecutiveDeskZones role={role} desks={executiveDesks} />
        </div>
      </main>
    </BoardShell>
  );
}

export default async function HomePage() {
  const session = await requireServerSession("/home");
  const role = session.profile?.role ?? null;
  const t = await getTranslations("home");
  const technicianRole = role === "technician";
  const officeRole = isOfficeRole(role);

  let officeDashboard: OfficeDashboardResponse | null = null;
  let brainHomeBrief: AiBrainHomeBriefResponse | null = null;
  let loadError: string | null = null;

  if (officeRole) {
    try {
      const payload = await serverApiFetch<unknown>("/api/dashboard");
      if (isOfficeDashboardResponse(payload)) {
        officeDashboard = payload;
      } else {
        loadError = t("loadError");
      }
    } catch {
      loadError = t("loadError");
    }

    if (officeDashboard) {
      brainHomeBrief = await fetchBrainHomeBriefSilent();
    }
  }

  if (technicianRole) {
    return (
      <BoardShell gridOpacity="subtle">
        <main className="px-6 py-10 lg:px-10">
          <div className="mx-auto max-w-7xl space-y-6">
            <section className="theme-surface-modal rounded-[34px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] p-7 sm:p-8">
              <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">{t("subtitle")}</p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] sm:text-5xl">
                {t("title")}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                {t("technicianDescription")}
              </p>
              <p className="mt-4 inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
                {t("technicianBoard")}
              </p>
            </section>
            <TechnicianHomeBoard />
          </div>
        </main>
      </BoardShell>
    );
  }

  if (!officeRole) {
    return (
      <BoardShell gridOpacity="subtle">
        <main className="relative mx-auto max-w-[1600px] px-6 py-6 lg:px-8">
          <section className={`${executivePanelClass} p-5 text-sm ${executiveBodyClass}`}>
            {t("noDashboard")}
          </section>
        </main>
      </BoardShell>
    );
  }

  return (
    <OwnerExecutiveDesk
      role={role}
      officeDashboard={officeDashboard}
      brainHomeBrief={brainHomeBrief}
      loadError={loadError}
      t={t}
    />
  );
}
