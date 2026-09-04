"use client";

import { LoaderCircle } from "lucide-react";

import type { HomeAiConversationSummary } from "@/lib/ai/home-ai-types";

function formatActivity(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function HomeConversationHistory({
  open,
  conversations,
  activeId,
  loading,
  loadingMore,
  hasMore,
  error,
  onSelect,
  onLoadMore,
  onClose,
}: {
  open: boolean;
  conversations: HomeAiConversationSummary[];
  activeId: string | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onSelect: (conversationId: string) => void;
  onLoadMore: () => void;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close history"
        className="fixed inset-0 z-20 bg-transparent"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Conversation history"
        className="absolute right-4 top-16 z-30 w-[min(calc(100%-2rem),20rem)] overflow-hidden rounded-[20px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-md"
      >
        <div className="max-h-[min(50vh,22rem)] overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-[color:var(--sem-text-secondary)]">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading conversations…
            </div>
          ) : null}

          {!loading && error ? (
            <p className="px-3 py-4 text-sm text-[color:var(--sem-text-secondary)]">{error}</p>
          ) : null}

          {!loading && !error && conversations.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[color:var(--sem-text-secondary)]">
              No previous conversations yet.
            </p>
          ) : null}

          {!loading && !error
            ? conversations.map((conversation) => {
                const isActive = conversation.id === activeId;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={`flex w-full flex-col items-start rounded-[14px] px-3 py-2 text-left transition ${
                      isActive
                        ? "bg-[color:var(--cmp-surface-panel)]"
                        : "hover:bg-[color:var(--cmp-surface-soft)]"
                    }`}
                  >
                    <span className="truncate text-sm font-semibold text-[color:var(--sem-display-headline)]">
                      {conversation.title}
                    </span>
                    <span className="mt-0.5 text-xs text-[color:var(--sem-text-muted)]">
                      {formatActivity(conversation.lastMessageAt)}
                    </span>
                  </button>
                );
              })
            : null}

          {hasMore ? (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="theme-btn-secondary mt-1 w-full rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
