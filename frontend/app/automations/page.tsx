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
    label: "Saved rules",
    value: "—",
    helper: "Rules you validate and save appear in the list below.",
  },
  {
    label: "Recipe categories",
    value: "12",
    helper: "Labels group future operational recipes; most recipes are not built yet.",
  },
  {
    label: "Builder",
    value: "Live",
    helper: "Create CRM-triggered logic with server-side validation before activation.",
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
    title: "Run history",
    detail: "When execution logging ships for this module, runs will list here.",
    status: "Roadmap",
  },
  {
    title: "Approval queue",
    detail: "Risky or customer-visible actions may require review before send.",
    status: "Future",
  },
  {
    title: "Custom rules",
    detail: "Use the builder below; incomplete rules stay blocked until validation passes.",
    status: "Today",
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
                CRM · Operational rules
              </p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                CRM automations
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                This workspace is for <strong className="font-medium text-[color:var(--sem-text-primary)]">operational CRM rules</strong>
                {" "}built from tenant events—distinct from Growth Center, where marketing drafts, publishing, and{" "}
                <strong className="font-medium text-[color:var(--sem-text-primary)]">Growth Center Automations</strong>
                {" "}drive opportunity-linked content workflows (draft creation only in V1—never silent outbound posting).
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/marketing/automations"
                className="theme-control-surface inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]"
              >
                <Sparkles className="h-4 w-4" />
                Growth Center Automations
              </Link>
              <Link
                href="#custom-builder"
                className="inline-flex items-center gap-2 rounded-full bg-[color:var(--cmp-action-primary)] px-5 py-3 text-sm font-semibold text-[color:var(--sem-text-inverse)] transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Rule builder
              </Link>
            </div>
          </div>
        </section>

        <section className="theme-surface-card rounded-[26px] border border-[color:var(--cmp-border-accent)]/35 bg-[color:var(--cmp-surface-panel)] p-5 sm:p-6">
          <p className="text-sm leading-7 text-[color:var(--sem-text-secondary)]">
            <span className="font-semibold text-[color:var(--sem-text-primary)]">Not the marketing automation suite.</span>
            {" "}For opportunity-triggered drafts, campaigns, and publishing workflows, open{" "}
            <Link href="/marketing/automations" className="font-medium text-[color:var(--sem-accent-primary)] underline-offset-2 hover:underline">
              Growth Center → Automations
            </Link>
            . This page stays focused on CRM-style operational automation tooling as it lands.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {summaryCards.map((card) => (
            <SummaryCard key={card.label} {...card} />
          ))}
        </section>

        <section id="recipes" className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">
                Recipe framework
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Future recipe buckets</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                Category chips reserve taxonomy for guided recipes. Most recipes are not shipped yet—the builder below is the supported path today.
              </p>
            </div>
            <span className="theme-badge rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
              Early layout
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
                  Rule builder
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">
                  Validation before activation
                </h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                  Pick event, conditions, and actions. The backend rejects unsafe or incomplete rules—they only apply after successful validation.
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
