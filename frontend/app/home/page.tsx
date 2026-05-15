import { requireServerSession, type SessionRole } from "@/lib/auth/server-session";
import TechnicianHomeBoard from "@/components/home/technician-home-board";
import HomeIntelligenceStrip from "@/components/home/intelligence/home-intelligence-strip";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { fetchBrainHomeBriefSilent } from "@/lib/api/server-brain-home-brief";
import type { AiBrainHomeBriefResponse } from "@/lib/ai/brain-brief-types";
import {
  isOfficeDashboardResponse,
  type OfficeDashboardResponse,
} from "@/lib/crm/home-dashboard-types";
import { canAccessShellHref } from "@/lib/navigation/shell-nav-policy";
import Link from "next/link";

function isOfficeRole(role: SessionRole | null) {
  return role === "owner"
    || role === "admin"
    || role === "office_admin"
    || role === "dispatcher"
    || role === "viewer";
}

function OfficeSnapshotQuickLinks({ role }: { role: SessionRole | null }) {
  type QuickItem = { href: string; label: string };

  const candidates: QuickItem[] = [
    { href: "/leads", label: "Leads queue" },
    { href: "/jobs", label: "Jobs board" },
    { href: "/schedule", label: "Schedule" },
    { href: "/dispatch", label: "Dispatch" },
    { href: "/invoices", label: "Invoices" },
    { href: "/estimates", label: "Estimates" },
    { href: "/marketing", label: "Growth Center" },
    { href: "/automations", label: "CRM automations" },
    { href: "/calls", label: "Calls" },
    { href: "/messaging", label: "Messaging" },
  ];

  const links = candidates.filter((item) => canAccessShellHref(item.href, role));

  if (links.length === 0) {
    return null;
  }

  return (
    <section className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
      <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Jump to operations</p>
      <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
        Open the module behind each snapshot metric—without hunting the sidebar.
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
        loadError = "Office dashboard data is unavailable right now.";
      }
    } catch {
      loadError = "Office dashboard data is unavailable right now.";
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
            <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">Home</p>
            <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
              Operations home
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
              Your field queue and job progress live below. Open any job card for full detail, field notes, and status —
              your shortcuts stay on this board between visits.
            </p>
            <p className="mt-4 inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
              Technician board
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
          <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">Home</p>
          <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
            Operations home
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
            Tiles summarize today&apos;s intake, workload, and billing health whenever the dashboard responds.{" "}
            <strong className="font-medium text-[color:var(--sem-text-primary)]">Jump to operations</strong>
            {" "}is always available for one-click entry into the modules that matter now.
          </p>
          <p className="mt-4 inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
            Live dashboard snapshot
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
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Today Focus</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <SummaryCard
                  label="New Leads"
                  helper="Fresh leads captured today."
                  value={officeDashboard.summary.newLeads}
                />
                <SummaryCard
                  label="Contacted Leads"
                  helper="Leads actively followed up."
                  value={officeDashboard.summary.contactedLeads}
                />
                <SummaryCard
                  label="Scheduled Today"
                  helper="Jobs currently scheduled for today."
                  value={officeDashboard.summary.jobsScheduledToday}
                />
              </div>
            </div>
            <div className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Backlog Health</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                <SummaryCard
                  label="Active Jobs"
                  helper="Open operational workload in progress."
                  value={officeDashboard.summary.activeJobs}
                />
                <SummaryCard
                  label="Unpaid Invoices"
                  helper="Invoices still pending payment."
                  value={officeDashboard.summary.unpaidInvoices}
                />
              </div>
            </div>
          </section>
        ) : null}

        {officeRole ? <OfficeSnapshotQuickLinks role={role} /> : null}

        {!technicianRole && !officeRole ? (
          <section className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5 text-sm text-[color:var(--sem-text-secondary)]">
            This account role does not have a dedicated home dashboard view yet.
          </section>
        ) : null}

      </div>
    </main>
  );
}