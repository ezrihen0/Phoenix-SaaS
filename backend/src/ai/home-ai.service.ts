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
import { CustomerLedgerService } from "../crm/customer-ledger.service";
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
  HOME_AI_DEFAULT_HISTORY_LIMIT,
  HOME_AI_DEFAULT_VISIBLE_MESSAGES,
  HOME_AI_MAX_CONTEXT_MESSAGES,
  HOME_AI_MAX_HISTORY_LIMIT,
  HOME_AI_MAX_MESSAGE_LENGTH,
  HOME_AI_MAX_OUTPUT_TOKENS,
  HOME_AI_MAX_TOOL_ITERATIONS,
  HOME_AI_MAX_VISIBLE_MESSAGES,
} from "./ai.constants";
import type { AiDeepSeekChatMessage } from "./ai-deepseek-provider.service";
import { AiDeepSeekProviderService } from "./ai-deepseek-provider.service";
import { resolveAiFoundationEnabled, resolveAiHomeV1Enabled } from "./ai-environment";
import {
  generateHomeAiConversationTitle,
  HOME_AI_DEFAULT_CONVERSATION_TITLE,
} from "./home-ai-conversation-title";
import {
  buildHomeAiSystemPrompt,
  resolveHomeAiRoleProfile,
  type HomeAiRecordLink,
} from "./home-ai-role-profiles";
import { HomeAiToolRegistryService, type HomeAiToolTraceEntry } from "./home-ai-tool-registry.service";

const HOME_AI_CONVERSATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HomeAiPostMessageBody = {
  message?: string;
  conversationId?: string;
  orgId?: string;
};

export type HomeAiListConversationsQuery = {
  limit?: string;
  cursor?: string;
};

