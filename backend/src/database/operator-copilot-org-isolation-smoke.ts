import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import type { ConfigService } from "@nestjs/config";
import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource, Repository } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { AiAuditService } from "../ai/ai-audit.service";
import { AiCopilotDeepSeekClient } from "../ai/ai-copilot-deepseek-client.service";
import { AiDeepSeekProviderService } from "../ai/ai-deepseek-provider.service";
import { AiOperatorCopilotService } from "../ai/ai-operator-copilot.service";
import { listPermissionsForRole } from "../auth/permissions";
import type { ActorContext, RequestWithActor } from "../common/request-types";
import { MessagingAccessService } from "../messaging/messaging-access.service";
import { TxtMessageEntity } from "../messaging/txt/txt-message.entity";
import { TxtConversationEntity } from "../messaging/txt/txt-conversation.entity";
import { TxtService } from "../messaging/txt/txt.service";
import { CustomerEntity } from "./entities/customer.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { RecentCallEntity } from "./entities/recent-call.entity";
import { UserEntity } from "./entities/user.entity";
import { OwnedPhoneNumberEntity } from "../messaging/phone-numbers/owned-phone-number.entity";
import { AiRecommendationRunEntity } from "./entities/ai-recommendation-run.entity";
import { AiOperatorDraftEntity } from "./entities/ai-operator-draft.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";

type SmokeStatus = "PASS" | "FAIL";

type SmokeResult = { name: string; status: SmokeStatus; detail?: unknown };

type SmokeSummary = {
  ok: boolean;
  database: string;
  results: SmokeResult[];
  errors: string[];
};

class SmokeStubConfigService {
  get(key: string): string | undefined {
    if (key === "TELNYX_SKIP_SIGNATURE_VERIFICATION") {
      return "true";
    }
    return process.env[key];
  }
}

/** Inserts outbound TXT rows without Telnyx — satisfies Copilot guarded-send contract. */
class SmokeTxtService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly conversationsRepo: Repository<TxtConversationEntity>,
    private readonly messagesRepo: Repository<TxtMessageEntity>,
    private readonly ownedRepo: Repository<OwnedPhoneNumberEntity>,
  ) {}

  async sendMessage(payload: {
    conversationId: string;
    body: string;
    sentByUserId?: string | null;
    organizationIdForCustomerScope?: string | null;
    outboundRawPayloadExtras?: Record<string, unknown> | null;
  }): Promise<{ outboundTxtMessageId: string }> {
    const customerId = payload.conversationId.replace(/^customer:/, "").trim();
    const orgId = payload.organizationIdForCustomerScope?.trim();
    if (!orgId) {
      throw new Error("SmokeTxtService requires organizationIdForCustomerScope.");
    }

    const customerRows = (await this.dataSource.query(
      `SELECT id, phone, full_name FROM customers WHERE BINARY id = BINARY ? AND organization_id = ? LIMIT 1`,
      [customerId, orgId],
    )) as Array<{ id: string; phone: string; full_name: string }>;
    if (!customerRows[0]?.phone) {
      throw new Error("SmokeTxtService customer not found for scope.");
    }

    const owned = await this.ownedRepo.findOne({ where: { tenant_id: orgId } });
    if (!owned) {
      throw new Error("SmokeTxtService missing owned phone for org.");
    }

    const phone = customerRows[0].phone.trim();
    const phoneNorm = phone.replace(/\D/g, "");
    let conversation = await this.conversationsRepo.findOne({
      where: {
        customer_id: customerId,
        owned_phone_number_id: owned.id,
        is_archived: false,
      },
    });

    if (!conversation) {
      conversation = await this.conversationsRepo.save(
        this.conversationsRepo.create({
          public_conversation_code: randomUUID().replace(/-/g, "").slice(0, 7),
          customer_id: customerId,
          customer_phone_number: phone,
          customer_phone_number_normalized: phoneNorm,
          owned_phone_number_id: owned.id,
          owned_phone_number: owned.phone_number,
          owned_phone_number_normalized: owned.phone_number_normalized,
          title: customerRows[0].full_name,
          display_name: customerRows[0].full_name,
          last_message_preview: null,
          last_message_direction: null,
          last_message_at: null,
          unread_count: 0,
          is_archived: false,
        }),
      );
    }

    const now = new Date();
    const outbound = await this.messagesRepo.save(
      this.messagesRepo.create({
        conversation_id: conversation.id,
        direction: "outbound",
        sent_by_user_id: payload.sentByUserId ?? null,
        provider: "telnyx",
        provider_message_id: `smoke-out-${randomUUID()}`,
        provider_status: "sent",
        from_number: owned.phone_number,
        from_number_normalized: owned.phone_number_normalized,
        to_number: phone,
        to_number_normalized: phoneNorm,
        body: payload.body.trim(),
        status: "sent",
        error_code: null,
        error_message: null,
        sent_at: now,
        received_at: null,
        delivered_at: null,
        read_at: null,
        raw_payload: JSON.stringify(payload.outboundRawPayloadExtras ?? {}),
      }),
    );

    return { outboundTxtMessageId: outbound.id };
  }
}

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Copilot isolation smoke supports MySQL only.");
  }
  return {
    ...(options as MysqlConnectionOptions),
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 3306,
    username: options.username ?? "root",
    password: options.password ?? "",
    synchronize: false,
    migrationsRun: false,
    logging: false,
  };
}

