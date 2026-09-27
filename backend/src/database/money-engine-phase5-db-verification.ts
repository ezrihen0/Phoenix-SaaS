import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { HttpException } from "@nestjs/common";
import { DataSource, Like } from "typeorm";

import { persistInvoiceHeaderAndLineItems, persistQuoteHeaderAndLineItems } from "../crm/crm-document-persistence";
import {
  assertClientTotalMatchesEngine,
  computeDocumentTotals,
  computeLineSubtotalCents,
  quantityToThousandths,
} from "../crm/money-engine.core";
import { MoneyEngineService } from "../crm/money-engine.service";
import type { SnapshotLineDraft } from "../crm/document-snapshot.service";
import { resolveSmokeDatabasePlan, useConfiguredSmokeDatabase } from "./db-smoke-database-plan";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { PricebookItemEntity } from "./entities/pricebook-item.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { QuoteLineItemEntity } from "./entities/quote-line-item.entity";
import {
  assertConfiguredSmokeDatabaseIsSafe,
  buildConversionService,
  buildDocumentSnapshotService,
  cleanupConversionSmokeOrganizations,
  extractErrorCode,
  requireMySqlOptions,
  seedConversionSmokeFixture,
} from "./estimate-invoice-conversion-smoke.harness";
import { verifyDatabaseSchema } from "./verify-schema";

type CategoryStatus = "PASS" | "FAIL" | "SKIP";

type VerificationReport = {
  dbSmokeEnvironment: string;
  configuredDatabaseMode: boolean;
  categories: {
    moneyEngineDbSmokes: CategoryStatus;
    invoicePersistence: CategoryStatus;
    estimatePersistence: CategoryStatus;
    clientTotalOverrideProtection: CategoryStatus;
    rounding: CategoryStatus;
    decimalQuantity: CategoryStatus;
    phase4Regression: CategoryStatus;
    tenantNegatives: CategoryStatus;
  };
  outcome: CategoryStatus;
  details: Record<string, unknown>;
  errors: string[];
};

function categoryFail(report: VerificationReport, key: keyof VerificationReport["categories"], error: unknown) {
  report.categories[key] = "FAIL";
  report.errors.push(`${key}: ${extractErrorCode(error)}`);
}

async function runCategory(
  report: VerificationReport,
  key: keyof VerificationReport["categories"],
  run: () => Promise<void> | void,
) {
  if (report.categories[key] === "FAIL") {
    return;
  }

  try {
    await run();
    report.categories[key] = "PASS";
  } catch (error) {
    categoryFail(report, key, error);
  }
}

function manualDraft(input: {
  key: string;
  quantity: string;
  unitPriceCents: number;
  sortOrder: number;
}): SnapshotLineDraft {
  const lineSubtotal = computeLineSubtotalCents(input.quantity, input.unitPriceCents);
  return {
    pricebook_item_id: null,
    document_line_key: input.key,
    sku_snapshot: "MANUAL",
    name_snapshot: `Line ${input.key}`,
    description_snapshot: null,
    item_type_snapshot: "manual",
    unit_of_measure_snapshot: null,
    unit_price_cents_snapshot: input.unitPriceCents,
    base_cost_cents_snapshot: null,
    material_cost_cents_snapshot: null,
    labor_cost_cents_snapshot: null,
    estimated_labor_minutes_snapshot: null,
    warranty_months_snapshot: null,
    pricebook_bundle_id: null,
    bundle_requirement_id: null,
    catalog_unit_price_cents_snapshot: null,
    quantity: input.quantity,
    line_subtotal_cents: lineSubtotal,
    sort_order: input.sortOrder,
  };
}

async function seedJob(dataSource: DataSource, label: string) {
  const token = randomUUID().slice(0, 8);
  const org = await dataSource.getRepository(OrganizationEntity).save(
    dataSource.getRepository(OrganizationEntity).create({
      name: `Phase5 Verify ${label} ${token}`,
      slug: `money-phase5-verify-${label}-${token}`.toLowerCase(),
      is_active: true,
    }),
  );
  const customer = await dataSource.getRepository(CustomerEntity).save(
    dataSource.getRepository(CustomerEntity).create({
      organization_id: org.id,
      full_name: `Phase5 Customer ${label}`,
      phone: "5551000999",
      email: null,
      company_name: null,
      service_address_line_1: "100 Verify Lane",
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
      organization_id: org.id,
      customer_id: customer.id,
      service_id: null,
      assigned_technician_id: null,
      title: `Phase5 Job ${label}`,
      description: "Phase 5 verification fixture",
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
      created_by_auth_user_id: null,
      updated_by_auth_user_id: null,
    }),
  );
  return { organizationId: org.id, jobId: job.id, orgSlug: org.slug };
}

