import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import type { ConfigService } from "@nestjs/config";
import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { OwnedPhoneNumbersService } from "../messaging/phone-numbers/owned-phone-numbers.service";
import { CallbackTaskService } from "../telephony/callback-task.service";
import { CallReportingService } from "../telephony/call-reporting.service";
import { CallFlowSettingsService } from "../telephony/call-flow-settings.service";
import { TelnyxWebhookService } from "../telephony/telnyx-webhook.service";
import { TelephonyExecutionService } from "../telephony/telephony-execution.service";
import { CustomerEntity } from "./entities/customer.entity";
import { LeadEntity } from "./entities/lead.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { RecentCallEntity } from "./entities/recent-call.entity";
import { OwnedPhoneNumberEntity } from "../messaging/phone-numbers/owned-phone-number.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";

type SmokeStatus = "PASS" | "FAIL" | "SKIP";

type SmokeResult = {
  name: string;
  status: SmokeStatus;
  detail?: unknown;
};

type SmokeSummary = {
  ok: boolean;
  database: string;
  phases: {
    databaseCreate: SmokeStatus;
    migrations: SmokeStatus;
    schemaVerify: SmokeStatus;
    seeding: SmokeStatus;
    cleanup: SmokeStatus;
  };
  results: SmokeResult[];
  skipped: SmokeResult[];
  errors: string[];
  cleanup: {
    droppedDatabase: boolean;
  };
};

type SeededTelephonyHarness = {
  orgAId: string;
  orgBId: string;
  ownedAId: string;
  ownedBId: string;
  customerAId: string;
  customerBId: string;
  callAId: string;
  callBId: string;
  smsLogAInboundId: string;
  smsLogBInboundId: string;
  smsLogAUnknownInboundId: string;
  smsLogBUnknownInboundId: string;
  callbackTaskBId: string;
  reportingFrom: Date;
  reportingTo: Date;
};

class SmokeStubConfigService {
  get(key: string): string | undefined {
    if (key === "TELNYX_SKIP_SIGNATURE_VERIFICATION") {
      return "true";
    }
    return process.env[key];
  }
}

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();

  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Telephony messaging isolation smoke test currently supports MySQL only.");
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

