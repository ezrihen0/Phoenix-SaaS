import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource, Repository } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";
import { InvoicePaymentRecordingService } from "../crm/invoice-payment-recording.service";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { UserEntity } from "./entities/user.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { upsertHistoricalWorkizInvoice } from "./workiz/workiz-invoice-upsert";
import { verifyDatabaseSchema } from "./verify-schema";

type SmokeStatus = "PASS" | "FAIL";

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

type PaymentFixture = {
  organizationId: string;
  userId: string;
  profileId: string;
  customerId: string;
  jobId: string;
  invoiceId: string;
  totalCents: number;
};

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Invoice payment recording smoke test currently supports MySQL only.");
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
      tests: "FAIL",
      cleanup: "FAIL",
    },
    results: [],
    errors: [],
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

async function expectFail(summary: SmokeSummary, name: string, run: () => Promise<unknown>) {
  try {
    await run();
    summary.results.push({ name, status: "FAIL", detail: "Expected failure but call succeeded." });
    throw new Error(`${name}: expected failure`);
  } catch (error) {
    summary.results.push({ name, status: "PASS", detail: extractErrorCode(error) });
  }
}

function buildRecordingService(dataSource: DataSource) {
  return new InvoicePaymentRecordingService(
    dataSource,
    new InvoicePaymentLedgerService(),
  );
}

async function seedPaymentFixture(dataSource: DataSource): Promise<PaymentFixture> {
  const token = randomUUID().slice(0, 8);
  const totalCents = 10_000;

  const organization = await dataSource.getRepository(OrganizationEntity).save(
    dataSource.getRepository(OrganizationEntity).create({
      name: `Payment Smoke Org ${token}`,
      slug: `payment-smoke-${token}`,
      is_active: true,
    }),
  );

  const user = await dataSource.getRepository(UserEntity).save(
    dataSource.getRepository(UserEntity).create({
      email: `payment-smoke-${token}@example.com`,
      password_hash: "smoke-test-password-hash",
      is_active: true,
    }),
  );

  const profile = await dataSource.getRepository(ProfileEntity).save(
    dataSource.getRepository(ProfileEntity).create({
      auth_user_id: user.id,
      full_name: `Payment Smoke Owner ${token}`,
      phone: "5551000100",
      role: "owner",
    }),
  );

  const customer = await dataSource.getRepository(CustomerEntity).save(
    dataSource.getRepository(CustomerEntity).create({
      organization_id: organization.id,
      full_name: `Payment Smoke Customer ${token}`,
      phone: "5551000101",
      email: null,
      company_name: null,
      service_address_line_1: "100 Smoke Lane",
      service_address_line_2: null,
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T2P1A1",
      notes: null,
      lifecycle_status: "active",
      preferred_service_type: null,
    }),
  );

  const job = await dataSource.getRepository(JobEntity).save(
    dataSource.getRepository(JobEntity).create({
      organization_id: organization.id,
      customer_id: customer.id,
      service_id: null,
      assigned_technician_id: null,
      title: `Payment Smoke Job ${token}`,
      description: "Smoke fixture job",
      lead_source: "phone",
      requested_service_type: "inspection",
      job_type: "inspection",
      status: "completed",
      service_address_line_1: customer.service_address_line_1,
      service_address_line_2: null,
      service_city: customer.service_city,
      service_state_or_region: customer.service_state_or_region,
      service_postal_code: customer.service_postal_code,
      scheduled_for: new Date(),
      scheduled_window: "morning",
      requested_at: new Date(),
      on_the_way_at: null,
      started_at: null,
      completed_at: new Date(),
      paid_at: null,
      cancellation_reason: null,
      cancelled_at: null,
      cancelled_by: null,
      created_by_auth_user_id: user.id,
      updated_by_auth_user_id: user.id,
    }),
  );

  const invoice = await dataSource.getRepository(InvoiceEntity).save(
    dataSource.getRepository(InvoiceEntity).create({
      organization_id: organization.id,
      job_id: job.id,
      description: "Payment smoke invoice",
      amount_cents: totalCents,
      subtotal_cents: totalCents,
      tax_rate_bps_snapshot: 0,
      tax_cents: 0,
      total_cents: totalCents,
      status: "unpaid",
      issued_at: new Date(),
      due_at: new Date(Date.now() + 86_400_000 * 14),
      paid_at: null,
      approval_requested_at: null,
      approved_at: null,
      signature_requested_at: null,
      signed_at: null,
      signed_by_name: null,
      email_sent_at: null,
      sms_sent_at: null,
      last_sent_at: null,
      last_sent_via: null,
      branding_snapshot_json: null,
    }),
  );

  return {
    organizationId: organization.id,
    userId: user.id,
    profileId: profile.id,
    customerId: customer.id,
    jobId: job.id,
    invoiceId: invoice.id,
    totalCents,
  };
}

