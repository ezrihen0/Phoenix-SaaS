import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { assertActorCanAccessJobBranch } from "../crm/branch-access";
import { BranchScopeService } from "../crm/branch-scope.service";
import {
  persistInvoiceHeaderAndLineItems,
  persistQuoteHeaderAndLineItems,
} from "../crm/crm-document-persistence";
import type { DocumentSnapshotService } from "../crm/document-snapshot.service";
import { findJobForActor } from "../crm/jobs-access";
import { InvoiceNumberingService } from "../crm/invoice-numbering.service";
import type { ActorContext } from "../common/request-types";
import { listPermissionsForMembership } from "../team/membership-permissions";
import { BranchEntity } from "./entities/branch.entity";
import { BranchInvoiceSequenceEntity } from "./entities/branch-invoice-sequence.entity";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { JobEntity } from "./entities/job.entity";
import { MembershipBranchAccessEntity } from "./entities/membership-branch-access.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationInvoiceSequenceEntity } from "./entities/organization-invoice-sequence.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { TechnicianEntity } from "./entities/technician.entity";
import { UserEntity } from "./entities/user.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";

type SmokeSummary = {
  ok: boolean;
  database: string;
  results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: unknown }>;
  errors: string[];
};

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Multi-branch smoke supports MySQL only.");
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

