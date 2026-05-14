"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  attachMarketingCampaignItemDraft,
  bulkCreateCampaignDraftsForEmptySlots,
  createMarketingCampaign,
  createMarketingCampaignItemDraft,
  deleteMarketingCampaignItem,
  detachMarketingCampaignItemDraft,
  fetchMarketingCampaignDetail,
  fetchMarketingCampaignProgress,
  fetchMarketingCampaigns,
  patchMarketingCampaign,
  type MarketingCampaignDetailPayload,
  type MarketingCampaignSummary,
} from "@/lib/marketing/client-marketing";

type MarketingCampaignsPanelProps = {
  canMutateCampaigns: boolean;
};

const PLATFORM_KEYS = ["google_business", "facebook", "instagram"] as const;

const CAMPAIGN_KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "seasonal_campaign", label: "Seasonal campaign" },
  { value: "service_push_campaign", label: "Service push campaign" },
  { value: "trust_credibility_campaign", label: "Trust & credibility campaign" },
  { value: "local_authority_campaign", label: "Local authority campaign" },
];

const TERMINAL_PATCH_STATUSES = ["completed", "archived", "cancelled"] as const;

function datetimeLocalToIso(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.valueOf()) ? "" : d.toISOString();
}

function campaignKindLabel(kind: string): string {
  return CAMPAIGN_KIND_OPTIONS.find((row) => row.value === kind)?.label ?? kind.replace(/_/g, " ");
}

function platformLabel(key: string): string {
  switch (key) {
    case "google_business":
      return "Google Business Profile";
    case "facebook":
      return "Facebook";
    case "instagram":
      return "Instagram";
    default:
      return key;
  }
}

function formatChannelIntent(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length === 0) {
    return "Default (all platforms)";
  }

  const bits = raw.filter((entry): entry is string => typeof entry === "string").map(platformLabel);

  return bits.length ? bits.join(", ") : "Default (all platforms)";
}

function campaignIsMutable(status: string): boolean {
  return status === "draft_planning" || status === "active";
}

function formatStatusBadge(status: string): string {
  return status.replace(/_/g, " ");
}

