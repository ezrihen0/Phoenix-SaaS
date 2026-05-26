import { redirect } from "next/navigation";

import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerSession } from "@/lib/auth/server-session";

import MessagingDashboard from "../messaging-dashboard";

type MessagingConversationPageContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

type ResolvedConversationPayload = {
  publicConversationCode: string;
  lane: "customers" | "unknown";
  customerId: string | null;
  phoneKey: string | null;
};

export default async function MessagingConversationPage({ params }: MessagingConversationPageContext) {
  const session = await requireServerSession("/messaging");

  if (session.profile?.role === "technician") {
    redirect("/home");
  }

  const resolvedParams = await params;
  const shortId = (resolvedParams.conversationId ?? "").trim();

  if (!shortId) {
    redirect("/messaging");
  }

  let initialConversation: ResolvedConversationPayload | null = null;

  try {
    initialConversation = await serverApiFetch<ResolvedConversationPayload>(`/api/messaging/conversations/short-link/${encodeURIComponent(shortId)}`);
  } catch {
    redirect("/messaging");
  }

  let organizationDisplayName = "Your company";

  try {
    const settings = await serverApiFetch<{ businessName?: string | null }>("/api/settings/organization");
    organizationDisplayName = settings.businessName?.trim() || organizationDisplayName;
  } catch {
    organizationDisplayName = session.active_organization?.name?.trim() || organizationDisplayName;
  }

  return (
    <main className="min-h-screen bg-[color:var(--flat-canvas)] text-[color:var(--text-primary)]">
      <div className="mx-auto max-w-[1400px] px-6 py-12 lg:px-10">
        <MessagingDashboard
          key={initialConversation.publicConversationCode}
          initialLane={initialConversation.lane}
          initialCustomerId={initialConversation.customerId}
          initialPhoneKey={initialConversation.phoneKey}
          organizationDisplayName={organizationDisplayName}
        />
      </div>
    </main>
  );
}
