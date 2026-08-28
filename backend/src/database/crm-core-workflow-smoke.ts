import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";
import { access, rm } from "fs/promises";
import { join } from "path";

import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource, IsNull, LessThanOrEqual, MoreThan, Repository } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";
import { InventoryService } from "../inventory/inventory.service";
import { SettingsService } from "../settings/settings.service";
import { JobsSearchAdapter } from "../search/adapters/jobs-search.adapter";
import { CustomersSearchAdapter } from "../search/adapters/customers-search.adapter";
import { SearchNormalizer } from "../search/normalizers/search-normalizer";
import { SearchDestinationMap } from "../search/search.destination-map";
import { SearchObservability } from "../search/search.observability";
import { SearchService } from "../search/search.service";
import { WarrantyCertificatesService } from "../warranty/warranty-certificates.service";
import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import { WarrantyPdfService } from "../warranty/warranty-pdf.service";
import { PdfRenderService } from "../documents/pdf/pdf-render.service";
import { ControlledAccessGrantEntity } from "./entities/controlled-access-grant.entity";
import { CustomerEntity } from "./entities/customer.entity";
import { InventoryItemEntity } from "./entities/inventory-item.entity";
import { InventoryLocationEntity } from "./entities/inventory-location.entity";
import { InventoryMovementEntity } from "./entities/inventory-movement.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { JobEntity } from "./entities/job.entity";
import { LeadEntity } from "./entities/lead.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationSettingEntity } from "./entities/organization-setting.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { QuoteLineItemEntity } from "./entities/quote-line-item.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { TechnicianEntity } from "./entities/technician.entity";
import { UserEntity } from "./entities/user.entity";
import { WarrantyCertificateEntity } from "./entities/warranty-certificate.entity";
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
  phases: Record<string, SmokeStatus>;
  results: SmokeResult[];
  errors: string[];
  cleanup: {
    droppedDatabase: boolean;
    removedWarrantyFiles: string[];
  };
};

type OrgFixture = {
  organization: OrganizationEntity;
  user: UserEntity;
  profile: ProfileEntity;
  membership: MembershipEntity;
  technician: TechnicianEntity;
  marker: string;
};

type PhoenixWorkflowIds = {
  leadId: string;
  customerId: string;
  jobId: string;
  quoteId: string;
  invoiceId: string;
  warrantyCertificateId?: string;
  inventoryItemId: string;
};

type Harness = {
  dataSource: DataSource;
  settingsService: SettingsService;
  inventoryService: InventoryService;
  searchService: SearchService;
  warrantyService: WarrantyCertificatesService;
  ledgerService: InvoicePaymentLedgerService;
  orgRepo: Repository<OrganizationEntity>;
  userRepo: Repository<UserEntity>;
  profileRepo: Repository<ProfileEntity>;
  membershipRepo: Repository<MembershipEntity>;
  technicianRepo: Repository<TechnicianEntity>;
  grantRepo: Repository<ControlledAccessGrantEntity>;
  leadRepo: Repository<LeadEntity>;
  customerRepo: Repository<CustomerEntity>;
  jobRepo: Repository<JobEntity>;
  quoteRepo: Repository<QuoteEntity>;
  quoteLineRepo: Repository<QuoteLineItemEntity>;
  invoiceRepo: Repository<InvoiceEntity>;
  invoiceLineRepo: Repository<InvoiceLineItemEntity>;
  paymentRepo: Repository<InvoicePaymentEntity>;
  warrantyFiles: Set<string>;
};

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("CRM core workflow smoke test currently supports MySQL only.");
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

function extractErrorCode(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse() as { error?: { code?: string; message?: string } };
    return response?.error?.code ?? error.message;
  }
  if (error instanceof Error) return error.message;
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
    errors: [],
    cleanup: { droppedDatabase: false, removedWarrantyFiles: [] },
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

async function expectFail(summary: SmokeSummary, name: string, run: () => Promise<unknown>) {
  try {
    await run();
    summary.results.push({ name, status: "FAIL", detail: "Expected failure but call succeeded." });
  } catch (error) {
    summary.results.push({ name, status: "PASS", detail: extractErrorCode(error) });
  }
}

