"use client";

import { LoaderCircle, RotateCcw, SendHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { HomeQuickPrompts } from "@/components/home/ai-operations/home-quick-prompts";
import { HomeRecordLinks } from "@/components/home/ai-operations/home-record-links";
import type {
  HomeAiConversationMessage,
  HomeAiConversationResponse,
  HomeAiPostMessageResponse,
  HomeAiProfileResponse,
  HomeAiQuickPrompt,
} from "@/lib/ai/home-ai-types";
import { crmApiFetch } from "@/lib/crm/browser-api";

type Turn = HomeAiConversationMessage & { pending?: boolean };

export function HomeConversationPanel({
  profile,
  initialConversation,
}: {
  profile: HomeAiProfileResponse | null;
  initialConversation: HomeAiConversationResponse | null;
}) {
  const [messages, setMessages] = useState<Turn[]>(initialConversation?.messages ?? []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);

  useEffect(() => {
    setMessages(initialConversation?.messages ?? []);
  }, [initialConversation]);

  const quickPrompts = useMemo<HomeAiQuickPrompt[]>(() => profile?.quickPrompts ?? [], [profile]);

  const sendMessage = useCallback(async (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setLastFailedMessage(null);

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
        body: JSON.stringify({ message }),
      });

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
  }, [loading]);

  return (
    <section className="theme-surface-card flex min-h-[420px] flex-col rounded-[24px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] backdrop-blur-md">
      <div className="border-b border-[color:var(--cmp-border-subtle)] px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-accent-primary)]">
          Home AI
        </p>
        <h2 className="mt-1 text-xl font-semibold text-[color:var(--sem-display-headline)]">
          {profile?.greeting ?? "Operational assistant"}
        </h2>
        {profile && !profile.providerConfigured ? (
          <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
            AI is enabled, but the model provider is not configured. You can still browse widgets and prompts.
          </p>
        ) : null}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="text-sm text-[color:var(--sem-text-secondary)]">
            Ask about customers, leads, jobs, schedule, estimates, or invoices you can access.
          </p>
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

      <div className="space-y-3 border-t border-[color:var(--cmp-border-subtle)] px-5 py-4">
        <HomeQuickPrompts prompts={quickPrompts} disabled={loading} onSelect={sendMessage} />

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
            rows={3}
            placeholder="Ask about today’s schedule, leads, jobs, or invoices…"
            className="theme-input min-h-[88px] flex-1 resize-y rounded-[18px] border px-4 py-3 text-sm"
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
