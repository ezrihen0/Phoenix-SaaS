"use client";

import { History, LoaderCircle, MessageSquarePlus, RotateCcw, SendHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HomeConversationHistory } from "@/components/home/ai-operations/home-conversation-history";
import { HomeQuickPrompts } from "@/components/home/ai-operations/home-quick-prompts";
import { HomeRecordLinks } from "@/components/home/ai-operations/home-record-links";
import type {
  HomeAiConversationListResponse,
  HomeAiConversationMessage,
  HomeAiConversationResponse,
  HomeAiConversationSummary,
  HomeAiMessagesPageResponse,
  HomeAiPostMessageResponse,
  HomeAiProfileResponse,
  HomeAiQuickPrompt,
} from "@/lib/ai/home-ai-types";
import { crmApiFetch } from "@/lib/crm/browser-api";

type Turn = HomeAiConversationMessage & { pending?: boolean };

function emptyConversation(): Pick<HomeAiConversationResponse, "conversationId" | "title" | "hasOlder"> {
  return {
    conversationId: null,
    title: "New conversation",
    hasOlder: false,
  };
}

export function HomeConversationPanel({
  profile,
  initialConversation,
}: {
  profile: HomeAiProfileResponse | null;
  initialConversation: HomeAiConversationResponse | null;
}) {
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversation?.conversationId ?? null,
  );
  const [title, setTitle] = useState(initialConversation?.title ?? "New conversation");
  const [messages, setMessages] = useState<Turn[]>(initialConversation?.messages ?? []);
  const [hasOlder, setHasOlder] = useState(initialConversation?.hasOlder ?? false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HomeAiConversationSummary[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    setConversationId(initialConversation?.conversationId ?? null);
    setTitle(initialConversation?.title ?? "New conversation");
    setMessages(initialConversation?.messages ?? []);
    setHasOlder(initialConversation?.hasOlder ?? false);
  }, [initialConversation]);

  useEffect(() => {
    if (!stickToBottomRef.current || !viewportRef.current) {
      return;
    }
    viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
  }, [messages, loading]);

  const quickPrompts = useMemo<HomeAiQuickPrompt[]>(() => profile?.quickPrompts ?? [], [profile]);
  const isEmpty = messages.length === 0 && !loading;

  const applyConversation = useCallback((payload: HomeAiConversationResponse) => {
    stickToBottomRef.current = true;
    setConversationId(payload.conversationId);
    setTitle(payload.title || "New conversation");
    setMessages(payload.messages ?? []);
    setHasOlder(payload.hasOlder ?? false);
    setError(null);
    setLastFailedMessage(null);
    setInput("");
  }, []);

  const loadHistory = useCallback(async (cursor?: string | null) => {
    const isMore = Boolean(cursor);
    if (isMore) {
      setHistoryLoadingMore(true);
    } else {
      setHistoryLoading(true);
    }
    setHistoryError(null);

    try {
      const query = new URLSearchParams({ limit: "20" });
      if (cursor) {
        query.set("cursor", cursor);
      }
      const payload = await crmApiFetch<HomeAiConversationListResponse>(
        `/api/ai/home/conversations?${query.toString()}`,
      );
      setHistory((current) => (cursor ? [...current, ...payload.conversations] : payload.conversations));
      setHistoryCursor(payload.nextCursor);
    } catch (requestError) {
      setHistoryError(requestError instanceof Error ? requestError.message : "History could not be loaded.");
    } finally {
      setHistoryLoading(false);
      setHistoryLoadingMore(false);
    }
  }, []);

  const openHistory = useCallback(() => {
    const nextOpen = !historyOpen;
    setHistoryOpen(nextOpen);
    if (nextOpen) {
      void loadHistory();
    }
  }, [historyOpen, loadHistory]);

  const startNewChat = useCallback(async () => {
    if (loading) {
      return;
    }

    setHistoryOpen(false);
    if (isEmpty && conversationId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await crmApiFetch<HomeAiConversationResponse>("/api/ai/home/conversations", {
        method: "POST",
      });
      applyConversation(payload);
    } catch (requestError) {
      applyConversation({
        ...emptyConversation(),
        createdAt: null,
        updatedAt: null,
        lastMessageAt: null,
        messages: [],
      });
      setError(requestError instanceof Error ? requestError.message : "A new chat could not be started.");
    } finally {
      setLoading(false);
    }
  }, [applyConversation, conversationId, isEmpty, loading]);

  const openConversation = useCallback(async (nextConversationId: string) => {
    setHistoryOpen(false);
    if (nextConversationId === conversationId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await crmApiFetch<HomeAiConversationResponse>(
        `/api/ai/home/conversations/${encodeURIComponent(nextConversationId)}`,
      );
      applyConversation(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "That conversation could not be opened.");
    } finally {
      setLoading(false);
    }
  }, [applyConversation, conversationId]);

  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || !hasOlder || loadingOlder || messages.length === 0) {
      return;
    }

    const viewport = viewportRef.current;
    const previousHeight = viewport?.scrollHeight ?? 0;
    stickToBottomRef.current = false;
    setLoadingOlder(true);
    setError(null);

    try {
      const oldestId = messages[0]?.id;
      const query = new URLSearchParams({ limit: "30", before: oldestId });
      const payload = await crmApiFetch<HomeAiMessagesPageResponse>(
        `/api/ai/home/conversations/${encodeURIComponent(conversationId)}/messages?${query.toString()}`,
      );
      setMessages((current) => {
        const existing = new Set(current.map((message) => message.id));
        return [...payload.messages.filter((message) => !existing.has(message.id)), ...current];
      });
      setHasOlder(payload.hasOlder);
      requestAnimationFrame(() => {
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight - previousHeight;
        }
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Older messages could not be loaded.");
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasOlder, loadingOlder, messages]);

  const sendMessage = useCallback(async (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message || loading) {
      return;
    }

    stickToBottomRef.current = true;
    setLoading(true);
    setError(null);
    setLastFailedMessage(null);
    setHistoryOpen(false);

    const optimisticUser: Turn = {
      id: `pending-user-${Date.now()}`,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
      recordLinks: [],
      toolMetadata: null,
      runId: null,
    };
    setMessages((current) => [...current, optimisticUser]);
    setInput("");

    try {
      const payload = await crmApiFetch<HomeAiPostMessageResponse>("/api/ai/home/conversation/messages", {
        method: "POST",
        body: JSON.stringify({
          message,
          ...(conversationId ? { conversationId } : {}),
        }),
      });

      setConversationId(payload.conversationId);
      setTitle(payload.title || "New conversation");
      setMessages((current) => {
        const withoutOptimistic = current.filter((item) => item.id !== optimisticUser.id);
        return [...withoutOptimistic, payload.userMessage, payload.message];
      });
    } catch (requestError) {
      setMessages((current) => current.filter((item) => item.id !== optimisticUser.id));
      setInput(message);
      setLastFailedMessage(message);
      setError(requestError instanceof Error ? requestError.message : "The message could not be sent.");
    } finally {
      setLoading(false);
    }
  }, [conversationId, loading]);

  return (
    <section className="theme-surface-card relative flex h-[min(58vh,480px)] min-h-[300px] max-h-[640px] flex-col self-start overflow-hidden rounded-[24px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] backdrop-blur-md sm:h-[min(62vh,560px)]">
      <div className="shrink-0 border-b border-[color:var(--cmp-border-subtle)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-accent-primary)]">
              Home AI
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-[color:var(--sem-display-headline)]">
              {profile?.greeting ?? "Operational assistant"}
            </h2>
            {title && title !== "New conversation" ? (
              <p className="mt-1 truncate text-xs text-[color:var(--sem-text-secondary)]">{title}</p>
            ) : null}
            {profile && !profile.providerConfigured ? (
              <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
                AI is enabled, but the model provider is not configured. You can still browse widgets and prompts.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void startNewChat()}
              disabled={loading}
              className="theme-btn-secondary inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              New Chat
            </button>
            <button
              type="button"
              onClick={openHistory}
              aria-expanded={historyOpen}
              className="theme-btn-secondary inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
            >
              <History className="h-3.5 w-3.5" />
              History
            </button>
          </div>
        </div>
      </div>

      <HomeConversationHistory
        open={historyOpen}
        conversations={history}
        activeId={conversationId}
        loading={historyLoading}
        loadingMore={historyLoadingMore}
        hasMore={Boolean(historyCursor)}
        error={historyError}
        onSelect={(nextId) => void openConversation(nextId)}
        onLoadMore={() => void loadHistory(historyCursor)}
        onClose={() => setHistoryOpen(false)}
      />

      <div ref={viewportRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {hasOlder ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void loadOlderMessages()}
              disabled={loadingOlder}
              className="theme-btn-secondary rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50"
            >
              {loadingOlder ? "Loading earlier messages…" : "Load earlier messages"}
            </button>
          </div>
        ) : null}

        {isEmpty ? (
          <div className="space-y-4">
            <p className="text-sm text-[color:var(--sem-text-secondary)]">
              Ask about customers, leads, jobs, schedule, estimates, or invoices you can access.
            </p>
            <HomeQuickPrompts prompts={quickPrompts} disabled={loading} onSelect={sendMessage} />
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user"
              ? "ml-8 rounded-[18px] border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-panel)] px-4 py-3"
              : "mr-8 rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-4 py-3"}
          >
            <p className="whitespace-pre-wrap text-sm leading-6 text-[color:var(--sem-text-primary)]">
              {message.content}
            </p>
            {message.role === "assistant" ? <HomeRecordLinks links={message.recordLinks} /> : null}
          </div>
        ))}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[color:var(--sem-text-secondary)]">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Gathering grounded context…
          </div>
        ) : null}
      </div>

      <div className="shrink-0 space-y-3 border-t border-[color:var(--cmp-border-subtle)] px-5 py-4">
        {error ? (
          <div className="theme-alert-error flex items-center justify-between gap-3 rounded-[16px] border px-3 py-2 text-sm">
            <span>{error}</span>
            {lastFailedMessage ? (
              <button
                type="button"
                onClick={() => sendMessage(lastFailedMessage)}
                className="theme-btn-secondary inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        <form
          className="flex items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(input);
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={2}
            placeholder="Ask about today’s schedule, leads, jobs, or invoices…"
            className="theme-input min-h-[72px] flex-1 resize-none rounded-[18px] border px-4 py-3 text-sm"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || input.trim().length === 0}
            className="theme-btn-primary inline-flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-50"
            aria-label="Send message"
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </form>
      </div>
    </section>
  );
}
