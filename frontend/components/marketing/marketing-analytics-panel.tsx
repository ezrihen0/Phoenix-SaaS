"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchMarketingAnalyticsSummary,
  type MarketingAnalyticsSummaryPayload,
} from "@/lib/marketing/client-marketing";

function KeyValueRows({ rows }: { rows: Record<string, number | string | null | undefined> }) {
  const entries = useMemo(() => Object.entries(rows).sort(([a], [b]) => a.localeCompare(b)), [rows]);

  if (!entries.length) {
    return <p className="text-sm text-[color:var(--sem-text-muted)]">No rows.</p>;
  }

  return (
    <dl className="grid gap-2 text-sm">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="flex flex-wrap items-baseline justify-between gap-3 rounded-[14px] border border-[color:var(--cmp-border-subtle)] px-3 py-2"
        >
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-[color:var(--sem-text-muted)]">
            {k.replace(/_/g, " ")}
          </dt>
          <dd className="font-semibold text-[color:var(--sem-text-primary)]">{v === null || v === undefined ? "—" : `${v}`}</dd>
        </div>
      ))}
    </dl>
  );
}

function NumberBuckets({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);

  if (!entries.length) {
    return <p className="text-sm text-[color:var(--sem-text-muted)]">Nothing in window.</p>;
  }

  return (
    <ul className="space-y-2 text-sm">
      {entries.map(([key, count]) => (
        <li
          key={key}
          className="flex items-center justify-between gap-4 rounded-[14px] border border-[color:var(--cmp-border-subtle)] px-3 py-2"
        >
          <span className="font-medium capitalize text-[color:var(--sem-text-primary)]">{key.replace(/_/g, " ")}</span>
          <span className="tabular-nums text-[color:var(--sem-text-secondary)]">{count}</span>
        </li>
      ))}
    </ul>
  );
}

