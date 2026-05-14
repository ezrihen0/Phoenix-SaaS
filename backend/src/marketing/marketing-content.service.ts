import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, Repository } from "typeorm";
import { randomUUID } from "crypto";

import { apiError } from "../common/api-response";
import { MarketingContentDraftEntity } from "../database/entities/marketing-content-draft.entity";
import { MarketingContentVariantEntity } from "../database/entities/marketing-content-variant.entity";
import type { MarketingWorkflowState } from "../database/entities/marketing-content-draft.entity";
import {
  MARKETING_PLATFORM_KEYS,
  MARKETING_WORKFLOW_STATES,
  type MarketingPlatformKey,
} from "./marketing.constants";

const DEFAULT_VARIANT_BODY = {
  headline: "",
  primary_text: "",
  cta: "",
  hashtags: "",
  alt_text: "",
} as const;

function stringifyBody(body: Record<string, string>) {
  return JSON.stringify(body);
}

function normalizeBody(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = { ...DEFAULT_VARIANT_BODY };
  for (const key of Object.keys(DEFAULT_VARIANT_BODY) as Array<keyof typeof DEFAULT_VARIANT_BODY>) {
    const raw = input[key];
    if (typeof raw === "string") {
      if (raw.length > 16000) {
        apiError(400, "marketing_variant_body_too_large", `${key} exceeds maximum allowed length.`);
      }
      out[key] = raw;
    }
  }
  return out;
}

function decodeBodyJson(json: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = {};
  }

  return normalizeBody(
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {},
  );
}

function coerceIntent(raw: unknown): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }

  if (typeof raw !== "string") {
    apiError(400, "marketing_draft_field_invalid", "intent must be a string.");
  }

  const value = raw.trim().slice(0, 128);
  return value.length ? value : null;
}

function coerceTitle(raw: unknown): string | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (typeof raw !== "string") {
    apiError(400, "marketing_draft_field_invalid", "title must be a string.");
  }

  return raw.trim().slice(0, 255);
}

function coerceNotes(raw: unknown): string | null | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (raw === null) {
    return null;
  }

  if (typeof raw !== "string") {
    apiError(400, "marketing_draft_field_invalid", "notes must be a string.");
  }

  const value = raw.trim();
  return value.length ? value.slice(0, 32000) : null;
}

function parseScheduledAt(raw: unknown): Date | null | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (raw === null) {
    return null;
  }

  if (typeof raw !== "string" || !raw.trim()) {
    apiError(400, "marketing_schedule_invalid", "scheduled_at must be an ISO8601 string or null.");
  }

  const date = new Date(raw);
  if (Number.isNaN(date.valueOf())) {
    apiError(400, "marketing_schedule_invalid", "scheduled_at is not a valid date.");
  }

  return date;
}

function serializeDraft(entity: MarketingContentDraftEntity) {
  return {
    id: entity.id,
    organization_id: entity.organization_id,
    title: entity.title,
    intent: entity.intent,
    notes: entity.notes ?? null,
    workflow_state: entity.workflow_state,
    scheduled_at: entity.scheduled_at ? entity.scheduled_at.toISOString() : null,
    created_at: entity.created_at.toISOString(),
    updated_at: entity.updated_at.toISOString(),
    created_by_user_id: entity.created_by_user_id,
    updated_by_user_id: entity.updated_by_user_id,
  };
}

function serializeVariant(entity: MarketingContentVariantEntity) {
  return {
    id: entity.id,
    draft_id: entity.draft_id,
    organization_id: entity.organization_id,
    platform_key: entity.platform_key,
    body: decodeBodyJson(entity.body_json),
    created_at: entity.created_at.toISOString(),
    updated_at: entity.updated_at.toISOString(),
  };
}

/** Carve-out: approved drafts retain approval when PATCH only adjusts scheduled_at metadata. */
function isScheduledAtOnlyPatch(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body).filter((key) => body[key] !== undefined);
  return keys.length === 1 && keys[0] === "scheduled_at";
}

function assertTripleVariants(rows: MarketingContentVariantEntity[]) {
  const keys = new Set(rows.map((row) => row.platform_key));
  for (const key of MARKETING_PLATFORM_KEYS as readonly MarketingPlatformKey[]) {
    if (!keys.has(key)) {
      apiError(500, "marketing_variant_seed_corrupt", "Draft is missing seeded platform variants.");
    }
  }
}

function groupDraftsByDay(
  drafts: ReturnType<typeof serializeDraft>[],
): Array<{ date: string; drafts: ReturnType<typeof serializeDraft>[] }> {
  const buckets = new Map<string, ReturnType<typeof serializeDraft>[]>();
  drafts.forEach((draft) => {
    if (!draft.scheduled_at) {
      return;
    }

    const dayKey = draft.scheduled_at.slice(0, 10);
    const list = buckets.get(dayKey);
    if (list) {
      list.push(draft);
    } else {
      buckets.set(dayKey, [draft]);
    }
  });

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, bucketDrafts]) => ({ date, drafts: bucketDrafts }));
}

