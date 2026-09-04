import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BrainCircuit,
  CalendarDays,
  FilePenLine,
  Layers3,
  Lightbulb,
  Link2,
  Megaphone,
  PenLine,
  PlugZap,
  Rocket,
  Settings2,
  Target,
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
  phase:
    | "growth_center_v1_program_complete"
    | "phase_5_campaign_builder"
    | "phase_4_crm_intelligence"
    | "phase_3_publishing_integrations"
    | "phase_2_content_studio";
  capabilities?: {
    can_manage_channels: boolean;
    can_enqueue_publishing: boolean;
    can_refresh_opportunities?: boolean;
    can_mutate_campaigns?: boolean;
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
  campaigns?: {
    active_count: number;
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
  analytics_overview_pulse?: {
    window_note: string;
    terminal_publish_jobs_last_30d: number;
    opportunities_updated_converted_last_30d: number;
  };
};

export type MarketingRouteDefinition = {
  key: MarketingRouteKey;
  href: string;
  label: string;
  navHelper: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  includedNow: string[];
  laterPhaseWork: string[];
};

export const MARKETING_ROUTES: MarketingRouteDefinition[] = [
  {
    key: "overview",
    href: "/marketing",
    label: "Overview",
    navHelper: "Growth pulse",
    eyebrow: "Growth Center · Operating home",
    title: "Office Growth Center pulse",
    description:
      "Session-scoped workspace for marketing profile, drafts, calendar metadata, OAuth channels, CRM opportunities, campaigns, automations, analytics, and explicit publish jobs — all organization-owned.",
    icon: BarChart3,
    includedNow: [
      "Foundation metrics, recent drafts, recommended next action, and analytics pulse strip",
      "Publishing disclaimer and protected boundaries from authenticated foundation APIs",
      "Single navigation rail into every Growth Center surface",
    ],
    laterPhaseWork: [
      "Growth Center plan entitlements and commercial packaging (architecture only today)",
      "Instagram outbound publishing (V1.5) and richer media workflows",
    ],
  },
  {
    key: "opportunities",
    href: "/marketing/opportunities",
    label: "Opportunities",
    navHelper: "CRM signals",
    eyebrow: "Growth Intelligence",
    title: "Operational signals → marketing drafts",
    description:
      "WizField scans recent jobs and inspection photo types (no media URLs surfaced) to suggest opportunities. Owners, admins, and office admins refresh, dismiss, archive, or convert to Content Studio drafts — dispatchers read only.",
    icon: Target,
    includedNow: [
      "Core V1 detectors: work showcase, service momentum, local geographic density, before/after signal",
      "Convert to Draft opens Content Studio with empty platform variants",
      "Tenant-safe dedupe keyed per organization",
    ],
    laterPhaseWork: [
      "Availability and premium invoice heuristics",
      "Inbound review ingestion when CRM domain deepens",
      "Tighter Opportunity → Campaign orchestration beyond informational entry points",
    ],
  },
  {
    key: "create",
    href: "/marketing/create",
    label: "Create",
    navHelper: "Studio",
    eyebrow: "Content Studio",
    title: "Draft compositions with seeded variants",
    description:
      "Create organization-owned drafts, edit Google Business Profile, Facebook, and Instagram copy tracks, submit for reviewer approval, and capture calendar metadata without implying outbound posting.",
    icon: PenLine,
    includedNow: [
      "Sidebar draft list scoped to your active organization",
      "Mandatory three-variant seeding on creation",
      "Tabs per platform variant with explicit save actions",
      "Workflow badges for draft, review, and approved states",
    ],
    laterPhaseWork: [
      "Calendar drag-and-drop with conflict detection",
      "Shared asset libraries and moderation tooling",
      "Richer per-provider outbound validation as channels evolve",
    ],
  },
  {
    key: "calendar",
    href: "/marketing/calendar",
    label: "Calendar",
    navHelper: "Publishing map",
    eyebrow: "Scheduling metadata",
    title: "Calendar placeholders for planned posts",
    description:
      "Surface drafts carrying `scheduled_at` metadata grouped by UTC day. This grid is editorial context only — outbound execution always flows through explicit Growth Center publish jobs tied to channel targets.",
    icon: CalendarDays,
    includedNow: [
      "Month grid powered by authenticated calendar API responses",
      "Links back into `/marketing/create?draft=id` composer",
      "UTC-normalized placeholders aligned with server contracts",
    ],
    laterPhaseWork: [
      "Timezone-aware collaborator views",
      "Conflict detection tied to staffing dispatch",
      "Optional publish-attempt overlays on calendar reads",
    ],
  },
  {
    key: "campaigns",
    href: "/marketing/campaigns",
    label: "Campaigns",
    navHelper: "Pushes",
    eyebrow: "Campaign Builder",
    title: "Objective-first plans with templated slots",
    description:
      "Create campaign shells with deterministic slots, optionally attach Content Studio drafts per slot, and close or archive plans without implying automatic outbound publishing.",
    icon: Megaphone,
    includedNow: [
      "Canonical campaign kinds with seeded slot templates",
      "Per-slot draft creation, attach existing drafts, or detach without deleting drafts",
      "Optional bulk draft creation for empty slots",
      "Terminal statuses lock structural edits; detach rules enforced server-side",
    ],
    laterPhaseWork: [
      "Deeper Opportunity → Campaign workflows",
      "Post-approval automation sequencing",
      "Cross-channel readiness scoring inside campaigns",
    ],
  },
  {
    key: "channels",
    href: "/marketing/channels",
    label: "Channels",
    navHelper: "OAuth",
    eyebrow: "Publishing integrations",
    title: "Google, Facebook, and deferred Instagram",
    description:
      "Connect Google Business Profile and a Facebook Page per organization. Tokens encrypt at rest; Instagram stays visibly deferred until Growth Center V1.5.",
    icon: PlugZap,
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
    navHelper: "Rules",
    eyebrow: "Autopilot (V1)",
    title: "Opportunity-triggered rules with safe actions",
    description:
      "Growth Center marketing automation—distinct from CRM operational rules. React to CRM opportunity signals; actions stay suggest-only or auto-create drafts in Content Studio—no auto-publish in V1.",
    icon: BrainCircuit,
    includedNow: [
      "Rules keyed to opportunity types surfaced in CRM Intelligence",
      "Suggest-only and auto-create draft actions with idempotent runs",
      "Dry-run preview and run history for auditors",
    ],
    laterPhaseWork: [
      "Scheduled scanners and additional trigger families",
      "Tighter orchestration between Growth Center campaigns and CRM operational triggers where product allows",
      "Selective auto-publish only after explicit commercial and safety sign-off",
    ],
  },
  {
    key: "analytics",
    href: "/marketing/analytics",
    label: "Analytics",
    navHelper: "Aggregates",
    eyebrow: "Operating visibility",
    title: "Org-scoped Growth Center aggregates",
    description:
      "Bounded UTC windows summarize opportunities, drafts, campaigns, publish jobs and attempts, automations, channels, and workflow funnels. Metrics describe internal tooling — not ad ROI or organic reach.",
    icon: Layers3,
    includedNow: [
      "Preset ranges (last 7d / 30d / 90d) or explicit UTC calendar bounds with a maximum span clamp",
      "Truthful disclaimers surfaced next to funnel approximations and attribution buckets",
      "Dispatcher-safe read access aligned with Growth Center routing",
      "Rolling last-30d pulse counters on Overview when foundation loads",
    ],
    laterPhaseWork: [
      "Export and scheduled snapshots if product demands them",
      "Deeper attribution once audited transition logs exist",
      "Channel outcome metrics tied to provider insights where contracts allow",
    ],
  },
  {
    key: "settings",
    href: "/marketing/settings",
    label: "Settings",
    navHelper: "Profile",
    eyebrow: "Marketing profile",
    title: "Organization marketing profile persistence",
    description:
      "Capture identity, tone, publishing-adjacent CTA hints, and safety preferences as JSON-backed fragments validated on PATCH.",
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

export const FALLBACK_SUMMARY_CARDS: MarketingFoundationData["summaryCards"] = [
  {
    label: "Connected Channels",
    value: "0",
    helper:
      "Google Business Profile and Facebook OAuth targets when connected. Instagram remains deferred until Growth Center V1.5.",
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
  {
    label: "Active campaigns",
    value: "0",
    helper: "Plans that reached active status after the first linked draft (Growth Center Phase 5).",
  },
];

export const LATER_GROWTH_ROADMAP = [
  "Instagram outbound publishing (Growth Center V1.5)",
  "Scheduled or scanner-based automation triggers beyond opportunity V1",
  "Growth Center commercial entitlements (future billing-provider capability matrix)",
  "Analytics exports or rollups if operational scale demands them",
];

export const START_HERE_STEPS = [
  { step: "1", title: "Connect a channel", href: "/marketing/channels", body: "Link Google Business Profile or Facebook when your role allows OAuth management." },
  { step: "2", title: "Create first draft", href: "/marketing/create", body: "Open Content Studio and capture platform-specific copy for your organization." },
  { step: "3", title: "Publish manually", href: "/marketing/create", body: "Run an explicit publish job after approval — scheduled metadata never posts by itself." },
  { step: "4", title: "Review in Analytics", href: "/marketing/analytics", body: "Check internal Growth Center aggregates — not ad ROI or social engagement." },
] as const;

const LEGACY_ROUTE_ICONS: Partial<Record<MarketingRouteKey, LucideIcon>> = {
  overview: Megaphone,
  opportunities: Lightbulb,
  create: FilePenLine,
  campaigns: Rocket,
  channels: Link2,
  automations: Workflow,
  analytics: BarChart3,
};

export function getMarketingRoute(key: MarketingRouteKey): MarketingRouteDefinition {
  return MARKETING_ROUTES.find((route) => route.key === key) ?? MARKETING_ROUTES[0];
}

export function isGrowthCenterProgramV1Complete(phase: MarketingFoundationData["phase"] | undefined): boolean {
  return phase === "growth_center_v1_program_complete" || phase === "phase_5_campaign_builder";
}

export function resolvePhaseBadge(phase: MarketingFoundationData["phase"] | undefined): string {
  if (isGrowthCenterProgramV1Complete(phase)) {
    return "Program V1";
  }

  if (phase === "phase_4_crm_intelligence") {
    return "Phase 4";
  }

  if (phase === "phase_3_publishing_integrations") {
    return "Phase 3";
  }

  if (phase === "phase_2_content_studio") {
    return "Phase 2";
  }

  return "Growth Center";
}

export function resolvePhaseLabel(phase: MarketingFoundationData["phase"] | undefined): string {
  if (isGrowthCenterProgramV1Complete(phase)) {
    return "Growth Center · V1 workspace ready";
  }

  if (phase === "phase_4_crm_intelligence") {
    return "Phase roll-out · Growth Intelligence Layer";
  }

  if (phase === "phase_3_publishing_integrations") {
    return "Phase roll-out · Publishing integrations";
  }

  if (phase === "phase_2_content_studio") {
    return "Phase roll-out · Content Studio";
  }

  return "Growth Center";
}

export function resolveHeroBody(phase: MarketingFoundationData["phase"] | undefined): string {
  if (isGrowthCenterProgramV1Complete(phase)) {
    return "Growth Center V1 is available in your workspace: Marketing Profile and Content Studio, metadata calendar, Google and Facebook OAuth publishing via explicit UTC jobs (provider-dependent), CRM opportunities, Campaign Builder, V1 automations (draft creation or suggestions only — never auto-publish), and internal analytics.";
  }

  if (phase === "phase_4_crm_intelligence") {
    return "CRM Intelligence turns recent completed jobs and inspection photo-type patterns into Growth Center opportunities.";
  }

  if (phase === "phase_3_publishing_integrations") {
    return "OAuth-backed Google Business Profile and Facebook Page targets feed explicit publish jobs. Draft calendar metadata never posts by itself.";
  }

  if (phase === "phase_2_content_studio") {
    return "Capture office-side marketing posture, assemble multi-variant drafts manually, shepherd explicit review states, and book metadata-only placeholders.";
  }

  return "Keep tenant-safe scaffolding online while phased capabilities roll forward.";
}

export function resolveSummaryCards(foundationData: MarketingFoundationData | null): MarketingFoundationData["summaryCards"] {
  if (foundationData?.summaryCards?.length) {
    return foundationData.summaryCards;
  }

  return FALLBACK_SUMMARY_CARDS;
}

export function resolveSummaryCardIcon(label: string): LucideIcon {
  const normalized = label.toLowerCase();

  if (normalized.includes("channel")) {
    return PlugZap;
  }

  if (normalized.includes("review") || normalized.includes("draft")) {
    return PenLine;
  }

  if (normalized.includes("calendar") || normalized.includes("scheduled")) {
    return CalendarDays;
  }

  if (normalized.includes("opportunit")) {
    return Target;
  }

  if (normalized.includes("campaign")) {
    return Megaphone;
  }

  return BarChart3;
}

export function formatWorkflowBadge(raw: string) {
  if (raw === "needs_review") {
    return "Needs review";
  }

  return `${raw.slice(0, 1).toUpperCase()}${raw.slice(1)}`;
}

export function getLegacyRouteIcon(key: MarketingRouteKey, fallback: LucideIcon): LucideIcon {
  return LEGACY_ROUTE_ICONS[key] ?? fallback;
}
