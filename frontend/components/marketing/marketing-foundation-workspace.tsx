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

import { MarketingCalendarPanel } from "./marketing-calendar-panel";
import { MarketingChannelsPanel } from "./marketing-channels-panel";
import { MarketingContentStudio } from "./marketing-content-studio";
import { MarketingOpportunitiesPanel } from "./marketing-opportunities-panel";
import { MarketingProfileSettingsPanel } from "./marketing-profile-settings";

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
  phase: "phase_2_content_studio" | "phase_3_publishing_integrations" | "phase_4_crm_intelligence";
  capabilities?: {
    can_manage_channels: boolean;
    can_enqueue_publishing: boolean;
    can_refresh_opportunities?: boolean;
  };
  organization: {
    id: string;
    name: string | null;
    slug: string | null;
  };
  profile_saved: boolean;
  profile_hint_complete: boolean;
  drafts: {
    draft: number;
    needs_review: number;
    approved: number;
    scheduled_metadata_next_14d: number;
  };
  opportunities?: {
    open_count: number;
  };
  recommended_next_action?: {
    opportunity_type: string | null;
    opportunity_id: string | null;
    headline: string;
    subheadline: string;
    href: string | null;
  } | null;
  recent_drafts: Array<{
    id: string;
    title: string;
    workflow_state: string;
    updated_at: string;
  }>;
  summaryCards: Array<{
    label: string;
    value: string;
    helper: string;
  }>;
  publishing_disclaimer: string;
  protectedBoundaries: string[];
};

