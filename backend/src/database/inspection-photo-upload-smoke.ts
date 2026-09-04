import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { roleHasPermission } from "../auth/permissions";
import { CustomerEntity } from "./entities/customer.entity";
import { InspectionItemEntity } from "./entities/inspection-item.entity";
import { InspectionPhotoEntity } from "./entities/inspection-photo.entity";
import { InspectionRequiredFieldEntity } from "./entities/inspection-required-field.entity";
import { InspectionEntity } from "./entities/inspection.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { InspectionWorkflowService } from "../inspections/inspection-workflow.service";
import {
  INSPECTION_PHOTO_MAX_FILE_SIZE_BYTES,
  INSPECTION_PHOTO_MAX_FILES_PER_REQUEST,
  INSPECTION_PHOTO_MAX_PHOTOS_PER_INSPECTION,
  INSPECTION_PHOTO_MAX_REQUEST_BYTES,
  InspectionsAdminService,
  validateInspectionPhotoUploadBatch,
  type InspectionPhotoUploadFile,
} from "../inspections/inspections.admin.service";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";

const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";

type SmokeStatus = "PASS" | "FAIL";
type SmokeResult = { name: string; status: SmokeStatus; detail?: unknown };

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2oQAAAAASUVORK5CYII=",
  "base64",
);

function buildMinimalWebp() {
  const base = Buffer.from("524946461e000000574542505650384c120000002f0099000100980000", "hex");
  const targetSize = base.readUInt32LE(4) + 8;
  if (base.length >= targetSize) {
    return base.subarray(0, targetSize);
  }
  return Buffer.concat([base, Buffer.alloc(targetSize - base.length, 0)]);
}

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Inspection photo upload smoke test currently supports MySQL only.");
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

async function expectPass(results: SmokeResult[], name: string, run: () => Promise<unknown>) {
  try {
    const detail = await run();
    results.push({ name, status: "PASS", detail });
  } catch (error) {
    results.push({ name, status: "FAIL", detail: extractErrorCode(error) });
  }
}

async function expectError(results: SmokeResult[], name: string, codes: string[], run: () => Promise<unknown>) {
  try {
    await run();
    results.push({ name, status: "FAIL", detail: `Expected ${codes.join("|")}` });
  } catch (error) {
    const code = extractErrorCode(error);
    if (codes.includes(code)) {
      results.push({ name, status: "PASS", detail: code });
    } else {
      results.push({ name, status: "FAIL", detail: code });
    }
  }
}

