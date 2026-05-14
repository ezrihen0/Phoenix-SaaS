"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DraftDetailPayload, MarketingVariantPayload, SerializedDraft } from "@/lib/marketing/client-marketing";
import {
  createMarketingDraft,
  fetchMarketingDraft,
  fetchMarketingDrafts,
  patchMarketingDraft,
  patchMarketingVariant,
  publishMarketingDraftNow,
  publishMarketingDraftSchedule,
  transitionMarketingDraft,
} from "@/lib/marketing/client-marketing";

const PLATFORM_TAB_ORDER = ["google_business", "facebook", "instagram"] as const;

const PLATFORM_LABELS: Record<string, string> = {
  google_business: "Google Business Profile",
  facebook: "Facebook",
  instagram: "Instagram",
};

function formatWorkflowState(raw: string) {
  if (raw === "needs_review") {
    return "Needs review";
  }

  return raw.slice(0, 1).toUpperCase() + raw.slice(1);
}

type MarketingContentStudioProps = {
  studioDraftQuery?: string;
  publishCapabilities?: {
    can_manage_channels: boolean;
    can_enqueue_publishing: boolean;
  };
};

export function MarketingContentStudio({ studioDraftQuery, publishCapabilities }: MarketingContentStudioProps) {
  const router = useRouter();
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [draftSummaries, setDraftSummaries] = useState<SerializedDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(() => studioDraftQuery?.trim() || null);

  const [creating, setCreating] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);

  const [detail, setDetail] = useState<DraftDetailPayload | null>(null);
  const [activePlatform, setActivePlatform] =
    useState<(typeof PLATFORM_TAB_ORDER)[number]>("google_business");

  const [newTitle, setNewTitle] = useState("");
  const [newIntent, setNewIntent] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftIntent, setDraftIntent] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");
  const [variantBodies, setVariantBodies] = useState<
    Partial<Record<string, MarketingVariantPayload["body"]>>
  >({});

  const [publishingBusy, setPublishingBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [publishScheduleLocal, setPublishScheduleLocal] = useState("");

  const syncDetailToFormFields = useCallback((payload: DraftDetailPayload) => {
    const { draft, variants } = payload;

    setDraftTitle(draft.title ?? "");
    setDraftIntent(draft.intent ?? "");
    setDraftNotes(draft.notes ?? "");

    if (draft.scheduled_at) {
      const iso = draft.scheduled_at;
      const local = iso.slice(0, 16);
      setScheduledAtLocal(local);
    } else {
      setScheduledAtLocal("");
    }

    const nextBodies: Partial<Record<string, MarketingVariantPayload["body"]>> = {};
    for (const variant of variants) {
      nextBodies[variant.platform_key] = { ...variant.body };
    }

    setVariantBodies(nextBodies);
  }, []);

  const refreshDraftList = useCallback(async () => {
    setListError(null);

    try {
      const list = await fetchMarketingDrafts({ limit: 100, offset: 0 });

      setDraftSummaries(list.drafts);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Unable to fetch drafts.");
    }
  }, []);

  useEffect(() => {
    void refreshDraftList();
  }, [refreshDraftList]);

  const loadDraft = useCallback(
    async (draftId: string | null, opts?: { syncUrl?: boolean }) => {
      if (!draftId) {
        setDetail(null);
        return;
      }

      setDetailBusy(true);
      setDetailError(null);

      try {
        const fetched = await fetchMarketingDraft(draftId);

        setDetail(fetched);
        syncDetailToFormFields(fetched);

        if (opts?.syncUrl ?? true) {
          router.replace(`/marketing/create?draft=${encodeURIComponent(draftId)}`, { scroll: false });
        }

        await refreshDraftList();
      } catch (err) {
        setDetail(null);
        setDetailError(err instanceof Error ? err.message : "Draft could not be opened.");
      } finally {
        setDetailBusy(false);
      }
    },
    [refreshDraftList, router, syncDetailToFormFields],
  );

  const seededUrlDraft = useRef(false);

  useEffect(() => {
    if (seededUrlDraft.current) {
      return;
    }

    seededUrlDraft.current = true;
    const fromQuery = studioDraftQuery?.trim();

    if (!fromQuery) {
      setSelectedDraftId(null);
      setDetail(null);
      setDetailError(null);
      return;
    }

    setSelectedDraftId(fromQuery);
    void loadDraft(fromQuery, { syncUrl: false });
  }, [loadDraft, studioDraftQuery]);

  const activeVariant = detail?.variants.find((variant) => variant.platform_key === activePlatform);

  const activeDraftBodySnapshot = variantBodies[activePlatform] ??
    activeVariant?.body ?? {
      headline: "",
      primary_text: "",
      cta: "",
      hashtags: "",
      alt_text: "",
    };

  const setBodyFieldKey = activePlatform;

  const updateActiveBody = useCallback(
    (fragment: Partial<MarketingVariantPayload["body"]>) => {
      const base = variantBodies[setBodyFieldKey] ?? detail?.variants.find((variant) => variant.platform_key === setBodyFieldKey)?.body;

      const merged = {
        headline: "",
        primary_text: "",
        cta: "",
        hashtags: "",
        alt_text: "",
        ...base,
        ...fragment,
      };

      setVariantBodies((prior) => ({ ...prior, [setBodyFieldKey]: merged }));
    },
    [detail?.variants, setBodyFieldKey, variantBodies],
  );

  const handleCreateDraft = useCallback(async () => {
    setCreating(true);
    setActionError(null);

    try {
      const draft = await createMarketingDraft({
        title: newTitle.trim() === "" ? "Untitled draft" : newTitle.trim(),
        intent: newIntent.trim() === "" ? null : newIntent.trim(),
        notes: null,
      });

      setNewTitle("");
      setNewIntent("");
      setDetail(draft);
      syncDetailToFormFields(draft);
      setSelectedDraftId(draft.draft.id);
      await refreshDraftList();
      router.replace(`/marketing/create?draft=${encodeURIComponent(draft.draft.id)}`, { scroll: false });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Draft could not be created.");
    } finally {
      setCreating(false);
    }
  }, [newIntent, newTitle, refreshDraftList, router, syncDetailToFormFields]);

  const handleSaveDraftMeta = useCallback(async () => {
    if (!selectedDraftId || !detail) {
      setActionError("Select a draft first.");
      return;
    }

    setDetailBusy(true);
    setActionError(null);

    try {
      let scheduledAtIso: string | null;

      if (scheduledAtLocal.trim() === "") {
        scheduledAtIso = null;
      } else {
        const parsed = new Date(scheduledAtLocal);

        scheduledAtIso = Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
      }

      const updated = await patchMarketingDraft(selectedDraftId, {
        title: draftTitle,
        intent: draftIntent.trim() === "" ? null : draftIntent.trim(),
        notes: draftNotes.trim() === "" ? null : draftNotes.trim(),
        scheduled_at: scheduledAtIso,
      });

      setDetail(updated);
      syncDetailToFormFields(updated);

      await refreshDraftList();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Draft update failed.");
    } finally {
      setDetailBusy(false);
    }
  }, [
    detail,
    draftIntent,
    draftNotes,
    draftTitle,
    refreshDraftList,
    scheduledAtLocal,
    selectedDraftId,
    syncDetailToFormFields,
  ]);

  const handleSaveVariantBody = useCallback(async () => {
    if (!selectedDraftId || !activeVariant) {
      setActionError("Select a platform tab with a seeded variant.");
      return;
    }

    setDetailBusy(true);
    setActionError(null);

    try {
      const body = variantBodies[activePlatform] ??
        detail?.variants.find((variant) => variant.platform_key === activePlatform)?.body;

      const updated =
        await patchMarketingVariant(
          selectedDraftId,
          activeVariant.id,
          body ?? activeVariant.body,
        );

      setDetail(updated);
      syncDetailToFormFields(updated);
      await refreshDraftList();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Variant save failed.");
    } finally {
      setDetailBusy(false);
    }
  }, [
    activePlatform,
    activeVariant,
    detail?.variants,
    refreshDraftList,
    selectedDraftId,
    syncDetailToFormFields,
    variantBodies,
  ]);

  const invokeTransition = useCallback(
    async (action: "submit_for_review" | "approve" | "request_changes") => {
      if (!selectedDraftId) {
        setActionError("Select a draft first.");
        return;
      }

      setDetailBusy(true);
      setActionError(null);

      try {
        const updated = await transitionMarketingDraft(selectedDraftId, action);

        setDetail(updated);
        syncDetailToFormFields(updated);
        await refreshDraftList();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Workflow transition rejected.");
      } finally {
        setDetailBusy(false);
      }
    },
    [refreshDraftList, selectedDraftId, syncDetailToFormFields],
  );

  const statusBadgeClasses = useMemo(() => {
    const state = detail?.draft.workflow_state ?? "draft";

    if (state === "approved") {
      return "border-emerald-500/70 text-emerald-400";
    }

    if (state === "needs_review") {
      return "border-amber-400/70 text-amber-300";
    }

    return "border-[color:var(--cmp-border-subtle)] text-[color:var(--sem-text-muted)]";
  }, [detail?.draft.workflow_state]);

  const canPublish = Boolean(publishCapabilities?.can_enqueue_publishing);

  const handlePublishNow = useCallback(async () => {
    if (!detail?.draft?.id) {
      return;
    }

    setPublishingBusy(true);
    setActionError(null);

    try {
      await publishMarketingDraftNow(detail.draft.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Publish request failed.");
    } finally {
      setPublishingBusy(false);
    }
  }, [detail?.draft?.id]);

  const handlePublishSchedule = useCallback(async () => {
    if (!detail?.draft?.id || !publishScheduleLocal.trim()) {
      return;
    }

    setPublishingBusy(true);
    setActionError(null);

    try {
      const iso = new Date(publishScheduleLocal).toISOString();

      await publishMarketingDraftSchedule(detail.draft.id, iso);
      setScheduleOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Schedule request failed.");
    } finally {
      setPublishingBusy(false);
    }
  }, [detail?.draft?.id, publishScheduleLocal]);

  return (
    <div className="grid gap-6 xl:grid-cols-[260px,minmax(0,1fr)]">
      <aside className="theme-surface-card space-y-4 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Drafts</p>

        {listError ? <div className="text-sm text-rose-300">{listError}</div> : null}

        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {draftSummaries.map((row) => {
            const active = row.id === selectedDraftId;

            return (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  setSelectedDraftId(row.id);
                  void loadDraft(row.id);
                }}
                className={[
                  "w-full rounded-[18px] border px-3 py-2 text-left text-sm transition",
                  active
                    ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-hover-surface)]"
                    : "border-[color:var(--cmp-border-subtle)] hover:border-[color:var(--cmp-border-accent)]",
                ].join(" ")}
              >
                <p className="font-semibold text-[color:var(--sem-text-primary)]">{row.title || "Untitled draft"}</p>
                <p className="text-xs text-[color:var(--sem-text-muted)]">{formatWorkflowState(row.workflow_state)}</p>
              </button>
            );
          })}
        </div>

        <div className="border-t border-[color:var(--cmp-border-subtle)] pt-4">
          <p className="text-xs font-semibold text-[color:var(--sem-text-primary)]">New manual draft</p>
          <label className="mt-3 block text-xs text-[color:var(--sem-text-secondary)]">
            Title
            <input
              className="mt-1 w-full rounded-[14px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm"
              value={newTitle}
              onChange={(evt) => setNewTitle(evt.target.value)}
              placeholder="Spring tune-up reminder"
            />
          </label>
          <label className="mt-3 block text-xs text-[color:var(--sem-text-secondary)]">
            Intent (optional)
            <input
              className="mt-1 w-full rounded-[14px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm"
              value={newIntent}
              onChange={(evt) => setNewIntent(evt.target.value)}
              placeholder="educate, promo, seasonal…"
            />
          </label>
          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreateDraft()}
            className="mt-3 w-full rounded-[16px] border border-transparent bg-[color:var(--sem-accent-primary)] px-3 py-2 text-sm font-semibold text-[color:var(--sem-text-inverse)] disabled:opacity-60"
          >
            {creating ? "Creating…" : "Create draft"}
          </button>
          <p className="mt-2 text-[11px] leading-4 text-[color:var(--sem-text-muted)]">
            Each draft gets three platform variants immediately.
          </p>
        </div>
      </aside>

      <section className="space-y-4">
        {detailError ? <div className="theme-alert-error rounded-[20px] border px-4 py-3 text-sm">{detailError}</div> : null}
        {actionError ? <div className="theme-alert-error rounded-[20px] border px-4 py-3 text-sm">{actionError}</div> : null}

        {!detail ? (
          <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-6 text-sm text-[color:var(--sem-text-secondary)]">
            {detailBusy
              ? "Loading draft…"
              : "Pick a draft from the list or create a new one. Copy is manual only in Phase 2."}
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Active draft</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h3 className="text-xl font-semibold text-[color:var(--sem-text-primary)]">
                    {detail.draft.title || "Untitled draft"}
                  </h3>
                  <span
                    className={[
                      "rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em]",
                      statusBadgeClasses,
                    ].join(" ")}
                  >
                    {formatWorkflowState(detail.draft.workflow_state)}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={detailBusy || detail.draft.workflow_state !== "draft"}
                  onClick={() => void invokeTransition("submit_for_review")}
                  className="theme-control-surface-soft rounded-[16px] border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Submit for review
                </button>
                <button
                  type="button"
                  disabled={detailBusy || detail.draft.workflow_state !== "needs_review"}
                  onClick={() => void invokeTransition("approve")}
                  className="theme-control-surface-soft rounded-[16px] border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={detailBusy || detail.draft.workflow_state !== "needs_review"}
                  onClick={() => void invokeTransition("request_changes")}
                  className="theme-control-surface-soft rounded-[16px] border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Request changes
                </button>
                {canPublish && detail.draft.workflow_state === "approved" ? (
                  <>
                    <button
                      type="button"
                      disabled={detailBusy || publishingBusy}
                      onClick={() => void handlePublishNow()}
                      className="rounded-[16px] border border-transparent bg-[color:var(--sem-accent-primary)] px-3 py-2 text-xs font-semibold text-[color:var(--sem-text-inverse)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {publishingBusy ? "Publishing…" : "Publish now"}
                    </button>
                    <button
                      type="button"
                      disabled={detailBusy || publishingBusy}
                      onClick={() => setScheduleOpen(true)}
                      className="theme-control-surface-soft rounded-[16px] border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Schedule publishing
                    </button>
                  </>
                ) : null}
              </div>
            </header>

            {scheduleOpen ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-10">
                <div className="w-full max-w-md rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] p-6 shadow-2xl">
                  <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">Schedule publishing (UTC execution)</p>
                  <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-muted)]">
                    This becomes the publish job execution time (stored in UTC). Draft calendar metadata stays editorial-only.
                  </p>
                  <label className="mt-4 block text-xs text-[color:var(--sem-text-secondary)]">
                    Run at (local picker → ISO UTC on save)
                    <input
                      type="datetime-local"
                      className="mt-2 w-full rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm"
                      value={publishScheduleLocal}
                      onChange={(evt) => setPublishScheduleLocal(evt.target.value)}
                    />
                  </label>
                  <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="theme-control-surface-soft rounded-[16px] border px-4 py-2 text-xs font-semibold"
                      onClick={() => setScheduleOpen(false)}
                      disabled={publishingBusy}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={publishingBusy || !publishScheduleLocal.trim()}
                      className="rounded-[16px] border border-transparent bg-[color:var(--sem-accent-primary)] px-4 py-2 text-xs font-semibold text-[color:var(--sem-text-inverse)] disabled:opacity-40"
                      onClick={() => void handlePublishSchedule()}
                    >
                      {publishingBusy ? "Saving…" : "Enqueue schedule"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="theme-surface-card grid gap-4 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5 md:grid-cols-2">
              <label className="block text-sm text-[color:var(--sem-text-secondary)]">
                Title
                <input
                  className="mt-2 w-full rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm"
                  value={draftTitle}
                  onChange={(evt) => setDraftTitle(evt.target.value)}
                />
              </label>
              <label className="block text-sm text-[color:var(--sem-text-secondary)]">
                Intent
                <input
                  className="mt-2 w-full rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm"
                  value={draftIntent}
                  onChange={(evt) => setDraftIntent(evt.target.value)}
                />
              </label>
              <label className="md:col-span-2 block text-sm text-[color:var(--sem-text-secondary)]">
                Internal notes
                <textarea
                  rows={3}
                  className="mt-2 w-full rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm"
                  value={draftNotes}
                  onChange={(evt) => setDraftNotes(evt.target.value)}
                />
              </label>
              <label className="md:col-span-2 block text-sm text-[color:var(--sem-text-secondary)]">
                Calendar hint (optional, metadata only)
                <input
                  type="datetime-local"
                  className="mt-2 w-full rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm"
                  value={scheduledAtLocal}
                  onChange={(evt) => setScheduledAtLocal(evt.target.value)}
                />
              </label>
              <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={detailBusy}
                  onClick={() => void handleSaveDraftMeta()}
                  className="rounded-[18px] border border-transparent bg-[color:var(--sem-accent-primary)] px-4 py-2 text-xs font-semibold text-[color:var(--sem-text-inverse)] disabled:opacity-60"
                >
                  Save draft metadata
                </button>
              </div>
            </div>

            <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
              <div className="flex flex-wrap gap-2 border-b border-[color:var(--cmp-border-subtle)] pb-3">
                {(PLATFORM_TAB_ORDER as readonly string[]).map((key) => {
                  const variant = detail.variants.find((row) => row.platform_key === key);
                  const label = PLATFORM_LABELS[key] ?? key;
                  const active = key === activePlatform;

                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!variant}
                      onClick={() => variant && setActivePlatform(key as (typeof PLATFORM_TAB_ORDER)[number])}
                      className={[
                        "rounded-[16px] border px-3 py-2 text-xs font-semibold transition",
                        active
                          ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-hover-surface)]"
                          : "border-[color:var(--cmp-border-subtle)]",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {!activeVariant ? (
                <p className="mt-4 text-sm text-[color:var(--sem-text-muted)]">Variant missing unexpectedly.</p>
              ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="block text-sm text-[color:var(--sem-text-secondary)] md:col-span-2">
                    Headline / title hook
                    <input
                      className="mt-2 w-full rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm"
                      value={activeDraftBodySnapshot.headline}
                      onChange={(evt) => updateActiveBody({ headline: evt.target.value })}
                    />
                  </label>
                  <label className="md:col-span-2 block text-sm text-[color:var(--sem-text-secondary)]">
                    Primary text
                    <textarea
                      rows={5}
                      className="mt-2 w-full rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm"
                      value={activeDraftBodySnapshot.primary_text}
                      onChange={(evt) => updateActiveBody({ primary_text: evt.target.value })}
                    />
                  </label>
                  <label className="block text-sm text-[color:var(--sem-text-secondary)]">
                    Call to action label
                    <input
                      className="mt-2 w-full rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm"
                      value={activeDraftBodySnapshot.cta}
                      onChange={(evt) => updateActiveBody({ cta: evt.target.value })}
                    />
                  </label>
                  <label className="block text-sm text-[color:var(--sem-text-secondary)]">
                    Alt text note
                    <input
                      className="mt-2 w-full rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm"
                      value={activeDraftBodySnapshot.alt_text}
                      onChange={(evt) => updateActiveBody({ alt_text: evt.target.value })}
                    />
                  </label>
                  <label className="md:col-span-2 block text-sm text-[color:var(--sem-text-secondary)]">
                    Hashtags / tags
                    <textarea
                      rows={2}
                      className="mt-2 w-full rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-3 py-2 text-sm"
                      value={activeDraftBodySnapshot.hashtags}
                      onChange={(evt) => updateActiveBody({ hashtags: evt.target.value })}
                    />
                  </label>

                  <div className="md:col-span-2 flex justify-end">
                    <button
                      type="button"
                      disabled={detailBusy}
                      onClick={() => void handleSaveVariantBody()}
                      className="rounded-[18px] border border-transparent bg-[color:var(--sem-accent-primary)] px-4 py-2 text-xs font-semibold text-[color:var(--sem-text-inverse)] disabled:opacity-60"
                    >
                      Save {PLATFORM_LABELS[activePlatform]} copy
                    </button>
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs leading-5 text-[color:var(--sem-text-muted)]">
              Editing copy or meaningful metadata while awaiting review resets the workflow to draft. Scheduling alone on an approved
              draft does not downgrade approval.&nbsp;
              <Link href="/marketing/calendar" className="text-[color:var(--sem-accent-primary)] underline">
                View calendar placeholders
              </Link>
              .
            </p>
          </>
        )}
      </section>
    </div>
  );
}
