"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { MarketingCalendarPayload, SerializedDraft } from "@/lib/marketing/client-marketing";
import { fetchMarketingCalendar } from "@/lib/marketing/client-marketing";

function formatWorkflowState(raw: string) {
  if (raw === "needs_review") {
    return "Needs review";
  }

  return raw.slice(0, 1).toUpperCase() + raw.slice(1);
}

function monthWindowUtc(reference: Date) {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0, 23, 59, 59));

  return { start, end };
}

export function MarketingCalendarPanel() {
  const [cursor, setCursor] = useState(() => new Date());
  const [payload, setPayload] = useState<MarketingCalendarPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const monthLabel = useMemo(
    () =>
      cursor.toLocaleString(undefined, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    [cursor],
  );

  const loadRange = useCallback(async (reference: Date) => {
    const { start, end } = monthWindowUtc(reference);

    setLoading(true);
    setError(null);

    try {
      const data = await fetchMarketingCalendar({
        from: start.toISOString(),
        to: end.toISOString(),
      });

      setPayload(data);
    } catch (err) {
      setPayload(null);
      setError(err instanceof Error ? err.message : "Calendar data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRange(cursor);
  }, [cursor, loadRange]);

  const draftsByDay = useMemo(() => {
    const map = new Map<string, SerializedDraft[]>();

    payload?.days.forEach((day) => {
      map.set(day.date, day.drafts);
    });

    return map;
  }, [payload]);

  const gridDates = useMemo(() => {
    const year = cursor.getUTCFullYear();
    const monthIndexZero = cursor.getUTCMonth();

    const start = new Date(Date.UTC(year, monthIndexZero, 1, 0, 0, 0));

    const firstDaySunday = start.getUTCDay();
    const leadingPad = (firstDaySunday + 6) % 7;
    const monthLength = new Date(Date.UTC(year, monthIndexZero + 1, 0)).getUTCDate();

    const placeholders: Array<string | null> = Array.from({ length: leadingPad }, () => null);

    const monthDays = Array.from({ length: monthLength }, (_, index) =>
      `${year.toString().padStart(4, "0")}-${String(monthIndexZero + 1).padStart(2, "0")}-${String(
        index + 1,
      ).padStart(2, "0")}`,
    );

    return [...placeholders, ...monthDays];
  }, [cursor]);

  return (
    <div className="space-y-4">
      {error ? <div className="theme-alert-error rounded-[20px] border px-4 py-3 text-sm">{error}</div> : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{monthLabel} (UTC)</p>
          <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
            Scheduled times are placeholders. Nothing posts externally in Phase 2.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              setCursor((prior) => new Date(Date.UTC(prior.getUTCFullYear(), prior.getUTCMonth() - 1, prior.getUTCDate())))
            }
            className="theme-control-surface-soft rounded-[16px] border px-3 py-2 text-xs font-semibold"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              setCursor((prior) => new Date(Date.UTC(prior.getUTCFullYear(), prior.getUTCMonth() + 1, prior.getUTCDate())))
            }
            className="theme-control-surface-soft rounded-[16px] border px-3 py-2 text-xs font-semibold"
          >
            Next
          </button>
        </div>
      </div>

      <div className="theme-surface-card overflow-hidden rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]">
        <div className="grid grid-cols-7 border-b border-[color:var(--cmp-border-subtle)] text-center text-[11px] uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
            <span key={label} className="border-r border-[color:var(--cmp-border-subtle)] py-3 last:border-r-0">
              {label}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {gridDates.map((dayKey, index) => {
            const stableKey =
              typeof dayKey === "string"
                ? `cal-${cursor.getUTCFullYear()}-${cursor.getUTCMonth()}-${dayKey}`
                : `pad-${cursor.getUTCFullYear()}-${cursor.getUTCMonth()}-${index}`;

            return (
              <div
                key={stableKey}
                className="min-h-[110px] border-b border-r border-[color:var(--cmp-border-subtle)] p-2 last:border-r-0"
              >
                {dayKey ? (
                  <>
                    <p className="text-[11px] font-semibold text-[color:var(--sem-text-muted)]">{dayKey.slice(8)}</p>
                    <div className="mt-2 space-y-2">
                      {(draftsByDay.get(dayKey) ?? []).slice(0, 3).map((draft) => (
                        <Link
                          key={draft.id}
                          href={`/marketing/create?draft=${encodeURIComponent(draft.id)}`}
                          className="block rounded-[12px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-2 py-1 text-[11px] leading-4 hover:border-[color:var(--cmp-border-accent)]"
                        >
                          <span className="block font-semibold text-[color:var(--sem-text-primary)] truncate">{draft.title}</span>
                          <span className="text-[color:var(--sem-text-muted)]">{formatWorkflowState(draft.workflow_state)}</span>
                        </Link>
                      ))}
                      {(draftsByDay.get(dayKey)?.length ?? 0) > 3 ? (
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">
                          + {(draftsByDay.get(dayKey)?.length ?? 0) - 3} more
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="h-full opacity-40" aria-hidden />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-[color:var(--sem-text-muted)]">
        {loading ? "Loading calendar…" : null}
      </p>
    </div>
  );
}
