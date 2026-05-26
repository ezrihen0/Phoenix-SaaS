"use client";

import { Camera } from "lucide-react";

import type { InspectionWorkspacePayload } from "@/lib/inspections/browser-api";

import { formatSectionLabel, itemStatusLabel } from "./inspection-labels";

export type StructuredRecommendationDraft = {
  issueObserved: string;
  riskIfIgnored: string;
  recommendedAction: string;
  priorityLevel: "P1" | "P2" | "P3" | "P4";
};

const priorityRanks: Record<StructuredRecommendationDraft["priorityLevel"], string> = {
  P1: "1/4",
  P2: "2/4",
  P3: "3/4",
  P4: "4/4",
};

const priorityDescriptions: Record<StructuredRecommendationDraft["priorityLevel"], string> = {
  P1: "Safety Concern / Action Required Before Continued Use",
  P2: "Recommended Repair / Prevent Further Damage",
  P3: "Preventive Maintenance / System Longevity",
  P4: "Optional Upgrade / Performance or Protection Improvement",
};

type InspectionChecklistRowProps = {
  item: InspectionWorkspacePayload["items"][number];
  isStandardWorkflow: boolean;
  recommendationDraft: StructuredRecommendationDraft;
  photoButtonsDisabled: boolean;
  itemButtonsDisabled: boolean;
  onStatusChange: (itemId: string, status: "satisfactory" | "unsatisfactory" | "na") => void;
  onOpenPhotoPicker: (itemId: string, source: "camera" | "library") => void;
  onUpdateRecommendationDraft: (item: InspectionWorkspacePayload["items"][number], patch: Partial<StructuredRecommendationDraft>, shouldCommit?: boolean) => void;
  onCommitRecommendationDraft: (item: InspectionWorkspacePayload["items"][number]) => void;
  onRecommendationBlur: (itemId: string, value: string | null) => void;
};

