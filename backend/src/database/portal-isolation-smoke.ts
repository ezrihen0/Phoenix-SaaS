import "dotenv/config";
import "reflect-metadata";

import { createHash, randomUUID } from "crypto";

import { HttpException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { CustomerPortalService } from "../customer-portal/customer-portal.service";
import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import { WarrantyCertificatesService } from "../warranty/warranty-certificates.service";
import { WarrantyPdfService } from "../warranty/warranty-pdf.service";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceDocumentEntity } from "./entities/invoice-document.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationSettingEntity } from "./entities/organization-setting.entity";
import { PortalAccessEventEntity } from "./entities/portal-access-event.entity";
import { PortalMagicLinkEntity } from "./entities/portal-magic-link.entity";
import { PortalSessionEntity } from "./entities/portal-session.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { TechnicianEntity } from "./entities/technician.entity";
import { WarrantyCertificateEntity } from "./entities/warranty-certificate.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";

type SmokeStatus = "PASS" | "FAIL" | "SKIP";

type SmokeResult = { name: string; status: SmokeStatus; detail?: unknown };

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
  cleanup: { droppedDatabase: boolean };
};

type Seed = {
  orgAId: string;
  orgBId: string;
  customerAId: string;
  customerBId: string;
  certAId: string;
  certBId: string;
};

class SmokeConfigService {
  get(key: string): string | undefined {
    if (key === "PORTAL_SESSION_COOKIE_NAME") {
      return "wizfield_portal_session";
    }
    if (key === "PORTAL_SESSION_COOKIE_SECURE") {
      return "false";
    }
    return process.env[key];
  }
}

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Portal isolation smoke test currently supports MySQL only.");
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
    cleanup: { droppedDatabase: false },
  };
}

async function expectPass(summary: SmokeSummary, name: string, run: () => Promise<unknown>) {
  try {
    const detail = await run();
    summary.results.push({ name, status: "PASS", detail });
  } catch (error) {
    summary.results.push({ name, status: "FAIL", detail: extractErrorCode(error) });
    throw error;
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
    throw new Error(`${name}: expected rejection`);
  } catch (error) {
    const code = extractErrorCode(error);
    if (!expectedCodes.includes(code)) {
      summary.results.push({ name, status: "FAIL", detail: code });
      throw error;
    }
    summary.results.push({ name, status: "PASS", detail: code });
  }
}

function buildPortalService(dataSource: DataSource) {
  return new CustomerPortalService(
    dataSource.getRepository(CustomerEntity),
    dataSource.getRepository(JobEntity),
    dataSource.getRepository(QuoteEntity),
    dataSource.getRepository(InvoiceEntity),
    dataSource.getRepository(TechnicianEntity),
    dataSource.getRepository(PortalMagicLinkEntity),
    dataSource.getRepository(PortalSessionEntity),
    dataSource.getRepository(PortalAccessEventEntity),
    dataSource.getRepository(WarrantyCertificateEntity),
    dataSource.getRepository(InvoiceDocumentEntity),
    new SmokeConfigService() as ConfigService,
  );
}

function buildWarrantyService(dataSource: DataSource) {
  return new WarrantyCertificatesService(
    dataSource.getRepository(WarrantyCertificateEntity),
    dataSource.getRepository(InvoiceEntity),
    dataSource.getRepository(JobEntity),
    dataSource.getRepository(CustomerEntity),
    dataSource.getRepository(OrganizationSettingEntity),
    {} as WarrantyPdfService,
    {} as DocumentBrandingSnapshotService,
  );
}

function mockRequest(): Request {
  return {
    ip: "127.0.0.1",
    get: (header: string) => (header.toLowerCase() === "user-agent" ? "portal-smoke" : undefined),
    cookies: {},
  } as Request;
}

function mockResponse(): Response {
  const cookies: Record<string, { value: string; options?: Record<string, unknown> }> = {};
  return {
    cookie(name: string, value: string, options?: Record<string, unknown>) {
      cookies[name] = { value, options };
    },
    clearCookie() {
      /* noop */
    },
    _cookies: cookies,
  } as unknown as Response;
}

