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

export type SerializedMarketingOpportunity = {
  id: string;
  organization_id: string;
  opportunity_type: string;
  dedupe_key: string;
  signal_version: number;
  status: string;
  title: string;
  summary: string | null;
  source: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string | null;
  converted_draft_id: string | null;
  dismissed_at: string | null;
  archived_at: string | null;
  last_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchMarketingOpportunities(query?: {
  limit?: number;
  offset?: number;
  status?: string;
  opportunity_type?: string;
  warmUp?: boolean;
}) {
  const params = new URLSearchParams();

  if (query?.limit !== undefined) {
    params.set("limit", `${query.limit}`);
  }

  if (query?.offset !== undefined) {
    params.set("offset", `${query.offset}`);
  }

  if (query?.status) {
    params.set("status", query.status);
  }

  if (query?.opportunity_type) {
    params.set("opportunity_type", query.opportunity_type);
  }

  if (query?.warmUp) {
    params.set("warm_up", "true");
  }

  const qs = params.toString();
  const suffix = qs ? `?${qs}` : "";

  return marketingFetch<{ opportunities: SerializedMarketingOpportunity[]; total: number }>(
    `/api/marketing/opportunities${suffix}`,
  );
}

export async function refreshMarketingOpportunities() {
  return marketingFetch<{ upserted: number }>("/api/marketing/opportunities/refresh", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function patchMarketingOpportunity(opportunityId: string, body: { action: "dismiss" | "archive" }) {
  return marketingFetch<SerializedMarketingOpportunity>(
    `/api/marketing/opportunities/${encodeURIComponent(opportunityId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export async function convertMarketingOpportunityToDraft(opportunityId: string, body?: { title?: string; notes?: string }) {
  return marketingFetch<DraftDetailPayload>(
    `/api/marketing/opportunities/${encodeURIComponent(opportunityId)}/convert-draft`,
    {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    },
  );
}

export type MarketingCampaignSummary = {
  id: string;
  organization_id: string;
  campaign_kind: string;
  title: string;
  objective_summary: string | null;
  primary_service_topic: string | null;
  geo_label: string | null;
  geo_normalized: string | null;
  channel_intent: unknown;
  window_starts_at: string;
  window_ends_at: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type MarketingCampaignItemDetail = {
  id: string;
  organization_id: string;
  campaign_id: string;
  sort_order: number;
  slot_key: string;
  label: string;
  plan_notes: string | null;
  suggested_scheduled_at: string | null;
  intended_platform_keys: unknown;
  draft_id: string | null;
  created_at: string;
  updated_at: string;
  draft: {
    id: string;
    title: string;
    workflow_state: string;
    scheduled_at: string | null;
    updated_at: string;
    publish_jobs: Array<{
      id: string;
      status: string;
      scheduled_at: string;
      publish_intent: string;
    }>;
  } | null;
};

export type MarketingCampaignDetailPayload = {
  campaign: MarketingCampaignSummary;
  items: MarketingCampaignItemDetail[];
};

export async function fetchMarketingCampaigns(query?: {
  limit?: number;
  offset?: number;
  status?: string;
  include_archived?: boolean;
}) {
  const params = new URLSearchParams();

  if (query?.limit !== undefined) {
    params.set("limit", `${query.limit}`);
  }

  if (query?.offset !== undefined) {
    params.set("offset", `${query.offset}`);
  }

  if (query?.status) {
    params.set("status", query.status);
  }

  if (query?.include_archived) {
    params.set("include_archived", "true");
  }

  const qs = params.toString();
  const suffix = qs ? `?${qs}` : "";

  return marketingFetch<{ campaigns: MarketingCampaignSummary[]; total: number }>(`/api/marketing/campaigns${suffix}`);
}

export async function fetchMarketingCampaignDetail(campaignId: string) {
  return marketingFetch<MarketingCampaignDetailPayload>(
    `/api/marketing/campaigns/${encodeURIComponent(campaignId)}`,
  );
}

export async function fetchMarketingCampaignProgress(campaignId: string) {
  return marketingFetch<Record<string, unknown>>(
    `/api/marketing/campaigns/${encodeURIComponent(campaignId)}/progress`,
  );
}

export async function createMarketingCampaign(body: Record<string, unknown>) {
  return marketingFetch<MarketingCampaignDetailPayload>("/api/marketing/campaigns", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchMarketingCampaign(campaignId: string, body: Record<string, unknown>) {
  return marketingFetch<MarketingCampaignDetailPayload>(
    `/api/marketing/campaigns/${encodeURIComponent(campaignId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export async function bulkCreateCampaignDraftsForEmptySlots(campaignId: string, body?: Record<string, unknown>) {
  return marketingFetch<{ created: number; drafts: DraftDetailPayload[] }>(
    `/api/marketing/campaigns/${encodeURIComponent(campaignId)}/items/create-drafts-for-empty-slots`,
    {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    },
  );
}

export async function createMarketingCampaignItemDraft(
  campaignId: string,
  itemId: string,
  body?: Record<string, unknown>,
) {
  return marketingFetch<DraftDetailPayload>(
    `/api/marketing/campaigns/${encodeURIComponent(campaignId)}/items/${encodeURIComponent(itemId)}/create-draft`,
    {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    },
  );
}

export async function attachMarketingCampaignItemDraft(campaignId: string, itemId: string, draftId: string) {
  return marketingFetch<MarketingCampaignItemDetail>(
    `/api/marketing/campaigns/${encodeURIComponent(campaignId)}/items/${encodeURIComponent(itemId)}/attach-draft`,
    {
      method: "POST",
      body: JSON.stringify({ draft_id: draftId }),
    },
  );
}

export async function detachMarketingCampaignItemDraft(campaignId: string, itemId: string) {
  return marketingFetch<MarketingCampaignItemDetail>(
    `/api/marketing/campaigns/${encodeURIComponent(campaignId)}/items/${encodeURIComponent(itemId)}/detach-draft`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function deleteMarketingCampaignItem(campaignId: string, itemId: string) {
  return marketingFetch<{ deleted: boolean }>(
    `/api/marketing/campaigns/${encodeURIComponent(campaignId)}/items/${encodeURIComponent(itemId)}`,
    { method: "DELETE" },
  );
}
