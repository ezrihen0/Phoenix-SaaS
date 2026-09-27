import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { HttpException } from "@nestjs/common";
import { DataSource, Like } from "typeorm";

import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";
import { InvoicePaymentRecordingService } from "../crm/invoice-payment-recording.service";
import {
  NativeInvoicePaidRequiresLedgerError,
  resolveNativeUpsertInvoiceStatus,
} from "../crm/invoice-native-ledger-policy";
import { resolveSmokeDatabasePlan, useConfiguredSmokeDatabase } from "./db-smoke-database-plan";
import { requireMySqlOptions } from "./estimate-invoice-conversion-smoke.harness";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { UserEntity } from "./entities/user.entity";
import { verifyDatabaseSchema } from "./verify-schema";

type CategoryStatus = "PASS" | "FAIL" | "SKIP";

type VerificationReport = {
  dbSmokeEnvironment: string;
  configuredDatabaseMode: boolean;
  categories: {
    ledgerLifecycleSequence: CategoryStatus;
    idempotency: CategoryStatus;
    tenantNegatives: CategoryStatus;
    statusDriftGuard: CategoryStatus;
    refundContract: CategoryStatus;
    phase5Regression: CategoryStatus;
  };
  outcome: CategoryStatus;
  details: Record<string, unknown>;
  errors: string[];
};

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

