import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import { randomUUID } from "crypto";

import { apiError } from "../common/api-response";
import { MarketingCampaignEntity, type MarketingCampaignStatus } from "../database/entities/marketing-campaign.entity";
import { MarketingCampaignItemEntity } from "../database/entities/marketing-campaign-item.entity";
import { MarketingContentDraftEntity } from "../database/entities/marketing-content-draft.entity";
import { MarketingPublishJobEntity } from "../database/entities/marketing-publish-job.entity";
import { MarketingContentService } from "./marketing-content.service";
import {
  computeSuggestedScheduledAt,
  MARKETING_CAMPAIGN_TEMPLATE_VERSION,
  slotBlueprintsForKind,
} from "./marketing-campaign-templates";
import {
  isMarketingCampaignKind,
  isMarketingCampaignStatus,
  normalizeChannelIntentKeys,
  type MarketingCampaignKindKey,
} from "./marketing-campaign.constants";

function parseIsoDate(label: string, raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  const d = new Date(raw.trim());
  if (Number.isNaN(d.valueOf())) {
    apiError(400, "marketing_campaign_date_invalid", `${label} must be a valid ISO8601 date/time.`);
  }

  return d;
}

function normalizeGeoNormalized(raw: string | null | undefined): string | null {
  if (!raw?.trim()) {
    return null;
  }

  const t = raw.trim().replace(/\s+/g, " ").toLowerCase();
  return t.length ? t.slice(0, 191) : null;
}

@Injectable()
export class MarketingCampaignService {
  constructor(
    @InjectRepository(MarketingCampaignEntity)
    private readonly campaignRepo: Repository<MarketingCampaignEntity>,
    @InjectRepository(MarketingCampaignItemEntity)
    private readonly itemRepo: Repository<MarketingCampaignItemEntity>,
    @InjectRepository(MarketingContentDraftEntity)
    private readonly draftRepo: Repository<MarketingContentDraftEntity>,
    @InjectRepository(MarketingPublishJobEntity)
    private readonly publishJobRepo: Repository<MarketingPublishJobEntity>,
    private readonly contentService: MarketingContentService,
    private readonly dataSource: DataSource,
  ) {}

  async countActiveCampaigns(organizationId: string): Promise<number> {
    return this.campaignRepo.count({
      where: { organization_id: organizationId, status: "active" },
    });
  }

  async listCampaigns(input: {
    organizationId: string;
    status?: string | undefined;
    limit: number;
    offset: number;
    excludeArchivedCancelled?: boolean | undefined;
  }): Promise<{ campaigns: Record<string, unknown>[]; total: number }> {
    const qb = this.campaignRepo
      .createQueryBuilder("c")
      .where("c.organization_id = :organizationId", { organizationId: input.organizationId });

    if (input.status?.trim()) {
      const st = input.status.trim();
      if (!isMarketingCampaignStatus(st)) {
        apiError(400, "marketing_campaign_status_invalid", "Invalid campaign status filter.");
      }

      qb.andWhere("c.status = :status", { status: st });
    } else if (input.excludeArchivedCancelled !== false) {
      qb.andWhere("c.status NOT IN (:...hidden)", { hidden: ["archived", "cancelled"] });
    }

    const total = await qb.getCount();

    qb.orderBy("c.updated_at", "DESC").skip(input.offset).take(input.limit);

    const rows = await qb.getMany();
    return {
      campaigns: rows.map((r) => this.serializeCampaignSummary(r)),
      total,
    };
  }

  async getCampaignDetail(organizationId: string, campaignId: string): Promise<Record<string, unknown>> {
    const campaign = await this.requireCampaign(organizationId, campaignId.trim());
    const items = await this.itemRepo.find({
      where: { organization_id: organizationId, campaign_id: campaign.id },
      order: { sort_order: "ASC", created_at: "ASC" },
    });

    const itemsOut: Record<string, unknown>[] = [];
    for (const item of items) {
      itemsOut.push(await this.serializeItemDetail(organizationId, item));
    }

    return {
      campaign: this.serializeCampaignSummary(campaign),
      items: itemsOut,
    };
  }

