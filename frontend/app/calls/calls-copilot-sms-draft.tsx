"use client";

import { useCallback, useState } from "react";
import { ClipboardCopy, LoaderCircle, Sparkles, Trash2 } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";

type Limitation = { code: string; message: string };

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
};

type Props = {
  recentCallId: string;
};

export default function CallsCopilotSmsDraft({ recentCallId }: Props) {
  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [editText, setEditText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

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
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(125,211,252,0.35)] bg-[color:rgba(12,74,110,0.35)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:#e0f2fe] disabled:opacity-50"
            >
              {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              Generate
            </button>
            {draft?.draftId ? (
              <>
                <button
                  type="button"
                  onClick={() => void saveEdit()}
                  disabled={loading}
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
                  onClick={() => void dismissDraft()}
                  disabled={loading}
                  className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(248,113,113,0.35)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:#fecaca]"
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                  Dismiss
                </button>
              </>
            ) : null}
          </div>

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
              className="w-full resize-y rounded-lg border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(0,0,0,0.35)] px-2 py-1.5 text-[11px] text-[color:var(--text-primary)]"
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
    </div>
  );
}
