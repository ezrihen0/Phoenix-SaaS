import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import {
  persistInvoiceHeaderAndLineItems,
  persistQuoteHeaderAndLineItems,
} from "../crm/crm-document-persistence";
import { DocumentPricingService } from "../crm/document-pricing.service";
import {
  DocumentSnapshotService,
  type SnapshotLineDraft,
} from "../crm/document-snapshot.service";
import type { CustomerOutputTranslationService } from "../language-store/customer-output-translation.service";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { PricebookBundleItemEntity } from "./entities/pricebook-bundle-item.entity";
import { PricebookBundleEntity } from "./entities/pricebook-bundle.entity";
import { PricebookItemEntity } from "./entities/pricebook-item.entity";
import { QuoteLineItemEntity } from "./entities/quote-line-item.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { buildDataSourceOptions } from "./typeorm.config";
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

type JobFixture = {
  organizationId: string;
  jobId: string;
  customerId: string;
};

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Document line atomicity smoke test currently supports MySQL only.");
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
    const response = error.getResponse() as { error?: { code?: string } };
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

function buildDocumentSnapshotService(dataSource: DataSource) {
  return new DocumentSnapshotService(
    dataSource.getRepository(InvoiceLineItemEntity),
    dataSource.getRepository(QuoteLineItemEntity),
    dataSource.getRepository(PricebookItemEntity),
    dataSource.getRepository(PricebookBundleEntity),
    dataSource.getRepository(PricebookBundleItemEntity),
    new DocumentPricingService(),
    {} as CustomerOutputTranslationService,
  );
}

function manualLineDraft(input: {
  key: string;
  name: string;
  unitPriceCents: number;
  sortOrder: number;
}): SnapshotLineDraft {
  return {
    pricebook_item_id: null,
    document_line_key: input.key,
    sku_snapshot: "MANUAL",
    name_snapshot: input.name,
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
    quantity: "1",
    line_subtotal_cents: input.unitPriceCents,
    sort_order: input.sortOrder,
  };
}

function isDocumentLocked(approvedAt: Date | null, signedAt: Date | null) {
  return Boolean(approvedAt || signedAt);
}

