import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";
import { access, rm } from "fs/promises";
import { join } from "path";
import { Readable } from "stream";

import mysql from "mysql2/promise";
import { HttpException } from "@nestjs/common";
import { DataSource, type Repository } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import type { ActorContext } from "../common/request-types";
import { CustomerEntity } from "./entities/customer.entity";
import { InspectionItemEntity } from "./entities/inspection-item.entity";
import { InspectionPhotoEntity } from "./entities/inspection-photo.entity";
import { InspectionRequiredFieldEntity } from "./entities/inspection-required-field.entity";
import { InspectionEntity, type InspectionReportType } from "./entities/inspection.entity";
import { JobEntity } from "./entities/job.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { UserEntity } from "./entities/user.entity";
import { verifyDatabaseSchema } from "./verify-schema";
import { buildDataSourceOptions } from "./typeorm.config";
import { InspectionsAdminService } from "../inspections/inspections.admin.service";
import { InspectionWorkflowService } from "../inspections/inspection-workflow.service";

type SmokeStatus = "PASS" | "FAIL" | "SKIP";

type SmokeResult = {
  name: string;
  status: SmokeStatus;
  detail?: unknown;
};

type SeededOrgContext = {
  organization: OrganizationEntity;
  user: UserEntity;
  membership: MembershipEntity;
  actor: ActorContext;
  customer: CustomerEntity;
  job: JobEntity;
};

type HarnessContext = {
  dataSource: DataSource;
  service: InspectionsAdminService;
  organizationRepo: Repository<OrganizationEntity>;
  userRepo: Repository<UserEntity>;
  membershipRepo: Repository<MembershipEntity>;
  customerRepo: Repository<CustomerEntity>;
  jobRepo: Repository<JobEntity>;
  inspectionRepo: Repository<InspectionEntity>;
  inspectionItemRepo: Repository<InspectionItemEntity>;
  inspectionRequiredFieldRepo: Repository<InspectionRequiredFieldEntity>;
  inspectionPhotoRepo: Repository<InspectionPhotoEntity>;
  uploadedStorageKeys: Set<string>;
};

type SmokeSummary = {
  ok: boolean;
  database: string;
  phases: {
    databaseCreate: SmokeStatus;
    migrations: SmokeStatus;
    schemaVerify: SmokeStatus;
    seeding: SmokeStatus;
    cleanup: SmokeStatus;
  };
  results: SmokeResult[];
  skipped: SmokeResult[];
  errors: string[];
  cleanup: {
    droppedDatabase: boolean;
    removedPhotoFiles: string[];
  };
};

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();

  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Inspection isolation smoke test currently supports MySQL only.");
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
      seeding: "FAIL",
      cleanup: "FAIL",
    },
    results: [],
    skipped: [],
    errors: [],
    cleanup: {
      droppedDatabase: false,
      removedPhotoFiles: [],
    },
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

