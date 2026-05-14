import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarDays,
  FilePenLine,
  Lightbulb,
  Link2,
  Megaphone,
  Rocket,
  Settings2,
  Workflow,
} from "lucide-react";

export type MarketingRouteKey =
  | "overview"
  | "opportunities"
  | "create"
  | "calendar"
  | "campaigns"
  | "channels"
  | "automations"
  | "analytics"
  | "settings";

export type MarketingFoundationData = {
  phase: string;
  organization: {
    id: string;
    name: string | null;
    slug: string | null;
  };
  summaryCards: Array<{
    label: string;
    value: string;
    helper: string;
  }>;
  laterPhases: string[];
  protectedBoundaries: string[];
};

type MarketingFoundationWorkspaceProps = {
  activeRouteKey: MarketingRouteKey;
  foundationData: MarketingFoundationData | null;
  loadError: string | null;
};

type RouteDefinition = {
  key: MarketingRouteKey;
  href: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  includedNow: string[];
  laterPhaseWork: string[];
};

const routeDefinitions: RouteDefinition[] = [
  {
    key: "overview",
    href: "/marketing",
    label: "Overview",
    eyebrow: "Phase 1 Command Center",
    title: "Growth Center foundation is live",
    description: "The authenticated Growth Center now exists as a tenant-safe office module with empty states for the approved route family.",
    icon: Megaphone,
    includedNow: [
      "Authenticated office-side `/marketing` route family",
      "Active-organization context carried into the workspace",
      "Foundation summary cards and route navigation",
      "Strict Phase 1 boundary messaging across the module",
    ],
    laterPhaseWork: [
      "CRM-driven opportunity detection",
      "Draft generation and approval flows",
      "Channel publishing and scheduling",
    ],
  },
  {
    key: "opportunities",
    href: "/marketing/opportunities",
    label: "Opportunities",
    eyebrow: "Future CRM Intelligence",
    title: "Opportunity queue is scaffolded only",
    description: "This page exists to anchor the future CRM-powered opportunity engine without detecting or generating anything yet.",
    icon: Lightbulb,
    includedNow: [
      "Protected route and workspace shell",
      "Organization-scoped empty state",
      "Phase boundary reminder for future CRM intelligence",
    ],
    laterPhaseWork: [
      "Job, photo, review, and schedule-gap detection",
      "Suggested-to-draft lifecycle",
      "Actionable opportunity acceptance flow",
    ],
  },
  {
    key: "create",
    href: "/marketing/create",
    label: "Create",
    eyebrow: "Future Content Studio",
    title: "Content Studio is intentionally deferred",
    description: "Phase 1 reserves the route and module shape, but does not create manual drafting or AI generation workflows.",
    icon: FilePenLine,
    includedNow: [
      "Route shell for the future studio",
      "Foundation-only owner guidance",
      "No draft editor or generation form",
    ],
    laterPhaseWork: [
      "Manual post creation",
      "Platform-specific variants",
      "AI-assisted copy generation with owner review",
    ],
  },
  {
    key: "calendar",
    href: "/marketing/calendar",
    label: "Calendar",
    eyebrow: "Future Scheduling",
    title: "Calendar structure is reserved for a later phase",
    description: "The calendar route exists so future marketing work has a stable place in the product, but no scheduling engine is active yet.",
    icon: CalendarDays,
    includedNow: [
      "Route foundation and page shell",
      "Tenant-safe empty state",
      "No scheduling or drag-and-drop behavior",
    ],
    laterPhaseWork: [
      "Draft scheduling",
      "Content state tracking",
      "Retry and publish-failure handling",
    ],
  },
  {
    key: "campaigns",
    href: "/marketing/campaigns",
    label: "Campaigns",
    eyebrow: "Future Campaign Builder",
    title: "Campaign Builder stays behind the Phase 1 gate",
    description: "Phase 1 preserves the campaign route without introducing campaign generation, sequencing, or calendar insertion.",
    icon: Rocket,
    includedNow: [
      "Protected route scaffold",
      "Consistent Growth Center navigation",
      "No campaign creation logic",
    ],
    laterPhaseWork: [
      "Seasonal campaign maps",
      "Revenue and trust campaign sequences",
      "Calendar-ready campaign bundles",
    ],
  },
  {
    key: "channels",
    href: "/marketing/channels",
    label: "Channels",
    eyebrow: "Future Publishing Integrations",
    title: "Channel hub is foundation-only",
    description: "The channels route is ready for later integration work, but there are no live OAuth, reconnect, or publishing flows in Phase 1.",
    icon: Link2,
    includedNow: [
      "Route shell for the integration hub",
      "Organization-owned channel contract reserved in the backend",
      "No connection or permission actions yet",
    ],
    laterPhaseWork: [
      "Google Business Profile, Facebook, and Instagram connections",
      "Authorization health and reconnect handling",
      "Publish-now and schedule-publish orchestration",
    ],
  },
  {
    key: "automations",
    href: "/marketing/automations",
    label: "Automations",
    eyebrow: "Future Autopilot",
    title: "Marketing automations are not opened in Phase 1",
    description: "This route keeps the future automation surface separate from the existing Automation Store while remaining non-functional for now.",
    icon: Workflow,
    includedNow: [
      "Dedicated route shell inside Growth Center",
      "Clear boundary from existing `/automations` product area",
      "No trigger processing or draft generation",
    ],
    laterPhaseWork: [
      "Suggest-only triggers",
      "Auto-draft rules with approval",
      "Selective low-risk autopilot",
    ],
  },
  {
    key: "analytics",
    href: "/marketing/analytics",
    label: "Analytics",
    eyebrow: "Future Operating Analytics",
    title: "Analytics remain intentionally empty",
    description: "Phase 1 does not add vanity charts or channel metrics before the publish engine exists and proves reliable.",
    icon: BarChart3,
    includedNow: [
      "Reserved analytics route",
      "Foundation-only messaging",
      "No reporting logic or charts",
    ],
    laterPhaseWork: [
      "Consistency metrics",
      "Accepted-vs-ignored opportunity reporting",
      "Channel outcome metrics where supported",
    ],
  },
  {
    key: "settings",
    href: "/marketing/settings",
    label: "Settings",
    eyebrow: "Future Marketing Brain",
    title: "Marketing settings contract exists, UI comes later",
    description: "Phase 1 creates the foundation for organization-owned marketing settings without opening brand voice or compliance forms yet.",
    icon: Settings2,
    includedNow: [
      "Route shell for future profile settings",
      "Organization-owned marketing profile contract reserved in the backend",
      "No editable settings form yet",
    ],
    laterPhaseWork: [
      "Brand voice and CTA preferences",
      "Safety and restricted-term controls",
      "Publishing defaults by organization",
    ],
  },
];

