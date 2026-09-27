import { HttpException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { DataSource, In, Like } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import type { ActorContext } from "../common/request-types";
import { DocumentPricingService } from "../crm/document-pricing.service";
import { DocumentSnapshotService } from "../crm/document-snapshot.service";
import { EstimateInvoiceConversionService } from "../crm/estimate-invoice-conversion.service";
import { MoneyEngineService } from "../crm/money-engine.service";
import { listPermissionsForMembership } from "../team/membership-permissions";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { JobEntity } from "./entities/job.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationSettingEntity } from "./entities/organization-setting.entity";
import { PricebookBundleItemEntity } from "./entities/pricebook-bundle-item.entity";
import { PricebookBundleEntity } from "./entities/pricebook-bundle.entity";
import { PricebookItemEntity } from "./entities/pricebook-item.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { QuoteLineItemEntity } from "./entities/quote-line-item.entity";
import { UserEntity } from "./entities/user.entity";
import type { SmokeDatabasePlan } from "./db-smoke-database-plan";
import { buildDataSourceOptions } from "./typeorm.config";

export type SmokePhaseStatus = "PASS" | "FAIL" | "SKIP";
export type SmokeOutcome = "PASS" | "SKIP" | "FAIL";

const EPHEMERAL_DATABASE_ACCESS_DENIED = /Access denied.*database/i;
const PRODUCTION_DATABASE_MARKERS = [/production/i, /\bprod\b/i, /\brailway\b/i, /\blive\b/i];

export type ConversionSmokeFixture = {
  token: string;
  organizationId: string;
  foreignOrganizationId: string;
  userId: string;
  profileId: string;
  membershipId: string;
  customerId: string;
  jobId: string;
  quoteId: string;
  pricebookItemId: string;
  actor: ActorContext;
};

export function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Estimate invoice conversion smoke supports MySQL only.");
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

export function extractErrorCode(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse() as { error?: { code?: string; message?: string } };
    return response?.error?.code ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function isEphemeralDatabaseAccessDeniedMessage(message: string) {
  return EPHEMERAL_DATABASE_ACCESS_DENIED.test(message);
}

export function assertConfiguredSmokeDatabaseIsSafe(databaseName: string) {
  const normalized = databaseName.trim();
  if (!normalized) {
    throw new Error("Configured database name is empty; refusing conversion smoke mutations.");
  }

  for (const pattern of PRODUCTION_DATABASE_MARKERS) {
    if (pattern.test(normalized)) {
      throw new Error(
        `Refusing conversion smoke mutations on potentially production database "${normalized}". Use local/test/staging only.`,
      );
    }
  }
}

export function finalizeSmokeSummary<
  TSummary extends {
    ok: boolean;
    outcome?: SmokeOutcome;
    errors: string[];
    phases: Record<string, SmokePhaseStatus>;
    results: Array<{ name: string; status: "PASS" | "FAIL" | "SKIP"; detail?: unknown }>;
  },
>(summary: TSummary, ephemeralSkipped: boolean) {
  if (ephemeralSkipped) {
    summary.outcome = "SKIP";
    summary.ok = false;
    return;
  }

  const hasFail =
    summary.errors.length > 0 || summary.results.some((result) => result.status === "FAIL");
  const hasSkip = summary.results.some((result) => result.status === "SKIP");

  if (hasFail) {
    summary.outcome = "FAIL";
    summary.ok = false;
    return;
  }

  if (hasSkip || summary.phases.tests === "SKIP") {
    summary.outcome = "SKIP";
    summary.ok = false;
    return;
  }

  if (summary.phases.tests === "PASS") {
    summary.outcome = "PASS";
    summary.ok = true;
    return;
  }

  summary.outcome = "FAIL";
  summary.ok = false;
}

export function applyEphemeralDatabaseAccessSkip<
  TSummary extends {
    ok: boolean;
    outcome?: SmokeOutcome;
    errors: string[];
    phases: Record<string, SmokePhaseStatus>;
    results: Array<{ name: string; status: "PASS" | "FAIL" | "SKIP"; detail?: unknown }>;
  },
>(summary: TSummary, plan: SmokeDatabasePlan) {
  if (plan.mode !== "ephemeral") {
    return false;
  }

  const deniedErrors = summary.errors.filter((error) => isEphemeralDatabaseAccessDeniedMessage(error));
  if (deniedErrors.length === 0) {
    return false;
  }

  summary.results = summary.results.filter((result) => {
    if (result.status !== "FAIL") {
      return true;
    }

    const detail = typeof result.detail === "string" ? result.detail : String(result.detail ?? "");
    return !isEphemeralDatabaseAccessDeniedMessage(detail);
  });
  summary.results.push({
    name: "ephemeral database provisioning",
    status: "SKIP",
    detail:
      "DB user lacks CREATE DATABASE for ephemeral verify DB. Set FINANCE_SMOKE_USE_CONFIGURED_DATABASE=true to run against the configured database.",
  });
  summary.errors = summary.errors.filter((error) => !isEphemeralDatabaseAccessDeniedMessage(error));
  summary.phases.databaseCreate = "SKIP";
  summary.phases.migrations = "SKIP";
  summary.phases.schemaVerify = "SKIP";
  summary.phases.tests = "SKIP";
  summary.outcome = "SKIP";
  summary.ok = false;
  return true;
}

export function buildDocumentSnapshotService(dataSource: DataSource) {
  const moneyEngineService = new MoneyEngineService();
  const documentPricingService = new DocumentPricingService(moneyEngineService);

  return new DocumentSnapshotService(
    dataSource.getRepository(InvoiceLineItemEntity),
    dataSource.getRepository(QuoteLineItemEntity),
    dataSource.getRepository(PricebookItemEntity),
    dataSource.getRepository(PricebookBundleEntity),
    dataSource.getRepository(PricebookBundleItemEntity),
    documentPricingService,
    {} as never,
  );
}

export function buildConversionService(dataSource: DataSource) {
  const documentSnapshotService = buildDocumentSnapshotService(dataSource);
  const moneyEngineService = new MoneyEngineService();

  return new EstimateInvoiceConversionService(
    dataSource.getRepository(JobEntity),
    dataSource.getRepository(QuoteEntity),
    dataSource.getRepository(QuoteLineItemEntity),
    dataSource.getRepository(InvoiceEntity),
    dataSource.getRepository(OrganizationSettingEntity),
    documentSnapshotService,
    moneyEngineService,
    dataSource,
  );
}

function buildActor(input: {
  user: UserEntity;
  profile: ProfileEntity;
  membership: MembershipEntity;
  organizationId: string;
}): ActorContext {
  return {
    user: input.user,
    profile: input.profile,
    technician: null,
    memberships: [input.membership],
    membership: input.membership,
    organization: null,
    membership_id: input.membership.id,
    organization_id: input.organizationId,
    role: input.membership.role,
    permissions: listPermissionsForMembership(input.membership),
    platform_capabilities: [],
  };
}

export async function seedConversionSmokeFixture(dataSource: DataSource): Promise<ConversionSmokeFixture> {
  const token = randomUUID().slice(0, 8);
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const userRepo = dataSource.getRepository(UserEntity);
  const profileRepo = dataSource.getRepository(ProfileEntity);
  const membershipRepo = dataSource.getRepository(MembershipEntity);
  const customerRepo = dataSource.getRepository(CustomerEntity);
  const jobRepo = dataSource.getRepository(JobEntity);
  const quoteRepo = dataSource.getRepository(QuoteEntity);
  const quoteLineRepo = dataSource.getRepository(QuoteLineItemEntity);
  const pricebookItemRepo = dataSource.getRepository(PricebookItemEntity);

  const organization = await orgRepo.save(
    orgRepo.create({
      name: `Conversion Smoke Org ${token}`,
      slug: `estimate-conversion-smoke-${token}`,
      is_active: true,
    }),
  );

  const foreignOrganization = await orgRepo.save(
    orgRepo.create({
      name: `Conversion Smoke Foreign Org ${token}`,
      slug: `estimate-conversion-smoke-foreign-${token}`,
      is_active: true,
    }),
  );

  const user = await userRepo.save(
    userRepo.create({
      email: `estimate-conversion-smoke-${token}@example.com`,
      password_hash: "smoke-test-password-hash",
      is_active: true,
    }),
  );

  const profile = await profileRepo.save(
    profileRepo.create({
      auth_user_id: user.id,
      full_name: `Conversion Smoke Owner ${token}`,
      phone: "5551000200",
      role: "owner",
    }),
  );

  const membership = await membershipRepo.save(
    membershipRepo.create({
      user_id: user.id,
      organization_id: organization.id,
      role: "owner",
      status: "active",
    }),
  );

  const customer = await customerRepo.save(
    customerRepo.create({
      organization_id: organization.id,
      full_name: `Conversion Smoke Customer ${token}`,
      phone: "5551000201",
      email: null,
      company_name: null,
      service_address_line_1: "200 Smoke Lane",
      service_address_line_2: null,
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T2P1A2",
      notes: null,
      lifecycle_status: "active",
      preferred_service_type: null,
    }),
  );

  const job = await jobRepo.save(
    jobRepo.create({
      organization_id: organization.id,
      customer_id: customer.id,
      service_id: null,
      assigned_technician_id: null,
      title: `Conversion Smoke Job ${token}`,
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

  const estimateUnitPriceCents = 12_345;
  const catalogUnitPriceCents = 9_999;

  const pricebookItem = await pricebookItemRepo.save(
    pricebookItemRepo.create({
      organization_id: organization.id,
      internal_sku: `CONV-SMOKE-${token}`,
      name: "Conversion smoke catalog item",
      customer_description: "Frozen at estimate time",
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
      customer_price_cents: catalogUnitPriceCents,
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
      created_by_user_id: user.id,
      updated_by_user_id: user.id,
      deleted_by_user_id: null,
      archived_at: null,
    }),
  );

  const quote = await quoteRepo.save(
    quoteRepo.create({
      job_id: job.id,
      organization_id: organization.id,
      branch_id: null,
      description: "Approved estimate for conversion smoke",
      price_cents: estimateUnitPriceCents,
      subtotal_cents: estimateUnitPriceCents,
      tax_rate_bps_snapshot: 0,
      tax_cents: 0,
      total_cents: estimateUnitPriceCents,
      status: "approved",
      sent_at: new Date(),
      approved_at: new Date(),
      approval_requested_at: new Date(),
      signature_requested_at: null,
      signed_at: null,
      signed_by_name: null,
    }),
  );

  await quoteLineRepo.save(
    quoteLineRepo.create({
      quote_id: quote.id,
      pricebook_item_id: pricebookItem.id,
      document_line_key: `est-line-${token}`,
      sku_snapshot: pricebookItem.internal_sku,
      name_snapshot: pricebookItem.name,
      description_snapshot: pricebookItem.customer_description,
      item_type_snapshot: pricebookItem.item_type,
      unit_of_measure_snapshot: pricebookItem.unit_of_measure,
      unit_price_cents_snapshot: estimateUnitPriceCents,
      base_cost_cents_snapshot: null,
      material_cost_cents_snapshot: null,
      labor_cost_cents_snapshot: null,
      estimated_labor_minutes_snapshot: null,
      warranty_months_snapshot: 12,
      pricebook_bundle_id: null,
      bundle_requirement_id: null,
      catalog_unit_price_cents_snapshot: catalogUnitPriceCents,
      quantity: "1",
      line_subtotal_cents: estimateUnitPriceCents,
      sort_order: 0,
    }),
  );

  return {
    token,
    organizationId: organization.id,
    foreignOrganizationId: foreignOrganization.id,
    userId: user.id,
    profileId: profile.id,
    membershipId: membership.id,
    customerId: customer.id,
    jobId: job.id,
    quoteId: quote.id,
    pricebookItemId: pricebookItem.id,
    actor: buildActor({ user, profile, membership, organizationId: organization.id }),
  };
}

export async function seedDraftEstimateJob(dataSource: DataSource, organizationId: string, userId: string) {
  const token = randomUUID().slice(0, 8);
  const customerRepo = dataSource.getRepository(CustomerEntity);
  const jobRepo = dataSource.getRepository(JobEntity);
  const quoteRepo = dataSource.getRepository(QuoteEntity);
  const quoteLineRepo = dataSource.getRepository(QuoteLineItemEntity);

  const customer = await customerRepo.save(
    customerRepo.create({
      organization_id: organizationId,
      full_name: `Draft Estimate Customer ${token}`,
      phone: "5551000300",
      email: null,
      company_name: null,
      service_address_line_1: "300 Smoke Lane",
      service_address_line_2: null,
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T2P1A3",
      notes: null,
      lifecycle_status: "active",
      preferred_service_type: null,
    }),
  );

  const job = await jobRepo.save(
    jobRepo.create({
      organization_id: organizationId,
      customer_id: customer.id,
      service_id: null,
      assigned_technician_id: null,
      title: `Draft Estimate Job ${token}`,
      description: "Draft estimate fixture",
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
      created_by_auth_user_id: userId,
      updated_by_auth_user_id: userId,
    }),
  );

  const quote = await quoteRepo.save(
    quoteRepo.create({
      job_id: job.id,
      organization_id: organizationId,
      branch_id: null,
      description: "Draft estimate",
      price_cents: 5_000,
      subtotal_cents: 5_000,
      tax_rate_bps_snapshot: 0,
      tax_cents: 0,
      total_cents: 5_000,
      status: "draft",
      sent_at: null,
      approved_at: null,
      approval_requested_at: null,
      signature_requested_at: null,
      signed_at: null,
      signed_by_name: null,
    }),
  );

  await quoteLineRepo.save(
    quoteLineRepo.create({
      quote_id: quote.id,
      pricebook_item_id: null,
      document_line_key: `draft-line-${token}`,
      sku_snapshot: "DRAFT-SKU",
      name_snapshot: "Draft line",
      description_snapshot: null,
      item_type_snapshot: "service",
      unit_of_measure_snapshot: "each",
      unit_price_cents_snapshot: 5_000,
      base_cost_cents_snapshot: null,
      material_cost_cents_snapshot: null,
      labor_cost_cents_snapshot: null,
      estimated_labor_minutes_snapshot: null,
      warranty_months_snapshot: null,
      pricebook_bundle_id: null,
      bundle_requirement_id: null,
      catalog_unit_price_cents_snapshot: null,
      quantity: "1",
      line_subtotal_cents: 5_000,
      sort_order: 0,
    }),
  );

  return { jobId: job.id, quoteId: quote.id };
}

export async function seedEmptyInvoiceShell(
  dataSource: DataSource,
  input: { organizationId: string; jobId: string },
) {
  const invoiceRepo = dataSource.getRepository(InvoiceEntity);

  return invoiceRepo.save(
    invoiceRepo.create({
      organization_id: input.organizationId,
      job_id: input.jobId,
      description: "Empty invoice shell",
      amount_cents: 0,
      subtotal_cents: 0,
      tax_rate_bps_snapshot: 0,
      tax_cents: 0,
      total_cents: 0,
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
      source_quote_id: null,
    }),
  );
}

export async function seedLockedEmptyInvoice(
  dataSource: DataSource,
  input: { organizationId: string; jobId: string },
) {
  const invoiceRepo = dataSource.getRepository(InvoiceEntity);
  const lockedAt = new Date();

  return invoiceRepo.save(
    invoiceRepo.create({
      organization_id: input.organizationId,
      job_id: input.jobId,
      description: "Locked invoice shell",
      amount_cents: 0,
      subtotal_cents: 0,
      tax_rate_bps_snapshot: 0,
      tax_cents: 0,
      total_cents: 0,
      status: "unpaid",
      issued_at: lockedAt,
      due_at: new Date(Date.now() + 86_400_000 * 14),
      paid_at: null,
      approval_requested_at: lockedAt,
      approved_at: lockedAt,
      signature_requested_at: null,
      signed_at: null,
      signed_by_name: null,
      email_sent_at: null,
      sms_sent_at: null,
      last_sent_at: null,
      last_sent_via: null,
      branding_snapshot_json: null,
      source_quote_id: null,
    }),
  );
}

export async function seedInvoiceWithManualLine(
  dataSource: DataSource,
  input: { organizationId: string; jobId: string; userId: string },
) {
  const invoiceRepo = dataSource.getRepository(InvoiceEntity);
  const invoiceLineRepo = dataSource.getRepository(InvoiceLineItemEntity);

  const invoice = await invoiceRepo.save(
    invoiceRepo.create({
      organization_id: input.organizationId,
      job_id: input.jobId,
      description: "Manual invoice shell",
      amount_cents: 2_500,
      subtotal_cents: 2_500,
      tax_rate_bps_snapshot: 0,
      tax_cents: 0,
      total_cents: 2_500,
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
      source_quote_id: null,
    }),
  );

  await invoiceLineRepo.save(
    invoiceLineRepo.create({
      invoice_id: invoice.id,
      pricebook_item_id: null,
      document_line_key: `manual-line-${randomUUID().slice(0, 8)}`,
      sku_snapshot: "MANUAL",
      name_snapshot: "Manual composer line",
      description_snapshot: null,
      item_type_snapshot: "service",
      unit_of_measure_snapshot: "each",
      unit_price_cents_snapshot: 2_500,
      base_cost_cents_snapshot: null,
      material_cost_cents_snapshot: null,
      labor_cost_cents_snapshot: null,
      estimated_labor_minutes_snapshot: null,
      warranty_months_snapshot: null,
      pricebook_bundle_id: null,
      bundle_requirement_id: null,
      catalog_unit_price_cents_snapshot: null,
      quantity: "1",
      line_subtotal_cents: 2_500,
      sort_order: 0,
    }),
  );

  return invoice.id;
}

export async function cleanupConversionSmokeOrganizations(dataSource: DataSource) {
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const orgs = await orgRepo.find({
    where: { slug: Like("estimate-conversion-smoke-%") },
  });

  if (!orgs.length) {
    return;
  }

  const invoiceLineRepo = dataSource.getRepository(InvoiceLineItemEntity);
  const invoiceRepo = dataSource.getRepository(InvoiceEntity);
  const quoteLineRepo = dataSource.getRepository(QuoteLineItemEntity);
  const quoteRepo = dataSource.getRepository(QuoteEntity);
  const jobRepo = dataSource.getRepository(JobEntity);
  const customerRepo = dataSource.getRepository(CustomerEntity);
  const membershipRepo = dataSource.getRepository(MembershipEntity);
  const profileRepo = dataSource.getRepository(ProfileEntity);
  const userRepo = dataSource.getRepository(UserEntity);
  const pricebookItemRepo = dataSource.getRepository(PricebookItemEntity);

  for (const org of orgs) {
    const invoices = await invoiceRepo.find({ where: { organization_id: org.id } });
    for (const invoice of invoices) {
      await invoiceLineRepo.delete({ invoice_id: invoice.id });
    }
    await invoiceRepo.delete({ organization_id: org.id });

    const quotes = await quoteRepo.find({ where: { organization_id: org.id } });
    for (const quote of quotes) {
      await quoteLineRepo.delete({ quote_id: quote.id });
    }
    await quoteRepo.delete({ organization_id: org.id });

    await jobRepo.delete({ organization_id: org.id });
    await customerRepo.delete({ organization_id: org.id });
    await pricebookItemRepo.delete({ organization_id: org.id });

    const memberships = await membershipRepo.find({ where: { organization_id: org.id } });
    const userIds = [...new Set(memberships.map((row) => row.user_id))];
    await membershipRepo.delete({ organization_id: org.id });

    if (userIds.length) {
      await profileRepo.delete({ auth_user_id: In(userIds) });
      await userRepo.delete({ id: In(userIds) });
    }

    await orgRepo.delete(org.id);
  }
}

// TypeORM In helper import at top - I used In without importing. Fix harness file.