async function seedControlledAccessGrant(grantRepo: Repository<ControlledAccessGrantEntity>, organizationId: string) {
  const now = new Date();
  await grantRepo.save(
    grantRepo.create({
      organization_id: organizationId,
      grant_type: "owner_internal",
      reason_code: "crm_core_workflow_smoke",
      starts_at: new Date(now.getTime() - 86_400_000),
      expires_at: new Date(now.getTime() + 86_400_000 * 365),
      revoked_at: null,
      notes: "Part 1 regression smoke fixture",
      created_by_user_id: null,
    }),
  );
}

async function hasActiveControlledAccessGrant(
  grantRepo: Repository<ControlledAccessGrantEntity>,
  organizationId: string,
) {
  const now = new Date();
  const grant = await grantRepo.findOne({
    where: {
      organization_id: organizationId,
      starts_at: LessThanOrEqual(now),
      expires_at: MoreThan(now),
      revoked_at: IsNull(),
    },
    order: { created_at: "DESC" },
  });
  return Boolean(grant);
}

async function seedOrgFixture(harness: Harness, token: string, key: "phoenix" | "apollo"): Promise<OrgFixture> {
  const marker = key === "phoenix" ? `PHXONLY-${token}` : `APOLLO-${token}`;
  const organization = await harness.orgRepo.save(
    harness.orgRepo.create({
      name: `${key === "phoenix" ? "Phoenix" : "Apollo"} Smoke ${token}`,
      slug: `${key}-smoke-${token}`,
      is_active: true,
    }),
  );
  await seedControlledAccessGrant(harness.grantRepo, organization.id);

  const user = await harness.userRepo.save(
    harness.userRepo.create({
      email: `${key}-smoke-${token}@example.com`,
      password_hash: "smoke-test-password-hash",
      is_active: true,
    }),
  );

  const profile = await harness.profileRepo.save(
    harness.profileRepo.create({
      auth_user_id: user.id,
      full_name: `${key} Owner ${token}`,
      phone: key === "phoenix" ? "5551000001" : "5552000002",
      role: "owner",
    }),
  );

  const membership = await harness.membershipRepo.save(
    harness.membershipRepo.create({
      user_id: user.id,
      organization_id: organization.id,
      role: "owner",
      status: "active",
    }),
  );

  const technician = await harness.technicianRepo.save(
    harness.technicianRepo.create({
      organization_id: organization.id,
      auth_user_id: user.id,
      display_name: `${key} Tech ${token}`,
      phone: profile.phone,
      specialties: [],
      is_active: true,
    }),
  );

  return { organization, user, profile, membership, technician, marker };
}

async function createHarness(dataSource: DataSource): Promise<Harness> {
  const warrantyService = new WarrantyCertificatesService(
    dataSource.getRepository(WarrantyCertificateEntity),
    dataSource.getRepository(InvoiceEntity),
    dataSource.getRepository(JobEntity),
    dataSource.getRepository(CustomerEntity),
    dataSource.getRepository(OrganizationSettingEntity),
    new WarrantyPdfService(new PdfRenderService()),
    new DocumentBrandingSnapshotService(),
  );

  return {
    dataSource,
    settingsService: new SettingsService(
      { get: (_key: string, fallback?: unknown) => fallback } as never,
      dataSource.getRepository(OrganizationSettingEntity),
    ),
    inventoryService: new InventoryService(
      dataSource.getRepository(InventoryItemEntity),
      dataSource.getRepository(InventoryLocationEntity),
      dataSource.getRepository(InventoryMovementEntity),
    ),
    searchService: new SearchService(
      new JobsSearchAdapter(dataSource.getRepository(JobEntity)),
      new CustomersSearchAdapter(dataSource.getRepository(CustomerEntity)),
      new SearchNormalizer(new SearchDestinationMap()),
      new SearchObservability(),
    ),
    warrantyService,
    ledgerService: new InvoicePaymentLedgerService(),
    orgRepo: dataSource.getRepository(OrganizationEntity),
    userRepo: dataSource.getRepository(UserEntity),
    profileRepo: dataSource.getRepository(ProfileEntity),
    membershipRepo: dataSource.getRepository(MembershipEntity),
    technicianRepo: dataSource.getRepository(TechnicianEntity),
    grantRepo: dataSource.getRepository(ControlledAccessGrantEntity),
    leadRepo: dataSource.getRepository(LeadEntity),
    customerRepo: dataSource.getRepository(CustomerEntity),
    jobRepo: dataSource.getRepository(JobEntity),
    quoteRepo: dataSource.getRepository(QuoteEntity),
    quoteLineRepo: dataSource.getRepository(QuoteLineItemEntity),
    invoiceRepo: dataSource.getRepository(InvoiceEntity),
    invoiceLineRepo: dataSource.getRepository(InvoiceLineItemEntity),
    paymentRepo: dataSource.getRepository(InvoicePaymentEntity),
    warrantyFiles: new Set<string>(),
  };
}

