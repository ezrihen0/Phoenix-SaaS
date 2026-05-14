type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

async function marketingFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "The Growth Center request could not be completed.");
  }

  return payload?.data as T;
}

export type MarketingProfilePayload = {
  exists: boolean;
  organization_id: string;
  identity: {
    display_name?: string;
    tagline?: string;
    service_area_notes?: string;
  } | null;
  brand_voice: {
    tone_keywords?: string;
    formality?: string;
    persona_notes?: string;
  } | null;
  publishing_preferences: {
    default_cta_primary?: string;
    default_cta_secondary?: string;
    link_policy_notes?: string;
  } | null;
  safety_preferences: {
    restricted_terms_text?: string;
    disclaimer_mode?: string;
    extra_guidelines?: string;
  } | null;
  updated_at: string | null;
};

export async function fetchMarketingProfile() {
  return marketingFetch<MarketingProfilePayload>("/api/marketing/profile");
}

export async function patchMarketingProfile(body: Record<string, unknown>) {
  return marketingFetch<MarketingProfilePayload>("/api/marketing/profile", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export type SerializedDraft = {
  id: string;
  organization_id: string;
  title: string;
  intent: string | null;
  notes: string | null;
  workflow_state: string;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_user_id: string;
  updated_by_user_id: string;
};

export type VariantBody = {
  headline: string;
  primary_text: string;
  cta: string;
  hashtags: string;
  alt_text: string;
};

export type MarketingVariantPayload = {
  id: string;
  draft_id: string;
  organization_id: string;
  platform_key: string;
  body: VariantBody;
  created_at: string;
  updated_at: string;
};

export type DraftDetailPayload = {
  draft: SerializedDraft;
  variants: MarketingVariantPayload[];
};

export async function fetchMarketingDrafts(query?: {
  limit?: number;
  offset?: number;
  workflow_state?: string;
}) {
  const params = new URLSearchParams();

  if (query?.limit !== undefined) {
    params.set("limit", `${query.limit}`);
  }

  if (query?.offset !== undefined) {
    params.set("offset", `${query.offset}`);
  }

  if (query?.workflow_state) {
    params.set("workflow_state", query.workflow_state);
  }

  const qs = params.toString();
  const suffix = qs ? `?${qs}` : "";

  return marketingFetch<{
    drafts: SerializedDraft[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/marketing/drafts${suffix}`);
}

export async function fetchMarketingDraft(draftId: string) {
  return marketingFetch<DraftDetailPayload>(`/api/marketing/drafts/${encodeURIComponent(draftId)}`);
}

export async function createMarketingDraft(payload: { title?: string; intent?: string | null; notes?: string | null }) {
  return marketingFetch<DraftDetailPayload>("/api/marketing/drafts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchMarketingDraft(
  draftId: string,
  body: Partial<Pick<SerializedDraft, "title" | "intent" | "notes" | "scheduled_at">>,
) {
  return marketingFetch<DraftDetailPayload>(`/api/marketing/drafts/${encodeURIComponent(draftId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function patchMarketingVariant(draftId: string, variantId: string, body: VariantBody) {
  return marketingFetch<DraftDetailPayload>(
    `/api/marketing/drafts/${encodeURIComponent(draftId)}/variants/${encodeURIComponent(variantId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ body }),
    },
  );
}

export async function transitionMarketingDraft(draftId: string, action: "submit_for_review" | "approve" | "request_changes") {
  return marketingFetch<DraftDetailPayload>(`/api/marketing/drafts/${encodeURIComponent(draftId)}/transition`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export type MarketingCalendarPayload = {
  range: { start: string; end: string };
  days: Array<{ date: string; drafts: SerializedDraft[] }>;
};

export async function fetchMarketingCalendar(range?: { from?: string; to?: string }) {
  const params = new URLSearchParams();

  if (range?.from) {
    params.set("from", range.from);
  }

  if (range?.to) {
    params.set("to", range.to);
  }

  const qs = params.toString();
  const suffix = qs ? `?${qs}` : "";

  return marketingFetch<MarketingCalendarPayload>(`/api/marketing/calendar${suffix}`);
}

export type MarketingChannelsApiPayload = {
  channels: Array<{
    channel_key: string;
    channel_row_id?: string | null;
    connection_status?: string;
    account_label?: string | null;
    authorization_health?: string | null;
    selected_google_location_resource?: string | null;
    selected_facebook_page_id?: string | null;
    pending_selection?: boolean;
    oauth_authorizing?: boolean;
    pending_google_locations?: Array<{ resourceName: string; title: string }> | null;
    pending_meta_pages?: Array<{ id: string; name: string }> | null;
    deferred?: boolean;
    headline?: string;
  }>;
};

export async function fetchMarketingChannels() {
  return marketingFetch<MarketingChannelsApiPayload>("/api/marketing/channels");
}

export async function startMarketingGoogleOAuth() {
  return marketingFetch<{ url: string }>("/api/marketing/channels/google/start-oauth", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function startMarketingMetaOAuth() {
  return marketingFetch<{ url: string }>("/api/marketing/channels/meta/start-oauth", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function selectMarketingGoogleLocation(locationResource: string) {
  return marketingFetch<{ ok: boolean }>("/api/marketing/channels/google/select-location", {
    method: "POST",
    body: JSON.stringify({ location_resource: locationResource }),
  });
}

export async function selectMarketingMetaPage(pageId: string) {
  return marketingFetch<{ ok: boolean }>("/api/marketing/channels/meta/select-page", {
    method: "POST",
    body: JSON.stringify({ page_id: pageId }),
  });
}

export async function disconnectMarketingChannel(channelRowId: string) {
  return marketingFetch<{ ok: boolean }>(`/api/marketing/channels/${encodeURIComponent(channelRowId)}/disconnect`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function reconnectMarketingChannel(channelRowId: string) {
  return marketingFetch<{ url: string }>(`/api/marketing/channels/${encodeURIComponent(channelRowId)}/reconnect`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export type MarketingPublishJobPayload = {
  job: {
    id: string;
    draft_id: string;
    status: string;
    scheduled_at: string;
    publish_intent: string;
  };
};

export async function publishMarketingDraftNow(draftId: string) {
  return marketingFetch<MarketingPublishJobPayload>(`/api/marketing/drafts/${encodeURIComponent(draftId)}/publish-now`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function publishMarketingDraftSchedule(draftId: string, scheduledAtIso: string) {
  return marketingFetch<MarketingPublishJobPayload>(
    `/api/marketing/drafts/${encodeURIComponent(draftId)}/publish-schedule`,
    {
      method: "POST",
      body: JSON.stringify({ scheduled_at: scheduledAtIso }),
    },
  );
}
