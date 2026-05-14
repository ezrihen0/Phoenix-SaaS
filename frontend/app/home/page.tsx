import { requireServerSession, type SessionRole } from "@/lib/auth/server-session";
import TechnicianHomeBoard from "@/components/home/technician-home-board";
import { serverApiFetch } from "@/lib/api/server-fetch";
import {
  isOfficeDashboardResponse,
  type OfficeDashboardResponse,
} from "@/lib/crm/home-dashboard-types";

function isOfficeRole(role: SessionRole | null) {
  return role === "owner"
    || role === "admin"
    || role === "office_admin"
    || role === "dispatcher"
    || role === "viewer";
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
              Your field queue and job progress live below. Use{" "}
              <strong className="font-medium text-[color:var(--sem-text-primary)]">Jobs</strong>
              {" "}when you need full job detail, or stay here to update status and field notes in one place.
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
            Your WizField snapshot for today: leads, jobs, scheduling, and billing in one place. Next: open{" "}
            <strong className="font-medium text-[color:var(--sem-text-primary)]">Jobs</strong> to dispatch work or{" "}
            <strong className="font-medium text-[color:var(--sem-text-primary)]">Leads</strong> to qualify new intake.
          </p>
          <p className="mt-4 inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-secondary)]">
            Live dashboard snapshot
          </p>
        </section>

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

        {!technicianRole && !officeRole ? (
          <section className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5 text-sm text-[color:var(--sem-text-secondary)]">
            This account role does not have a dedicated home dashboard view yet.
          </section>
        ) : null}

      </div>
    </main>
  );
}
