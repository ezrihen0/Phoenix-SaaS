import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "crypto";
import { DataSource, Like } from "typeorm";

import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import { InvoiceCustomerFacingSnapshotService } from "../crm/invoice-customer-facing-snapshot.service";
import { resolveHistoricalDocumentRenderMode } from "../crm/historical-document-render.types";
import {
  INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V3,
  isInvoiceCustomerFacingSnapshotV3,
} from "../crm/invoice-customer-facing-snapshot.types";
import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";
import { InvoicePaymentRecordingService } from "../crm/invoice-payment-recording.service";
import { resolveSmokeDatabasePlan, useConfiguredSmokeDatabase } from "./db-smoke-database-plan";
import { requireMySqlOptions } from "./estimate-invoice-conversion-smoke.harness";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationSettingEntity } from "./entities/organization-setting.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { QuoteLineItemEntity } from "./entities/quote-line-item.entity";
import { UserEntity } from "./entities/user.entity";

type CategoryStatus = "PASS" | "FAIL" | "SKIP";

type VerificationReport = {
  dbSmokeEnvironment: string;
  configuredDatabaseMode: boolean;
  categories: {
    schemaReady: CategoryStatus;
    serviceLocationDistinct: CategoryStatus;
    postFreezeDrift: CategoryStatus;
    paymentAfterFreeze: CategoryStatus;
    estimateFreeze: CategoryStatus;
    legacyLiveRender: CategoryStatus;
  };
  outcome: CategoryStatus;
  details: Record<string, unknown>;
  errors: string[];
};

function hashJson(raw: string | null | undefined) {
  return createHash("sha256").update(raw ?? "").digest("hex");
}

async function cleanupOrganizations(dataSource: DataSource) {
  const orgs = await dataSource.getRepository(OrganizationEntity).find({
    where: { slug: Like("phase7-hist-%") },
  });
  for (const org of orgs) {
    const quotes = await dataSource.getRepository(QuoteEntity).find({
      where: { organization_id: org.id },
      select: { id: true },
    });
    for (const quote of quotes) {
      await dataSource.getRepository(QuoteLineItemEntity).delete({ quote_id: quote.id });
    }
    await dataSource.getRepository(QuoteEntity).delete({ organization_id: org.id });

    const invoices = await dataSource.getRepository(InvoiceEntity).find({
      where: { organization_id: org.id },
      select: { id: true },
    });
    for (const invoice of invoices) {
      await dataSource.getRepository(InvoiceLineItemEntity).delete({ invoice_id: invoice.id });
    }
    await dataSource.getRepository(InvoiceEntity).delete({ organization_id: org.id });
    await dataSource.getRepository(JobEntity).delete({ organization_id: org.id });
    await dataSource.getRepository(CustomerEntity).delete({ organization_id: org.id });
    await dataSource.getRepository(OrganizationSettingEntity).delete({ organization_id: org.id });
    await dataSource.getRepository(OrganizationEntity).delete({ id: org.id });
  }
}