async function seedInvoiceFixture(dataSource: DataSource, label: string) {
  const token = randomUUID().slice(0, 8);
  const totalCents = 10_000;

  const organization = await dataSource.getRepository(OrganizationEntity).save(
    dataSource.getRepository(OrganizationEntity).create({
      name: `Phase6 Ledger ${label} ${token}`,
      slug: `phase6-ledger-${label}-${token}`.toLowerCase(),
      is_active: true,
    }),
  );

  const user = await dataSource.getRepository(UserEntity).save(
    dataSource.getRepository(UserEntity).create({
      email: `phase6-ledger-${label}-${token}@example.com`,
      password_hash: "smoke-test-password-hash",
      is_active: true,
    }),
  );

  const profile = await dataSource.getRepository(ProfileEntity).save(
    dataSource.getRepository(ProfileEntity).create({
      auth_user_id: user.id,
      full_name: `Phase6 Owner ${token}`,
      phone: "5551000200",
      role: "owner",
    }),
  );

  const customer = await dataSource.getRepository(CustomerEntity).save(
    dataSource.getRepository(CustomerEntity).create({
      organization_id: organization.id,
      full_name: `Phase6 Customer ${token}`,
      phone: "5551000201",
      email: null,
      company_name: null,
      service_address_line_1: "200 Ledger Lane",
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
      title: `Phase6 Job ${token}`,
      description: "Phase 6 ledger verification",
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
      description: "Phase 6 ledger invoice",
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
    invoiceId: invoice.id,
    totalCents,
  };
}

function buildRecordingService(dataSource: DataSource) {
  return new InvoicePaymentRecordingService(dataSource, new InvoicePaymentLedgerService());
}

async function cleanupOrganizations(dataSource: DataSource) {
  const orgs = await dataSource.getRepository(OrganizationEntity).find({
    where: { slug: Like("phase6-ledger-%") },
  });

  for (const org of orgs) {
    await dataSource.getRepository(InvoiceEntity).delete({ organization_id: org.id });
    await dataSource.getRepository(JobEntity).delete({ organization_id: org.id });
    await dataSource.getRepository(CustomerEntity).delete({ organization_id: org.id });
    await dataSource.getRepository(OrganizationEntity).delete({ id: org.id });
  }
}

async function runPhase5Regression(): Promise<void> {
  const { execSync } = await import("node:child_process");
  execSync("npm run finance-part5:configured-db-verification", {
    cwd: process.cwd(),
    stdio: "pipe",
    env: {
      ...process.env,
      FINANCE_SMOKE_USE_CONFIGURED_DATABASE: "true",
    },
  });
}

async function main() {
  const configured = useConfiguredSmokeDatabase();
  const options = requireMySqlOptions();
  const plan = resolveSmokeDatabasePlan(options, "wizfield_invoice_ledger_phase6_verify");

  const report: VerificationReport = {
    dbSmokeEnvironment: configured
      ? `${plan.databaseName}@127.0.0.1 (configured, non-production)`
      : `${plan.databaseName} (ephemeral)`,
    configuredDatabaseMode: configured,
    categories: {
      ledgerLifecycleSequence: configured ? "FAIL" : "SKIP",
      idempotency: configured ? "FAIL" : "SKIP",
      tenantNegatives: configured ? "FAIL" : "SKIP",
      statusDriftGuard: configured ? "FAIL" : "SKIP",
      refundContract: configured ? "FAIL" : "SKIP",
      phase5Regression: configured ? "FAIL" : "SKIP",
    },
    outcome: "FAIL",
    details: {},
    errors: [],
  };

  if (!configured) {
    report.errors.push("configured_database_required: set FINANCE_SMOKE_USE_CONFIGURED_DATABASE=true");
    report.outcome = "SKIP";
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const dataSource = new DataSource({
    ...options,
    database: plan.databaseName,
    synchronize: false,
    migrationsRun: false,
    logging: false,
  });

  try {
    await dataSource.initialize();
    await verifyDatabaseSchema(dataSource);

    const recording = buildRecordingService(dataSource);
    const fixture = await seedInvoiceFixture(dataSource, "main");
    const baseInput = {
      organizationId: fixture.organizationId,
      invoiceId: fixture.invoiceId,
      actorUserId: fixture.userId,
      actorProfileId: fixture.profileId,
    };

    try {
      const unpaid = await recording.recordNativePayment({
        ...baseInput,
        payload: {
          idempotencyKey: randomUUID(),
          entryType: "payment",
          amountCents: 0,
          method: "cash",
          reference: null,
          note: "should fail",
          occurredAt: null,
        },
      });
      assert.fail(`expected_zero_payment_rejection got ${JSON.stringify(unpaid)}`);
    } catch (error) {
      assert.match(String(extractErrorCode(error)), /invalid_invoice_payment_amount|greater than zero/i);
    }

    let ledger = (await recording.recordNativePayment({
      ...baseInput,
      payload: {
        idempotencyKey: randomUUID(),
        entryType: "payment",
        amountCents: 4_000,
        method: "cash",
        reference: null,
        note: "partial",
        occurredAt: null,
      },
    })).ledger;

    assert.equal(ledger.lifecycleStatus, "partial");
    assert.equal(ledger.netPaidCents, 4_000);
    assert.equal(ledger.balanceCents, 6_000);

    ledger = (await recording.recordNativePayment({
      ...baseInput,
      payload: {
        idempotencyKey: randomUUID(),
        entryType: "payment",
        amountCents: 6_000,
        method: "check",
        reference: null,
        note: "full",
        occurredAt: null,
      },
    })).ledger;

    assert.equal(ledger.lifecycleStatus, "paid");
    assert.equal(ledger.balanceCents, 0);

    ledger = (await recording.recordNativePayment({
      ...baseInput,
      payload: {
        idempotencyKey: randomUUID(),
        entryType: "payment",
        amountCents: 2_000,
        method: "cash",
        reference: null,
        note: "overpay",
        occurredAt: null,
      },
    })).ledger;

    assert.equal(ledger.lifecycleStatus, "overpaid");
    assert.equal(ledger.overpaymentCents, 2_000);

    report.categories.ledgerLifecycleSequence = "PASS";
    report.details.ledgerLifecycleSequence = {
      netPaidCents: ledger.netPaidCents,
      overpaymentCents: ledger.overpaymentCents,
    };

    const idempotencyKey = randomUUID();
    const first = await recording.recordNativePayment({
      ...baseInput,
      payload: {
        idempotencyKey,
        entryType: "payment",
        amountCents: 100,
        method: "cash",
        reference: null,
        note: "idempotent",
        occurredAt: null,
      },
    });
    const second = await recording.recordNativePayment({
      ...baseInput,
      payload: {
        idempotencyKey,
        entryType: "payment",
        amountCents: 100,
        method: "cash",
        reference: null,
        note: "idempotent retry",
        occurredAt: null,
      },
    });
    assert.equal(first.paymentId, second.paymentId);
    assert.equal(second.idempotent, true);
    report.categories.idempotency = "PASS";

    const orgA = await seedInvoiceFixture(dataSource, "tenant-a");
    const orgB = await seedInvoiceFixture(dataSource, "tenant-b");
    try {
      await recording.recordNativePayment({
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
          note: "cross org",
          occurredAt: null,
        },
      });
      assert.fail("expected_cross_org_failure");
    } catch (error) {
      assert.match(String(extractErrorCode(error)), /invoice_not_found/i);
    }
    report.categories.tenantNegatives = "PASS";

    try {
      resolveNativeUpsertInvoiceStatus({
        requestedStatus: "paid",
        totalCents: 10_000,
        existingStatus: "unpaid",
        existingPaidAt: null,
        payments: [],
        financeOrigin: "native_wizfield",
      });
      assert.fail("expected_paid_requires_ledger");
    } catch (error) {
      assert.ok(error instanceof NativeInvoicePaidRequiresLedgerError);
    }
    report.categories.statusDriftGuard = "PASS";

    const refundFixture = await seedInvoiceFixture(dataSource, "refund");
    await recording.recordNativePayment({
      organizationId: refundFixture.organizationId,
      invoiceId: refundFixture.invoiceId,
      actorUserId: refundFixture.userId,
      actorProfileId: refundFixture.profileId,
      payload: {
        idempotencyKey: randomUUID(),
        entryType: "payment",
        amountCents: 5_000,
        method: "cash",
        reference: null,
        note: "refund seed",
        occurredAt: null,
      },
    });

    const afterRefund = await recording.recordNativePayment({
      organizationId: refundFixture.organizationId,
      invoiceId: refundFixture.invoiceId,
      actorUserId: refundFixture.userId,
      actorProfileId: refundFixture.profileId,
      payload: {
        idempotencyKey: randomUUID(),
        entryType: "refund",
        amountCents: 5_000,
        method: "cash",
        reference: null,
        note: "full refund",
        occurredAt: null,
      },
    });

    assert.equal(afterRefund.ledger.lifecycleStatus, "refunded");
    assert.equal(afterRefund.ledger.netPaidCents, 0);
    report.categories.refundContract = "PASS";

    await runPhase5Regression();
    report.categories.phase5Regression = "PASS";
  } catch (error) {
    report.errors.push(extractErrorCode(error));
  } finally {
    if (dataSource.isInitialized) {
      await cleanupOrganizations(dataSource);
      await dataSource.destroy();
    }
  }

  const failed = Object.values(report.categories).some((value) => value === "FAIL");
  const skipped = Object.values(report.categories).some((value) => value === "SKIP");
  report.outcome = failed ? "FAIL" : skipped ? "SKIP" : "PASS";
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome !== "PASS") {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
