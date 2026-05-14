import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { runtimeDatabaseType } from "../database/database-dialect";
import { MarketingAutomationRuleEntity } from "../database/entities/marketing-automation-rule.entity";
import { MarketingAutomationRunEntity } from "../database/entities/marketing-automation-run.entity";
import { MarketingCampaignEntity } from "../database/entities/marketing-campaign.entity";
import { MarketingCampaignItemEntity } from "../database/entities/marketing-campaign-item.entity";
import { MarketingConnectedChannelEntity } from "../database/entities/marketing-connected-channel.entity";
import { MarketingContentDraftEntity } from "../database/entities/marketing-content-draft.entity";
import { MarketingOpportunityEntity } from "../database/entities/marketing-opportunity.entity";
import { MarketingPublishAttemptEntity } from "../database/entities/marketing-publish-attempt.entity";
import { MarketingPublishJobEntity } from "../database/entities/marketing-publish-job.entity";
import {
  MARKETING_ANALYTICS_MAX_WINDOW_MS,
  MARKETING_ANALYTICS_PRESETS,
  type MarketingAnalyticsPresetKey,
} from "./marketing-analytics.constants";

function isPresetKey(raw: string | undefined): raw is MarketingAnalyticsPresetKey {
  return raw !== undefined && (MARKETING_ANALYTICS_PRESETS as readonly string[]).includes(raw);
}

/** End-exclusive upper bound normalization for BETWEEN queries (microsecond granularity). */
function endExclusiveUtc(d: Date): Date {
  return new Date(d.getTime() + 1);
}