export type HomeAiListMessagesQuery = {
  limit?: string;
  before?: string;
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

export type HomeAiConversationSummaryDto = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type HomeAiConversationDto = {
  conversationId: string | null;
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
  messages: HomeAiConversationMessageDto[];
  hasOlder: boolean;
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
    private readonly customerLedgerService: CustomerLedgerService,
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

  private parseLimit(raw: string | undefined, fallback: number, max: number): number {
    const parsed = Number.parseInt(raw ?? "", 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(parsed, 1), max);
  }

  private isConversationId(value: string | undefined): value is string {
    return Boolean(value && HOME_AI_CONVERSATION_ID_PATTERN.test(value));
  }

  private toIso(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    return date.toISOString();
  }

  private encodeHistoryCursor(conversation: HomeAiConversationEntity): string {
    return `${this.toIso(conversation.last_message_at)}~${conversation.id}`;
  }

  private parseHistoryCursor(cursor: string | undefined): { lastMessageAt: Date; id: string } | null {
    if (!cursor) {
      return null;
    }
    const separator = cursor.lastIndexOf("~");
    if (separator <= 0) {
      return null;
    }
    const lastMessageAt = new Date(cursor.slice(0, separator));
    const id = cursor.slice(separator + 1);
    if (Number.isNaN(lastMessageAt.getTime()) || !this.isConversationId(id)) {
      return null;
    }
    return { lastMessageAt, id };
  }

  private serializeMessage(message: HomeAiMessageEntity): HomeAiConversationMessageDto {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: this.toIso(message.created_at),
      recordLinks: (message.record_links ?? []) as HomeAiRecordLink[],
      toolMetadata: message.tool_metadata,
      runId: message.run_id,
    };
  }

  private serializeConversationSummary(conversation: HomeAiConversationEntity): HomeAiConversationSummaryDto {
    return {
      id: conversation.id,
      title: conversation.title || HOME_AI_DEFAULT_CONVERSATION_TITLE,
      createdAt: this.toIso(conversation.created_at),
      updatedAt: this.toIso(conversation.updated_at),
      lastMessageAt: this.toIso(conversation.last_message_at),
    };
  }

  private emptyConversationDto(): HomeAiConversationDto {
    return {
      conversationId: null,
      title: HOME_AI_DEFAULT_CONVERSATION_TITLE,
      createdAt: null,
      updatedAt: null,
      lastMessageAt: null,
      messages: [],
      hasOlder: false,
    };
  }

  private async loadRecentMessages(
    conversationId: string,
    limit = HOME_AI_DEFAULT_VISIBLE_MESSAGES,
  ): Promise<{ messages: HomeAiConversationMessageDto[]; hasOlder: boolean }> {
    const take = this.parseLimit(String(limit), HOME_AI_DEFAULT_VISIBLE_MESSAGES, HOME_AI_MAX_VISIBLE_MESSAGES);
    const newest = await this.messageRepository.find({
      where: { conversation_id: conversationId },
      order: { created_at: "DESC" },
      take: take + 1,
    });
    const hasOlder = newest.length > take;
    const page = hasOlder ? newest.slice(0, take) : newest;
    return {
      messages: page.reverse().map((message) => this.serializeMessage(message)),
      hasOlder,
    };
  }

  private async toConversationDto(conversation: HomeAiConversationEntity): Promise<HomeAiConversationDto> {
    const { messages, hasOlder } = await this.loadRecentMessages(conversation.id);
    return {
      conversationId: conversation.id,
      title: conversation.title || HOME_AI_DEFAULT_CONVERSATION_TITLE,
      createdAt: this.toIso(conversation.created_at),
      updatedAt: this.toIso(conversation.updated_at),
      lastMessageAt: this.toIso(conversation.last_message_at),
      messages,
      hasOlder,
    };
  }

  private async requireOwnedConversation(
    conversationId: string | undefined,
    userId: string,
    organizationId: string,
  ): Promise<HomeAiConversationEntity> {
    if (!this.isConversationId(conversationId)) {
      apiError(404, "home_ai_conversation_not_found", "Conversation not found.");
    }

    const conversation = await this.conversationRepository.findOne({
      where: {
        id: conversationId,
        user_id: userId,
        organization_id: organizationId,
      },
    });

    if (!conversation) {
      apiError(404, "home_ai_conversation_not_found", "Conversation not found.");
    }

    return conversation;
  }

  private async findLatestConversation(userId: string, organizationId: string) {
    return this.conversationRepository.findOne({
      where: { user_id: userId, organization_id: organizationId },
      order: { last_message_at: "DESC", id: "DESC" },
    });
  }

  private async findReusableEmptyConversation(userId: string, organizationId: string) {
    const candidates = await this.conversationRepository.find({
      where: {
        user_id: userId,
        organization_id: organizationId,
        title: HOME_AI_DEFAULT_CONVERSATION_TITLE,
      },
      order: { created_at: "DESC" },
      take: 8,
    });

    if (candidates.length === 0) {
      return null;
    }

    const candidateIds = candidates.map((conversation) => conversation.id);
    const usedIds = new Set(
      (
        await this.messageRepository
          .createQueryBuilder("message")
          .select("message.conversation_id", "conversation_id")
          .where("message.conversation_id IN (:...candidateIds)", { candidateIds })
          .groupBy("message.conversation_id")
          .getRawMany<{ conversation_id: string }>()
      ).map((row) => row.conversation_id),
    );

    return candidates.find((conversation) => !usedIds.has(conversation.id)) ?? null;
  }

  private async createOwnedConversation(userId: string, organizationId: string) {
    const reusable = await this.findReusableEmptyConversation(userId, organizationId);
    if (reusable) {
      return reusable;
    }

    const now = new Date();
    return this.conversationRepository.save(
      this.conversationRepository.create({
        id: randomUUID(),
        user_id: userId,
        organization_id: organizationId,
        title: HOME_AI_DEFAULT_CONVERSATION_TITLE,
        last_message_at: now,
      }),
    );
  }

  private async touchConversation(conversation: HomeAiConversationEntity, title?: string) {
    const now = new Date();
    conversation.last_message_at = now;
    conversation.updated_at = now;
    if (title) {
      conversation.title = title;
    }
    await this.conversationRepository.update(conversation.id, {
      last_message_at: now,
      updated_at: now,
      ...(title ? { title } : {}),
    });
  }

  private async loadLlmContextMessages(conversationId: string) {
    const newest = await this.messageRepository.find({
      where: { conversation_id: conversationId },
      order: { created_at: "DESC" },
      take: HOME_AI_MAX_CONTEXT_MESSAGES,
    });
    return newest.reverse();
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

  async getConversation(request: RequestWithActor): Promise<HomeAiConversationDto> {
    const actor = this.requireActor(request);
    const organizationId = this.requireOrganizationId(actor);
    const conversation = await this.findLatestConversation(actor.user.id, organizationId);
    if (!conversation) {
      return this.emptyConversationDto();
    }
    return this.toConversationDto(conversation);
  }

  async listConversations(request: RequestWithActor, query: HomeAiListConversationsQuery = {}) {
    const actor = this.requireActor(request);
    const organizationId = this.requireOrganizationId(actor);
    const limit = this.parseLimit(query.limit, HOME_AI_DEFAULT_HISTORY_LIMIT, HOME_AI_MAX_HISTORY_LIMIT);
    const cursor = this.parseHistoryCursor(query.cursor);

    const qb = this.conversationRepository
      .createQueryBuilder("conversation")
      .where("conversation.user_id = :userId", { userId: actor.user.id })
      .andWhere("conversation.organization_id = :organizationId", { organizationId });

    if (cursor) {
      qb.andWhere(
        "(conversation.last_message_at < :cursorAt OR (conversation.last_message_at = :cursorAt AND conversation.id < :cursorId))",
        { cursorAt: cursor.lastMessageAt, cursorId: cursor.id },
      );
    }

    const rows = await qb
      .orderBy("conversation.last_message_at", "DESC")
      .addOrderBy("conversation.id", "DESC")
      .take(limit + 1)
      .getMany();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      conversations: page.map((conversation) => this.serializeConversationSummary(conversation)),
      nextCursor: hasMore && last ? this.encodeHistoryCursor(last) : null,
    };
  }

  async createConversation(request: RequestWithActor): Promise<HomeAiConversationDto> {
    const actor = this.requireActor(request);
    const organizationId = this.requireOrganizationId(actor);
    const conversation = await this.createOwnedConversation(actor.user.id, organizationId);
    return this.toConversationDto(conversation);
  }

  async getConversationById(request: RequestWithActor, conversationId: string): Promise<HomeAiConversationDto> {
    const actor = this.requireActor(request);
    const organizationId = this.requireOrganizationId(actor);
    const conversation = await this.requireOwnedConversation(conversationId, actor.user.id, organizationId);
    return this.toConversationDto(conversation);
  }

  async listMessages(
    request: RequestWithActor,
    conversationId: string,
    query: HomeAiListMessagesQuery = {},
  ) {
    const actor = this.requireActor(request);
    const organizationId = this.requireOrganizationId(actor);
    const conversation = await this.requireOwnedConversation(conversationId, actor.user.id, organizationId);
    const limit = this.parseLimit(query.limit, HOME_AI_DEFAULT_VISIBLE_MESSAGES, HOME_AI_MAX_VISIBLE_MESSAGES);

    const qb = this.messageRepository
      .createQueryBuilder("message")
      .where("message.conversation_id = :conversationId", { conversationId: conversation.id });

    if (query.before) {
      if (!this.isConversationId(query.before)) {
        apiError(400, "home_ai_message_anchor_invalid", "The message page anchor is invalid.");
      }
      const anchor = await this.messageRepository.findOne({
        where: { id: query.before, conversation_id: conversation.id },
      });
      if (!anchor) {
        apiError(400, "home_ai_message_anchor_invalid", "The message page anchor is invalid.");
      }
      qb.andWhere(
        "(message.created_at < :createdAt OR (message.created_at = :createdAt AND message.id < :id))",
        { createdAt: anchor.created_at, id: anchor.id },
      );
    }

    const newest = await qb
      .orderBy("message.created_at", "DESC")
      .addOrderBy("message.id", "DESC")
      .take(limit + 1)
      .getMany();

    const hasOlder = newest.length > limit;
    const page = hasOlder ? newest.slice(0, limit) : newest;

    return {
      conversationId: conversation.id,
      messages: page.reverse().map((message) => this.serializeMessage(message)),
      hasOlder,
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

    if (this.hasPermission(actor, "customers.view")) {
      const customerAggregates = await this.customerLedgerService.getOrganizationAggregates(organizationId);
      widgets.customers = {
        visible: true,
        label: "Total customers",
        count: customerAggregates.totalCustomers,
        href: "/customers",
      };
    } else {
      widgets.customers = { visible: false };
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

    const conversation = this.isConversationId(body.conversationId)
      ? await this.requireOwnedConversation(body.conversationId, actor.user.id, organizationId)
      : await this.createOwnedConversation(actor.user.id, organizationId);
    const priorMessages = await this.loadLlmContextMessages(conversation.id);
    const shouldAssignTitle = conversation.title === HOME_AI_DEFAULT_CONVERSATION_TITLE
      && priorMessages.every((message) => message.role !== "user");
    const nextTitle = shouldAssignTitle ? generateHomeAiConversationTitle(messageText) : conversation.title;

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

    await this.touchConversation(conversation, nextTitle);

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
        title: conversation.title,
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

    await this.touchConversation(conversation);

    return {
      conversationId: conversation.id,
      title: conversation.title,
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
