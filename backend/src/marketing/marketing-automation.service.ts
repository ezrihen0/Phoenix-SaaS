import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { MarketingAutomationRunEntity } from "../database/entities/marketing-automation-run.entity";
import { MarketingAutomationRuleEntity } from "../database/entities/marketing-automation-rule.entity";
import { MarketingAutomationEvaluationService } from "./marketing-automation-evaluation.service";

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

@Injectable()
export class MarketingAutomationService {
  constructor(
    @InjectRepository(MarketingAutomationRuleEntity)
    private readonly ruleRepo: Repository<MarketingAutomationRuleEntity>,
    @InjectRepository(MarketingAutomationRunEntity)
    private readonly runRepo: Repository<MarketingAutomationRunEntity>,
    private readonly evaluationService: MarketingAutomationEvaluationService,
  ) {}

  async listRules(organizationId: string): Promise<{ rules: Record<string, unknown>[] }> {
    const rows = await this.ruleRepo.find({
      where: { organization_id: organizationId },
      order: { updated_at: "DESC" },
    });

    return { rules: rows.map((r) => this.serializeRule(r)) };
  }

  async getRule(organizationId: string, ruleId: string): Promise<{ rule: Record<string, unknown> }> {
    const row = await this.requireRule(organizationId, ruleId);
    return { rule: this.serializeRule(row) };
  }

  async createRule(
    organizationId: string,
    actorUserId: string,
    body: Record<string, unknown>,
  ): Promise<{ rule: Record<string, unknown> }> {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 255) : "";
    if (!name.length) {
      apiError(400, "marketing_automation_name_required", "name is required.");
    }

    const triggerRaw =
      typeof body.trigger_opportunity_types === "string"
        ? body.trigger_opportunity_types
        : JSON.stringify(body.trigger_opportunity_types ?? []);

    const types = this.evaluationService.parseAndValidateTriggerTypesJson(triggerRaw);

    const actionRaw = typeof body.action_type === "string" ? body.action_type.trim() : "";
    this.evaluationService.assertActionType(actionRaw);

    const actionConfigSource =
      typeof body.action_config === "object" && body.action_config !== null && !Array.isArray(body.action_config)
        ? JSON.stringify(body.action_config)
        : typeof body.action_config_json === "string"
          ? body.action_config_json
          : "{}";

    const actionConfigJson = this.evaluationService.normalizeActionConfigJson(actionConfigSource);

    const enabled = !(body.enabled === false || body.enabled === "false");

    const cooldownRaw = body.cooldown_seconds;
    let cooldownSeconds = 0;
    if (typeof cooldownRaw === "number" && Number.isFinite(cooldownRaw)) {
      cooldownSeconds = Math.max(0, Math.floor(cooldownRaw));
    } else if (typeof cooldownRaw === "string" && cooldownRaw.trim()) {
      const n = Number.parseInt(cooldownRaw, 10);
      cooldownSeconds = Number.isFinite(n) ? Math.max(0, n) : 0;
    }

    const description =
      typeof body.description === "string" ? body.description.trim().slice(0, 4000) || null : null;

    const row = this.ruleRepo.create({
      id: randomUUID(),
      organization_id: organizationId,
      name,
      description,
      enabled,
      trigger_opportunity_types_json: JSON.stringify(types),
      action_type: actionRaw as MarketingAutomationRuleEntity["action_type"],
      action_config_json: actionConfigJson,
      cooldown_seconds: cooldownSeconds,
      created_by_user_id: actorUserId,
      updated_by_user_id: actorUserId,
    });

