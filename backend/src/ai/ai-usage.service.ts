import { Injectable } from "@nestjs/common";

import { InjectRepository } from "@nestjs/typeorm";

import { Repository } from "typeorm";



import { apiError } from "../common/api-response";

import type { RequestWithActor } from "../common/request-types";

import type { ProfileRole } from "../crm/constants";

import { AiRecommendationRunEntity } from "../database/entities/ai-recommendation-run.entity";

import {

  AI_AGENT_KEY_GENERAL_AI_CHAT,

  AI_LEGACY_FEATURE_KEY_TO_ACTION_KEY,

} from "./ai.constants";

import {

  AI_CHAT_FEEDBACK_NOT_USEFUL,

  AI_CHAT_FEEDBACK_USEFUL,

} from "./ai-chat.types";



export type AiUsageChatRecentRun = {

  runId: string;

  createdAt: string;

  status: string;

  detectedMode: string | null;

  latencyMs: number | null;

  estimatedCostUsd: number | null;

  feedback: typeof AI_CHAT_FEEDBACK_USEFUL | typeof AI_CHAT_FEEDBACK_NOT_USEFUL | null;

};



export type AiUsageGeneralAiChatSummary = {

  chatRunsThisMonth: number;

  topDetectedMode: string | null;

  estimatedCostUsd: number;

  successCount: number;

  failedCount: number;

  feedbackUsefulCount: number;

  feedbackNotUsefulCount: number;

  recentRuns: AiUsageChatRecentRun[];

};



export type AiUsageSummaryResponse = {

  periodStart: string;

  periodEnd: string;

  totalRuns: number;

  topActionKey: string | null;

  topActionRuns: number;

  estimatedCostUsd: number;

  successCount: number;

  failedCount: number;

  businessOutcomesTracked: number;

  generalAiChat: AiUsageGeneralAiChatSummary;

};



const USAGE_ALLOWED_ROLES = new Set<ProfileRole>(["owner", "admin"]);



function parseTraceJson(raw: string | null): Record<string, unknown> | null {

  if (!raw?.trim()) {

    return null;

  }

  try {

    const parsed = JSON.parse(raw) as unknown;

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)

      ? (parsed as Record<string, unknown>)

      : null;

  } catch {

    return null;

  }

}



function readDetectedMode(trace: Record<string, unknown> | null): string | null {

  const value = trace?.detected_mode;

  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;

}



function parseCostUsd(raw: string | null | undefined): number {

  if (raw == null || raw === "") {

    return 0;

  }

  const parsed = Number.parseFloat(raw);

  return Number.isFinite(parsed) ? parsed : 0;

}



@Injectable()

export class AiUsageService {

  constructor(

    @InjectRepository(AiRecommendationRunEntity)

    private readonly runsRepo: Repository<AiRecommendationRunEntity>,

  ) {}



  private enforceUsageAccess(request: RequestWithActor) {

    const role = (request.actor?.role ?? request.actor?.profile?.role ?? null) as ProfileRole | null;

    if (!role || !USAGE_ALLOWED_ROLES.has(role)) {

      apiError(

        403,

        "ai_usage_forbidden",

        "AI usage is available to organization owners and admins only.",

      );

    }

  }