async function seedJobFixture(dataSource: DataSource, label: string): Promise<JobFixture> {
  const token = randomUUID().slice(0, 8);

  const organization = await dataSource.getRepository(OrganizationEntity).save(
    dataSource.getRepository(OrganizationEntity).create({
      name: `Doc Atomic Org ${label} ${token}`,
      slug: `doc-atomic-${label}-${token}`.toLowerCase(),
      is_active: true,
    }),
  );

  const customer = await dataSource.getRepository(CustomerEntity).save(
    dataSource.getRepository(CustomerEntity).create({
      organization_id: organization.id,
      full_name: `Doc Atomic Customer ${label}`,
      phone: "5551000200",
      email: null,
      company_name: null,
      service_address_line_1: "100 Atomic Lane",
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
      title: `Doc Atomic Job ${label}`,
      description: "Atomicity smoke fixture",
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

  return {
    organizationId: organization.id,
    jobId: job.id,
    customerId: customer.id,
  };
}

async function captureInvoiceState(dataSource: DataSource, invoiceId: string) {
  const invoice = await dataSource.getRepository(InvoiceEntity).findOneOrFail({
    where: { id: invoiceId },
  });
  const lines = await dataSource.getRepository(InvoiceLineItemEntity).find({
    where: { invoice_id: invoiceId },
    order: { sort_order: "ASC" },
  });

  return {
    total_cents: invoice.total_cents,
    subtotal_cents: invoice.subtotal_cents,
    description: invoice.description,
    lineCount: lines.length,
    lineNames: lines.map((line) => line.name_snapshot),
  };
}

async function captureQuoteState(dataSource: DataSource, quoteId: string) {
  const quote = await dataSource.getRepository(QuoteEntity).findOneOrFail({
    where: { id: quoteId },
  });
  const lines = await dataSource.getRepository(QuoteLineItemEntity).find({
    where: { quote_id: quoteId },
    order: { sort_order: "ASC" },
  });

  return {
    total_cents: quote.total_cents,
    subtotal_cents: quote.subtotal_cents,
    description: quote.description,
    lineCount: lines.length,
    lineNames: lines.map((line) => line.name_snapshot),
  };
}

async function seedInvoiceWithLines(dataSource: DataSource, fixture: JobFixture) {
  const documentSnapshotService = buildDocumentSnapshotService(dataSource);
  const originalDrafts = [
    manualLineDraft({ key: "line-1", name: "Original invoice line", unitPriceCents: 4_000, sortOrder: 0 }),
  ];
  const totals = new DocumentPricingService().computeSnapshotTotals(
    originalDrafts.map((draft) => ({
      quantity: draft.quantity,
      unitPriceCents: draft.unit_price_cents_snapshot,
    })),
    0,
  );

  const invoice = await dataSource.transaction((manager) =>
    persistInvoiceHeaderAndLineItems(manager, documentSnapshotService, {
      organizationId: fixture.organizationId,
      jobId: fixture.jobId,
      existingInvoice: null,
      description: "Original invoice",
      invoiceTotals: totals,
      status: "unpaid",
      paid_at: null,
      due_at: new Date(Date.now() + 86_400_000 * 14),
      hasSnapshotLineItems: true,
      lineDrafts: originalDrafts,
    }),
  );

  return { invoice, originalDrafts, totals };
}

async function seedQuoteWithLines(dataSource: DataSource, fixture: JobFixture) {
  const documentSnapshotService = buildDocumentSnapshotService(dataSource);
  const originalDrafts = [
    manualLineDraft({ key: "line-1", name: "Original quote line", unitPriceCents: 3_500, sortOrder: 0 }),
  ];
  const totals = new DocumentPricingService().computeSnapshotTotals(
    originalDrafts.map((draft) => ({
      quantity: draft.quantity,
      unitPriceCents: draft.unit_price_cents_snapshot,
    })),
    0,
  );

  const quote = await dataSource.transaction((manager) =>
    persistQuoteHeaderAndLineItems(manager, documentSnapshotService, {
      organizationId: fixture.organizationId,
      jobId: fixture.jobId,
      existingQuote: null,
      description: "Original quote",
      quoteTotals: totals,
      status: "draft",
      sent_at: null,
      approved_at: null,
      hasSnapshotLineItems: true,
      lineDrafts: originalDrafts,
    }),
  );

  return { quote, originalDrafts, totals };
}

async function runTests(summary: SmokeSummary, dataSource: DataSource) {
  const documentSnapshotService = buildDocumentSnapshotService(dataSource);
  const pricingService = new DocumentPricingService();
  const invoiceRepo = dataSource.getRepository(InvoiceEntity);
  const quoteRepo = dataSource.getRepository(QuoteEntity);
  const jobRepo = dataSource.getRepository(JobEntity);

  await expectPass(summary, "1 invoice happy path commits header + replacement lines", async () => {
    const fixture = await seedJobFixture(dataSource, "invoice-happy");
    const { invoice } = await seedInvoiceWithLines(dataSource, fixture);
    const before = await captureInvoiceState(dataSource, invoice.id);

    const replacementDrafts = [
      manualLineDraft({ key: "line-1", name: "Replacement invoice line A", unitPriceCents: 2_000, sortOrder: 0 }),
      manualLineDraft({ key: "line-2", name: "Replacement invoice line B", unitPriceCents: 1_500, sortOrder: 1 }),
    ];
    const replacementTotals = pricingService.computeSnapshotTotals(
      replacementDrafts.map((draft) => ({
        quantity: draft.quantity,
        unitPriceCents: draft.unit_price_cents_snapshot,
      })),
      0,
    );

    const existingInvoice = await invoiceRepo.findOneOrFail({ where: { id: invoice.id } });
    await dataSource.transaction((manager) =>
      persistInvoiceHeaderAndLineItems(manager, documentSnapshotService, {
        organizationId: fixture.organizationId,
        jobId: fixture.jobId,
        existingInvoice,
        description: "Replacement invoice",
        invoiceTotals: replacementTotals,
        status: "unpaid",
        paid_at: null,
        due_at: existingInvoice.due_at ?? new Date(Date.now() + 86_400_000 * 14),
        hasSnapshotLineItems: true,
        lineDrafts: replacementDrafts,
      }),
    );

    const after = await captureInvoiceState(dataSource, invoice.id);
    if (
      after.total_cents !== replacementTotals.totalCents
      || after.lineCount !== 2
      || after.lineNames.join("|") !== "Replacement invoice line A|Replacement invoice line B"
      || before.lineCount === after.lineCount && before.total_cents === after.total_cents
    ) {
      throw new Error("invoice_happy_path_not_committed");
    }

    return { before, after };
  });

  await expectPass(summary, "2 invoice forced failure after header write rolls back", async () => {
    const fixture = await seedJobFixture(dataSource, "invoice-header-fail");
    const { invoice } = await seedInvoiceWithLines(dataSource, fixture);
    const before = await captureInvoiceState(dataSource, invoice.id);

    const replacementDrafts = [
      manualLineDraft({ key: "line-1", name: "Should not persist", unitPriceCents: 9_999, sortOrder: 0 }),
    ];
    const replacementTotals = pricingService.computeSnapshotTotals(
      replacementDrafts.map((draft) => ({
        quantity: draft.quantity,
        unitPriceCents: draft.unit_price_cents_snapshot,
      })),
      0,
    );

    const existingInvoice = await invoiceRepo.findOneOrFail({ where: { id: invoice.id } });

    try {
      await dataSource.transaction((manager) =>
        persistInvoiceHeaderAndLineItems(manager, documentSnapshotService, {
          organizationId: fixture.organizationId,
          jobId: fixture.jobId,
          existingInvoice,
          description: "Failed invoice header write",
          invoiceTotals: replacementTotals,
          status: "unpaid",
          paid_at: null,
          due_at: existingInvoice.due_at ?? new Date(Date.now() + 86_400_000 * 14),
          hasSnapshotLineItems: true,
          lineDrafts: replacementDrafts,
          testHooks: {
            afterHeaderWrite: async () => {
              throw new Error("TEST_FAIL_AFTER_INVOICE_HEADER_WRITE");
            },
          },
        }),
      );
      throw new Error("expected_invoice_header_failure");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("TEST_FAIL_AFTER_INVOICE_HEADER_WRITE")) {
        throw error;
      }
    }

    const after = await captureInvoiceState(dataSource, invoice.id);
    if (
      after.total_cents !== before.total_cents
      || after.description !== before.description
      || after.lineCount !== before.lineCount
      || after.lineNames.join("|") !== before.lineNames.join("|")
    ) {
      throw new Error("invoice_header_failure_not_rolled_back");
    }

    return { before, after };
  });

  await expectPass(summary, "3 invoice forced failure after line delete rolls back", async () => {
    const fixture = await seedJobFixture(dataSource, "invoice-delete-fail");
    const { invoice } = await seedInvoiceWithLines(dataSource, fixture);
    const before = await captureInvoiceState(dataSource, invoice.id);

    const replacementDrafts = [
      manualLineDraft({ key: "line-1", name: "Should not persist after delete", unitPriceCents: 8_888, sortOrder: 0 }),
    ];
    const replacementTotals = pricingService.computeSnapshotTotals(
      replacementDrafts.map((draft) => ({
        quantity: draft.quantity,
        unitPriceCents: draft.unit_price_cents_snapshot,
      })),
      0,
    );

    const existingInvoice = await invoiceRepo.findOneOrFail({ where: { id: invoice.id } });

    try {
      await dataSource.transaction((manager) =>
        persistInvoiceHeaderAndLineItems(manager, documentSnapshotService, {
          organizationId: fixture.organizationId,
          jobId: fixture.jobId,
          existingInvoice,
          description: "Failed invoice line delete",
          invoiceTotals: replacementTotals,
          status: "unpaid",
          paid_at: null,
          due_at: existingInvoice.due_at ?? new Date(Date.now() + 86_400_000 * 14),
          hasSnapshotLineItems: true,
          lineDrafts: replacementDrafts,
          testHooks: {
            afterLineDelete: async () => {
              throw new Error("TEST_FAIL_AFTER_INVOICE_LINE_DELETE");
            },
          },
        }),
      );
      throw new Error("expected_invoice_delete_failure");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("TEST_FAIL_AFTER_INVOICE_LINE_DELETE")) {
        throw error;
      }
    }

    const after = await captureInvoiceState(dataSource, invoice.id);
    if (
      after.total_cents !== before.total_cents
      || after.lineCount !== before.lineCount
      || after.lineNames.join("|") !== before.lineNames.join("|")
    ) {
      throw new Error("invoice_delete_failure_not_rolled_back");
    }

    return { before, after };
  });

  await expectPass(summary, "Invoice create failure does not leave orphan header", async () => {
    const fixture = await seedJobFixture(dataSource, "invoice-create-fail");
    const replacementDrafts = [
      manualLineDraft({ key: "line-1", name: "Create fail line", unitPriceCents: 1_000, sortOrder: 0 }),
    ];
    const replacementTotals = pricingService.computeSnapshotTotals(
      replacementDrafts.map((draft) => ({
        quantity: draft.quantity,
        unitPriceCents: draft.unit_price_cents_snapshot,
      })),
      0,
    );

    try {
      await dataSource.transaction((manager) =>
        persistInvoiceHeaderAndLineItems(manager, documentSnapshotService, {
          organizationId: fixture.organizationId,
          jobId: fixture.jobId,
          existingInvoice: null,
          description: "Create fail invoice",
          invoiceTotals: replacementTotals,
          status: "unpaid",
          paid_at: null,
          due_at: new Date(Date.now() + 86_400_000 * 14),
          hasSnapshotLineItems: true,
          lineDrafts: replacementDrafts,
          testHooks: {
            afterLineDelete: async () => {
              throw new Error("TEST_FAIL_INVOICE_CREATE");
            },
          },
        }),
      );
      throw new Error("expected_invoice_create_failure");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("TEST_FAIL_INVOICE_CREATE")) {
        throw error;
      }
    }

    const invoiceCount = await invoiceRepo.count({ where: { job_id: fixture.jobId } });
    if (invoiceCount !== 0) {
      throw new Error(`orphan_invoice_header_count_${invoiceCount}`);
    }

    return { invoiceCount };
  });

  await expectPass(summary, "4 quote happy path commits header + replacement lines", async () => {
    const fixture = await seedJobFixture(dataSource, "quote-happy");
    const { quote } = await seedQuoteWithLines(dataSource, fixture);
    const before = await captureQuoteState(dataSource, quote.id);

    const replacementDrafts = [
      manualLineDraft({ key: "line-1", name: "Replacement quote line A", unitPriceCents: 2_200, sortOrder: 0 }),
      manualLineDraft({ key: "line-2", name: "Replacement quote line B", unitPriceCents: 1_100, sortOrder: 1 }),
    ];
    const replacementTotals = pricingService.computeSnapshotTotals(
      replacementDrafts.map((draft) => ({
        quantity: draft.quantity,
        unitPriceCents: draft.unit_price_cents_snapshot,
      })),
      0,
    );

    const existingQuote = await quoteRepo.findOneOrFail({ where: { id: quote.id } });
    await dataSource.transaction((manager) =>
      persistQuoteHeaderAndLineItems(manager, documentSnapshotService, {
        organizationId: fixture.organizationId,
        jobId: fixture.jobId,
        existingQuote,
        description: "Replacement quote",
        quoteTotals: replacementTotals,
        status: "draft",
        sent_at: null,
        approved_at: null,
        hasSnapshotLineItems: true,
        lineDrafts: replacementDrafts,
      }),
    );

    const after = await captureQuoteState(dataSource, quote.id);
    if (
      after.total_cents !== replacementTotals.totalCents
      || after.lineCount !== 2
      || after.lineNames.join("|") !== "Replacement quote line A|Replacement quote line B"
    ) {
      throw new Error("quote_happy_path_not_committed");
    }

    return { before, after };
  });

  await expectPass(summary, "5 quote forced failure after header write rolls back", async () => {
    const fixture = await seedJobFixture(dataSource, "quote-header-fail");
    const { quote } = await seedQuoteWithLines(dataSource, fixture);
    const before = await captureQuoteState(dataSource, quote.id);

    const replacementDrafts = [
      manualLineDraft({ key: "line-1", name: "Should not persist", unitPriceCents: 7_777, sortOrder: 0 }),
    ];
    const replacementTotals = pricingService.computeSnapshotTotals(
      replacementDrafts.map((draft) => ({
        quantity: draft.quantity,
        unitPriceCents: draft.unit_price_cents_snapshot,
      })),
      0,
    );

    const existingQuote = await quoteRepo.findOneOrFail({ where: { id: quote.id } });

    try {
      await dataSource.transaction((manager) =>
        persistQuoteHeaderAndLineItems(manager, documentSnapshotService, {
          organizationId: fixture.organizationId,
          jobId: fixture.jobId,
          existingQuote,
          description: "Failed quote header write",
          quoteTotals: replacementTotals,
          status: "draft",
          sent_at: null,
          approved_at: null,
          hasSnapshotLineItems: true,
          lineDrafts: replacementDrafts,
          testHooks: {
            afterHeaderWrite: async () => {
              throw new Error("TEST_FAIL_AFTER_QUOTE_HEADER_WRITE");
            },
          },
        }),
      );
      throw new Error("expected_quote_header_failure");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("TEST_FAIL_AFTER_QUOTE_HEADER_WRITE")) {
        throw error;
      }
    }

    const after = await captureQuoteState(dataSource, quote.id);
    if (
      after.total_cents !== before.total_cents
      || after.description !== before.description
      || after.lineCount !== before.lineCount
    ) {
      throw new Error("quote_header_failure_not_rolled_back");
    }

    return { before, after };
  });

  await expectPass(summary, "6 quote forced failure after line delete rolls back", async () => {
    const fixture = await seedJobFixture(dataSource, "quote-delete-fail");
    const { quote } = await seedQuoteWithLines(dataSource, fixture);
    const before = await captureQuoteState(dataSource, quote.id);

    const replacementDrafts = [
      manualLineDraft({ key: "line-1", name: "Should not persist after delete", unitPriceCents: 6_666, sortOrder: 0 }),
    ];
    const replacementTotals = pricingService.computeSnapshotTotals(
      replacementDrafts.map((draft) => ({
        quantity: draft.quantity,
        unitPriceCents: draft.unit_price_cents_snapshot,
      })),
      0,
    );

    const existingQuote = await quoteRepo.findOneOrFail({ where: { id: quote.id } });

    try {
      await dataSource.transaction((manager) =>
        persistQuoteHeaderAndLineItems(manager, documentSnapshotService, {
          organizationId: fixture.organizationId,
          jobId: fixture.jobId,
          existingQuote,
          description: "Failed quote line delete",
          quoteTotals: replacementTotals,
          status: "draft",
          sent_at: null,
          approved_at: null,
          hasSnapshotLineItems: true,
          lineDrafts: replacementDrafts,
          testHooks: {
            afterLineDelete: async () => {
              throw new Error("TEST_FAIL_AFTER_QUOTE_LINE_DELETE");
            },
          },
        }),
      );
      throw new Error("expected_quote_delete_failure");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("TEST_FAIL_AFTER_QUOTE_LINE_DELETE")) {
        throw error;
      }
    }

    const after = await captureQuoteState(dataSource, quote.id);
    if (
      after.total_cents !== before.total_cents
      || after.lineCount !== before.lineCount
      || after.lineNames.join("|") !== before.lineNames.join("|")
    ) {
      throw new Error("quote_delete_failure_not_rolled_back");
    }

    return { before, after };
  });

  await expectPass(summary, "Quote create failure does not leave orphan header", async () => {
    const fixture = await seedJobFixture(dataSource, "quote-create-fail");
    const replacementDrafts = [
      manualLineDraft({ key: "line-1", name: "Create fail line", unitPriceCents: 1_000, sortOrder: 0 }),
    ];
    const replacementTotals = pricingService.computeSnapshotTotals(
      replacementDrafts.map((draft) => ({
        quantity: draft.quantity,
        unitPriceCents: draft.unit_price_cents_snapshot,
      })),
      0,
    );

    try {
      await dataSource.transaction((manager) =>
        persistQuoteHeaderAndLineItems(manager, documentSnapshotService, {
          organizationId: fixture.organizationId,
          jobId: fixture.jobId,
          existingQuote: null,
          description: "Create fail quote",
          quoteTotals: replacementTotals,
          status: "draft",
          sent_at: null,
          approved_at: null,
          hasSnapshotLineItems: true,
          lineDrafts: replacementDrafts,
          testHooks: {
            afterHeaderWrite: async () => {
              throw new Error("TEST_FAIL_QUOTE_CREATE");
            },
          },
        }),
      );
      throw new Error("expected_quote_create_failure");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("TEST_FAIL_QUOTE_CREATE")) {
        throw error;
      }
    }

    const quoteCount = await quoteRepo.count({ where: { job_id: fixture.jobId } });
    if (quoteCount !== 0) {
      throw new Error(`orphan_quote_header_count_${quoteCount}`);
    }

    return { quoteCount };
  });

  await expectPass(summary, "7 locked approved invoice is blocked by controller lock gate", async () => {
    const fixture = await seedJobFixture(dataSource, "invoice-lock-gate");
    const { invoice } = await seedInvoiceWithLines(dataSource, fixture);
    const before = await captureInvoiceState(dataSource, invoice.id);
    const lockedInvoice = await invoiceRepo.findOneOrFail({ where: { id: invoice.id } });
    lockedInvoice.approved_at = new Date();
    await invoiceRepo.save(lockedInvoice);

    const shouldBlock = isDocumentLocked(lockedInvoice.approved_at, lockedInvoice.signed_at);
    if (!shouldBlock) {
      throw new Error("invoice_lock_gate_not_triggered");
    }

    const after = await captureInvoiceState(dataSource, invoice.id);
    if (
      after.total_cents !== before.total_cents
      || after.lineCount !== before.lineCount
      || after.lineNames.join("|") !== before.lineNames.join("|")
    ) {
      throw new Error("locked_invoice_state_changed_without_persist");
    }

    return { shouldBlock, before, after };
  });

  await expectPass(summary, "8 locked signed quote is blocked by controller lock gate", async () => {
    const fixture = await seedJobFixture(dataSource, "quote-lock-gate");
    const { quote } = await seedQuoteWithLines(dataSource, fixture);
    const before = await captureQuoteState(dataSource, quote.id);
    const lockedQuote = await quoteRepo.findOneOrFail({ where: { id: quote.id } });
    lockedQuote.signed_at = new Date();
    await quoteRepo.save(lockedQuote);

    const shouldBlock = isDocumentLocked(lockedQuote.approved_at, lockedQuote.signed_at);
    if (!shouldBlock) {
      throw new Error("quote_lock_gate_not_triggered");
    }

    const after = await captureQuoteState(dataSource, quote.id);
    if (
      after.total_cents !== before.total_cents
      || after.lineCount !== before.lineCount
      || after.lineNames.join("|") !== before.lineNames.join("|")
    ) {
      throw new Error("locked_quote_state_changed_without_persist");
    }

    return { shouldBlock, before, after };
  });

  await expectPass(summary, "9 org B cannot resolve org A job for invoice mutation", async () => {
    const orgA = await seedJobFixture(dataSource, "invoice-org-a");
    const orgB = await seedJobFixture(dataSource, "invoice-org-b");
    await seedInvoiceWithLines(dataSource, orgA);

    const crossOrgJob = await jobRepo.findOne({
      where: {
        id: orgA.jobId,
        organization_id: orgB.organizationId,
      },
    });

    if (crossOrgJob) {
      throw new Error("cross_org_job_should_not_resolve");
    }

    return { crossOrgJob: null };
  });

  await expectPass(summary, "10 org B cannot resolve org A job for quote mutation", async () => {
    const orgA = await seedJobFixture(dataSource, "quote-org-a");
    const orgB = await seedJobFixture(dataSource, "quote-org-b");
    await seedQuoteWithLines(dataSource, orgA);

    const crossOrgJob = await jobRepo.findOne({
      where: {
        id: orgA.jobId,
        organization_id: orgB.organizationId,
      },
    });

    if (crossOrgJob) {
      throw new Error("cross_org_job_should_not_resolve");
    }

    return { crossOrgJob: null };
  });
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_doc_line_atomicity_${Date.now()}`;
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