function record(summary: SmokeSummary, name: string, run: () => void | Promise<void>) {
  return Promise.resolve(run()).then(
    () => {
      summary.results.push({ name, status: "PASS" });
    },
    (error) => {
      summary.results.push({ name, status: "FAIL", detail: String(error) });
      summary.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}

function buildActor(input: {
  user: UserEntity;
  profile: ProfileEntity;
  membership: MembershipEntity;
  organizationId: string;
  technician?: TechnicianEntity | null;
}): ActorContext {
  return {
    user: input.user,
    profile: input.profile,
    technician: input.technician ?? null,
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

async function expectForbidden(run: () => void) {
  try {
    run();
    throw new Error("Expected forbidden response.");
  } catch (error) {
    if (!(error instanceof HttpException) || error.getStatus() !== 403) {
      throw error;
    }
  }
}

async function main() {
  const token = randomUUID().replace(/-/g, "").slice(0, 12);
  const database = `wizfield_multi_branch_${token}`;
  const summary: SmokeSummary = { ok: false, database, results: [], errors: [] };
  const baseOptions = requireMySqlOptions();
  const adminConnection = await mysql.createConnection({
    host: baseOptions.host,
    port: baseOptions.port,
    user: baseOptions.username,
    password: baseOptions.password,
  });

  let dataSource: DataSource | null = null;

  try {
    await adminConnection.query(`CREATE DATABASE \`${database}\``);
    dataSource = new DataSource({ ...baseOptions, database, migrationsRun: true });
    await dataSource.initialize();
    await verifyDatabaseSchema(dataSource);

    const orgRepo = dataSource.getRepository(OrganizationEntity);
    const branchRepo = dataSource.getRepository(BranchEntity);
    const userRepo = dataSource.getRepository(UserEntity);
    const profileRepo = dataSource.getRepository(ProfileEntity);
    const membershipRepo = dataSource.getRepository(MembershipEntity);
    const branchAccessRepo = dataSource.getRepository(MembershipBranchAccessEntity);
    const customerRepo = dataSource.getRepository(CustomerEntity);
    const jobRepo = dataSource.getRepository(JobEntity);
    const quoteRepo = dataSource.getRepository(QuoteEntity);
    const invoiceRepo = dataSource.getRepository(InvoiceEntity);
    const technicianRepo = dataSource.getRepository(TechnicianEntity);

    const branchScopeService = new BranchScopeService(
      branchRepo,
      branchAccessRepo,
      jobRepo,
      quoteRepo,
      invoiceRepo,
      dataSource!,
    );
    const documentSnapshotService = {
      replaceQuoteLineItems: async () => undefined,
      replaceInvoiceLineItems: async () => undefined,
    } as unknown as DocumentSnapshotService;
    const invoiceNumberingService = new InvoiceNumberingService(
      dataSource.getRepository(OrganizationInvoiceSequenceEntity),
    );

    const orgA = await orgRepo.save(orgRepo.create({
      id: randomUUID(),
      name: `Org A ${token}`,
      slug: `org-a-${token}`,
      is_active: true,
    }));
    const orgB = await orgRepo.save(orgRepo.create({
      id: randomUUID(),
      name: `Org B ${token}`,
      slug: `org-b-${token}`,
      is_active: true,
    }));

    const branchA = await branchRepo.save(branchRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      name: "Alberta",
      code: "AB",
      tax_label: "GST",
      default_tax_rate_bps: 500,
      invoice_prefix: "AB-INV-",
      estimate_prefix: "AB-EST-",
      active: true,
      sort_order: 1,
    }));
    const branchB = await branchRepo.save(branchRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      name: "Ontario",
      code: "ON",
      tax_label: "HST",
      default_tax_rate_bps: 1300,
      invoice_prefix: "ON-INV-",
      estimate_prefix: "ON-EST-",
      active: true,
      sort_order: 2,
    }));
    const foreignBranch = await branchRepo.save(branchRepo.create({
      id: randomUUID(),
      organization_id: orgB.id,
      name: "Foreign",
      code: "FX",
      tax_label: "GST",
      default_tax_rate_bps: 500,
      invoice_prefix: "FX-INV-",
      estimate_prefix: "FX-EST-",
      active: true,
      sort_order: 1,
    }));

    await dataSource.getRepository(BranchInvoiceSequenceEntity).save([
      { branch_id: branchA.id, next_value: "1001" },
      { branch_id: branchB.id, next_value: "1001" },
    ]);

    async function seedUser(label: string, role: ProfileEntity["role"], orgId: string) {
      const user = await userRepo.save(userRepo.create({
        id: randomUUID(),
        email: `${label}-${token}@example.com`,
        password_hash: "test",
        is_active: true,
      }));
      const profile = await profileRepo.save(profileRepo.create({
        id: randomUUID(),
        auth_user_id: user.id,
        full_name: label,
        phone: null,
        role,
      }));
      const membership = await membershipRepo.save(membershipRepo.create({
        id: randomUUID(),
        user_id: user.id,
        organization_id: orgId,
        role,
        status: "active",
      }));
      return { user, profile, membership };
    }

    const owner = await seedUser("owner", "owner", orgA.id);
    const techUser = await seedUser("tech", "technician", orgA.id);
    const tech = await technicianRepo.save(technicianRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      auth_user_id: techUser.user.id,
      display_name: "Tech",
      phone: null,
      specialties: [],
      last_seen_at: null,
    }));

    await branchAccessRepo.save(branchAccessRepo.create({
      id: randomUUID(),
      membership_id: techUser.membership.id,
      branch_id: branchA.id,
    }));

    const customer = await customerRepo.save(customerRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      full_name: "Customer",
      email: "c@example.com",
      company_name: null,
      service_address_line_1: "1 Main",
      service_address_line_2: null,
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T1T1T1",
      phone: "4035550100",
    }));

    const legacyJob = await jobRepo.save(jobRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      branch_id: null,
      customer_id: customer.id,
      assigned_technician_id: null,
      title: "Legacy job",
      description: null,
      lead_source: "website",
      requested_service_type: "repair",
      job_type: "installation_repair",
      status: "completed",
      service_address_line_1: "1 Main",
      service_city: "Calgary",
      service_state_or_region: "AB",
      service_postal_code: "T1T1T1",
      scheduled_for: null,
    }));

    const legacyInvoice = await invoiceRepo.save(invoiceRepo.create({
      id: randomUUID(),
      organization_id: orgA.id,
      job_id: legacyJob.id,
      description: "Legacy",
      amount_cents: 1000,
      subtotal_cents: 1000,
      tax_rate_bps_snapshot: 500,
      tax_cents: 50,
      total_cents: 1050,
      status: "unpaid",
      document_number: "LEGACY-9001",
    }));

    await record(summary, "branch organization isolation", async () => {
      await branchScopeService.assertBranchBelongsToOrganization(orgA.id, branchA.id);
      let rejected = false;
      try {
        await branchScopeService.assertBranchBelongsToOrganization(orgA.id, foreignBranch.id);
      } catch (error) {
        rejected = error instanceof HttpException;
      }
      assert.equal(rejected, true);
    });

    await record(summary, "GST 5% branch default", async () => {
      const branch = await branchScopeService.findBranchForOrganization(orgA.id, branchA.id);
      assert.equal(branchScopeService.resolveDefaultTaxRateBps(branch), 500);
      assert.equal(branch?.tax_label, "GST");
    });

    await record(summary, "HST 13% branch default", async () => {
      const branch = await branchScopeService.findBranchForOrganization(orgA.id, branchB.id);
      assert.equal(branchScopeService.resolveDefaultTaxRateBps(branch), 1300);
      assert.equal(branch?.tax_label, "HST");
    });

    await record(summary, "province AB resolves Alberta branch", async () => {
      const branchId = await branchScopeService.resolveBranchIdFromServiceProvince(orgA.id, "Alberta");
      assert.equal(branchId, branchA.id);
    });

    await record(summary, "province ON resolves Ontario branch", async () => {
      const branchId = await branchScopeService.resolveBranchIdFromServiceProvince(orgA.id, " on ");
      assert.equal(branchId, branchB.id);
    });

    await record(summary, "existing invoices remain unchanged", async () => {
      const reloaded = await invoiceRepo.findOneOrFail({ where: { id: legacyInvoice.id } });
      assert.equal(reloaded.document_number, "LEGACY-9001");
      assert.equal(reloaded.branch_id, null);
      assert.equal(reloaded.tax_rate_bps_snapshot, 500);
    });

    let jobId = "";
    await record(summary, "quote inherits correct branch", async () => {
      const job = await jobRepo.save(jobRepo.create({
        id: randomUUID(),
        organization_id: orgA.id,
        branch_id: branchB.id,
        customer_id: customer.id,
        assigned_technician_id: tech.id,
        title: "Branch job",
        description: null,
        lead_source: "website",
        requested_service_type: "repair",
        job_type: "installation_repair",
        status: "scheduled",
        service_address_line_1: "1 Main",
        service_city: "Toronto",
        service_state_or_region: "ON",
        service_postal_code: "M5V1A1",
        scheduled_for: new Date(),
      }));
      jobId = job.id;

      await dataSource!.transaction((manager) =>
        persistQuoteHeaderAndLineItems(manager, documentSnapshotService, {
          organizationId: orgA.id,
          jobId: job.id,
          existingQuote: null,
          description: "Estimate",
          quoteTotals: {
            totalCents: 1000,
            subtotalCents: 1000,
            taxRateBpsSnapshot: 1300,
            taxCents: 130,
          },
          status: "draft",
          sent_at: null,
          approved_at: null,
          hasSnapshotLineItems: false,
          lineDrafts: [],
        }),
      );

      const quote = await quoteRepo.findOneOrFail({ where: { job_id: job.id } });
      assert.equal(quote.branch_id, branchB.id);
    });

    await record(summary, "invoice inherits correct branch", async () => {
      await dataSource!.transaction((manager) =>
        persistInvoiceHeaderAndLineItems(manager, documentSnapshotService, {
          organizationId: orgA.id,
          jobId,
          existingInvoice: null,
          description: "Invoice",
          invoiceTotals: {
            totalCents: 1130,
            subtotalCents: 1000,
            taxRateBpsSnapshot: 1300,
            taxCents: 130,
          },
          status: "unpaid",
          paid_at: null,
          due_at: new Date(),
          hasSnapshotLineItems: false,
          lineDrafts: [],
        }),
      );

      const invoice = await invoiceRepo.findOneOrFail({ where: { job_id: jobId } });
      assert.equal(invoice.branch_id, branchB.id);
    });

    await record(summary, "org-wide invoice numbering ignores branch (Phase 10 V1)", async () => {
      const numberingJob = await jobRepo.save(jobRepo.create({
        id: randomUUID(),
        organization_id: orgA.id,
        branch_id: branchA.id,
        customer_id: customer.id,
        assigned_technician_id: tech.id,
        title: "Number job",
        description: null,
        lead_source: "website",
        requested_service_type: "repair",
        job_type: "installation_repair",
        status: "scheduled",
        service_address_line_1: "1 Main",
        service_city: "Calgary",
        service_state_or_region: "AB",
        service_postal_code: "T1T1T1",
        scheduled_for: new Date(),
      }));

      await dataSource!.transaction(async (manager) => {
        const draft = manager.create(InvoiceEntity, {
          id: randomUUID(),
          organization_id: orgA.id,
          branch_id: branchA.id,
          job_id: numberingJob.id,
          description: "Number test",
          amount_cents: 100,
          subtotal_cents: 100,
          tax_rate_bps_snapshot: 500,
          tax_cents: 5,
          total_cents: 105,
          status: "unpaid",
        });
        const assigned = await invoiceNumberingService.allocateDocumentNumberIfNeeded(manager, orgA.id, draft);
        assert.match(assigned, /^1001$/);
        await manager.getRepository(InvoiceEntity).save({ ...draft, document_number: assigned });
      });

      const legacyReload = await invoiceRepo.findOneOrFail({ where: { id: legacyInvoice.id } });
      assert.equal(legacyReload.document_number, "LEGACY-9001");
    });

    await record(summary, "owner admin sees all branches", async () => {
      const accessible = await branchScopeService.listAccessibleBranchIds(
        buildActor({ ...owner, organizationId: orgA.id }),
      );
      assert.equal(accessible, null);
    });

    await record(summary, "restricted staff cannot access unauthorized branch", async () => {
      const techActor = buildActor({
        ...techUser,
        organizationId: orgA.id,
        technician: tech,
      });
      const accessible = await branchScopeService.listAccessibleBranchIds(techActor);
      assert.deepEqual(accessible, [branchA.id]);

      const onJob = await jobRepo.findOneOrFail({ where: { id: jobId } });
      await expectForbidden(() =>
        assertActorCanAccessJobBranch(techActor, onJob, accessible),
      );
    });

    await record(summary, "technician assignment and branch access intersection", async () => {
      const abJob = await jobRepo.save(jobRepo.create({
        id: randomUUID(),
        organization_id: orgA.id,
        branch_id: branchA.id,
        customer_id: customer.id,
        assigned_technician_id: tech.id,
        title: "AB assigned",
        description: null,
        lead_source: "website",
        requested_service_type: "repair",
        job_type: "installation_repair",
        status: "scheduled",
        service_address_line_1: "1 Main",
        service_city: "Calgary",
        service_state_or_region: "AB",
        service_postal_code: "T1T1T1",
        scheduled_for: new Date(),
      }));

      const techActor = buildActor({
        ...techUser,
        organizationId: orgA.id,
        technician: tech,
      });
      const accessible = await branchScopeService.listAccessibleBranchIds(techActor);
      const allowed = await findJobForActor(jobRepo, abJob.id, orgA.id, techActor, {}, accessible);
      assert.equal(allowed.id, abJob.id);
    });

    summary.ok = summary.errors.length === 0;
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.ok) {
      process.exitCode = 1;
    }
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await adminConnection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await adminConnection.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
