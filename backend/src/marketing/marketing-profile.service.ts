import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { MarketingProfileEntity } from "../database/entities/marketing-profile.entity";
import {
  parseMarketingBrandVoiceJson,
  parseMarketingIdentityJson,
  parseMarketingPublishingPreferencesJson,
  parseMarketingSafetyPreferencesJson,
  type MarketingBrandVoiceJson,
  type MarketingIdentityJson,
  type MarketingPublishingPreferencesJson,
  type MarketingSafetyPreferencesJson,
} from "./marketing-profile.contracts";

export type MarketingProfileResponse = {
  exists: boolean;
  organization_id: string;
  identity: MarketingIdentityJson | null;
  brand_voice: MarketingBrandVoiceJson | null;
  publishing_preferences: MarketingPublishingPreferencesJson | null;
  safety_preferences: MarketingSafetyPreferencesJson | null;
  updated_at: string | null;
};

function decodeJsonOptional(text: string | null): unknown | null {
  if (text === null || text === undefined || !String(text).trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function shapeResponse(
  organizationId: string,
  exists: boolean,
  row?: MarketingProfileEntity | null,
): MarketingProfileResponse {
  const identityDecoded = decodeJsonOptional(row?.identity_json ?? null);
  const voiceDecoded = decodeJsonOptional(row?.brand_voice_json ?? null);
  const publishingDecoded = decodeJsonOptional(row?.publishing_preferences_json ?? null);
  const safetyDecoded = decodeJsonOptional(row?.safety_preferences_json ?? null);

  return {
    exists,
    organization_id: organizationId,
    identity:
      identityDecoded && typeof identityDecoded === "object"
        ? (identityDecoded as MarketingIdentityJson)
        : null,
    brand_voice:
      voiceDecoded && typeof voiceDecoded === "object" ? (voiceDecoded as MarketingBrandVoiceJson) : null,
    publishing_preferences:
      publishingDecoded && typeof publishingDecoded === "object"
        ? (publishingDecoded as MarketingPublishingPreferencesJson)
        : null,
    safety_preferences:
      safetyDecoded && typeof safetyDecoded === "object"
        ? (safetyDecoded as MarketingSafetyPreferencesJson)
        : null,
    updated_at: row?.updated_at ? row.updated_at.toISOString() : null,
  };
}

@Injectable()
export class MarketingProfileService {
  constructor(
    @InjectRepository(MarketingProfileEntity)
    private readonly marketingProfilesRepository: Repository<MarketingProfileEntity>,
  ) {}

  async getProfileReadOnly(organizationId: string): Promise<MarketingProfileResponse> {
    const row = await this.marketingProfilesRepository.findOne({ where: { organization_id: organizationId } });

    return shapeResponse(organizationId, Boolean(row), row);
  }

  async exists(organizationId: string): Promise<boolean> {
    const count = await this.marketingProfilesRepository.count({ where: { organization_id: organizationId } });
    return count > 0;
  }

  profileCompletenessApprox(row: MarketingProfileEntity | null): boolean {
    if (!row) {
      return false;
    }

    return Boolean(row.brand_voice_json?.trim() && row.identity_json?.trim());
  }

  async loadProfileRecord(organizationId: string): Promise<MarketingProfileEntity | null> {
    return this.marketingProfilesRepository.findOne({ where: { organization_id: organizationId } });
  }

  async patchProfile(
    organizationId: string,
    body: Record<string, unknown>,
  ): Promise<MarketingProfileResponse> {
    const acceptsFragment =
      body.identity !== undefined
      || body.brand_voice !== undefined
      || body.publishing_preferences !== undefined
      || body.safety_preferences !== undefined;

    if (!acceptsFragment) {
      apiError(400, "marketing_profile_patch_empty", "Provide at least one profile fragment key to patch.");
    }

    let row =
      (await this.marketingProfilesRepository.findOne({ where: { organization_id: organizationId } })) ??
      null;

    try {
      if (!row) {
        row = this.marketingProfilesRepository.create({
          organization_id: organizationId,
          identity_json: null,
          brand_voice_json: null,
          publishing_preferences_json: null,
          safety_preferences_json: null,
        });
      }

      if (body.identity !== undefined) {
        const parsed = parseMarketingIdentityJson(body.identity);
        row.identity_json = JSON.stringify(parsed);
      }

      if (body.brand_voice !== undefined) {
        const parsed = parseMarketingBrandVoiceJson(body.brand_voice);
        row.brand_voice_json = JSON.stringify(parsed);
      }

      if (body.publishing_preferences !== undefined) {
        const parsed = parseMarketingPublishingPreferencesJson(body.publishing_preferences);
        row.publishing_preferences_json = JSON.stringify(parsed);
      }

      if (body.safety_preferences !== undefined) {
        const parsed = parseMarketingSafetyPreferencesJson(body.safety_preferences);
        row.safety_preferences_json = JSON.stringify(parsed);
      }

      const saved = await this.marketingProfilesRepository.save(row);
      return shapeResponse(organizationId, true, saved);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "marketing_profile_patch_invalid";
      apiError(
        400,
        "marketing_profile_validation_failed",
        `Marketing profile validation failed (${msg}).`,
      );
    }
  }
}