function extractErrorCode(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === "object" && body && "error" in body) {
      const nested = (body as { error?: { code?: string } }).error;
      if (nested?.code) {
        return nested.code;
      }
    }
  }
  return error instanceof Error ? error.message : String(error);
}

function enableCopilotEnv() {
  process.env.AI_FOUNDATION_ENABLED = "true";
  process.env.AI_OPERATOR_COPILOT_ENABLED = "true";
  process.env.AI_COPILOT_CALLS_SURFACE_ENABLED = "true";
  process.env.AI_COPILOT_CUSTOMER_SMS_DRAFT_ENABLED = "true";
  process.env.AI_COPILOT_CUSTOMER_SMS_GUARDED_SEND_ENABLED = "true";
  process.env.AI_COPILOT_CUSTOMER_SMS_OUTCOME_TRACKING_ENABLED = "true";
  process.env.AI_COPILOT_LLM_ENABLED = "false";
}

function buildActor(org: OrganizationEntity, user: UserEntity, profile: ProfileEntity): ActorContext {
  return {
    user,
    profile,
    technician: null,
    memberships: [],
    membership: null,
    organization: org,
    membership_id: null,
    organization_id: org.id,
    role: "admin",
    permissions: listPermissionsForRole("admin"),
    platform_capabilities: [],
  };
}

function buildRequest(actor: ActorContext): RequestWithActor {
  return { actor } as RequestWithActor;
}

function buildCopilotStack(dataSource: DataSource) {
  const stubConfig = new SmokeStubConfigService() as unknown as ConfigService;
  const recentCallsRepo = dataSource.getRepository(RecentCallEntity);
  const customersRepo = dataSource.getRepository(CustomerEntity);
  const conversationsRepo = dataSource.getRepository(TxtConversationEntity);
  const messagesRepo = dataSource.getRepository(TxtMessageEntity);
  const ownedRepo = dataSource.getRepository(OwnedPhoneNumberEntity);

  const smokeTxt = new SmokeTxtService(dataSource, conversationsRepo, messagesRepo, ownedRepo);
  const copilot = new AiOperatorCopilotService(
    stubConfig,
    dataSource,
    recentCallsRepo,
    dataSource.getRepository(AiOperatorDraftEntity),
    customersRepo,
    new AiAuditService(dataSource.getRepository(AiRecommendationRunEntity)),
    new AiCopilotDeepSeekClient(new AiDeepSeekProviderService(stubConfig)),
    new MessagingAccessService(),
    smokeTxt as unknown as TxtService,
  );

  return { copilot, messagesRepo, conversationsRepo };
}

