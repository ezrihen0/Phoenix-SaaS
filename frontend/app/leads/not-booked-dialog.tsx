"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  DISPOSITION_REASONS,
  getDispositionReasonLabel,
  type LeadDispositionReason,
  type LeadQueueItem,
} from "@/lib/crm/leads-inbox-utils";

type NotBookedDialogProps = {
  lead: LeadQueueItem | null;
  onClose: () => void;
  onSaved: (lead: LeadQueueItem) => void;
  onError: (message: string) => void;
};

export function NotBookedDialog({ lead, onClose, onSaved, onError }: NotBookedDialogProps) {
  const [reason, setReason] = useState<LeadDispositionReason>("price");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!lead) {
    return null;
  }

  const leadId = lead.id;

  function handleSave() {
    if (reason === "other" && !note.trim()) {
      onError("Add a short note when the reason is Other.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const updatedLead = await crmApiFetch<LeadQueueItem>(`/api/leads/${leadId}/disposition`, {
            method: "PATCH",
            body: JSON.stringify({
              disposition: "not_booked",
              dispositionReason: reason,
              dispositionNote: note.trim() || null,
            }),
          });
          onSaved(updatedLead);
          onClose();
        } catch (error) {
          onError(error instanceof Error ? error.message : "The lead could not be marked not booked.");
        }
      })();
    });
  }

  return (
    <div
      className="theme-backdrop-scrim fixed inset-0 z-[90] flex items-center justify-center p-4"
      onClick={() => {
        if (!isPending) {
          onClose();
        }
      }}
    >
      <div
        className="theme-surface-modal w-full max-w-md rounded-[28px] border p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-[color:var(--text-primary)]">Not Booked</h2>
        <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
          Record why {lead.full_name} did not become a job.
        </p>

        <div className="mt-5 space-y-2">
          {DISPOSITION_REASONS.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-[color:var(--cmp-border-subtle)] px-3 py-2.5 text-sm"
            >
              <input
                type="radio"
                name="disposition-reason"
                value={option}
                checked={reason === option}
                onChange={() => setReason(option)}
              />
              <span>{getDispositionReasonLabel(option)}</span>
            </label>
          ))}
        </div>

        {reason === "other" ? (
          <textarea
            className="theme-input-control mt-4 min-h-[88px] w-full rounded-xl px-3 py-2 text-sm"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Brief note"
          />
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" disabled={isPending} onClick={onClose} className="theme-btn-secondary rounded-full px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={handleSave}
            className="theme-btn-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