function normalizeBooleanFlag(value: string | undefined, fallback: boolean) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function extractErrorCode(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse() as { error?: { code?: string; message?: string } };
    return response?.error?.code ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function createSummary(database: string): SmokeSummary {
  return {
    ok: false,
    database,
    phases: {
      databaseCreate: "FAIL",
      migrations: "FAIL",
      schemaVerify: "FAIL",
      seeding: "FAIL",
      cleanup: "FAIL",
    },
    results: [],
    skipped: [],
    errors: [],
    cleanup: {
      droppedDatabase: false,
    },
  };
}

async function expectPass(summary: SmokeSummary, name: string, run: () => Promise<unknown>) {
  try {
    const detail = await run();
    summary.results.push({ name, status: "PASS", detail });
  } catch (error) {
    summary.results.push({ name, status: "FAIL", detail: extractErrorCode(error) });
  }
}

async function expectApiError(
  summary: SmokeSummary,
  name: string,
  expectedCodes: string[],
  run: () => Promise<unknown>,
) {
  try {
    await run();
    summary.results.push({ name, status: "FAIL", detail: "Expected API rejection but call succeeded." });
  } catch (error) {
    const code = extractErrorCode(error);
    summary.results.push({
      name,
      status: expectedCodes.includes(code) ? "PASS" : "FAIL",
      detail: code,
    });
  }
}

function buildTelephonyStack(dataSource: DataSource) {
  const stubConfig = new SmokeStubConfigService() as unknown as ConfigService;
  const recentCallsRepository = dataSource.getRepository(RecentCallEntity);
  const customersRepository = dataSource.getRepository(CustomerEntity);
  const leadsRepository = dataSource.getRepository(LeadEntity);
  const profilesRepository = dataSource.getRepository(ProfileEntity);

  const ownedPhoneNumbersService = new OwnedPhoneNumbersService(dataSource, stubConfig);
  const callFlowSettingsService = new CallFlowSettingsService(dataSource);
  const telephonyExecutionService = new TelephonyExecutionService(stubConfig);
  const callbackTaskService = new CallbackTaskService(dataSource, recentCallsRepository, profilesRepository);
  const telnyxWebhookService = new TelnyxWebhookService(
    stubConfig,
    dataSource,
    recentCallsRepository,
    customersRepository,
    leadsRepository,
    ownedPhoneNumbersService,
    callFlowSettingsService,
    telephonyExecutionService,
    callbackTaskService,
  );
  const callReportingService = new CallReportingService(dataSource);
  return { telnyxWebhookService, callbackTaskService, callReportingService };
}

/**
 * Normalize collations on freshly migrated tables. Runtime migration mixed
 * utf8mb4_unicode_ci (most tables) with utf8mb4_0900_ai_ci (`callback_tasks`),
 * which breaks EXISTS joins used by telephony org predicates under MySQL 8.
 */
async function alignSmokeDatabaseCollation(dataSource: DataSource) {
  const tables = [
    "recent_calls",
    "owned_phone_numbers",
    "customers",
    "leads",
    "recent_call_sms_logs",
    "callback_tasks",
    "jobs",
    "invoices",
  ];
  for (const table of tables) {
    try {
      await dataSource.query(
        `ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
    } catch {
      /* optional tables may not exist in all branches */
    }
  }
}

async function seedTelephonyGraph(dataSource: DataSource, token: string): Promise<SeededTelephonyHarness> {
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const ownedRepo = dataSource.getRepository(OwnedPhoneNumberEntity);
  const customerRepo = dataSource.getRepository(CustomerEntity);
  const recentRepo = dataSource.getRepository(RecentCallEntity);

  const orgA = await orgRepo.save(
    orgRepo.create({
      name: `Tel Smoke Org A ${token}`,
      slug: `tel-smoke-a-${token}`,
      is_active: true,
    }),
  );
  const orgB = await orgRepo.save(
    orgRepo.create({
      name: `Tel Smoke Org B ${token}`,
      slug: `tel-smoke-b-${token}`,
      is_active: true,
    }),
  );

  const ownedA = await ownedRepo.save(
    ownedRepo.create({
      provider: "telnyx",
      provider_number_id: null,
      phone_number: "+15551110001",
      phone_number_normalized: "15551110001",
      label: "Smoke DID A",
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

  const ownedB = await ownedRepo.save(
    ownedRepo.create({
      provider: "telnyx",
      provider_number_id: null,
      phone_number: "+15552220002",
      phone_number_normalized: "15552220002",
      label: "Smoke DID B",
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

  const customerA = await customerRepo.save(
    customerRepo.create({
      organization_id: orgA.id,
      full_name: "Smoke Customer A",
      email: null,
      company_name: null,
      service_address_line_1: "1 Smoke Way",
      service_address_line_2: null,
      service_city: "Testville",
      service_state_or_region: null,
      service_postal_code: "00000",
      phone: "5551110001",
      legacy_created_at: null,
      source: "website",
      preferred_service_type: "inspection",
      notes: null,
    }),
  );

  const customerB = await customerRepo.save(
    customerRepo.create({
      organization_id: orgB.id,
      full_name: "Smoke Customer B",
      email: null,
      company_name: null,
      service_address_line_1: "2 Smoke Way",
      service_address_line_2: null,
      service_city: "Testville",
      service_state_or_region: null,
      service_postal_code: "00000",
      phone: "5552220002",
      legacy_created_at: null,
      source: "website",
      preferred_service_type: "inspection",
      notes: null,
    }),
  );

  const anchor = new Date("2024-06-15T14:30:00.000Z");
  const reportingFrom = new Date("2024-06-01T00:00:00.000Z");
  const reportingTo = new Date("2024-06-30T23:59:59.999Z");

  const callAId = randomUUID();
  const callBId = randomUUID();

  await recentRepo.insert({
    id: callAId,
    provider: "telnyx",
    provider_event_id: `evt-smoke-a-${token}`,
    provider_call_id: null,
    provider_connection_id: null,
    from_number: "+15550001111",
    from_number_normalized: "15550001111",
    to_number: "+15551110001",
    to_number_normalized: "15551110001",
    source: "website",
    source_mapping_id: null,
    campaign_name: null,
    inbound_owned_phone_number_id: ownedA.id,
    inbound_owned_phone_number_label: "Smoke DID A",
    inbound_market_key: null,
    inbound_market_label: null,
    call_status: "missed",
    processing_status: "matched_customer",
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
    matched_client_id: customerA.id,
    matched_lead_id: null,
    matched_client_display_name: customerA.full_name,
    recording_url: null,
    provider_recording_id: null,
    recording_status: null,
    duration_seconds: null,
    call_started_at: anchor,
    call_answered_at: null,
    call_ended_at: null,
    raw_payload_snapshot: "{}",
    created_at: anchor,
    updated_at: anchor,
  } as RecentCallEntity);

  await recentRepo.insert({
    id: callBId,
    provider: "telnyx",
    provider_event_id: `evt-smoke-b-${token}`,
    provider_call_id: null,
    provider_connection_id: null,
    from_number: "+15550002222",
    from_number_normalized: "15550002222",
    to_number: "+15552220002",
    to_number_normalized: "15552220002",
    source: "website",
    source_mapping_id: null,
    campaign_name: null,
    inbound_owned_phone_number_id: ownedB.id,
    inbound_owned_phone_number_label: "Smoke DID B",
    inbound_market_key: null,
    inbound_market_label: null,
    call_status: "missed",
    processing_status: "matched_customer",
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
    matched_client_id: customerB.id,
    matched_lead_id: null,
    matched_client_display_name: customerB.full_name,
    recording_url: null,
    provider_recording_id: null,
    recording_status: null,
    duration_seconds: null,
    call_started_at: anchor,
    call_answered_at: null,
    call_ended_at: null,
    raw_payload_snapshot: "{}",
    created_at: anchor,
    updated_at: anchor,
  } as RecentCallEntity);

  const smsLogAInboundId = randomUUID();
  const smsLogBInboundId = randomUUID();
  const smsLogAUnknownInboundId = randomUUID();
  const smsLogBUnknownInboundId = randomUUID();

  await dataSource.query(
    `
      INSERT INTO recent_call_sms_logs (
        id, recent_call_id, customer_id, phone_number, phone_number_normalized,
        direction, delivery_status, provider, provider_message_id,
        template_body, rendered_message, cooldown_applied, error_code, error_message,
        sent_at, read_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'inbound', 'received', 'twilio', ?, NULL, ?, 0, NULL, NULL, NULL, NULL, ?, ?)
    `,
    [
      smsLogAInboundId,
      callAId,
      customerA.id,
      "+15559999001",
      "15559999001",
      `sms-a-in-${token}`,
      "Inbound A customer",
      anchor,
      anchor,
    ],
  );

  await dataSource.query(
    `
      INSERT INTO recent_call_sms_logs (
        id, recent_call_id, customer_id, phone_number, phone_number_normalized,
        direction, delivery_status, provider, provider_message_id,
        template_body, rendered_message, cooldown_applied, error_code, error_message,
        sent_at, read_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'inbound', 'received', 'twilio', ?, NULL, ?, 0, NULL, NULL, NULL, NULL, ?, ?)
    `,
    [
      smsLogBInboundId,
      callBId,
      customerB.id,
      "+15559999002",
      "15559999002",
      `sms-b-in-${token}`,
      "Inbound B customer",
      anchor,
      anchor,
    ],
  );

  await dataSource.query(
    `
      INSERT INTO recent_call_sms_logs (
        id, recent_call_id, customer_id, phone_number, phone_number_normalized,
        direction, delivery_status, provider, provider_message_id,
        template_body, rendered_message, cooldown_applied, error_code, error_message,
        sent_at, read_at, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, 'inbound', 'received', 'twilio', ?, NULL, ?, 0, NULL, NULL, NULL, NULL, ?, ?)
    `,
    [
      smsLogAUnknownInboundId,
      callAId,
      "+15558888001",
      "15558888001",
      `sms-a-unk-${token}`,
      "Inbound A unknown",
      anchor,
      anchor,
    ],
  );

  await dataSource.query(
    `
      INSERT INTO recent_call_sms_logs (
        id, recent_call_id, customer_id, phone_number, phone_number_normalized,
        direction, delivery_status, provider, provider_message_id,
        template_body, rendered_message, cooldown_applied, error_code, error_message,
        sent_at, read_at, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, 'inbound', 'received', 'twilio', ?, NULL, ?, 0, NULL, NULL, NULL, NULL, ?, ?)
    `,
    [
      smsLogBUnknownInboundId,
      callBId,
      "+15558888002",
      "15558888002",
      `sms-b-unk-${token}`,
      "Inbound B unknown",
      anchor,
      anchor,
    ],
  );

  const callbackTaskBId = randomUUID();
  await dataSource.query(
    `
      INSERT INTO callback_tasks (
        id, recent_call_id, client_id, lead_id, phone_number, source, priority, due_at,
        assigned_to_profile_id, status, notes, created_by_auth_user_id, completed_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, NULL, ?, 'unknown', 'normal', NULL, NULL, 'open', 'smoke seed B', NULL, NULL, ?, ?)
    `,
    [callbackTaskBId, callBId, customerB.id, "+15550002222", anchor, anchor],
  );

  return {
    orgAId: orgA.id,
    orgBId: orgB.id,
    ownedAId: ownedA.id,
    ownedBId: ownedB.id,
    customerAId: customerA.id,
    customerBId: customerB.id,
    callAId,
    callBId,
    smsLogAInboundId,
    smsLogBInboundId,
    smsLogAUnknownInboundId,
    smsLogBUnknownInboundId,
    callbackTaskBId,
    reportingFrom,
    reportingTo,
  };
}

async function runTelephonyIsolationChecks(
  summary: SmokeSummary,
  seed: SeededTelephonyHarness,
  telnyx: TelnyxWebhookService,
  callbackTaskService: CallbackTaskService,
  callReporting: CallReportingService,
  dataSource: DataSource,
) {
  await expectPass(summary, "1a — Org A listRecentCalls includes Org A call", async () => {
    const rows = await telnyx.listRecentCalls({
      organizationId: seed.orgAId,
      query: null,
      callStatus: null,
      processingStatus: null,
      limit: 50,
    });
    const ids = rows.map((r) => r.id);
    if (!ids.includes(seed.callAId)) {
      throw new Error(`Expected call A ${seed.callAId} in list, got ${ids.join(",")}`);
    }
    return { count: rows.length, hasA: true };
  });

  await expectPass(summary, "1b — Org A listRecentCalls excludes Org B call", async () => {
    const rows = await telnyx.listRecentCalls({
      organizationId: seed.orgAId,
      query: null,
      callStatus: null,
      processingStatus: null,
      limit: 50,
    });
    const ids = rows.map((r) => r.id);
    if (ids.includes(seed.callBId)) {
      throw new Error("Org B call leaked into Org A recent calls list.");
    }
    return { excludedB: true };
  });

  await expectApiError(
    summary,
    "2 — Org A cannot requestQueueCallback on Org B recent_call",
    ["recent_call_not_found"],
    () =>
      telnyx.requestQueueCallback(seed.callBId, seed.orgAId, {
        priority: "normal",
        notes: "cross-tenant should fail",
        requestedByAuthUserId: null,
      }),
  );

  await expectPass(summary, "2b — Org A requestQueueCallback succeeds on Org A call", async () => {
    return telnyx.requestQueueCallback(seed.callAId, seed.orgAId, {
      priority: "normal",
      notes: "same-org harness",
      requestedByAuthUserId: null,
    });
  });

  await expectApiError(
    summary,
    "3 — Org A cannot submitAiEnrichment on Org B recent_call",
    ["recent_call_not_found"],
    () =>
      telnyx.submitAiEnrichment(seed.callBId, seed.orgAId, {
        aiSummary: "should not apply",
        updatedByAuthUserId: null,
      }),
  );

  await expectPass(summary, "3b — Org A submitAiEnrichment on Org A call", async () => {
    await telnyx.submitAiEnrichment(seed.callAId, seed.orgAId, {
      aiSummary: "harness-ai-summary",
      updatedByAuthUserId: null,
    });
    const rows = await dataSource.query(
      `SELECT ai_summary FROM recent_calls WHERE id = ? LIMIT 1`,
      [seed.callAId],
    ) as Array<{ ai_summary: string | null }>;
    if (rows[0]?.ai_summary !== "harness-ai-summary") {
      throw new Error(`Expected ai_summary set, got ${rows[0]?.ai_summary ?? "null"}`);
    }
    return { aiSummary: rows[0]?.ai_summary };
  });

  await expectPass(summary, "4 — Org A listRecentTexts excludes Org B SMS logs", async () => {
    const res = await telnyx.listRecentTexts(seed.orgAId, 50);
    const ids = res.items.map((i) => i.id);
    if (ids.includes(seed.smsLogBInboundId) || ids.includes(seed.smsLogBUnknownInboundId)) {
      throw new Error("Org B SMS log leaked into Org A recent texts.");
    }
    if (!ids.includes(seed.smsLogAInboundId) && !ids.includes(seed.smsLogAUnknownInboundId)) {
      throw new Error("Expected at least one Org A SMS log in recent texts.");
    }
    return { itemCount: res.items.length };
  });

  await expectPass(summary, "5 — Org A listMessagingDashboard excludes Org B rows", async () => {
    const dash = await telnyx.listMessagingDashboard(seed.orgAId, 100);
    const custIds = dash.customers.map((c) => c.customerId);
    const unknownKeys = dash.unknownNumbers.map((u) => u.phoneKey);
    if (custIds.includes(seed.customerBId)) {
      throw new Error("Org B customer appeared in Org A messaging dashboard.");
    }
    if (unknownKeys.includes("15558888002")) {
      throw new Error("Org B unknown phone key leaked into Org A dashboard.");
    }
    if (!custIds.includes(seed.customerAId)) {
      throw new Error("Org A customer missing from dashboard.");
    }
    if (!unknownKeys.includes("15558888001")) {
      throw new Error("Org A unknown thread missing from dashboard.");
    }
    return { customers: custIds.length, unknown: unknownKeys.length };
  });

  await expectPass(summary, "6 — markAllRecentTextsRead(org A) leaves Org B unread", async () => {
    await telnyx.markAllRecentTextsRead(seed.orgAId, 50);
    const rowsB = await dataSource.query(
      `SELECT read_at FROM recent_call_sms_logs WHERE id = ? LIMIT 1`,
      [seed.smsLogBInboundId],
    ) as Array<{ read_at: Date | null }>;
    if (rowsB[0]?.read_at != null) {
      throw new Error("Org B inbound SMS was incorrectly marked read.");
    }
    const rowsA = await dataSource.query(
      `SELECT read_at FROM recent_call_sms_logs WHERE id IN (?, ?)`,
      [seed.smsLogAInboundId, seed.smsLogAUnknownInboundId],
    ) as Array<{ read_at: Date | null }>;
    for (const row of rowsA) {
      if (row.read_at == null) {
        throw new Error("Expected Org A inbound SMS logs to be marked read.");
      }
    }
    return { orgARead: true, orgBPreserved: true };
  });

  await expectPass(summary, "7 — Org A CallReportingService.getSummary excludes Org B recent_calls", async () => {
    const orgAReport = await callReporting.getSummary({
      organizationId: seed.orgAId,
      from: seed.reportingFrom,
      to: seed.reportingTo,
    });
    const orgBReport = await callReporting.getSummary({
      organizationId: seed.orgBId,
      from: seed.reportingFrom,
      to: seed.reportingTo,
    });
    if (orgAReport.totals.totalCalls !== 1) {
      throw new Error(`Expected Org A totalCalls 1, got ${orgAReport.totals.totalCalls}`);
    }
    if (orgBReport.totals.totalCalls < 1) {
      throw new Error(`Expected Org B totalCalls >= 1, got ${orgBReport.totals.totalCalls}`);
    }
    return { totalOrgA: orgAReport.totals.totalCalls, totalOrgB: orgBReport.totals.totalCalls };
  });

  await expectPass(summary, "8a — countOpenCallbackTasks(org A) excludes Org B-linked open tasks", async () => {
    const countA = await callbackTaskService.countOpenCallbackTasks(seed.orgAId);
    const countB = await callbackTaskService.countOpenCallbackTasks(seed.orgBId);
    if (countB < 1) {
      throw new Error("Expected Org B to have at least one open callback task.");
    }
    if (countA !== 1) {
      throw new Error(`Expected Org A open callback count 1 after same-org queue request, got ${countA}`);
    }
    return { countA, countB };
  });

  await expectApiError(
    summary,
    "8b — createCallbackTask(org A, recentCall B) rejected",
    ["recent_call_not_found"],
    () =>
      callbackTaskService.createCallbackTask({
        organizationId: seed.orgAId,
        recentCallId: seed.callBId,
        priority: "normal",
        dueAt: null,
        assignedToProfileId: null,
        notes: "should fail",
        createdByAuthUserId: null,
      }),
  );

  await expectApiError(
    summary,
    "8c — updateCallbackTask(B task, org A) rejected",
    ["recent_call_not_found"],
    () =>
      callbackTaskService.updateCallbackTask(seed.callbackTaskBId, seed.orgAId, {
        status: "completed",
      }),
  );
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_tel_msg_verify_${Date.now()}`;
  const shouldDrop = normalizeBooleanFlag(process.env.DB_SMOKE_DROP, false);
  const summary = createSummary(databaseName);

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
    summary.phases.databaseCreate = "PASS";

    dataSource = new DataSource({
      ...options,
      database: databaseName,
      synchronize: false,
      migrationsRun: false,
      logging: false,
    });

    await dataSource.initialize();
    await dataSource.runMigrations();
    summary.phases.migrations = "PASS";

    await verifyDatabaseSchema(dataSource);
    summary.phases.schemaVerify = "PASS";

    await alignSmokeDatabaseCollation(dataSource);

    const token = randomUUID().slice(0, 8);
    const seed = await seedTelephonyGraph(dataSource, token);
    summary.phases.seeding = "PASS";

    const { telnyxWebhookService, callbackTaskService, callReportingService } = buildTelephonyStack(dataSource);

    await runTelephonyIsolationChecks(
      summary,
      seed,
      telnyxWebhookService,
      callbackTaskService,
      callReportingService,
      dataSource,
    );
  } catch (error) {
    summary.errors.push(extractErrorCode(error));
  } finally {
    try {
      if (dataSource?.isInitialized) {
        await dataSource.destroy();
      }

      if (shouldDrop) {
        await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
        summary.cleanup.droppedDatabase = true;
      }

      summary.phases.cleanup = "PASS";
    } catch (error) {
      summary.errors.push(`cleanup: ${extractErrorCode(error)}`);
    } finally {
      await adminConnection.end();
    }
  }

  const skipped = summary.results.filter((result) => result.status === "SKIP");
  summary.skipped = skipped;
  const failedResults = summary.results.filter((result) => result.status === "FAIL");
  summary.ok = summary.errors.length === 0 && failedResults.length === 0;

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
