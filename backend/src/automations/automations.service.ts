import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { AutomationRuleEntity } from "../database/entities/automation-rule.entity";
import { AutomationSettingEntity } from "../database/entities/automation-setting.entity";
import {
  AutomationTemplateEntity,
  automationRuleModes,
  type AutomationRuleMode,
} from "../database/entities/automation-template.entity";
import {
  automationEventContractExample,
  automationEventsPersistenceDecision,
} from "./automation-event-contract";
import { AutomationAuditService } from "./automation-audit.service";
import { AutomationExecutorService } from "./automation-executor.service";
import { AutomationSchedulerService } from "./automation-scheduler.service";
import { AutomationTemplateRendererService } from "./automation-template-renderer.service";
import { automationRegistry } from "./automation-registry";

type AutomationRulePayload = {
  templateKey?: unknown;
  name?: unknown;
  mode?: unknown;
  trigger?: unknown;
  conditions?: unknown;
  action?: unknown;
  timing?: unknown;
  approval?: unknown;
};

const DEFAULT_ORGANIZATION_ID = "default";

@Injectable()
export class AutomationsService {
  constructor(
    private readonly auditService: AutomationAuditService,
    private readonly executorService: AutomationExecutorService,
    private readonly schedulerService: AutomationSchedulerService,
    private readonly templateRendererService: AutomationTemplateRendererService,
    @InjectRepository(AutomationTemplateEntity)
    private readonly templatesRepository: Repository<AutomationTemplateEntity>,
    @InjectRepository(AutomationRuleEntity)
    private readonly rulesRepository: Repository<AutomationRuleEntity>,
    @InjectRepository(AutomationSettingEntity)
    private readonly settingsRepository: Repository<AutomationSettingEntity>,
  ) {}

  getFoundationOverview() {
    return {
      productBody: "independent_automation_store",
      marketplaceModel: "success_recipes_plus_custom_builder",
      saveBehavior: "valid_rules_become_active_immediately",
      runtimeStatus: "structure_only",
      registryBacked: true,
      auditRequired: true,
    };
  }

  getRegistry() {
    return automationRegistry;
  }

  getBuilderOptions() {
    return {
      triggers: automationRegistry.triggers,
      conditionFieldsByEntity: automationRegistry.conditionFieldsByEntity,
      actions: automationRegistry.actions,
      allowedActionsByTriggerFamily: automationRegistry.allowedActionsByTriggerFamily,
      timingModes: automationRegistry.timingModes,
      tokenGroups: automationRegistry.tokenGroups,
      tokenDefinitions: automationRegistry.tokenDefinitions,
      successRecipes: automationRegistry.successRecipes,
    };
  }

  getEventContract() {
    return {
      example: automationEventContractExample,
      persistenceDecision: automationEventsPersistenceDecision,
    };
  }

  getSafetyModel() {
    return {
      execution: this.executorService.getExecutionReadiness(),
      scheduler: this.schedulerService.getCapabilities(),
      audit: this.auditService.getAuditRequirements(),
    };
  }

  async listTemplates() {
    return this.templatesRepository.find({
      order: {
        category: "ASC",
        title: "ASC",
      },
    });
  }

  async listRules() {
    return this.rulesRepository.find({
      where: {
        organization_id: DEFAULT_ORGANIZATION_ID,
      },
      order: {
        updated_at: "DESC",
      },
    });
  }

  async getAutomationSettings() {
    return this.ensureAutomationSettings();
  }

  async updateAutomationSettings(payload: Record<string, unknown>) {
    const settings = await this.ensureAutomationSettings();

    settings.pause_all = this.readOptionalBoolean(payload.pauseAll, settings.pause_all);
    settings.disable_customer_facing_sends = this.readOptionalBoolean(
      payload.disableCustomerFacingSends,
      settings.disable_customer_facing_sends,
    );
    settings.disable_review_requests = this.readOptionalBoolean(
      payload.disableReviewRequests,
      settings.disable_review_requests,
    );
    settings.disable_payment_reminders = this.readOptionalBoolean(
      payload.disablePaymentReminders,
      settings.disable_payment_reminders,
    );
    settings.disable_scheduled_runs = this.readOptionalBoolean(
      payload.disableScheduledRuns,
      settings.disable_scheduled_runs,
    );

    return this.settingsRepository.save(settings);
  }