async function main() {
  const configured = useConfiguredSmokeDatabase();
  const options = requireMySqlOptions();
  const plan = resolveSmokeDatabasePlan(options, "wizfield_historical_snapshot_phase7_verify");

  const report: VerificationReport = {
    dbSmokeEnvironment: configured
      ? `${plan.databaseName}@127.0.0.1 (configured, non-production)`
      : `${plan.databaseName} (ephemeral)`,
    configuredDatabaseMode: configured,
    categories: {
      schemaReady: configured ? "FAIL" : "SKIP",
      serviceLocationDistinct: configured ? "FAIL" : "SKIP",
      postFreezeDrift: configured ? "FAIL" : "SKIP",
      paymentAfterFreeze: configured ? "FAIL" : "SKIP",
      estimateFreeze: configured ? "FAIL" : "SKIP",
      legacyLiveRender: configured ? "FAIL" : "SKIP",
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

  const snapshotService = new InvoiceCustomerFacingSnapshotService(new DocumentBrandingSnapshotService());
  const token = randomUUID().slice(0, 8);

  try {
    await dataSource.initialize();

    const quoteMeta = await dataSource.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quotes' AND COLUMN_NAME = 'customer_facing_snapshot_json'",
    );
    if (!Array.isArray(quoteMeta) || quoteMeta.length === 0) {
      report.errors.push("quotes.customer_facing_snapshot_json missing — run migration 1791000000000");
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }
    report.categories.schemaReady = "PASS";

    const organization = await dataSource.getRepository(OrganizationEntity).save(
      dataSource.getRepository(OrganizationEntity).create({
        name: `Phase7 Historical ${token}`,
        slug: `phase7-hist-${token}`.toLowerCase(),
        is_active: true,
      }),
    );

    const user = await dataSource.getRepository(UserEntity).save(
      dataSource.getRepository(UserEntity).create({
        email: `phase7-hist-${token}@example.com`,
        password_hash: "smoke-test-password-hash",
        is_active: true,
      }),
    );

    const profile = await dataSource.getRepository(ProfileEntity).save(
      dataSource.getRepository(ProfileEntity).create({
        auth_user_id: user.id,
        full_name: `Phase7 Owner ${token}`,
        phone: "5551000300",
      }),
    );

    const orgSettings = await dataSource.getRepository(OrganizationSettingEntity).save(
      dataSource.getRepository(OrganizationSettingEntity).create({
        settings_key: `org:${organization.id}`,
        organization_id: organization.id,
        business_name: "Phase7 Biz",
        warranty_message: "Frozen warranty text",
        invoice_pdf_footer: "Frozen terms text",
        payment_instructions: "Pay by e-transfer",
      }),
    );

    const customer = await dataSource.getRepository(CustomerEntity).save(
      dataSource.getRepository(CustomerEntity).create({
        organization_id: organization.id,
        full_name: "Phase7 Customer",
        email: `phase7-cust-${token}@example.com`,
        company_name: null,
        service_address_line_1: "1 Customer Street",
        service_city: "Custville",
        service_state_or_region: "AB",
        service_postal_code: "C1C1C1",
        phone: "5551000400",
        source: "website",
        preferred_service_type: "inspection",
        lifecycle_status: "active",
        notes: null,
      }),
    );

    const job = await dataSource.getRepository(JobEntity).save(
      dataSource.getRepository(JobEntity).create({
        organization_id: organization.id,
        customer_id: customer.id,
        service_id: null,
        assigned_technician_id: null,
        title: `Phase7 Job ${token}`,
        description: "historical snapshot verification",
        lead_source: "website",
        requested_service_type: "inspection",
        job_type: "inspection",
        status: "completed",
        service_address_line_1: "42 Job Service Lane",
        service_address_line_2: null,
        service_city: "Jobville",
        service_state_or_region: "BC",
        service_postal_code: "J2J2J2",
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
        description: "Phase7 invoice",
        status: "unpaid",
        amount_cents: 12_000,
        subtotal_cents: 12_000,
        tax_rate_bps_snapshot: 0,
        tax_cents: 0,
        total_cents: 12_000,
        issued_at: new Date(),
        due_at: new Date(),
        customer_facing_snapshot_json: null,
      }),
    );

    await dataSource.getRepository(InvoiceLineItemEntity).save(
      dataSource.getRepository(InvoiceLineItemEntity).create({
        invoice_id: invoice.id,
        pricebook_item_id: null,
        document_line_key: `phase7-line-${token}`,
        sku_snapshot: "SKU-P7",
        name_snapshot: "Phase7 line",
        description_snapshot: null,
        item_type_snapshot: "service",
        unit_of_measure_snapshot: "each",
        unit_price_cents_snapshot: 12_000,
        quantity: "1",
        line_subtotal_cents: 12_000,
        sort_order: 0,
      }),
    );

    const lineItems = await dataSource.getRepository(InvoiceLineItemEntity).find({
      where: { invoice_id: invoice.id },
    });

    const frozenAt = new Date("2026-03-01T12:00:00.000Z");
    const snapshot = snapshotService.freezeInvoiceRecord({
      invoice,
      lineItems,
      customer,
      job,
      orgSettings,
      documentNumber: "P7-1001",
      frozenAt,
      frozenVia: "email",
      organizationId: organization.id,
    });

    await dataSource.getRepository(InvoiceEntity).save(invoice);

    assert.equal(snapshot.schema_version, INVOICE_CUSTOMER_FACING_SNAPSHOT_VERSION_V3);
    assert.notDeepEqual(snapshot.bill_to.address_lines, snapshot.service_location.address_lines);
    assert.match(snapshot.service_location.address_lines.join(" "), /42 Job Service Lane/);
    report.categories.serviceLocationDistinct = "PASS";

    const frozenHash = hashJson(invoice.customer_facing_snapshot_json);

    await dataSource.getRepository(CustomerEntity).update(customer.id, { full_name: "Mutated Customer" });
    await dataSource.getRepository(JobEntity).update(job.id, {
      service_address_line_1: "999 Changed Job Road",
      title: "Mutated job title",
    });
    await dataSource.getRepository(OrganizationSettingEntity).update(orgSettings.settings_key, {
      warranty_message: "Live warranty after freeze",
      invoice_pdf_footer: "Live terms after freeze",
    });

    const reloadedAfterDrift = await dataSource.getRepository(InvoiceEntity).findOneOrFail({
      where: { id: invoice.id },
    });
    assert.equal(hashJson(reloadedAfterDrift.customer_facing_snapshot_json), frozenHash);
    const reparsed = snapshotService.parseSnapshot(reloadedAfterDrift.customer_facing_snapshot_json);
    assert.ok(reparsed);
    assert.match(reparsed.service_location.address_lines.join(" "), /42 Job Service Lane/);
    if (isInvoiceCustomerFacingSnapshotV3(reparsed)) {
      assert.equal(reparsed.copy.warranty_text, "Frozen warranty text");
    }
    report.categories.postFreezeDrift = "PASS";

    const recording = new InvoicePaymentRecordingService(dataSource, new InvoicePaymentLedgerService());
    await recording.recordNativePayment({
      organizationId: organization.id,
      invoiceId: invoice.id,
      actorUserId: user.id,
      actorProfileId: profile.id,
      payload: {
        idempotencyKey: randomUUID(),
        entryType: "payment",
        amountCents: 5_000,
        method: "cash",
        reference: null,
        note: "phase7 partial",
        occurredAt: null,
      },
    });

    const reloadedAfterPayment = await dataSource.getRepository(InvoiceEntity).findOneOrFail({
      where: { id: invoice.id },
    });
    assert.equal(hashJson(reloadedAfterPayment.customer_facing_snapshot_json), frozenHash);
    const afterPaySnapshot = snapshotService.parseSnapshot(reloadedAfterPayment.customer_facing_snapshot_json);
    assert.equal(afterPaySnapshot?.financial.total_cents, 12_000);
    report.categories.paymentAfterFreeze = "PASS";

    const quote = await dataSource.getRepository(QuoteEntity).save(
      dataSource.getRepository(QuoteEntity).create({
        organization_id: organization.id,
        job_id: job.id,
        description: "Phase7 estimate",
        price_cents: 8_000,
        subtotal_cents: 8_000,
        tax_rate_bps_snapshot: 0,
        tax_cents: 0,
        total_cents: 8_000,
        status: "sent",
        sent_at: frozenAt,
      }),
    );

    await dataSource.getRepository(QuoteLineItemEntity).save(
      dataSource.getRepository(QuoteLineItemEntity).create({
        quote_id: quote.id,
        pricebook_item_id: null,
        document_line_key: `phase7-est-${token}`,
        sku_snapshot: "SKU-EST",
        name_snapshot: "Estimate line",
        description_snapshot: null,
        item_type_snapshot: "service",
        unit_of_measure_snapshot: "each",
        unit_price_cents_snapshot: 8_000,
        quantity: "1",
        line_subtotal_cents: 8_000,
        sort_order: 0,
      }),
    );

    const quoteLines = await dataSource.getRepository(QuoteLineItemEntity).find({
      where: { quote_id: quote.id },
    });

    snapshotService.freezeEstimateRecord({
      quote,
      lineItems: quoteLines,
      customer,
      job,
      orgSettings,
      frozenAt,
      frozenVia: "sent",
      organizationId: organization.id,
    });
    await dataSource.getRepository(QuoteEntity).save(quote);
    assert.ok(quote.customer_facing_snapshot_json?.trim());
    const estimateSnapshot = snapshotService.parseSnapshot(quote.customer_facing_snapshot_json);
    assert.ok(estimateSnapshot && isInvoiceCustomerFacingSnapshotV3(estimateSnapshot));
    assert.equal(estimateSnapshot.document_kind, "estimate");
    report.categories.estimateFreeze = "PASS";

    assert.equal(resolveHistoricalDocumentRenderMode(null), "legacy_live");
    assert.equal(resolveHistoricalDocumentRenderMode(undefined), "legacy_live");
    report.categories.legacyLiveRender = "PASS";

    report.details = {
      organizationId: organization.id,
      invoiceId: invoice.id,
      quoteId: quote.id,
      database: plan.databaseName,
    };
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    for (const key of Object.keys(report.categories) as Array<keyof typeof report.categories>) {
      if (report.categories[key] === "SKIP") {
        report.categories[key] = "FAIL";
      }
    }
  } finally {
    if (dataSource.isInitialized) {
      try {
        await cleanupOrganizations(dataSource);
      } catch {
        // best-effort cleanup for smoke orgs
      }
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
