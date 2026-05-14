import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { MarketingOpportunityEntity } from "../database/entities/marketing-opportunity.entity";
import { MarketingContentService } from "./marketing-content.service";
import {
  MARKETING_OPPORTUNITY_OPEN_STATUSES,
  MARKETING_OPPORTUNITY_REFRESH_COOLDOWN_MS,
  MARKETING_OPPORTUNITY_TYPE_PRIORITY,
} from "./marketing-intelligence.constants";
import {
  MarketingOpportunityDetectionService,
  type MarketingOpportunityCandidate,
} from "./marketing-opportunity-detection.service";

function safePayloadForClient(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    const lower = key.toLowerCase();
    if (lower.includes("url") || lower.endsWith("_uri")) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function serializeOpportunity(row: MarketingOpportunityEntity): Record<string, unknown> {
  let payload: Record<string, unknown> = {};
  if (row.payload_json) {
    try {
      const parsed = JSON.parse(row.payload_json) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = safePayloadForClient(parsed as Record<string, unknown>);
      }
    } catch {
      payload = {};
    }
  }

  return {
    id: row.id,
    organization_id: row.organization_id,
    opportunity_type: row.opportunity_type,
    dedupe_key: row.dedupe_key,
    signal_version: row.signal_version,
    status: row.status,
    title: row.title,
    summary: row.summary,
    source: row.source,
    source_entity_type: row.source_entity_type,
    source_entity_id: row.source_entity_id,
    payload,
    occurred_at: row.occurred_at?.toISOString() ?? null,
    converted_draft_id: row.converted_draft_id,
    dismissed_at: row.dismissed_at?.toISOString() ?? null,
    archived_at: row.archived_at?.toISOString() ?? null,
    last_refreshed_at: row.last_refreshed_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function isPublisherRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "office_admin";
}

@Injectable()
export class MarketingOpportunityService {
  private readonly lastRefreshAtMsByOrg = new Map<string, number>();

  constructor(
    @InjectRepository(MarketingOpportunityEntity)
    private readonly opportunityRepo: Repository<MarketingOpportunityEntity>,
    private readonly detectionService: MarketingOpportunityDetectionService,
    private readonly contentService: MarketingContentService,
    private readonly dataSource: DataSource,
  ) {}

  private assertRefreshCooldown(organizationId: string): void {
    const prev = this.lastRefreshAtMsByOrg.get(organizationId) ?? 0;
    const now = Date.now();
    if (now - prev < MARKETING_OPPORTUNITY_REFRESH_COOLDOWN_MS) {
      apiError(
        429,
        "marketing_opportunity_refresh_throttled",
        "Opportunity detection was refreshed recently. Try again in a moment.",
      );
    }
    this.lastRefreshAtMsByOrg.set(organizationId, now);
  }

  async refreshOpportunities(organizationId: string): Promise<{ upserted: number }> {
    this.assertRefreshCooldown(organizationId);
    const candidates = await this.detectionService.detectForOrganization(organizationId);
    let upserted = 0;
    const now = new Date();

    for (const c of candidates) {
      const saved = await this.upsertCandidate(organizationId, c, now);
      if (saved) {
        upserted += 1;
      }
    }

    return { upserted };
  }

  /**
   * Bounded warm refresh for publishers entering `/marketing/opportunities`.
   */
  async maybeWarmRefreshFromReadPath(organizationId: string, role: string | null | undefined): Promise<void> {
    if (!isPublisherRole(role)) {
      return;
    }

    const prev = this.lastRefreshAtMsByOrg.get(organizationId) ?? 0;
    const now = Date.now();
    if (now - prev < MARKETING_OPPORTUNITY_REFRESH_COOLDOWN_MS) {
      return;
    }

    this.lastRefreshAtMsByOrg.set(organizationId, now);
    const candidates = await this.detectionService.detectForOrganization(organizationId);
    const stamp = new Date();
    for (const c of candidates) {
      await this.upsertCandidate(organizationId, c, stamp);
    }
  }

  private async upsertCandidate(
    organizationId: string,
    candidate: MarketingOpportunityCandidate,
    now: Date,
  ): Promise<boolean> {
    const existing = await this.opportunityRepo.findOne({
      where: { organization_id: organizationId, dedupe_key: candidate.dedupe_key },
    });

    if (
      existing
      && (existing.status === "dismissed"
        || existing.status === "archived"
        || existing.status === "converted_to_draft")
    ) {
      return false;
    }

    const payloadJson = JSON.stringify(candidate.payload);

    if (!existing) {
      await this.opportunityRepo.save(
        this.opportunityRepo.create({
          organization_id: organizationId,
          opportunity_type: candidate.opportunity_type,
          dedupe_key: candidate.dedupe_key,
          signal_version: 1,
          status: "suggested",
          title: candidate.title,
          summary: candidate.summary,
          source: candidate.source,
          source_entity_type: candidate.source_entity_type,
          source_entity_id: candidate.source_entity_id,
          payload_json: payloadJson,
          occurred_at: candidate.occurred_at,
          last_refreshed_at: now,
        }),
      );
      return true;
    }

    existing.title = candidate.title;
    existing.summary = candidate.summary;
    existing.payload_json = payloadJson;
    existing.source = candidate.source;
    existing.source_entity_type = candidate.source_entity_type;
    existing.source_entity_id = candidate.source_entity_id;
    existing.occurred_at = candidate.occurred_at;
    existing.last_refreshed_at = now;

    if (existing.status === "detected") {
      existing.status = "suggested";
    }

    await this.opportunityRepo.save(existing);
    return true;
  }

  async listOpportunities(input: {
    organizationId: string;
    role: string | null | undefined;
    warmUp?: boolean;
    limit: number;
    offset: number;
    status?: string;
    opportunity_type?: string;
  }): Promise<{ opportunities: Record<string, unknown>[]; total: number }> {
    if (input.warmUp) {
      await this.maybeWarmRefreshFromReadPath(input.organizationId, input.role);
    }

    const qb = this.opportunityRepo
      .createQueryBuilder("o")
      .where("o.organization_id = :organizationId", { organizationId: input.organizationId });

    if (input.status && typeof input.status === "string") {
      qb.andWhere("o.status = :status", { status: input.status.trim() });
    } else {
      qb.andWhere("o.status IN (:...openStatuses)", { openStatuses: [...MARKETING_OPPORTUNITY_OPEN_STATUSES] });
    }

    if (input.opportunity_type && typeof input.opportunity_type === "string") {
      qb.andWhere("o.opportunity_type = :opportunityType", { opportunityType: input.opportunity_type.trim() });
    }

    const total = await qb.getCount();

    qb.orderBy("o.occurred_at", "DESC").addOrderBy("o.updated_at", "DESC");
    qb.skip(input.offset).take(input.limit);

    const rows = await qb.getMany();
    return {
      opportunities: rows.map((r) => serializeOpportunity(r)),
      total,
    };
  }

  async getOpportunity(organizationId: string, id: string): Promise<Record<string, unknown>> {
    const row = await this.opportunityRepo.findOne({
      where: { organization_id: organizationId, id: id.trim() },
    });

    if (!row) {
      apiError(404, "marketing_opportunity_missing", "Opportunity not found.");
    }

    return serializeOpportunity(row);
  }

  async countOpenForOrganization(organizationId: string): Promise<number> {
    return this.opportunityRepo.count({
      where: {
        organization_id: organizationId,
        status: In([...MARKETING_OPPORTUNITY_OPEN_STATUSES]),
      },
    });
  }

  recommendNextAction(openRows: MarketingOpportunityEntity[]): {
    opportunity_type: string | null;
    opportunity_id: string | null;
    headline: string;
    subheadline: string;
    href: string | null;
  } | null {
    const open = openRows.filter((r) =>
      (MARKETING_OPPORTUNITY_OPEN_STATUSES as readonly string[]).includes(r.status),
    );
    if (!open.length) {
      return null;
    }

    const sorted = [...open].sort((a, b) => {
      const pa = MARKETING_OPPORTUNITY_TYPE_PRIORITY[a.opportunity_type] ?? 99;
      const pb = MARKETING_OPPORTUNITY_TYPE_PRIORITY[b.opportunity_type] ?? 99;
      if (pa !== pb) {
        return pa - pb;
      }
      const da = a.occurred_at?.valueOf() ?? 0;
      const db = b.occurred_at?.valueOf() ?? 0;
      return db - da;
    });

    const top = sorted[0]!;
    return {
      opportunity_type: top.opportunity_type,
      opportunity_id: top.id,
      headline: top.title,
      subheadline: top.summary ?? "Convert this signal into a draft in Content Studio.",
      href: "/marketing/opportunities",
    };
  }

  async loadOpenSuggestedForRecommendation(organizationId: string): Promise<MarketingOpportunityEntity[]> {
    return this.opportunityRepo.find({
      where: {
        organization_id: organizationId,
        status: In([...MARKETING_OPPORTUNITY_OPEN_STATUSES]),
      },
      order: { occurred_at: "DESC", updated_at: "DESC" },
      take: 50,
    });
  }

  async patchLifecycle(input: {
    organizationId: string;
    actorUserId: string;
    opportunityId: string;
    action: "dismiss" | "archive";
  }): Promise<Record<string, unknown>> {
    const row = await this.opportunityRepo.findOne({
      where: { organization_id: input.organizationId, id: input.opportunityId.trim() },
    });

    if (!row) {
      apiError(404, "marketing_opportunity_missing", "Opportunity not found.");
    }

    if (row.status === "converted_to_draft") {
      apiError(400, "marketing_opportunity_terminal", "Converted opportunities cannot change lifecycle.");
    }

    const now = new Date();
    if (input.action === "dismiss") {
      row.status = "dismissed";
      row.dismissed_at = now;
      row.dismissed_by_user_id = input.actorUserId;
    } else {
      row.status = "archived";
      row.archived_at = now;
    }

    await this.opportunityRepo.save(row);
    return serializeOpportunity(row);
  }

  async convertToDraft(input: {
    organizationId: string;
    actorUserId: string;
    opportunityId: string;
    titleOverride?: string | undefined;
    notesOverride?: string | undefined;
  }): Promise<{ draft: unknown; variants: unknown[] }> {
    const oppId = input.opportunityId.trim();

    const draftId = await this.dataSource.transaction(async (manager) => {
      const oppRepo = manager.getRepository(MarketingOpportunityEntity);
      const row = await oppRepo.findOne({
        where: { organization_id: input.organizationId, id: oppId },
      });

      if (!row) {
        apiError(404, "marketing_opportunity_missing", "Opportunity not found.");
      }

      if (row.status !== "suggested" && row.status !== "detected") {
        apiError(400, "marketing_opportunity_not_convertible", "Only open suggestions can convert to a draft.");
      }

      const intent = row.opportunity_type.length > 128 ? row.opportunity_type.slice(0, 128) : row.opportunity_type;
      const title = (input.titleOverride ?? row.title).trim().slice(0, 255);
      const notes = (input.notesOverride ?? row.summary ?? "").trim() || null;

      const newDraftId = await this.contentService.createDraftWithManager(
        manager,
        input.organizationId,
        input.actorUserId,
        {
          title,
          intent,
          notes,
        },
      );

      row.status = "converted_to_draft";
      row.converted_draft_id = newDraftId;
      await oppRepo.save(row);

      return newDraftId;
    });

    return this.contentService.getDraftDetail(input.organizationId, draftId);
  }
}