type MarketingFoundationWorkspaceProps = {
  activeRouteKey: MarketingRouteKey;
  foundationData: MarketingFoundationData | null;
  loadError: string | null;
  studioDraftQuery?: string | null;
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
    eyebrow: "Phase 2 · Content Studio anchor",
    title: "Office Growth Center pulse",
    description:
      "Phase 2 adds manual Marketing Profile persistence, seeded multi-platform drafts, review transitions, and metadata-only scheduling. Publishing and OAuth remain gated behind later approvals.",
    icon: Megaphone,
    includedNow: [
      "Authenticated `/marketing` route family with Phase 2 live metrics",
      "Counts for drafts awaiting review vs still in rework",
      "Recent draft shortcuts into the studio surface",
      "Explicit non-publishing disclaimers surfaced from the Growth Center APIs",
    ],
    laterPhaseWork: [
      "Google Business Profile, Facebook, and Instagram OAuth scopes",
      "Publish-now queues with telemetry and retry handling",
      "CRM-guided opportunity ingestion",
    ],
  },
  {
    key: "opportunities",
    href: "/marketing/opportunities",
    label: "Opportunities",
    eyebrow: "Phase 4 · CRM Intelligence",
    title: "Operational signals → marketing drafts",
    description:
      "WizField scans recent jobs and inspection photo types (no media URLs surfaced) to suggest opportunities. Owners, admins, and office admins refresh, dismiss, archive, or convert to Content Studio drafts — dispatchers read only.",
    icon: Lightbulb,
    includedNow: [
      "Four Core V1 detectors: work showcase, service momentum, local geographic density, before/after signal",
      "Convert to Draft opens Content Studio with empty platform variants",
      "Tenant-safe dedupe keyed per organization",
    ],
    laterPhaseWork: [
      "Availability and premium invoice heuristics (deferred)",
      "Inbound review ingestion when a real CRM domain exists",
      "Campaign and automation orchestration (Phase 5–6)",
    ],
  },
  {
    key: "create",
    href: "/marketing/create",
    label: "Create",
    eyebrow: "Phase 2 · Manual Content Studio",
    title: "Draft compositions with seeded variants",
    description:
      "Create organization-owned drafts, edit Google Business Profile, Facebook, and Instagram copy tracks, submit for reviewer approval, and capture calendar metadata without implying outbound posting.",
    icon: FilePenLine,
    includedNow: [
      "Sidebar draft list scoped to your active organization",
      "Mandatory three-variant seeding on creation",
      "Tabs per platform variant with explicit save actions",
      "Workflow badges for draft, review, and approved states",
    ],
    laterPhaseWork: [
      "Calendar drag-and-drop with conflict detection",
      "Asset libraries and moderation tooling",
      "Channel-specific validation once publishers arrive",
    ],
  },
  {
    key: "calendar",
    href: "/marketing/calendar",
    label: "Calendar",
    eyebrow: "Phase 2 · Scheduling metadata",
    title: "Calendar placeholders for planned posts",
    description:
      "Surface drafts carrying `scheduled_at` metadata grouped by UTC day inside the Growth Center. Nothing dispatches externally until Publishing ships as its own gated phase.",
    icon: CalendarDays,
    includedNow: [
      "Month grid powered by authenticated calendar API responses",
      "Links back into `/marketing/create?draft=id` composer",
      "Copy reminding teams that scheduling stays offline",
      "UTC-normalized placeholders to mirror server contracts",
    ],
    laterPhaseWork: [
      "Timezone-aware collaborator views",
      "Conflict detection tied to staffing dispatch",
      "Retry-aware publish telemetry overlays",
    ],
  },
  {
    key: "campaigns",
    href: "/marketing/campaigns",
    label: "Campaigns",
    eyebrow: "Future Campaign Builder",
    title: "Campaign Builder stays behind the Phase 1 gate",
    description:
      "Phase 1 preserves the campaign route without introducing campaign authoring tooling, sequencing, or calendar insertion.",
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
    eyebrow: "Phase 3 · OAuth targets",
    title: "Google, Facebook, and deferred Instagram",
    description:
      "Connect Google Business Profile and a Facebook Page per organization. Tokens encrypt at rest; Instagram stays visibly deferred until Growth Center V1.5.",
    icon: Link2,
    includedNow: [
      "Google + Meta OAuth handoffs with location/Page selection when multiple targets exist",
      "Disconnect/reconnect flows scoped to owners and admins",
      "Instagram card labeled Coming Soon without outbound IG calls",
    ],
    laterPhaseWork: [
      "Instagram containers, media libraries, and IG publishing",
      "Multi-location or multi-page management beyond MVP singles",
      "Rich media payloads mapped per provider",
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
      "No trigger processing or unattended posting",
    ],
    laterPhaseWork: [
      "Suggest-only triggers",
      "Suggested-only triggers gated by reviewer approval",
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
    eyebrow: "Phase 2 · Marketing Brain",
    title: "Organization marketing profile persistence",
    description:
      "Capture identity, tone, publishing-adjacent CTA hints, and safety preferences as JSON-backed fragments validated on PATCH. Profiles load read-only projections without implicitly upserting rows.",
    icon: Settings2,
    includedNow: [
      "Panels for Identity, Voice, Publishing preferences, Safety",
      "GET renders canonical empty payloads until the first PATCH",
      "Upsert-on-save respects organization ownership",
      "No outbound channel configuration flows",
    ],
    laterPhaseWork: [
      "Versioned approvals for profile changes",
      "Template libraries per franchise group",
      "Localization packs once multi-region campaigns matter",
    ],
  },
];

const fallbackSummaryCards: MarketingFoundationData["summaryCards"] = [
  {
    label: "Connected Channels",
    value: "0",
    helper: "OAuth publishing continues to ship after Phase 2 hardening completes.",
  },
  {
    label: "Needs review",
    value: "0",
    helper: "Submit manual drafts whenever copy is ready for a second reviewer.",
  },
  {
    label: "Calendar metadata slots",
    value: "0",
    helper: "Metadata-only placeholders for the next fourteen days.",
  },
  {
    label: "Open opportunities",
    value: "0",
    helper: "CRM-backed suggestions from jobs and inspections (Phase 4).",
  },
];

const laterGrowthRoadmap = [
  "Live channel publishing loops",
  "CRM ingestion for opportunities",
  "Campaign sequencing + approvals",
];

