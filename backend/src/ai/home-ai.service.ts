import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { In, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import type { ActorContext, RequestWithActor } from "../common/request-types";
import {
  requireActorProfile,
} from "../auth/permissions";
import { openJobStatuses } from "../crm/constants";
import { endOfLocalDashboardDay, startOfLocalDashboardDay } from "../crm/crm-dashboard-time-window";
import { HomeAiConversationEntity } from "../database/entities/home-ai-conversation.entity";
import { HomeAiMessageEntity } from "../database/entities/home-ai-message.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { LeadEntity } from "../database/entities/lead.entity";
import { AiActionTelemetryService } from "./ai-action-telemetry.service";
import {
  AI_ACTION_KEY_HOME_AI_V1,
  AI_AGENT_KEY_HOME_AI_V1,
  AI_DEEPSEEK_PROVIDER_NAME,
  AI_FEATURE_HOME_AI_V1,
  AI_PROMPT_VERSION_HOME_AI_V1,
  HOME_AI_MAX_CONTEXT_MESSAGES,
  HOME_AI_MAX_MESSAGE_LENGTH,
  HOME_AI_MAX_OUTPUT_TOKENS,
  HOME_AI_MAX_TOOL_ITERATIONS,
} from "./ai.constants";
import type { AiDeepSeekChatMessage } from "./ai-deepseek-provider.service";
import { AiDeepSeekProviderService } from "./ai-deepseek-provider.service";
import { resolveAiFoundationEnabled, resolveAiHomeV1Enabled } from "./ai-environment";
import {
  buildHomeAiSystemPrompt,
  resolveHomeAiRoleProfile,
  type HomeAiRecordLink,
} from "./home-ai-role-profiles";
import { HomeAiToolRegistryService, type HomeAiToolTraceEntry } from "./home-ai-tool-registry.service";

export type HomeAiPostMessageBody = {
  message?: string;
  orgId?: string;
};

export type HomeAiConversationMessageDto = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  recordLinks: HomeAiRecordLink[];
  toolMetadata: Record<string, unknown> | null;
  runId: string | null;
};

@Injectable()
export class HomeAiService {
  private readonly logger = new Logger(HomeAiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly deepSeekProvider: AiDeepSeekProviderService,
    private readonly telemetry: AiActionTelemetryService,
    private readonly toolRegistry: HomeAiToolRegistryService,
    @InjectRepository(HomeAiConversationEntity)
    private readonly conversationRepository: Repository<HomeAiConversationEntity>,
    @InjectRepository(HomeAiMessageEntity)
    private readonly messageRepository: Repository<HomeAiMessageEntity>,
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
    @InjectRepository(LeadEntity)
    private readonly leadsRepository: Repository<LeadEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoicesRepository: Repository<InvoiceEntity>,
  ) {}

  private mergedEnvPreference(key: string): string | undefined {
    return this.configService.get<string>(key) ?? process.env[key];
  }

  private assertHomeAiEnabled() {
    if (!resolveAiFoundationEnabled(this.mergedEnvPreference("AI_FOUNDATION_ENABLED") ?? undefined)) {
      apiError(403, "ai_foundation_disabled", "AI foundation is disabled for this environment.");
    }
    if (!resolveAiHomeV1Enabled(this.mergedEnvPreference("AI_HOME_V1_ENABLED") ?? undefined)) {
      apiError(403, "ai_home_v1_disabled", "HOME AI V1 is disabled for this environment.");
    }
  }

  private requireActor(request: RequestWithActor): ActorContext {
    this.assertHomeAiEnabled();
    return requireActorProfile(request.actor);
  }

  private requireOrganizationId(actor: ActorContext): string {
    const organizationId = actor.organization_id?.trim();
    if (!organizationId) {
      apiError(403, "organization_missing", "An active organization is required.");
    }
    return organizationId;
  }

  private async getOrCreateConversation(userId: string, organizationId: string) {
    let conversation = await this.conversationRepository.findOne({
      where: { user_id: userId, organization_id: organizationId },
    });

    if (!conversation) {
      conversation = await this.conversationRepository.save(
        this.conversationRepository.create({
          id: randomUUID(),
          user_id: userId,
          organization_id: organizationId,
        }),
      );
    }

    return conversation;
  }

