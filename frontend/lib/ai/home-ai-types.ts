export type HomeAiRecordLink = {
  type: "customer" | "lead" | "job" | "estimate" | "invoice" | "schedule";
  id: string;
  label: string;
};

export type HomeAiQuickPrompt = {
  id: string;
  label: string;
  message: string;
};

export type HomeAiProfileResponse = {
  profileKey: string;
  displayName: string;
  greeting: string;
  quickPrompts: HomeAiQuickPrompt[];
  providerConfigured: boolean;
};

export type HomeAiConversationMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  recordLinks: HomeAiRecordLink[];
  toolMetadata: Record<string, unknown> | null;
  runId: string | null;
};

export type HomeAiConversationResponse = {
  conversationId: string | null;
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
  messages: HomeAiConversationMessage[];
  hasOlder: boolean;
};

export type HomeAiConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type HomeAiConversationListResponse = {
  conversations: HomeAiConversationSummary[];
  nextCursor: string | null;
};

export type HomeAiMessagesPageResponse = {
  conversationId: string;
  messages: HomeAiConversationMessage[];
  hasOlder: boolean;
};

export type HomeAiPostMessageResponse = {
  conversationId: string;
  title: string;
  message: HomeAiConversationMessage;
  userMessage: HomeAiConversationMessage;
};

export type HomeAiWidgetPayload = {
  visible: boolean;
  label?: string;
  count?: number;
  totalBalanceCents?: number;
  href?: string;
};

export type HomeAiWidgetsResponse = {
  widgets: {
    today?: HomeAiWidgetPayload;
    leads?: HomeAiWidgetPayload;
    jobs?: HomeAiWidgetPayload;
    customers?: HomeAiWidgetPayload;
    money?: HomeAiWidgetPayload;
  };
};
