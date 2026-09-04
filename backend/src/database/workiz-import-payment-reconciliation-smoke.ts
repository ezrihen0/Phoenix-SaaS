import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";
import { enrichInvoiceFromPdf } from "./workiz/workiz-invoice-pdf-enrichment";
import type { WorkizPdfNormalizedInvoice } from "./workiz/workiz-invoice-pdf-normalizer";
import {
  classifyWorkizInvoicePayment,
  planWorkizPaymentRepair,
  sumPaymentRowsCents,
} from "./workiz/workiz-import-payment-reconciliation";
import {
  buildCsvProvenanceSnapshot,
  upsertHistoricalWorkizInvoice,
} from "./workiz/workiz-invoice-upsert";

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

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Workiz payment reconciliation smoke test currently supports MySQL only.");
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
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
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
    summary.results.push({
      name,
      status: "FAIL",
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function buildNormalizedInvoice(input: {
  invoiceCode: string;
  totalCents: number;
  payments: Array<{ amount_cents: number; method?: string; status?: string }>;
}): WorkizPdfNormalizedInvoice {
  return {
    invoice_number: input.invoiceCode,
    invoice_date: "2024-01-01T00:00:00.000Z",
    due_date: "2024-01-01T00:00:00.000Z",
    customer: {
      name: "Smoke Customer",
      company: null,
      phone: "(403) 555-0100",
      email: "smoke@wizfield.test",
      street: "1 Smoke Street",
      city: "Calgary",
      province: "AB",
      postal_code: "T2P0A1",
    },
    line_items: [{
      description: "Smoke service",
      quantity: 1,
      unit_price_cents: input.totalCents,
      amount_cents: input.totalCents,
      content_lines: ["Smoke service"],
      parts: [],
    }],
    service_summary: [],
    warranty: null,
    financials: {
      subtotal_cents: input.totalCents,
      discount_cents: null,
      tax_amount_cents: 0,
      tax_rate_bps: 0,
      total_cents: input.totalCents,
      balance_due_cents: 0,
    },
    payments: input.payments.map((payment) => ({
      occurred_at: null,
      method: payment.method ?? "Credit offline",
      amount_cents: payment.amount_cents,
      status: payment.status ?? "Paid",
      raw_date_lines: [],
    })),
    notes: null,
    terms: null,
    extraction_meta: {
      source_filename: `${input.invoiceCode}.pdf`,
      source_path: `/tmp/${input.invoiceCode}.pdf`,
      file_hash: `hash-${input.invoiceCode}`,
      workiz_file_number: "00001",
      warnings: [],
      errors: [],
    },
  };
}

async function seedHistoricalInvoice(dataSource: DataSource, input: {
  organizationId: string;
  customerId: string;
  invoiceCode: string;
  totalCents: number;
  paid: boolean;
}) {
  const importedAt = new Date().toISOString();
  const result = await upsertHistoricalWorkizInvoice({
    dataSource,
    organizationId: input.organizationId,
    customerId: input.customerId,
    historical: {
      invoiceCode: input.invoiceCode,
      jobCode: null,
      invoiceDate: new Date("2024-01-01T00:00:00.000Z"),
      dueDate: new Date("2024-01-01T00:00:00.000Z"),
      subtotalCents: input.totalCents,
      taxCents: 0,
      taxRateBps: 0,
      totalCents: input.totalCents,
      paid: input.paid,
      paidAt: input.paid ? new Date("2024-01-01T00:00:00.000Z") : null,
      lineItems: [{
        description: "Historical Workiz service",
        quantity: 1,
        unitPriceCents: input.totalCents,
        amountCents: input.totalCents,
      }],
      payments: input.paid
        ? [{
          amountCents: input.totalCents,
          occurredAt: new Date("2024-01-01T00:00:00.000Z"),
          methodLabel: "derived_from_csv_balance",
        }]
        : [],
      notes: null,
      provenance: JSON.parse(buildCsvProvenanceSnapshot({
        invoiceCode: input.invoiceCode,
        jobCode: null,
        sourceFilename: "smoke.csv",
        importedAt,
        financialMismatch: false,
        statusRaw: input.paid ? "Paid" : "Unpaid",
        mismatchReason: null,
      })),
    },
  });

  return result;
}

async function loadPayments(dataSource: DataSource, invoiceId: string) {
  return dataSource.getRepository(InvoicePaymentEntity).find({
    where: { invoice_id: invoiceId },
    order: { reference: "ASC" },
  });
}

async function main() {
  const baseOptions = requireMySqlOptions();
  const smokeDbName = process.env.DB_SMOKE_DATABASE ?? `wizfield_workiz_pay_verify_${Date.now()}`;
  const dropDatabase = normalizeBooleanFlag(process.env.DB_SMOKE_DROP, true);
  const summary = createSummary(smokeDbName);
  const admin = await mysql.createConnection({
    host: baseOptions.host,
    port: baseOptions.port,
    user: baseOptions.username,
    password: baseOptions.password,
  });

  let dataSource: DataSource | null = null;

  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${smokeDbName}\``);
    summary.phases.databaseCreate = "PASS";

    dataSource = new DataSource({
      ...baseOptions,
      database: smokeDbName,
      migrationsRun: true,
    });
    await dataSource.initialize();
    summary.phases.migrations = "PASS";

    await verifyDatabaseSchema(dataSource);
    summary.phases.schemaVerify = "PASS";

    const organization = await dataSource.getRepository(OrganizationEntity).save(
      dataSource.getRepository(OrganizationEntity).create({
        name: "Smoke Org",
        slug: `smoke-${randomUUID().slice(0, 8)}`,
        is_active: true,
      }),
    );

    const customer = await dataSource.getRepository(CustomerEntity).save(
      dataSource.getRepository(CustomerEntity).create({
        id: randomUUID(),
        organization_id: organization.id,
        full_name: "Smoke Customer",
        email: "smoke@wizfield.test",
        phone: "(403) 555-0100",
        service_address_line_1: "1 Smoke Street",
        service_city: "Calgary",
        service_state_or_region: "AB",
        service_postal_code: "T2P0A1",
      }),
    );

    await expectPass(summary, "csv_only_one_synthetic_settlement", async () => {
      const seeded = await seedHistoricalInvoice(dataSource!, {
        organizationId: organization.id,
        customerId: customer.id,
        invoiceCode: "CSV001",
        totalCents: 10_000,
        paid: true,
      });
      const payments = await loadPayments(dataSource!, seeded.invoiceId);
      if (payments.length !== 1) throw new Error(`expected 1 payment, got ${payments.length}`);
      const kind = classifyWorkizInvoicePayment(payments[0], "CSV001").kind;
      if (kind !== "synthetic_csv_settlement") throw new Error(`expected synthetic_csv_settlement, got ${kind}`);
      if (payments[0].amount_cents !== 10_000) throw new Error("synthetic amount mismatch");
      return { paymentCount: payments.length, amountCents: payments[0].amount_cents };
    });

    await expectPass(summary, "csv_plus_one_pdf_payment", async () => {
      const seeded = await seedHistoricalInvoice(dataSource!, {
        organizationId: organization.id,
        customerId: customer.id,
        invoiceCode: "PDF001",
        totalCents: 20_000,
        paid: true,
      });
      const normalized = buildNormalizedInvoice({
        invoiceCode: "PDF001",
        totalCents: 20_000,
        payments: [{ amount_cents: 20_000 }],
      });
      await enrichInvoiceFromPdf({
        dataSource: dataSource!,
        organizationId: organization.id,
        invoiceId: seeded.invoiceId,
        jobId: seeded.jobId,
        normalized,
        customerConflictReview: "none",
      });
      const payments = await loadPayments(dataSource!, seeded.invoiceId);
      if (payments.length !== 1) throw new Error(`expected 1 payment, got ${payments.length}`);
      if (payments[0].amount_cents !== 20_000) throw new Error("authoritative amount mismatch");
      if (!payments[0].note?.includes("Workiz PDF enrichment")) throw new Error("expected pdf note");
      return { paymentCount: payments.length };
    });

    await expectPass(summary, "csv_plus_two_pdf_payments", async () => {
      const seeded = await seedHistoricalInvoice(dataSource!, {
        organizationId: organization.id,
        customerId: customer.id,
        invoiceCode: "PDF002",
        totalCents: 30_000,
        paid: true,
      });
      const normalized = buildNormalizedInvoice({
        invoiceCode: "PDF002",
        totalCents: 30_000,
        payments: [{ amount_cents: 5_000 }, { amount_cents: 25_000 }],
      });
      await enrichInvoiceFromPdf({
        dataSource: dataSource!,
        organizationId: organization.id,
        invoiceId: seeded.invoiceId,
        jobId: seeded.jobId,
        normalized,
        customerConflictReview: "none",
      });
      const payments = await loadPayments(dataSource!, seeded.invoiceId);
      if (payments.length !== 2) throw new Error(`expected 2 payments, got ${payments.length}`);
      const sum = payments.reduce((total, payment) => total + payment.amount_cents, 0);
      if (sum !== 30_000) throw new Error(`expected sum 30000, got ${sum}`);
      return { paymentCount: payments.length, sum };
    });

    await expectPass(summary, "pdf_enrichment_idempotent", async () => {
      const seeded = await seedHistoricalInvoice(dataSource!, {
        organizationId: organization.id,
        customerId: customer.id,
        invoiceCode: "PDF003",
        totalCents: 40_000,
        paid: true,
      });
      const normalized = buildNormalizedInvoice({
        invoiceCode: "PDF003",
        totalCents: 40_000,
        payments: [{ amount_cents: 15_000 }, { amount_cents: 25_000 }],
      });
      await enrichInvoiceFromPdf({
        dataSource: dataSource!,
        organizationId: organization.id,
        invoiceId: seeded.invoiceId,
        jobId: seeded.jobId,
        normalized,
        customerConflictReview: "none",
      });
      const before = await loadPayments(dataSource!, seeded.invoiceId);
      const second = await enrichInvoiceFromPdf({
        dataSource: dataSource!,
        organizationId: organization.id,
        invoiceId: seeded.invoiceId,
        jobId: seeded.jobId,
        normalized,
        customerConflictReview: "none",
      });
      const after = await loadPayments(dataSource!, seeded.invoiceId);
      if (second.action !== "skipped_already_enriched") {
        throw new Error(`expected skipped_already_enriched, got ${second.action}`);
      }
      if (before.length !== after.length) throw new Error("payment count changed on re-run");
      return { action: second.action, paymentCount: after.length };
    });

    await expectPass(summary, "csv_rerun_after_pdf_enrichment_no_stack", async () => {
      const seeded = await seedHistoricalInvoice(dataSource!, {
        organizationId: organization.id,
        customerId: customer.id,
        invoiceCode: "PDF004",
        totalCents: 50_000,
        paid: true,
      });
      const normalized = buildNormalizedInvoice({
        invoiceCode: "PDF004",
        totalCents: 50_000,
        payments: [{ amount_cents: 20_000 }, { amount_cents: 30_000 }],
      });
      await enrichInvoiceFromPdf({
        dataSource: dataSource!,
        organizationId: organization.id,
        invoiceId: seeded.invoiceId,
        jobId: seeded.jobId,
        normalized,
        customerConflictReview: "none",
      });
      await upsertHistoricalWorkizInvoice({
        dataSource: dataSource!,
        organizationId: organization.id,
        customerId: customer.id,
        existing: { invoiceId: seeded.invoiceId, jobId: seeded.jobId },
        historical: {
          invoiceCode: "PDF004",
          jobCode: null,
          invoiceDate: new Date("2024-01-01T00:00:00.000Z"),
          dueDate: new Date("2024-01-01T00:00:00.000Z"),
          subtotalCents: 50_000,
          taxCents: 0,
          taxRateBps: 0,
          totalCents: 50_000,
          paid: true,
          paidAt: new Date("2024-01-01T00:00:00.000Z"),
          lineItems: [{
            description: "Historical Workiz service",
            quantity: 1,
            unitPriceCents: 50_000,
            amountCents: 50_000,
          }],
          payments: [{
            amountCents: 50_000,
            occurredAt: new Date("2024-01-01T00:00:00.000Z"),
            methodLabel: "derived_from_csv_balance",
          }],
          notes: null,
          provenance: {},
        },
      });
      const payments = await loadPayments(dataSource!, seeded.invoiceId);
      if (payments.length !== 2) throw new Error(`expected 2 payments after csv rerun, got ${payments.length}`);
      const sum = payments.reduce((total, payment) => total + payment.amount_cents, 0);
      if (sum !== 50_000) throw new Error(`expected sum 50000, got ${sum}`);
      return { paymentCount: payments.length, sum };
    });

    await expectPass(summary, "partial_enrichment_without_pdf_payments_keeps_csv", async () => {
      const seeded = await seedHistoricalInvoice(dataSource!, {
        organizationId: organization.id,
        customerId: customer.id,
        invoiceCode: "PDF005",
        totalCents: 12_000,
        paid: true,
      });
      const normalized = buildNormalizedInvoice({
        invoiceCode: "PDF005",
        totalCents: 12_000,
        payments: [],
      });
      await enrichInvoiceFromPdf({
        dataSource: dataSource!,
        organizationId: organization.id,
        invoiceId: seeded.invoiceId,
        jobId: seeded.jobId,
        normalized,
        customerConflictReview: "none",
      });
      const payments = await loadPayments(dataSource!, seeded.invoiceId);
      if (payments.length !== 1) throw new Error(`expected csv synthetic to remain, got ${payments.length}`);
      return { paymentCount: payments.length };
    });

    await expectPass(summary, "native_payment_row_protected", async () => {
      const seeded = await seedHistoricalInvoice(dataSource!, {
        organizationId: organization.id,
        customerId: customer.id,
        invoiceCode: "NAT001",
        totalCents: 18_000,
        paid: true,
      });
      await dataSource!.getRepository(InvoicePaymentEntity).save(
        dataSource!.getRepository(InvoicePaymentEntity).create({
          id: randomUUID(),
          organization_id: organization.id,
          invoice_id: seeded.invoiceId,
          entry_type: "payment",
          amount_cents: 500,
          method: "cash",
          reference: "native-manual-payment",
          idempotency_key: randomUUID(),
          note: "Native smoke payment",
          occurred_at: new Date("2024-02-01T00:00:00.000Z"),
          created_by_auth_user_id: randomUUID(),
        }),
      );
      const normalized = buildNormalizedInvoice({
        invoiceCode: "NAT001",
        totalCents: 18_000,
        payments: [{ amount_cents: 18_000 }],
      });
      let threw = false;
      try {
        await enrichInvoiceFromPdf({
          dataSource: dataSource!,
          organizationId: organization.id,
          invoiceId: seeded.invoiceId,
          jobId: seeded.jobId,
          normalized,
          customerConflictReview: "none",
        });
      } catch {
        threw = true;
      }
      if (!threw) throw new Error("expected enrichment to refuse native/manual rows");
      return { refused: true };
    });

    await expectPass(summary, "repair_dry_run_ambiguous_provenance", async () => {
      const job = await dataSource!.getRepository(JobEntity).save(
        dataSource!.getRepository(JobEntity).create({
          organization_id: organization.id,
          customer_id: customer.id,
          service_id: null,
          assigned_technician_id: null,
          title: "Ambiguous provenance job",
          description: "Smoke job for repair dry-run ambiguity",
          lead_source: "repeat_customer",
          requested_service_type: "repair",
          job_type: "installation_repair",
          status: "completed",
          service_address_line_1: customer.service_address_line_1,
          service_city: customer.service_city,
          service_state_or_region: customer.service_state_or_region,
          service_postal_code: customer.service_postal_code,
          scheduled_for: new Date("2024-01-01T00:00:00.000Z"),
          requested_at: new Date("2024-01-01T00:00:00.000Z"),
          completed_at: new Date("2024-01-01T00:00:00.000Z"),
          created_by_auth_user_id: null,
          updated_by_auth_user_id: null,
        }),
      );
      const invoice = await dataSource!.getRepository(InvoiceEntity).save(
        dataSource!.getRepository(InvoiceEntity).create({
          id: randomUUID(),
          job_id: job.id,
          organization_id: organization.id,
          description: "No snapshot invoice",
          amount_cents: 1000,
          subtotal_cents: 1000,
          tax_rate_bps_snapshot: 0,
          tax_cents: 0,
          total_cents: 1000,
          status: "paid",
          issued_at: new Date("2024-01-01T00:00:00.000Z"),
          due_at: new Date("2024-01-01T00:00:00.000Z"),
          branding_snapshot_json: JSON.stringify({ import_source: "workiz_historical_import" }),
        }),
      );
      const plan = planWorkizPaymentRepair({ invoice, payments: [] });
      if (plan.eligibility !== "MANUAL_REVIEW") throw new Error("expected MANUAL_REVIEW");
      return plan.skipReason;
    });

    await expectPass(summary, "repair_dry_run_refuses_inconsistent_pdf_sum", async () => {
      const seeded = await seedHistoricalInvoice(dataSource!, {
        organizationId: organization.id,
        customerId: customer.id,
        invoiceCode: "BAD001",
        totalCents: 10_000,
        paid: true,
      });
      const invoice = await dataSource!.getRepository(InvoiceEntity).findOneByOrFail({ id: seeded.invoiceId });
      invoice.branding_snapshot_json = JSON.stringify({
        import_source: "workiz_historical_import",
        workiz_invoice_code: "BAD001",
        enrichment_status: "complete",
        pdf_enrichment: {
          payments_snapshot: [{ amount_cents: 4_000, method: "Cash", status: "Paid", occurred_at: null }],
        },
      });
      const plan = planWorkizPaymentRepair({
        invoice,
        payments: await loadPayments(dataSource!, seeded.invoiceId),
      });
      if (plan.eligibility !== "MANUAL_REVIEW") throw new Error("expected MANUAL_REVIEW for inconsistent sum");
      return plan.skipReason;
    });

    await expectPass(summary, "repair_dry_run_proposes_authoritative_history_for_stacked_fixture", async () => {
      const seeded = await seedHistoricalInvoice(dataSource!, {
        organizationId: organization.id,
        customerId: customer.id,
        invoiceCode: "STACK1",
        totalCents: 30_000,
        paid: true,
      });
      const paymentRepo = dataSource!.getRepository(InvoicePaymentEntity);
      await paymentRepo.delete({ invoice_id: seeded.invoiceId });
      await paymentRepo.save([
        paymentRepo.create({
          id: randomUUID(),
          organization_id: organization.id,
          invoice_id: seeded.invoiceId,
          entry_type: "payment",
          amount_cents: 30_000,
          method: "other",
          reference: "workiz:STACK1:payment:1",
          note: "Workiz CSV import: derived_from_csv_balance",
          occurred_at: new Date("2024-01-01T00:00:00.000Z"),
          created_by_auth_user_id: null,
        }),
        paymentRepo.create({
          id: randomUUID(),
          organization_id: organization.id,
          invoice_id: seeded.invoiceId,
          entry_type: "payment",
          amount_cents: 25_000,
          method: "card_manual",
          reference: "workiz:STACK1:payment:2",
          note: "Workiz PDF enrichment: Credit offline (Paid)",
          occurred_at: new Date("2024-01-02T00:00:00.000Z"),
          created_by_auth_user_id: null,
        }),
      ]);
      const invoice = await dataSource!.getRepository(InvoiceEntity).findOneByOrFail({ id: seeded.invoiceId });
      invoice.branding_snapshot_json = JSON.stringify({
        import_source: "workiz_historical_import",
        workiz_invoice_code: "STACK1",
        enrichment_status: "complete",
        pdf_enrichment: {
          payments_snapshot: [
            { amount_cents: 5_000, method: "Credit offline", status: "Paid", occurred_at: null },
            { amount_cents: 25_000, method: "Credit offline", status: "Paid", occurred_at: null },
          ],
        },
      });
      const plan = planWorkizPaymentRepair({
        invoice,
        payments: await loadPayments(dataSource!, seeded.invoiceId),
      });
      if (plan.eligibility !== "AUTO_ELIGIBLE") throw new Error(`expected AUTO_ELIGIBLE, got ${plan.eligibility}`);
      if (plan.proposedCreates.length !== 2) throw new Error("expected two proposed creates");
      if (plan.proposedLedgerSumCents !== 30_000) throw new Error("expected proposed sum 30000");
      return {
        removals: plan.proposedRemovals.length,
        creates: plan.proposedCreates.length,
        proposedSum: plan.proposedLedgerSumCents,
      };
    });

    await expectPass(summary, "repair_dry_run_no_change_for_correct_single_payment", async () => {
      const seeded = await seedHistoricalInvoice(dataSource!, {
        organizationId: organization.id,
        customerId: customer.id,
        invoiceCode: "GOOD1",
        totalCents: 20_000,
        paid: true,
      });
      const normalized = buildNormalizedInvoice({
        invoiceCode: "GOOD1",
        totalCents: 20_000,
        payments: [{ amount_cents: 20_000 }],
      });
      await enrichInvoiceFromPdf({
        dataSource: dataSource!,
        organizationId: organization.id,
        invoiceId: seeded.invoiceId,
        jobId: seeded.jobId,
        normalized,
        customerConflictReview: "none",
      });
      const invoice = await dataSource!.getRepository(InvoiceEntity).findOneByOrFail({ id: seeded.invoiceId });
      const plan = planWorkizPaymentRepair({
        invoice,
        payments: await loadPayments(dataSource!, seeded.invoiceId),
      });
      if (plan.eligibility !== "NO_CHANGE") throw new Error(`expected NO_CHANGE, got ${plan.eligibility}`);
      return plan.eligibility;
    });

    await expectPass(summary, "ledger_service_correct_on_authoritative_fixture", async () => {
      const seeded = await seedHistoricalInvoice(dataSource!, {
        organizationId: organization.id,
        customerId: customer.id,
        invoiceCode: "LEDGR1",
        totalCents: 30_000,
        paid: true,
      });
      await enrichInvoiceFromPdf({
        dataSource: dataSource!,
        organizationId: organization.id,
        invoiceId: seeded.invoiceId,
        jobId: seeded.jobId,
        normalized: buildNormalizedInvoice({
          invoiceCode: "LEDGR1",
          totalCents: 30_000,
          payments: [{ amount_cents: 10_000 }, { amount_cents: 20_000 }],
        }),
        customerConflictReview: "none",
      });
      const invoice = await dataSource!.getRepository(InvoiceEntity).findOneOrFail({
        where: { id: seeded.invoiceId },
        relations: { payments: true },
      });
      const ledger = new InvoicePaymentLedgerService().summarizeInvoice({
        totalCents: invoice.total_cents,
        legacyStatus: invoice.status,
        legacyPaidAt: invoice.paid_at,
        payments: invoice.payments ?? [],
      });
      if (ledger.lifecycleStatus !== "paid") throw new Error(`expected paid, got ${ledger.lifecycleStatus}`);
      if (ledger.netPaidCents !== 30_000) throw new Error(`expected net paid 30000, got ${ledger.netPaidCents}`);
      if (ledger.balanceCents !== 0) throw new Error(`expected balance 0, got ${ledger.balanceCents}`);
      return ledger;
    });

    summary.phases.tests = "PASS";
    summary.ok = true;
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (dropDatabase) {
      await admin.query(`DROP DATABASE IF EXISTS \`${smokeDbName}\``);
      summary.phases.cleanup = "PASS";
    }
    await admin.end();
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
