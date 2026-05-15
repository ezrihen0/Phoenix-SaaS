import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  resolveAiFoundationEnabled,
  resolveAiVoiceIntakeFoundationEnabled,
  resolveAiVoiceIntakeLivePilotEnabled,
} from "../ai/ai-environment";
import type { RecentCallEntity } from "../database/entities/recent-call.entity";

@Injectable()
export class LiveVoicePilotService {
  constructor(private readonly configService: ConfigService) {}

  private mergedEnv(name: string): string | undefined {
    const rawEnv = process.env[name];
    const rawConfig = this.configService.get<string | undefined>(name);
    if (typeof rawEnv === "string" && rawEnv.trim() !== "") {
      return rawEnv;
    }
    return rawConfig ?? rawEnv ?? undefined;
  }

  /**
   * P1 gate: all flags + allowlists. Default deny if owned-phone allowlist is empty or id not listed.
   */
  isLiveAiPathAllowed(recentCall: RecentCallEntity, matchOrganizationId: string | null): boolean {
    if (!resolveAiFoundationEnabled(this.mergedEnv("AI_FOUNDATION_ENABLED"))) {
      return false;
    }
    if (!resolveAiVoiceIntakeFoundationEnabled(this.mergedEnv("AI_VOICE_INTAKE_FOUNDATION_ENABLED"))) {
      return false;
    }
    if (!resolveAiVoiceIntakeLivePilotEnabled(this.mergedEnv("AI_VOICE_INTAKE_LIVE_PILOT_ENABLED"))) {
      return false;
    }

    const rawOrgAllow = this.mergedEnv("AI_VOICE_INTAKE_LIVE_PILOT_ORGANIZATION_IDS");
    const orgIds = this.parseCsvIds(rawOrgAllow);
    if (orgIds.length > 0) {
      const tenantId = matchOrganizationId?.trim() ?? null;
      if (!tenantId || !orgIds.includes(tenantId)) {
        return false;
      }
    }

    const ownedId = recentCall.inbound_owned_phone_number_id?.trim() ?? null;
    if (!ownedId) {
      return false;
    }

    const allowOwned = this.parseCsvIds(this.mergedEnv("AI_VOICE_INTAKE_LIVE_PILOT_OWNED_PHONE_IDS"));
    if (allowOwned.length === 0) {
      return false;
    }
    if (!allowOwned.includes(ownedId)) {
      return false;
    }

    return true;
  }

  private parseCsvIds(raw: string | undefined | null): string[] {
    if (!raw?.trim()) {
      return [];
    }
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