async function seedHarness(dataSource: DataSource, token: string): Promise<Seed> {
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const customerRepo = dataSource.getRepository(CustomerEntity);
  const warrantyRepo = dataSource.getRepository(WarrantyCertificateEntity);

  const orgA = await orgRepo.save(orgRepo.create({ name: `Portal Org A ${token}`, slug: `portal-a-${token}`, is_active: true }));
  const orgB = await orgRepo.save(orgRepo.create({ name: `Portal Org B ${token}`, slug: `portal-b-${token}`, is_active: true }));

  const customerA = await customerRepo.save(
    customerRepo.create({
      organization_id: orgA.id,
      full_name: "Portal Customer A",
      email: "a@example.com",
      company_name: null,
      service_address_line_1: "1 A St",
      service_address_line_2: null,
      service_city: "Phoenix",
      service_state_or_region: "AZ",
      service_postal_code: "85001",
      phone: "5551110001",
      legacy_created_at: null,
      source: "website",
      preferred_service_type: "inspection",
      notes: null,
      lifecycle_status: "active",
    }),
  );
  const customerB = await customerRepo.save(
    customerRepo.create({
      organization_id: orgB.id,
      full_name: "Portal Customer B",
      email: "b@example.com",
      company_name: null,
      service_address_line_1: "2 B St",
      service_address_line_2: null,
      service_city: "Apollo",
      service_state_or_region: "AZ",
      service_postal_code: "85002",
      phone: "5551110002",
      legacy_created_at: null,
      source: "website",
      preferred_service_type: "inspection",
      notes: null,
      lifecycle_status: "active",
    }),
  );

  const snapshot = JSON.stringify({ certificateNumber: "WAR-SMOKE", companyName: "Smoke Co" });
  const now = new Date();
  const later = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const certA = await warrantyRepo.save(
    warrantyRepo.create({
      organization_id: orgA.id,
      customer_id: customerA.id,
      warranty_type: "installation",
      warranty_start_date: now,
      warranty_end_date: later,
      coverage_text: "Smoke coverage",
      exclusions_text: "Smoke exclusions",
      snapshot_payload_json: snapshot,
    }),
  );
  const certB = await warrantyRepo.save(
    warrantyRepo.create({
      organization_id: orgB.id,
      customer_id: customerB.id,
      warranty_type: "installation",
      warranty_start_date: now,
      warranty_end_date: later,
      coverage_text: "Smoke coverage B",
      exclusions_text: "Smoke exclusions B",
      snapshot_payload_json: snapshot,
    }),
  );

  return {
    orgAId: orgA.id,
    orgBId: orgB.id,
    customerAId: customerA.id,
    customerBId: customerB.id,
    certAId: certA.id,
    certBId: certB.id,
  };
}

async function runCases(summary: SmokeSummary, dataSource: DataSource, seed: Seed) {
  const portal = buildPortalService(dataSource);
  const warranty = buildWarrantyService(dataSource);
  const request = mockRequest();
  const response = mockResponse();

  let rawToken = "";

  await expectPass(summary, "P1 — staff mints org-scoped magic link", async () => {
    const link = await portal.createMagicLinkForStaff({
      organizationId: seed.orgAId,
      customerId: seed.customerAId,
      actorProfileId: randomUUID(),
      request,
    });
    rawToken = link.raw_token;
    if (!rawToken) {
      throw new Error("missing raw token");
    }
    return { expires_at: link.expires_at };
  });

  await expectPass(summary, "P2 — magic link redeems into portal session", async () => {
    const result = await portal.redeemMagicLinkToken(rawToken, request, response);
    if (!result.ok) {
      throw new Error(`redeem failed: ${result.code}`);
    }
    return { customer_id: result.customer_id };
  });

  await expectPass(summary, "P3 — portal home scoped to customer A / org A", async () => {
    const home = await portal.getPortalHome(seed.orgAId, seed.customerAId);
    if (!home.warranty_certificates.some((row) => row.id === seed.certAId)) {
      throw new Error("Expected org A warranty certificate on portal home.");
    }
    return { warrantyCount: home.warranty_certificates.length };
  });

  await expectApiError(summary, "P4 — portal home rejects cross-org customer scope", ["customer_not_found"], () =>
    portal.getPortalHome(seed.orgBId, seed.customerAId),
  );

  await expectApiError(summary, "P5 — foreign warranty UUID denied for portal session scope", ["warranty_certificate_not_found"], () =>
    warranty.getByIdForPortal(seed.certBId, seed.orgAId, seed.customerAId),
  );

  await expectPass(summary, "P6 — replayed magic link rejected", async () => {
    const replay = await portal.redeemMagicLinkToken(rawToken, request, mockResponse());
    if (replay.ok || replay.code !== "used_link") {
      throw new Error(`Expected used_link, got ${JSON.stringify(replay)}`);
    }
    return { code: replay.code };
  });

  await expectPass(summary, "P7 — expired magic link rejected", async () => {
    const expiredToken = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    const tokenHash = createHash("sha256").update(expiredToken).digest("hex");
    await dataSource.getRepository(PortalMagicLinkEntity).save(
      dataSource.getRepository(PortalMagicLinkEntity).create({
        organization_id: seed.orgAId,
        customer_id: seed.customerAId,
        token_hash: tokenHash,
        status: "sent",
        delivery_method: "copy",
        sender_user_id: null,
        expires_at: new Date(Date.now() - 60_000),
        sent_at: null,
      }),
    );
    const result = await portal.redeemMagicLinkToken(expiredToken, request, mockResponse());
    if (result.ok || result.code !== "expired_link") {
      throw new Error(`Expected expired_link, got ${JSON.stringify(result)}`);
    }
    return { code: result.code };
  });
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_portal_verify_${Date.now()}`;
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

    dataSource = new DataSource({ ...options, database: databaseName, synchronize: false, migrationsRun: false, logging: false });
    await dataSource.initialize();
    await dataSource.runMigrations();
    summary.phases.migrations = "PASS";

    await verifyDatabaseSchema(dataSource);
    summary.phases.schemaVerify = "PASS";

    const seed = await seedHarness(dataSource, randomUUID().slice(0, 8));
    summary.phases.seeding = "PASS";

    await runCases(summary, dataSource, seed);

    summary.ok = summary.results.every((row) => row.status === "PASS");
    summary.phases.cleanup = "PASS";
  } catch (error) {
    summary.errors.push(extractErrorCode(error));
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (shouldDrop) {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
      summary.cleanup.droppedDatabase = true;
    }
    await adminConnection.end();
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exit(1);
  }
}

void main();
