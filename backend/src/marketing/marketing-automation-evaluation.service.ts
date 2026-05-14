import { createHash, randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { MarketingAutomationRunEntity } from "../database/entities/marketing-automation-run.entity";
import { MarketingAutomationRuleEntity } from "../database/entities/marketing-automation-rule.entity";
import { MarketingOpportunityEntity } from "../database/entities/marketing-opportunity.entity";
import { MarketingContentService } from "./marketing-content.service";
import {
  isMarketingAutomationActionType,
  isMarketingAutomationOpportunityType,
  MARKETING_AUTOMATION_ACTION_TYPES,
  MARKETING_AUTOMATION_OPPORTUNITY_TYPES,
  type MarketingAutomationRunOutcomeKey,
} from "./marketing-automation.constants";

type DryEvaluationResult = {
  would_evaluate: boolean;
  outcome?: MarketingAutomationRunOutcomeKey;
  skip_reason?: string | null;
  idempotency_key?: string;
};

@Injectable()
export class MarketingAutomationEvaluationService {
  constructor(
    @InjectRepository(MarketingAutomationRuleEntity)
    private readonly ruleRepo: Repository<MarketingAutomationRuleEntity>,
    @InjectRepository(MarketingAutomationRunEntity)
    private readonly runRepo: Repository<MarketingAutomationRunEntity>,
    @InjectRepository(MarketingOpportunityEntity)
    private readonly opportunityRepo: Repository<MarketingOpportunityEntity>,
    private readonly contentService: MarketingContentService,
    private readonly dataSource: DataSource,
  ) {}

  async evaluateAfterUpsert(
    organizationId: string,
    opportunity: MarketingOpportunityEntity,
    actorUserId: string,
  ): Promise<void> {
    if (opportunity.organization_id !== organizationId) {
      return;
    }

    if (opportunity.status !== "suggested" && opportunity.status !== "detected") {
      return;
    }

    const rules = await this.ruleRepo.find({
      where: { organization_id: organizationId, enabled: true },
      order: { updated_at: "ASC" },
    });

    for (const rule of rules) {
      try {
        await this.applyRule(rule, opportunity, actorUserId, { persist: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown automation error";
        await this.tryRecordErrorRun(rule, opportunity, actorUserId, message);
      }
    }
  }

  async previewRule(
    organizationId: string,
    ruleId: string,
    opportunityId: string,
  ): Promise<DryEvaluationResult & { rule_name?: string }> {
    const rule = await this.ruleRepo.findOne({
      where: { id: ruleId.trim(), organization_id: organizationId },
    });

    if (!rule) {
      apiError(404, "marketing_automation_rule_missing", "Automation rule not found.");
    }

    const opportunity = await this.opportunityRepo.findOne({
      where: { id: opportunityId.trim(), organization_id: organizationId },
    });

    if (!opportunity) {
      apiError(404, "marketing_opportunity_missing", "Opportunity not found.");
    }

    const dry = await this.applyRule(rule, opportunity, undefined, {
      persist: false,
      dryRunUserId: "preview",
    });

    return {
      ...dry,
      rule_name: rule.name,
    };
  }

  private async applyRule(
    rule: MarketingAutomationRuleEntity,
    opportunity: MarketingOpportunityEntity,
    actorUserId: string | undefined,
    options: { persist: boolean; dryRunUserId?: string },
  ): Promise<DryEvaluationResult> {
    if (!this.ruleTriggersForOpportunityType(rule, opportunity.opportunity_type)) {
      return { would_evaluate: false };
    }

    const idempotencyKey = this.buildIdempotencyKey(
      rule.id,
      opportunity.organization_id,
      opportunity.dedupe_key,
      opportunity.signal_version,
    );

    const existing = await this.runRepo.findOne({
      where: { organization_id: opportunity.organization_id, idempotency_key: idempotencyKey },
    });

    if (existing) {
      return {
        would_evaluate: true,
        outcome: existing.outcome,
        skip_reason: "already_executed",
        idempotency_key: idempotencyKey,
      };
    }

    if (!rule.enabled) {
      return {
        would_evaluate: false,
      };
    }

    const cooldownSeconds = Math.max(0, rule.cooldown_seconds ?? 0);
    if (cooldownSeconds > 0) {
      const lastSuccess = await this.runRepo.findOne({
        where: {
          organization_id: opportunity.organization_id,
          rule_id: rule.id,
          outcome: In(["matched", "draft_created"]),
        },
        order: { created_at: "DESC" },
      });

      if (lastSuccess) {
        const elapsedMs = Date.now() - lastSuccess.created_at.getTime();
        if (elapsedMs < cooldownSeconds * 1000) {
          return {
            would_evaluate: true,
            outcome: "skipped",
            skip_reason: "cooldown_active",
            idempotency_key: idempotencyKey,
          };
        }
      }
    }

    if (options.persist === false) {
      if (rule.action_type === "suggest_only") {
        return {
          would_evaluate: true,
          outcome: "matched",
          idempotency_key: idempotencyKey,
        };
      }

      return {
        would_evaluate: true,
        outcome: "draft_created",
        idempotency_key: idempotencyKey,
        skip_reason: null,
      };
    }

    const effectiveActor = actorUserId ?? options.dryRunUserId;
    if (!effectiveActor) {
      return { would_evaluate: false };
    }

    if (rule.action_type === "suggest_only") {
      await this.persistMatched(rule, opportunity, idempotencyKey);
      return {
        would_evaluate: true,
        outcome: "matched",
        idempotency_key: idempotencyKey,
      };
    }

    if (rule.action_type === "auto_create_draft") {
      const { title, intent, notes } = this.buildDraftSeed(rule, opportunity);

      let draftId = "";
      await this.dataSource.transaction(async (manager) => {
        draftId = await this.contentService.createDraftWithManager(
          manager,
          opportunity.organization_id,
          effectiveActor,
          {
            title,
            intent,
            notes: notes ?? "",
          },
        );

        const runRepo = manager.getRepository(MarketingAutomationRunEntity);
        await runRepo.save(
          runRepo.create({
            id: randomUUID(),
            organization_id: opportunity.organization_id,
            rule_id: rule.id,
            idempotency_key: idempotencyKey,
            marketing_opportunity_id: opportunity.id,
            marketing_content_draft_id: draftId,
            outcome: "draft_created",
            skip_reason: null,
            error_detail: null,
            trigger_snapshot_json: this.buildSnapshotJson(opportunity),
          }),
        );
      });

      return {
        would_evaluate: true,
        outcome: "draft_created",
        idempotency_key: idempotencyKey,
      };
    }

    return { would_evaluate: false };
  }

  private async tryRecordErrorRun(
    rule: MarketingAutomationRuleEntity,
    opportunity: MarketingOpportunityEntity,
    actorUserId: string,
    message: string,
  ): Promise<void> {
    const idempotencyKey = this.buildIdempotencyKey(
      rule.id,
      opportunity.organization_id,
      opportunity.dedupe_key,
      opportunity.signal_version,
    );

    try {
      await this.runRepo.save(
        this.runRepo.create({
          id: randomUUID(),
          organization_id: opportunity.organization_id,
          rule_id: rule.id,
          idempotency_key: idempotencyKey,
          marketing_opportunity_id: opportunity.id,
          marketing_content_draft_id: null,
          outcome: "error",
          skip_reason: null,
          error_detail: message.slice(0, 8000),
          trigger_snapshot_json: this.buildSnapshotJson(opportunity),
        }),
      );
    } catch {
      // Swallow secondary failures — primary error already lost visibility without logging infra here.
    }
  }

  private async persistMatched(
    rule: MarketingAutomationRuleEntity,
    opportunity: MarketingOpportunityEntity,
    idempotencyKey: string,
  ): Promise<void> {
    await this.runRepo.save(
      this.runRepo.create({
        id: randomUUID(),
        organization_id: opportunity.organization_id,
        rule_id: rule.id,
        idempotency_key: idempotencyKey,
        marketing_opportunity_id: opportunity.id,
        marketing_content_draft_id: null,
        outcome: "matched",
        skip_reason: null,
        error_detail: null,
        trigger_snapshot_json: this.buildSnapshotJson(opportunity),
      }),
    );
  }

  private ruleTriggersForOpportunityType(rule: MarketingAutomationRuleEntity, opportunityType: string): boolean {
    let types: string[] = [];

    try {
      const parsed = JSON.parse(rule.trigger_opportunity_types_json) as unknown;
      if (Array.isArray(parsed)) {
        types = parsed.filter((t): t is string => typeof t === "string");
      }
    } catch {
      return false;
    }

    for (const t of types) {
      if (!isMarketingAutomationOpportunityType(t)) {
        continue;
      }

      if (t === opportunityType) {
        return true;
      }
    }

    return false;
  }

  buildIdempotencyKey(
    ruleId: string,
    organizationId: string,
    dedupeKey: string,
    signalVersion: number,
  ): string {
    const raw = `${ruleId}:${organizationId}:${dedupeKey}:${signalVersion}`;
    return createHash("sha256").update(raw, "utf8").digest("hex");
  }

  private buildDraftSeed(rule: MarketingAutomationRuleEntity, opportunity: MarketingOpportunityEntity): {
    title: string;
    intent: string;
    notes: string | null;
  } {
    let cfg: Record<string, unknown> = {};

    try {
      const parsed = JSON.parse(rule.action_config_json) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        cfg = parsed as Record<string, unknown>;
      }
    } catch {
      cfg = {};
    }

    const prefix =
      typeof cfg.title_prefix === "string" && cfg.title_prefix.trim().length
        ? cfg.title_prefix.trim().slice(0, 255)
        : "";

    const titleBase = typeof opportunity.title === "string" ? opportunity.title.trim() : "Marketing draft";
    const title = `${prefix}${titleBase}`.trim().slice(0, 255) || "Marketing draft";

    const intentRaw =
      typeof cfg.intent_override === "string" && cfg.intent_override.trim().length
        ? cfg.intent_override.trim().slice(0, 64)
        : opportunity.opportunity_type.trim().slice(0, 64);

    let notes: string | null =
      typeof cfg.notes_template === "string" && cfg.notes_template.trim().length
        ? cfg.notes_template.trim().slice(0, 8000)
        : (opportunity.summary ?? "").trim().slice(0, 8000) || "";

    notes = notes || null;

    return { title, intent: intentRaw, notes };
  }

  private buildSnapshotJson(opportunity: MarketingOpportunityEntity): string {
    const snapshot = {
      opportunity_id: opportunity.id,
      opportunity_type: opportunity.opportunity_type,
      dedupe_key: opportunity.dedupe_key,
      signal_version: opportunity.signal_version,
      status: opportunity.status,
      title: opportunity.title,
    };

    return JSON.stringify(snapshot);
  }

  parseAndValidateTriggerTypesJson(raw: string): string[] {
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      apiError(400, "marketing_automation_trigger_invalid", "trigger_opportunity_types must be JSON array.");
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      apiError(
        400,
        "marketing_automation_trigger_invalid",
        "trigger_opportunity_types must be a non-empty JSON array.",
      );
    }

    const out = new Set<string>();

    for (const entry of parsed) {
      if (typeof entry !== "string") {
        continue;
      }

      const t = entry.trim();
      if (isMarketingAutomationOpportunityType(t)) {
        out.add(t);
      }
    }

    if (out.size === 0) {
      apiError(
        400,
        "marketing_automation_trigger_invalid",
        `Each entry must be one of: ${MARKETING_AUTOMATION_OPPORTUNITY_TYPES.join(", ")}.`,
      );
    }

    return [...out];
  }

  normalizeActionConfigJson(raw: string): string {
    if (!raw.trim().length) {
      return "{}";
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        apiError(400, "marketing_automation_action_config_invalid", "action_config_json must be a JSON object.");
      }

      return JSON.stringify(parsed);
    } catch {
      apiError(400, "marketing_automation_action_config_invalid", "action_config_json must be valid JSON object.");
    }
  }

  assertActionType(raw: string): void {
    if (!isMarketingAutomationActionType(raw)) {
      apiError(
        400,
        "marketing_automation_action_invalid",
        `action_type must be one of: ${MARKETING_AUTOMATION_ACTION_TYPES.join(", ")}.`,
      );
    }
  }
}
