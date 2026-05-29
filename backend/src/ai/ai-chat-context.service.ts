import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import { CrmOfficeDashboardService, type OfficeDashboardSnapshotPayload } from "../crm/crm-office-dashboard.service";
import { OrganizationEntity } from "../database/entities/organization.entity";
import type { LeadEntity } from "../database/entities/lead.entity";
import { RecentCallEntity } from "../database/entities/recent-call.entity";
import {
  TELEPHONY_ORG_QUERY_PARAM,
  recentCallBelongsToOrgSqlNamed,
} from "../telephony/telephony-org-scope";
import { AI_MAX_SERIALIZED_TOOL_OUTPUT_BYTES } from "./ai.constants";
import { AiContextBuilderService } from "./ai-context-builder.service";
import {
  buildActorCapabilitySummary,
  isoDateOrNull,
  sanitizeCallerDisplayLabel,
  sanitizePersonDisplayLabel,
  takeMax,
  truncateLabel,
} from "./ai-chat-context.sanitize";
import {
  AI_CHAT_CONTEXT_MAX_PER_CATEGORY,
  AI_CHAT_CONTEXT_SCHEMA_VERSION,
  type AiChatSmartContextV1,
} from "./ai-chat-context.types";

export { GENERAL_CHAT_PRIVACY_SYSTEM_APPENDIX } from "./ai-chat-context.privacy";

type DashboardControlItem = OfficeDashboardSnapshotPayload["controls"]["unpaidInvoices"][number];

function sanitizeControlItem(item: DashboardControlItem) {
  return {
    id: item.id,
    amount_cents: item.amountCents,
    status_label: truncateLabel(item.statusLabel, 48),
    customer_label: sanitizePersonDisplayLabel(item.customerName, "Customer"),
    issued_or_scheduled_at: isoDateOrNull(item.occurredAt ?? item.scheduledFor),
    city_label: truncateLabel(item.addressLabel.split(",")[0], 48) || null,
  };
}

function mapUnpaidInvoices(snapshot: OfficeDashboardSnapshotPayload): AiChatSmartContextV1["unpaid_invoices"] {
  return takeMax(
    snapshot.controls.unpaidInvoices.map((item) => {
      const base = sanitizeControlItem(item);
      return {
        id: base.id,
        amount_cents: base.amount_cents,
        status_label: base.status_label,
        customer_label: base.customer_label,
        issued_at: base.issued_or_scheduled_at,
      };
    }),
  );
}

function mapStaleEstimates(snapshot: OfficeDashboardSnapshotPayload): AiChatSmartContextV1["stale_estimates"] {
  const sorted = [...snapshot.controls.quotesWaitingApproval].sort((left, right) => {
    const leftTime = (left.occurredAt ?? new Date(0)).getTime();
    const rightTime = (right.occurredAt ?? new Date(0)).getTime();
    return leftTime - rightTime;
  });

  return takeMax(
    sorted.map((item) => {
      const base = sanitizeControlItem(item);
      return {
        id: base.id,
        job_id: item.jobId,
        amount_cents: base.amount_cents,
        status_label: base.status_label,
        customer_label: base.customer_label,
        waiting_since: base.issued_or_scheduled_at,
      };
    }),
  );
}

function mapTodaysJobs(snapshot: OfficeDashboardSnapshotPayload): AiChatSmartContextV1["todays_jobs"] {
  return takeMax(
    snapshot.controls.todaysScheduledJobs.map((item) => {
      const base = sanitizeControlItem(item);
      return {
        id: base.id,
        title: truncateLabel(item.title, 80) || "Job",
        status_label: base.status_label,
        customer_label: base.customer_label,
        scheduled_for: isoDateOrNull(item.scheduledFor),
        city_label: base.city_label,
      };
    }),
  );
}

function mapRecentLeads(leads: LeadEntity[]): AiChatSmartContextV1["recent_leads"] {
  const sorted = [...leads].sort((left, right) => right.created_at.getTime() - left.created_at.getTime());

  return takeMax(
    sorted.map((lead) => ({
      id: lead.id,
      status: lead.status,
      source: lead.source,
      customer_label: sanitizePersonDisplayLabel(lead.full_name, "Lead"),
      city_label: (lead.service_city ?? "").trim() || null,
      created_at: isoDateOrNull(lead.created_at) ?? new Date(0).toISOString(),
    })),
  );
}

function mapCallRow(record: RecentCallEntity): AiChatSmartContextV1["recent_and_missed_calls"][number] {
  const status = record.call_status?.trim() || "unknown";
  return {
    id: record.id,
    call_status: truncateLabel(status, 32),
    is_missed: status === "missed" || status === "voicemail",
    customer_label: sanitizeCallerDisplayLabel(record.matched_client_display_name, record.matched_client_id),
    source: truncateLabel(record.source, 32) || "unknown",
    started_at: isoDateOrNull(record.call_started_at ?? record.created_at),
    duration_seconds: record.duration_seconds ?? null,
  };
}

@Injectable()
export class AiChatContextService {
  private readonly logger = new Logger(AiChatContextService.name);

  constructor(
    private readonly crmOfficeDashboard: CrmOfficeDashboardService,
    private readonly contextBuilder: AiContextBuilderService,
    @InjectRepository(OrganizationEntity)
    private readonly organizationsRepository: Repository<OrganizationEntity>,
    @InjectRepository(RecentCallEntity)
    private readonly recentCallsRepository: Repository<RecentCallEntity>,
  ) {}

