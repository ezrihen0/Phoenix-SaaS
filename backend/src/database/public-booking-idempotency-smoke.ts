import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { PublicBookingsService } from "../public/public-bookings.service";
import { OrganizationEntity } from "./entities/organization.entity";
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
  phases: Record<string, SmokeStatus>;
  results: SmokeResult[];
  errors: string[];
};

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Public booking idempotency smoke test currently supports MySQL only.");
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
    const response = error.getResponse() as { error?: { code?: string; message?: string } };
    return response?.error?.code ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function expectPass(summary: SmokeSummary, name: string, run: () => Promise<unknown>) {
  try {
    const detail = await run();
    summary.results.push({ name, status: "PASS", detail });
  } catch (error) {
    summary.results.push({ name, status: "FAIL", detail: extractErrorCode(error) });
  }
}

function minimalBookingPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Idempotency Patron",
    phone: "5551112222",
    email: "idempotency@example.com",
    serviceAddressLine1: "200 Idempotency Lane",
    serviceAddressLine2: null,
    serviceCity: "Testville",
    serviceStateOrRegion: null,
    servicePostalCode: "T1T1T1",
    serviceType: "inspection" as const,
    description: "idempotency harness",
    ...overrides,
  };
}

async function countLeads(dataSource: DataSource) {
  const rows = await dataSource.query(`SELECT COUNT(*) AS c FROM leads`) as Array<{ c: number | string }>;
  return Number(rows[0]?.c ?? 0);
}

