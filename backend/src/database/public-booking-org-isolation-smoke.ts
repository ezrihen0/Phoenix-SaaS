import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { PublicBookingsService } from "../public/public-bookings.service";
import { CustomerEntity } from "./entities/customer.entity";
import { LeadEntity } from "./entities/lead.entity";
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

type SeededOrgs = {
  orgAId: string;
  orgBId: string;
  slugA: string;
  slugB: string;
  slugInactive: string;
};

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();

  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Public booking isolation smoke test currently supports MySQL only.");
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

function buildPublicBookingService(dataSource: DataSource) {
  return new PublicBookingsService(dataSource);
}

function minimalBookingPayload() {
  return {
    fullName: "Smoke Patron",
    phone: "5551234567",
    email: "smoke@example.com",
    serviceAddressLine1: "100 Test Lane",
    serviceAddressLine2: null,
    serviceCity: "Testville",
    serviceStateOrRegion: null,
    servicePostalCode: "T0T0T0",
    serviceType: "inspection" as const,
    description: "harness booking",
  };
}

async function seedOrganizations(dataSource: DataSource, token: string): Promise<SeededOrgs> {
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const slugA = `pub-book-a-${token}`;
  const slugB = `pub-book-b-${token}`;
  const slugInactive = `pub-book-inact-${token}`;

  const orgA = await orgRepo.save(
    orgRepo.create({
      name: `Public Book Org A ${token}`,
      slug: slugA,
      is_active: true,
    }),
  );
  const orgB = await orgRepo.save(
    orgRepo.create({
      name: `Public Book Org B ${token}`,
      slug: slugB,
      is_active: true,
    }),
  );
  await orgRepo.save(
    orgRepo.create({
      name: `Public Book Inactive ${token}`,
      slug: slugInactive,
      is_active: false,
    }),
  );

  return {
    orgAId: orgA.id,
    orgBId: orgB.id,
    slugA,
    slugB,
    slugInactive,
  };
}

async function countLeads(dataSource: DataSource): Promise<number> {
  const rows = await dataSource.query(`SELECT COUNT(*) AS c FROM leads`) as Array<{ c: number | string }>;
  return Number(rows[0]?.c ?? 0);
}

async function runChecks(summary: SmokeSummary, dataSource: DataSource, seed: SeededOrgs) {
  const service = buildPublicBookingService(dataSource);
  const input = minimalBookingPayload();

  await expectPass(summary, "A — Org A slug booking creates lead with organization_id = Org A", async () => {
    const org = await service.resolveActiveOrganizationBySlug(seed.slugA);
    const result = await service.createBooking({ organizationId: org.id, input });
    const rows = await dataSource.query(
      `SELECT organization_id, customer_id FROM leads WHERE id = ? LIMIT 1`,
      [result.leadId],
    ) as Array<{ organization_id: string | null; customer_id: string | null }>;
    if (rows[0]?.organization_id !== seed.orgAId) {
      throw new Error(`Expected organization_id ${seed.orgAId}, got ${rows[0]?.organization_id}`);
    }
    if (!rows[0]?.customer_id) {
      throw new Error("Expected public booking lead to be linked to a prospect customer.");
    }
    return { leadId: result.leadId, organizationId: rows[0]?.organization_id, customerId: rows[0]?.customer_id };
  });

  await expectPass(summary, "A1 — Replay of same Org A booking returns existing lead", async () => {
    const before = await countLeads(dataSource);
    const result = await service.createBooking({ organizationId: seed.orgAId, input });
    const after = await countLeads(dataSource);
    if (!result.duplicate) {
      throw new Error("Expected duplicate=true for replayed public booking.");
    }
    if (after !== before) {
      throw new Error(`Expected duplicate booking not to add lead: ${before} -> ${after}`);
    }
    return { leadId: result.leadId, duplicate: result.duplicate };
  });

  await expectPass(summary, "A2 — Org B slug booking creates lead with organization_id = Org B", async () => {
    const org = await service.resolveActiveOrganizationBySlug(seed.slugB);
    const result = await service.createBooking({
      organizationId: org.id,
      input: {
        ...input,
        fullName: "Smoke Patron B",
        phone: "5559876543",
      },
    });
    const rows = await dataSource.query(
      `SELECT organization_id FROM leads WHERE id = ? LIMIT 1`,
      [result.leadId],
    ) as Array<{ organization_id: string | null }>;
    if (rows[0]?.organization_id !== seed.orgBId) {
      throw new Error(`Expected organization_id ${seed.orgBId}, got ${rows[0]?.organization_id}`);
    }
    return { leadId: result.leadId };
  });

  await expectPass(summary, "B — Unknown slug does not create a new lead row", async () => {
    const before = await countLeads(dataSource);
    try {
      await service.resolveActiveOrganizationBySlug(`no-such-org-${randomUUID().slice(0, 8)}`);
      throw new Error("Expected booking_unavailable rejection");
    } catch (error) {
      const code = extractErrorCode(error);
      if (code !== "booking_unavailable") {
        throw error;
      }
    }
    const after = await countLeads(dataSource);
    if (after !== before) {
      throw new Error(`Lead count changed after failed resolve: ${before} -> ${after}`);
    }
    return { before, after };
  });

  await expectApiError(
    summary,
    "B2 — Inactive organization slug rejected",
    ["booking_unavailable"],
    () => service.resolveActiveOrganizationBySlug(seed.slugInactive),
  );

  await expectApiError(
    summary,
    "B3 — Malformed slug rejected",
    ["invalid_booking_organization"],
    () => service.resolveActiveOrganizationBySlug("bad_slug!!"),
  );

  await expectApiError(
    summary,
    "B4 — Empty slug rejected",
    ["invalid_booking_organization"],
    () => service.resolveActiveOrganizationBySlug("   "),
  );

  await expectPass(summary, "C — Cross-org: leads created under A and B remain correctly scoped", async () => {
    const aCount = await dataSource.query(
      `SELECT COUNT(*) AS c FROM leads WHERE organization_id = ?`,
      [seed.orgAId],
    ) as Array<{ c: number | string }>;
    const bCount = await dataSource.query(
      `SELECT COUNT(*) AS c FROM leads WHERE organization_id = ?`,
      [seed.orgBId],
    ) as Array<{ c: number | string }>;
    if (Number(aCount[0]?.c) < 1 || Number(bCount[0]?.c) < 1) {
      throw new Error("Expected at least one lead per org from prior steps.");
    }
    return { orgALeads: Number(aCount[0]?.c), orgBLeads: Number(bCount[0]?.c) };
  });
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_pub_book_verify_${Date.now()}`;
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

    const token = randomUUID().slice(0, 8);
    const seed = await seedOrganizations(dataSource, token);
    summary.phases.seeding = "PASS";

    await runChecks(summary, dataSource, seed);
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
