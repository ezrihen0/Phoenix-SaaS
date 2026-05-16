import Link from "next/link";
import { getTranslations } from "next-intl/server";

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

function OfficeSnapshotQuickLinks({
  role,
  title,
  description,
  labels,
}: {
  role: SessionRole | null;
  title: string;
  description: string;
  labels: {
    leads: string;
    jobs: string;
    schedule: string;
    dispatch: string;
    invoices: string;
    estimates: string;
    marketing: string;
    automations: string;
    calls: string;
    messaging: string;
  };
}) {
  type QuickItem = { href: string; label: string };

  const candidates: QuickItem[] = [
    { href: "/leads", label: labels.leads },
    { href: "/jobs", label: labels.jobs },
    { href: "/schedule", label: labels.schedule },
    { href: "/dispatch", label: labels.dispatch },
    { href: "/invoices", label: labels.invoices },
    { href: "/estimates", label: labels.estimates },
    { href: "/marketing", label: labels.marketing },
    { href: "/automations", label: labels.automations },
    { href: "/calls", label: labels.calls },
    { href: "/messaging", label: labels.messaging },
  ];

  const links = candidates.filter((item) => canAccessShellHref(item.href, role));

  if (links.length === 0) {
    return null;
  }

  return (
    <section className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
      <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{title}</p>
      <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
        {description}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="theme-control-surface inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  helper,
  value,
}: {
  label: string;
  helper: string;
  value: number;
}) {
  return (
    <article className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
      <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">{label}</p>
      <p className="mt-2 text-xs text-[color:var(--sem-text-secondary)]">{helper}</p>
      <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{value}</p>
    </article>
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
      <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="theme-surface-modal rounded-[34px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] p-7 sm:p-8">
            <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">{t("subtitle")}</p>
            <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
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
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="theme-surface-modal rounded-[34px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] p-7 sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">{t("subtitle")}</p>
          <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
            {t("officeDescription")}
          </p>
          <p className="mt-4 inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
            {t("liveDashboardSnapshot")}
          </p>
        </section>

        {officeRole && officeDashboard && brainHomeBrief ? (
          <HomeIntelligenceStrip brief={brainHomeBrief} />
        ) : null}

        {loadError ? (
          <section className="theme-alert-error rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-5 py-4 text-sm text-[color:var(--sem-text-secondary)]">
            {loadError}
          </section>
        ) : null}

        {officeRole && officeDashboard ? (
          <section className="space-y-4">
            <div className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{t("todayFocus")}</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <SummaryCard
                  label={t("summary.newLeads.label")}
                  helper={t("summary.newLeads.helper")}
                  value={officeDashboard.summary.newLeads}
                />
                <SummaryCard
                  label={t("summary.contactedLeads.label")}
                  helper={t("summary.contactedLeads.helper")}
                  value={officeDashboard.summary.contactedLeads}
                />
                <SummaryCard
                  label={t("summary.scheduledToday.label")}
                  helper={t("summary.scheduledToday.helper")}
                  value={officeDashboard.summary.jobsScheduledToday}
                />
              </div>
            </div>
            <div className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{t("backlogHealth")}</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                <SummaryCard
                  label={t("summary.activeJobs.label")}
                  helper={t("summary.activeJobs.helper")}
                  value={officeDashboard.summary.activeJobs}
                />
                <SummaryCard
                  label={t("summary.unpaidInvoices.label")}
                  helper={t("summary.unpaidInvoices.helper")}
                  value={officeDashboard.summary.unpaidInvoices}
                />
              </div>
            </div>
          </section>
        ) : null}

        {officeRole ? (
          <OfficeSnapshotQuickLinks
            role={role}
            title={t("jumpToOperations")}
            description={t("quickLinksDescription")}
            labels={{
              leads: shellT("leads"),
              jobs: shellT("jobs"),
              schedule: shellT("schedule"),
              dispatch: shellT("dispatch"),
              invoices: shellT("invoices"),
              estimates: shellT("estimates"),
              marketing: shellT("marketing"),
              automations: shellT("automations"),
              calls: shellT("calls"),
              messaging: shellT("messaging"),
            }}
          />
        ) : null}

        {!technicianRole && !officeRole ? (
          <section className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5 text-sm text-[color:var(--sem-text-secondary)]">
            {t("noDashboard")}
          </section>
        ) : null}
      </div>
    </main>
  );
}
