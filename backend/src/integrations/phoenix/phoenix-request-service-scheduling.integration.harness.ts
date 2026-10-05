import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { BranchScopeService } from "../../crm/branch-scope.service";
import { BranchEntity } from "../../database/entities/branch.entity";
import { CustomerEntity } from "../../database/entities/customer.entity";
import { InvoiceEntity } from "../../database/entities/invoice.entity";
import { JobEntity } from "../../database/entities/job.entity";
import { MembershipBranchAccessEntity } from "../../database/entities/membership-branch-access.entity";
import { OrganizationEntity } from "../../database/entities/organization.entity";
import { QuoteEntity } from "../../database/entities/quote.entity";
import { buildDataSourceOptions } from "../../database/typeorm.config";
import { verifyDatabaseSchema } from "../../database/verify-schema";
import { applyPhoenixRequestServiceSmokeSchema } from "./phoenix-request-service-smoke-bootstrap";
import { PhoenixIntegrationAuthService } from "./phoenix-integration-auth.service";
import { parsePhoenixRequestServiceLiveTimingLocation } from "./phoenix-location-resolution";
import {
  PhoenixRequestServiceIntegrationService,
  type PhoenixRequestServicePayload,
} from "./phoenix-request-service-integration.service";
import {
  compareIsoDates,
  enumerateIsoDates,
  getBookingHorizonBounds,
  utcTodayIsoDate,
  validateAvailabilityRangeQuery,
} from "./phoenix-scheduling.constants";
import { isoDateKeyFromUtcInstant, zonedLocalDateTimeToUtc } from "./phoenix-scheduling-timezone";

type HarnessStatus = "PASS" | "FAIL" | "SKIP";

type HarnessResult = {
  name: string;
  status: HarnessStatus;
  detail?: unknown;
};