async function runPhoenixWorkflow(
  summary: SmokeSummary,
  harness: Harness,
  phoenix: OrgFixture,
): Promise<PhoenixWorkflowIds> {
  const orgId = phoenix.organization.id;
  const userId = phoenix.user.id;
  const lineTotalCents = 12_500;

  await expectPass(summary, "Phoenix controlled-access grant is active", async () => {
    const active = await hasActiveControlledAccessGrant(harness.grantRepo, orgId);
    if (!active) throw new Error("controlled_access_missing");
    return { active };
  });

  await expectPass(summary, "Phoenix settings update persists", async () => {
    const updated = await harness.settingsService.updateOrganizationSettings(orgId, {
      businessName: `Phoenix Fireplace ${phoenix.marker}`,
      displayInitials: "PHX",
      phone: "4035550100",
      companyEmail: "ops@phoenix-smoke.test",
      website: "https://phoenix-smoke.test",
      timezone: "America/Edmonton",
      googleReviewUrl: null,
      defaultSmsNumber: null,
      businessHours: null,
      invoiceEmailSubject: null,
      invoiceEmailBody: null,
      invoiceSmsBody: null,
      invoicePdfFooter: null,
      logoUrl: null,
      accentColor: "#c2410c",
      paymentInstructions: "Pay by check.",
      defaultDueDays: 14,
    });
    const reread = await harness.settingsService.getOrganizationSettings(orgId);
    if (reread.businessName !== updated.businessName) throw new Error("settings_not_persisted");
    return { businessName: reread.businessName };
  });

  const customer = await harness.customerRepo.save(
    harness.customerRepo.create({
      organization_id: orgId,
      full_name: `Jonathan Carter ${phoenix.marker}`,
      phone: "4035550199",
      email: `jonathan-${phoenix.marker}@example.com`,
      company_name: null,
      service_address_line_1: `${phoenix.marker} Main Street`,
      service_address_line_2: null,
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T2P1A1",
      source: "phone",
      preferred_service_type: "inspection",
      lifecycle_status: "prospect",
      notes: "Phoenix smoke customer",
    }),
  );

  const lead = await harness.leadRepo.save(
    harness.leadRepo.create({
      organization_id: orgId,
      full_name: customer.full_name,
      phone: customer.phone,
      email: customer.email,
      service_address_line_1: customer.service_address_line_1,
      service_address_line_2: null,
      service_city: customer.service_city,
      service_state_or_region: customer.service_state_or_region,
      service_postal_code: customer.service_postal_code,
      source: "phone",
      service_type: "inspection",
      description: "Fireplace inspection lead",
      status: "new_lead",
      customer_id: customer.id,
      converted_job_id: null,
      created_by_auth_user_id: userId,
    }),
  );

  const scheduledFor = new Date(Date.now() + 86_400_000);
  const job = await harness.jobRepo.save(
    harness.jobRepo.create({
      organization_id: orgId,
      customer_id: customer.id,
      service_id: null,
      assigned_technician_id: phoenix.technician.id,
      title: `Fireplace inspection ${phoenix.marker}`,
      description: "Annual inspection and cleaning scope",
      lead_source: "phone",
      requested_service_type: "inspection",
      job_type: "inspection",
      status: "scheduled",
      service_address_line_1: customer.service_address_line_1,
      service_address_line_2: null,
      service_city: customer.service_city,
      service_state_or_region: customer.service_state_or_region,
      service_postal_code: customer.service_postal_code,
      scheduled_for: scheduledFor,
      scheduled_window: "morning",
      requested_at: new Date(),
      on_the_way_at: null,
      started_at: null,
      completed_at: null,
      paid_at: null,
      cancellation_reason: null,
      cancelled_at: null,
      cancelled_by: null,
      created_by_auth_user_id: userId,
      updated_by_auth_user_id: userId,
    }),
  );

  lead.status = "converted";
  lead.converted_job_id = job.id;
  lead.customer_id = customer.id;
  await harness.leadRepo.save(lead);
  customer.lifecycle_status = "active";
  await harness.customerRepo.save(customer);

  const quote = await harness.quoteRepo.save(
    harness.quoteRepo.create({
      organization_id: orgId,
      job_id: job.id,
      description: "Inspection and cleaning estimate",
      price_cents: lineTotalCents,
      subtotal_cents: lineTotalCents,
      tax_rate_bps_snapshot: 0,
      tax_cents: 0,
      total_cents: lineTotalCents,
      status: "approved",
      sent_at: new Date(),
      approved_at: new Date(),
      approval_requested_at: new Date(),
      signature_requested_at: new Date(),
      signed_at: new Date(),
      signed_by_name: customer.full_name,
    }),
  );

  await harness.quoteLineRepo.save(
    harness.quoteLineRepo.create({
      quote_id: quote.id,
      pricebook_item_id: null,
      document_line_key: "line-1",
      sku_snapshot: "SMOKE-INSPECT",
      name_snapshot: "Fireplace inspection",
      description_snapshot: "Annual inspection",
      item_type_snapshot: "service",
      unit_of_measure_snapshot: "each",
      unit_price_cents_snapshot: lineTotalCents,
      base_cost_cents_snapshot: 0,
      material_cost_cents_snapshot: 0,
      labor_cost_cents_snapshot: 0,
      estimated_labor_minutes_snapshot: 90,
      warranty_months_snapshot: 12,
      quantity: "1",
      line_subtotal_cents: lineTotalCents,
      sort_order: 0,
    }),
  );

  job.status = "completed";
  job.completed_at = new Date();
  await harness.jobRepo.save(job);

  const invoice = await harness.invoiceRepo.save(
    harness.invoiceRepo.create({
      organization_id: orgId,
      job_id: job.id,
      description: "Inspection invoice",
      amount_cents: lineTotalCents,
      subtotal_cents: lineTotalCents,
      tax_rate_bps_snapshot: 0,
      tax_cents: 0,
      total_cents: lineTotalCents,
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

  await harness.invoiceLineRepo.save(
    harness.invoiceLineRepo.create({
      invoice_id: invoice.id,
      pricebook_item_id: null,
      document_line_key: "line-1",
      sku_snapshot: "SMOKE-INSPECT",
      name_snapshot: "Fireplace inspection",
      description_snapshot: "Annual inspection",
      item_type_snapshot: "service",
      unit_of_measure_snapshot: "each",
      unit_price_cents_snapshot: lineTotalCents,
      base_cost_cents_snapshot: 0,
      material_cost_cents_snapshot: 0,
      labor_cost_cents_snapshot: 0,
      estimated_labor_minutes_snapshot: 90,
      warranty_months_snapshot: 12,
      quantity: "1",
      line_subtotal_cents: lineTotalCents,
      sort_order: 0,
    }),
  );

  await harness.paymentRepo.save(
    harness.paymentRepo.create({
      organization_id: orgId,
      invoice_id: invoice.id,
      entry_type: "payment",
      amount_cents: lineTotalCents,
      method: "cash",
      reference: "SMOKE-001",
      note: "Full payment",
      occurred_at: new Date(),
      created_by_auth_user_id: userId,
    }),
  );

  const payments = await harness.paymentRepo.find({ where: { invoice_id: invoice.id } });
  const ledger = harness.ledgerService.summarizeInvoice({
    totalCents: invoice.total_cents,
    legacyStatus: invoice.status,
    legacyPaidAt: invoice.paid_at,
    payments,
  });

  if (ledger.lifecycleStatus !== "paid") {
    throw new Error(`invoice_not_paid:${ledger.lifecycleStatus}`);
  }

  invoice.status = "paid";
  invoice.paid_at = ledger.paidAt;
  await harness.invoiceRepo.save(invoice);
  job.status = "paid";
  job.paid_at = ledger.paidAt;
  await harness.jobRepo.save(job);

  await expectPass(summary, "Phoenix lead converted to job with customer link", async () => {
    const savedLead = await harness.leadRepo.findOne({ where: { id: lead.id, organization_id: orgId } });
    if (!savedLead || savedLead.status !== "converted" || savedLead.converted_job_id !== job.id) {
      throw new Error("lead_conversion_invalid");
    }
    return { leadId: savedLead.id, jobId: job.id };
  });

  await expectPass(summary, "Phoenix search returns same-org customer marker", async () => {
    const results = await harness.searchService.search(phoenix.marker.toLowerCase(), orgId);
    const customerHits = results.customers.filter((item) => item.id === customer.id);
    if (customerHits.length !== 1) throw new Error("search_customer_miss");
    return { hits: customerHits.length };
  });

  const location = await harness.inventoryService.createLocation(orgId, {
    name: `Phoenix Van ${phoenix.marker}`,
    locationType: "company_vehicle",
    assignedUserId: userId,
    isCompanyOwned: true,
    vehicleLabel: `PHX-${phoenix.marker.slice(0, 4)}`,
    licensePlate: null,
    notes: null,
    isActive: true,
  }, userId);

  const inventoryItem = await harness.inventoryService.createItem(orgId, {
    internalSku: `BR-${phoenix.marker.slice(0, 6)}`,
    name: `Inspection brush ${phoenix.marker}`,
    itemType: "consumable",
    unitOfMeasure: "each",
    defaultCostBeforeTaxCents: 1500,
    defaultTaxCents: null,
    defaultTotalPaidCents: null,
    supplierName: null,
    supplierSku: null,
    reorderPoint: "1",
    notes: null,
    isActive: true,
  }, userId);

  await harness.inventoryService.receiveStock(orgId, {
    supplierName: "Smoke Supplier",
    supplierInvoiceNumber: "INV-SMOKE",
    occurredAt: new Date(),
    toLocationId: location.id,
    lines: [{
      inventoryItemId: inventoryItem.id,
      quantity: "2",
      note: "Smoke stock receive",
      unitCostBeforeTaxCents: 1500,
      taxPaidCents: null,
      totalPaidCents: 3000,
    }],
  }, userId);

  await expectPass(summary, "Phoenix inventory stock is visible in org", async () => {
    const stock = await harness.inventoryService.listStock(orgId, {
      q: "",
      locationId: location.id,
      lowStockOnly: false,
      activeState: "active",
    }, "owner", userId);
    const row = stock.rows.find((entry) => entry.item_id === inventoryItem.id);
    if (!row || row.total_quantity < 2) throw new Error("inventory_stock_missing");
    return { quantity: row.total_quantity };
  });

  let warrantyCertificateId: string | undefined;
  await expectPass(summary, "Phoenix warranty generates from paid invoice", async () => {
    const certificate = await harness.warrantyService.generateFromInvoice({
      organizationId: orgId,
      invoiceId: invoice.id,
      issuedByUserId: userId,
    });
    warrantyCertificateId = certificate.id;
    harness.warrantyFiles.add(join(process.cwd(), "uploads", "warranty-certificates", `${certificate.id}.pdf`));
    return { certificateId: certificate.id };
  });

  summary.phases.seeding = "PASS";

  return {
    leadId: lead.id,
    customerId: customer.id,
    jobId: job.id,
    quoteId: quote.id,
    invoiceId: invoice.id,
    warrantyCertificateId,
    inventoryItemId: inventoryItem.id,
  };
}

async function runApolloIsolationChecks(
  summary: SmokeSummary,
  harness: Harness,
  phoenix: OrgFixture,
  apollo: OrgFixture,
  phoenixIds: PhoenixWorkflowIds,
) {
  await expectPass(summary, "Apollo search does not return Phoenix marker", async () => {
    const results = await harness.searchService.search(phoenix.marker.toLowerCase(), apollo.organization.id);
    if (results.customers.some((item) => item.id === phoenixIds.customerId)) {
      throw new Error("search_leak");
    }
    if (results.jobs.some((item) => item.id === phoenixIds.jobId)) {
      throw new Error("search_job_leak");
    }
    return { customerHits: results.customers.length, jobHits: results.jobs.length };
  });

  await expectPass(summary, "Apollo cannot read Phoenix customer by ID", async () => {
    const row = await harness.customerRepo.findOne({
      where: { id: phoenixIds.customerId, organization_id: apollo.organization.id },
    });
    if (row) throw new Error("customer_isolation_failed");
  });

  await expectPass(summary, "Apollo cannot read Phoenix job by ID", async () => {
    const row = await harness.jobRepo.findOne({
      where: { id: phoenixIds.jobId, organization_id: apollo.organization.id },
    });
    if (row) throw new Error("job_isolation_failed");
  });

  await expectPass(summary, "Apollo cannot read Phoenix invoice by ID", async () => {
    const row = await harness.invoiceRepo.findOne({
      where: { id: phoenixIds.invoiceId, organization_id: apollo.organization.id },
    });
    if (row) throw new Error("invoice_isolation_failed");
  });

  await expectPass(summary, "Apollo cannot read Phoenix inventory item by ID", async () => {
    const { items } = await harness.inventoryService.listItems(apollo.organization.id, { activeState: "active", q: "" });
    if (items.some((item) => item.id === phoenixIds.inventoryItemId)) {
      throw new Error("inventory_isolation_failed");
    }
  });

  await expectFail(summary, "Apollo cannot generate warranty from Phoenix invoice", async () => {
    await harness.warrantyService.generateFromInvoice({
      organizationId: apollo.organization.id,
      invoiceId: phoenixIds.invoiceId,
      issuedByUserId: apollo.user.id,
    });
  });

  await expectPass(summary, "Shared user has org-scoped technician rows in Phoenix and Apollo", async () => {
    const sharedUser = await harness.userRepo.save(
      harness.userRepo.create({
        email: `shared-tech-${randomUUID().slice(0, 8)}@example.com`,
        password_hash: "smoke-test-password-hash",
        is_active: true,
      }),
    );

    await harness.membershipRepo.save([
      harness.membershipRepo.create({
        user_id: sharedUser.id,
        organization_id: phoenix.organization.id,
        role: "technician",
        status: "active",
      }),
      harness.membershipRepo.create({
        user_id: sharedUser.id,
        organization_id: apollo.organization.id,
        role: "technician",
        status: "active",
      }),
    ]);

    const phoenixTech = await harness.technicianRepo.save(
      harness.technicianRepo.create({
        organization_id: phoenix.organization.id,
        auth_user_id: sharedUser.id,
        display_name: "Shared Phoenix Tech",
        phone: null,
        specialties: [],
        is_active: true,
      }),
    );

    const apolloTech = await harness.technicianRepo.save(
      harness.technicianRepo.create({
        organization_id: apollo.organization.id,
        auth_user_id: sharedUser.id,
        display_name: "Shared Apollo Tech",
        phone: null,
        specialties: [],
        is_active: true,
      }),
    );

    if (phoenixTech.id === apolloTech.id) throw new Error("technician_rows_not_distinct");
    return { phoenixTechId: phoenixTech.id, apolloTechId: apolloTech.id };
  });
}

async function removeWarrantyFiles(paths: Set<string>) {
  const removed: string[] = [];
  for (const filePath of paths) {
    try {
      await access(filePath);
      await rm(filePath, { force: true });
      removed.push(filePath);
    } catch {
      // ignore missing files
    }
  }
  return removed;
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_crm_core_verify_${Date.now()}`;
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
  let harness: Harness | null = null;

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

    harness = await createHarness(dataSource);
    const token = randomUUID().slice(0, 8);
    const phoenix = await seedOrgFixture(harness, token, "phoenix");
    const apollo = await seedOrgFixture(harness, token, "apollo");
    const phoenixIds = await runPhoenixWorkflow(summary, harness, phoenix);
    await runApolloIsolationChecks(summary, harness, phoenix, apollo, phoenixIds);
  } catch (error) {
    summary.errors.push(extractErrorCode(error));
  } finally {
    try {
      if (harness) {
        summary.cleanup.removedWarrantyFiles = await removeWarrantyFiles(harness.warrantyFiles);
      }
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

  const failedResults = summary.results.filter((result) => result.status === "FAIL");
  summary.ok = summary.errors.length === 0 && failedResults.length === 0;
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
