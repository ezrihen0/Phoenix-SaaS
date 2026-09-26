import "dotenv/config";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import type { Request } from "express";
import { DataSource } from "typeorm";

import { AppModule } from "../app.module";
import { persistInvoiceHeaderAndLineItems, persistQuoteHeaderAndLineItems } from "../crm/crm-document-persistence";
import { DocumentPricingService } from "../crm/document-pricing.service";
import { DocumentSnapshotService, type SnapshotLineDraft } from "../crm/document-snapshot.service";
import { InvoicePaymentRecordingService } from "../crm/invoice-payment-recording.service";
import { MoneyEngineService } from "../crm/money-engine.service";
import { CustomerPortalService } from "../customer-portal/customer-portal.service";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { JobEntity } from "./entities/job.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { WarrantyCertificateEntity } from "./entities/warranty-certificate.entity";
import { SettingsService } from "../settings/settings.service";

const PHOENIX_ORG_ID =
  process.env.PHOENIX_WIZFIELD_ORG_ID?.trim() || "8d5bc762-eb13-43e5-85a1-723477adb47c";

const QA_TAG = "OWNER_PORTAL_QA_TEST";
const QA_EMAIL = "danbrudo01@gmail.com";
const QA_PHONE = "6135550188";
const QA_FULL_NAME = "Test Testy";
const QA_JOB_TITLE = "Gas Fireplace Service — OWNER QA TEST";
const QA_PAYMENT_IDEMPOTENCY = "owner-portal-qa-v1-test-payment";
const QA_NOTES = `${QA_TAG}
[owner_portal_qa:v1] {"tag":"${QA_TAG}","synthetic":true,"excludeFromMarketing":true,"excludeFromWorkizImport":true,"excludeFromReporting":true,"excludeFromDispatch":true}
Synthetic production QA customer. Not a real customer.`;

const PAYMENT_CENTS = 10_000;

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