async function countPaymentsForInvoice(
  paymentRepo: Repository<InvoicePaymentEntity>,
  invoiceId: string,
) {
  return paymentRepo.count({ where: { invoice_id: invoiceId } });
}

async function runTests(summary: SmokeSummary, dataSource: DataSource) {
  const recordingService = buildRecordingService(dataSource);
  const paymentRepo = dataSource.getRepository(InvoicePaymentEntity);
  const invoiceRepo = dataSource.getRepository(InvoiceEntity);
  const jobRepo = dataSource.getRepository(JobEntity);
  const fixture = await seedPaymentFixture(dataSource);

  const baseInput = {
    organizationId: fixture.organizationId,
    invoiceId: fixture.invoiceId,
    actorUserId: fixture.userId,
    actorProfileId: fixture.profileId,
  };

  await expectPass(summary, "A same idempotency key submitted twice creates one payment row", async () => {
    const idempotencyKey = randomUUID();

    const first = await recordingService.recordNativePayment({
      ...baseInput,
      payload: {
        idempotencyKey,
        entryType: "payment",
        amountCents: 2_500,
        method: "cash",
        reference: null,
        note: "Partial payment A",
        occurredAt: null,
      },
    });

    const second = await recordingService.recordNativePayment({
      ...baseInput,
      payload: {
        idempotencyKey,
        entryType: "payment",
        amountCents: 2_500,
        method: "cash",
        reference: null,
        note: "Partial payment A retry",
        occurredAt: null,
      },
    });

    const paymentCount = await countPaymentsForInvoice(paymentRepo, fixture.invoiceId);
    if (paymentCount !== 1) {
      throw new Error(`expected_one_payment_got_${paymentCount}`);
    }
    if (!second.idempotent || first.paymentId !== second.paymentId) {
      throw new Error("idempotent_retry_mismatch");
    }

    return { paymentCount, paymentId: first.paymentId };
  });

  await expectPass(summary, "B concurrent requests with same idempotency key create one payment row", async () => {
    const partialFixture = await seedPaymentFixture(dataSource);
    const idempotencyKey = randomUUID();
    const input = {
      organizationId: partialFixture.organizationId,
      invoiceId: partialFixture.invoiceId,
      actorUserId: partialFixture.userId,
      actorProfileId: partialFixture.profileId,
      payload: {
        idempotencyKey,
        entryType: "payment" as const,
        amountCents: 1_000,
        method: "cash" as const,
        reference: null,
        note: "Concurrent partial payment",
        occurredAt: null,
      },
    };

    const [first, second] = await Promise.all([
      recordingService.recordNativePayment(input),
      recordingService.recordNativePayment(input),
    ]);

    const paymentCount = await countPaymentsForInvoice(paymentRepo, partialFixture.invoiceId);
    if (paymentCount !== 1) {
      throw new Error(`expected_one_payment_got_${paymentCount}`);
    }
    if (first.paymentId !== second.paymentId) {
      throw new Error("concurrent_payment_ids_differ");
    }

    return { paymentCount, firstIdempotent: first.idempotent, secondIdempotent: second.idempotent };
  });

  await expectPass(summary, "C different idempotency keys allow multiple legitimate payments", async () => {
    const multiFixture = await seedPaymentFixture(dataSource);

    await recordingService.recordNativePayment({
      organizationId: multiFixture.organizationId,
      invoiceId: multiFixture.invoiceId,
      actorUserId: multiFixture.userId,
      actorProfileId: multiFixture.profileId,
      payload: {
        idempotencyKey: randomUUID(),
        entryType: "payment",
        amountCents: 3_000,
        method: "cash",
        reference: null,
        note: "First partial",
        occurredAt: null,
      },
    });

    await recordingService.recordNativePayment({
      organizationId: multiFixture.organizationId,
      invoiceId: multiFixture.invoiceId,
      actorUserId: multiFixture.userId,
      actorProfileId: multiFixture.profileId,
      payload: {
        idempotencyKey: randomUUID(),
        entryType: "payment",
        amountCents: 3_000,
        method: "check",
        reference: null,
        note: "Second partial",
        occurredAt: null,
      },
    });

    const paymentCount = await countPaymentsForInvoice(paymentRepo, multiFixture.invoiceId);
    if (paymentCount !== 2) {
      throw new Error(`expected_two_payments_got_${paymentCount}`);
    }

    return { paymentCount };
  });

  await expectPass(summary, "D forced failure after payment insert rolls back payment row", async () => {
    const rollbackFixture = await seedPaymentFixture(dataSource);
    const beforeCount = await countPaymentsForInvoice(paymentRepo, rollbackFixture.invoiceId);

    try {
      await recordingService.recordNativePayment({
        organizationId: rollbackFixture.organizationId,
        invoiceId: rollbackFixture.invoiceId,
        actorUserId: rollbackFixture.userId,
        actorProfileId: rollbackFixture.profileId,
        payload: {
          idempotencyKey: randomUUID(),
          entryType: "payment",
          amountCents: 1_000,
          method: "cash",
          reference: null,
          note: "Should roll back",
          occurredAt: null,
        },
        testHooks: {
          afterPaymentInsert: async () => {
            throw new Error("TEST_FAIL_AFTER_PAYMENT_INSERT");
          },
        },
      });
      throw new Error("expected_transaction_failure");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("TEST_FAIL_AFTER_PAYMENT_INSERT")) {
        throw error;
      }
    }

    const afterCount = await countPaymentsForInvoice(paymentRepo, rollbackFixture.invoiceId);
    if (afterCount !== beforeCount) {
      throw new Error(`payment_count_changed:${beforeCount}->${afterCount}`);
    }

    return { beforeCount, afterCount };
  });

  await expectPass(summary, "E forced failure after invoice sync rolls back payment and invoice changes", async () => {
    const rollbackFixture = await seedPaymentFixture(dataSource);

    try {
      await recordingService.recordNativePayment({
        organizationId: rollbackFixture.organizationId,
        invoiceId: rollbackFixture.invoiceId,
        actorUserId: rollbackFixture.userId,
        actorProfileId: rollbackFixture.profileId,
        payload: {
          idempotencyKey: randomUUID(),
          entryType: "payment",
          amountCents: rollbackFixture.totalCents,
          method: "cash",
          reference: null,
          note: "Full payment rollback test",
          occurredAt: null,
        },
        testHooks: {
          afterInvoiceSync: async () => {
            throw new Error("TEST_FAIL_AFTER_INVOICE_SYNC");
          },
        },
      });
      throw new Error("expected_transaction_failure");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("TEST_FAIL_AFTER_INVOICE_SYNC")) {
        throw error;
      }
    }

    const paymentCount = await countPaymentsForInvoice(paymentRepo, rollbackFixture.invoiceId);
    const invoice = await invoiceRepo.findOneOrFail({ where: { id: rollbackFixture.invoiceId } });
    if (paymentCount !== 0 || invoice.status !== "unpaid" || invoice.paid_at !== null) {
      throw new Error("invoice_or_payment_not_rolled_back");
    }

    return { paymentCount, invoiceStatus: invoice.status };
  });

  await expectPass(summary, "F forced failure around job/status-event sync rolls back entire workflow", async () => {
    const rollbackFixture = await seedPaymentFixture(dataSource);

    try {
      await recordingService.recordNativePayment({
        organizationId: rollbackFixture.organizationId,
        invoiceId: rollbackFixture.invoiceId,
        actorUserId: rollbackFixture.userId,
        actorProfileId: rollbackFixture.profileId,
        payload: {
          idempotencyKey: randomUUID(),
          entryType: "payment",
          amountCents: rollbackFixture.totalCents,
          method: "cash",
          reference: null,
          note: "Job sync rollback test",
          occurredAt: null,
        },
        testHooks: {
          beforeJobStatusEvent: async () => {
            throw new Error("TEST_FAIL_BEFORE_JOB_STATUS_EVENT");
          },
        },
      });
      throw new Error("expected_transaction_failure");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("TEST_FAIL_BEFORE_JOB_STATUS_EVENT")) {
        throw error;
      }
    }

    const paymentCount = await countPaymentsForInvoice(paymentRepo, rollbackFixture.invoiceId);
    const invoice = await invoiceRepo.findOneOrFail({ where: { id: rollbackFixture.invoiceId } });
    const job = await jobRepo.findOneOrFail({ where: { id: rollbackFixture.jobId } });
    if (paymentCount !== 0 || invoice.status !== "unpaid" || job.status !== "completed" || job.paid_at !== null) {
      throw new Error("job_invoice_payment_not_rolled_back");
    }

    return { paymentCount, invoiceStatus: invoice.status, jobStatus: job.status };
  });

  await expectFail(summary, "G org B cannot record payment against org A invoice", async () => {
    const orgA = await seedPaymentFixture(dataSource);
    const orgB = await seedPaymentFixture(dataSource);

    await recordingService.recordNativePayment({
      organizationId: orgB.organizationId,
      invoiceId: orgA.invoiceId,
      actorUserId: orgB.userId,
      actorProfileId: orgB.profileId,
      payload: {
        idempotencyKey: randomUUID(),
        entryType: "payment",
        amountCents: 500,
        method: "cash",
        reference: null,
        note: "Cross-org attempt",
        occurredAt: null,
      },
    });
  });

  await expectPass(summary, "H Workiz import payment behavior remains intact without idempotency keys", async () => {
    const workizFixture = await seedPaymentFixture(dataSource);
    const historical = {
      invoiceCode: `WZ-${randomUUID().slice(0, 8)}`,
      jobCode: null,
      invoiceDate: new Date("2024-01-15T12:00:00.000Z"),
      dueDate: new Date("2024-02-15T12:00:00.000Z"),
      subtotalCents: 5_000,
      taxCents: 0,
      taxRateBps: 0,
      totalCents: 5_000,
      paid: true,
      paidAt: new Date("2024-01-20T12:00:00.000Z"),
      lineItems: [{
        description: "Historical chimney sweep",
        quantity: 1,
        unitPriceCents: 5_000,
        amountCents: 5_000,
      }],
      payments: [{
        amountCents: 5_000,
        occurredAt: new Date("2024-01-20T12:00:00.000Z"),
        methodLabel: "Cash",
      }],
      notes: null,
      provenance: {},
    };

    const first = await upsertHistoricalWorkizInvoice({
      dataSource,
      organizationId: workizFixture.organizationId,
      customerId: workizFixture.customerId,
      historical,
    });

    const second = await upsertHistoricalWorkizInvoice({
      dataSource,
      organizationId: workizFixture.organizationId,
      customerId: workizFixture.customerId,
      historical,
      existing: {
        invoiceId: first.invoiceId,
        jobId: first.jobId,
      },
    });

    const payments = await paymentRepo.find({ where: { invoice_id: first.invoiceId } });
    if (payments.length !== 1) {
      throw new Error(`expected_one_workiz_payment_got_${payments.length}`);
    }
    if (payments[0]?.idempotency_key !== null) {
      throw new Error("workiz_payment_should_not_set_idempotency_key");
    }
    if (!second.invoiceId || second.invoiceId !== first.invoiceId) {
      throw new Error("workiz_reimport_invoice_mismatch");
    }

    return { paymentCount: payments.length, reference: payments[0]?.reference };
  });
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_invoice_payment_verify_${Date.now()}`;
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

    await runTests(summary, dataSource);
    summary.phases.tests = summary.results.every((result) => result.status === "PASS") ? "PASS" : "FAIL";
  } catch (error) {
    summary.errors.push(extractErrorCode(error));
  } finally {
    try {
      if (dataSource?.isInitialized) {
        await dataSource.destroy();
      }
      if (shouldDrop) {
        await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
      }
      summary.phases.cleanup = "PASS";
    } catch (error) {
      summary.errors.push(`cleanup: ${extractErrorCode(error)}`);
    } finally {
      await adminConnection.end();
    }
  }

  const failedResults = summary.results.filter((result) => result.status === "FAIL");
  summary.ok = summary.errors.length === 0 && failedResults.length === 0;
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