    await this.ruleRepo.save(row);
    return { rule: this.serializeRule(row) };
  }

  async updateRule(
    organizationId: string,
    ruleId: string,
    actorUserId: string,
    body: Record<string, unknown>,
  ): Promise<{ rule: Record<string, unknown> }> {
    const row = await this.requireRule(organizationId, ruleId);

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 255) : "";
      if (!name.length) {
        apiError(400, "marketing_automation_name_invalid", "name cannot be empty.");
      }

      row.name = name;
    }

    if (body.description !== undefined) {
      row.description =
        typeof body.description === "string" ? body.description.trim().slice(0, 4000) || null : null;
    }

    if (body.enabled !== undefined) {
      row.enabled = !(body.enabled === false || body.enabled === "false");
    }

    if (body.trigger_opportunity_types !== undefined || body.trigger_opportunity_types_json !== undefined) {
      const triggerRaw =
        typeof body.trigger_opportunity_types_json === "string"
          ? body.trigger_opportunity_types_json
          : typeof body.trigger_opportunity_types === "string"
            ? body.trigger_opportunity_types
            : JSON.stringify(body.trigger_opportunity_types ?? []);

      row.trigger_opportunity_types_json = JSON.stringify(
        this.evaluationService.parseAndValidateTriggerTypesJson(triggerRaw),
      );
    }

    if (body.action_type !== undefined) {
      const actionRaw = typeof body.action_type === "string" ? body.action_type.trim() : "";
      this.evaluationService.assertActionType(actionRaw);
      row.action_type = actionRaw as MarketingAutomationRuleEntity["action_type"];
    }

    if (body.action_config !== undefined || body.action_config_json !== undefined) {
      const actionConfigSource =
        typeof body.action_config_json === "string"
          ? body.action_config_json
          : typeof body.action_config === "object" && body.action_config !== null && !Array.isArray(body.action_config)
            ? JSON.stringify(body.action_config)
            : "{}";

      row.action_config_json = this.evaluationService.normalizeActionConfigJson(actionConfigSource);
    }

    if (body.cooldown_seconds !== undefined) {
      const cooldownRaw = body.cooldown_seconds;
      let cooldownSeconds = row.cooldown_seconds;
      if (typeof cooldownRaw === "number" && Number.isFinite(cooldownRaw)) {
        cooldownSeconds = Math.max(0, Math.floor(cooldownRaw));
      } else if (typeof cooldownRaw === "string" && cooldownRaw.trim()) {
        const n = Number.parseInt(cooldownRaw, 10);
        cooldownSeconds = Number.isFinite(n) ? Math.max(0, n) : 0;
      }

      row.cooldown_seconds = cooldownSeconds;
    }

    row.updated_by_user_id = actorUserId;
    await this.ruleRepo.save(row);
    return { rule: this.serializeRule(row) };
  }

  async deleteRule(organizationId: string, ruleId: string): Promise<{ deleted: boolean }> {
    const row = await this.requireRule(organizationId, ruleId);
    await this.ruleRepo.remove(row);
    return { deleted: true };
  }

  async previewRule(
    organizationId: string,
    ruleId: string,
    opportunityId: string,
  ): Promise<Record<string, unknown>> {
    return this.evaluationService.previewRule(organizationId, ruleId, opportunityId);
  }

  async listRuns(input: {
    organizationId: string;
    ruleId?: string;
    limit: number;
    offset: number;
  }): Promise<{ runs: Record<string, unknown>[]; total: number }> {
    const qb = this.runRepo
      .createQueryBuilder("r")
      .where("r.organization_id = :organizationId", { organizationId: input.organizationId });

    if (input.ruleId) {
      qb.andWhere("r.rule_id = :ruleId", { ruleId: input.ruleId.trim() });
    }

    const total = await qb.getCount();
    qb.orderBy("r.created_at", "DESC").skip(input.offset).take(input.limit);
    const rows = await qb.getMany();

    return { runs: rows.map((r) => this.serializeRun(r)), total };
  }

  async getRun(organizationId: string, runId: string): Promise<{ run: Record<string, unknown> }> {
    const row = await this.runRepo.findOne({
      where: { id: runId.trim(), organization_id: organizationId },
    });

    if (!row) {
      apiError(404, "marketing_automation_run_missing", "Automation run not found.");
    }

    return { run: this.serializeRun(row) };
  }

  buildListRunsQueryParts(input: { limit?: string; offset?: string; ruleId?: string }) {
    return {
      limit: Math.min(readPositiveInt(input.limit, 50), 100),
      offset: readPositiveInt(input.offset, 0),
      ruleId: typeof input.ruleId === "string" && input.ruleId.trim() ? input.ruleId.trim() : undefined,
    };
  }

  private async requireRule(organizationId: string, ruleId: string): Promise<MarketingAutomationRuleEntity> {
    const row = await this.ruleRepo.findOne({
      where: { id: ruleId.trim(), organization_id: organizationId },
    });

    if (!row) {
      apiError(404, "marketing_automation_rule_missing", "Automation rule not found.");
    }

    return row;
  }

  private serializeRule(row: MarketingAutomationRuleEntity): Record<string, unknown> {
    let triggers: unknown = [];

    try {
      triggers = JSON.parse(row.trigger_opportunity_types_json) as unknown;
    } catch {
      triggers = [];
    }

    let actionConfig: unknown = {};

    try {
      actionConfig = JSON.parse(row.action_config_json) as unknown;
    } catch {
      actionConfig = {};
    }

    return {
      id: row.id,
      organization_id: row.organization_id,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      trigger_opportunity_types: triggers,
      action_type: row.action_type,
      action_config: actionConfig,
      cooldown_seconds: row.cooldown_seconds,
      created_by_user_id: row.created_by_user_id,
      updated_by_user_id: row.updated_by_user_id,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  private serializeRun(row: MarketingAutomationRunEntity): Record<string, unknown> {
    let snapshot: unknown = {};

    try {
      snapshot = JSON.parse(row.trigger_snapshot_json) as unknown;
    } catch {
      snapshot = {};
    }

    return {
      id: row.id,
      organization_id: row.organization_id,
      rule_id: row.rule_id,
      idempotency_key: row.idempotency_key,
      marketing_opportunity_id: row.marketing_opportunity_id,
      marketing_content_draft_id: row.marketing_content_draft_id,
      outcome: row.outcome,
      skip_reason: row.skip_reason,
      error_detail: row.error_detail,
      trigger_snapshot: snapshot,
      created_at: row.created_at.toISOString(),
    };
  }
}