  async getCampaignProgress(organizationId: string, campaignId: string): Promise<Record<string, unknown>> {
    await this.requireCampaign(organizationId, campaignId.trim());

    const items = await this.itemRepo.find({
      where: { organization_id: organizationId, campaign_id: campaignId.trim() },
    });

    let drafts_linked = 0;
    let workflow_draft = 0;
    let workflow_needs_review = 0;
    let workflow_approved = 0;
    let items_with_schedule_meta = 0;

    const draftIds = items.map((i) => i.draft_id).filter((id): id is string => Boolean(id));

    const draftStates = new Map<string, { workflow_state: string; scheduled_at: string | null }>();
    if (draftIds.length) {
      const drafts = await this.draftRepo.find({
        where: { organization_id: organizationId, id: In(draftIds) },
      });

      for (const d of drafts) {
        draftStates.set(d.id, {
          workflow_state: d.workflow_state,
          scheduled_at: d.scheduled_at?.toISOString() ?? null,
        });
      }
    }

    const publishCounts: Record<string, number> = {
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      partial: 0,
      canceled: 0,
    };

    for (const item of items) {
      if (!item.draft_id) {
        continue;
      }

      drafts_linked += 1;
      const ds = draftStates.get(item.draft_id);
      if (!ds) {
        continue;
      }

      if (ds.workflow_state === "draft") {
        workflow_draft += 1;
      } else if (ds.workflow_state === "needs_review") {
        workflow_needs_review += 1;
      } else if (ds.workflow_state === "approved") {
        workflow_approved += 1;
      }

      if (ds.scheduled_at) {
        items_with_schedule_meta += 1;
      }

      const jobs = await this.publishJobRepo.find({
        where: { organization_id: organizationId, draft_id: item.draft_id },
        order: { created_at: "DESC" },
        take: 5,
      });

      for (const j of jobs) {
        publishCounts[j.status] = (publishCounts[j.status] ?? 0) + 1;
      }
    }

    return {
      items_total: items.length,
      drafts_linked,
      workflow_draft,
      workflow_needs_review,
      workflow_approved,
      items_with_schedule_meta,
      publish_jobs_recent_counts: publishCounts,
    };
  }

