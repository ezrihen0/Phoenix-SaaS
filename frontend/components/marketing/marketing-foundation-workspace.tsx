import Link from "next/link";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Globe2,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";
import { MetricTile, metricTileHoverClassName } from "@/components/board/metric-tile";
import { DesktopOptimizedNotice } from "@/components/mobile/desktop-optimized-notice";

import { MarketingAutomationsPanel } from "./marketing-automations-panel";
import { MarketingAnalyticsPanel } from "./marketing-analytics-panel";
import { MarketingCalendarPanel } from "./marketing-calendar-panel";
import { MarketingCampaignsPanel } from "./marketing-campaigns-panel";
import { MarketingChannelsPanel } from "./marketing-channels-panel";
import { MarketingContentStudio } from "./marketing-content-studio";
import { MarketingOpportunitiesPanel } from "./marketing-opportunities-panel";
import { MarketingProfileSettingsPanel } from "./marketing-profile-settings";
import {
  formatWorkflowBadge,
  getLegacyRouteIcon,
  getMarketingRoute,
  isGrowthCenterProgramV1Complete,
  LATER_GROWTH_ROADMAP,
  MARKETING_ROUTES,
  resolveHeroBody,
  resolvePhaseBadge,
  resolvePhaseLabel,
  resolveSummaryCardIcon,
  resolveSummaryCards,
  START_HERE_STEPS,
  type MarketingFoundationData,
  type MarketingRouteKey,
} from "./marketing-sections";

export type { MarketingFoundationData, MarketingRouteKey } from "./marketing-sections";

export const SHOW_LEGACY_MARKETING = false;

type MarketingFoundationWorkspaceProps = {
  activeRouteKey: MarketingRouteKey;
  foundationData: MarketingFoundationData | null;
  loadError: string | null;
  studioDraftQuery?: string | null;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function SummaryCardLegacy({ label, value, helper }: MarketingFoundationData["summaryCards"][number]) {
  return (
    <article className={`theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5 ${metricTileHoverClassName}`}>
      <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[color:var(--sem-text-primary)]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{helper}</p>
    </article>
  );
}

function renderInteractivePanel(
  activeRouteKey: MarketingRouteKey,
  foundationData: MarketingFoundationData | null,
  studioDraftQuery?: string | null,
): ReactNode {
  switch (activeRouteKey) {
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
    case "campaigns":
      return (
        <MarketingCampaignsPanel canMutateCampaigns={Boolean(foundationData?.capabilities?.can_mutate_campaigns)} />
      );
    case "automations":
      return (
        <MarketingAutomationsPanel
          canMutateAutomations={Boolean(foundationData?.capabilities?.can_mutate_campaigns)}
        />
      );
    case "analytics":
      return <MarketingAnalyticsPanel />;
    default:
      return null;
  }
}

function LegacyOverviewContent({ foundationData }: { foundationData: MarketingFoundationData }) {
  return (
    <div className="space-y-5">
      <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Scheduling + publishing stance</p>
        <p className="mt-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{foundationData.publishing_disclaimer}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-[color:var(--sem-text-muted)]">
          <span className="theme-control-surface-soft rounded-full border px-3 py-1">
            Marketing profile:&nbsp;
            <span className="font-semibold text-[color:var(--sem-text-primary)]">{foundationData.profile_saved ? "Saved" : "Not saved"}</span>
          </span>
          <span className="theme-control-surface-soft rounded-full border px-3 py-1">
            Core fields hint:&nbsp;
            <span className="font-semibold text-[color:var(--sem-text-primary)]">{foundationData.profile_hint_complete ? "Looks complete" : "Needs inputs"}</span>
          </span>
          <span className="theme-control-surface-soft rounded-full border px-3 py-1">
            Workspace drafts:&nbsp;
            <span className="font-semibold text-[color:var(--sem-text-primary)]">{(foundationData.recent_drafts ?? []).length} recent</span>
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/marketing/settings" className="inline-flex rounded-full border border-transparent bg-[color:var(--sem-accent-primary)] px-4 py-2 text-xs font-semibold text-[color:var(--sem-text-inverse)]">Open Marketing Profile</Link>
          <Link href="/marketing/create" className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold">Start manual draft</Link>
          <Link href="/marketing/calendar" className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold">View calendar placeholders</Link>
          <Link href="/marketing/opportunities" className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold">View opportunities</Link>
          <Link href="/marketing/campaigns" className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold">View campaigns</Link>
        </div>
      </div>

      {foundationData.analytics_overview_pulse ? (
        <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Analytics pulse (Growth Center internals)</p>
          <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">{foundationData.analytics_overview_pulse.window_note}</p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">Terminal publish jobs</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums text-[color:var(--sem-text-primary)]">{foundationData.analytics_overview_pulse.terminal_publish_jobs_last_30d}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">Opportunities → draft conversion (approx)</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums text-[color:var(--sem-text-primary)]">{foundationData.analytics_overview_pulse.opportunities_updated_converted_last_30d}</dd>
            </div>
          </dl>
          <div className="mt-5">
            <Link href="/marketing/analytics" className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold">Open Analytics</Link>
          </div>
        </div>
      ) : null}

      {foundationData.recommended_next_action ? (
        <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-accent)]/35 bg-[color:var(--cmp-surface-card)] p-5">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Recommended next action</p>
          <h3 className="mt-3 text-lg font-semibold text-[color:var(--sem-text-primary)]">{foundationData.recommended_next_action.headline}</h3>
          <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{foundationData.recommended_next_action.subheadline}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={foundationData.recommended_next_action.href ?? "/marketing/opportunities"} className="inline-flex rounded-full border border-transparent bg-[color:var(--sem-accent-primary)] px-4 py-2 text-xs font-semibold text-[color:var(--sem-text-inverse)]">Open opportunities</Link>
          </div>
        </div>
      ) : null}

      <RecentDraftsTable foundationData={foundationData} variant="legacy" />
    </div>
  );
}

