"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  convertMarketingOpportunityToDraft,
  fetchMarketingOpportunities,
  patchMarketingOpportunity,
  refreshMarketingOpportunities,
  type SerializedMarketingOpportunity,
} from "@/lib/marketing/client-marketing";

type MarketingOpportunitiesPanelProps = {
  canMutateOpportunities: boolean;
};

export function MarketingOpportunitiesPanel({ canMutateOpportunities }: MarketingOpportunitiesPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<SerializedMarketingOpportunity[]>([]);
  const [total, setTotal] = useState(0);

  const loadList = useCallback(async (warmUp: boolean) => {
    setError(null);
    setLoading(true);
    try {
      const result = await fetchMarketingOpportunities({ limit: 50, offset: 0, warmUp });
      setItems(result.opportunities);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opportunities could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList(canMutateOpportunities);
  }, [canMutateOpportunities, loadList]);

  const onRefreshClick = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await refreshMarketingOpportunities();
      await loadList(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  };

  const onDismiss = async (id: string) => {
    try {
      await patchMarketingOpportunity(id, { action: "dismiss" });
      await loadList(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dismiss failed.");
    }
  };

  const onArchive = async (id: string) => {
    try {
      await patchMarketingOpportunity(id, { action: "archive" });
      await loadList(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed.");
    }
  };

  const onConvert = async (id: string) => {
    try {
      const detail = await convertMarketingOpportunityToDraft(id);
      const draftId = detail.draft?.id;
      if (draftId) {
        router.push(`/marketing/create?draft=${encodeURIComponent(draftId)}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not convert to draft.");
    }
  };

  const emptyCopy = useMemo(
    () =>
      canMutateOpportunities
        ? "No open opportunities right now. Run Refresh to scan recent jobs and inspections."
        : "No open opportunities right now. Ask an owner, admin, or office admin to refresh detection.",
    [canMutateOpportunities],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[color:var(--sem-text-secondary)]">
          Tenant-safe suggestions from completed work, service clusters, local job density, and before/after inspection
          signals. Media is never attached automatically.
        </p>
        {canMutateOpportunities ? (
          <button
            type="button"
            className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold"
            disabled={refreshing || loading}
            onClick={() => void onRefreshClick()}
          >
            {refreshing ? "Refreshing…" : "Refresh detection"}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="theme-alert-error rounded-[16px] border px-4 py-3 text-sm">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[color:var(--sem-text-muted)]">Loading opportunities…</p>
      ) : null}

      {!loading && items.length === 0 ? (
        <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-6 text-sm text-[color:var(--sem-text-secondary)]">
          {emptyCopy}
        </div>
      ) : null}

      <ul className="space-y-4">
        {items.map((opp) => (
          <li
            key={opp.id}
            className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">
                  {opp.opportunity_type.replace(/_/g, " ")}
                </p>
                <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">{opp.title}</h3>
                {opp.summary ? (
                  <p className="text-sm leading-6 text-[color:var(--sem-text-secondary)]">{opp.summary}</p>
                ) : null}
              </div>
              {canMutateOpportunities ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex rounded-full border border-transparent bg-[color:var(--sem-accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--sem-text-inverse)]"
                    onClick={() => void onConvert(opp.id)}
                  >
                    Convert to Draft
                  </button>
                  <button
                    type="button"
                    className="theme-control-surface-soft rounded-full border px-3 py-1.5 text-[11px] font-semibold"
                    onClick={() => void onDismiss(opp.id)}
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    className="theme-control-surface-soft rounded-full border px-3 py-1.5 text-[11px] font-semibold"
                    onClick={() => void onArchive(opp.id)}
                  >
                    Archive
                  </button>
                </div>
              ) : (
                <p className="text-xs text-[color:var(--sem-text-muted)]">View only · dispatcher session</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!loading && total > items.length ? (
        <p className="text-xs text-[color:var(--sem-text-muted)]">
          Showing {items.length} of {total} matching rows.
        </p>
      ) : null}

      <p className="text-xs leading-5 text-[color:var(--sem-text-muted)]">
        Phase 5+ campaign builder, Phase 6 automations, and Phase 7 analytics stay out of this surface by design.
      </p>
    </div>
  );
}