function mockRequest(): Request {
  return {
    ip: "127.0.0.1",
    get: (header: string) =>
      header.toLowerCase() === "user-agent" ? "owner-portal-qa-provision" : undefined,
    cookies: {},
  } as unknown as Request;
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

async function resolveOwnerActor(dataSource: DataSource) {
  const membership = await dataSource.getRepository(MembershipEntity).findOne({
    where: { organization_id: PHOENIX_ORG_ID, role: "owner", status: "active" },
    order: { created_at: "ASC" },
  });
  if (!membership) {
    throw new Error("No active owner membership found for Phoenix org.");
  }

  const profile = await dataSource.getRepository(ProfileEntity).findOne({
    where: { auth_user_id: membership.user_id },
  });
  if (!profile) {
    throw new Error("Owner profile not found for Phoenix org.");
  }

  return { userId: membership.user_id, profileId: profile.id };
}

export async function runOwnerPortalQaProvision() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dataSource = app.get(DataSource);
  const settingsService = app.get(SettingsService);
  const documentSnapshotService = app.get(DocumentSnapshotService);
  const pricingService = new DocumentPricingService(new MoneyEngineService());
  const paymentService = app.get(InvoicePaymentRecordingService);
  const portalService = app.get(CustomerPortalService);

  try {
    const org = await dataSource.getRepository(OrganizationEntity).findOne({
      where: { id: PHOENIX_ORG_ID },
    });
    if (!org) {
      throw new Error(`Phoenix organization ${PHOENIX_ORG_ID} not found.`);
    }

    const orgSettings = await settingsService.getOrganizationSettings(PHOENIX_ORG_ID);
    const taxRateBps = orgSettings.taxRateBps;

    const customerRepo = dataSource.getRepository(CustomerEntity);
    let customer =
      (await customerRepo.findOne({
        where: { organization_id: PHOENIX_ORG_ID, email: QA_EMAIL },
      })) ??
      (await customerRepo
        .createQueryBuilder("customer")
        .where("customer.organization_id = :organizationId", { organizationId: PHOENIX_ORG_ID })
        .andWhere("LOWER(TRIM(customer.email)) = :email", { email: QA_EMAIL.toLowerCase() })
        .getOne());

    if (!customer) {
      customer = await customerRepo.save(
        customerRepo.create({
          organization_id: PHOENIX_ORG_ID,
          external_client_number: null,
          full_name: QA_FULL_NAME,
          email: QA_EMAIL,
          company_name: null,
          service_address_line_1: "445 Test St",
          service_address_line_2: null,
          service_city: "Ottawa",
          service_state_or_region: "Ontario",
          service_postal_code: "K1T 0A1",
          phone: QA_PHONE,
          legacy_created_at: null,
          source: "website",
          preferred_service_type: "repair",
          notes: QA_NOTES,
          lifecycle_status: "active",
        }),
      );
    } else {
      customer.full_name = QA_FULL_NAME;
      customer.email = QA_EMAIL;
      customer.phone = QA_PHONE;
      customer.service_address_line_1 = "445 Test St";
      customer.service_city = "Ottawa";
      customer.service_state_or_region = "Ontario";
      customer.service_postal_code = "K1T 0A1";
      customer.notes = QA_NOTES;
      customer.lifecycle_status = "active";
      customer.external_client_number = null;
      customer = await customerRepo.save(customer);
    }

    const jobRepo = dataSource.getRepository(JobEntity);
    let job = await jobRepo.findOne({
      where: {
        organization_id: PHOENIX_ORG_ID,
        customer_id: customer.id,
        title: QA_JOB_TITLE,
      },
    });

    const completedAt = new Date("2026-03-15T14:00:00.000Z");
    if (!job) {
      const actor = await resolveOwnerActor(dataSource);
      job = await jobRepo.save(
        jobRepo.create({
          organization_id: PHOENIX_ORG_ID,
          customer_id: customer.id,
          service_id: null,
          assigned_technician_id: null,
          title: QA_JOB_TITLE,
          description: `${QA_TAG} — Completed test only. No dispatch. No notifications.`,
          lead_source: "website",
          requested_service_type: "repair",
          job_type: "installation_repair",
          status: "completed",
          service_address_line_1: "445 Test St",
          service_address_line_2: null,
          service_city: "Ottawa",
          service_state_or_region: "Ontario",
          service_postal_code: "K1T 0A1",
          scheduled_for: completedAt,
          scheduled_window: "test-only",
          requested_at: completedAt,
          on_the_way_at: null,
          started_at: completedAt,
          completed_at: completedAt,
          paid_at: null,
          cancellation_reason: null,
          cancelled_at: null,
          cancelled_by: null,
          created_by_auth_user_id: actor.userId,
          updated_by_auth_user_id: actor.userId,
        }),
      );
    }

    const invoiceRepo = dataSource.getRepository(InvoiceEntity);
    let invoice = await invoiceRepo.findOne({
      where: { organization_id: PHOENIX_ORG_ID, job_id: job.id },
    });

    const lineDrafts = [
      manualLineDraft({
        key: "qa-line-service",
        name: "Gas Fireplace Service",
        unitPriceCents: 20_000,
        sortOrder: 0,
      }),
      manualLineDraft({
        key: "qa-line-remote",
        name: "Remote Control",
        unitPriceCents: 10_000,
        sortOrder: 1,
      }),
    ];
    const invoiceTotals = pricingService.computeSnapshotTotals(
      lineDrafts.map((line) => ({
        quantity: line.quantity,
        unitPriceCents: line.unit_price_cents_snapshot,
      })),
      taxRateBps,
    );

    const quoteRepo = dataSource.getRepository(QuoteEntity);
    let quote = await quoteRepo.findOne({
      where: { organization_id: PHOENIX_ORG_ID, job_id: job.id },
    });
    const quoteTotals = pricingService.computeSnapshotTotals(
      lineDrafts.map((line) => ({
        quantity: line.quantity,
        unitPriceCents: line.unit_price_cents_snapshot,
      })),
      taxRateBps,
    );

    quote = await dataSource.transaction((manager) =>
      persistQuoteHeaderAndLineItems(manager, documentSnapshotService, {
        organizationId: PHOENIX_ORG_ID,
        jobId: job.id,
        existingQuote: quote,
        description: `${QA_TAG} — Native digital estimate (QA)`,
        quoteTotals,
        status: "sent",
        sent_at: new Date(),
        approved_at: null,
        hasSnapshotLineItems: true,
        lineDrafts,
      }),
    );

    invoice = await dataSource.transaction((manager) =>
      persistInvoiceHeaderAndLineItems(manager, documentSnapshotService, {
        organizationId: PHOENIX_ORG_ID,
        jobId: job!.id,
        existingInvoice: invoice,
        description: `${QA_TAG} — Native digital invoice (QA)`,
        invoiceTotals,
        status: "unpaid",
        paid_at: null,
        due_at: new Date(Date.now() + 86_400_000 * 30),
        hasSnapshotLineItems: true,
        lineDrafts,
      }),
    );

    const actor = await resolveOwnerActor(dataSource);
    const paymentResult = await paymentService.recordNativePayment({
      organizationId: PHOENIX_ORG_ID,
      invoiceId: invoice.id,
      actorUserId: actor.userId,
      actorProfileId: actor.profileId,
      payload: {
        idempotencyKey: QA_PAYMENT_IDEMPOTENCY,
        entryType: "payment",
        amountCents: PAYMENT_CENTS,
        method: "other",
        reference: "OWNER-PORTAL-QA-TEST",
        note: `${QA_TAG} synthetic partial payment — not a real charge.`,
        occurredAt: new Date().toISOString(),
      },
    });

    const refreshedInvoice = await invoiceRepo.findOne({
      where: { id: invoice.id, organization_id: PHOENIX_ORG_ID },
      relations: { payments: true },
    });
    if (!refreshedInvoice) {
      throw new Error("Invoice missing after payment recording.");
    }

    const warrantyRepo = dataSource.getRepository(WarrantyCertificateEntity);
    const warrantySnapshot = JSON.stringify({
      certificateNumber: "OWNER-QA-WARRANTY",
      companyName: orgSettings.businessName ?? org.name,
      tag: QA_TAG,
    });
    const warrantyStart = completedAt;
    const warrantySpecs = [
      {
        warranty_type: "labor",
        months: 3,
        coverage_text: "Labor warranty — OWNER QA TEST (3 months). Synthetic QA record only.",
      },
      {
        warranty_type: "parts",
        months: 6,
        coverage_text: "Parts warranty — OWNER QA TEST (6 months). Synthetic QA record only.",
      },
    ] as const;

    for (const spec of warrantySpecs) {
      const existing = await warrantyRepo.findOne({
        where: {
          organization_id: PHOENIX_ORG_ID,
          customer_id: customer.id,
          related_invoice_id: invoice.id,
          warranty_type: spec.warranty_type,
        },
      });
      if (!existing) {
        await warrantyRepo.save(
          warrantyRepo.create({
            organization_id: PHOENIX_ORG_ID,
            customer_id: customer.id,
            related_invoice_id: invoice.id,
            related_job_id: job.id,
            warranty_type: spec.warranty_type,
            warranty_start_date: warrantyStart,
            warranty_end_date: addMonths(warrantyStart, spec.months),
            coverage_text: spec.coverage_text,
            exclusions_text: "Synthetic QA warranty — not a real warranty issuance.",
            issued_by_user_id: actor.userId,
            snapshot_payload_json: warrantySnapshot,
          }),
        );
      }
    }

    const minted = await portalService.createMagicLinkForPhoenixIntegration({
      organizationId: PHOENIX_ORG_ID,
      customerId: customer.id,
      email: null,
      request: mockRequest(),
    });

    const paymentTotalCents = refreshedInvoice.payments?.reduce(
      (sum, row) => sum + (row.amount_cents ?? 0),
      0,
    );
    const balanceCents = Math.max(0, refreshedInvoice.total_cents - (paymentTotalCents ?? 0));

    return {
      ok: true,
      tag: QA_TAG,
      organizationId: PHOENIX_ORG_ID,
      customer: {
        id: customer.id,
        fullName: customer.full_name,
        email: customer.email,
        phone: customer.phone,
        addressLine1: customer.service_address_line_1,
        city: customer.service_city,
        region: customer.service_state_or_region,
        postalCode: customer.service_postal_code,
      },
      job: {
        id: job.id,
        title: job.title,
        status: job.status,
        completedAt: job.completed_at?.toISOString() ?? null,
      },
      estimate: {
        id: quote.id,
        estimateNumber: `EST-${quote.id.slice(0, 8).toUpperCase()}`,
        subtotalCents: quote.subtotal_cents,
        taxCents: quote.tax_cents,
        totalCents: quote.total_cents,
        status: quote.status,
      },
      invoice: {
        id: invoice.id,
        subtotalCents: refreshedInvoice.subtotal_cents,
        taxRateBps: refreshedInvoice.tax_rate_bps_snapshot,
        taxCents: refreshedInvoice.tax_cents,
        totalCents: refreshedInvoice.total_cents,
        paidCents: paymentTotalCents ?? 0,
        balanceCents,
        paymentIdempotentReplay: paymentResult.idempotent,
        invoiceStatus: paymentResult.invoiceStatus,
        ledger: paymentResult.ledger,
      },
      magicLink: {
        host: new URL(minted.magic_link_url).host,
        path: new URL(minted.magic_link_url).pathname,
        expiresAt: minted.expires_at,
        url: minted.magic_link_url,
      },
      historicalPdf: "BLOCKED UNTIL PACKAGE E",
    };
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  runOwnerPortalQaProvision()
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exit(0);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
}