async function expectApiError(
  summary: SmokeSummary,
  name: string,
  expectedCodes: string[],
  run: () => Promise<unknown>,
) {
  try {
    await run();
    summary.results.push({ name, status: "FAIL", detail: "Expected API rejection but call succeeded." });
  } catch (error) {
    const code = extractErrorCode(error);
    summary.results.push({
      name,
      status: expectedCodes.includes(code) ? "PASS" : "FAIL",
      detail: code,
    });
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function buildActor(organization: OrganizationEntity, user: UserEntity, membership: MembershipEntity): ActorContext {
  return {
    user,
    profile: null,
    technician: null,
    memberships: [membership],
    membership,
    organization,
    membership_id: membership.id,
    organization_id: organization.id,
    role: membership.role,
    permissions: ["inspections.admin"],
  };
}

async function seedOrgContext(
  context: HarnessContext,
  token: string,
  key: "a" | "b",
): Promise<SeededOrgContext> {
  const uppercaseKey = key.toUpperCase();
  const organization = await context.organizationRepo.save(
    context.organizationRepo.create({
      name: `Inspection Smoke Org ${uppercaseKey} ${token}`,
      slug: `inspection-smoke-${key}-${token}`,
      is_active: true,
    }),
  );

  const user = await context.userRepo.save(
    context.userRepo.create({
      email: `inspection-smoke-${key}-${token}@example.com`,
      password_hash: "smoke-test-password-hash",
      is_active: true,
    }),
  );

  const membership = await context.membershipRepo.save(
    context.membershipRepo.create({
      user_id: user.id,
      organization_id: organization.id,
      role: "owner",
      status: "active",
    }),
  );

  const customer = await context.customerRepo.save(
    context.customerRepo.create({
      organization_id: organization.id,
      external_client_number: null,
      full_name: `Inspection Smoke Customer ${uppercaseKey} ${token}`,
      email: `inspection-customer-${key}-${token}@example.com`,
      company_name: null,
      service_address_line_1: `${uppercaseKey}ONLY-${token} Main Street`,
      service_address_line_2: null,
      service_city: "Testville",
      service_state_or_region: "AB",
      service_postal_code: key === "a" ? "A1A1A1" : "B2B2B2",
      phone: key === "a" ? "5551000001" : "5552000002",
      legacy_created_at: null,
      source: "website",
      preferred_service_type: "inspection",
      notes: "Inspection smoke test seed.",
    }),
  );

  const job = await context.jobRepo.save(
    context.jobRepo.create({
      organization_id: organization.id,
      customer_id: customer.id,
      service_id: null,
      assigned_technician_id: null,
      title: `Inspection Smoke Job ${uppercaseKey} ${token}`,
      description: "Inspection smoke test seed.",
      lead_source: "website",
      requested_service_type: "inspection",
      status: "scheduled",
      service_address_line_1: customer.service_address_line_1,
      service_address_line_2: null,
      service_city: customer.service_city,
      service_state_or_region: customer.service_state_or_region,
      service_postal_code: customer.service_postal_code,
      scheduled_for: null,
      scheduled_window: null,
      requested_at: new Date(),
      on_the_way_at: null,
      started_at: null,
      completed_at: null,
      paid_at: null,
      cancellation_reason: null,
      cancelled_at: null,
      cancelled_by: null,
      created_by_auth_user_id: user.id,
      updated_by_auth_user_id: user.id,
    }),
  );

  return {
    organization,
    user,
    membership,
    actor: buildActor(organization, user, membership),
    customer,
    job,
  };
}

async function createHarnessContext(dataSource: DataSource): Promise<HarnessContext> {
  return {
    dataSource,
    service: new InspectionsAdminService(
      dataSource.getRepository(InspectionEntity),
      dataSource.getRepository(InspectionItemEntity),
      dataSource.getRepository(InspectionRequiredFieldEntity),
      dataSource.getRepository(InspectionPhotoEntity),
      dataSource.getRepository(CustomerEntity),
      dataSource.getRepository(JobEntity),
      new InspectionWorkflowService(),
    ),
    organizationRepo: dataSource.getRepository(OrganizationEntity),
    userRepo: dataSource.getRepository(UserEntity),
    membershipRepo: dataSource.getRepository(MembershipEntity),
    customerRepo: dataSource.getRepository(CustomerEntity),
    jobRepo: dataSource.getRepository(JobEntity),
    inspectionRepo: dataSource.getRepository(InspectionEntity),
    inspectionItemRepo: dataSource.getRepository(InspectionItemEntity),
    inspectionRequiredFieldRepo: dataSource.getRepository(InspectionRequiredFieldEntity),
    inspectionPhotoRepo: dataSource.getRepository(InspectionPhotoEntity),
    uploadedStorageKeys: new Set<string>(),
  };
}

async function runIsolationChecks(summary: SmokeSummary, context: HarnessContext) {
  const token = randomUUID().slice(0, 8);
  const orgA = await seedOrgContext(context, token, "a");
  const orgB = await seedOrgContext(context, token, "b");

  const orgBWorkspace = await context.service.createInspection({
    source: "existing_job",
    customer_id: null,
    job_id: orgB.job.id,
    report_type: "wood_burning_fireplace",
    new_customer: null,
    property_address: null,
    actor: orgB.actor,
    organizationId: orgB.organization.id,
  });

  summary.phases.seeding = "PASS";

  let existingCustomerWorkspaceId: string | null = null;
  let existingJobWorkspaceId: string | null = null;
  let newCustomerWorkspaceId: string | null = null;
  let internalDraftWorkspaceAId: string | null = null;
  let uploadedPhotoStorageKey: string | null = null;

  await expectApiError(
    summary,
    "Org A cannot fetch Org B inspection by ID",
    ["inspection_not_found"],
    () => context.service.getWorkspace(orgBWorkspace.inspectionMeta.id, orgA.organization.id),
  );

  await expectApiError(
    summary,
    "Org A cannot mutate Org B inspection",
    ["inspection_not_found"],
    () => context.service.patchItem(
      orgBWorkspace.inspectionMeta.id,
      orgBWorkspace.items[0].id,
      { status: "satisfactory" },
      orgA.actor,
      orgA.organization.id,
    ),
  );

  await expectApiError(
    summary,
    "Org A cannot use Org B customer in inspection creation",
    ["customer_not_found"],
    () => context.service.createInspection({
      source: "existing_customer",
      customer_id: orgB.customer.id,
      job_id: null,
      report_type: "wood_burning_fireplace",
      new_customer: null,
      property_address: null,
      actor: orgA.actor,
      organizationId: orgA.organization.id,
    }),
  );

  await expectApiError(
    summary,
    "Org A cannot use Org B job in inspection creation",
    ["job_not_found"],
    () => context.service.createInspection({
      source: "existing_job",
      customer_id: null,
      job_id: orgB.job.id,
      report_type: "wood_burning_fireplace",
      new_customer: null,
      property_address: null,
      actor: orgA.actor,
      organizationId: orgA.organization.id,
    }),
  );

  await expectPass(summary, "Org A customer search does not return Org B customers", async () => {
    const rows = await context.service.searchCustomers(`customer-b-${token}`.toLowerCase(), orgA.organization.id);
    const leaked = rows.some((row) => row.id === orgB.customer.id);
    if (leaked) {
      throw new Error("Org B customer leaked into Org A customer search.");
    }
    return { resultCount: rows.length };
  });

  await expectPass(summary, "Org A job search does not return Org B jobs", async () => {
    const rows = await context.service.searchJobs(`BONLY-${token}`.toLowerCase(), orgA.organization.id);
    const leaked = rows.some((row) => row.id === orgB.job.id);
    if (leaked) {
      throw new Error("Org B job leaked into Org A job search.");
    }
    return { resultCount: rows.length };
  });

  await expectApiError(
    summary,
    "Org A inspection workspace does not expose Org B inspection child rows",
    ["inspection_not_found"],
    () => context.service.getWorkspace(orgBWorkspace.inspectionMeta.id, orgA.organization.id),
  );

  await expectPass(summary, "Org A can create an inspection from an existing Org A customer", async () => {
    const workspace = await context.service.createInspection({
      source: "existing_customer",
      customer_id: orgA.customer.id,
      job_id: null,
      report_type: "wood_burning_fireplace",
      new_customer: null,
      property_address: null,
      actor: orgA.actor,
      organizationId: orgA.organization.id,
    });
    existingCustomerWorkspaceId = workspace.inspectionMeta.id;
    const inspection = await context.inspectionRepo.findOne({
      where: { id: workspace.inspectionMeta.id, organization_id: orgA.organization.id },
    });
    if (!inspection) {
      throw new Error("Existing-customer inspection was not created in Org A.");
    }
    return {
      inspectionId: inspection.id,
      customerId: inspection.customer_id,
      jobId: inspection.job_id,
    };
  });

  await expectPass(summary, "Org A can create an inspection from an existing Org A job", async () => {
    const workspace = await context.service.createInspection({
      source: "existing_job",
      customer_id: null,
      job_id: orgA.job.id,
      report_type: "wood_burning_fireplace",
      new_customer: null,
      property_address: null,
      actor: orgA.actor,
      organizationId: orgA.organization.id,
    });
    existingJobWorkspaceId = workspace.inspectionMeta.id;
    const inspection = await context.inspectionRepo.findOne({
      where: { id: workspace.inspectionMeta.id, organization_id: orgA.organization.id },
    });
    if (!inspection) {
      throw new Error("Existing-job inspection was not created in Org A.");
    }
    return {
      inspectionId: inspection.id,
      customerId: inspection.customer_id,
      jobId: inspection.job_id,
    };
  });

  await expectPass(summary, "Org A can create a new-customer inspection flow and all created rows are stamped with Org A organization_id", async () => {
    const workspace = await context.service.createInspection({
      source: "new_customer",
      customer_id: null,
      job_id: null,
      report_type: "gas_fireplace",
      new_customer: {
        first_name: "Org",
        last_name: `A Smoke ${token}`,
        phone: "5553000003",
        email: `inspection-new-a-${token}@example.com`,
        property_address: `ANEW-${token} Smoke Street`,
      },
      property_address: null,
      actor: orgA.actor,
      organizationId: orgA.organization.id,
    });
    newCustomerWorkspaceId = workspace.inspectionMeta.id;

    const inspection = await context.inspectionRepo.findOne({
      where: { id: workspace.inspectionMeta.id, organization_id: orgA.organization.id },
    });
    if (!inspection) {
      throw new Error("New-customer inspection missing or not stamped with Org A.");
    }

    const customer = await context.customerRepo.findOne({
      where: { id: inspection.customer_id, organization_id: orgA.organization.id },
    });
    if (!customer) {
      throw new Error("New-customer flow customer missing or not stamped with Org A.");
    }

    if (!inspection.job_id) {
      throw new Error("New-customer flow did not create a linked job.");
    }

    const job = await context.jobRepo.findOne({
      where: { id: inspection.job_id, organization_id: orgA.organization.id },
    });
    if (!job) {
      throw new Error("New-customer flow job missing or not stamped with Org A.");
    }

    const itemCount = await context.inspectionItemRepo.count({
      where: { inspection_id: inspection.id, organization_id: orgA.organization.id },
    });
    const fieldCount = await context.inspectionRequiredFieldRepo.count({
      where: { inspection_id: inspection.id, organization_id: orgA.organization.id },
    });

    if (itemCount === 0 || fieldCount === 0) {
      throw new Error("New-customer flow did not stamp inspection child rows with Org A.");
    }

    return {
      inspectionId: inspection.id,
      customerId: customer.id,
      jobId: job.id,
      itemCount,
      fieldCount,
    };
  });

  await expectPass(summary, "Org A internal-draft customer flow is organization-scoped", async () => {
    const workspaceA1 = await context.service.createInspection({
      source: "internal_draft",
      customer_id: null,
      job_id: null,
      report_type: "wood_burning_fireplace",
      new_customer: null,
      property_address: null,
      actor: orgA.actor,
      organizationId: orgA.organization.id,
    });
    internalDraftWorkspaceAId = workspaceA1.inspectionMeta.id;

    const workspaceA2 = await context.service.createInspection({
      source: "internal_draft",
      customer_id: null,
      job_id: null,
      report_type: "wood_burning_fireplace",
      new_customer: null,
      property_address: null,
      actor: orgA.actor,
      organizationId: orgA.organization.id,
    });

    const workspaceB1 = await context.service.createInspection({
      source: "internal_draft",
      customer_id: null,
      job_id: null,
      report_type: "wood_burning_fireplace",
      new_customer: null,
      property_address: null,
      actor: orgB.actor,
      organizationId: orgB.organization.id,
    });

    const inspectionA1 = await context.inspectionRepo.findOneByOrFail({ id: workspaceA1.inspectionMeta.id });
    const inspectionA2 = await context.inspectionRepo.findOneByOrFail({ id: workspaceA2.inspectionMeta.id });
    const inspectionB1 = await context.inspectionRepo.findOneByOrFail({ id: workspaceB1.inspectionMeta.id });

    if (inspectionA1.customer_id !== inspectionA2.customer_id) {
      throw new Error("Org A internal-draft flow did not reuse its org-scoped draft customer.");
    }
    if (inspectionA1.customer_id === inspectionB1.customer_id) {
      throw new Error("Org A and Org B internal-draft flows shared a draft customer.");
    }

    const customerA = await context.customerRepo.findOne({
      where: { id: inspectionA1.customer_id, organization_id: orgA.organization.id },
    });
    const customerB = await context.customerRepo.findOne({
      where: { id: inspectionB1.customer_id, organization_id: orgB.organization.id },
    });
    if (!customerA || !customerB) {
      throw new Error("Internal-draft customers were not stamped with their organization.");
    }

    return {
      orgADraftCustomerId: customerA.id,
      orgBDraftCustomerId: customerB.id,
      orgAReusedSameCustomer: true,
    };
  });

  await expectPass(summary, "Workspace loads successfully for a same-org inspection", async () => {
    const workspaceId = existingJobWorkspaceId ?? existingCustomerWorkspaceId ?? newCustomerWorkspaceId ?? internalDraftWorkspaceAId;
    if (!workspaceId) {
      throw new Error("No same-org workspace was created for verification.");
    }
    const workspace = await context.service.getWorkspace(workspaceId, orgA.organization.id);
    if (!workspace.items.length || !workspace.required_fields.length) {
      throw new Error("Same-org workspace did not return inspection child data.");
    }
    return {
      inspectionId: workspace.inspectionMeta.id,
      itemCount: workspace.items.length,
      requiredFieldCount: workspace.required_fields.length,
    };
  });

  await expectPass(summary, "uploadPhotos stamps organization_id on inspection photos", async () => {
    const workspaceId = newCustomerWorkspaceId ?? existingJobWorkspaceId ?? existingCustomerWorkspaceId;
    if (!workspaceId) {
      throw new Error("No same-org inspection available for upload verification.");
    }

    await context.service.uploadPhotos(
      workspaceId,
      [
        {
          originalname: `inspection-smoke-${token}.png`,
          mimetype: "image/png",
          buffer: Buffer.from([137, 80, 78, 71]),
        },
      ],
      orgA.organization.id,
    );

    const photos = await context.inspectionPhotoRepo.find({
      where: { inspection_id: workspaceId, organization_id: orgA.organization.id },
      order: { created_at: "ASC" },
    });

    if (photos.length === 0) {
      throw new Error("No inspection photo row was created for upload verification.");
    }

    for (const photo of photos) {
      context.uploadedStorageKeys.add(photo.storage_key);
      if (photo.organization_id !== orgA.organization.id) {
        throw new Error("Inspection photo row was not stamped with Org A.");
      }
    }
    uploadedPhotoStorageKey = photos[0]?.storage_key ?? null;

    return {
      inspectionId: workspaceId,
      photoCount: photos.length,
    };
  });

  await expectPass(summary, "Same-org photo asset still loads", async () => {
    if (!uploadedPhotoStorageKey) {
      throw new Error("No uploaded photo storage key available for same-org asset verification.");
    }
    const stream = await context.service.getPhotoAssetStream(uploadedPhotoStorageKey, orgA.organization.id);
    if (!(stream instanceof Readable)) {
      throw new Error("Photo asset stream did not return a readable stream.");
    }
    const buffer = await streamToBuffer(stream);
    if (buffer.byteLength === 0) {
      throw new Error("Same-org photo asset stream returned no bytes.");
    }
    return { bytes: buffer.byteLength };
  });

  await expectApiError(
    summary,
    "Cross-org photo asset is blocked",
    ["inspection_photo_asset_not_found", "inspection_not_found"],
    async () => {
      if (!uploadedPhotoStorageKey) {
        throw new Error("No uploaded photo storage key available for cross-org asset verification.");
      }
      const stream = await context.service.getPhotoAssetStream(uploadedPhotoStorageKey, orgB.organization.id);
      await streamToBuffer(stream);
    },
  );

  await expectPass(summary, "Same-org PDF render still works", async () => {
    const workspaceId = newCustomerWorkspaceId ?? existingJobWorkspaceId ?? existingCustomerWorkspaceId;
    if (!workspaceId) {
      throw new Error("No same-org inspection available for PDF render verification.");
    }
    const pdfBuffer = await context.service.renderInspectionPdf(workspaceId, orgA.organization.id);
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.byteLength === 0) {
      throw new Error("Same-org PDF render did not return a PDF buffer.");
    }
    return { bytes: pdfBuffer.byteLength };
  });

  await expectApiError(
    summary,
    "Cross-org PDF render is blocked",
    ["inspection_not_found"],
    () => context.service.renderInspectionPdf(orgBWorkspace.inspectionMeta.id, orgA.organization.id),
  );
}

async function removeUploadedPhotoFiles(storageKeys: Iterable<string>) {
  const uploadsRoot = join(process.cwd(), "uploads", "inspection-photos");
  const removed: string[] = [];

  for (const storageKey of storageKeys) {
    if (!storageKey) {
      continue;
    }

    const absolutePath = join(uploadsRoot, storageKey);
    try {
      await access(absolutePath);
      await rm(absolutePath, { force: true });
      removed.push(absolutePath);
    } catch {
      // Ignore missing files so cleanup stays idempotent.
    }
  }

  return removed;
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_inspections_verify_${Date.now()}`;
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
  let harnessContext: HarnessContext | null = null;

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

    harnessContext = await createHarnessContext(dataSource);
    await runIsolationChecks(summary, harnessContext);
    if (summary.phases.seeding !== "PASS") {
      summary.phases.seeding = "PASS";
    }
  } catch (error) {
    summary.errors.push(extractErrorCode(error));
  } finally {
    try {
      if (harnessContext) {
        summary.cleanup.removedPhotoFiles = await removeUploadedPhotoFiles(harnessContext.uploadedStorageKeys);
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

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
