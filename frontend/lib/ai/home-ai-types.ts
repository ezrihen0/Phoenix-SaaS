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
  conversationId: string;
  messages: HomeAiConversationMessage[];
};

export type HomeAiPostMessageResponse = {
  conversationId: string;
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
    money?: HomeAiWidgetPayload;
  };
};
