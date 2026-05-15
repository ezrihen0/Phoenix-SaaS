import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { OrganizationEntity } from "../database/entities/organization.entity";
import type { RecentCallEntity } from "../database/entities/recent-call.entity";
import { LiveVoicePilotService } from "./live-voice-pilot.service";
import { TelephonyExecutionService } from "./telephony-execution.service";
import { VoiceFlowService } from "./voice-flow.service";
import { encodeTelnyxAiClientStateV1 } from "./telnyx-ai-client-state";

export type LiveVoiceAttachResult = "attached" | "skipped" | "failed";

/**
 * Phase 1.5B P1 — canonical attach path: `answer` (if needed) → `ai_assistant_start` with nested assistant payload.
 */
@Injectable()
export class TelnyxLiveVoiceAttachService {
  private readonly logger = new Logger(TelnyxLiveVoiceAttachService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly telephonyExecutionService: TelephonyExecutionService,
    private readonly voiceFlowService: VoiceFlowService,
    private readonly liveVoicePilot: LiveVoicePilotService,
    @InjectRepository(OrganizationEntity)
    private readonly organizationsRepository: Repository<OrganizationEntity>,
  ) {}

  async tryAttachAiAssistant(
    recentCall: RecentCallEntity,
    matchOrganizationId: string | null,
  ): Promise<LiveVoiceAttachResult> {
    if (!this.liveVoicePilot.isLiveAiPathAllowed(recentCall, matchOrganizationId)) {
      return "skipped";
    }

    const callControlId = recentCall.provider_call_id?.trim() ?? null;
    if (!callControlId) {
      this.logger.warn(`live_voice_ai_skip missing_call_control recent_call=${recentCall.id}`);
      return "skipped";
    }

    const flow = await this.voiceFlowService.findActiveFlowForOwnedPhoneRow(recentCall.inbound_owned_phone_number_id);
    if (!flow) {
      return "skipped";
    }

    const assistantId = this.resolveTelnyxAssistantId(flow);
    if (!assistantId) {
      this.logger.error(
        `live_voice_ai_missing_assistant_id flow_id=${flow.flow_id} — set voice_flows.telnyx_assistant_id or VOICE_FLOW_AMBER_TELNYX_ASSISTANT_ID`,
      );
      return "failed";
    }

    const dynamicVariables = await this.buildDynamicVariables(flow.flow_id, recentCall, matchOrganizationId);

    const answer = await this.telephonyExecutionService.executeCallControlAction(callControlId, "answer", null);
    if (!answer.ok) {
      this.logger.warn(
        `live_voice_ai_answer_failed recent_call=${recentCall.id} detail=${answer.detail ?? "unknown"}`,
      );
      return "failed";
    }

    const startBody: Record<string, unknown> = {
      client_state: encodeTelnyxAiClientStateV1(recentCall.id),
      assistant: {
        id: assistantId,
        dynamic_variables: dynamicVariables,
      },
    };

    const start = await this.telephonyExecutionService.executeCallControlAction(
      callControlId,
      "ai_assistant_start",
      startBody,
    );

    if (!start.ok) {
      this.logger.warn(
        `live_voice_ai_start_failed recent_call=${recentCall.id} detail=${start.detail ?? "unknown"}`,
      );
      return "failed";
    }

    this.logger.log(`live_voice_ai_attached recent_call=${recentCall.id} flow_id=${flow.flow_id}`);
    return "attached";
  }

  private resolveTelnyxAssistantId(flow: { flow_id: string; telnyx_assistant_id: string | null }): string | null {
    const fromRow = flow.telnyx_assistant_id?.trim() ?? "";
    if (fromRow) {
      return fromRow;
    }
    const amber = (this.configService.get<string>("VOICE_FLOW_AMBER_TELNYX_ASSISTANT_ID") ?? "").trim();
    if (flow.flow_id === "amber_schedule_availability_intake" && amber) {
      return amber;
    }
    return null;
  }

  private async buildDynamicVariables(
    flowId: string,
    recentCall: RecentCallEntity,
    matchOrganizationId: string | null,
  ): Promise<Record<string, string>> {
    const organizationDisplayName = await this.resolveOrganizationDisplayName(matchOrganizationId);
    const bh =
      recentCall.business_hours_status === "after_hours"
        ? "After hours"
        : recentCall.business_hours_status === "open_hours"
          ? "Open hours"
          : "unknown";

    return {
      flow_id: flowId,
      organization_display_name: organizationDisplayName ?? "your organization",
      business_hours_human_summary: bh,
      bookability_policy_strict: "no_confirmed_booking_on_call",
      availability_language_script: "We can check possible availability; our team will confirm details.",
      escalation_safety_clause: "For emergencies, contact local emergency services.",
      service_areas_short: "",
    };
  }

  private async resolveOrganizationDisplayName(matchOrganizationId: string | null): Promise<string | null> {
    const id = matchOrganizationId?.trim();
    if (!id) {
      return null;
    }
    const org = await this.organizationsRepository.findOne({ where: { id } });
    return org?.name?.trim() ?? null;
  }
}