  /**
   * Builds org-scoped Smart V1 context from `organizationId` (must match `actor.organization_id`).
   * Never reads organization id from request body, query, or route params.
   */
  async buildSmartContextV1(organizationId: string, actor: ActorContext): Promise<AiChatSmartContextV1> {
    const activeOrgId = organizationId.trim();
    const actorOrgId = actor.organization_id?.trim() ?? "";

    if (!activeOrgId || actorOrgId !== activeOrgId) {
      apiError(400, "organization_context_missing", "An active organization is required for this action.");
    }

    const displayName = await this.resolveOrganizationDisplayName(activeOrgId, actor);
    const snapshot = await this.loadDashboardSnapshotSafe(activeOrgId);
    const calls = await this.loadRecentAndMissedCallsSafe(activeOrgId);

    const context: AiChatSmartContextV1 = {
      schema_version: AI_CHAT_CONTEXT_SCHEMA_VERSION,
      as_of: new Date().toISOString(),
      organization: {
        display_name: displayName,
      },
      actor: buildActorCapabilitySummary(actor),
      dashboard_summary: {
        new_leads: snapshot.summary.newLeads,
        contacted_leads: snapshot.summary.contactedLeads,
        active_jobs: snapshot.summary.activeJobs,
        jobs_scheduled_today: snapshot.summary.jobsScheduledToday,
        unpaid_invoices: snapshot.summary.unpaidInvoices,
      },
      unpaid_invoices: mapUnpaidInvoices(snapshot),
      stale_estimates: mapStaleEstimates(snapshot),
      todays_jobs: mapTodaysJobs(snapshot),
      recent_leads: mapRecentLeads(snapshot.leads),
      recent_and_missed_calls: calls,
      data_limits: {
        max_per_category: AI_CHAT_CONTEXT_MAX_PER_CATEGORY,
        note: "Bounded workspace snapshot for the active organization only. If a fact is not listed here, you cannot see it.",
      },
    };

    const { byteLength } = this.contextBuilder.summarizeToolOutput(context);
    if (!this.contextBuilder.enforceOutputCap(byteLength)) {
      this.logger.warn(`ai_chat_context_oversized org=${activeOrgId} bytes=${byteLength}`);
      apiError(413, "ai_context_oversized", "Workspace context exceeds the safe size limit for AI chat.");
    }

    return context;
  }

  formatContextForPrompt(context: AiChatSmartContextV1): string {
    return JSON.stringify(context);
  }

  private async resolveOrganizationDisplayName(organizationId: string, actor: ActorContext): Promise<string> {
    const fromActor = actor.organization?.name?.trim();
    if (fromActor && actor.organization?.id === organizationId) {
      return fromActor;
    }

    const row = await this.organizationsRepository.findOne({
      where: { id: organizationId },
      select: { id: true, name: true },
    });

    return row?.name?.trim() || "Workspace";
  }

  private async loadDashboardSnapshotSafe(organizationId: string): Promise<OfficeDashboardSnapshotPayload> {
    try {
      return await this.crmOfficeDashboard.loadOfficeDashboardSnapshot(organizationId);
    } catch (error) {
      this.logger.warn(
        `ai_chat_dashboard_snapshot_failed org=${organizationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        summary: {
          newLeads: 0,
          contactedLeads: 0,
          activeJobs: 0,
          jobsScheduledToday: 0,
          unpaidInvoices: 0,
        },
        controls: {
          quotesWaitingApproval: [],
          unpaidInvoices: [],
          followUpsNeeded: [],
          todaysScheduledJobs: [],
          recentCompletedJobs: [],
        },
        leads: [],
        jobs: [],
        technicians: [],
        services: [],
      };
    }
  }

  private async loadRecentAndMissedCallsSafe(
    organizationId: string,
  ): Promise<AiChatSmartContextV1["recent_and_missed_calls"]> {
    try {
      const orgParam = organizationId.trim();
      const callSelect = [
        "recent_call.id",
        "recent_call.call_status",
        "recent_call.matched_client_id",
        "recent_call.matched_client_display_name",
        "recent_call.source",
        "recent_call.call_started_at",
        "recent_call.created_at",
        "recent_call.duration_seconds",
      ];

      const missed = await this.recentCallsRepository
        .createQueryBuilder("recent_call")
        .select(callSelect)
        .where(recentCallBelongsToOrgSqlNamed("recent_call", TELEPHONY_ORG_QUERY_PARAM))
        .andWhere("recent_call.call_status IN (:...missedStatuses)", {
          missedStatuses: ["missed", "voicemail"],
        })
        .setParameter(TELEPHONY_ORG_QUERY_PARAM, orgParam)
        .orderBy("COALESCE(recent_call.call_started_at, recent_call.created_at)", "DESC")
        .take(AI_CHAT_CONTEXT_MAX_PER_CATEGORY)
        .getMany();

      const remaining = AI_CHAT_CONTEXT_MAX_PER_CATEGORY - missed.length;
      const recent: RecentCallEntity[] = [];

      if (remaining > 0) {
        const recentQuery = this.recentCallsRepository
          .createQueryBuilder("recent_call")
          .select(callSelect)
          .where(recentCallBelongsToOrgSqlNamed("recent_call", TELEPHONY_ORG_QUERY_PARAM))
          .setParameter(TELEPHONY_ORG_QUERY_PARAM, orgParam)
          .orderBy("COALESCE(recent_call.call_started_at, recent_call.created_at)", "DESC")
          .take(remaining);

        if (missed.length > 0) {
          recentQuery.andWhere("recent_call.id NOT IN (:...missedIds)", {
            missedIds: missed.map((row) => row.id),
          });
        }

        recent.push(...(await recentQuery.getMany()));
      }

      return takeMax([...missed.map(mapCallRow), ...recent.map(mapCallRow)]);
    } catch (error) {
      this.logger.warn(
        `ai_chat_calls_snapshot_failed org=${organizationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }
}