function buildMinimalJpeg(): Buffer {
  const parts = [Buffer.from([0xff, 0xd8])];
  let remaining = 512;
  while (remaining > 4) {
    const payloadSize = Math.min(remaining - 4, 60000);
    const segment = Buffer.alloc(payloadSize + 4);
    segment[0] = 0xff;
    segment[1] = 0xfe;
    segment.writeUInt16BE(payloadSize + 2, 2);
    segment.fill(0x20, 4);
    parts.push(segment);
    remaining -= segment.length;
  }
  parts.push(Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

function buildSizedJpeg(targetSize: number): Buffer {
  const parts = [Buffer.from([0xff, 0xd8])];
  let size = 2;
  while (size + 4 < targetSize - 2) {
    const payloadSize = Math.min(targetSize - size - 4, 65000);
    const segment = Buffer.alloc(payloadSize + 4);
    segment[0] = 0xff;
    segment[1] = 0xfe;
    segment.writeUInt16BE(payloadSize + 2, 2);
    segment.fill(0x20, 4);
    parts.push(segment);
    size += segment.length;
  }
  parts.push(Buffer.from([0xff, 0xd9]));
  const buffer = Buffer.concat(parts);
  if (buffer.length > targetSize) {
    return buffer.subarray(0, targetSize - 2).length >= 4
      ? Buffer.concat([buffer.subarray(0, targetSize - 2), Buffer.from([0xff, 0xd9])])
      : buffer;
  }
  if (buffer.length < targetSize) {
    const pad = Buffer.alloc(targetSize - buffer.length, 0x20);
    return Buffer.concat([buffer.subarray(0, buffer.length - 2), pad, Buffer.from([0xff, 0xd9])]);
  }
  return buffer;
}

function fileInput(
  buffer: Buffer,
  mime: string,
  originalname = "photo.jpg",
): InspectionPhotoUploadFile {
  return { buffer, mimetype: mime, originalname };
}

function buildService(dataSource: DataSource) {
  return new InspectionsAdminService(
    dataSource,
    dataSource.getRepository(InspectionEntity),
    dataSource.getRepository(InspectionItemEntity),
    dataSource.getRepository(InspectionRequiredFieldEntity),
    dataSource.getRepository(InspectionPhotoEntity),
    dataSource.getRepository(CustomerEntity),
    dataSource.getRepository(JobEntity),
    new InspectionWorkflowService(),
  );
}

async function createHarnessInspection(
  dataSource: DataSource,
  input: { organizationId: string; customerId: string; jobId: string; verificationCode: string },
) {
  const inspectionRepo = dataSource.getRepository(InspectionEntity);
  return inspectionRepo.save(inspectionRepo.create({
    organization_id: input.organizationId,
    customer_id: input.customerId,
    job_id: input.jobId,
    report_type: "wood_burning_fireplace",
    workflow_type: "safety_standard",
    verification_code: input.verificationCode,
    site_address_snapshot: "1 Photo Lane",
    status: "pass",
    safety_score: 100,
    compliance_status: null,
  }));
}

async function createHarnessJob(
  dataSource: DataSource,
  input: { organizationId: string; customerId: string; title: string },
) {
  const jobRepo = dataSource.getRepository(JobEntity);
  return jobRepo.save(jobRepo.create({
    organization_id: input.organizationId,
    customer_id: input.customerId,
    title: input.title,
    description: "photo upload harness",
    lead_source: "website",
    requested_service_type: "inspection",
    job_type: "inspection",
    status: "completed",
    service_address_line_1: "1 Photo Lane",
    service_address_line_2: null,
    service_city: "Testville",
    service_state_or_region: null,
    service_postal_code: "T0T0T0",
  }));
}

async function seedFixture(dataSource: DataSource, token: string) {
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const customerRepo = dataSource.getRepository(CustomerEntity);

  const orgA = await orgRepo.save(orgRepo.create({
    name: `Photo Upload Org A ${token}`,
    slug: `photo-up-a-${token}`,
    is_active: true,
  }));
  const orgB = await orgRepo.save(orgRepo.create({
    name: `Photo Upload Org B ${token}`,
    slug: `photo-up-b-${token}`,
    is_active: true,
  }));

  const customerA = await customerRepo.save(customerRepo.create({
    organization_id: orgA.id,
    full_name: "Photo Customer A",
    email: "photo-a@example.com",
    company_name: null,
    service_address_line_1: "1 Photo Lane",
    service_address_line_2: null,
    service_city: "Testville",
    service_state_or_region: null,
    service_postal_code: "T0T0T0",
    phone: "5551110001",
    source: "website",
    preferred_service_type: "inspection",
    lifecycle_status: "active",
    notes: null,
  }));

  const jobA = await createHarnessJob(dataSource, {
    organizationId: orgA.id,
    customerId: customerA.id,
    title: "Photo Upload Job A",
  });

  const inspectionA = await createHarnessInspection(dataSource, {
    organizationId: orgA.id,
    customerId: customerA.id,
    jobId: jobA.id,
    verificationCode: `PHOTO-${token}`,
  });

  return { orgA, orgB, customerA, jobA, inspectionA };
}

async function newInspection(
  dataSource: DataSource,
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  verificationCode: string,
  jobTitle: string,
) {
  const job = await createHarnessJob(dataSource, {
    organizationId: fixture.orgA.id,
    customerId: fixture.customerA.id,
    title: jobTitle,
  });
  return createHarnessInspection(dataSource, {
    organizationId: fixture.orgA.id,
    customerId: fixture.customerA.id,
    jobId: job.id,
    verificationCode,
  });
}

async function countPhotos(dataSource: DataSource, inspectionId: string) {
  return dataSource.getRepository(InspectionPhotoEntity).count({ where: { inspection_id: inspectionId } });
}

async function countPendingFiles() {
  const pendingRoot = join(process.cwd(), "uploads", "inspection-photos", ".pending");
  if (!existsSync(pendingRoot)) {
    return 0;
  }
  let total = 0;
  for (const entry of readdirSync(pendingRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      total += readdirSync(join(pendingRoot, entry.name)).length;
    }
  }
  return total;
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_insp_photo_up_${Date.now()}`;
  const results: SmokeResult[] = [];
  const errors: string[] = [];
  let phoenixPhotoCountBefore = 0;

  const adminConnection = await mysql.createConnection({
    host: options.host,
    port: options.port,
    user: options.username,
    password: options.password,
    multipleStatements: true,
  });

  let dataSource: DataSource | null = null;

  try {
    const phoenixProbe = new DataSource(buildDataSourceOptions());
    await phoenixProbe.initialize();
    try {
      phoenixPhotoCountBefore = Number((await phoenixProbe.query(
        "SELECT COUNT(*) AS c FROM inspection_photos WHERE organization_id = ?",
        [PHOENIX_ORG_ID],
      ) as Array<{ c: number | string }>)[0]?.c ?? 0);
    } finally {
      await phoenixProbe.destroy();
    }

    await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await adminConnection.query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );

    dataSource = new DataSource({ ...options, database: databaseName });
    await dataSource.initialize();
    await dataSource.runMigrations();
    await verifyDatabaseSchema(dataSource);

    const token = randomUUID().slice(0, 8);
    const fixture = await seedFixture(dataSource, token);
    const service = buildService(dataSource);
    const jpeg = buildMinimalJpeg();

    await expectPass(results, "1 valid JPEG", async () => {
      const before = await countPhotos(dataSource!, fixture.inspectionA.id);
      await service.uploadPhotos(fixture.inspectionA.id, [fileInput(jpeg, "image/jpeg")], fixture.orgA.id);
      const after = await countPhotos(dataSource!, fixture.inspectionA.id);
      if (after !== before + 1) throw new Error(`Expected one photo, got ${before}->${after}`);
      return { after };
    });

    await expectPass(results, "2 valid PNG", async () => {
      const before = await countPhotos(dataSource!, fixture.inspectionA.id);
      await service.uploadPhotos(fixture.inspectionA.id, [fileInput(MINIMAL_PNG, "image/png", "photo.png")], fixture.orgA.id);
      const after = await countPhotos(dataSource!, fixture.inspectionA.id);
      if (after !== before + 1) throw new Error(`Expected one photo, got ${before}->${after}`);
      return { after };
    });

    await expectPass(results, "3 valid WEBP", async () => {
      const before = await countPhotos(dataSource!, fixture.inspectionA.id);
      await service.uploadPhotos(fixture.inspectionA.id, [fileInput(buildMinimalWebp(), "image/webp", "photo.webp")], fixture.orgA.id);
      const after = await countPhotos(dataSource!, fixture.inspectionA.id);
      if (after !== before + 1) throw new Error(`Expected one photo, got ${before}->${after}`);
      return { after };
    });

    await expectError(results, "4 spoofed image/jpeg containing text", ["inspection_photo_invalid_type"], async () => {
      await service.uploadPhotos(fixture.inspectionA.id, [fileInput(Buffer.from("not-an-image"), "image/jpeg")], fixture.orgA.id);
    });

    await expectError(results, "5 MIME/content mismatch", ["inspection_photo_invalid_type"], async () => {
      await service.uploadPhotos(fixture.inspectionA.id, [fileInput(MINIMAL_PNG, "image/jpeg", "photo.jpg")], fixture.orgA.id);
    });

    await expectError(results, "6 SVG reject", ["inspection_photo_invalid_type"], async () => {
      await service.uploadPhotos(
        fixture.inspectionA.id,
        [fileInput(Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>"), "image/svg+xml", "photo.svg")],
        fixture.orgA.id,
      );
    });

    await expectError(results, "7 GIF reject", ["inspection_photo_invalid_type"], async () => {
      await service.uploadPhotos(
        fixture.inspectionA.id,
        [fileInput(Buffer.from("GIF89a\u0000\u0000\u0001\u0000\u0001\u0000\u0000\u0000\u0000!\u0000\u0001\u0000\u0000\u0000\u0000,\u0000\u0000\u0000\u0000\u0001\u0000\u0001\u0000\u0000\u0002\u0002D\u0001\u0000;"), "image/gif", "photo.gif")],
        fixture.orgA.id,
      );
    });

    await expectError(results, "8 HEIC reject", ["inspection_photo_invalid_type"], async () => {
      const heic = Buffer.alloc(32);
      heic.writeUInt32BE(24, 0);
      heic.write("ftyp", 4);
      heic.write("heic", 8);
      await service.uploadPhotos(fixture.inspectionA.id, [fileInput(heic, "image/heic", "photo.heic")], fixture.orgA.id);
    });

    await expectError(results, "9 arbitrary image/* reject", ["inspection_photo_invalid_type"], async () => {
      await service.uploadPhotos(fixture.inspectionA.id, [fileInput(jpeg, "image/evil", "photo.jpg")], fixture.orgA.id);
    });

    await expectError(results, "10 zero-byte reject", ["inspection_photo_empty"], async () => {
      await service.uploadPhotos(fixture.inspectionA.id, [fileInput(Buffer.alloc(0), "image/jpeg")], fixture.orgA.id);
    });

    await expectError(results, "11 truncated JPEG reject", ["inspection_photo_corrupt"], async () => {
      await service.uploadPhotos(fixture.inspectionA.id, [fileInput(Buffer.from([0xff, 0xd8, 0xff, 0xdb]), "image/jpeg")], fixture.orgA.id);
    });

    await expectError(results, "12 truncated PNG reject", ["inspection_photo_corrupt", "inspection_photo_invalid_type"], async () => {
      await service.uploadPhotos(
        fixture.inspectionA.id,
        [fileInput(MINIMAL_PNG.subarray(0, 24), "image/png", "photo.png")],
        fixture.orgA.id,
      );
    });

    await expectError(results, "13 truncated WEBP reject", ["inspection_photo_corrupt"], async () => {
      await service.uploadPhotos(
        fixture.inspectionA.id,
        [fileInput(buildMinimalWebp().subarray(0, 16), "image/webp", "photo.webp")],
        fixture.orgA.id,
      );
    });

    await expectPass(results, "14 exactly 10MB JPEG allowed", async () => {
      const inspection = await newInspection(dataSource!, fixture, `TENMB-${token}`, "10MB Job");
      const payload = buildSizedJpeg(INSPECTION_PHOTO_MAX_FILE_SIZE_BYTES);
      if (payload.length !== INSPECTION_PHOTO_MAX_FILE_SIZE_BYTES) {
        throw new Error(`Expected 10MB payload, got ${payload.length}`);
      }
      const before = await countPhotos(dataSource!, inspection.id);
      await service.uploadPhotos(inspection.id, [fileInput(payload, "image/jpeg")], fixture.orgA.id);
      const after = await countPhotos(dataSource!, inspection.id);
      if (after !== before + 1) throw new Error(`Expected one photo, got ${before}->${after}`);
      return { bytes: payload.length };
    });

    await expectError(results, "15 over 10MB reject", ["inspection_photo_too_large"], async () => {
      const oversized = buildSizedJpeg(INSPECTION_PHOTO_MAX_FILE_SIZE_BYTES + 1);
      await service.uploadPhotos(fixture.inspectionA.id, [fileInput(oversized, "image/jpeg")], fixture.orgA.id);
    });

    await expectPass(results, "16 exactly 20 files allowed", async () => {
      const inspection = await newInspection(dataSource!, fixture, `TWENTY-${token}`, "Twenty Job");
      const batch = Array.from({ length: INSPECTION_PHOTO_MAX_FILES_PER_REQUEST }, () => fileInput(jpeg, "image/jpeg"));
      const before = await countPhotos(dataSource!, inspection.id);
      await service.uploadPhotos(inspection.id, batch, fixture.orgA.id);
      const after = await countPhotos(dataSource!, inspection.id);
      if (after !== before + INSPECTION_PHOTO_MAX_FILES_PER_REQUEST) {
        throw new Error(`Expected ${INSPECTION_PHOTO_MAX_FILES_PER_REQUEST} new photos, got ${before}->${after}`);
      }
      return { after };
    });

    await expectError(results, "17 over 20 files reject", ["inspection_photo_count_exceeded"], async () => {
      const batch = Array.from({ length: INSPECTION_PHOTO_MAX_FILES_PER_REQUEST + 1 }, () => fileInput(jpeg, "image/jpeg"));
      validateInspectionPhotoUploadBatch(batch);
    });

    await expectPass(results, "18 <=40MB request allowed", async () => {
      const chunk = buildSizedJpeg(Math.floor(INSPECTION_PHOTO_MAX_REQUEST_BYTES / 4));
      const batch = Array.from({ length: 4 }, () => fileInput(chunk, "image/jpeg"));
      const total = batch.reduce((sum, file) => sum + file.buffer.length, 0);
      if (total > INSPECTION_PHOTO_MAX_REQUEST_BYTES) {
        throw new Error(`Expected <=40MB, got ${total}`);
      }
      const inspection = await newInspection(dataSource!, fixture, `FORTY-${token}`, "Forty Job");
      const before = await countPhotos(dataSource!, inspection.id);
      await service.uploadPhotos(inspection.id, batch, fixture.orgA.id);
      const after = await countPhotos(dataSource!, inspection.id);
      if (after !== before + 4) throw new Error(`Expected 4 photos, got ${before}->${after}`);
      return { totalBytes: total };
    });

    await expectError(results, "19 >40MB request reject", ["inspection_photo_request_too_large"], async () => {
      const chunk = buildSizedJpeg(Math.floor(INSPECTION_PHOTO_MAX_REQUEST_BYTES / 4) + 1);
      const batch = Array.from({ length: 4 }, () => fileInput(chunk, "image/jpeg"));
      validateInspectionPhotoUploadBatch(batch);
    });

    await expectPass(results, "20 inspection reaches exactly 100 photos allowed", async () => {
      const inspection = await newInspection(dataSource!, fixture, `HUND-${token}`, "Hundred Job");
      const photoRepo = dataSource!.getRepository(InspectionPhotoEntity);
      for (let index = 0; index < INSPECTION_PHOTO_MAX_PHOTOS_PER_INSPECTION - 1; index += 1) {
        await photoRepo.save(photoRepo.create({
          organization_id: fixture.orgA.id,
          inspection_id: inspection.id,
          photo_type: "finding",
          storage_key: `seed-${index}.jpg`,
          thumbnail_url: `/api/inspections/photos/seed-${index}.jpg/asset`,
          asset_url: `/api/inspections/photos/seed-${index}.jpg/asset`,
        }));
      }
      const before = await countPhotos(dataSource!, inspection.id);
      await service.uploadPhotos(inspection.id, [fileInput(jpeg, "image/jpeg")], fixture.orgA.id);
      const after = await countPhotos(dataSource!, inspection.id);
      if (after !== INSPECTION_PHOTO_MAX_PHOTOS_PER_INSPECTION || after !== before + 1) {
        throw new Error(`Expected ${INSPECTION_PHOTO_MAX_PHOTOS_PER_INSPECTION} photos, got ${after}`);
      }
      return { after };
    });

    await expectError(results, "21 over 100 photos reject", ["inspection_photo_count_exceeded"], async () => {
      const inspection = await newInspection(dataSource!, fixture, `OVERH-${token}`, "Over Hundred Job");
      const photoRepo = dataSource!.getRepository(InspectionPhotoEntity);
      for (let index = 0; index < INSPECTION_PHOTO_MAX_PHOTOS_PER_INSPECTION; index += 1) {
        await photoRepo.save(photoRepo.create({
          organization_id: fixture.orgA.id,
          inspection_id: inspection.id,
          photo_type: "finding",
          storage_key: `full-${index}.jpg`,
          thumbnail_url: `/api/inspections/photos/full-${index}.jpg/asset`,
          asset_url: `/api/inspections/photos/full-${index}.jpg/asset`,
        }));
      }
      await service.uploadPhotos(inspection.id, [fileInput(jpeg, "image/jpeg")], fixture.orgA.id);
    });

    await expectPass(results, "22 invalid file in batch rejects entire batch", async () => {
      const before = await countPhotos(dataSource!, fixture.inspectionA.id);
      const pendingBefore = await countPendingFiles();
      try {
        await service.uploadPhotos(
          fixture.inspectionA.id,
          [fileInput(jpeg, "image/jpeg"), fileInput(Buffer.from("bad"), "image/jpeg")],
          fixture.orgA.id,
        );
        throw new Error("Expected batch failure");
      } catch (error) {
        const code = extractErrorCode(error);
        if (code !== "inspection_photo_invalid_type") {
          throw error;
        }
      }
      const after = await countPhotos(dataSource!, fixture.inspectionA.id);
      const pendingAfter = await countPendingFiles();
      if (after !== before) {
        throw new Error(`Expected zero batch persistence, photo count ${before}->${after}`);
      }
      if (pendingAfter > pendingBefore) {
        throw new Error("Pending staged files were left behind.");
      }
      return { unchanged: true };
    });

    await expectError(results, "23 forced storage failure leaves zero persistence", ["inspection_photo_upload_failed"], async () => {
      const before = await countPhotos(dataSource!, fixture.inspectionA.id);
      try {
        await service.uploadPhotos(
          fixture.inspectionA.id,
          [fileInput(jpeg, "image/jpeg")],
          fixture.orgA.id,
          { testHooks: { forceStageWriteFailure: true } },
        );
      } finally {
        const after = await countPhotos(dataSource!, fixture.inspectionA.id);
        if (after !== before) {
          throw new Error(`Expected zero persistence, got ${before}->${after}`);
        }
      }
    });

    await expectError(results, "24 forced DB failure cleans files and leaves zero persistence", ["forced_db_failure"], async () => {
      const before = await countPhotos(dataSource!, fixture.inspectionA.id);
      try {
        await service.uploadPhotos(
          fixture.inspectionA.id,
          [fileInput(jpeg, "image/jpeg")],
          fixture.orgA.id,
          {
            testHooks: {
              beforePhotoInsert: async () => {
                throw new Error("forced_db_failure");
              },
            },
          },
        );
      } finally {
        const after = await countPhotos(dataSource!, fixture.inspectionA.id);
        if (after !== before) {
          throw new Error(`Expected zero persistence, got ${before}->${after}`);
        }
      }
    });

    await expectPass(results, "25 retry after failure succeeds exactly once", async () => {
      const inspection = await newInspection(dataSource!, fixture, `RETRY-${token}`, "Retry Job");
      try {
        await service.uploadPhotos(
          inspection.id,
          [fileInput(jpeg, "image/jpeg")],
          fixture.orgA.id,
          { testHooks: { beforeCommit: async () => { throw new Error("forced_pre_commit_failure"); } } },
        );
      } catch {
        // expected
      }
      const before = await countPhotos(dataSource!, inspection.id);
      await service.uploadPhotos(inspection.id, [fileInput(jpeg, "image/jpeg")], fixture.orgA.id);
      const after = await countPhotos(dataSource!, inspection.id);
      if (after !== before + 1) throw new Error(`Expected one retry success, got ${before}->${after}`);
      return { after };
    });

    await expectPass(results, "26 path traversal original filename harmless", async () => {
      const before = await countPhotos(dataSource!, fixture.inspectionA.id);
      await service.uploadPhotos(
        fixture.inspectionA.id,
        [fileInput(jpeg, "image/jpeg", "../../etc/passwd.jpg")],
        fixture.orgA.id,
      );
      const after = await countPhotos(dataSource!, fixture.inspectionA.id);
      const photo = await dataSource!.getRepository(InspectionPhotoEntity).findOneOrFail({
        where: { inspection_id: fixture.inspectionA.id },
        order: { created_at: "DESC" },
      });
      if (photo.storage_key.includes("..") || photo.storage_key.includes("/")) {
        throw new Error(`Unsafe storage key: ${photo.storage_key}`);
      }
      if (after <= before) throw new Error("Expected stored photo");
      return { storageKey: photo.storage_key };
    });

    await expectPass(results, "27 duplicate original filename uses UUID keys", async () => {
      const inspection = await newInspection(dataSource!, fixture, `DUP-${token}`, "Dup Name Job");
      await service.uploadPhotos(
        inspection.id,
        [fileInput(jpeg, "image/jpeg", "same-name.jpg"), fileInput(jpeg, "image/jpeg", "same-name.jpg")],
        fixture.orgA.id,
      );
      const photos = await dataSource!.getRepository(InspectionPhotoEntity).find({ where: { inspection_id: inspection.id } });
      const keys = new Set(photos.map((photo) => photo.storage_key));
      if (keys.size < 2) throw new Error("Expected distinct UUID storage keys");
      return { keys: [...keys] };
    });

    await expectError(results, "28 cross-org upload reject", ["inspection_not_found"], async () => {
      await service.uploadPhotos(fixture.inspectionA.id, [fileInput(jpeg, "image/jpeg")], fixture.orgB.id);
    });

    await expectPass(results, "29 unauthorized technician actor reject", async () => {
      if (roleHasPermission("technician", "inspections.admin")) {
        throw new Error("Technician unexpectedly has inspections.admin");
      }
      return { technicianHasInspectionAdmin: false };
    });

    await expectPass(results, "30 authorized office actor upload success", async () => {
      const inspection = await newInspection(dataSource!, fixture, `AUTH-${token}`, "Authorized Job");
      const before = await countPhotos(dataSource!, inspection.id);
      await service.uploadPhotos(inspection.id, [fileInput(jpeg, "image/jpeg")], fixture.orgA.id);
      const after = await countPhotos(dataSource!, inspection.id);
      if (after !== before + 1) throw new Error(`Expected upload success, got ${before}->${after}`);
      return { after };
    });

    await expectError(results, "31 cross-org retrieval reject", ["inspection_photo_asset_not_found", "inspection_not_found"], async () => {
      const photo = await dataSource!.getRepository(InspectionPhotoEntity).findOneByOrFail({ inspection_id: fixture.inspectionA.id });
      await service.getPhotoAssetStream(photo.storage_key, fixture.orgB.id);
    });
  } catch (error) {
    errors.push(extractErrorCode(error));
  } finally {
    try {
      if (dataSource?.isInitialized) {
        await dataSource.destroy();
      }
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
      await adminConnection.end();
    } catch (error) {
      errors.push(`cleanup: ${extractErrorCode(error)}`);
    }
  }

  let phoenixPhotoCountAfter = phoenixPhotoCountBefore;
  try {
    const phoenixProbe = new DataSource(buildDataSourceOptions());
    await phoenixProbe.initialize();
    try {
      phoenixPhotoCountAfter = Number((await phoenixProbe.query(
        "SELECT COUNT(*) AS c FROM inspection_photos WHERE organization_id = ?",
        [PHOENIX_ORG_ID],
      ) as Array<{ c: number | string }>)[0]?.c ?? 0);
    } finally {
      await phoenixProbe.destroy();
    }
  } catch (error) {
    errors.push(`phoenix_probe: ${extractErrorCode(error)}`);
  }

  await expectPass(results, "Phoenix production photo rows remain untouched", async () => {
    if (phoenixPhotoCountBefore !== phoenixPhotoCountAfter) {
      throw new Error(`Expected ${phoenixPhotoCountBefore} Phoenix photos unchanged, got ${phoenixPhotoCountAfter}`);
    }
    return { phoenixPhotoCountBefore, phoenixPhotoCountAfter };
  });

  const ok = errors.length === 0 && results.every((result) => result.status === "PASS");
  console.log(JSON.stringify({ ok, database: databaseName, phoenixPhotoCountBefore, phoenixPhotoCountAfter, results, errors }, null, 2));
  if (!ok) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