export function InspectionChecklistRow({
  item,
  isStandardWorkflow,
  recommendationDraft,
  photoButtonsDisabled,
  itemButtonsDisabled,
  onStatusChange,
  onOpenPhotoPicker,
  onUpdateRecommendationDraft,
  onCommitRecommendationDraft,
  onRecommendationBlur,
}: InspectionChecklistRowProps) {
  const isProblem = item.status === "unsatisfactory";
  const rowClass = isProblem
    ? "bg-[color:var(--cmp-status-error-bg)]/40"
    : item.status === "na"
      ? "bg-[color:var(--cmp-surface-soft)]"
      : "bg-[color:var(--cmp-surface-soft)]/30";

  return (
    <div className={`p-5 transition ${rowClass}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">{formatSectionLabel(item.section_key)}</span>
            <span className="theme-control-surface rounded px-1.5 py-0.5 font-mono text-[9px] uppercase text-[color:var(--sem-text-muted)]">{item.item_key}</span>
            {item.is_required ? <span className="theme-control-surface rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[color:var(--sem-text-secondary)]">Required</span> : null}
            {item.is_legal_mandatory ? <span className="theme-alert-warning rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase">Mandatory</span> : null}
            {item.photo_attached_count > 0 ? (
              <span className="rounded border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--sem-accent-primary)]">{item.photo_attached_count} photos</span>
            ) : null}
            {item.assignment_type ? (
              <span className="theme-control-surface rounded px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--sem-text-muted)]">{item.assignment_type.replaceAll("_", " ")}</span>
            ) : null}
          </div>
          <h3 className="text-sm font-semibold leading-6 text-[color:var(--sem-text-primary)]">{item.item_label}</h3>
          {item.recommendation_text && !isProblem ? (
            <p className="theme-control-surface rounded-xl px-3 py-2 text-xs leading-5 text-[color:var(--sem-text-secondary)]">{item.recommendation_text}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {(["satisfactory", "unsatisfactory", "na"] as const).map((status) => {
            const active = item.status === status;
            const tone = status === "satisfactory" ? "emerald" : status === "unsatisfactory" ? "rose" : "zinc";
            const activeClass = tone === "emerald"
              ? "bg-emerald-600 border-emerald-700 text-white"
              : tone === "rose"
                ? "bg-rose-600 border-rose-700 text-white"
                : "bg-zinc-800 border-zinc-900 text-white";
            return (
              <button
                key={status}
                type="button"
                disabled={itemButtonsDisabled}
                onClick={() => onStatusChange(item.id, status)}
                className={`h-9 rounded-xl border px-3 font-mono text-xs font-bold tracking-wider transition ${active ? activeClass : "theme-btn-ghost border px-3"}`}
              >
                {itemStatusLabel(status)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="theme-btn-ghost rounded-lg px-2 py-1 text-[11px] disabled:opacity-50" disabled={photoButtonsDisabled} onClick={() => onOpenPhotoPicker(item.id, "camera")}>
          + Take Photo
        </button>
        <button type="button" className="theme-btn-ghost rounded-lg px-2 py-1 text-[11px] disabled:opacity-50" disabled={photoButtonsDisabled} onClick={() => onOpenPhotoPicker(item.id, "library")}>
          + Library
        </button>
      </div>

      {isProblem ? (
        <>
          {isStandardWorkflow ? (
            <div className="mt-4 grid gap-2">
              <label className="grid gap-1 text-xs text-[color:var(--sem-text-secondary)]">
                <span>Priority rank ({priorityRanks[recommendationDraft.priorityLevel]})</span>
                <select
                  className="theme-input-control w-full rounded-xl px-2 py-2 text-xs"
                  value={recommendationDraft.priorityLevel}
                  disabled={itemButtonsDisabled}
                  onChange={(event) => {
                    onUpdateRecommendationDraft(item, { priorityLevel: event.target.value as StructuredRecommendationDraft["priorityLevel"] }, true);
                  }}
                >
                  <option value="P1">{priorityDescriptions.P1}</option>
                  <option value="P2">{priorityDescriptions.P2}</option>
                  <option value="P3">{priorityDescriptions.P3}</option>
                  <option value="P4">{priorityDescriptions.P4}</option>
                </select>
              </label>
              <input
                className="theme-input-control w-full rounded-xl px-2 py-2 text-xs"
                placeholder="Issue observed"
                value={recommendationDraft.issueObserved}
                disabled={itemButtonsDisabled}
                onChange={(event) => onUpdateRecommendationDraft(item, { issueObserved: event.target.value }, true)}
                onBlur={() => onCommitRecommendationDraft(item)}
              />
              <input
                className="theme-input-control w-full rounded-xl px-2 py-2 text-xs"
                placeholder="Risk if ignored"
                value={recommendationDraft.riskIfIgnored}
                disabled={itemButtonsDisabled}
                onChange={(event) => onUpdateRecommendationDraft(item, { riskIfIgnored: event.target.value }, true)}
                onBlur={() => onCommitRecommendationDraft(item)}
              />
              <input
                className="theme-input-control w-full rounded-xl px-2 py-2 text-xs"
                placeholder="Recommended action"
                value={recommendationDraft.recommendedAction}
                disabled={itemButtonsDisabled}
                onChange={(event) => onUpdateRecommendationDraft(item, { recommendedAction: event.target.value }, true)}
                onBlur={() => onCommitRecommendationDraft(item)}
              />
            </div>
          ) : (
            <textarea
              className="theme-input-control mt-4 w-full rounded-xl px-2 py-2 text-xs"
              placeholder="Recommendation"
              defaultValue={item.recommendation_text ?? ""}
              disabled={itemButtonsDisabled}
              onBlur={(event) => {
                const value = event.target.value;
                onRecommendationBlur(item.id, value.trim() ? value : null);
              }}
            />
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[color:var(--cmp-border-subtle)] pt-3">
            <div className="flex items-center gap-2 text-xs text-[color:var(--sem-text-secondary)]">
              <Camera className="h-4 w-4 text-[color:var(--sem-text-muted)]" />
              <span>
                {item.assignment_type
                  ? "Attach evidence photo through the existing upload / assign flow."
                  : "Photo evidence may be required by report gates for this finding."}
              </span>
            </div>
            <span className="theme-alert-error rounded-lg px-2.5 py-1 font-mono text-[10px] font-semibold">REPORT FINDING</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
