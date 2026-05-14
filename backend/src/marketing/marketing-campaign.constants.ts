import { MARKETING_PLATFORM_KEYS, type MarketingPlatformKey } from "./marketing.constants";

export const MARKETING_CAMPAIGN_KINDS = [
  "seasonal_campaign",
  "service_push_campaign",
  "trust_credibility_campaign",
  "local_authority_campaign",
] as const;

export type MarketingCampaignKindKey = (typeof MARKETING_CAMPAIGN_KINDS)[number];

export const MARKETING_CAMPAIGN_STATUSES = [
  "draft_planning",
  "active",
  "completed",
  "archived",
  "cancelled",
] as const;

export type MarketingCampaignStatusKey = (typeof MARKETING_CAMPAIGN_STATUSES)[number];

export function isMarketingCampaignKind(raw: string): raw is MarketingCampaignKindKey {
  return (MARKETING_CAMPAIGN_KINDS as readonly string[]).includes(raw);
}

export function isMarketingCampaignStatus(raw: string): raw is MarketingCampaignStatusKey {
  return (MARKETING_CAMPAIGN_STATUSES as readonly string[]).includes(raw);
}

export function normalizeChannelIntentKeys(raw: unknown): MarketingPlatformKey[] {
  if (!Array.isArray(raw)) {
    return [...MARKETING_PLATFORM_KEYS];
  }

  const out: MarketingPlatformKey[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }

    const key = entry.trim() as MarketingPlatformKey;
    if ((MARKETING_PLATFORM_KEYS as readonly string[]).includes(key)) {
      out.push(key);
    }
  }

  const uniq = [...new Set(out)];
  return uniq.length ? uniq : [...MARKETING_PLATFORM_KEYS];
}
