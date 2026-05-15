"use client";

import { useCallback, useState } from "react";
import { ClipboardCopy, LoaderCircle, Send, Sparkles, Trash2 } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";

type Limitation = { code: string; message: string };

type CopilotSmsSendSurface = {
  eligible: boolean;
  reasonHint: string | null;
  recipientLabel: string | null;
  recipientPhoneLast4: string | null;
  guardedSendEnabled: boolean;
  hasMessagingSendPermission: boolean;
};

type DraftPayload = {
  draftId: string;
  recentCallId: string;
  effectiveBody: string;
  generatedBody: string;
  editedBody: string | null;
  limitations: Limitation[];
  recommendationRunId: string | null;
  generationPath: "template" | "llm";
  promptVersion: string;
  modelId: string | null;
  status: "active" | "dismissed" | "sent";
  outboundTxtMessageId: string | null;
  sendSurface: CopilotSmsSendSurface;
};

type Props = {
  recentCallId: string;
  hasMessagingSendPermission: boolean;
};

export default function CallsCopilotSmsDraft({ recentCallId, hasMessagingSendPermission }: Props) {
  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [editText, setEditText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const syncEditFromDraft = useCallback((d: DraftPayload | null) => {
    if (!d) {
      setEditText("");
      return;
    }
    setEditText(d.effectiveBody);
  }, []);

  const loadDraft = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const payload = await crmApiFetch<DraftPayload | null>(
        `/api/ai/copilot/calls/sms-draft?recentCallId=${encodeURIComponent(recentCallId)}`,
        { method: "GET" },
      );
      setDraft(payload);
      syncEditFromDraft(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load draft.");
      setDraft(null);
    } finally {
      setLoading(false);
    }
  }, [recentCallId, syncEditFromDraft]);

  const generateDraft = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const payload = await crmApiFetch<DraftPayload>(`/api/ai/copilot/calls/sms-draft/generate`, {
        method: "POST",
        body: JSON.stringify({ recentCallId }),
      });
      setDraft(payload);
      syncEditFromDraft(payload);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate draft.");
    } finally {
      setLoading(false);
    }
  }, [recentCallId, syncEditFromDraft]);

  const saveEdit = useCallback(async () => {
    if (!draft?.draftId) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const payload = await crmApiFetch<DraftPayload>(`/api/ai/copilot/calls/sms-draft/${draft.draftId}`, {
        method: "PATCH",
        body: JSON.stringify({ editedBody: editText }),
      });
      setDraft(payload);
      syncEditFromDraft(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save edits.");
    } finally {
      setLoading(false);
    }
  }, [draft?.draftId, editText, syncEditFromDraft]);

  const dismissDraft = useCallback(async () => {
    if (!draft?.draftId) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await crmApiFetch(`/api/ai/copilot/calls/sms-draft/${draft.draftId}/dismiss`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setDraft(null);
      setEditText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss draft.");
    } finally {
      setLoading(false);
    }
  }, [draft?.draftId]);

  const copyToClipboard = useCallback(async () => {
    const text = editText.trim();
    if (!text || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Clipboard not available.");
    }
  }, [editText]);

  const runConfirmedSend = useCallback(async () => {
    if (!draft?.draftId || draft.status !== "active") {
      return;
    }
    setError(null);
    setConfirmLoading(true);
    try {
      let nextDraft = draft;
      if (editText.trim() !== draft.effectiveBody.trim()) {
        nextDraft = await crmApiFetch<DraftPayload>(`/api/ai/copilot/calls/sms-draft/${draft.draftId}`, {
          method: "PATCH",
          body: JSON.stringify({ editedBody: editText }),
        });
        setDraft(nextDraft);
        syncEditFromDraft(nextDraft);
      }

      const sent = await crmApiFetch<DraftPayload>(
        `/api/ai/copilot/calls/sms-draft/${encodeURIComponent(nextDraft.draftId)}/send`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );

      setDraft(sent);
      syncEditFromDraft(sent);
      setConfirmOpen(false);

      window.dispatchEvent(
        new CustomEvent("wizfield:copilot-sms-sent", {
          detail: {
            draftId: sent.draftId,
            recentCallId: sent.recentCallId,
            outboundTxtMessageId: sent.outboundTxtMessageId ?? undefined,
          },
        }),
      );
      window.dispatchEvent(new CustomEvent("wizfield:texts-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "SMS could not be sent.");
      setConfirmOpen(false);
    } finally {
      setConfirmLoading(false);
    }
  }, [draft, editText, syncEditFromDraft]);

  const surface = draft?.sendSurface ?? null;
  const sessionAllowsSendAttempt = surface?.guardedSendEnabled && hasMessagingSendPermission;
  const canOpenSendConfirm =
    Boolean(draft?.draftId && draft.status === "active" && surface?.eligible && sessionAllowsSendAttempt);

  const sendBlockedHint = (() => {
    if (!draft?.draftId || draft.status !== "active") {
      return null;
    }
    if (!surface?.guardedSendEnabled) {
      return null;
    }
    if (!hasMessagingSendPermission) {
      return "Sending requires messaging.send permission.";
    }
    if (!surface.eligible && surface.reasonHint) {
      return surface.reasonHint;
    }
    return null;
  })();

  return (
    <div className="mt-2 rounded-xl border border-[color:rgba(125,211,252,0.2)] bg-[color:rgba(12,74,110,0.12)] px-3 py-2">
      <button
        type="button"
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          if (next) {
            void loadDraft();
          }
        }}
        className="flex w-full items-center justify-between gap-2 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:#bae6fd]"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Copilot · SMS draft
        </span>
        <span className="text-[color:var(--text-muted)]">{expanded ? "−" : "+"}</span>
      </button>

      {expanded ? (
        <div className="mt-2 space-y-2">
          {error ? (
            <p className="text-[11px] text-[color:#fecaca]" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void generateDraft()}
              disabled={loading || draft?.status === "sent"}
              className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(125,211,252,0.35)] bg-[color:rgba(12,74,110,0.35)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:#e0f2fe] disabled:opacity-50"
            >
              {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Generate
            </button>
            {draft?.draftId ? (
              <>
                <button
                  type="button"
                  onClick={() => void saveEdit()}
                  disabled={loading || draft.status === "sent"}
                  className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(52,211,153,0.35)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:#a7f3d0] disabled:opacity-50"
                >
                  Save edit
                </button>
                <button
                  type="button"
                  onClick={() => void copyToClipboard()}
                  disabled={!editText.trim()}
                  className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(251,191,36,0.35)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:#fde68a] disabled:opacity-50"
                >
                  <ClipboardCopy className="h-3 w-3" aria-hidden />
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={loading || !canOpenSendConfirm || confirmLoading}
                  className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(56,189,248,0.45)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:#7dd3fc] disabled:opacity-50"
                >
                  <Send className="h-3 w-3" aria-hidden />
                  Send SMS
                </button>
                <button
                  type="button"
                  onClick={() => void dismissDraft()}
                  disabled={loading || draft.status === "sent"}
                  className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(248,113,113,0.35)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:#fecaca] disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                  Dismiss
                </button>
              </>
            ) : null}
          </div>

          {draft?.status === "sent" ? (
            <p className="text-[10px] font-semibold text-[color:#86efac]">
              Sent — outbound TXT logged in Messaging.
              {draft.outboundTxtMessageId ? ` (${draft.outboundTxtMessageId.slice(0, 8)}…)` : null}
            </p>
          ) : null}

          {sendBlockedHint ? (
            <p className="text-[10px] text-[color:var(--text-muted)]">{sendBlockedHint}</p>
          ) : null}

          {draft?.limitations?.length ? (
            <ul className="space-y-1 text-[10px] text-[color:var(--text-secondary)]">
              {draft.limitations.map((lim) => (
                <li key={lim.code}>• {lim.message}</li>
              ))}
            </ul>
          ) : null}

          {draft?.draftId ? (
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={4}
              disabled={draft.status === "sent"}
              className="w-full resize-y rounded-lg border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(0,0,0,0.35)] px-2 py-1.5 text-[11px] text-[color:var(--text-primary)] disabled:opacity-60"
              placeholder="Draft SMS text…"
            />
          ) : (
            <p className="text-[10px] text-[color:var(--text-muted)]">
              Generate a reviewable SMS draft (no automatic send). Requires operator Copilot env flags on the server.
            </p>
          )}

          {draft?.generationPath === "llm" && draft.modelId ? (
            <p className="text-[10px] text-[color:var(--text-muted)]">Model: {draft.modelId}</p>
          ) : null}
        </div>
      ) : null}

      {confirmOpen && draft?.draftId && draft.status === "active" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(2,10,27,0.72)] px-4 py-6">
          <div
            role="dialog"
            aria-modal
            aria-labelledby="copilot-sms-send-title"
            className="w-full max-w-md rounded-xl border border-[color:rgba(125,211,252,0.28)] bg-[color:var(--flat-canvas)] p-5 shadow-xl"
          >
            <h2 id="copilot-sms-send-title" className="text-sm font-semibold text-[color:var(--text-primary)]">
              Send SMS now
            </h2>
            <p className="mt-2 text-[11px] text-[color:var(--text-secondary)]">
              You are about to send a customer-facing TXT from this workspace. This is not automatic — tap confirm only when
              the message is final.
            </p>
            <div className="mt-4 space-y-2 rounded-lg border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(0,0,0,0.2)] px-3 py-2 text-[11px]">
              <p className="text-[color:var(--text-muted)]">
                <span className="font-semibold text-[color:var(--text-primary)]">To: </span>
                {surface?.recipientLabel ?? "Customer"}
                {surface?.recipientPhoneLast4 ? ` · …${surface.recipientPhoneLast4}` : ""}
              </p>
              <p className="whitespace-pre-wrap text-[color:var(--text-primary)]">{editText.trim()}</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={confirmLoading}
                className="rounded-lg border border-[color:var(--cmp-border-subtle)] px-3 py-2 text-[11px] font-semibold text-[color:var(--text-secondary)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runConfirmedSend()}
                disabled={confirmLoading || !editText.trim()}
                className="rounded-lg bg-[color:#0369a1] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {confirmLoading ? (
                  <>
                    <LoaderCircle className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden />
                    Sending…
                  </>
                ) : (
                  "Confirm send"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