export function MarketingCampaignsPanel({ canMutateCampaigns }: MarketingCampaignsPanelProps) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<MarketingCampaignSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MarketingCampaignDetailPayload | null>(null);

  const [progressOpen, setProgressOpen] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressPayload, setProgressPayload] = useState<Record<string, unknown> | null>(null);

  const [attachDraftByItem, setAttachDraftByItem] = useState<Record<string, string>>({});
  const [applySuggestedBulk, setApplySuggestedBulk] = useState(false);
  const [applySuggestedPerItem, setApplySuggestedPerItem] = useState<Record<string, boolean>>({});

  const [creatingKind, setCreatingKind] = useState(CAMPAIGN_KIND_OPTIONS[0]?.value ?? "seasonal_campaign");
  const [creatingTitle, setCreatingTitle] = useState("");
  const [creatingObjective, setCreatingObjective] = useState("");
  const [creatingTopic, setCreatingTopic] = useState("");
  const [creatingGeo, setCreatingGeo] = useState("");
  const [creatingWindowStart, setCreatingWindowStart] = useState("");
  const [creatingWindowEnd, setCreatingWindowEnd] = useState("");
  const [creatingChannels, setCreatingChannels] = useState<Record<(typeof PLATFORM_KEYS)[number], boolean>>({
    google_business: true,
    facebook: true,
    instagram: true,
  });

  const loadList = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await fetchMarketingCampaigns({
        limit: 50,
        offset: 0,
        include_archived: includeArchived,
      });
      setCampaigns(result.campaigns);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Campaigns could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  const loadDetail = useCallback(async (campaignId: string) => {
    setError(null);
    setDetailLoading(true);
    try {
      const payload = await fetchMarketingCampaignDetail(campaignId);
      setDetail(payload);
      setProgressPayload(null);
      setProgressOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Campaign detail could not be loaded.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "list") {
      return;
    }

    void loadList();
  }, [loadList, view]);

  useEffect(() => {
    if (view !== "detail" || !selectedId) {
      return;
    }

    void loadDetail(selectedId);
  }, [loadDetail, selectedId, view]);

  const emptySlots = useMemo(() => {
    if (!detail?.items?.length) {
      return 0;
    }

    return detail.items.filter((item) => !item.draft_id).length;
  }, [detail]);

  const openCampaign = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };

  const onCreateCampaign = async () => {
    const channelIntent = PLATFORM_KEYS.filter((key) => creatingChannels[key]);
    const window_starts_at = creatingWindowStart ? datetimeLocalToIso(creatingWindowStart) : "";
    const window_ends_at = creatingWindowEnd ? datetimeLocalToIso(creatingWindowEnd) : "";

    if (!creatingTitle.trim()) {
      setError("Title is required.");
      return;
    }

    if (!window_starts_at || !window_ends_at) {
      setError("Campaign window start and end are required.");
      return;
    }

    setError(null);
    try {
      const payload = await createMarketingCampaign({
        campaign_kind: creatingKind,
        title: creatingTitle.trim(),
        objective_summary: creatingObjective.trim() || undefined,
        primary_service_topic: creatingTopic.trim() || undefined,
        geo_label: creatingGeo.trim() || undefined,
        channel_intent: channelIntent,
        window_starts_at,
        window_ends_at,
      });

      setCreatingTitle("");
      setCreatingObjective("");
      setCreatingTopic("");
      setCreatingGeo("");
      setCreatingWindowStart("");
      setCreatingWindowEnd("");
      setCreatingChannels({
        google_business: true,
        facebook: true,
        instagram: true,
      });

      setSelectedId(payload.campaign.id);
      setDetail(payload);
      setView("detail");
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Campaign could not be created.");
    }
  };

  const onPatchCampaignStatus = async (next: (typeof TERMINAL_PATCH_STATUSES)[number]) => {
    if (!detail?.campaign?.id || !canMutateCampaigns) {
      return;
    }

    setError(null);
    try {
      const payload = await patchMarketingCampaign(detail.campaign.id, { status: next });
      setDetail(payload);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Campaign status could not be updated.");
    }
  };

  const onBulkDrafts = async () => {
    if (!detail?.campaign?.id || !canMutateCampaigns || emptySlots === 0) {
      return;
    }

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Create ${emptySlots} draft${emptySlots === 1 ? "" : "s"} for empty slots? Drafts stay in Content Studio until your team schedules explicit publish jobs.`,
          );

    if (!confirmed) {
      return;
    }

    setError(null);
    try {
      await bulkCreateCampaignDraftsForEmptySlots(detail.campaign.id, {
        apply_suggested_schedule: applySuggestedBulk,
      });
      await loadDetail(detail.campaign.id);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk draft creation failed.");
    }
  };

  const onCreateItemDraft = async (itemId: string) => {
    if (!detail?.campaign?.id || !canMutateCampaigns) {
      return;
    }

    const applySuggested = applySuggestedPerItem[itemId] === true;

    setError(null);
    try {
      await createMarketingCampaignItemDraft(detail.campaign.id, itemId, {
        apply_suggested_schedule: applySuggested,
      });
      await loadDetail(detail.campaign.id);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft could not be created for this slot.");
    }
  };

  const onDetach = async (itemId: string) => {
    if (!detail?.campaign?.id || !canMutateCampaigns) {
      return;
    }

    setError(null);
    try {
      await detachMarketingCampaignItemDraft(detail.campaign.id, itemId);
      await loadDetail(detail.campaign.id);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft could not be detached.");
    }
  };

  const onAttach = async (itemId: string) => {
    if (!detail?.campaign?.id || !canMutateCampaigns) {
      return;
    }

    const raw = attachDraftByItem[itemId]?.trim() ?? "";
    if (!raw.length) {
      setError("Paste a draft ID before attaching.");
      return;
    }

    setError(null);
    try {
      await attachMarketingCampaignItemDraft(detail.campaign.id, itemId, raw);
      setAttachDraftByItem((prev) => ({ ...prev, [itemId]: "" }));
      await loadDetail(detail.campaign.id);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft could not be attached.");
    }
  };

  const onDeleteItem = async (itemId: string) => {
    if (!detail?.campaign?.id || !canMutateCampaigns) {
      return;
    }

    const confirmed =
      typeof window === "undefined" ? true : window.confirm("Delete this empty slot? This cannot be undone.");

    if (!confirmed) {
      return;
    }

    setError(null);
    try {
      await deleteMarketingCampaignItem(detail.campaign.id, itemId);
      await loadDetail(detail.campaign.id);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Slot could not be deleted.");
    }
  };

  const onToggleProgress = async () => {
    if (!detail?.campaign?.id) {
      return;
    }

    const nextOpen = !progressOpen;
    setProgressOpen(nextOpen);

    if (!nextOpen || progressPayload || progressLoading) {
      return;
    }

    setProgressLoading(true);
    setError(null);
    try {
      const rollup = await fetchMarketingCampaignProgress(detail.campaign.id);
      setProgressPayload(rollup);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Progress rollup could not be loaded.");
    } finally {
      setProgressLoading(false);
    }
  };

  const mutableCampaign = detail?.campaign ? campaignIsMutable(detail.campaign.status) : false;

  const listIntro = useMemo(
    () =>
      canMutateCampaigns
        ? "Campaign Builder groups templated slots around one objective. Creating a campaign never drafts posts automatically unless you explicitly generate drafts per slot."
        : "Campaign plans and linked drafts are visible here. Owners, admins, and office admins create campaigns and drafts — dispatchers review counts from Overview.",
    [canMutateCampaigns],
  );

  if (view === "create") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold"
            onClick={() => {
              setView("list");
              setError(null);
            }}
          >
            ← Back to campaigns
          </button>
        </div>

        <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Honest boundaries</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            <li>Draft scheduling metadata, explicit publish_job times in UTC, and in-channel clocks remain three different ideas.</li>
            <li>WizField never auto-publishes from campaigns or draft metadata alone.</li>
            <li>Each draft links to at most one campaign slot; detach before deleting an empty slot.</li>
          </ul>
        </div>

        {error ? <div className="theme-alert-error rounded-[16px] border px-4 py-3 text-sm">{error}</div> : null}

        <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
              Campaign kind
              <select
                className="theme-control-surface-soft block w-full rounded-[18px] border px-3 py-2 text-sm font-normal normal-case tracking-normal text-[color:var(--sem-text-primary)]"
                value={creatingKind}
                onChange={(event) => setCreatingKind(event.target.value)}
              >
                {CAMPAIGN_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
              Title
              <input
                className="theme-control-surface-soft block w-full rounded-[18px] border px-3 py-2 text-sm font-normal normal-case tracking-normal text-[color:var(--sem-text-primary)]"
                value={creatingTitle}
                onChange={(event) => setCreatingTitle(event.target.value)}
                placeholder="Spring roofing reminder push"
              />
            </label>
          </div>

          <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
            Objective summary (optional)
            <textarea
              className="theme-control-surface-soft min-h-[96px] w-full rounded-[18px] border px-3 py-2 text-sm font-normal normal-case tracking-normal text-[color:var(--sem-text-primary)]"
              value={creatingObjective}
              onChange={(event) => setCreatingObjective(event.target.value)}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
              Primary service topic (optional)
              <input
                className="theme-control-surface-soft block w-full rounded-[18px] border px-3 py-2 text-sm font-normal normal-case tracking-normal text-[color:var(--sem-text-primary)]"
                value={creatingTopic}
                onChange={(event) => setCreatingTopic(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
              Geography label (optional)
              <input
                className="theme-control-surface-soft block w-full rounded-[18px] border px-3 py-2 text-sm font-normal normal-case tracking-normal text-[color:var(--sem-text-primary)]"
                value={creatingGeo}
                onChange={(event) => setCreatingGeo(event.target.value)}
              />
            </label>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
              Channel intent
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-[color:var(--sem-text-secondary)]">
              {PLATFORM_KEYS.map((key) => (
                <label key={key} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={creatingChannels[key]}
                    onChange={(event) =>
                      setCreatingChannels((prev) => ({
                        ...prev,
                        [key]: event.target.checked,
                      }))
                    }
                  />
                  {platformLabel(key)}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
              Window starts (local)
              <input
                type="datetime-local"
                className="theme-control-surface-soft block w-full rounded-[18px] border px-3 py-2 text-sm font-normal normal-case tracking-normal text-[color:var(--sem-text-primary)]"
                value={creatingWindowStart}
                onChange={(event) => setCreatingWindowStart(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
              Window ends (local)
              <input
                type="datetime-local"
                className="theme-control-surface-soft block w-full rounded-[18px] border px-3 py-2 text-sm font-normal normal-case tracking-normal text-[color:var(--sem-text-primary)]"
                value={creatingWindowEnd}
                onChange={(event) => setCreatingWindowEnd(event.target.value)}
              />
            </label>
          </div>

          {!canMutateCampaigns ? (
            <p className="text-sm text-[color:var(--sem-text-muted)]">
              Your role can review campaigns but cannot author them. Ask an owner, admin, or office admin to create plans.
            </p>
          ) : (
            <button
              type="button"
              className="inline-flex rounded-full border border-transparent bg-[color:var(--sem-accent-primary)] px-4 py-2 text-xs font-semibold text-[color:var(--sem-text-inverse)]"
              onClick={() => void onCreateCampaign()}
            >
              Create campaign shell (no drafts yet)
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view === "detail" && selectedId) {
    const campaign = detail?.campaign;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold"
            onClick={() => {
              setView("list");
              setSelectedId(null);
              setDetail(null);
              setProgressPayload(null);
              setProgressOpen(false);
              void loadList();
            }}
          >
            ← All campaigns
          </button>

          {campaign?.id ? (
            <button
              type="button"
              className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold"
              disabled={detailLoading}
              onClick={() => void loadDetail(campaign.id)}
            >
              Refresh
            </button>
          ) : null}
        </div>

        {detailLoading && !campaign ? (
          <p className="text-sm text-[color:var(--sem-text-muted)]">Loading campaign…</p>
        ) : null}

        {error ? <div className="theme-alert-error rounded-[16px] border px-4 py-3 text-sm">{error}</div> : null}

        {campaign ? (
          <>
            <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">
                    {campaignKindLabel(campaign.campaign_kind)}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-[color:var(--sem-text-primary)]">{campaign.title}</h3>
                  <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                    Status:&nbsp;
                    <span className="font-semibold text-[color:var(--sem-text-primary)]">
                      {formatStatusBadge(campaign.status)}
                    </span>
                  </p>
                </div>

                {canMutateCampaigns && mutableCampaign ? (
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
                    Close campaign
                    <select
                      className="theme-control-surface-soft min-w-[200px] rounded-[18px] border px-3 py-2 text-sm font-normal normal-case tracking-normal text-[color:var(--sem-text-primary)]"
                      defaultValue=""
                      onChange={(event) => {
                        const value = event.target.value as (typeof TERMINAL_PATCH_STATUSES)[number];
                        if (!value) {
                          return;
                        }

                        void onPatchCampaignStatus(value);
                        event.target.value = "";
                      }}
                    >
                      <option value="">Choose terminal status…</option>
                      {TERMINAL_PATCH_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {formatStatusBadge(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <dl className="grid gap-3 text-sm text-[color:var(--sem-text-secondary)] md:grid-cols-2">
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">Window</dt>
                  <dd className="mt-1">
                    {campaign.window_starts_at} → {campaign.window_ends_at}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                    Channel intent
                  </dt>
                  <dd className="mt-1">{formatChannelIntent(campaign.channel_intent)}</dd>
                </div>
                {campaign.geo_label ? (
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">Geo</dt>
                    <dd className="mt-1">{campaign.geo_label}</dd>
                  </div>
                ) : null}
              </dl>

              <button
                type="button"
                className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold"
                onClick={() => void onToggleProgress()}
              >
                {progressOpen ? "Hide progress rollup" : "Show progress rollup"}
              </button>

              {progressOpen ? (
                <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
                  {progressLoading ? (
                    <p className="text-sm text-[color:var(--sem-text-muted)]">Loading rollup…</p>
                  ) : (
                    <pre className="max-h-[320px] overflow-auto text-xs text-[color:var(--sem-text-secondary)]">
                      {JSON.stringify(progressPayload ?? {}, null, 2)}
                    </pre>
                  )}
                </div>
              ) : null}
            </div>

            {canMutateCampaigns && mutableCampaign ? (
              <div className="flex flex-wrap items-center gap-4 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-4 py-3 text-sm">
                <label className="inline-flex items-center gap-2 text-[color:var(--sem-text-secondary)]">
                  <input type="checkbox" checked={applySuggestedBulk} onChange={(e) => setApplySuggestedBulk(e.target.checked)} />
                  Apply suggested schedules when bulk creating drafts
                </label>
                <button
                  type="button"
                  className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold disabled:opacity-40"
                  disabled={emptySlots === 0 || detailLoading}
                  onClick={() => void onBulkDrafts()}
                >
                  Create drafts for all empty slots ({emptySlots})
                </button>
              </div>
            ) : null}

            <div className="overflow-auto rounded-[24px] border border-[color:var(--cmp-border-subtle)]">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-[color:var(--cmp-surface-panel)] text-[color:var(--sem-text-muted)]">
                  <tr className="border-b border-[color:var(--cmp-border-subtle)]">
                    <th className="px-4 py-3 font-medium">Slot</th>
                    <th className="px-4 py-3 font-medium">Suggested</th>
                    <th className="px-4 py-3 font-medium">Draft</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail?.items ?? []).map((item) => {
                    const suggestedApplyId = item.id;
                    const applySuggested = applySuggestedPerItem[suggestedApplyId] === true;

                    return (
                      <tr key={item.id} className="border-b border-[color:var(--cmp-border-subtle)] last:border-none">
                        <td className="px-4 py-3 align-top">
                          <p className="font-semibold text-[color:var(--sem-text-primary)]">{item.label}</p>
                          {item.plan_notes ? (
                            <p className="mt-1 text-[color:var(--sem-text-muted)]">{item.plan_notes}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top text-[color:var(--sem-text-secondary)]">
                          {item.suggested_scheduled_at ?? "—"}
                        </td>
                        <td className="px-4 py-3 align-top text-[color:var(--sem-text-secondary)]">
                          {item.draft ? (
                            <div className="space-y-1">
                              <p className="font-semibold text-[color:var(--sem-text-primary)]">{item.draft.title}</p>
                              <p className="text-[color:var(--sem-text-muted)]">
                                Workflow {item.draft.workflow_state}
                                {item.draft.scheduled_at ? ` · metadata ${item.draft.scheduled_at}` : ""}
                              </p>
                              <button
                                type="button"
                                className="font-semibold text-[color:var(--sem-accent-primary)] hover:underline"
                                onClick={() =>
                                  router.push(`/marketing/create?draft=${encodeURIComponent(item.draft!.id)}`)
                                }
                              >
                                Open in Content Studio
                              </button>
                            </div>
                          ) : (
                            <span className="text-[color:var(--sem-text-muted)]">No draft linked</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <div className="flex flex-col items-end gap-2">
                            {canMutateCampaigns && mutableCampaign && !item.draft ? (
                              <>
                                <label className="inline-flex items-center gap-2 text-[color:var(--sem-text-secondary)]">
                                  <input
                                    type="checkbox"
                                    checked={applySuggested}
                                    onChange={(event) =>
                                      setApplySuggestedPerItem((prev) => ({
                                        ...prev,
                                        [suggestedApplyId]: event.target.checked,
                                      }))
                                    }
                                  />
                                  Apply suggested schedule
                                </label>
                                <button
                                  type="button"
                                  className="theme-control-surface-soft inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold"
                                  disabled={detailLoading}
                                  onClick={() => void onCreateItemDraft(item.id)}
                                >
                                  Create draft
                                </button>
                              </>
                            ) : null}

                            {canMutateCampaigns && item.draft ? (
                              <button
                                type="button"
                                className="theme-control-surface-soft inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold"
                                disabled={detailLoading}
                                onClick={() => void onDetach(item.id)}
                              >
                                Detach draft
                              </button>
                            ) : null}

                            {canMutateCampaigns && mutableCampaign && !item.draft ? (
                              <div className="flex w-full max-w-[260px] flex-col gap-2">
                                <input
                                  className="theme-control-surface-soft w-full rounded-[14px] border px-2 py-1 text-[11px] text-[color:var(--sem-text-primary)]"
                                  placeholder="Existing draft ID"
                                  value={attachDraftByItem[item.id] ?? ""}
                                  onChange={(event) =>
                                    setAttachDraftByItem((prev) => ({
                                      ...prev,
                                      [item.id]: event.target.value,
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  className="theme-control-surface-soft inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold"
                                  disabled={detailLoading}
                                  onClick={() => void onAttach(item.id)}
                                >
                                  Attach draft
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex rounded-full border border-transparent bg-[color:var(--cmp-border-subtle)] px-3 py-1 text-[11px] font-semibold text-[color:var(--sem-text-secondary)]"
                                  disabled={detailLoading}
                                  onClick={() => void onDeleteItem(item.id)}
                                >
                                  Delete empty slot
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[color:var(--sem-text-secondary)]">{listIntro}</p>
        <div className="flex flex-wrap gap-2">
          <label className="theme-control-surface-soft inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            Include archived / cancelled
          </label>
          {canMutateCampaigns ? (
            <button
              type="button"
              className="inline-flex rounded-full border border-transparent bg-[color:var(--sem-accent-primary)] px-4 py-2 text-xs font-semibold text-[color:var(--sem-text-inverse)]"
              onClick={() => {
                setError(null);
                setView("create");
              }}
            >
              New campaign
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="theme-alert-error rounded-[16px] border px-4 py-3 text-sm">{error}</div> : null}

      {loading ? <p className="text-sm text-[color:var(--sem-text-muted)]">Loading campaigns…</p> : null}

      {!loading && campaigns.length === 0 ? (
        <p className="text-sm text-[color:var(--sem-text-muted)]">
          No campaigns yet.{canMutateCampaigns ? " Start with New campaign — slots arrive without drafts until you create them." : ""}
        </p>
      ) : null}

      {!loading && campaigns.length ? (
        <div className="overflow-auto rounded-[24px] border border-[color:var(--cmp-border-subtle)]">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-[color:var(--cmp-surface-panel)] text-[color:var(--sem-text-muted)]">
              <tr className="border-b border-[color:var(--cmp-border-subtle)]">
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Window</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-[color:var(--cmp-border-subtle)] last:border-none hover:bg-[color:var(--cmp-hover-surface)]"
                  onClick={() => openCampaign(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openCampaign(row.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                >
                  <td className="px-4 py-3 font-semibold text-[color:var(--sem-text-primary)]">{row.title}</td>
                  <td className="px-4 py-3 text-[color:var(--sem-text-secondary)]">{campaignKindLabel(row.campaign_kind)}</td>
                  <td className="px-4 py-3 text-[color:var(--sem-text-secondary)]">{formatStatusBadge(row.status)}</td>
                  <td className="px-4 py-3 text-[color:var(--sem-text-muted)]">
                    {row.window_starts_at.slice(0, 10)} → {row.window_ends_at.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-[color:var(--cmp-border-subtle)] px-4 py-2 text-[11px] text-[color:var(--sem-text-muted)]">
            Showing {campaigns.length} of {total}
          </p>
        </div>
      ) : null}
    </div>
  );
}