function formatWorkflowBadge(raw: string) {
  if (raw === "needs_review") {
    return "Needs review";
  }

  return `${raw.slice(0, 1).toUpperCase()}${raw.slice(1)}`;
}

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
  studioDraftQuery,
}: MarketingFoundationWorkspaceProps) {
  const route = routeDefinitions.find((definition) => definition.key === activeRouteKey) ?? routeDefinitions[0];
  const Icon = route.icon;
  const summaryCards =
    foundationData?.summaryCards && foundationData.summaryCards.length ? foundationData.summaryCards : fallbackSummaryCards;
  const organizationLabel =
    foundationData?.organization.name
    ?? foundationData?.organization.slug
    ?? foundationData?.organization.id
    ?? "Active organization";

  const interactiveRoutes: MarketingRouteKey[] = ["settings", "create", "calendar", "channels", "opportunities"];
  const suppressEducationalRails = interactiveRoutes.includes(activeRouteKey);
  const showPrimaryRail = activeRouteKey === "overview" || suppressEducationalRails;

  const phaseLabel =
    foundationData?.phase === "phase_4_crm_intelligence"
      ? "Phase 4 · CRM Intelligence Layer"
      : foundationData?.phase === "phase_3_publishing_integrations"
        ? "Phase 3 · Publishing integrations"
        : foundationData?.phase === "phase_2_content_studio"
          ? "Phase 2 Content Studio slice"
          : "Growth Center rollout";
  const heroEyebrow =
    foundationData?.phase === "phase_4_crm_intelligence"
      ? "Phase 4 · Opportunities + drafts"
      : foundationData?.phase === "phase_3_publishing_integrations"
        ? "Phase 3 · Channels + explicit jobs"
        : foundationData?.phase === "phase_2_content_studio"
          ? "Phase 2 · Manual studio online"
          : "Growth Center rollout";
  const heroBody =
    foundationData?.phase === "phase_4_crm_intelligence"
      ? "CRM Intelligence turns recent completed jobs and inspection photo-type patterns into Growth Center opportunities. Convert to Draft hands off into the existing Content Studio and publishing flows — without campaigns, automation, or AI copy generation."
      : foundationData?.phase === "phase_3_publishing_integrations"
        ? "OAuth-backed Google Business Profile and Facebook Page targets feed explicit publish jobs. Draft calendar metadata never posts by itself — only Publish Now or Schedule Publishing enqueue dispatcher-owned work in UTC."
        : foundationData?.phase === "phase_2_content_studio"
          ? "Capture office-side marketing posture, assemble multi-variant drafts manually, shepherd explicit review states, and book metadata-only placeholders. Earlier phases kept publishing offline."
          : "Keep tenant-safe scaffolding online while phased capabilities roll forward.";

  const renderPrimaryRail = () => {
    switch (activeRouteKey) {
      case "overview": {
        return (
          <>
            {foundationData ? (
              <div className="space-y-5">
                <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">
                    Scheduling + publishing stance
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                    {foundationData.publishing_disclaimer}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-[color:var(--sem-text-muted)]">
                    <span className="theme-control-surface-soft rounded-full border px-3 py-1">
                      Marketing profile:&nbsp;
                      <span className="font-semibold text-[color:var(--sem-text-primary)]">
                        {foundationData.profile_saved ? "Saved" : "Not saved"}
                      </span>
                    </span>
                    <span className="theme-control-surface-soft rounded-full border px-3 py-1">
                      Core fields hint:&nbsp;
                      <span className="font-semibold text-[color:var(--sem-text-primary)]">
                        {foundationData.profile_hint_complete ? "Looks complete" : "Needs inputs"}
                      </span>
                    </span>
                    <span className="theme-control-surface-soft rounded-full border px-3 py-1">
                      Workspace drafts:&nbsp;
                      <span className="font-semibold text-[color:var(--sem-text-primary)]">
                        {(foundationData.recent_drafts ?? []).length} recent
                      </span>
                    </span>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href="/marketing/settings"
                      className="inline-flex rounded-full border border-transparent bg-[color:var(--sem-accent-primary)] px-4 py-2 text-xs font-semibold text-[color:var(--sem-text-inverse)]"
                    >
                      Open Marketing Profile
                    </Link>
                    <Link
                      href="/marketing/create"
                      className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold"
                    >
                      Start manual draft
                    </Link>
                    <Link href="/marketing/calendar" className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold">
                      View calendar placeholders
                    </Link>
                    <Link href="/marketing/opportunities" className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold">
                      View opportunities
                    </Link>
                  </div>
                </div>

                {foundationData.recommended_next_action ? (
                  <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-accent)]/35 bg-[color:var(--cmp-surface-card)] p-5">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">
                      Recommended next action
                    </p>
                    <h3 className="mt-3 text-lg font-semibold text-[color:var(--sem-text-primary)]">
                      {foundationData.recommended_next_action.headline}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                      {foundationData.recommended_next_action.subheadline}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link
                        href={foundationData.recommended_next_action.href ?? "/marketing/opportunities"}
                        className="inline-flex rounded-full border border-transparent bg-[color:var(--sem-accent-primary)] px-4 py-2 text-xs font-semibold text-[color:var(--sem-text-inverse)]"
                      >
                        Open opportunities
                      </Link>
                    </div>
                  </div>
                ) : null}

                <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">
                        Recent draft activity
                      </p>
                      <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                        Every row opens the authenticated studio composer for manual edits only.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 overflow-auto">
                    <table className="w-full min-w-[520px] text-left text-xs">
                      <thead className="text-[color:var(--sem-text-muted)]">
                        <tr className="border-b border-[color:var(--cmp-border-subtle)]">
                          <th className="py-2 font-medium">Draft</th>
                          <th className="py-2 font-medium">Workflow</th>
                          <th className="py-2 font-medium">Updated</th>
                          <th className="py-2 font-medium text-right">Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(foundationData.recent_drafts ?? []).length ? (
                          foundationData.recent_drafts!.map((row) => (
                            <tr key={row.id} className="border-b border-[color:var(--cmp-border-subtle)] last:border-none">
                              <td className="py-3 pr-3 align-top font-semibold text-[color:var(--sem-text-primary)]">
                                <Link href={`/marketing/create?draft=${encodeURIComponent(row.id)}`} className="hover:underline">
                                  {row.title || "Untitled draft"}
                                </Link>
                              </td>
                              <td className="py-3 pr-3 align-top text-[color:var(--sem-text-secondary)]">{formatWorkflowBadge(row.workflow_state)}</td>
                              <td className="py-3 pr-3 align-top text-[color:var(--sem-text-muted)]">{row.updated_at}</td>
                              <td className="py-3 text-right align-top">
                                <Link href={`/marketing/create?draft=${encodeURIComponent(row.id)}`} className="font-semibold text-[color:var(--sem-accent-primary)]">
                                  Edit
                                </Link>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-sm text-[color:var(--sem-text-muted)]">
                              No drafts yet. Use Content Studio when you&apos;re ready to capture platform-specific wording.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        );
      }

      case "settings":
        return <MarketingProfileSettingsPanel />;

      case "create":
        return (
          <MarketingContentStudio
            studioDraftQuery={studioDraftQuery ?? undefined}
            publishCapabilities={foundationData?.capabilities}
          />
        );

      case "calendar":
        return <MarketingCalendarPanel />;

      case "channels":
        return <MarketingChannelsPanel capabilities={foundationData?.capabilities} />;

      case "opportunities":
        return (
          <MarketingOpportunitiesPanel
            canMutateOpportunities={Boolean(foundationData?.capabilities?.can_refresh_opportunities)}
          />
        );

      default:
        return null;
    }
  };

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="theme-surface-modal overflow-hidden rounded-[34px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] p-7 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">
                {heroEyebrow}
              </p>
              <p className="mt-4 text-[10px] uppercase tracking-[0.4em] text-[color:var(--sem-text-muted)]">{phaseLabel}</p>
              <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
                Growth Center
              </h1>
              <p className="mt-4 text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">
                {heroBody}
              </p>
            </div>

            <div className="theme-control-surface-soft rounded-[24px] border px-5 py-4 text-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Active organization</p>
              <p className="mt-2 text-base font-semibold text-[color:var(--sem-text-primary)]">{organizationLabel}</p>
              <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">
                Every route and persisted record honors server-enforced organization context.
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
              <h2 className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Growth Center navigation</h2>
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

            {showPrimaryRail ? <div className="mt-8 space-y-6">{renderPrimaryRail()}</div> : null}

            {!suppressEducationalRails ? (
              <div className="mt-10 grid gap-5 md:grid-cols-2">
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
            ) : null}
          </article>

          <aside className="space-y-6">
            <article className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Behind Phase 2</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                {laterGrowthRoadmap.map((phase) => (
                  <li key={phase} className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">
                    {phase}
                  </li>
                ))}
              </ul>
            </article>

            <article className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Protected boundaries</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                {(foundationData?.protectedBoundaries ?? [
                  "Growth Center mutations stay tenant scoped",
                  "Session actor supplies organization identifiers",
                  "No delegated publish jobs in Phase 2",
                ]).map((item) => (
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