type HarnessSummary = {
  ok: boolean;
  database: string | null;
  results: HarnessResult[];
  errors: string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
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

function expectApiError(run: () => void, code: string) {
  try {
    run();
    throw new Error(`expected api error ${code}`);
  } catch (error) {
    if (!(error instanceof HttpException)) {
      throw error;
    }
    const response = error.getResponse() as { error?: { code?: string } };
    if (response?.error?.code !== code) {
      throw new Error(`expected ${code}, got ${response?.error?.code ?? "unknown"}`);
    }
  }
}

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Phoenix request-service harness supports MySQL only.");
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

function minimalPayload(requestId: string, scheduling: PhoenixRequestServicePayload["scheduling"]): PhoenixRequestServicePayload {
  return {
    requestId,
    customer: {
      fullName: "Harness Patron",
      phone: "4035550199",
      email: "harness@example.com",
    },
    serviceAddress: {
      line1: "100 Harness Way",
      line2: null,
      city: "Calgary",
      region: "AB",
      postalCode: "T2P1J9",
    },
    service: { type: "repair", originalService: "Gas Fireplace Repair" },
    request: { description: "harness", urgency: null, preferredDay: null, preferredTime: null },
    attribution: {
      source: "website",
      city: "calgary",
      cta: null,
      sourceUrl: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    },
    scheduling,
  };
}

function buildService(dataSource: DataSource, organizationId: string) {
  const authStub = {
    getIntegrationOrganizationId: () => organizationId,
  } as PhoenixIntegrationAuthService;

  const branchScopeService = new BranchScopeService(
    dataSource.getRepository(BranchEntity),
    dataSource.getRepository(MembershipBranchAccessEntity),
    dataSource.getRepository(JobEntity),
    dataSource.getRepository(QuoteEntity),
    dataSource.getRepository(InvoiceEntity),
    dataSource,
  );

  const portalBookingStub = {
    sendBookingConfirmationWithPortalAccess: async () => ({ status: "code_sent", expiresAt: null }),
  };
  const portalIdentityStub = {
    ensurePortalIdentityForCustomer: async (customerId: string) => ({ id: "identity", customer_id: customerId }),
  };

  return new PhoenixRequestServiceIntegrationService(
    dataSource,
    branchScopeService,
    authStub,
    portalIdentityStub as never,
    portalBookingStub as never,
  );
}

async function seedCustomer(dataSource: DataSource, organizationId: string) {
  const repo = dataSource.getRepository(CustomerEntity);
  return repo.save(
    repo.create({
      organization_id: organizationId,
      full_name: "Harness Customer",
      phone: "4035550100",
      email: "customer@example.com",
      service_address_line_1: "1 Seed St",
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T2P1J9",
      source: "website",
      lifecycle_status: "prospect",
    }),
  );
}

async function countLeads(dataSource: DataSource) {
  const rows = (await dataSource.query(`SELECT COUNT(*) AS c FROM leads`)) as Array<{ c: number | string }>;
  return Number(rows[0]?.c ?? 0);
}

async function countJobs(dataSource: DataSource) {
  const rows = (await dataSource.query(`SELECT COUNT(*) AS c FROM jobs`)) as Array<{ c: number | string }>;
  return Number(rows[0]?.c ?? 0);
}

function runContractChecks(summary: HarnessSummary) {
  try {
    assert(parsePhoenixRequestServiceLiveTimingLocation("calgary") === "calgary", "calgary");
    assert(parsePhoenixRequestServiceLiveTimingLocation("ottawa") === "ottawa", "ottawa");
    expectApiError(() => parsePhoenixRequestServiceLiveTimingLocation("edmonton"), "invalid_phoenix_location");

    const ref = "2026-10-15";
    assert(validateAvailabilityRangeQuery("2026-10-01", "2026-10-31", ref).ok, "31-day ok");
    const bad = validateAvailabilityRangeQuery("2026-10-01", "2026-11-01", ref);
    assert(!bad.ok && bad.code === "availability_range_too_large", "32-day reject");

    const ab = zonedLocalDateTimeToUtc("2026-07-15", "09:00", "AB");
    assert(ab.toISOString() === "2026-07-15T15:00:00.000Z", "MDT offset");
    assert(isoDateKeyFromUtcInstant(ab, "AB") === "2026-07-15", "date key");

    summary.results.push({ name: "contract: location, horizon, timezone", status: "PASS" });
  } catch (error) {
    summary.results.push({ name: "contract: location, horizon, timezone", status: "FAIL", detail: extractErrorCode(error) });
    summary.errors.push(extractErrorCode(error));
  }
}

async function runDatabaseChecks(summary: HarnessSummary) {
  if (process.env.PHOENIX_RS_HARNESS_SKIP_DB?.trim().toLowerCase() === "true") {
    summary.results.push({ name: "db: integration (skipped)", status: "SKIP", detail: "PHOENIX_RS_HARNESS_SKIP_DB=true" });
    return;
  }

  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_phoenix_rs_${Date.now()}`;
  summary.database = databaseName;

  const adminConnection = await mysql.createConnection({
    host: options.host,
    port: options.port,
    user: options.username,
    password: options.password,
    multipleStatements: true,
  });

  let dataSource: DataSource | null = null;

  const record = (name: string, run: () => Promise<void>) =>
    run()
      .then(() => {
        summary.results.push({ name, status: "PASS" });
      })
      .catch((error) => {
        summary.results.push({ name, status: "FAIL", detail: extractErrorCode(error) });
        summary.errors.push(`${name}: ${extractErrorCode(error)}`);
      });

  try {
    await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await adminConnection.query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );

    dataSource = new DataSource({ ...options, database: databaseName });
    await dataSource.initialize();
    await applyPhoenixRequestServiceSmokeSchema(dataSource);
    await verifyDatabaseSchema(dataSource);

    const token = randomUUID().slice(0, 8);
    const org = await dataSource.getRepository(OrganizationEntity).save(
      dataSource.getRepository(OrganizationEntity).create({
        name: `Phoenix RS ${token}`,
        slug: `phoenix-rs-${token}`,
        is_active: true,
      }),
    );

    const branchRepo = dataSource.getRepository(BranchEntity);
    const abBranch = await branchRepo.save(
      branchRepo.create({
        organization_id: org.id,
        name: "Alberta",
        code: "AB",
        active: true,
        sort_order: 0,
      }),
    );
    await branchRepo.save(
      branchRepo.create({
        organization_id: org.id,
        name: "Ontario",
        code: "ON",
        active: true,
        sort_order: 1,
      }),
    );

    const service = buildService(dataSource, org.id);
    const customer = await seedCustomer(dataSource, org.id);
    const todayIso = utcTodayIsoDate();
    const { horizonStart, horizonEnd } = getBookingHorizonBounds(todayIso);
    const horizonDates = enumerateIsoDates(horizonStart, horizonEnd);
    const bookDate = horizonDates[0];
    const raceDate = horizonDates[Math.min(1, horizonDates.length - 1)];
    const fakeRequest = { get: () => undefined } as unknown as import("express").Request;

    await record("db: horizon reference", async () => {
      assert(compareIsoDates(horizonStart, todayIso) <= 0, "horizon start");
      assert(compareIsoDates(horizonEnd, horizonStart) >= 0, "horizon end");
    });

    await record("db: branch isolation", async () => {
      await dataSource!.getRepository(JobEntity).save(
        dataSource!.getRepository(JobEntity).create({
          organization_id: org.id,
          branch_id: abBranch.id,
          customer_id: customer.id,
          title: "Block AB",
          lead_source: "website",
          requested_service_type: "repair",
          job_type: "installation_repair",
          status: "scheduled",
          service_address_line_1: "1 St",
          service_city: "Calgary",
          service_postal_code: "T2P1J9",
          scheduled_for: zonedLocalDateTimeToUtc(bookDate, "09:00", "AB"),
          scheduled_window: "09:00-11:00",
        }),
      );

      const calgary = await service.getAvailabilityRange("calgary", bookDate, bookDate);
      const ottawa = await service.getAvailabilityRange("ottawa", bookDate, bookDate);
      const calgarySlot = calgary.days[0]?.slots.find((slot) => slot.start === "09:00");
      const ottawaSlot = ottawa.days[0]?.slots.find((slot) => slot.start === "09:00");
      assert(calgarySlot && !calgarySlot.available, "calgary blocked");
      assert(ottawaSlot?.available, "ottawa open");
    });

    await record("db: cancellation releases slot", async () => {
      await dataSource!.getRepository(JobEntity).update(
        { organization_id: org.id, branch_id: abBranch.id, scheduled_window: "09:00-11:00" },
        { status: "cancelled" },
      );
      const calgary = await service.getAvailabilityRange("calgary", bookDate, bookDate);
      const slot = calgary.days[0]?.slots.find((entry) => entry.start === "09:00");
      assert(slot?.available, "cancelled releases");
    });

    await record("db: multi-day availability range", async () => {
      const rangeFrom = bookDate;
      const rangeTo = raceDate;
      assert(compareIsoDates(rangeFrom, rangeTo) <= 0, "range order");

      await dataSource!.getRepository(JobEntity).save(
        dataSource!.getRepository(JobEntity).create({
          organization_id: org.id,
          branch_id: abBranch.id,
          customer_id: customer.id,
          title: "Range day one",
          lead_source: "website",
          requested_service_type: "repair",
          job_type: "installation_repair",
          status: "scheduled",
          service_address_line_1: "1 St",
          service_city: "Calgary",
          service_postal_code: "T2P1J9",
          scheduled_for: zonedLocalDateTimeToUtc(rangeFrom, "15:00", "AB"),
          scheduled_window: "15:00-17:00",
        }),
      );

      await dataSource!.getRepository(JobEntity).save(
        dataSource!.getRepository(JobEntity).create({
          organization_id: org.id,
          branch_id: abBranch.id,
          customer_id: customer.id,
          title: "Range day two",
          lead_source: "website",
          requested_service_type: "repair",
          job_type: "installation_repair",
          status: "scheduled",
          service_address_line_1: "2 St",
          service_city: "Calgary",
          service_postal_code: "T2P1J9",
          scheduled_for: zonedLocalDateTimeToUtc(rangeTo, "09:00", "AB"),
          scheduled_window: "09:00-11:00",
        }),
      );

      const calgaryRange = await service.getAvailabilityRange("calgary", rangeFrom, rangeTo);
      assert(calgaryRange.days.length >= 2, "multi-day span returned");

      const dayOne = calgaryRange.days.find((day) => day.date === rangeFrom);
      const dayTwo = calgaryRange.days.find((day) => day.date === rangeTo);
      assert(dayOne && dayTwo, "expected range days present");

      const dayOneBlocked = dayOne.slots.find((slot) => slot.start === "15:00");
      const dayTwoBlocked = dayTwo.slots.find((slot) => slot.start === "09:00");
      const dayOneOpen = dayOne.slots.find((slot) => slot.start === "09:00");
      assert(dayOneBlocked && !dayOneBlocked.available, "day one window blocked");
      assert(dayTwoBlocked && !dayTwoBlocked.available, "day two window blocked");
      assert(dayOneOpen?.available, "other windows still available");

      const ottawaRange = await service.getAvailabilityRange("ottawa", rangeFrom, rangeTo);
      const ottawaDayOne = ottawaRange.days.find((day) => day.date === rangeFrom);
      const ottawaDayTwo = ottawaRange.days.find((day) => day.date === rangeTo);
      assert(
        ottawaDayOne?.slots.every((slot) => slot.available) &&
          ottawaDayTwo?.slots.every((slot) => slot.available),
        "ottawa range unaffected by AB jobs",
      );
    });

    const requestId = randomUUID();
    await record("db: idempotent booking replay", async () => {
      const leadsBefore = await countLeads(dataSource!);
      const jobsBefore = await countJobs(dataSource!);
      const payload = minimalPayload(requestId, {
        location: "calgary",
        preferredDate: bookDate,
        timeWindow: { start: "11:00", end: "13:00" },
      });
      const first = await service.submitRequest(payload, fakeRequest);
      const leadsAfterFirst = await countLeads(dataSource!);
      const jobsAfterFirst = await countJobs(dataSource!);
      assert(leadsAfterFirst === leadsBefore + 1, "first submit creates one lead");
      assert(jobsAfterFirst === jobsBefore + 1, "first submit creates one job");

      const second = await service.submitRequest(payload, fakeRequest);
      const leadsAfterSecond = await countLeads(dataSource!);
      const jobsAfterSecond = await countJobs(dataSource!);

      assert(first.leadId === second.leadId, "idempotent leadId");
      assert(first.jobId && first.jobId === second.jobId, "idempotent jobId");
      assert(leadsAfterSecond === leadsAfterFirst, "replay must not create lead");
      assert(jobsAfterSecond === jobsAfterFirst, "replay must not create job");
    });

    await record("db: concurrent slot race", async () => {
      const leadsBefore = await countLeads(dataSource!);
      const jobsBefore = await countJobs(dataSource!);
      const slotDate = raceDate;
      const payloadA = minimalPayload(randomUUID(), {
        location: "calgary",
        preferredDate: slotDate,
        timeWindow: { start: "13:00", end: "15:00" },
      });
      const payloadB = minimalPayload(randomUUID(), {
        location: "calgary",
        preferredDate: slotDate,
        timeWindow: { start: "13:00", end: "15:00" },
      });
      payloadB.customer.phone = "4035550200";
      payloadB.customer.email = "harness-race-b@example.com";

      const [outcomeA, outcomeB] = await Promise.allSettled([
        service.submitRequest(payloadA, fakeRequest),
        service.submitRequest(payloadB, fakeRequest),
      ]);

      let successCount = 0;
      let slotUnavailableCount = 0;
      for (const outcome of [outcomeA, outcomeB]) {
        if (outcome.status === "fulfilled") {
          successCount += 1;
          continue;
        }
        if (extractErrorCode(outcome.reason) === "SLOT_UNAVAILABLE") {
          slotUnavailableCount += 1;
        }
      }

      assert(successCount === 1, "exactly one booking succeeds");
      assert(slotUnavailableCount === 1, "exactly one SLOT_UNAVAILABLE");

      const leadsAfter = await countLeads(dataSource!);
      const jobsAfter = await countJobs(dataSource!);
      assert(leadsAfter === leadsBefore + 1, "race creates one lead");
      assert(jobsAfter === jobsBefore + 1, "race creates one job");
    });
  } catch (error) {
    const detail = extractErrorCode(error);
    summary.errors.push(`db setup: ${detail}`);
    summary.results.push({ name: "db: setup", status: "FAIL", detail });
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (summary.database) {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${summary.database}\``).catch(() => undefined);
    }
    await adminConnection.end();
  }
}

async function main() {
  const summary: HarnessSummary = {
    ok: false,
    database: null,
    results: [],
    errors: [],
  };

  runContractChecks(summary);
  await runDatabaseChecks(summary);

  summary.ok = summary.errors.length === 0 && !summary.results.some((result) => result.status === "FAIL");
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