  async getUsageSummary(request: RequestWithActor): Promise<AiUsageSummaryResponse> {

    this.enforceUsageAccess(request);



    const organizationId = request.actor?.organization_id?.trim();

    if (!organizationId) {

      apiError(400, "organization_context_missing", "An active organization is required for this action.");

    }



    const now = new Date();

    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const periodEnd = now;



    const legacyFeatureKeys = Object.keys(AI_LEGACY_FEATURE_KEY_TO_ACTION_KEY);

    const rows = await this.runsRepo

      .createQueryBuilder("run")

      .select([

        "run.id AS id",

        "run.action_key AS action_key",

        "run.feature_key AS feature_key",

        "run.status AS status",

        "run.estimated_cost_usd AS estimated_cost_usd",

        "run.tool_trace_json AS tool_trace_json",

        "run.outcome_key AS outcome_key",

        "run.latency_ms AS latency_ms",

        "run.created_at AS created_at",

      ])

      .where("run.organization_id = :organizationId", { organizationId })

      .andWhere("run.created_at >= :periodStart", { periodStart })

      .andWhere("run.created_at <= :periodEnd", { periodEnd })

      .andWhere(

        "(run.action_key IS NOT NULL OR run.feature_key IN (:...legacyFeatureKeys))",

        { legacyFeatureKeys },

      )

      .orderBy("run.created_at", "DESC")

      .getRawMany<{

        id: string;

        action_key: string | null;

        feature_key: string;

        status: string;

        estimated_cost_usd: string | null;

        tool_trace_json: string | null;

        outcome_key: string | null;

        latency_ms: number | null;

        created_at: Date;

      }>();



    let totalRuns = 0;

    let successCount = 0;

    let failedCount = 0;

    let estimatedCostUsd = 0;

    let businessOutcomesTracked = 0;

    const actionCounts = new Map<string, number>();



    let chatRunsThisMonth = 0;

    let chatSuccessCount = 0;

    let chatFailedCount = 0;

    let chatEstimatedCostUsd = 0;

    let chatFeedbackUsefulCount = 0;

    let chatFeedbackNotUsefulCount = 0;

    const chatModeCounts = new Map<string, number>();

    const chatRecentRuns: AiUsageChatRecentRun[] = [];



    for (const row of rows) {

      const resolvedActionKey = row.action_key

        ?? AI_LEGACY_FEATURE_KEY_TO_ACTION_KEY[row.feature_key]

        ?? null;



      if (!resolvedActionKey) {

        continue;

      }



      totalRuns += 1;

      actionCounts.set(resolvedActionKey, (actionCounts.get(resolvedActionKey) ?? 0) + 1);



      const cost = parseCostUsd(row.estimated_cost_usd);

      estimatedCostUsd += cost;



      if (row.status === "completed") {

        successCount += 1;

      } else if (row.status === "failed") {

        failedCount += 1;

      }



      if (row.outcome_key === AI_CHAT_FEEDBACK_USEFUL || row.outcome_key === AI_CHAT_FEEDBACK_NOT_USEFUL) {

        businessOutcomesTracked += 1;

      }



      if (resolvedActionKey !== AI_AGENT_KEY_GENERAL_AI_CHAT) {

        continue;

      }



      chatRunsThisMonth += 1;

      chatEstimatedCostUsd += cost;



      if (row.status === "completed") {

        chatSuccessCount += 1;

      } else if (row.status === "failed") {

        chatFailedCount += 1;

      }



      if (row.outcome_key === AI_CHAT_FEEDBACK_USEFUL) {

        chatFeedbackUsefulCount += 1;

      } else if (row.outcome_key === AI_CHAT_FEEDBACK_NOT_USEFUL) {

        chatFeedbackNotUsefulCount += 1;

      }



      const trace = parseTraceJson(row.tool_trace_json);

      const detectedMode = readDetectedMode(trace);

      if (detectedMode) {

        chatModeCounts.set(detectedMode, (chatModeCounts.get(detectedMode) ?? 0) + 1);

      }



      if (chatRecentRuns.length < 5) {

        const feedback =

          row.outcome_key === AI_CHAT_FEEDBACK_USEFUL

            ? AI_CHAT_FEEDBACK_USEFUL

            : row.outcome_key === AI_CHAT_FEEDBACK_NOT_USEFUL

              ? AI_CHAT_FEEDBACK_NOT_USEFUL

              : null;



        chatRecentRuns.push({

          runId: row.id,

          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),

          status: row.status,

          detectedMode,

          latencyMs: row.latency_ms ?? null,

          estimatedCostUsd: cost > 0 ? Number(cost.toFixed(6)) : null,

          feedback,

        });

      }

    }



    let topActionKey: string | null = null;

    let topActionRuns = 0;

    for (const [key, count] of actionCounts.entries()) {

      if (count > topActionRuns) {

        topActionKey = key;

        topActionRuns = count;

      }

    }



    let topDetectedMode: string | null = null;

    let topModeRuns = 0;

    for (const [mode, count] of chatModeCounts.entries()) {

      if (count > topModeRuns) {

        topDetectedMode = mode;

        topModeRuns = count;

      }

    }



    return {

      periodStart: periodStart.toISOString(),

      periodEnd: periodEnd.toISOString(),

      totalRuns,

      topActionKey,

      topActionRuns,

      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),

      successCount,

      failedCount,

      businessOutcomesTracked,

      generalAiChat: {

        chatRunsThisMonth,

        topDetectedMode,

        estimatedCostUsd: Number(chatEstimatedCostUsd.toFixed(6)),

        successCount: chatSuccessCount,

        failedCount: chatFailedCount,

        feedbackUsefulCount: chatFeedbackUsefulCount,

        feedbackNotUsefulCount: chatFeedbackNotUsefulCount,

        recentRuns: chatRecentRuns,

      },

    };

  }

}


