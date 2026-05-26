"use client";

import { useMemo, useState } from "react";
import { Archive } from "lucide-react";

import type { InspectionArchiveReasonCode } from "@/lib/inspections/browser-api";

import { archiveReasonCodeLabel, INSPECTION_ARCHIVE_REASON_CODES } from "./inspection-labels";

type InspectionArchiveModalProps = {
  open: boolean;
  busy: boolean;
  error: string | null;
  requiresStrongerReason: boolean;
  onClose: () => void;
  onConfirm: (input: { reasonCode: InspectionArchiveReasonCode; reasonText: string }) => void;
};

const fieldLabelClass = "text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]";

export function InspectionArchiveModal({
  open,
  busy,
  error,
  requiresStrongerReason,
  onClose,
  onConfirm,
}: InspectionArchiveModalProps) {
  const [reasonCode, setReasonCode] = useState<InspectionArchiveReasonCode>("customer_repaired_issue");
  const [reasonText, setReasonText] = useState("");

  const minLength = requiresStrongerReason ? 20 : 10;
  const trimmedReason = reasonText.trim();
  const canSubmit = trimmedReason.length >= minLength && !busy;

  const helperCopy = useMemo(() => {
    if (requiresStrongerReason) {
      return "This report has already been generated, sent, or locked. Archiving will preserve history but remove it from active workflows. A detailed reason of at least 20 characters is required.";
    }
    return "Archiving keeps this report in history but removes it from active inspection workflows. Use this when the report was created by mistake, duplicated, or superseded by a newer inspection or customer repair.";
  }, [requiresStrongerReason]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <section className="theme-surface-modal max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-6 shadow-[0_36px_120px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--cmp-border-subtle)] pb-4">
          <div>
            <p className={fieldLabelClass}>Danger zone</p>
            <h2 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Archive inspection report</h2>
          </div>
          <button type="button" className="theme-btn-ghost rounded-xl px-3 py-1 text-xs" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        <p className="mt-4 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{helperCopy}</p>

        {requiresStrongerReason ? (
          <p className="theme-alert-warning mt-3 rounded-xl border px-3 py-2 text-xs leading-5">
            This report has already been generated, sent, or locked. Archiving will preserve history but remove it from active workflows.
          </p>
        ) : null}

        <div className="mt-4 space-y-4">
          <label className="block space-y-2">
            <span className={fieldLabelClass}>Reason code</span>
            <select
              className="theme-input-control h-10 w-full rounded-xl px-3 text-sm"
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value as InspectionArchiveReasonCode)}
              disabled={busy}
            >
              {INSPECTION_ARCHIVE_REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {archiveReasonCodeLabel(code)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className={fieldLabelClass}>Required reason</span>
            <textarea
              className="theme-input-control min-h-[120px] w-full rounded-xl px-3 py-2 text-sm"
              placeholder="Describe why this report should be archived..."
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
              disabled={busy}
            />
            <p className="text-[11px] text-[color:var(--sem-text-muted)]">
              {trimmedReason.length}/{minLength} characters minimum
            </p>
          </label>
        </div>

        {error ? <p className="theme-alert-error mt-4 rounded-xl border px-3 py-2 text-sm">{error}</p> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-[color:var(--cmp-border-subtle)] pt-4">
          <button type="button" className="theme-btn-secondary rounded-xl px-4 py-2 text-sm font-medium" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-40"
            disabled={!canSubmit}
            onClick={() => onConfirm({ reasonCode, reasonText: trimmedReason })}
          >
            <Archive className="h-4 w-4" />
            {busy ? "Archiving..." : "Archive report"}
          </button>
        </div>
      </section>
    </div>
  );
}