  private serializeMessage(message: HomeAiMessageEntity): HomeAiConversationMessageDto {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.created_at.toISOString(),
      recordLinks: (message.record_links ?? []) as HomeAiRecordLink[],
      toolMetadata: message.tool_metadata,
      runId: message.run_id,
    };
  }

  async getProfile(request: RequestWithActor) {
    const actor = this.requireActor(request);
    const profile = resolveHomeAiRoleProfile(actor);
    return {
      profileKey: profile.profileKey,
      displayName: profile.displayName,
      greeting: profile.greeting,
      quickPrompts: profile.quickPrompts,
      providerConfigured: this.deepSeekProvider.isConfigured(),
    };
  }

  async getConversation(request: RequestWithActor) {
    const actor = this.requireActor(request);
    const organizationId = this.requireOrganizationId(actor);
    const conversation = await this.getOrCreateConversation(actor.user.id, organizationId);
    const messages = await this.messageRepository.find({
      where: { conversation_id: conversation.id },
      order: { created_at: "ASC" },
      take: HOME_AI_MAX_CONTEXT_MESSAGES,
    });

    return {
      conversationId: conversation.id,
      messages: messages.map((message) => this.serializeMessage(message)),
    };
  }

  private hasPermission(actor: ActorContext, permission: string): boolean {
    return actor.permissions?.includes(permission) ?? false;
  }

  async getSummaryWidgets(request: RequestWithActor) {
    const actor = this.requireActor(request);
    const organizationId = this.requireOrganizationId(actor);
    const assignedOnly = !this.hasPermission(actor, "jobs.view")
      && this.hasPermission(actor, "jobs.assigned.view");
    const technicianId = actor.technician?.id ?? null;
    const dayStart = startOfLocalDashboardDay();
    const dayEnd = endOfLocalDashboardDay();

    const widgets: Record<string, unknown> = {};

    if (this.hasPermission(actor, "jobs.view") || this.hasPermission(actor, "jobs.assigned.view")) {
      const todayQb = this.jobsRepository
        .createQueryBuilder("job")
        .where("job.organization_id = :organizationId", { organizationId })
        .andWhere("job.scheduled_for >= :dayStart", { dayStart })
        .andWhere("job.scheduled_for <= :dayEnd", { dayEnd })
        .andWhere("job.status IN (:...statuses)", { statuses: [...openJobStatuses, "completed"] });

      const activeQb = this.jobsRepository
        .createQueryBuilder("job")
        .where("job.organization_id = :organizationId", { organizationId })
        .andWhere("job.status IN (:...statuses)", { statuses: openJobStatuses });

      if (assignedOnly && technicianId) {
        todayQb.andWhere("job.assigned_technician_id = :technicianId", { technicianId });
        activeQb.andWhere("job.assigned_technician_id = :technicianId", { technicianId });
      }

      const [todayCount, activeCount] = await Promise.all([
        todayQb.getCount(),
        activeQb.getCount(),
      ]);

      widgets.today = {
        visible: true,
        label: assignedOnly ? "My schedule today" : "Jobs today",
        count: todayCount,
        href: "/schedule",
      };
      widgets.jobs = {
        visible: true,
        label: assignedOnly ? "My active jobs" : "Active jobs",
        count: activeCount,
        href: "/jobs",
      };
    } else {
      widgets.today = { visible: false };
      widgets.jobs = { visible: false };
    }

    if (this.hasPermission(actor, "leads.view")) {
      const newLeads = await this.leadsRepository.count({
        where: {
          organization_id: organizationId,
          status: In(["new_lead", "contacted"]),
        },
      });
      widgets.leads = {
        visible: true,
        label: "Open leads",
        count: newLeads,
        href: "/leads",
      };
    } else {
      widgets.leads = { visible: false };
    }

    if (this.hasPermission(actor, "invoices.view") || this.hasPermission(actor, "invoices.assigned.view")) {
      const invoiceQb = this.invoicesRepository
        .createQueryBuilder("invoice")
        .leftJoin("invoice.job", "job")
        .where("invoice.organization_id = :organizationId", { organizationId })
        .andWhere("invoice.status = :status", { status: "unpaid" });

      if (!this.hasPermission(actor, "invoices.view") && technicianId) {
        invoiceQb.andWhere("job.assigned_technician_id = :technicianId", { technicianId });
      }

      const unpaidInvoices = await invoiceQb.getMany();
      const totalBalanceCents = unpaidInvoices.reduce(
        (sum, invoice) => sum + (invoice.total_cents ?? 0),
        0,
      );

      widgets.money = {
        visible: true,
        label: "Unpaid balance",
        count: unpaidInvoices.length,
        totalBalanceCents,
        href: "/invoices",
      };
    } else {
      widgets.money = { visible: false };
    }

    return { widgets };
  }

  async postMessage(request: RequestWithActor, body: HomeAiPostMessageBody) {
    const actor = this.requireActor(request);
    const organizationId = this.requireOrganizationId(actor);
    const messageText = (body.message ?? "").trim();

    if (!messageText) {
      apiError(400, "home_ai_message_required", "A message is required.");
    }
    if (messageText.length > HOME_AI_MAX_MESSAGE_LENGTH) {
      apiError(400, "home_ai_message_too_long", "Message exceeds the allowed length.");
    }

    const conversation = await this.getOrCreateConversation(actor.user.id, organizationId);
    const priorMessages = await this.messageRepository.find({
      where: { conversation_id: conversation.id },
      order: { created_at: "ASC" },
      take: HOME_AI_MAX_CONTEXT_MESSAGES,
    });

    const userMessage = await this.messageRepository.save(
      this.messageRepository.create({
        id: randomUUID(),
        conversation_id: conversation.id,
        role: "user",
        content: messageText,
        run_id: null,
        record_links: null,
        tool_metadata: null,
      }),
    );

    if (!this.deepSeekProvider.isConfigured()) {
      const fallback = "Home AI is enabled but the language model provider is not configured yet.";
      const runId = await this.telemetry.recordActionRun({
        organizationId,
        actorProfileId: actor.profile?.id ?? null,
        actionKey: AI_ACTION_KEY_HOME_AI_V1,
        provider: AI_DEEPSEEK_PROVIDER_NAME,
        featureKey: AI_FEATURE_HOME_AI_V1,
        promptVersion: AI_PROMPT_VERSION_HOME_AI_V1,
        status: "refused",
        errorCode: "provider_not_configured",
      });
      const assistantMessage = await this.persistAssistantMessage({
        conversationId: conversation.id,
        content: fallback,
        recordLinks: [],
        toolMetadata: { providerConfigured: false },
        runId,
      });
      return {
        conversationId: conversation.id,
        message: this.serializeMessage(assistantMessage),
        userMessage: this.serializeMessage(userMessage),
      };
    }

    const startedAt = Date.now();
    const toolTrace: HomeAiToolTraceEntry[] = [];
    const recordLinks: HomeAiRecordLink[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let modelId = this.deepSeekProvider.readConfiguredModelId();
    let estimatedCostUsd = 0;
    let assistantText = "";
    let status: "completed" | "failed" = "completed";
    let errorCode: string | null = null;

    try {
      const chatMessages: AiDeepSeekChatMessage[] = [
        { role: "system", content: buildHomeAiSystemPrompt(actor) },
        ...priorMessages.map((message) => ({
          role: message.role as "user" | "assistant" | "system",
          content: message.content,
        })),
        { role: "user", content: messageText },
      ];

      const tools = this.toolRegistry.listOpenAiToolsForActor(actor);
      let iterations = 0;

      while (iterations < HOME_AI_MAX_TOOL_ITERATIONS) {
        iterations += 1;
        const completion = await this.deepSeekProvider.completeChatWithMessages({
          messages: chatMessages,
          tools,
          maxTokens: HOME_AI_MAX_OUTPUT_TOKENS,
          temperature: 0.35,
        });

        if (!completion.ok) {
          status = "failed";
          errorCode = completion.reasonCode;
          assistantText = "I couldn't complete that request right now. Please try again.";
          break;
        }

        totalInputTokens += completion.inputTokens;
        totalOutputTokens += completion.outputTokens;
        modelId = completion.modelId;
        estimatedCostUsd += completion.estimatedCostUsd;

        if (!completion.toolCalls || completion.toolCalls.length === 0) {
          assistantText = completion.text || "I don't have enough context to answer that yet.";
          break;
        }

        chatMessages.push({
          role: "assistant",
          content: completion.text || "",
          tool_calls: completion.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: "function" as const,
            function: {
              name: toolCall.name,
              arguments: toolCall.arguments,
            },
          })),
        });

        for (const toolCall of completion.toolCalls) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(toolCall.arguments) as Record<string, unknown>;
          } catch {
            parsedArgs = {};
          }

          const execution = await this.toolRegistry.executeTool({
            actor,
            organizationId,
            toolKey: toolCall.name,
            args: parsedArgs,
          });
          toolTrace.push(execution.trace);

          const payloadRecordLinks = (Array.isArray(execution.payload.recordLinks)
            ? execution.payload.recordLinks
            : []) as HomeAiRecordLink[];
          for (const link of payloadRecordLinks) {
            if (!recordLinks.some((existing) => existing.type === link.type && existing.id === link.id)) {
              recordLinks.push(link);
            }
          }

          chatMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(execution.payload).slice(0, 12000),
          });
        }
      }

      if (!assistantText && iterations >= HOME_AI_MAX_TOOL_ITERATIONS) {
        const finalCompletion = await this.deepSeekProvider.completeChatWithMessages({
          messages: chatMessages,
          maxTokens: HOME_AI_MAX_OUTPUT_TOKENS,
        });
        if (finalCompletion.ok) {
          assistantText = finalCompletion.text;
          totalInputTokens += finalCompletion.inputTokens;
          totalOutputTokens += finalCompletion.outputTokens;
          estimatedCostUsd += finalCompletion.estimatedCostUsd;
        } else {
          status = "failed";
          errorCode = finalCompletion.reasonCode;
          assistantText = "I gathered some context but couldn't finish the answer.";
        }
      }
    } catch (error) {
      status = "failed";
      errorCode = "home_ai_router_failed";
      assistantText = "Something went wrong while processing your request.";
      this.logger.warn(
        `home_ai_router_failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const runId = await this.telemetry.recordActionRun({
      organizationId,
      actorProfileId: actor.profile?.id ?? null,
      actionKey: AI_ACTION_KEY_HOME_AI_V1,
      provider: AI_DEEPSEEK_PROVIDER_NAME,
      featureKey: AI_FEATURE_HOME_AI_V1,
      promptVersion: AI_PROMPT_VERSION_HOME_AI_V1,
      status,
      errorCode,
      modelId,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      estimatedCostUsd,
      latencyMs: Date.now() - startedAt,
      traceEnvelope: {
        agent_key: AI_AGENT_KEY_HOME_AI_V1,
        tool_trace: toolTrace,
        record_link_count: recordLinks.length,
      },
    });

    const assistantMessage = await this.persistAssistantMessage({
      conversationId: conversation.id,
      content: assistantText,
      recordLinks,
      toolMetadata: { toolTrace },
      runId,
    });

    await this.conversationRepository.update(conversation.id, { updated_at: new Date() });

    return {
      conversationId: conversation.id,
      message: this.serializeMessage(assistantMessage),
      userMessage: this.serializeMessage(userMessage),
    };
  }

  private async persistAssistantMessage(input: {
    conversationId: string;
    content: string;
    recordLinks: HomeAiRecordLink[];
    toolMetadata: Record<string, unknown>;
    runId: string | null;
  }) {
    return this.messageRepository.save(
      this.messageRepository.create({
        id: randomUUID(),
        conversation_id: input.conversationId,
        role: "assistant",
        content: input.content,
        run_id: input.runId,
        record_links: input.recordLinks,
        tool_metadata: input.toolMetadata,
      }),
    );
  }
}