  validateRulePayload(payload: AutomationRulePayload) {
    const errors = this.collectRuleValidationErrors(payload);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async createRule(payload: AutomationRulePayload, createdByUserId: string | null) {
    const validation = this.validateRulePayload(payload);

    if (!validation.valid) {
      apiError(400, "automation_rule_invalid", "Automation rule cannot be saved.", validation.errors);
    }

    const rule = this.rulesRepository.create({
      organization_id: DEFAULT_ORGANIZATION_ID,
      template_key: this.readOptionalString(payload.templateKey, "Template key", 160),
      name: this.readString(payload.name, "Automation name", 180),
      status: "active",
      enabled: true,
      mode: this.readRuleMode(payload.mode),
      trigger_json: this.readRecord(payload.trigger, "Trigger"),
      conditions_json: this.readRecordArray(payload.conditions, "Conditions"),
      action_json: this.buildPersistedActionJson(payload.action),
      timing_json: this.readOptionalRecord(payload.timing, "Timing"),
      approval_json: this.readOptionalRecord(payload.approval, "Approval"),
      rule_version: 1,
      created_by_user_id: createdByUserId,
    });

    return this.rulesRepository.save(rule);
  }

  async updateRule(ruleId: string, payload: AutomationRulePayload) {
    const existing = await this.getRuleOrThrow(ruleId);
    const validation = this.validateRulePayload(payload);

    if (!validation.valid) {
      apiError(400, "automation_rule_invalid", "Automation rule cannot be saved.", validation.errors);
    }

    existing.template_key = this.readOptionalString(payload.templateKey, "Template key", 160);
    existing.name = this.readString(payload.name, "Automation name", 180);
    existing.mode = this.readRuleMode(payload.mode);
    existing.trigger_json = this.readRecord(payload.trigger, "Trigger");
    existing.conditions_json = this.readRecordArray(payload.conditions, "Conditions");
    existing.action_json = this.buildPersistedActionJson(payload.action);
    existing.timing_json = this.readOptionalRecord(payload.timing, "Timing");
    existing.approval_json = this.readOptionalRecord(payload.approval, "Approval");
    existing.status = "active";
    existing.enabled = true;
    existing.rule_version += 1;

    return this.rulesRepository.save(existing);
  }

  async disableRule(ruleId: string) {
    const existing = await this.getRuleOrThrow(ruleId);

    existing.status = "disabled";
    existing.enabled = false;
    existing.rule_version += 1;

    return this.rulesRepository.save(existing);
  }

  async deleteRule(ruleId: string) {
    const existing = await this.getRuleOrThrow(ruleId);
    await this.rulesRepository.remove(existing);

    return {
      id: ruleId,
      deleted: true,
    };
  }

  private async getRuleOrThrow(ruleId: string) {
    const id = ruleId.trim();

    if (!id) {
      apiError(400, "automation_rule_id_required", "Automation rule id is required.");
    }

    const rule = await this.rulesRepository.findOne({
      where: {
        id,
        organization_id: DEFAULT_ORGANIZATION_ID,
      },
    });

    if (!rule) {
      apiError(404, "automation_rule_not_found", "Automation rule was not found.");
    }

    return rule;
  }

  private async ensureAutomationSettings() {
    const existing = await this.settingsRepository.findOne({
      where: {
        organization_id: DEFAULT_ORGANIZATION_ID,
      },
    });

    if (existing) {
      return existing;
    }

    return this.settingsRepository.save(
      this.settingsRepository.create({
        organization_id: DEFAULT_ORGANIZATION_ID,
        pause_all: false,
        disable_customer_facing_sends: false,
        disable_review_requests: false,
        disable_payment_reminders: false,
        disable_scheduled_runs: false,
      }),
    );
  }

  private collectRuleValidationErrors(payload: AutomationRulePayload) {
    const errors: string[] = [];
    const trigger = this.tryReadRecord(payload.trigger);
    const action = this.tryReadRecord(payload.action);

    if (!this.tryReadString(payload.name)) {
      errors.push("Automation name is required.");
    }

    if (!trigger) {
      errors.push("Trigger is required.");
    }

    if (!action) {
      errors.push("Action is required.");
    }

    if (!trigger || !action) {
      return errors;
    }

    const triggerKey = this.readTriggerKey(trigger);
    const actionKey = this.tryReadString(action.registryActionKey)
      ?? this.tryReadString(action.key)
      ?? this.tryReadString(action.type);
    const triggerDefinition = automationRegistry.triggers.find((item) => item.key === triggerKey);
    const actionDefinition = automationRegistry.actions.find((item) => item.key === actionKey);

    if (!triggerDefinition) {
      errors.push("Trigger is not registered.");
    }

    if (!actionDefinition) {
      errors.push("Action is not registered.");
    }

    if (!triggerDefinition || !actionDefinition) {
      return errors;
    }

    const allowedActions = automationRegistry.allowedActionsByTriggerFamily[triggerDefinition.family] ?? [];

    if (!allowedActions.includes(actionDefinition.key)) {
      errors.push("Action is not allowed for the selected trigger.");
    }

    if (actionDefinition.customerFacing && actionDefinition.requiresApprovedTemplate && !this.tryReadString(action.templateKey)) {
      errors.push("Customer-facing actions require an approved message template key.");
    }

    if (actionDefinition.customerFacing && !this.tryReadString(action.target)) {
      errors.push("Customer-facing actions require a target.");
    }

    if (actionDefinition.customerFacing) {
      const templateBody = this.tryReadString(action.templateBody);

      if (templateBody) {
        const tokenValidation = this.templateRendererService.validateTemplateTokens(templateBody);

        if (!tokenValidation.valid) {
          errors.push(`Template contains unknown tokens: ${tokenValidation.unknownTokens.join(", ")}.`);
        }
      }
    }

    for (const condition of this.readRecordArray(payload.conditions, "Conditions")) {
      const field = this.tryReadString(condition.field);
      const allowedFields = automationRegistry.conditionFieldsByEntity[triggerDefinition.entityType] ?? [];

      if (field && !allowedFields.includes(field)) {
        errors.push(`Condition field ${field} is not available for ${triggerDefinition.entityType} triggers.`);
      }
    }

    return errors;
  }

  private buildPersistedActionJson(value: unknown) {
    const action = this.readRecord(value, "Action");
    const actionKey = this.tryReadString(action.registryActionKey)
      ?? this.tryReadString(action.key)
      ?? this.tryReadString(action.type);
    const actionDefinition = automationRegistry.actions.find((item) => item.key === actionKey);

    if (!actionDefinition?.customerFacing) {
      return action;
    }

    return {
      ...action,
      idempotencyKeyTemplate: [
        "{{rule.id}}",
        "{{rule.version}}",
        actionDefinition.key,
        "{{target.type}}",
        "{{target.id}}",
        "{{related_entity.type}}",
        "{{related_entity.id}}",
      ].join(":"),
    };
  }

  private readTriggerKey(trigger: Record<string, unknown>) {
    const directKey = this.tryReadString(trigger.key);

    if (directKey) {
      return directKey;
    }

    const entity = this.tryReadString(trigger.entity) ?? this.tryReadString(trigger.object);
    const event = this.tryReadString(trigger.event);

    if (entity && event) {
      return `${entity}.${event}`;
    }

    return "";
  }

  private readRuleMode(value: unknown): AutomationRuleMode {
    const mode = this.tryReadString(value);

    if (mode && (automationRuleModes as readonly string[]).includes(mode)) {
      return mode as AutomationRuleMode;
    }

    return "manual_approval";
  }

  private readOptionalBoolean(value: unknown, fallback: boolean) {
    return typeof value === "boolean" ? value : fallback;
  }

  private readString(value: unknown, fieldName: string, maxLength: number) {
    const normalized = this.tryReadString(value);

    if (!normalized) {
      apiError(400, "automation_rule_invalid", `${fieldName} is required.`);
    }

    if (normalized.length > maxLength) {
      apiError(400, "automation_rule_invalid", `${fieldName} is too long.`);
    }

    return normalized;
  }

  private readOptionalString(value: unknown, fieldName: string, maxLength: number) {
    const normalized = this.tryReadString(value);

    if (!normalized) {
      return null;
    }

    if (normalized.length > maxLength) {
      apiError(400, "automation_rule_invalid", `${fieldName} is too long.`);
    }

    return normalized;
  }

  private tryReadString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private readRecord(value: unknown, fieldName: string) {
    const record = this.tryReadRecord(value);

    if (!record) {
      apiError(400, "automation_rule_invalid", `${fieldName} must be an object.`);
    }

    return record;
  }

  private readOptionalRecord(value: unknown, fieldName: string) {
    if (value === undefined || value === null) {
      return null;
    }

    return this.readRecord(value, fieldName);
  }

  private tryReadRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readRecordArray(value: unknown, fieldName: string) {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      apiError(400, "automation_rule_invalid", `${fieldName} must be an array.`);
    }

    return value.map((item, index) => {
      const record = this.tryReadRecord(item);

      if (!record) {
        apiError(400, "automation_rule_invalid", `${fieldName} item ${index + 1} must be an object.`);
      }

      return record;
    });
  }
}