async function seedHarness(dataSource: DataSource, token: string) {
  const orgsRepo = dataSource.getRepository(OrganizationEntity);
  const usersRepo = dataSource.getRepository(UserEntity);
  const profilesRepo = dataSource.getRepository(ProfileEntity);
  const customersRepo = dataSource.getRepository(CustomerEntity);
  const ownedRepo = dataSource.getRepository(OwnedPhoneNumberEntity);
  const recentRepo = dataSource.getRepository(RecentCallEntity);

  const orgA = await orgsRepo.save(
    orgsRepo.create({ name: `Copilot Smoke A ${token}`, slug: `copilot-a-${token}`, is_active: true }),
  );
  const orgB = await orgsRepo.save(
    orgsRepo.create({ name: `Copilot Smoke B ${token}`, slug: `copilot-b-${token}`, is_active: true }),
  );

  const user = await usersRepo.save(
    usersRepo.create({
      email: `copilot-smoke-${token}@local.test`,
      password_hash: "smoke",
      is_active: true,
    }),
  );

  const profile = await profilesRepo.save(
    profilesRepo.create({
      auth_user_id: user.id,
      full_name: "Copilot Smoke Admin",
      phone: "+15550009999",
      role: "admin",
    }),
  );

  const ownedA = await ownedRepo.save(
    ownedRepo.create({
      provider: "telnyx",
      provider_number_id: null,
      phone_number: "+15552220001",
      phone_number_normalized: "15552220001",
      label: "Copilot Smoke A",
      market_key: null,
      market_label: null,
      default_source: "website",
      source_mapping_id: null,
      campaign_name: null,
      purpose: "both",
      sms_enabled: true,
      voice_enabled: true,
      is_active: true,
      tenant_id: orgA.id,
      company_id: null,
    }),
  );

  await ownedRepo.save(
    ownedRepo.create({
      provider: "telnyx",
      provider_number_id: null,
      phone_number: "+15552220002",
      phone_number_normalized: "15552220002",
      label: "Copilot Smoke B",
      market_key: null,
      market_label: null,
      default_source: "website",
      source_mapping_id: null,
      campaign_name: null,
      purpose: "both",
      sms_enabled: true,
      voice_enabled: true,
      is_active: true,
      tenant_id: orgB.id,
      company_id: null,
    }),
  );

  const customerA = await customersRepo.save(
    customersRepo.create({
      organization_id: orgA.id,
      full_name: "Copilot Customer A",
      email: null,
      company_name: null,
      phone: "5553330001",
      service_address_line_1: "1 Smoke St",
      service_address_line_2: null,
      service_city: "Smokeville",
      service_state_or_region: null,
      service_postal_code: "10001",
      legacy_created_at: null,
      source: "website",
      preferred_service_type: "inspection",
      notes: null,
    }),
  );

  const customerB = await customersRepo.save(
    customersRepo.create({
      organization_id: orgB.id,
      full_name: "Copilot Customer B",
      email: null,
      company_name: null,
      phone: "5553330002",
      service_address_line_1: "2 Smoke St",
      service_address_line_2: null,
      service_city: "Smokeville",
      service_state_or_region: null,
      service_postal_code: "10002",
      legacy_created_at: null,
      source: "website",
      preferred_service_type: "inspection",
      notes: null,
    }),
  );

  const anchor = new Date("2024-06-15T10:00:00.000Z");
  const callAId = randomUUID();
  const callBId = randomUUID();

  const recentCallBase = {
    provider: "telnyx" as const,
    provider_connection_id: null,
    source: "website" as const,
    source_mapping_id: null,
    campaign_name: null,
    business_hours_status: null,
    call_flow_action: null,
    call_flow_route_target: null,
    ivr_status: null,
    route_execution_status: null,
    route_execution_detail: null,
    route_command_id: null,
    whisper_text: null,
    whisper_status: null,
    whisper_command_id: null,
    voicemail_url: null,
    voicemail_status: null,
    provider_voicemail_recording_id: null,
    queue_status: null,
    queue_position: null,
    queue_entered_at: null,
    queue_exited_at: null,
    queue_wait_seconds: null,
    queue_callback_requested: false,
    voicemail_transcription: null,
    ai_summary: null,
    ai_sentiment: null,
    ai_status: null,
    ai_provider: null,
    ai_model: null,
    ai_enriched_at: null,
    selected_service_type: null,
    selected_ivr_digit: null,
    matched_lead_id: null,
    recording_url: null,
    provider_recording_id: null,
    recording_status: null,
    duration_seconds: null,
    call_answered_at: null,
    call_ended_at: null,
    raw_payload_snapshot: "{}",
    created_at: anchor,
    updated_at: anchor,
  };

  await recentRepo.insert({
    id: callAId,
    ...recentCallBase,
    provider_event_id: `evt-copilot-a-${token}`,
    provider_call_id: `copilot-cc-a-${token}`,
    from_number: "+15553330001",
    from_number_normalized: "15553330001",
    to_number: "+15552220001",
    to_number_normalized: "15552220001",
    inbound_owned_phone_number_id: ownedA.id,
    inbound_owned_phone_number_label: "Copilot DID A",
    inbound_market_key: null,
    inbound_market_label: null,
    call_status: "completed",
    processing_status: "matched_customer",
    matched_client_id: customerA.id,
    matched_client_display_name: customerA.full_name,
    call_started_at: anchor,
  } as RecentCallEntity);

  await recentRepo.insert({
    id: callBId,
    ...recentCallBase,
    provider_event_id: `evt-copilot-b-${token}`,
    provider_call_id: `copilot-cc-b-${token}`,
    from_number: "+15553330002",
    from_number_normalized: "15553330002",
    to_number: "+15552220002",
    to_number_normalized: "15552220002",
    inbound_owned_phone_number_id: null,
    inbound_owned_phone_number_label: null,
    inbound_market_key: null,
    inbound_market_label: null,
    call_status: "completed",
    processing_status: "matched_customer",
    matched_client_id: customerB.id,
    matched_client_display_name: customerB.full_name,
    call_started_at: anchor,
  } as RecentCallEntity);

  const callA = { id: callAId } as RecentCallEntity;
  const callB = { id: callBId } as RecentCallEntity;

  return { orgA, orgB, user, profile, callA, callB, customerA };
}