@Injectable()
export class MarketingContentService {
  constructor(
    @InjectRepository(MarketingContentDraftEntity)
    private readonly draftsRepository: Repository<MarketingContentDraftEntity>,
    @InjectRepository(MarketingContentVariantEntity)
    private readonly variantsRepository: Repository<MarketingContentVariantEntity>,
  ) {}

  async getOrgDraftCounts(organizationId: string): Promise<{ draft: number; needs_review: number; approved: number }> {
    const qb = this.draftsRepository
      .createQueryBuilder("d")
      .select("d.workflow_state", "state")
      .addSelect("COUNT(*)", "count")
      .where("d.organization_id = :organizationId", { organizationId })
      .groupBy("d.workflow_state");

    const rows = await qb.getRawMany<{ state: MarketingWorkflowState; count: string }>();
    const countMap = Object.fromEntries(MARKETING_WORKFLOW_STATES.map((state) => [state, 0])) as Record<
      MarketingWorkflowState,
      number
    >;

    for (const row of rows) {
      countMap[row.state as MarketingWorkflowState] = Number.parseInt(row.count, 10) || 0;
    }

    return {
      draft: countMap.draft,
      needs_review: countMap.needs_review,
      approved: countMap.approved,
    };
  }

  async countScheduledSoon(organizationId: string): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 14);

    return this.draftsRepository.count({
      where: {
        organization_id: organizationId,
        scheduled_at: Between(start, end),
      },
    });
  }

  async recentDraftSnapshots(organizationId: string, take: number): Promise<ReturnType<typeof serializeDraft>[]> {
    const rows = await this.draftsRepository.find({
      where: { organization_id: organizationId },
      order: { updated_at: "DESC" },
      take,
    });
    return rows.map((row) => serializeDraft(row));
  }

  async listDrafts(
    organizationId: string,
    query: {
      workflow_state?: string;
      limit: number;
      offset: number;
    },
  ) {
    const limit = Math.min(Math.max(query.limit, 1), 100);
    const offset = Math.max(query.offset, 0);

    const qb = this.draftsRepository
      .createQueryBuilder("d")
      .where("d.organization_id = :organizationId", { organizationId })
      .orderBy("d.updated_at", "DESC")
      .skip(offset)
      .take(limit);

    if (
      typeof query.workflow_state === "string"
      && MARKETING_WORKFLOW_STATES.includes(query.workflow_state as MarketingWorkflowState)
    ) {
      qb.andWhere("d.workflow_state = :workflowState", { workflowState: query.workflow_state });
    }

    const [draftRows, total] = await qb.getManyAndCount();

    return {
      drafts: draftRows.map((row) => serializeDraft(row)),
      total,
      limit,
      offset,
    };
  }

  async getDraftDetail(organizationId: string, draftId: string) {
    const draft = await this.draftsRepository.findOne({
      where: { organization_id: organizationId, id: draftId },
    });

    if (!draft) {
      apiError(404, "marketing_draft_missing", "Draft not found.");
    }

    const variants = await this.variantsRepository.find({
      where: { organization_id: organizationId, draft_id: draftId },
      order: { platform_key: "ASC" },
    });

    assertTripleVariants(variants);
    return {
      draft: serializeDraft(draft),
      variants: variants.map((variant) => serializeVariant(variant)),
    };
  }

  async createDraft(organizationId: string, actorUserId: string, body: Record<string, unknown>) {
    const draftId = randomUUID();
    const draft = this.draftsRepository.create({
      id: draftId,
      organization_id: organizationId,
      created_by_user_id: actorUserId,
      updated_by_user_id: actorUserId,
      title: coerceTitle(body.title ?? "") ?? "",
      intent: coerceIntent(body.intent),
      notes: coerceNotes(body.notes) ?? null,
      workflow_state: "draft",
      scheduled_at: null,
    });

    await this.draftsRepository.save(draft);

    const variants = MARKETING_PLATFORM_KEYS.map((platform) =>
      this.variantsRepository.create({
        id: randomUUID(),
        organization_id: organizationId,
        draft_id: draftId,
        platform_key: platform,
        body_json: stringifyBody({ ...DEFAULT_VARIANT_BODY }),
      }),
    );

    await this.variantsRepository.save(variants);
    await this.ensureTripleVariantsInvariant(organizationId, draftId);
    return this.getDraftDetail(organizationId, draftId);
  }

  async patchDraft(organizationId: string, actorUserId: string, draftId: string, body: Record<string, unknown>) {
    const draft = await this.draftsRepository.findOne({
      where: { organization_id: organizationId, id: draftId },
    });

    if (!draft) {
      apiError(404, "marketing_draft_missing", "Draft not found.");
    }

    const approvedScheduleOnlyCarveOut = draft.workflow_state === "approved" && isScheduledAtOnlyPatch(body);

    if (
      !approvedScheduleOnlyCarveOut
      && (draft.workflow_state === "needs_review" || draft.workflow_state === "approved")
    ) {
      draft.workflow_state = "draft";
    }

    if (body.scheduled_at !== undefined) {
      draft.scheduled_at = parseScheduledAt(body.scheduled_at) ?? null;
    }

    if (body.title !== undefined) {
      const nextTitle = coerceTitle(body.title);
      draft.title = nextTitle ?? "";
    }

    if (body.intent !== undefined) {
      draft.intent = coerceIntent(body.intent);
    }

    if (body.notes !== undefined) {
      draft.notes = coerceNotes(body.notes) ?? null;
    }

    draft.updated_by_user_id = actorUserId;
    await this.draftsRepository.save(draft);
    return this.getDraftDetail(organizationId, draftId);
  }

  async patchVariant(
    organizationId: string,
    actorUserId: string,
    draftId: string,
    variantId: string,
    body: Record<string, unknown>,
  ) {
    const draft = await this.draftsRepository.findOne({
      where: { organization_id: organizationId, id: draftId },
    });

    if (!draft) {
      apiError(404, "marketing_draft_missing", "Draft not found.");
    }

    const variant = await this.variantsRepository.findOne({
      where: {
        organization_id: organizationId,
        draft_id: draftId,
        id: variantId,
      },
    });

    if (!variant) {
      apiError(404, "marketing_variant_missing", "Variant not found.");
    }

    const rawBody = body.body;
    if (rawBody === undefined || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      apiError(400, "marketing_variant_body_missing", 'Provide JSON object body under key "body".');
    }

    if (draft.workflow_state === "needs_review" || draft.workflow_state === "approved") {
      draft.workflow_state = "draft";
    }

    variant.body_json = stringifyBody(normalizeBody(rawBody as Record<string, unknown>));
    await this.variantsRepository.save(variant);

    draft.updated_by_user_id = actorUserId;
    await this.draftsRepository.save(draft);

    await this.ensureTripleVariantsInvariant(organizationId, draftId);

    return this.getDraftDetail(organizationId, draftId);
  }

  async transition(organizationId: string, actorUserId: string, draftId: string, actionRaw: unknown) {
    const action =
      typeof actionRaw === "string"
        ? actionRaw.trim().toLowerCase()
        : null;

    if (!action || !["submit_for_review", "approve", "request_changes"].includes(action)) {
      apiError(400, "marketing_transition_invalid", "Provide action submit_for_review, approve, or request_changes.");
    }

    const draft = await this.draftsRepository.findOne({
      where: { organization_id: organizationId, id: draftId },
    });

    if (!draft) {
      apiError(404, "marketing_draft_missing", "Draft not found.");
    }

    if (action === "submit_for_review") {
      if (draft.workflow_state !== "draft") {
        apiError(400, "marketing_transition_blocked", "Only drafts can move to review.");
      }
      draft.workflow_state = "needs_review";
    } else if (action === "approve") {
      if (draft.workflow_state !== "needs_review") {
        apiError(400, "marketing_transition_blocked", "Approve is only allowed from needs_review.");
      }
      draft.workflow_state = "approved";
    } else if (action === "request_changes") {
      if (draft.workflow_state !== "needs_review") {
        apiError(400, "marketing_transition_blocked", "Request changes applies only during review.");
      }
      draft.workflow_state = "draft";
    }

    draft.updated_by_user_id = actorUserId;
    await this.draftsRepository.save(draft);

    await this.ensureTripleVariantsInvariant(organizationId, draftId);
    return this.getDraftDetail(organizationId, draftId);
  }

  async getCalendar(organizationId: string, range: { start: Date; end: Date }) {
    const drafts = await this.draftsRepository.find({
      where: {
        organization_id: organizationId,
        scheduled_at: Between(range.start, range.end),
      },
      order: { scheduled_at: "ASC", updated_at: "DESC" },
    });

    const days = groupDraftsByDay(drafts.map((d) => serializeDraft(d)));

    return {
      range: {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      days,
    };
  }

  private async ensureTripleVariantsInvariant(organizationId: string, draftId: string) {
    const variants = await this.variantsRepository.find({
      where: { organization_id: organizationId, draft_id: draftId },
    });

    assertTripleVariants(variants);
  }
}
