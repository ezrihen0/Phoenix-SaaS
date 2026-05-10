import Link from "next/link";
import {
  Clock3,
  Plus,
  Sparkles,
  Workflow,
} from "lucide-react";

import { AutomationRuleList } from "@/components/automations/automation-rule-list";
import { SentenceBuilder } from "@/components/automations/sentence-builder";
import { requireServerRoles } from "@/lib/auth/server-session";

type SummaryCard = {
  label: string;
  value: string;
  helper: string;
};

type ActivityItem = {
  title: string;
  detail: string;
  status: string;
};

const summaryCards: SummaryCard[] = [
  {
    label: "Active Rules",
    value: "0",
    helper: "Owner-created automations will appear here after validation and save.",
  },
  {
    label: "Pending Actions",
    value: "0",
    helper: "Approval-required sends and tasks will queue here before execution.",
  },
  {
    label: "Runs Today",
    value: "0",
    helper: "Every run, skip, block, and failure will be auditable.",
  },
  {
    label: "Kill Switch",
    value: "Planned",
    helper: "Global safety controls are part of the foundation work.",
  },
];

const categories = [
  "Featured",
  "Recommended",
  "Reminders",
  "Sales Follow-Up",
  "Payments & Documents",
  "Marketing & Reviews",
  "Phone Actions",
  "Office Operations",
  "Technician & Field Ops",
  "Inventory & Stock",
  "Warranty & Retention",
  "Inspections & Reports",
];

const activityPreview: ActivityItem[] = [
  {
    title: "No runs yet",
    detail: "Execution history will show which rule ran, why it ran, and what happened.",
    status: "Audit",
  },
  {
    title: "No pending approvals",
    detail: "Customer-facing or risky actions can create approval cards before sending.",
    status: "Queue",
  },
  {
    title: "No active custom rules",
    detail: "Validated owner-created rules will become active immediately after Save.",
    status: "Builder",
  },
];

function SummaryCard({ label, value, helper }: SummaryCard) {
  return (
    <article className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
      <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{value}</p>
      <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">{helper}</p>
    </article>
  );
}

export default async function AutomationsPage() {
  await requireServerRoles("/automations", ["owner", "admin", "office_admin", "dispatcher"]);

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="theme-surface-modal overflow-hidden rounded-[34px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] p-7 sm:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">
                Independent Product Body
              </p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                Automation Store
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                Build safe business automations from trusted CRM events. Browse success recipes, create custom logic,
                validate every rule, and keep every action auditable.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="#recipes"
                className="inline-flex items-center gap-2 rounded-full bg-[color:var(--cmp-action-primary)] px-5 py-3 text-sm font-semibold text-[color:var(--sem-text-inverse)] transition hover:opacity-90"
              >
                <Sparkles className="h-4 w-4" />
                Browse Success Recipes
              </Link>
              <Link
                href="#custom-builder"
                className="theme-control-surface inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
              >
                <Plus className="h-4 w-4" />
                Create Custom Automation
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <SummaryCard key={card.label} {...card} />
          ))}
        </section>

        <section id="recipes" className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">
                Marketplace Structure
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Recipe categories</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                V1 creates the category frame for a future 50-60 recipe marketplace without building every recipe now.
              </p>
            </div>
            <span className="theme-badge rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
              12 categories
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {categories.map((category) => (
              <span
                key={category}
                className="theme-control-surface-soft rounded-full border px-4 py-2 text-xs font-medium text-[color:var(--sem-text-secondary)]"
              >
                {category}
              </span>
            ))}
          </div>
        </section>

        <section id="custom-builder">
          <article className="theme-surface-modal rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] p-6">
            <div className="flex items-start gap-3">
              <div className="theme-control-surface-soft inline-flex h-12 w-12 items-center justify-center rounded-[18px] border">
                <Workflow className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">
                  Custom Builder
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">
                  Save becomes active after validation
                </h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                  The owner chooses the event, conditions, action, timing, and template. The backend will block unsafe or
                  incomplete rules before they become active.
                </p>
              </div>
            </div>

            <SentenceBuilder />
          </article>
        </section>

        <AutomationRuleList />

        <section id="activity" className="grid gap-4 lg:grid-cols-3">
          {activityPreview.map((item) => (
            <article
              key={item.title}
              className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="theme-badge rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em]">
                  {item.status}
                </span>
                <Clock3 className="h-4 w-4 text-[color:var(--sem-text-muted)]" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-[color:var(--sem-text-primary)]">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{item.detail}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
