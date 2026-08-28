"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { HomeConversationPanel } from "@/components/home/ai-operations/home-conversation-panel";
import { HomeWidgetGrid } from "@/components/home/ai-operations/home-widget-grid";
import type {
  HomeAiConversationResponse,
  HomeAiProfileResponse,
  HomeAiWidgetsResponse,
} from "@/lib/ai/home-ai-types";
import { crmApiFetch } from "@/lib/crm/browser-api";

export function HomeAiShell({
  displayName,
  initialProfile,
  initialConversation,
  initialWidgets,
  loadError,
}: {
  displayName: string;
  initialProfile: HomeAiProfileResponse | null;
  initialConversation: HomeAiConversationResponse | null;
  initialWidgets: HomeAiWidgetsResponse | null;
  loadError: string | null;
}) {
  const [profile] = useState(initialProfile);
  const [widgets, setWidgets] = useState(initialWidgets);
  const [widgetsError, setWidgetsError] = useState<string | null>(null);

  useEffect(() => {
    if (initialWidgets) {
      return;
    }

    crmApiFetch<HomeAiWidgetsResponse>("/api/ai/home/summary-widgets")
      .then((payload) => setWidgets(payload))
      .catch((error) => {
        setWidgetsError(error instanceof Error ? error.message : "Widgets could not be loaded.");
      });
  }, [initialWidgets]);

  return (
    <div className="space-y-6">
      <header className="theme-surface-card rounded-[24px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] px-5 py-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-card)] text-[color:var(--sem-accent-primary)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[color:var(--sem-accent-primary)]">
                Operations Home
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">
                Welcome back, {displayName}
              </h1>
              <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">
                {profile?.displayName ?? "Team member"} · AI-first read-only workspace
              </p>
            </div>
          </div>
        </div>
      </header>

      {loadError ? (
        <section className="theme-alert-error rounded-[20px] border px-5 py-4 text-sm">{loadError}</section>
      ) : null}

      {widgetsError ? (
        <section className="theme-alert-error rounded-[20px] border px-5 py-4 text-sm">{widgetsError}</section>
      ) : null}

      <HomeWidgetGrid widgets={widgets?.widgets ?? null} />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <HomeConversationPanel profile={profile} initialConversation={initialConversation} />
        <aside className="theme-surface-card rounded-[24px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 backdrop-blur-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">
            How this works
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            <li>Home AI only reads CRM data you already have permission to view.</li>
            <li>Quick prompts adapt to your role — they never grant extra access.</li>
            <li>Record links open known in-app routes for jobs, customers, leads, estimates, and invoices.</li>
            <li>No bookings, sends, assignments, or payments happen from this surface.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