function RecentDraftsTable({
  foundationData,
  variant,
}: {
  foundationData: MarketingFoundationData;
  variant: "legacy" | "command";
}) {
  const rows = foundationData.recent_drafts ?? [];

  if (variant === "command") {
    return (
      <section className="overflow-hidden rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]">
        <div className="flex items-center justify-between border-b border-[color:var(--cmp-border-subtle)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Recent drafts</p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--sem-text-primary)]">Publishing desk</h3>
          </div>
          <span className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--sem-text-secondary)]">Foundation data</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">
              <tr>
                <th className="px-5 py-4 font-semibold">Draft</th>
                <th className="px-5 py-4 font-semibold">Workflow</th>
                <th className="px-5 py-4 font-semibold">Updated</th>
                <th className="px-5 py-4 text-right font-semibold">Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-[color:var(--cmp-border-subtle)] last:border-b-0">
                    <td className="px-5 py-4 font-semibold text-[color:var(--sem-text-primary)]">
                      <Link href={`/marketing/create?draft=${encodeURIComponent(row.id)}`} className="hover:underline">{row.title || "Untitled draft"}</Link>
                    </td>
                    <td className="px-5 py-4 text-[color:var(--sem-text-secondary)]">{formatWorkflowBadge(row.workflow_state)}</td>
                    <td className="px-5 py-4 text-[color:var(--sem-text-muted)]">{row.updated_at}</td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/marketing/create?draft=${encodeURIComponent(row.id)}`} className="font-semibold text-indigo-700 hover:underline">Edit</Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm text-[color:var(--sem-text-muted)]">No drafts yet. Use Content Studio when you&apos;re ready to capture platform-specific wording.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
      <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Recent draft activity</p>
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
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-[color:var(--cmp-border-subtle)] last:border-none">
                  <td className="py-3 pr-3 align-top font-semibold text-[color:var(--sem-text-primary)]">
                    <Link href={`/marketing/create?draft=${encodeURIComponent(row.id)}`} className="hover:underline">{row.title || "Untitled draft"}</Link>
                  </td>
                  <td className="py-3 pr-3 align-top text-[color:var(--sem-text-secondary)]">{formatWorkflowBadge(row.workflow_state)}</td>
                  <td className="py-3 pr-3 align-top text-[color:var(--sem-text-muted)]">{row.updated_at}</td>
                  <td className="py-3 text-right align-top">
                    <Link href={`/marketing/create?draft=${encodeURIComponent(row.id)}`} className="font-semibold text-[color:var(--sem-accent-primary)]">Edit</Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-[color:var(--sem-text-muted)]">No drafts yet. Use Content Studio when you&apos;re ready to capture platform-specific wording.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GrowthIntelligencePanel({ foundationData }: { foundationData: MarketingFoundationData | null }) {
  const pulse = foundationData?.analytics_overview_pulse;
  const boundaries = foundationData?.protectedBoundaries?.length
    ? foundationData.protectedBoundaries
    : [
        "Growth Center mutations stay tenant scoped",
        "Publishing remains explicit and user-approved",
        "Analytics describe internal tooling — not ad ROI",
      ];

  return (
    <section className="rounded-[26px] border border-violet-500/20 bg-violet-950/50 p-5 text-white shadow-[0_22px_60px_rgba(109,40,217,0.14)]">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-300/25 bg-violet-300/10 text-violet-100">
          <Sparkles className="h-6 w-6" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-100/70">WizField Growth Intelligence</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">Foundation pulse</h3>
          <p className="mt-3 text-sm leading-6 text-violet-100/75">
            Growth intelligence renders from real foundation and analytics signals only. Publishing remains explicit and user-approved.
          </p>
        </div>
      </div>

      {pulse ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-violet-300/15 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-violet-100/50">Terminal publish jobs</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-violet-50">{pulse.terminal_publish_jobs_last_30d}</p>
            <p className="mt-2 text-xs text-violet-100/60">{pulse.window_note}</p>
          </div>
          <div className="rounded-2xl border border-violet-300/15 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-violet-100/50">Opportunities converted (approx)</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-violet-50">{pulse.opportunities_updated_converted_last_30d}</p>
            <p className="mt-2 text-xs text-violet-100/60">Use Analytics for detail.</p>
          </div>
        </div>
      ) : null}

      {foundationData?.publishing_disclaimer ? (
        <div className="mt-5 rounded-2xl border border-violet-300/15 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-violet-100/50">Publishing stance</p>
          <p className="mt-2 text-sm leading-6 text-violet-100/75">{foundationData.publishing_disclaimer}</p>
        </div>
      ) : null}

      <ul className="mt-5 space-y-2 text-sm leading-6 text-violet-100/75">
        {boundaries.slice(0, 4).map((item) => (
          <li key={item} className="rounded-xl border border-violet-300/10 bg-black/15 px-3 py-2">{item}</li>
        ))}
      </ul>
    </section>
  );
}

function CommandOverviewContent({ foundationData }: { foundationData: MarketingFoundationData }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        {foundationData.recommended_next_action ? (
          <div className="rounded-[26px] border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-[color:var(--cmp-surface-card)] text-emerald-700">
                  <Rocket className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700/70">Recommended action</p>
                  <h3 className="mt-1 text-xl font-semibold tracking-tight text-emerald-950">{foundationData.recommended_next_action.headline}</h3>
                  <p className="mt-2 text-sm leading-6 text-emerald-900/70">{foundationData.recommended_next_action.subheadline}</p>
                </div>
              </div>
              <Link href={foundationData.recommended_next_action.href ?? "/marketing/opportunities"} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-950 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-900">
                Open opportunities
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : null}

        <section className="rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Start here</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--sem-text-primary)]">Your first growth workflow</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {START_HERE_STEPS.map((item) => (
              <Link key={item.step} href={item.href} className="rounded-2xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4 transition hover:border-indigo-200 hover:shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">Step {item.step}</p>
                <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{item.body}</p>
              </Link>
            ))}
          </div>
        </section>

        <RecentDraftsTable foundationData={foundationData} variant="command" />

        <section className="rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Profile readiness</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-3 py-1 text-[color:var(--sem-text-secondary)]">
              Marketing profile: <span className="font-semibold text-[color:var(--sem-text-primary)]">{foundationData.profile_saved ? "Saved" : "Not saved"}</span>
            </span>
            <span className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-3 py-1 text-[color:var(--sem-text-secondary)]">
              Core fields: <span className="font-semibold text-[color:var(--sem-text-primary)]">{foundationData.profile_hint_complete ? "Looks complete" : "Needs inputs"}</span>
            </span>
          </div>
        </section>
      </div>

      <aside className="space-y-5">
        <GrowthIntelligencePanel foundationData={foundationData} />
        <section className="rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-5">
          <ShieldCheck className="h-7 w-7 text-[color:var(--sem-text-secondary)]" />
          <h4 className="mt-4 text-xl font-semibold tracking-tight text-[color:var(--sem-text-primary)]">Protected boundaries</h4>
          <p className="mt-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">Instagram remains deferred, automations suggest or create drafts only, and analytics show internal aggregates rather than ad ROI.</p>
        </section>
      </aside>
    </div>
  );
}

function MarketingCommandNav({ activeRouteKey }: { activeRouteKey: MarketingRouteKey }) {
  return (
    <nav className="overflow-x-auto rounded-[26px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-3 shadow-[0_20px_60px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)] backdrop-blur-xl">
      <div className="flex min-w-max gap-2 pb-1">
        {MARKETING_ROUTES.map((route) => {
          const active = route.key === activeRouteKey;
          const Icon = route.icon;

          return (
            <Link
              key={route.key}
              href={route.href}
              className={cx(
                "relative flex min-w-fit items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-semibold transition",
                active
                  ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] text-[color:var(--sem-text-primary)] shadow-[0_18px_50px_color-mix(in_srgb,var(--bg-canvas)_22%,transparent)]"
                  : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-text-secondary)] hover:bg-[color:var(--cmp-hover-surface)] hover:text-[color:var(--sem-text-primary)]",
              )}
            >
              <Icon className="h-4 w-4" />
              {route.label}
              {active ? <span className="absolute inset-x-5 -bottom-[11px] h-0.5 rounded-full bg-[color:var(--sem-accent-primary)]" /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function GrowthCommandCenterWorkspace({
  activeRouteKey,
  foundationData,
  loadError,
  studioDraftQuery,
}: MarketingFoundationWorkspaceProps) {
  const route = getMarketingRoute(activeRouteKey);
  const summaryCards = resolveSummaryCards(foundationData);
  const organizationLabel =
    foundationData?.organization.name
    ?? foundationData?.organization.slug
    ?? foundationData?.organization.id
    ?? "Active organization";
  const compactSubRoute = activeRouteKey !== "overview";
  const phaseBadge = resolvePhaseBadge(foundationData?.phase);
  const capabilities = foundationData?.capabilities;
  const mutationGated = !capabilities?.can_mutate_campaigns && !capabilities?.can_refresh_opportunities && !capabilities?.can_manage_channels;

  return (
    <BoardShell gridOpacity="subtle">
      <div className="mx-auto max-w-[1640px] px-5 py-6 lg:px-8">
        <DesktopOptimizedNotice href="/marketing" />
        {!compactSubRoute ? (
          <header className="rounded-[34px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_65%,transparent)] backdrop-blur-xl">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
                    <Rocket className="h-5 w-5" />
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {phaseBadge}
                  </span>
                  <span className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--sem-text-secondary)]">{organizationLabel}</span>
                </div>
                <h1 className="mt-5 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] md:text-5xl">Growth Command Center</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                  Coordinate drafts, opportunities, channels, campaigns, automation rules, and internal growth analytics without changing publishing semantics.
                </p>
                {loadError ? (
                  <div className="theme-alert-error mt-4 rounded-[20px] border px-4 py-3 text-sm">{loadError}</div>
                ) : null}
              </div>
              <div className="rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4">
                <div className="flex items-center gap-4">
                  <Globe2 className="h-8 w-8 text-[color:var(--sem-accent-primary)]" />
                  <div>
                    <p className="font-semibold text-[color:var(--sem-display-headline)]">Authenticated Growth Center</p>
                    <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">Org-scoped · {mutationGated ? "read-focused access" : "capability gated"}</p>
                  </div>
                </div>
              </div>
            </div>
          </header>
        ) : null}

        <section className={cx("mt-5 grid gap-3", compactSubRoute ? "md:grid-cols-2 xl:grid-cols-5" : "md:grid-cols-2 xl:grid-cols-5")}>
          {summaryCards.map((card) => (
            compactSubRoute ? (
              <article key={card.label} className={`group rounded-[24px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-3 shadow-[0_20px_60px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)] backdrop-blur-xl ${metricTileHoverClassName}`}>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
                  {(() => {
                    const Icon = resolveSummaryCardIcon(card.label);
                    return <Icon className="h-4 w-4" />;
                  })()}
                </span>
                <p className="mt-3 text-[10px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">{card.label}</p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">{card.value}</p>
              </article>
            ) : (
              <MetricTile
                key={card.label}
                icon={resolveSummaryCardIcon(card.label)}
                label={card.label}
                value={card.value}
                helper={card.helper}
              />
            )
          ))}
        </section>

        <div className="mt-5">
          <MarketingCommandNav activeRouteKey={activeRouteKey} />
        </div>

        {activeRouteKey === "overview" ? (
          <section className="mt-5 overflow-hidden rounded-[34px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5 text-[color:var(--sem-text-primary)] shadow-[0_30px_90px_rgba(0,0,0,0.18)]">
            <div className="mb-5 flex flex-col gap-3 border-b border-[color:var(--cmp-border-subtle)] pb-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Active workspace</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--sem-text-primary)]">{route.label}</h2>
                <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{route.navHelper}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{mutationGated ? "Read-focused" : "Capability gated"}</span>
              </div>
            </div>

            {foundationData ? <CommandOverviewContent foundationData={foundationData} /> : (
              <p className="text-sm text-[color:var(--sem-text-secondary)]">Foundation data is unavailable. Refresh after checking your session and organization context.</p>
            )}
          </section>
        ) : (
          <section className="mt-5 overflow-hidden rounded-[34px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 text-[color:var(--sem-text-primary)] shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)] backdrop-blur-xl">
            <div className="mb-5 flex flex-col gap-4 border-b border-[color:var(--cmp-border-subtle)] pb-5 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)]">
                  <route.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{route.eyebrow}</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">{route.title}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">{route.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--sem-text-secondary)]">{route.label}</span>
                <span className="rounded-full border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] px-3 py-1 text-xs font-semibold text-[color:var(--sem-accent-primary)]">{mutationGated ? "Read-focused" : "Capability gated"}</span>
              </div>
            </div>

            <div className="min-w-0">{renderInteractivePanel(activeRouteKey, foundationData, studioDraftQuery)}</div>
          </section>
        )}
      </div>
    </BoardShell>
  );
}

function LegacyMarketingFoundationWorkspace({
  activeRouteKey,
  foundationData,
  loadError,
  studioDraftQuery,
}: MarketingFoundationWorkspaceProps) {
  const route = getMarketingRoute(activeRouteKey);
  const Icon = getLegacyRouteIcon(activeRouteKey, route.icon);
  const summaryCards = resolveSummaryCards(foundationData);
  const organizationLabel =
    foundationData?.organization.name
    ?? foundationData?.organization.slug
    ?? foundationData?.organization.id
    ?? "Active organization";

  const interactiveRoutes: MarketingRouteKey[] = [
    "settings",
    "create",
    "calendar",
    "channels",
    "opportunities",
    "campaigns",
    "automations",
    "analytics",
  ];
  const suppressEducationalRails = interactiveRoutes.includes(activeRouteKey);
  const showPrimaryRail = activeRouteKey === "overview" || suppressEducationalRails;
  const compactSubRoute = activeRouteKey !== "overview";
  const programV1Complete = isGrowthCenterProgramV1Complete(foundationData?.phase);
  const phaseLabel = resolvePhaseLabel(foundationData?.phase);
  const heroEyebrow = programV1Complete
    ? "Growth Center · V1 workspace ready"
    : foundationData?.phase === "phase_4_crm_intelligence"
      ? "Growth Intelligence online"
      : foundationData?.phase === "phase_3_publishing_integrations"
        ? "Publishing integrations online"
        : foundationData?.phase === "phase_2_content_studio"
          ? "Content Studio online"
          : "Growth Center";
  const heroBody = resolveHeroBody(foundationData?.phase);

  const renderPrimaryRail = () => {
    if (activeRouteKey === "overview") {
      return foundationData ? <LegacyOverviewContent foundationData={foundationData} /> : null;
    }

    return renderInteractivePanel(activeRouteKey, foundationData, studioDraftQuery);
  };

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        {!compactSubRoute ? (
          <section className="theme-surface-modal overflow-hidden rounded-[34px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] p-7 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-4xl">
                <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">{heroEyebrow}</p>
                <p className="mt-4 text-[10px] uppercase tracking-[0.4em] text-[color:var(--sem-text-muted)]">{phaseLabel}</p>
                <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">Growth Center</h1>
                <p className="mt-4 text-sm leading-7 text-[color:var(--sem-text-secondary)] sm:text-base">{heroBody}</p>
              </div>
              <div className="theme-control-surface-soft rounded-[24px] border px-5 py-4 text-sm">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Active organization</p>
                <p className="mt-2 text-base font-semibold text-[color:var(--sem-text-primary)]">{organizationLabel}</p>
              </div>
            </div>
            {loadError ? <div className="theme-alert-error mt-6 rounded-[20px] border px-4 py-3 text-sm">{loadError}</div> : null}
          </section>
        ) : (
          <section className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Growth Center</p>
                <h1 className="mt-1 text-2xl font-semibold text-[color:var(--sem-text-primary)]">{route.title}</h1>
              </div>
              <span className="theme-badge rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]">{organizationLabel}</span>
            </div>
          </section>
        )}

        {!compactSubRoute ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {summaryCards.map((card) => (
              <SummaryCardLegacy key={card.label} {...card} />
            ))}
          </section>
        ) : null}

        <section className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
          <div className="mt-5 flex flex-wrap gap-2">
            {MARKETING_ROUTES.map((definition) => {
              const active = definition.key === activeRouteKey;
              const NavIcon = getLegacyRouteIcon(definition.key, definition.icon);

              return (
                <Link
                  key={definition.key}
                  href={definition.href}
                  className={cx(
                    active ? "theme-selected-card" : "theme-control-surface-soft",
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]",
                  )}
                >
                  <NavIcon className="h-3.5 w-3.5" />
                  <span>{definition.label}</span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
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
                      <li key={item} className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Later approved work</p>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                    {route.laterPhaseWork.map((item) => (
                      <li key={item} className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </article>

          <aside className="space-y-6">
            <article className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Approved future Growth Center work</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                {LATER_GROWTH_ROADMAP.map((phase) => (
                  <li key={phase} className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">{phase}</li>
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
                  <li key={item} className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3">{item}</li>
                ))}
              </ul>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}

export function MarketingFoundationWorkspace(props: MarketingFoundationWorkspaceProps) {
  if (SHOW_LEGACY_MARKETING) {
    return <LegacyMarketingFoundationWorkspace {...props} />;
  }

  return <GrowthCommandCenterWorkspace {...props} />;
}