  async createCampaign(input: {
    organizationId: string;
    actorUserId: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const kindRaw = input.body.campaign_kind;
    if (typeof kindRaw !== "string" || !isMarketingCampaignKind(kindRaw.trim())) {
      apiError(400, "marketing_campaign_kind_invalid", "campaign_kind must be a supported Phase 5 campaign type.");
    }

    const campaign_kind = kindRaw.trim() as MarketingCampaignKindKey;

    const titleRaw = input.body.title;
    const title = typeof titleRaw === "string" ? titleRaw.trim().slice(0, 255) : "";
    if (!title.length) {
      apiError(400, "marketing_campaign_title_required", "title is required.");
    }

    const objective_summary =
      typeof input.body.objective_summary === "string" ? input.body.objective_summary.trim().slice(0, 8000) || null : null;

    const primary_service_topic =
      typeof input.body.primary_service_topic === "string"
        ? input.body.primary_service_topic.trim().slice(0, 255) || null
        : null;

    const geo_label =
      typeof input.body.geo_label === "string" ? input.body.geo_label.trim().slice(0, 255) || null : null;

    let geo_normalized =
      typeof input.body.geo_normalized === "string"
        ? normalizeGeoNormalized(input.body.geo_normalized)
        : null;

    if (!geo_normalized && geo_label) {
      geo_normalized = normalizeGeoNormalized(geo_label);
    }

    const channelKeys = normalizeChannelIntentKeys(input.body.channel_intent);

    const window_starts_at = parseIsoDate("window_starts_at", input.body.window_starts_at);
    const window_ends_at = parseIsoDate("window_ends_at", input.body.window_ends_at);

    if (!window_starts_at || !window_ends_at) {
      apiError(400, "marketing_campaign_window_required", "window_starts_at and window_ends_at are required.");
    }

    if (window_ends_at.valueOf() < window_starts_at.valueOf()) {
      apiError(400, "marketing_campaign_window_invalid", "window_ends_at must be on or after window_starts_at.");
    }

    const campaignId = randomUUID();
    const blueprints = slotBlueprintsForKind(campaign_kind as MarketingCampaignEntity["campaign_kind"]);
    const channelJson = JSON.stringify(channelKeys);

    const plan_snapshot_json = JSON.stringify({
      template_version: MARKETING_CAMPAIGN_TEMPLATE_VERSION,
      campaign_kind,
      slot_keys: blueprints.map((b) => b.slot_key),
    });

    await this.dataSource.transaction(async (manager) => {
      const cRepo = manager.getRepository(MarketingCampaignEntity);
      const iRepo = manager.getRepository(MarketingCampaignItemEntity);

      await cRepo.save(
        cRepo.create({
          id: campaignId,
          organization_id: input.organizationId,
          created_by_user_id: input.actorUserId,
          updated_by_user_id: input.actorUserId,
          campaign_kind,
          title,
          objective_summary,
          primary_service_topic,
          geo_label,
          geo_normalized,
          channel_intent_json: channelJson,
          window_starts_at,
          window_ends_at,
          status: "draft_planning",
          plan_snapshot_json,
        }),
      );

      let order = 0;
      for (const bp of blueprints) {
        const suggested = computeSuggestedScheduledAt(window_starts_at, window_ends_at, bp.progressAlongWindow);
        await iRepo.save(
          iRepo.create({
            id: randomUUID(),
            organization_id: input.organizationId,
            campaign_id: campaignId,
            sort_order: order++,
            slot_key: bp.slot_key,
            label: bp.label,
            plan_notes: bp.plan_notes,
            suggested_scheduled_at: suggested,
            intended_platform_keys_json: channelJson,
            draft_id: null,
          }),
        );
      }
    });

    return this.getCampaignDetail(input.organizationId, campaignId);
  }

  async patchCampaign(input: {
    organizationId: string;
    actorUserId: string;
    campaignId: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const campaign = await this.requireCampaign(input.organizationId, input.campaignId.trim());

    if (campaign.status === "archived" || campaign.status === "cancelled" || campaign.status === "completed") {
      apiError(400, "marketing_campaign_locked", "This campaign cannot be edited.");
    }

    if (input.body.title !== undefined) {
      const titleRaw = input.body.title;
      const title = typeof titleRaw === "string" ? titleRaw.trim().slice(0, 255) : "";
      if (!title.length) {
        apiError(400, "marketing_campaign_title_invalid", "title cannot be empty.");
      }

      campaign.title = title;
    }

    if (input.body.objective_summary !== undefined) {
      campaign.objective_summary =
        typeof input.body.objective_summary === "string"
          ? input.body.objective_summary.trim().slice(0, 8000) || null
          : null;
    }

    if (input.body.primary_service_topic !== undefined) {
      campaign.primary_service_topic =
        typeof input.body.primary_service_topic === "string"
          ? input.body.primary_service_topic.trim().slice(0, 255) || null
          : null;
    }

    if (input.body.geo_label !== undefined) {
      campaign.geo_label =
        typeof input.body.geo_label === "string" ? input.body.geo_label.trim().slice(0, 255) || null : null;
    }

    if (input.body.geo_normalized !== undefined) {
      campaign.geo_normalized =
        typeof input.body.geo_normalized === "string" ? normalizeGeoNormalized(input.body.geo_normalized) : null;
    }

    if (input.body.channel_intent !== undefined) {
      const keys = normalizeChannelIntentKeys(input.body.channel_intent);
      campaign.channel_intent_json = JSON.stringify(keys);
    }

    if (input.body.window_starts_at !== undefined || input.body.window_ends_at !== undefined) {
      const nextStart =
        input.body.window_starts_at !== undefined
          ? parseIsoDate("window_starts_at", input.body.window_starts_at)
          : campaign.window_starts_at;

      const nextEnd =
        input.body.window_ends_at !== undefined
          ? parseIsoDate("window_ends_at", input.body.window_ends_at)
          : campaign.window_ends_at;

      if (!nextStart || !nextEnd) {
        apiError(400, "marketing_campaign_window_invalid", "Invalid campaign window.");
      }

      if (nextEnd.valueOf() < nextStart.valueOf()) {
        apiError(400, "marketing_campaign_window_invalid", "window_ends_at must be on or after window_starts_at.");
      }

      campaign.window_starts_at = nextStart;
      campaign.window_ends_at = nextEnd;
    }

    if (input.body.status !== undefined) {
      const next = typeof input.body.status === "string" ? input.body.status.trim() : "";
      if (!isMarketingCampaignStatus(next)) {
        apiError(400, "marketing_campaign_status_invalid", "Invalid status.");
      }

      if (next === "draft_planning" || next === "active") {
        apiError(400, "marketing_campaign_status_forbidden", "Cannot set status to draft_planning or active via PATCH.");
      }

      const allowedFrom: MarketingCampaignStatus[] = ["draft_planning", "active"];
      if (!allowedFrom.includes(campaign.status)) {
        apiError(400, "marketing_campaign_status_invalid", "Campaign cannot change status further.");
      }

      campaign.status = next as MarketingCampaignStatus;
    }

    campaign.updated_by_user_id = input.actorUserId;
    await this.campaignRepo.save(campaign);

    return this.getCampaignDetail(input.organizationId, campaign.id);
  }

  async addCampaignItem(input: {
    organizationId: string;
    actorUserId: string;
    campaignId: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const campaign = await this.requireCampaign(input.organizationId, input.campaignId.trim());
    this.assertCampaignMutable(campaign);

    const label =
      typeof input.body.label === "string" ? input.body.label.trim().slice(0, 255) : "";
    if (!label.length) {
      apiError(400, "marketing_campaign_item_label_required", "label is required.");
    }

    const slot_key =
      typeof input.body.slot_key === "string" && input.body.slot_key.trim().length
        ? input.body.slot_key.trim().slice(0, 64)
        : `manual_${randomUUID().slice(0, 8)}`;

    const plan_notes =
      typeof input.body.plan_notes === "string" ? input.body.plan_notes.trim().slice(0, 8000) || null : null;

    const sortRaw = input.body.sort_order;
    let sort_order =
      typeof sortRaw === "number" && Number.isFinite(sortRaw) ? Math.floor(sortRaw)
      : typeof sortRaw === "string" && sortRaw.trim() ? Number.parseInt(sortRaw, 10)
      : NaN;

    if (!Number.isFinite(sort_order)) {
      const maxRow = await this.itemRepo
        .createQueryBuilder("i")
        .select("MAX(i.sort_order)", "mx")
        .where("i.organization_id = :organizationId", { organizationId: input.organizationId })
        .andWhere("i.campaign_id = :campaignId", { campaignId: campaign.id })
        .getRawOne<{ mx: number | string | null }>();

      const mx = maxRow?.mx != null ? Number(maxRow.mx) : NaN;
      sort_order = Number.isFinite(mx) ? mx + 1 : 0;
    }

    let suggested_scheduled_at: Date | null = null;
    if (input.body.suggested_scheduled_at !== undefined) {
      suggested_scheduled_at = parseIsoDate("suggested_scheduled_at", input.body.suggested_scheduled_at);
    }

    let channelKeys = normalizeChannelIntentKeys(undefined);
    if (campaign.channel_intent_json) {
      try {
        channelKeys = normalizeChannelIntentKeys(JSON.parse(campaign.channel_intent_json) as unknown[]);
      } catch {
        channelKeys = normalizeChannelIntentKeys(undefined);
      }
    }

    const item = this.itemRepo.create({
      id: randomUUID(),
      organization_id: input.organizationId,
      campaign_id: campaign.id,
      sort_order,
      slot_key,
      label,
      plan_notes,
      suggested_scheduled_at,
      intended_platform_keys_json: JSON.stringify(channelKeys),
      draft_id: null,
    });

    await this.itemRepo.save(item);
    campaign.updated_by_user_id = input.actorUserId;
    await this.campaignRepo.save(campaign);

    return (await this.serializeItemDetail(input.organizationId, item)) as unknown as Record<string, unknown>;
  }

  async patchCampaignItem(input: {
    organizationId: string;
    actorUserId: string;
    campaignId: string;
    itemId: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const campaign = await this.requireCampaign(input.organizationId, input.campaignId.trim());
    this.assertCampaignMutable(campaign);

    const item = await this.requireItem(input.organizationId, campaign.id, input.itemId.trim());

    if (input.body.label !== undefined) {
      const label =
        typeof input.body.label === "string" ? input.body.label.trim().slice(0, 255) : "";
      if (!label.length) {
        apiError(400, "marketing_campaign_item_label_invalid", "label cannot be empty.");
      }

      item.label = label;
    }

    if (input.body.plan_notes !== undefined) {
      item.plan_notes =
        typeof input.body.plan_notes === "string" ? input.body.plan_notes.trim().slice(0, 8000) || null : null;
    }

    if (input.body.suggested_scheduled_at !== undefined) {
      item.suggested_scheduled_at =
        input.body.suggested_scheduled_at === null
          ? null
          : parseIsoDate("suggested_scheduled_at", input.body.suggested_scheduled_at);
    }

    if (input.body.sort_order !== undefined) {
      const sortRaw = input.body.sort_order;
      const sort_order =
        typeof sortRaw === "number" && Number.isFinite(sortRaw)
          ? Math.floor(sortRaw)
          : typeof sortRaw === "string"
            ? Number.parseInt(sortRaw, 10)
            : NaN;

      if (!Number.isFinite(sort_order)) {
        apiError(400, "marketing_campaign_item_sort_invalid", "sort_order must be a number.");
      }

      item.sort_order = sort_order;
    }

    await this.itemRepo.save(item);
    campaign.updated_by_user_id = input.actorUserId;
    await this.campaignRepo.save(campaign);

    return (await this.serializeItemDetail(input.organizationId, item)) as unknown as Record<string, unknown>;
  }

  async deleteCampaignItem(input: {
    organizationId: string;
    actorUserId: string;
    campaignId: string;
    itemId: string;
  }): Promise<{ deleted: boolean }> {
    const campaign = await this.requireCampaign(input.organizationId, input.campaignId.trim());
    this.assertCampaignMutable(campaign);

    const item = await this.requireItem(input.organizationId, campaign.id, input.itemId.trim());

    if (item.draft_id) {
      apiError(400, "marketing_campaign_item_has_draft", "Detach the draft before deleting this slot.");
    }

    await this.itemRepo.remove(item);
    campaign.updated_by_user_id = input.actorUserId;
    await this.campaignRepo.save(campaign);

    return { deleted: true };
  }

  async createDraftForCampaignItem(input: {
    organizationId: string;
    actorUserId: string;
    campaignId: string;
    itemId: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const campaign = await this.requireCampaign(input.organizationId, input.campaignId.trim());
    this.assertCampaignMutable(campaign);

    const item = await this.requireItem(input.organizationId, campaign.id, input.itemId.trim());

    if (item.draft_id) {
      apiError(400, "marketing_campaign_item_draft_exists", "This slot already has a draft.");
    }

    const applySuggested =
      input.body.apply_suggested_schedule === true || input.body.apply_suggested_schedule === "true";

    const titleOverride =
      typeof input.body.title === "string" && input.body.title.trim().length
        ? input.body.title.trim().slice(0, 255)
        : item.label;

    const notesOverride =
      typeof input.body.notes === "string" ? input.body.notes.trim().slice(0, 8000) || null : item.plan_notes;

    const intentSlice = campaign.campaign_kind.slice(0, 64);

    let draftIdResult = "";

    await this.dataSource.transaction(async (manager) => {
      const draftId = await this.contentService.createDraftWithManager(manager, input.organizationId, input.actorUserId, {
        title: titleOverride,
        intent: intentSlice,
        notes: notesOverride ?? "",
      });

      draftIdResult = draftId;

      if (applySuggested && item.suggested_scheduled_at) {
        await manager.update(
          MarketingContentDraftEntity,
          { id: draftId, organization_id: input.organizationId },
          { scheduled_at: item.suggested_scheduled_at },
        );
      }

      const iRepo = manager.getRepository(MarketingCampaignItemEntity);
      await iRepo.update(
        { id: item.id, organization_id: input.organizationId },
        { draft_id: draftId },
      );

      await this.maybeActivateCampaign(manager, campaign.id, input.organizationId);
    });

    campaign.updated_by_user_id = input.actorUserId;
    await this.campaignRepo.save(campaign);

    return this.contentService.getDraftDetail(input.organizationId, draftIdResult);
  }

  async bulkCreateDraftsForEmptySlots(input: {
    organizationId: string;
    actorUserId: string;
    campaignId: string;
    body: Record<string, unknown>;
  }): Promise<{ created: number; drafts: Record<string, unknown>[] }> {
    const campaign = await this.requireCampaign(input.organizationId, input.campaignId.trim());
    this.assertCampaignMutable(campaign);

    const applySuggested =
      input.body.apply_suggested_schedule === true || input.body.apply_suggested_schedule === "true";

    const items = await this.itemRepo.find({
      where: { organization_id: input.organizationId, campaign_id: campaign.id },
      order: { sort_order: "ASC", created_at: "ASC" },
    });

    const drafts: Record<string, unknown>[] = [];
    let created = 0;

    for (const item of items) {
      if (item.draft_id) {
        continue;
      }

      const detail = await this.createDraftForCampaignItem({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        campaignId: campaign.id,
        itemId: item.id,
        body: { apply_suggested_schedule: applySuggested },
      });

      drafts.push(detail);
      created += 1;
    }

    return { created, drafts };
  }

  async attachDraftToCampaignItem(input: {
    organizationId: string;
    actorUserId: string;
    campaignId: string;
    itemId: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const campaign = await this.requireCampaign(input.organizationId, input.campaignId.trim());
    this.assertCampaignMutable(campaign);

    const item = await this.requireItem(input.organizationId, campaign.id, input.itemId.trim());

    if (item.draft_id) {
      apiError(400, "marketing_campaign_item_draft_exists", "This slot already has a draft.");
    }

    const draftIdRaw = input.body.draft_id;
    if (typeof draftIdRaw !== "string" || !draftIdRaw.trim()) {
      apiError(400, "marketing_campaign_draft_id_required", "draft_id is required.");
    }

    const draftId = draftIdRaw.trim();

    const draft = await this.draftRepo.findOne({
      where: { organization_id: input.organizationId, id: draftId },
    });

    if (!draft) {
      apiError(404, "marketing_draft_missing", "Draft not found.");
    }

    const conflict = await this.itemRepo.findOne({
      where: { organization_id: input.organizationId, draft_id: draftId },
    });

    if (conflict) {
      apiError(400, "marketing_campaign_draft_already_linked", "That draft is already linked to a campaign item.");
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        MarketingCampaignItemEntity,
        { id: item.id, organization_id: input.organizationId },
        { draft_id: draftId },
      );

      await this.maybeActivateCampaign(manager, campaign.id, input.organizationId);
    });

    item.draft_id = draftId;
    campaign.updated_by_user_id = input.actorUserId;
    await this.campaignRepo.save(campaign);

    return (await this.serializeItemDetail(input.organizationId, item)) as unknown as Record<string, unknown>;
  }

  async detachDraftFromCampaignItem(input: {
    organizationId: string;
    actorUserId: string;
    campaignId: string;
    itemId: string;
  }): Promise<Record<string, unknown>> {
    const campaign = await this.requireCampaign(input.organizationId, input.campaignId.trim());

    const item = await this.requireItem(input.organizationId, campaign.id, input.itemId.trim());

    if (!item.draft_id) {
      apiError(400, "marketing_campaign_item_no_draft", "This slot has no linked draft.");
    }

    await this.itemRepo.update(
      { id: item.id, organization_id: input.organizationId },
      { draft_id: null },
    );

    item.draft_id = null;
    campaign.updated_by_user_id = input.actorUserId;
    await this.campaignRepo.save(campaign);

    return (await this.serializeItemDetail(input.organizationId, item)) as unknown as Record<string, unknown>;
  }

  private assertCampaignMutable(campaign: MarketingCampaignEntity): void {
    if (campaign.status === "archived" || campaign.status === "cancelled" || campaign.status === "completed") {
      apiError(400, "marketing_campaign_locked", "This campaign cannot be edited.");
    }
  }

  private async maybeActivateCampaign(
    manager: import("typeorm").EntityManager,
    campaignId: string,
    organizationId: string,
  ): Promise<void> {
    const cRepo = manager.getRepository(MarketingCampaignEntity);
    const row = await cRepo.findOne({ where: { id: campaignId, organization_id: organizationId } });

    if (!row || row.status !== "draft_planning") {
      return;
    }

    const qb = manager
      .getRepository(MarketingCampaignItemEntity)
      .createQueryBuilder("i")
      .where("i.organization_id = :organizationId", { organizationId })
      .andWhere("i.campaign_id = :campaignId", { campaignId })
      .andWhere("i.draft_id IS NOT NULL");

    const withDraft = await qb.getCount();

    if (withDraft > 0) {
      row.status = "active";
      await cRepo.save(row);
    }
  }

  private async requireCampaign(
    organizationId: string,
    campaignId: string,
  ): Promise<MarketingCampaignEntity> {
    const row = await this.campaignRepo.findOne({
      where: { organization_id: organizationId, id: campaignId },
    });

    if (!row) {
      apiError(404, "marketing_campaign_missing", "Campaign not found.");
    }

    return row;
  }

  private async requireItem(
    organizationId: string,
    campaignId: string,
    itemId: string,
  ): Promise<MarketingCampaignItemEntity> {
    const row = await this.itemRepo.findOne({
      where: { organization_id: organizationId, campaign_id: campaignId, id: itemId },
    });

    if (!row) {
      apiError(404, "marketing_campaign_item_missing", "Campaign item not found.");
    }

    return row;
  }

  private serializeCampaignSummary(row: MarketingCampaignEntity): Record<string, unknown> {
    let channelIntent: unknown = [];
    if (row.channel_intent_json) {
      try {
        channelIntent = JSON.parse(row.channel_intent_json) as unknown;
      } catch {
        channelIntent = [];
      }
    }

    return {
      id: row.id,
      organization_id: row.organization_id,
      campaign_kind: row.campaign_kind,
      title: row.title,
      objective_summary: row.objective_summary,
      primary_service_topic: row.primary_service_topic,
      geo_label: row.geo_label,
      geo_normalized: row.geo_normalized,
      channel_intent: channelIntent,
      window_starts_at: row.window_starts_at.toISOString(),
      window_ends_at: row.window_ends_at.toISOString(),
      status: row.status,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  private async serializeItemDetail(
    organizationId: string,
    row: MarketingCampaignItemEntity,
  ): Promise<Record<string, unknown>> {
    let intended_platform_keys: unknown = [];
    if (row.intended_platform_keys_json) {
      try {
        intended_platform_keys = JSON.parse(row.intended_platform_keys_json) as unknown;
      } catch {
        intended_platform_keys = [];
      }
    }

    const base: Record<string, unknown> = {
      id: row.id,
      organization_id: row.organization_id,
      campaign_id: row.campaign_id,
      sort_order: row.sort_order,
      slot_key: row.slot_key,
      label: row.label,
      plan_notes: row.plan_notes,
      suggested_scheduled_at: row.suggested_scheduled_at?.toISOString() ?? null,
      intended_platform_keys,
      draft_id: row.draft_id,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };

    if (!row.draft_id) {
      base.draft = null;
      return base;
    }

    const draft = await this.draftRepo.findOne({
      where: { organization_id: organizationId, id: row.draft_id },
    });

    if (!draft) {
      base.draft = null;
      return base;
    }

    const jobs = await this.publishJobRepo.find({
      where: { organization_id: organizationId, draft_id: draft.id },
      order: { created_at: "DESC" },
      take: 3,
    });

    base.draft = {
      id: draft.id,
      title: draft.title,
      workflow_state: draft.workflow_state,
      scheduled_at: draft.scheduled_at?.toISOString() ?? null,
      updated_at: draft.updated_at.toISOString(),
      publish_jobs: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        scheduled_at: j.scheduled_at.toISOString(),
        publish_intent: j.publish_intent,
      })),
    };

    return base;
  }
}