const fallbackSummaryCards: MarketingFoundationData["summaryCards"] = [
  {
    label: "Connected Channels",
    value: "0",
    helper: "Connections remain a later-phase publishing task.",
  },
  {
    label: "Drafts Awaiting Approval",
    value: "0",
    helper: "Draft creation is intentionally out of scope for Phase 1.",
  },
  {
    label: "Scheduled This Week",
    value: "0",
    helper: "Scheduling starts after Content Studio and publishing are approved.",
  },
  {
    label: "Opportunities Detected",
    value: "0",
    helper: "CRM intelligence is not active in the foundation slice.",
  },
];

function SummaryCard({ label, value, helper }: MarketingFoundationData["summaryCards"][number]) {
  return (
    <article className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
      <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{helper}</p>
    </article>
  );
}

export function MarketingFoundationWorkspace({
  activeRouteKey,
  foundationData,
  loadError,
}: MarketingFoundationWorkspaceProps) {
  const route = routeDefinitions.find((definition) => definition.key === activeRouteKey) ?? routeDefinitions[0];
  const Icon = route.icon;
  const summaryCards = foundationData?.summaryCards.length ? foundationData.summaryCards : fallbackSummaryCards;
  const organizationLabel = foundationData?.organization.name ?? foundationData?.organization.slug ?? foundationData?.organization.id ?? "Active organization";
  const laterPhases = foundationData?.laterPhases.length
    ? foundationData.laterPhases
    : [
      "Content Studio",
      "AI generation",
      "Publishing integrations",
      "CRM intelligence",
      "Campaign Builder",
      "Autopilot",
      "Analytics",
      "Monetization",
    ];

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="theme-surface-modal overflow-hidden rounded-[34px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] p-7 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">
                Phase 1 Foundation
              </p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                Growth Center
              </h1>
              <p className="mt-4 text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                Build the tenant-safe Growth Center shell now. Keep content creation, publishing, CRM intelligence,
                campaigns, automations, analytics, and monetization behind later approved phases.
              </p>
            </div>

            <div className="theme-control-surface-soft rounded-[24px] border px-5 py-4 text-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Active organization</p>
              <p className="mt-2 text-base font-semibold text-[color:var(--sem-text-primary)]">{organizationLabel}</p>
              <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">
                Every route and future record in this module stays organization-owned.
              </p>
            </div>
          </div>

          {loadError ? (
            <div className="theme-alert-error mt-6 rounded-[20px] border px-4 py-3 text-sm">
              {loadError}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <SummaryCard key={card.label} {...card} />
          ))}
        </section>

        <section className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Route family</p>
              <h2 className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Approved Phase 1 surfaces</h2>
            </div>
            <span className="theme-badge rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
              9 routes
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {routeDefinitions.map((definition) => {
              const active = definition.key === activeRouteKey;
              return (
                <Link
                  key={definition.key}
                  href={definition.href}
                  className={[
                    active ? "theme-selected-card" : "theme-control-surface-soft",
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]",
                  ].join(" ")}
                >
                  <definition.icon className="h-3.5 w-3.5" />
                  <span>{definition.label}</span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
          <article className="theme-surface-modal rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] p-6">
            <div className="flex items-start gap-3">
              <div className="theme-control-surface-soft inline-flex h-12 w-12 items-center justify-center rounded-[18px] border">
                <Icon className="h-5 w-5 text-[color:var(--sem-accent-primary)]" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{route.eyebrow}</p>
                <h2 className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{route.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{route.description}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Included now</p>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                  {route.includedNow.map((item) => (
                    <li key={item} className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Later approved work</p>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                  {route.laterPhaseWork.map((item) => (
                    <li key={item} className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>

          <aside className="space-y-6">
            <article className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Locked after Phase 1</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                {laterPhases.map((phase) => (
                  <li key={phase} className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                    {phase}
                  </li>
                ))}
              </ul>
            </article>

            <article className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Protected boundaries</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                {(foundationData?.protectedBoundaries ?? ["App and module wiring", "Organization-owned entity registration"]).map((item) => (
                  <li key={item} className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}