async function cleanupPhase5Orgs(dataSource: DataSource) {
  await cleanupConversionSmokeOrganizations(dataSource);
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const orgs = await orgRepo.find({ where: { slug: Like("money-phase5-verify-%") } });
  for (const org of orgs) {
    const invoices = await dataSource.getRepository(InvoiceEntity).find({ where: { organization_id: org.id } });
    for (const invoice of invoices) {
      await dataSource.getRepository(InvoiceLineItemEntity).delete({ invoice_id: invoice.id });
    }
    await dataSource.getRepository(InvoiceEntity).delete({ organization_id: org.id });
    const quotes = await dataSource.getRepository(QuoteEntity).find({ where: { organization_id: org.id } });
    for (const quote of quotes) {
      await dataSource.getRepository(QuoteLineItemEntity).delete({ quote_id: quote.id });
    }
    await dataSource.getRepository(QuoteEntity).delete({ organization_id: org.id });
    await dataSource.getRepository(JobEntity).delete({ organization_id: org.id });
    await dataSource.getRepository(CustomerEntity).delete({ organization_id: org.id });
    await dataSource.getRepository(PricebookItemEntity).delete({ organization_id: org.id });
    await orgRepo.delete(org.id);
  }
}

async function main() {
  const report: VerificationReport = {
    dbSmokeEnvironment: "unknown",
    configuredDatabaseMode: useConfiguredSmokeDatabase(),
    categories: {
      moneyEngineDbSmokes: "SKIP",
      invoicePersistence: "SKIP",
      estimatePersistence: "SKIP",
      clientTotalOverrideProtection: "SKIP",
      rounding: "SKIP",
      decimalQuantity: "SKIP",
      phase4Regression: "SKIP",
      tenantNegatives: "SKIP",
    },
    outcome: "SKIP",
    details: {},
    errors: [],
  };

  if (!report.configuredDatabaseMode) {
    report.errors.push("FINANCE_SMOKE_USE_CONFIGURED_DATABASE=true is required for Phase 5 DB verification.");
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const options = requireMySqlOptions();
  const plan = resolveSmokeDatabasePlan(options, "wizfield_money_phase5_verify");
  if (plan.mode !== "configured") {
    report.errors.push("Expected configured database plan.");
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  assertConfiguredSmokeDatabaseIsSafe(plan.databaseName);
  report.dbSmokeEnvironment = `${plan.databaseName}@${options.host ?? "127.0.0.1"} (configured, non-production)`;

  let dataSource: DataSource | null = null;

  try {
    dataSource = new DataSource({ ...options, database: plan.databaseName, logging: false });
    await dataSource.initialize();
    await verifyDatabaseSchema(dataSource);

    const moneyEngine = new MoneyEngineService();
    const snapshotService = buildDocumentSnapshotService(dataSource);

    await runCategory(report, "clientTotalOverrideProtection", async () => {
      const totals = computeDocumentTotals([{ quantity: "1", unitPriceCents: 5000 }], 500);
      assert.throws(() => assertClientTotalMatchesEngine(5001, totals, "Invoice"));
      assert.throws(() => quantityToThousandths("0"));
      assert.throws(() => quantityToThousandths("-1"));
      assert.throws(() => quantityToThousandths("1.2345"));
    });

    await runCategory(report, "decimalQuantity", async () => {
      const lineSubtotal = computeLineSubtotalCents("1.5", 10_000);
      assert.equal(lineSubtotal, 15_000);
      const totals = moneyEngine.computeSnapshotTotals([{ quantity: "0.25", unitPriceCents: 8000 }], 0);
      assert.equal(totals.subtotalCents, 2000);
      report.details.decimalQuantity = { lineSubtotal, subtotal: totals.subtotalCents };
    });

    await runCategory(report, "rounding", async () => {
      const totals = moneyEngine.computeSnapshotTotals(
        [
          { quantity: "1", unitPriceCents: 10_001 },
          { quantity: "1", unitPriceCents: 1 },
        ],
        1300,
      );
      assert.equal(totals.subtotalCents, 10_002);
      assert.equal(totals.taxCents, Math.round((10_002 * 1300) / 10_000));
      assert.equal(totals.totalCents, totals.subtotalCents + totals.taxCents);
      report.details.rounding = totals;
    });

    await runCategory(report, "invoicePersistence", async () => {
      const fixture = await seedJob(dataSource!, "invoice");
      const drafts = [
        manualDraft({ key: "inv-a", quantity: "1.5", unitPriceCents: 10_000, sortOrder: 0 }),
        manualDraft({ key: "inv-b", quantity: "1", unitPriceCents: 250, sortOrder: 1 }),
      ];
      const invoiceTotals = moneyEngine.computeSnapshotTotals(
        drafts.map((draft) => ({ quantity: draft.quantity, unitPriceCents: draft.unit_price_cents_snapshot })),
        500,
      );

      const invoice = await dataSource!.transaction((manager) =>
        persistInvoiceHeaderAndLineItems(manager, snapshotService, {
          organizationId: fixture.organizationId,
          jobId: fixture.jobId,
          existingInvoice: null,
          description: "Phase5 invoice verify",
          invoiceTotals,
          status: "unpaid",
          paid_at: null,
          due_at: new Date(Date.now() + 86_400_000 * 14),
          hasSnapshotLineItems: true,
          lineDrafts: drafts,
        }),
      );

      const reloaded = await dataSource!.getRepository(InvoiceEntity).findOneOrFail({
        where: { id: invoice.id },
        relations: { line_items: true },
      });
      reloaded.line_items = (reloaded.line_items ?? []).sort((a, b) => a.sort_order - b.sort_order);

      assert.equal(reloaded.amount_cents, reloaded.total_cents);
      assert.equal(reloaded.subtotal_cents, invoiceTotals.subtotalCents);
      assert.equal(reloaded.tax_cents, invoiceTotals.taxCents);
      assert.equal(reloaded.total_cents, invoiceTotals.totalCents);
      assert.equal(reloaded.line_items?.length, 2);
      assert.equal(reloaded.line_items?.[0]?.unit_price_cents_snapshot, 10_000);
      assert.equal(reloaded.line_items?.[0]?.line_subtotal_cents, computeLineSubtotalCents("1.5", 10_000));

      report.details.invoicePersistence = {
        invoiceId: invoice.id,
        amount_cents: reloaded.amount_cents,
        total_cents: reloaded.total_cents,
      };
    });

    await runCategory(report, "estimatePersistence", async () => {
      const fixture = await seedJob(dataSource!, "estimate");
      const drafts = [manualDraft({ key: "est-a", quantity: "2.5", unitPriceCents: 1999, sortOrder: 0 })];
      const quoteTotals = moneyEngine.computeSnapshotTotals(
        drafts.map((draft) => ({ quantity: draft.quantity, unitPriceCents: draft.unit_price_cents_snapshot })),
        1300,
      );

      const quote = await dataSource!.transaction((manager) =>
        persistQuoteHeaderAndLineItems(manager, snapshotService, {
          organizationId: fixture.organizationId,
          jobId: fixture.jobId,
          existingQuote: null,
          description: "Phase5 quote verify",
          quoteTotals,
          status: "approved",
          sent_at: new Date(),
          approved_at: new Date(),
          hasSnapshotLineItems: true,
          lineDrafts: drafts,
        }),
      );

      const reloaded = await dataSource!.getRepository(QuoteEntity).findOneOrFail({
        where: { id: quote.id },
        relations: { line_items: true },
      });

      assert.equal(reloaded.price_cents, reloaded.total_cents);
      assert.equal(reloaded.subtotal_cents, quoteTotals.subtotalCents);
      assert.equal(reloaded.tax_cents, quoteTotals.taxCents);
      assert.equal(reloaded.total_cents, quoteTotals.totalCents);
      assert.equal(reloaded.line_items?.length, 1);
      report.details.estimatePersistence = { quoteId: quote.id, total_cents: reloaded.total_cents };
    });

    await runCategory(report, "tenantNegatives", async () => {
      const fixture = await seedConversionSmokeFixture(dataSource!);
      const foreignOrg = await dataSource!.getRepository(OrganizationEntity).findOneOrFail({
        where: { id: fixture.foreignOrganizationId },
      });

      const conversionService = buildConversionService(dataSource!);
      try {
        await conversionService.convertFromEstimate({
          organizationId: foreignOrg.id,
          jobId: fixture.jobId,
          estimateId: fixture.quoteId,
          actor: fixture.actor,
        });
        throw new Error("expected_job_not_found");
      } catch (error) {
        const code = extractErrorCode(error);
        assert.equal(code, "job_not_found");
      }

      const otherFixture = await seedJob(dataSource!, "tenant-pb");
      const foreignItem = await dataSource!.getRepository(PricebookItemEntity).findOneOrFail({
        where: { id: fixture.pricebookItemId },
      });
      assert.notEqual(otherFixture.organizationId, foreignItem.organization_id);

      try {
        await snapshotService.buildLineDrafts(
          [
            {
              kind: "pricebook_item",
              documentLineKey: "tenant-test-line",
              pricebookItemId: foreignItem.id,
              quantity: "1",
              sortOrder: 0,
            },
          ],
          {
            organizationId: otherFixture.organizationId,
            documentKind: "invoice",
            documentId: null,
          },
        );
        throw new Error("expected_foreign_pricebook_rejection");
      } catch (error) {
        if (!(error instanceof HttpException)) {
          throw error;
        }
        assert.ok(error.getStatus() >= 400);
      }
    });

    await runCategory(report, "phase4Regression", async () => {
      const conversionService = buildConversionService(dataSource!);
      const fixture = await seedConversionSmokeFixture(dataSource!);
      const estimateUnitPrice = 12_345;
      const mutatedCatalog = 88_888;

      await dataSource!.getRepository(PricebookItemEntity).update(fixture.pricebookItemId, {
        customer_price_cents: mutatedCatalog,
      });

      const invoice = await conversionService.convertFromEstimate({
        organizationId: fixture.organizationId,
        jobId: fixture.jobId,
        estimateId: fixture.quoteId,
        actor: fixture.actor,
      });

      const lines = await dataSource!.getRepository(InvoiceLineItemEntity).find({
        where: { invoice_id: invoice.id },
      });
      assert.equal(lines.length, 1);
      assert.equal(lines[0]?.unit_price_cents_snapshot, estimateUnitPrice);
      assert.notEqual(lines[0]?.unit_price_cents_snapshot, mutatedCatalog);
      report.details.phase4Regression = {
        invoiceId: invoice.id,
        unitPriceCents: lines[0]?.unit_price_cents_snapshot,
      };
    });

    await runCategory(report, "moneyEngineDbSmokes", async () => {
      const fixture = await seedJob(dataSource!, "parity");
      const pbItem = await dataSource!.getRepository(PricebookItemEntity).save(
        dataSource!.getRepository(PricebookItemEntity).create({
          organization_id: fixture.organizationId,
          internal_sku: `P5-${randomUUID().slice(0, 6)}`,
          name: "Catalog parity item",
          customer_description: null,
          internal_description: null,
          item_type: "service",
          category_id: null,
          trade_area: null,
          service_area: null,
          tags: [],
          unit_of_measure: "each",
          base_cost_cents: 0,
          material_cost_cents: 0,
          labor_cost_cents: 0,
          customer_price_cents: 4321,
          minimum_price_cents: null,
          estimated_labor_minutes: null,
          warranty_months: null,
          requires_permit: false,
          inventory_tracking_mode: "none",
          supplier_name: null,
          supplier_sku: null,
          inventory_notes: null,
          image_storage_key: null,
          is_popular: false,
          is_active: true,
          sort_order: 0,
          created_by_user_id: null,
          updated_by_user_id: null,
          deleted_by_user_id: null,
          archived_at: null,
        }),
      );

      const catalogDrafts = await snapshotService.buildLineDrafts(
        [
          {
            kind: "pricebook_item",
            documentLineKey: "pb-line",
            pricebookItemId: pbItem.id,
            quantity: "1",
            sortOrder: 0,
          },
        ],
        {
          organizationId: fixture.organizationId,
          documentKind: "invoice",
          documentId: null,
        },
      );
      const manualDrafts = [
        manualDraft({ key: "manual-line", quantity: "1", unitPriceCents: 4321, sortOrder: 0 }),
      ];
      assert.equal(catalogDrafts[0]?.unit_price_cents_snapshot, 4321);
      assert.equal(catalogDrafts[0]?.line_subtotal_cents, manualDrafts[0]?.line_subtotal_cents);
    });

    const values = Object.values(report.categories);
    if (values.every((status) => status === "PASS")) {
      report.outcome = "PASS";
      report.categories.moneyEngineDbSmokes = "PASS";
    } else if (values.some((status) => status === "FAIL")) {
      report.outcome = "FAIL";
    } else {
      report.outcome = "SKIP";
    }
  } catch (error) {
    report.outcome = "FAIL";
    report.errors.push(extractErrorCode(error));
  } finally {
    if (dataSource?.isInitialized) {
      await cleanupPhase5Orgs(dataSource);
      await dataSource.destroy();
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.outcome !== "PASS") {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