async function countCustomers(dataSource: DataSource) {
  const rows = await dataSource.query(`SELECT COUNT(*) AS c FROM customers`) as Array<{ c: number | string }>;
  return Number(rows[0]?.c ?? 0);
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_pub_book_idem_${Date.now()}`;
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
    await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await adminConnection.query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    summary.phases.databaseCreate = "PASS";

    dataSource = new DataSource({ ...options, database: databaseName });
    await dataSource.initialize();
    await dataSource.runMigrations();
    summary.phases.migrations = "PASS";

    await verifyDatabaseSchema(dataSource);
    summary.phases.schemaVerify = "PASS";

    const token = randomUUID().slice(0, 8);
    const orgRepo = dataSource.getRepository(OrganizationEntity);
    const orgA = await orgRepo.save(orgRepo.create({
      name: `Public Book Idem A ${token}`,
      slug: `pub-book-idem-a-${token}`,
      is_active: true,
    }));
    const orgB = await orgRepo.save(orgRepo.create({
      name: `Public Book Idem B ${token}`,
      slug: `pub-book-idem-b-${token}`,
      is_active: true,
    }));

    const service = new PublicBookingsService(dataSource);
    const input = minimalBookingPayload();
    const idempotencyKey = randomUUID();

    await expectPass(summary, "A same idempotency key submitted twice creates one lead", async () => {
      const before = await countLeads(dataSource!);
      const first = await service.createBooking({
        organizationId: orgA.id,
        input,
        idempotencyKeyHeader: idempotencyKey,
      });
      const second = await service.createBooking({
        organizationId: orgA.id,
        input,
        idempotencyKeyHeader: idempotencyKey,
      });
      const after = await countLeads(dataSource!);
      if (first.duplicate || !second.duplicate) {
        throw new Error(`Expected first duplicate=false and second duplicate=true, got ${first.duplicate}/${second.duplicate}`);
      }
      if (first.leadId !== second.leadId) {
        throw new Error("Expected same leadId for idempotent replay.");
      }
      if (after !== before + 1) {
        throw new Error(`Expected one new lead, got ${before} -> ${after}`);
      }
      return { leadId: first.leadId };
    });

    await expectPass(summary, "B concurrent requests with same idempotency key create one lead", async () => {
      const concurrentKey = randomUUID();
      const concurrentInput = minimalBookingPayload({
        phone: "5553334444",
        email: "concurrent@example.com",
        serviceAddressLine1: "300 Concurrent Ave",
      });
      const before = await countLeads(dataSource!);
      const [left, right] = await Promise.all([
        service.createBooking({
          organizationId: orgA.id,
          input: concurrentInput,
          idempotencyKeyHeader: concurrentKey,
        }),
        service.createBooking({
          organizationId: orgA.id,
          input: concurrentInput,
          idempotencyKeyHeader: concurrentKey,
        }),
      ]);
      const after = await countLeads(dataSource!);
      if (left.leadId !== right.leadId) {
        throw new Error("Concurrent idempotent requests returned different lead IDs.");
      }
      if (after !== before + 1) {
        throw new Error(`Expected one lead from concurrent requests, got ${before} -> ${after}`);
      }
      return { leadId: left.leadId };
    });

    await expectPass(summary, "C different legitimate requests same customer create separate leads", async () => {
      const sharedContact = {
        fullName: "Repeat Patron",
        phone: "5557778888",
        email: "repeat@example.com",
      };
      const before = await countLeads(dataSource!);
      const first = await service.createBooking({
        organizationId: orgA.id,
        input: minimalBookingPayload({
          ...sharedContact,
          serviceAddressLine1: "400 First Service Rd",
          serviceType: "inspection",
        }),
        idempotencyKeyHeader: randomUUID(),
      });
      const second = await service.createBooking({
        organizationId: orgA.id,
        input: minimalBookingPayload({
          ...sharedContact,
          serviceAddressLine1: "401 Second Service Rd",
          serviceType: "repair",
        }),
        idempotencyKeyHeader: randomUUID(),
      });
      const after = await countLeads(dataSource!);
      if (first.leadId === second.leadId) {
        throw new Error("Distinct service requests must not collapse to one lead.");
      }
      if (after !== before + 2) {
        throw new Error(`Expected two new leads, got ${before} -> ${after}`);
      }
      return { firstLeadId: first.leadId, secondLeadId: second.leadId };
    });

    await expectPass(summary, "D cross-org same payload creates separate leads", async () => {
      const crossOrgInput = minimalBookingPayload({
        phone: "5559990000",
        email: "crossorg@example.com",
        serviceAddressLine1: "500 Cross Org Blvd",
      });
      const before = await countLeads(dataSource!);
      const orgAResult = await service.createBooking({
        organizationId: orgA.id,
        input: crossOrgInput,
        idempotencyKeyHeader: randomUUID(),
      });
      const orgBResult = await service.createBooking({
        organizationId: orgB.id,
        input: crossOrgInput,
        idempotencyKeyHeader: randomUUID(),
      });
      const after = await countLeads(dataSource!);
      if (orgAResult.leadId === orgBResult.leadId) {
        throw new Error("Cross-org submissions must not share lead IDs.");
      }
      if (after !== before + 2) {
        throw new Error(`Expected two org-scoped leads, got ${before} -> ${after}`);
      }
      return { orgALeadId: orgAResult.leadId, orgBLeadId: orgBResult.leadId };
    });

    await expectPass(summary, "E forced failure after customer insert rolls back customer row", async () => {
      const beforeCustomers = await countCustomers(dataSource!);
      const beforeLeads = await countLeads(dataSource!);
      try {
        await service.createBooking({
          organizationId: orgA.id,
          input: minimalBookingPayload({
            phone: "5551212121",
            email: "rollback@example.com",
            serviceAddressLine1: "600 Rollback Rd",
          }),
          idempotencyKeyHeader: randomUUID(),
          testHooks: {
            afterCustomerInsert: async () => {
              throw new Error("forced_customer_insert_failure");
            },
          },
        });
        throw new Error("Expected forced failure");
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "forced_customer_insert_failure") {
          throw error;
        }
      }
      const afterCustomers = await countCustomers(dataSource!);
      const afterLeads = await countLeads(dataSource!);
      if (afterCustomers !== beforeCustomers || afterLeads !== beforeLeads) {
        throw new Error(`Expected rollback with no new rows: customers ${beforeCustomers}->${afterCustomers}, leads ${beforeLeads}->${afterLeads}`);
      }
      return { beforeCustomers, afterCustomers };
    });

    await expectPass(summary, "F fingerprint replay without header returns same lead", async () => {
      const fingerprintInput = minimalBookingPayload({
        phone: "5553434343",
        email: "fingerprint@example.com",
        serviceAddressLine1: "700 Fingerprint Way",
      });
      const before = await countLeads(dataSource!);
      const first = await service.createBooking({ organizationId: orgA.id, input: fingerprintInput });
      const second = await service.createBooking({ organizationId: orgA.id, input: fingerprintInput });
      const after = await countLeads(dataSource!);
      if (!second.duplicate || first.leadId !== second.leadId) {
        throw new Error("Expected fingerprint-based durable replay.");
      }
      if (after !== before + 1) {
        throw new Error(`Expected one lead from fingerprint replay, got ${before} -> ${after}`);
      }
      return { leadId: first.leadId };
    });

    await expectPass(summary, "G rate limit rejects excessive submissions", async () => {
      const rateInput = minimalBookingPayload({
        phone: "5555656565",
        email: "ratelimit@example.com",
        serviceAddressLine1: "800 Rate Limit Loop",
      });
      const clientIpHash = `test-ip-${randomUUID()}`;
      for (let index = 0; index < 10; index += 1) {
        await service.createBooking({
          organizationId: orgA.id,
          input: {
            ...rateInput,
            serviceAddressLine1: `800 Rate Limit Loop #${index}`,
            serviceType: index % 2 === 0 ? "inspection" : "repair",
          },
          idempotencyKeyHeader: randomUUID(),
          clientIpHash,
        });
      }

      try {
        await service.createBooking({
          organizationId: orgA.id,
          input: {
            ...rateInput,
            serviceAddressLine1: "800 Rate Limit Loop overflow",
            serviceType: "cleaning",
          },
          idempotencyKeyHeader: randomUUID(),
          clientIpHash,
        });
        throw new Error("Expected rate limit rejection");
      } catch (error) {
        const code = extractErrorCode(error);
        if (code !== "public_booking_rate_limited") {
          throw error;
        }
      }

      return { limited: true };
    });

    summary.phases.tests = summary.results.every((result) => result.status === "PASS") ? "PASS" : "FAIL";
  } catch (error) {
    summary.errors.push(extractErrorCode(error));
  } finally {
    try {
      if (dataSource?.isInitialized) {
        await dataSource.destroy();
      }
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
      summary.phases.cleanup = "PASS";
    } catch (error) {
      summary.errors.push(`cleanup: ${extractErrorCode(error)}`);
    } finally {
      await adminConnection.end();
    }
  }

  summary.ok = summary.errors.length === 0 && summary.results.every((result) => result.status === "PASS");
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
