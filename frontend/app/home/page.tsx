import { BoardShell } from "@/components/board/board-shell";
import { HomeAiShell } from "@/components/home/ai-operations/home-ai-shell";
import type {
  HomeAiConversationResponse,
  HomeAiProfileResponse,
  HomeAiWidgetsResponse,
} from "@/lib/ai/home-ai-types";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerSession } from "@/lib/auth/server-session";

async function fetchHomeAiPayload<T>(path: string): Promise<T | null> {
  try {
    return await serverApiFetch<T>(path);
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const session = await requireServerSession("/home");
  const displayName = session.profile?.full_name?.trim() || session.user.email;

  const [profile, conversation, widgets] = await Promise.all([
    fetchHomeAiPayload<HomeAiProfileResponse>("/api/ai/home/profile"),
    fetchHomeAiPayload<HomeAiConversationResponse>("/api/ai/home/conversation"),
    fetchHomeAiPayload<HomeAiWidgetsResponse>("/api/ai/home/summary-widgets"),
  ]);

  const homeAiUnavailable = !profile && !conversation && !widgets;
  const loadError = homeAiUnavailable
    ? "Home AI is not available for this account or environment yet. Enable AI_HOME_V1_ENABLED on the backend to use the new operations home."
    : null;

  return (
    <BoardShell gridOpacity="subtle">
      <main className="relative mx-auto max-w-[1600px] px-4 py-4 text-[color:var(--sem-text-primary)] lg:px-8 lg:py-6">
        <HomeAiShell
          displayName={displayName}
          initialProfile={profile}
          initialConversation={conversation}
          initialWidgets={widgets}
          loadError={loadError}
        />
      </main>
    </BoardShell>
  );
}