function AttemptTable({ rows }: { rows: MarketingAnalyticsSummaryPayload["publishing"]["attempts_started_in_window_by_platform"] }) {
  if (!rows?.length) {
    return <p className="text-sm text-[color:var(--sem-text-muted)]">No attempts recorded in window.</p>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[480px] text-left text-xs">
        <thead className="text-[color:var(--sem-text-muted)]">
          <tr className="border-b border-[color:var(--cmp-border-subtle)]">
            <th className="py-2 pr-3 font-medium">Platform</th>
            <th className="py-2 pr-3 font-medium">Total</th>
            <th className="py-2 pr-3 font-medium">Succeeded</th>
            <th className="py-2 pr-3 font-medium">Failed</th>
            <th className="py-2 font-medium">Other</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.platform_key} className="border-b border-[color:var(--cmp-border-subtle)] last:border-none">
              <td className="py-3 pr-3 font-semibold text-[color:var(--sem-text-primary)]">{r.platform_key}</td>
              <td className="py-3 pr-3">{r.total}</td>
              <td className="py-3 pr-3">{r.succeeded}</td>
              <td className="py-3 pr-3">{r.failed}</td>
              <td className="py-3">{r.other}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PRESETS = ["last_7d", "last_30d", "last_90d"] as const;

export function MarketingAnalyticsPanel() {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>("last_30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [data, setData] = useState<MarketingAnalyticsSummaryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = useCustom
        ? await fetchMarketingAnalyticsSummary({ from: customFrom, to: customTo })
        : await fetchMarketingAnalyticsSummary({ preset });
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analytics summary could not be loaded.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [customFrom, customTo, preset, useCustom]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Time window</p>
        <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
          Org-scoped aggregates only. Use presets or UTC calendar bounds; do not combine both.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[color:var(--sem-text-secondary)]">
            <input
              type="checkbox"
              checked={useCustom}
              onChange={(e) => setUseCustom(e.target.checked)}
              className="rounded border-[color:var(--cmp-border-subtle)]"
            />
            Custom UTC range (from / to dates)
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void refresh()}
            className="inline-flex rounded-full border border-transparent bg-[color:var(--sem-accent-primary)] px-4 py-2 text-xs font-semibold text-[color:var(--sem-text-inverse)] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {!useCustom ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {PRESETS.map((key) => {
              const active = preset === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={loading}
                  onClick={() => setPreset(key)}
                  className={[
                    active ? "theme-selected-card" : "theme-control-surface-soft",
                    "rounded-full border px-4 py-2 text-xs font-semibold transition",
                  ].join(" ")}
                >
                  {key.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-xs text-[color:var(--sem-text-muted)]">
              From (UTC date)
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="theme-control-surface-soft rounded-xl border px-3 py-2 text-sm text-[color:var(--sem-text-primary)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--sem-text-muted)]">
              To (UTC date)
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="theme-control-surface-soft rounded-xl border px-3 py-2 text-sm text-[color:var(--sem-text-primary)]"
              />
            </label>
          </div>
        )}

        {data?.window ? (
          <p className="mt-4 text-xs leading-5 text-[color:var(--sem-text-muted)]">
            <span className="font-semibold text-[color:var(--sem-text-secondary)]">{data.window.preset}</span>
            {": "}
            {data.window.from} → {data.window.to}. {data.window.utc_note}
          </p>
        ) : null}
      </div>

      {error ? <div className="theme-alert-error rounded-[20px] border px-4 py-3 text-sm">{error}</div> : null}

      {loading ? <p className="text-sm text-[color:var(--sem-text-muted)]">Loading analytics…</p> : null}

      {!loading && data ? (
        <div className="space-y-6">
          <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-accent)]/30 bg-[color:var(--cmp-surface-card)] p-5">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-accent-primary)]">
              Operational disclaimers
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
              {(data.disclaimers ?? []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
              <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Opportunities</h3>
              <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">Creates in window by current row status.</p>
              <div className="mt-4">
                <NumberBuckets data={data.opportunities.rows_created_in_window_by_current_status} />
              </div>
              <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                Lifecycle touches (timestamps)
              </p>
              <div className="mt-2">
                <KeyValueRows rows={data.opportunities.lifecycle_events_in_window as Record<string, number>} />
              </div>
              <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                Top types (creates)
              </p>
              <ul className="mt-2 space-y-2 text-sm">
                {(data.opportunities.top_opportunity_types_in_window ?? []).map((row) => (
                  <li
                    key={row.opportunity_type}
                    className="flex justify-between gap-4 rounded-[12px] border border-[color:var(--cmp-border-subtle)] px-3 py-2"
                  >
                    <span className="font-mono text-[color:var(--sem-text-primary)]">{row.opportunity_type}</span>
                    <span className="tabular-nums">{row.count}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
              <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Drafts</h3>
              <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">Creates in window: workflow snapshot + prioritized source buckets.</p>
              <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">Workflow states</p>
              <div className="mt-2">
                <NumberBuckets data={data.drafts.workflow_state_counts_for_creates_in_window} />
              </div>
              <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">Draft sources</p>
              <div className="mt-2">
                <NumberBuckets data={data.drafts.draft_source_buckets_creates_in_window} />
              </div>
            </section>

            <section className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
              <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Campaigns</h3>
              <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">Plans created in window.</p>
              <div className="mt-4">
                <NumberBuckets data={data.campaigns.campaigns_created_in_window_by_status} />
              </div>
              <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                Slot coverage (same campaign cohort)
              </p>
              <div className="mt-2">
                <KeyValueRows rows={data.campaigns.item_slot_coverage_campaigns_created_in_window as unknown as Record<string, number>} />
              </div>
            </section>

            <section className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
              <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Publishing</h3>
              <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">Enqueue attempts only — not downstream reach.</p>
              <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">Jobs by status</p>
              <div className="mt-2">
                <NumberBuckets data={data.publishing.jobs_created_in_window_by_status} />
              </div>
              <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                Attempts by platform
              </p>
              <div className="mt-3">
                <AttemptTable rows={data.publishing.attempts_started_in_window_by_platform} />
              </div>
            </section>

            <section className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
              <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Automations</h3>
              <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">Runs in window omit silent skips with no persisted row.</p>
              <p className="mt-4 text-sm text-[color:var(--sem-text-secondary)]">
                Enabled rules (current snapshot):{" "}
                <span className="font-semibold text-[color:var(--sem-text-primary)]">{data.automations.rules_enabled_current_total}</span>
              </p>
              <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">Outcomes</p>
              <div className="mt-2">
                <NumberBuckets data={data.automations.runs_in_window_by_outcome} />
              </div>
              <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">Top skip reasons</p>
              <ul className="mt-2 space-y-2 text-sm">
                {(data.automations.top_skip_reasons_in_window ?? []).map((r) => (
                  <li key={r.skip_reason} className="flex justify-between gap-4 rounded-[12px] border border-[color:var(--cmp-border-subtle)] px-3 py-2">
                    <span className="font-mono text-[color:var(--sem-text-primary)]">{r.skip_reason || "(empty)"}</span>
                    <span className="tabular-nums">{r.count}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
              <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Channels</h3>
              <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">OAuth target health snapshot + failures timestamped in window.</p>
              <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                Connections by status
              </p>
              <ul className="mt-2 space-y-2 text-sm">
                {(data.channels.connection_status_counts ?? []).map((r) => (
                  <li
                    key={r.connection_status}
                    className="flex justify-between gap-4 rounded-[12px] border border-[color:var(--cmp-border-subtle)] px-3 py-2"
                  >
                    <span className="capitalize">{r.connection_status.replace(/_/g, " ")}</span>
                    <span className="tabular-nums">{r.count}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
                Channels with failure timestamp in window
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-[color:var(--sem-text-primary)]">
                {data.channels.channels_with_last_failure_in_window}
              </p>
            </section>
          </div>

          <section className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
            <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Workflow funnels (approx)</h3>
            <div className="mt-4">
              <KeyValueRows rows={data.funnels as Record<string, number | string | null | undefined>} />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
