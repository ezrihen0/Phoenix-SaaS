/** Phase 2 — Marketing Profile JSON fragments (validated on PATCH only). Stored as serialized JSON in MarketingProfileEntity. */

export type MarketingIdentityJson = {
  display_name?: string;
  tagline?: string;
  service_area_notes?: string;
};

export type MarketingBrandVoiceJson = {
  tone_keywords?: string;
  formality?: string;
  persona_notes?: string;
};

/** Default CTA and publishing-adjacent *preferences only* — not outbound publishing in Phase 2. */
export type MarketingPublishingPreferencesJson = {
  default_cta_primary?: string;
  default_cta_secondary?: string;
  link_policy_notes?: string;
};

export type MarketingSafetyPreferencesJson = {
  restricted_terms_text?: string;
  disclaimer_mode?: string;
  extra_guidelines?: string;
};

export const PROFILE_STRING_MAX = 8192;

function assertPlainObject(body: unknown, label: string): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${label}_invalid`);
  }

  return body as Record<string, unknown>;
}

function readTrimmedString(candidate: unknown, field: string, maxLen: number): string | undefined {
  if (candidate === undefined || candidate === null) {
    return undefined;
  }

  if (typeof candidate !== "string") {
    throw new Error(`${field}_invalid`);
  }

  const trimmed = candidate.trim();
  if (trimmed.length > maxLen) {
    throw new Error(`${field}_too_long`);
  }

  return trimmed.length ? trimmed : undefined;
}

export function parseMarketingIdentityJson(raw: unknown): MarketingIdentityJson {
  assertPlainObject(raw, "identity");
  return {
    display_name: readTrimmedString((raw as Record<string, unknown>).display_name, "display_name", PROFILE_STRING_MAX),
    tagline: readTrimmedString((raw as Record<string, unknown>).tagline, "tagline", PROFILE_STRING_MAX),
    service_area_notes: readTrimmedString(
      (raw as Record<string, unknown>).service_area_notes,
      "service_area_notes",
      PROFILE_STRING_MAX,
    ),
  };
}

export function parseMarketingBrandVoiceJson(raw: unknown): MarketingBrandVoiceJson {
  assertPlainObject(raw, "brand_voice");
  return {
    tone_keywords: readTrimmedString((raw as Record<string, unknown>).tone_keywords, "tone_keywords", PROFILE_STRING_MAX),
    formality: readTrimmedString((raw as Record<string, unknown>).formality, "formality", 128),
    persona_notes: readTrimmedString((raw as Record<string, unknown>).persona_notes, "persona_notes", PROFILE_STRING_MAX),
  };
}

export function parseMarketingPublishingPreferencesJson(raw: unknown): MarketingPublishingPreferencesJson {
  assertPlainObject(raw, "publishing_preferences");
  return {
    default_cta_primary: readTrimmedString(
      (raw as Record<string, unknown>).default_cta_primary,
      "default_cta_primary",
      PROFILE_STRING_MAX,
    ),
    default_cta_secondary: readTrimmedString(
      (raw as Record<string, unknown>).default_cta_secondary,
      "default_cta_secondary",
      PROFILE_STRING_MAX,
    ),
    link_policy_notes: readTrimmedString(
      (raw as Record<string, unknown>).link_policy_notes,
      "link_policy_notes",
      PROFILE_STRING_MAX,
    ),
  };
}

export function parseMarketingSafetyPreferencesJson(raw: unknown): MarketingSafetyPreferencesJson {
  assertPlainObject(raw, "safety_preferences");
  return {
    restricted_terms_text: readTrimmedString(
      (raw as Record<string, unknown>).restricted_terms_text,
      "restricted_terms_text",
      PROFILE_STRING_MAX,
    ),
    disclaimer_mode: readTrimmedString((raw as Record<string, unknown>).disclaimer_mode, "disclaimer_mode", 128),
    extra_guidelines: readTrimmedString(
      (raw as Record<string, unknown>).extra_guidelines,
      "extra_guidelines",
      PROFILE_STRING_MAX,
    ),
  };
}