async function expectPass(
  summary: SmokeSummary,
  name: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    const detail = await fn();
    summary.results.push({ name, status: "PASS", detail });
  } catch (error) {
    summary.results.push({ name, status: "FAIL", detail: extractErrorCode(error) });
    throw error;
  }
}

async function runCases(summary: SmokeSummary, dataSource: DataSource, seed: Awaited<ReturnType<typeof seedHarness>>) {
  const { copilot, messagesRepo } = buildCopilotStack(dataSource);
  const actor = buildActor(seed.orgA, seed.user, seed.profile);
  const request = buildRequest(actor);

  enableCopilotEnv();

  await expectPass(summary, "C1 — generateSmsDraft happy path", async () => {
    const draft = await copilot.generateSmsDraft(request, { recentCallId: seed.callA.id });
    if (!draft.draftId || draft.status !== "active") {
      throw new Error(`Expected active draft, got status=${draft.status}`);
    }
    if (draft.generationPath !== "template") {
      throw new Error(`Expected template path, got ${draft.generationPath}`);
    }
    return { draftId: draft.draftId };
  });

  await expectPass(summary, "C2 — foreign-org recentCall rejection", async () => {
    try {
      await copilot.generateSmsDraft(request, { recentCallId: seed.callB.id });
      throw new Error("expected recent_call_not_found");
    } catch (error) {
      const code = extractErrorCode(error);
      if (code !== "recent_call_not_found") {
        throw error;
      }
      return { code };
    }
  });

  let sentDraftId = "";
  let outboundTxtMessageId = "";

  await expectPass(summary, "C3 — guarded send + outbound TXT linkage", async () => {
    const draftForSend = await copilot.generateSmsDraft(request, { recentCallId: seed.callA.id });
    const sent = await copilot.executeGuardedSmsSend(request, draftForSend.draftId);
    if (sent.status !== "sent" || !sent.outboundTxtMessageId) {
      throw new Error(`Expected sent draft with outbound TXT, got status=${sent.status}`);
    }
    sentDraftId = sent.draftId;
    outboundTxtMessageId = sent.outboundTxtMessageId;
    return { status: sent.status, outboundTxtMessageId };
  });

  await expectPass(summary, "C4 — outcome waiting_for_reply", async () => {
    const waiting = await copilot.getSmsDraftForRecentCall(request, seed.callA.id);
    if (waiting?.outcomeStatus !== "waiting_for_reply" || waiting.outcomeTrackingEnabled !== true) {
      throw new Error(`Expected waiting_for_reply, got ${waiting?.outcomeStatus ?? "null"}`);
    }
    return { draftId: sentDraftId, outcomeStatus: waiting.outcomeStatus };
  });

  await expectPass(summary, "C5 — outcome customer_replied", async () => {
    const outbound = await messagesRepo.findOne({ where: { id: outboundTxtMessageId } });
    if (!outbound?.conversation_id || !outbound.sent_at) {
      throw new Error("Missing outbound anchor for reply fixture");
    }
    const replyAt = new Date(outbound.sent_at.getTime() + 60_000);
    await messagesRepo.save(
      messagesRepo.create({
        conversation_id: outbound.conversation_id,
        direction: "inbound",
        sent_by_user_id: null,
        provider: "telnyx",
        provider_message_id: `smoke-in-${randomUUID()}`,
        provider_status: "received",
        from_number: outbound.to_number,
        from_number_normalized: outbound.to_number_normalized,
        to_number: outbound.from_number,
        to_number_normalized: outbound.from_number_normalized,
        body: "Thanks, see you then",
        status: "received",
        error_code: null,
        error_message: null,
        sent_at: null,
        received_at: replyAt,
        delivered_at: null,
        read_at: null,
        raw_payload: null,
      }),
    );

    const replied = await copilot.getSmsDraftForRecentCall(request, seed.callA.id);
    if (replied?.outcomeStatus !== "customer_replied" || !replied.firstReplyTxtMessageId) {
      throw new Error(`Expected customer_replied, got ${replied?.outcomeStatus ?? "null"}`);
    }
    if (replied.replyAfterSeconds == null || replied.replyAfterSeconds < 0) {
      throw new Error("Expected non-negative replyAfterSeconds");
    }
    return {
      outcomeStatus: replied.outcomeStatus,
      replyAfterSeconds: replied.replyAfterSeconds,
    };
  });
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_copilot_verify_${Date.now()}`;
  const shouldDrop = (process.env.DB_SMOKE_DROP ?? "false").trim().toLowerCase() === "true";
  const summary: SmokeSummary = { ok: false, database: databaseName, results: [], errors: [] };

  const adminConnection = await mysql.createConnection({
    host: options.host,
    port: options.port,
    user: options.username,
    password: options.password,
    multipleStatements: true,
  });

  let dataSource: DataSource | null = null;

  try {
    if (shouldDrop) {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    }
    await adminConnection.query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );

    dataSource = new DataSource({ ...options, database: databaseName, synchronize: false, migrationsRun: false });
    await dataSource.initialize();
    await dataSource.runMigrations();
    await verifyDatabaseSchema(dataSource);

    const token = randomUUID().slice(0, 8);
    const seed = await seedHarness(dataSource, token);
    await runCases(summary, dataSource, seed);

    summary.ok = summary.results.every((r) => r.status === "PASS") && summary.errors.length === 0;
  } catch (error) {
    summary.errors.push(extractErrorCode(error));
    summary.ok = false;
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (shouldDrop) {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    }
    await adminConnection.end();
  }

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

void main();
