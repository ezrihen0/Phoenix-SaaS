import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  CalendarDays,
  ClipboardList,
  Hammer,
  Phone,
  Receipt,
} from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";
import { MetricTile } from "@/components/board/metric-tile";
import { SectionFrame } from "@/components/board/section-frame";
import TechnicianHomeBoard from "@/components/home/technician-home-board";
import HomeIntelligenceStrip from "@/components/home/intelligence/home-intelligence-strip";
import type { AiBrainHomeBriefResponse } from "@/lib/ai/brain-brief-types";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { fetchBrainHomeBriefSilent } from "@/lib/api/server-brain-home-brief";
import { requireServerSession, type SessionRole } from "@/lib/auth/server-session";
import {
  isOfficeDashboardResponse,
  type OfficeDashboardResponse,
} from "@/lib/crm/home-dashboard-types";
import { canAccessShellHref } from "@/lib/navigation/shell-nav-policy";

function isOfficeRole(role: SessionRole | null) {
  return role === "owner"
    || role === "admin"
    || role === "office_admin"
    || role === "dispatcher"
    || role === "viewer";
}

type QuickLinkZone = {
  title: string;
  items: Array<{ href: string; label: string }>;
};

function OfficeCommandZones({
  role,
  zones,
}: {
  role: SessionRole | null;
  zones: QuickLinkZone[];
}) {
  const visibleZones = zones
    .map((zone) => ({
      ...zone,
      items: zone.items.filter((item) => canAccessShellHref(item.href, role)),
    }))
    .filter((zone) => zone.items.length > 0);

  if (visibleZones.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {visibleZones.map((zone) => (
        <SectionFrame key={zone.title} subtitle="Command zone" title={zone.title}>
          <div className="flex flex-wrap gap-2">
            {zone.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="theme-control-surface inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </SectionFrame>
      ))}
    </div>
  );
}

export default async function HomePage() {
  const session = await requireServerSession("/home");
  const role = session.profile?.role ?? null;
  const t = await getTranslations("home");
  const shellT = await getTranslations("shell.nav");
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

  const commandZones: QuickLinkZone[] = [
    {
      title: t("zones.revenue"),
      items: [
        { href: "/invoices", label: shellT("invoices") },
        { href: "/estimates", label: shellT("estimates") },
        { href: "/leads", label: shellT("leads") },
      ],
    },
    {
      title: t("zones.operations"),
      items: [
        { href: "/jobs", label: shellT("jobs") },
        { href: "/schedule", label: shellT("schedule") },
        { href: "/dispatch", label: shellT("dispatch") },
        { href: "/inspections", label: shellT("inspections") },
        { href: "/automations", label: shellT("automations") },
      ],
    },
    {
      title: t("zones.communications"),
      items: [
        { href: "/calls", label: shellT("calls") },
        { href: "/messaging", label: shellT("messaging") },
        { href: "/marketing", label: shellT("marketing") },
      ],
    },
  ];

  return (
    <BoardShell>
      <main className="px-6 py-10 lg:px-10">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="theme-surface-modal rounded-[34px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] p-7 sm:p-8">
            <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">{t("commandFloorEyebrow")}</p>
            <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] sm:text-5xl">
              {t("title")}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
              {t("officeDescription")}
            </p>
            <p className="mt-4 inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
              {t("liveDashboardSnapshot")}
            </p>
          </header>

          {officeRole ? (
            <HomeIntelligenceStrip brief={brainHomeBrief} />
          ) : null}

          {loadError ? (
            <section className="theme-alert-error rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-5 py-4 text-sm text-[color:var(--sem-text-secondary)]">
              {loadError}
            </section>
          ) : null}

          {officeRole && officeDashboard ? (
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <MetricTile
                icon={Hammer}
                label={t("summary.activeJobs.label")}
                value={officeDashboard.summary.activeJobs}
                helper={t("summary.activeJobs.helper")}
              />
              <MetricTile
                icon={CalendarDays}
                label={t("summary.scheduledToday.label")}
                value={officeDashboard.summary.jobsScheduledToday}
                helper={t("summary.scheduledToday.helper")}
              />
              <MetricTile
                icon={Receipt}
                label={t("summary.unpaidInvoices.label")}
                value={officeDashboard.summary.unpaidInvoices}
                helper={t("summary.unpaidInvoices.helper")}
              />
              <MetricTile
                icon={ClipboardList}
                label={t("summary.newLeads.label")}
                value={officeDashboard.summary.newLeads}
                helper={t("summary.newLeads.helper")}
              />
              <MetricTile
                icon={Phone}
                label={t("summary.contactedLeads.label")}
                value={officeDashboard.summary.contactedLeads}
                helper={t("summary.contactedLeads.helper")}
              />
            </section>
          ) : null}

          {officeRole ? (
            <SectionFrame
              subtitle={t("jumpToOperations")}
              title={t("quickLinksDescription")}
            >
              <p className="mb-4 text-sm text-[color:var(--sem-text-secondary)]">{t("firstSessionTip")}</p>
              <OfficeCommandZones role={role} zones={commandZones} />
            </SectionFrame>
          ) : null}

          {!technicianRole && !officeRole ? (
            <section className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5 text-sm text-[color:var(--sem-text-secondary)]">
              {t("noDashboard")}
            </section>
          ) : null}
        </div>
      </main>
    </BoardShell>
  );
}