function parseUtcDayStart(raw: string): Date {
  const d = new Date(raw.trim());
  if (Number.isNaN(d.valueOf())) {
    apiError(400, "marketing_analytics_date_invalid", "Invalid from/to date.");
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function parseUtcDayEnd(raw: string): Date {
  const d = new Date(raw.trim());
  if (Number.isNaN(d.valueOf())) {
    apiError(400, "marketing_analytics_date_invalid", "Invalid from/to date.");
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

export type MarketingAnalyticsWindowInput = {
  preset?: string;
  from?: string;
  to?: string;
};

export type MarketingAnalyticsResolvedWindow = {
  from: Date;
  to: Date;
  preset: MarketingAnalyticsPresetKey | "custom";
};

@Injectable()
export class MarketingAnalyticsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MarketingOpportunityEntity)
    private readonly opportunityRepo: Repository<MarketingOpportunityEntity>,
    @InjectRepository(MarketingContentDraftEntity)
    private readonly draftRepo: Repository<MarketingContentDraftEntity>,
    @InjectRepository(MarketingCampaignEntity)
    private readonly campaignRepo: Repository<MarketingCampaignEntity>,
    @InjectRepository(MarketingCampaignItemEntity)
    private readonly campaignItemRepo: Repository<MarketingCampaignItemEntity>,
    @InjectRepository(MarketingConnectedChannelEntity)
    private readonly channelRepo: Repository<MarketingConnectedChannelEntity>,
    @InjectRepository(MarketingPublishJobEntity)
    private readonly publishJobRepo: Repository<MarketingPublishJobEntity>,
    @InjectRepository(MarketingPublishAttemptEntity)
    private readonly publishAttemptRepo: Repository<MarketingPublishAttemptEntity>,
    @InjectRepository(MarketingAutomationRuleEntity)
    private readonly automationRuleRepo: Repository<MarketingAutomationRuleEntity>,
    @InjectRepository(MarketingAutomationRunEntity)
    private readonly automationRunRepo: Repository<MarketingAutomationRunEntity>,
  ) {}

  resolveWindow(input: MarketingAnalyticsWindowInput): MarketingAnalyticsResolvedWindow {
    const now = Date.now();

    const presetTrim = typeof input.preset === "string" ? input.preset.trim().toLowerCase() : "";

    const hasPreset = presetTrim.length > 0 && isPresetKey(presetTrim);
    const hasFrom = typeof input.from === "string" && input.from.trim().length > 0;
    const hasTo = typeof input.to === "string" && input.to.trim().length > 0;

    if (hasPreset && (hasFrom || hasTo)) {
      apiError(400, "marketing_analytics_window_conflict", "Use preset XOR from/to, not both.");
    }

    if (!hasPreset && !(hasFrom && hasTo)) {
      apiError(
        400,
        "marketing_analytics_window_required",
        "Provide preset=last_7d|last_30d|last_90d or both from and to.",
      );
    }

    let from!: Date;
    let to!: Date;
    let preset: MarketingAnalyticsResolvedWindow["preset"];

    if (hasPreset && isPresetKey(presetTrim)) {
      preset = presetTrim;
      const spanMs =
        presetTrim === "last_7d" ? 7 * 86400000
        : presetTrim === "last_30d" ? 30 * 86400000
        : 90 * 86400000;

      to = new Date(now);
      from = new Date(now - spanMs);
    } else {
      preset = "custom";
      from = parseUtcDayStart(input.from!);
      to = parseUtcDayEnd(input.to!);
      if (from.getTime() > to.getTime()) {
        apiError(400, "marketing_analytics_range_inverted", "from must not be after to.");
      }
      if (to.getTime() - from.getTime() > MARKETING_ANALYTICS_MAX_WINDOW_MS) {
        apiError(
          400,
          "marketing_analytics_range_too_wide",
          "Analytics range cannot exceed roughly one year.",
        );
      }
    }

    return { from, to, preset };
  }

  async buildSummaryPayload(organizationId: string, input: MarketingAnalyticsWindowInput): Promise<Record<string, unknown>> {
    const { from, to, preset } = this.resolveWindow(input);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const toExclusive = endExclusiveUtc(to);

    const [
      opportunitiesSlice,
      opportunityLifecycle,
      opportunityTopTypes,
      draftWorkflowBuckets,
      draftAttributionBuckets,
      campaignBuckets,
      campaignItemCoverage,
      jobStatusBuckets,
      attemptPlatformSlices,
      automationRulesSnapshot,
      automationRunOutcomes,
      automationSkipHints,
      channelStatusBuckets,
      channelIncidentHints,
      funnelsEnvelope,
    ] = await Promise.all([
      this.aggregateOpportunitiesCreatedInWindowWithStatus(organizationId, from, toExclusive),
      this.aggregateOpportunityLifecycleTouches(organizationId, from, toExclusive),
      this.aggregateTopOpportunityTypes(organizationId, from, toExclusive),
      this.aggregateDraftWorkflowInWindow(organizationId, from, toExclusive),
      this.getDraftAttributionBuckets(organizationId, from, toExclusive),
      this.aggregateCampaignsCreatedInWindowByStatus(organizationId, from, toExclusive),
      this.campaignDraftCoverageForCampaignsCreatedInWindow(organizationId, from, toExclusive),
      this.aggregatePublishJobsCreatedInWindow(organizationId, from, toExclusive),
      this.aggregatePublishAttemptsStartedInWindow(organizationId, from, toExclusive),
      this.automationRulesEnabledSnapshot(organizationId),
      this.automationRunsByOutcomeWindow(organizationId, from, toExclusive),
      this.automationTopSkipReasonsWindow(organizationId, from, toExclusive),
      this.channelStatusBreakdown(organizationId),
      this.channelFailuresInWindowHint(organizationId, from, toExclusive),
      this.buildWorkflowFunnels(organizationId, from, toExclusive),
    ]);

    return {
      window: {
        preset,
        from: fromIso,
        to: toIso,
        utc_note: "All bounds are interpreted in UTC. O1 funnel uses opportunities.created_at.",
      },
      disclaimers: [
        "Growth Center analytics reflect internal workflows only — not leads booked, pipeline revenue, or ad ROI.",
        "Draft approval timestamps are approximated from row state (`workflow_state`), not audited transition logs.",
        "Automation run totals omit silent cooldown skips that never persisted a row (Phase 6 behavior).",
        "Publish outcomes reflect enqueue + provider HTTP attempts — not reach, impressions, or engagement.",
        "Draft source buckets are prioritized: automation rule → manual opportunity conversion → campaign slot → residual unknown.",
      ],
      opportunities: {
        rows_created_in_window_by_current_status: opportunitiesSlice,
        lifecycle_events_in_window: opportunityLifecycle,
        top_opportunity_types_in_window: opportunityTopTypes,
      },
      drafts: {
        workflow_state_counts_for_creates_in_window: draftWorkflowBuckets,
        draft_source_buckets_creates_in_window: draftAttributionBuckets,
      },
      campaigns: {
        campaigns_created_in_window_by_status: campaignBuckets,
        item_slot_coverage_campaigns_created_in_window: campaignItemCoverage,
      },
      publishing: {
        jobs_created_in_window_by_status: jobStatusBuckets,
        attempts_started_in_window_by_platform: attemptPlatformSlices,
      },
      automations: {
        rules_enabled_current_total: automationRulesSnapshot,
        runs_in_window_by_outcome: automationRunOutcomes,
        top_skip_reasons_in_window: automationSkipHints,
      },
      channels: {
        connection_status_counts: channelStatusBuckets,
        channels_with_last_failure_in_window: channelIncidentHints,
      },
      funnels: funnelsEnvelope,
    };
  }

  /** Two tiny counters + label for Growth Center `/marketing` overview — last 30d rolling preset. */
  async buildOverviewPulse(organizationId: string): Promise<{
    window_preset: MarketingAnalyticsPresetKey;
    publish_jobs_terminal_count: number;
    opportunities_converted_approx_count: number;
  }> {
    const w = this.resolveWindow({ preset: "last_30d" });
    const toEx = endExclusiveUtc(w.to);
    const terminalJobs = await this.publishJobRepo
      .createQueryBuilder("j")
      .where("j.organization_id = :organizationId", { organizationId })
      .andWhere("j.created_at >= :from AND j.created_at < :toExclusive", { from: w.from, toExclusive: toEx })
      .andWhere("j.status IN (:...terminal)", { terminal: ["succeeded", "partial", "failed", "canceled"] })
      .getCount();

    const convertedApprox = await this.opportunityRepo
      .createQueryBuilder("o")
      .where("o.organization_id = :organizationId", { organizationId })
      .andWhere("o.converted_draft_id IS NOT NULL")
      .andWhere("o.updated_at >= :from AND o.updated_at < :toExclusive", {
        from: w.from,
        toExclusive: toEx,
      })
      .getCount();

    return {
      window_preset: "last_30d",
      publish_jobs_terminal_count: terminalJobs,
      opportunities_converted_approx_count: convertedApprox,
    };
  }

  private async aggregateOpportunitiesCreatedInWindowWithStatus(
    organizationId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<Record<string, number>> {
    const rows = await this.opportunityRepo
      .createQueryBuilder("o")
      .select("o.status", "status")
      .addSelect("COUNT(*)", "count")
      .where("o.organization_id = :organizationId", { organizationId })
      .andWhere("o.created_at >= :from AND o.created_at < :toExclusive", { from, toExclusive })
      .groupBy("o.status")
      .getRawMany<{ status: string; count: string }>();

    const out: Record<string, number> = {};
    for (const row of rows) {
      out[row.status] = Number.parseInt(row.count, 10) || 0;
    }

    return out;
  }

  private async aggregateOpportunityLifecycleTouches(
    organizationId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<Record<string, number>> {
    const dismissed = await this.opportunityRepo
      .createQueryBuilder("o")
      .where("o.organization_id = :organizationId", { organizationId })
      .andWhere("o.dismissed_at IS NOT NULL")
      .andWhere("o.dismissed_at >= :from AND o.dismissed_at < :toExclusive", { from, toExclusive })
      .getCount();

    const archived = await this.opportunityRepo
      .createQueryBuilder("o")
      .where("o.organization_id = :organizationId", { organizationId })
      .andWhere("o.archived_at IS NOT NULL")
      .andWhere("o.archived_at >= :from AND o.archived_at < :toExclusive", { from, toExclusive })
      .getCount();

    const convertedApprox = await this.opportunityRepo
      .createQueryBuilder("o")
      .where("o.organization_id = :organizationId", { organizationId })
      .andWhere("o.status = :status", { status: "converted_to_draft" })
      .andWhere("o.converted_draft_id IS NOT NULL")
      .andWhere("o.updated_at >= :from AND o.updated_at < :toExclusive", { from, toExclusive })
      .getCount();

    return {
      dismissed_rows_timestamp_in_window: dismissed,
      archived_rows_timestamp_in_window: archived,
      converted_to_draft_state_updated_in_window_approx: convertedApprox,
    };
  }

  private async aggregateTopOpportunityTypes(
    organizationId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<Array<{ opportunity_type: string; count: number }>> {
    const rows = await this.opportunityRepo
      .createQueryBuilder("o")
      .select("o.opportunity_type", "opportunity_type")
      .addSelect("COUNT(*)", "count")
      .where("o.organization_id = :organizationId", { organizationId })
      .andWhere("o.created_at >= :from AND o.created_at < :toExclusive", { from, toExclusive })
      .groupBy("o.opportunity_type")
      .orderBy("COUNT(*)", "DESC")
      .take(12)
      .getRawMany<{ opportunity_type: string; count: string }>();

    return rows.map((r) => ({
      opportunity_type: r.opportunity_type,
      count: Number.parseInt(r.count, 10) || 0,
    }));
  }

  private async aggregateDraftWorkflowInWindow(
    organizationId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<Record<string, number>> {
    const rows = await this.draftRepo
      .createQueryBuilder("d")
      .select("d.workflow_state", "workflow_state")
      .addSelect("COUNT(*)", "count")
      .where("d.organization_id = :organizationId", { organizationId })
      .andWhere("d.created_at >= :from AND d.created_at < :toExclusive", { from, toExclusive })
      .groupBy("d.workflow_state")
      .getRawMany<{ workflow_state: string; count: string }>();

    const out: Record<string, number> = {};

    for (const row of rows) {
      out[row.workflow_state] = Number.parseInt(row.count, 10) || 0;
    }

    return out;
  }

  private async getDraftAttributionBuckets(
    organizationId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<Record<string, number>> {
    const isPg = runtimeDatabaseType === "postgres";
    const oid = isPg ? "$1" : "?";
    const pFrom = isPg ? "$2" : "?";
    const pTo = isPg ? "$3" : "?";

    const sql = `
SELECT draft_attribution_bucket AS bucket, COUNT(*) AS count
FROM (
  SELECT d.id AS draft_id,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM marketing_automation_runs r
        WHERE r.organization_id = d.organization_id
          AND r.marketing_content_draft_id = d.id
          AND r.outcome = 'draft_created'
      ) THEN 'automation'
      WHEN EXISTS (
        SELECT 1 FROM marketing_opportunities o
        WHERE o.organization_id = d.organization_id
          AND o.converted_draft_id = d.id
      ) THEN 'opportunity_conversion'
      WHEN EXISTS (
        SELECT 1 FROM marketing_campaign_items i
        WHERE i.organization_id = d.organization_id
          AND i.draft_id = d.id
      ) THEN 'campaign_slot'
      ELSE 'unknown_other'
    END AS draft_attribution_bucket
  FROM marketing_content_drafts d
  WHERE d.organization_id = ${oid}
    AND d.created_at >= ${pFrom}
    AND d.created_at < ${pTo}
) t
GROUP BY draft_attribution_bucket
`;

    const rows = await this.dataSource.query(sql, [organizationId, from, toExclusive]) as Array<
      { bucket: string; count: number | string }
    >;

    const out: Record<string, number> = {
      automation: 0,
      opportunity_conversion: 0,
      campaign_slot: 0,
      unknown_other: 0,
    };

    for (const row of rows) {
      const key = row.bucket ?? "unknown_other";
      out[key] = typeof row.count === "number" ? row.count : Number.parseInt(`${row.count}`, 10);
    }

    return out;
  }

  private async aggregateCampaignsCreatedInWindowByStatus(
    organizationId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<Record<string, number>> {
    const rows = await this.campaignRepo
      .createQueryBuilder("c")
      .select("c.status", "status")
      .addSelect("COUNT(*)", "count")
      .where("c.organization_id = :organizationId", { organizationId })
      .andWhere("c.created_at >= :from AND c.created_at < :toExclusive", { from, toExclusive })
      .groupBy("c.status")
      .getRawMany<{ status: string; count: string }>();

    const out: Record<string, number> = {};

    for (const row of rows) {
      out[row.status] = Number.parseInt(row.count, 10) || 0;
    }

    return out;
  }

  private async campaignDraftCoverageForCampaignsCreatedInWindow(
    organizationId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<{
    campaign_rows_created_in_window: number;
    item_rows_for_those_campaigns: number;
    items_with_draft_attached: number;
    slots_empty: number;
    coverage_ratio_items_with_draft?: number | null;
  }> {
    const campaignRows = await this.campaignRepo
      .createQueryBuilder("c")
      .where("c.organization_id = :organizationId", { organizationId })
      .andWhere("c.created_at >= :from AND c.created_at < :toExclusive", { from, toExclusive })
      .getMany();

    if (!campaignRows.length) {
      return {
        campaign_rows_created_in_window: 0,
        item_rows_for_those_campaigns: 0,
        items_with_draft_attached: 0,
        slots_empty: 0,
        coverage_ratio_items_with_draft: null,
      };
    }

    const ids = campaignRows.map((r) => r.id);
    const items = await this.campaignItemRepo.find({
      where: { organization_id: organizationId, campaign_id: In(ids) },
      select: { draft_id: true },
    });

    const withDraft = items.filter((i) => Boolean(i.draft_id)).length;
    const total = items.length;

    return {
      campaign_rows_created_in_window: campaignRows.length,
      item_rows_for_those_campaigns: total,
      items_with_draft_attached: withDraft,
      slots_empty: total - withDraft,
      coverage_ratio_items_with_draft: total === 0 ? null : Math.round((1000 * withDraft) / total) / 1000,
    };
  }

  private async aggregatePublishJobsCreatedInWindow(
    organizationId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<Record<string, number>> {
    const rows = await this.publishJobRepo
      .createQueryBuilder("j")
      .select("j.status", "status")
      .addSelect("COUNT(*)", "count")
      .where("j.organization_id = :organizationId", { organizationId })
      .andWhere("j.created_at >= :from AND j.created_at < :toExclusive", { from, toExclusive })
      .groupBy("j.status")
      .getRawMany<{ status: string; count: string }>();

    const out: Record<string, number> = {};

    for (const row of rows) {
      out[row.status] = Number.parseInt(row.count, 10) || 0;
    }

    return out;
  }

  private async aggregatePublishAttemptsStartedInWindow(
    organizationId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<Array<{ platform_key: string; total: number; succeeded: number; failed: number; other: number }>> {
    const rows = await this.publishAttemptRepo
      .createQueryBuilder("a")
      .select("a.platform_key", "platform_key")
      .addSelect("COUNT(*)", "total")
      .addSelect("SUM(CASE WHEN a.status = 'succeeded' THEN 1 ELSE 0 END)", "ok")
      .addSelect("SUM(CASE WHEN a.status = 'failed' THEN 1 ELSE 0 END)", "fail")
      .where("a.organization_id = :organizationId", { organizationId })
      .andWhere("a.started_at >= :from AND a.started_at < :toExclusive", { from, toExclusive })
      .groupBy("a.platform_key")
      .orderBy("a.platform_key", "ASC")
      .getRawMany<{ platform_key: string; total: string; ok: string; fail: string }>();

    return rows.map((r) => {
      const total = Number.parseInt(r.total, 10) || 0;
      const succeeded = Number.parseInt(r.ok, 10) || 0;
      const failed = Number.parseInt(r.fail, 10) || 0;

      return {
        platform_key: r.platform_key,
        total,
        succeeded,
        failed,
        other: Math.max(0, total - succeeded - failed),
      };
    });
  }

  private async automationRulesEnabledSnapshot(organizationId: string): Promise<number> {
    return await this.automationRuleRepo.count({
      where: { organization_id: organizationId, enabled: true },
    });
  }

  private async automationRunsByOutcomeWindow(
    organizationId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<Record<string, number>> {
    const rows = await this.automationRunRepo
      .createQueryBuilder("r")
      .select("r.outcome", "outcome")
      .addSelect("COUNT(*)", "count")
      .where("r.organization_id = :organizationId", { organizationId })
      .andWhere("r.created_at >= :from AND r.created_at < :toExclusive", { from, toExclusive })
      .groupBy("r.outcome")
      .getRawMany<{ outcome: string; count: string }>();

    const out: Record<string, number> = {};

    for (const row of rows) {
      out[row.outcome] = Number.parseInt(row.count, 10) || 0;
    }

    return out;
  }

  private async automationTopSkipReasonsWindow(
    organizationId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<Array<{ skip_reason: string; count: number }>> {
    const rows = await this.automationRunRepo
      .createQueryBuilder("r")
      .select("r.skip_reason", "skip_reason")
      .addSelect("COUNT(*)", "count")
      .where("r.organization_id = :organizationId", { organizationId })
      .andWhere("r.created_at >= :from AND r.created_at < :toExclusive", { from, toExclusive })
      .andWhere("r.skip_reason IS NOT NULL")
      .groupBy("r.skip_reason")
      .orderBy("COUNT(*)", "DESC")
      .take(8)
      .getRawMany<{ skip_reason: string; count: string }>();

    return rows.map((r) => ({
      skip_reason: r.skip_reason ?? "",
      count: Number.parseInt(r.count, 10) || 0,
    }));
  }

  private async channelStatusBreakdown(
    organizationId: string,
  ): Promise<Array<{ connection_status: string; count: number }>> {
    const rows = await this.channelRepo
      .createQueryBuilder("c")
      .select("c.connection_status", "connection_status")
      .addSelect("COUNT(*)", "count")
      .where("c.organization_id = :organizationId", { organizationId })
      .groupBy("c.connection_status")
      .getRawMany<{ connection_status: string; count: string }>();

    return rows.map((r) => ({
      connection_status: r.connection_status,
      count: Number.parseInt(r.count, 10) || 0,
    }));
  }

  private async channelFailuresInWindowHint(
    organizationId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<number> {
    return await this.channelRepo
      .createQueryBuilder("c")
      .where("c.organization_id = :organizationId", { organizationId })
      .andWhere("c.last_failure_at IS NOT NULL")
      .andWhere("c.last_failure_at >= :from AND c.last_failure_at < :toExclusive", { from, toExclusive })
      .getCount();
  }

  private async buildWorkflowFunnels(
    organizationId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<Record<string, unknown>> {
    const o1CreatedInWindow = await this.opportunityRepo
      .createQueryBuilder("o")
      .where("o.organization_id = :organizationId", { organizationId })
      .andWhere("o.created_at >= :from AND o.created_at < :toExclusive", { from, toExclusive })
      .getCount();

    const o2ConvertedApproxSameWindowSemantics = await this.opportunityRepo
      .createQueryBuilder("o")
      .where("o.organization_id = :organizationId", { organizationId })
      .andWhere("o.status = :status", { status: "converted_to_draft" })
      .andWhere("o.converted_draft_id IS NOT NULL")
      .andWhere("o.updated_at >= :from AND o.updated_at < :toExclusive", { from, toExclusive })
      .getCount();

    const draftsCreatedWindow = await this.draftRepo
      .createQueryBuilder("d")
      .where("d.organization_id = :organizationId", { organizationId })
      .andWhere("d.created_at >= :from AND d.created_at < :toExclusive", { from, toExclusive })
      .getCount();

    const draftsApprovedCurrentStateBornInWindow = await this.draftRepo
      .createQueryBuilder("d")
      .where("d.organization_id = :organizationId", { organizationId })
      .andWhere("d.created_at >= :from AND d.created_at < :toExclusive", { from, toExclusive })
      .andWhere("d.workflow_state = :wf", { wf: "approved" })
      .getCount();

    const jobsCreatedWindow = await this.publishJobRepo
      .createQueryBuilder("j")
      .where("j.organization_id = :organizationId", { organizationId })
      .andWhere("j.created_at >= :from AND j.created_at < :toExclusive", { from, toExclusive })
      .getCount();

    const jobsTerminalWindow = await this.publishJobRepo
      .createQueryBuilder("j")
      .where("j.organization_id = :organizationId", { organizationId })
      .andWhere("j.created_at >= :from AND j.created_at < :toExclusive", { from, toExclusive })
      .andWhere("j.status IN (:...terminals)", { terminals: ["succeeded", "partial", "failed", "canceled"] })
      .getCount();

    return {
      opportunity_funnel_notes:
        "O1 counts opportunities.first_seen_in_window_by_created_at. O2 uses converted terminal state with updated_at in window — not perfect event sourcing.",
      opportunity_surface_created_at_in_window_count: o1CreatedInWindow,
      opportunity_marked_converted_in_window_approx_count: o2ConvertedApproxSameWindowSemantics,
      opportunity_approx_conversion_ratio_o2_over_o1:
        o1CreatedInWindow === 0 ? null : Math.round((10000 * o2ConvertedApproxSameWindowSemantics) / o1CreatedInWindow) / 10000,
      draft_funnel_notes:
        "Approved bucket counts drafts still approved whose created_at is in-window — approvals may lag window end.",
      draft_created_count_in_window: draftsCreatedWindow,
      draft_current_state_approved_and_created_in_window_count: draftsApprovedCurrentStateBornInWindow,
      draft_approx_approval_share_created_in_window:
        draftsCreatedWindow === 0
          ? null
          : Math.round((10000 * draftsApprovedCurrentStateBornInWindow) / draftsCreatedWindow) / 10000,
      publish_funnel_notes:
        "Terminal jobs count rows created in-window now in succeeded/partial/failed/canceled statuses — retries may drift timing somewhat.",
      publish_jobs_created_count_in_window: jobsCreatedWindow,
      publish_jobs_terminal_status_count_created_in_window: jobsTerminalWindow,
      publish_approx_terminal_share:
        jobsCreatedWindow === 0 ? null : Math.round((10000 * jobsTerminalWindow) / jobsCreatedWindow) / 10000,
    };
  }
}
