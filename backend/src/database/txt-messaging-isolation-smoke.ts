import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import { HttpException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { OwnedPhoneNumbersService } from "../messaging/phone-numbers/owned-phone-numbers.service";
import { OwnedPhoneNumberEntity } from "../messaging/phone-numbers/owned-phone-number.entity";
import { TxtConversationsService } from "../messaging/txt/txt-conversations.service";
import { CustomerEntity } from "./entities/customer.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";

type SmokeStatus = "PASS" | "FAIL" | "SKIP";
type SmokeResult = { name: string; status: SmokeStatus; detail?: unknown };
type SmokeSummary = {
  ok: boolean;
  database: string;
  phases: Record<string, SmokeStatus>;
  results: SmokeResult[];
  errors: string[];
};

type Seed = {
  orgAId: string;
  orgBId: string;
  convAId: string;
  convBId: string;
  ownedAId: string;
  ownedBId: string;
};

class SmokeConfigService {
  get(): undefined {
    return undefined;
  }
}

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("TXT messaging isolation smoke test currently supports MySQL only.");
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

function extractErrorCode(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse() as { error?: { code?: string } };
    return response?.error?.code ?? error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function seedHarness(dataSource: DataSource, token: string): Promise<Seed> {
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const customerRepo = dataSource.getRepository(CustomerEntity);
  const ownedRepo = dataSource.getRepository(OwnedPhoneNumberEntity);

  const orgA = await orgRepo.save(orgRepo.create({ name: `TXT Org A ${token}`, slug: `txt-a-${token}`, is_active: true }));
  const orgB = await orgRepo.save(orgRepo.create({ name: `TXT Org B ${token}`, slug: `txt-b-${token}`, is_active: true }));

  const customerA = await customerRepo.save(
    customerRepo.create({
      organization_id: orgA.id,
      full_name: "TXT Customer A",
      email: "txta@example.com",
      company_name: null,
      service_address_line_1: "1 A St",
      service_address_line_2: null,
      service_city: "Phoenix",
      service_state_or_region: "AZ",
      service_postal_code: "85001",
      phone: "5552220001",
      legacy_created_at: null,
      source: "website",
      preferred_service_type: "inspection",
      notes: null,
      lifecycle_status: "active",
    }),
  );
  await customerRepo.save(
    customerRepo.create({
      organization_id: orgB.id,
      full_name: "TXT Customer B",
      email: "txtb@example.com",
      company_name: null,
      service_address_line_1: "2 B St",
      service_address_line_2: null,
      service_city: "Apollo",
      service_state_or_region: "AZ",
      service_postal_code: "85002",
      phone: "5552220002",
      legacy_created_at: null,
      source: "website",
      preferred_service_type: "inspection",
      notes: null,
      lifecycle_status: "active",
    }),
  );

  const ownedA = await ownedRepo.save(
    ownedRepo.create({
      tenant_id: orgA.id,
      phone_number: "+15552220001",
      phone_number_normalized: "15552220001",
      label: "Org A DID",
      provider: "telnyx",
      provider_number_id: null,
      market_key: null,
      market_label: null,
      default_source: "website",
      source_mapping_id: null,
      campaign_name: null,
      purpose: "both",
      sms_enabled: true,
      voice_enabled: true,
      is_active: true,
      company_id: null,
    }),
  );
  const ownedB = await ownedRepo.save(
    ownedRepo.create({
      tenant_id: orgB.id,
      phone_number: "+15552220002",
      phone_number_normalized: "15552220002",
      label: "Org B DID",
      provider: "telnyx",
      provider_number_id: null,
      market_key: null,
      market_label: null,
      default_source: "website",
      source_mapping_id: null,
      campaign_name: null,
      purpose: "both",
      sms_enabled: true,
      voice_enabled: true,
      is_active: true,
      company_id: null,
    }),
  );

  const convAId = randomUUID();
  const convBId = randomUUID();
  const now = new Date();

  await dataSource.query(
    `
      INSERT INTO txt_conversations (
        id, organization_id, public_conversation_code, customer_id,
        customer_phone_number, customer_phone_number_normalized,
        owned_phone_number_id, owned_phone_number, owned_phone_number_normalized,
        title, display_name, unread_count, is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `,
    [
      convAId,
      orgA.id,
      randomUUID().replace(/-/g, "").slice(0, 7),
      customerA.id,
      "+15552220001",
      "15552220001",
      ownedA.id,
      ownedA.phone_number,
      ownedA.phone_number_normalized,
      "Conv A",
      "Conv A",
      now,
      now,
    ],
  );

  await dataSource.query(
    `
      INSERT INTO txt_conversations (
        id, organization_id, public_conversation_code, customer_id,
        customer_phone_number, customer_phone_number_normalized,
        owned_phone_number_id, owned_phone_number, owned_phone_number_normalized,
        title, display_name, unread_count, is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `,
    [
      convBId,
      orgB.id,
      randomUUID().replace(/-/g, "").slice(0, 7),
      null,
      "+15552220002",
      "15552220002",
      ownedB.id,
      ownedB.phone_number,
      ownedB.phone_number_normalized,
      "Conv B",
      "Conv B",
      now,
      now,
    ],
  );

  return {
    orgAId: orgA.id,
    orgBId: orgB.id,
    convAId,
    convBId,
    ownedAId: ownedA.id,
    ownedBId: ownedB.id,
  };
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_txt_verify_${Date.now()}`;
  const summary: SmokeSummary = {
    ok: false,
    database: databaseName,
    phases: {},
    results: [],
    errors: [],
  };

  const adminConnection = await mysql.createConnection({
    host: options.host,
    port: options.port,
    user: options.username,
    password: options.password,
    multipleStatements: true,
  });

  let dataSource: DataSource | null = null;

  try {
    await adminConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    summary.phases.databaseCreate = "PASS";

    dataSource = new DataSource({ ...options, database: databaseName, synchronize: false, migrationsRun: false, logging: false });
    await dataSource.initialize();
    await dataSource.runMigrations();
    summary.phases.migrations = "PASS";

    await verifyDatabaseSchema(dataSource);
    summary.phases.schemaVerify = "PASS";

    const seed = await seedHarness(dataSource, randomUUID().slice(0, 8));
    const ownedService = new OwnedPhoneNumbersService(dataSource, new SmokeConfigService() as unknown as ConfigService);
    const conversations = new TxtConversationsService(dataSource, ownedService);

    const listA = await conversations.listRecentConversations(seed.orgAId, 50);
    if (!listA.some((row) => row.id === seed.convAId)) {
      throw new Error("Org A list must include org A conversation.");
    }
    if (listA.some((row) => row.id === seed.convBId)) {
      throw new Error("Org A list must not include org B conversation.");
    }
    summary.results.push({ name: "T1 — conversation list org isolation", status: "PASS", detail: { count: listA.length } });

    try {
      await conversations.getConversationByIdOrCode(seed.orgAId, seed.convBId);
      summary.results.push({ name: "T2 — foreign conversation UUID denied", status: "FAIL", detail: "expected txt_conversation_not_found" });
    } catch (error) {
      const code = extractErrorCode(error);
      summary.results.push({
        name: "T2 — foreign conversation UUID denied",
        status: code === "txt_conversation_not_found" ? "PASS" : "FAIL",
        detail: code,
      });
      if (code !== "txt_conversation_not_found") {
        throw error;
      }
    }

    const created = await conversations.findOrCreateConversation({
      organizationId: seed.orgAId,
      customerId: null,
      customerPhoneNumber: "+15559990001",
      ownedPhoneNumberId: seed.ownedAId,
      ownedPhoneNumber: "+15552220001",
      title: "Smoke create",
      displayName: "Smoke create",
    });
    if (created.organizationId !== seed.orgAId) {
      throw new Error("findOrCreateConversation must persist organization_id.");
    }
    summary.results.push({ name: "T3 — findOrCreateConversation persists org scope", status: "PASS", detail: { id: created.id } });

    summary.ok = summary.results.every((row) => row.status === "PASS");
  } catch (error) {
    summary.errors.push(extractErrorCode(error));
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await adminConnection.end();
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exit(1);
  }
}

void main();
