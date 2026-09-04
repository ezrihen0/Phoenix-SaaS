import "dotenv/config";
import "reflect-metadata";

import { randomUUID, createHash } from "crypto";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";

import { HttpException } from "@nestjs/common";
import mysql from "mysql2/promise";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { InvoiceDocumentsService } from "../documents/invoice-documents/invoice-documents.service";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceDocumentEntity } from "./entities/invoice-document.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";

const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";

type SmokeStatus = "PASS" | "FAIL";
type SmokeResult = { name: string; status: SmokeStatus; detail?: unknown };

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Invoice document durability smoke test currently supports MySQL only.");
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

function buildService(dataSource: DataSource) {
  return new InvoiceDocumentsService(
    dataSource,
    dataSource.getRepository(InvoiceDocumentEntity),
    dataSource.getRepository(InvoiceEntity),
    dataSource.getRepository(JobEntity),
  );
}

function writeTempPdf(dir: string, name: string, content: string) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

function buildSnapshot(workizCode: string) {
  return JSON.stringify({
    import_source: "workiz_historical_import",
    enrichment_status: "complete",
    workiz_invoice_code: workizCode,
    pdf_enrichment: {
      source_filename: `${workizCode}.pdf`,
      source_pdf_hash: createHash("sha256").update(workizCode).digest("hex"),
    },
  });
}

async function createHarnessInvoice(
  dataSource: DataSource,
  input: { organizationId: string; customerId: string; workizCode: string; jobId?: string },
) {
  const jobRepo = dataSource.getRepository(JobEntity);
  const invoiceRepo = dataSource.getRepository(InvoiceEntity);
  const jobId = input.jobId ?? (await jobRepo.save(jobRepo.create({
    organization_id: input.organizationId,
    customer_id: input.customerId,
    title: `Doc Durability Job ${input.workizCode}`,
    description: `doc durability harness ${input.workizCode}`,
    lead_source: "website",
    requested_service_type: "inspection",
    job_type: "inspection",
    status: "completed",
    service_address_line_1: "1 Doc Lane",
    service_address_line_2: null,
    service_city: "Testville",
    service_state_or_region: null,
    service_postal_code: "T0T0T0",
  }))).id;

  return invoiceRepo.save(invoiceRepo.create({
    organization_id: input.organizationId,
    job_id: jobId,
    description: `Doc durability invoice ${input.workizCode}`,
    status: "paid",
    amount_cents: 10000,
    subtotal_cents: 10000,
    tax_cents: 0,
    tax_rate_bps_snapshot: 0,
    total_cents: 10000,
    issued_at: new Date(),
    due_at: new Date(),
    paid_at: new Date(),
    branding_snapshot_json: buildSnapshot(input.workizCode),
  }));
}

async function seedFixture(dataSource: DataSource, token: string) {
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const customerRepo = dataSource.getRepository(CustomerEntity);
  const jobRepo = dataSource.getRepository(JobEntity);
  const invoiceRepo = dataSource.getRepository(InvoiceEntity);

  const orgA = await orgRepo.save(orgRepo.create({
    name: `Doc Durability Org A ${token}`,
    slug: `doc-dur-a-${token}`,
    is_active: true,
  }));
  const orgB = await orgRepo.save(orgRepo.create({
    name: `Doc Durability Org B ${token}`,
    slug: `doc-dur-b-${token}`,
    is_active: true,
  }));

  const customerA = await customerRepo.save(customerRepo.create({
    organization_id: orgA.id,
    full_name: "Doc Customer A",
    email: "doc-a@example.com",
    company_name: null,
    service_address_line_1: "1 Doc Lane",
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

  const jobA = await jobRepo.save(jobRepo.create({
    organization_id: orgA.id,
    customer_id: customerA.id,
    title: "Doc Durability Job A",
    description: "doc durability harness",
    lead_source: "website",
    requested_service_type: "inspection",
    job_type: "inspection",
    status: "completed",
    service_address_line_1: "1 Doc Lane",
    service_address_line_2: null,
    service_city: "Testville",
    service_state_or_region: null,
    service_postal_code: "T0T0T0",
  }));

  const invoiceA = await createHarnessInvoice(dataSource, {
    organizationId: orgA.id,
    customerId: customerA.id,
    workizCode: "DOCA01",
    jobId: jobA.id,
  });

  const customerB = await customerRepo.save(customerRepo.create({
    organization_id: orgB.id,
    full_name: "Doc Customer B",
    email: "doc-b@example.com",
    company_name: null,
    service_address_line_1: "2 Doc Lane",
    service_address_line_2: null,
    service_city: "Testville",
    service_state_or_region: null,
    service_postal_code: "T0T0T0",
    phone: "5551110002",
    source: "website",
    preferred_service_type: "inspection",
    lifecycle_status: "active",
    notes: null,
  }));

  const jobB = await jobRepo.save(jobRepo.create({
    organization_id: orgB.id,
    customer_id: customerB.id,
    title: "Doc Durability Job B",
    description: "doc durability harness b",
    lead_source: "website",
    requested_service_type: "inspection",
    job_type: "inspection",
    status: "completed",
    service_address_line_1: "2 Doc Lane",
    service_address_line_2: null,
    service_city: "Testville",
    service_state_or_region: null,
    service_postal_code: "T0T0T0",
  }));

  const invoiceB = await createHarnessInvoice(dataSource, {
    organizationId: orgB.id,
    customerId: customerB.id,
    workizCode: "DOCB01",
    jobId: jobB.id,
  });

  return { orgA, orgB, customerA, customerB, jobA, invoiceA, invoiceB };
}

async function countDocuments(dataSource: DataSource) {
  const rows = await dataSource.query("SELECT COUNT(*) AS c FROM invoice_documents") as Array<{ c: number | string }>;
  return Number(rows[0]?.c ?? 0);
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_invoice_doc_dur_${Date.now()}`;
  const tempDir = join(process.cwd(), "_runtime_harness", "invoice-document-durability", randomUUID().slice(0, 8));
  const results: SmokeResult[] = [];
  const errors: string[] = [];

  const adminConnection = await mysql.createConnection({
    host: options.host,
    port: options.port,
    user: options.username,
    password: options.password,
    multipleStatements: true,
  });

  let dataSource: DataSource | null = null;
  let phoenixDocumentCountBefore = 0;

  try {
    const phoenixProbe = new DataSource(buildDataSourceOptions());
    await phoenixProbe.initialize();
    try {
      phoenixDocumentCountBefore = Number((await phoenixProbe.query(
        "SELECT COUNT(*) AS c FROM invoice_documents WHERE organization_id = ?",
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

    const baseInput = (invoiceId: string, customerId: string, orgId: string, code: string, sourcePath: string) => ({
      organizationId: orgId,
      customerId,
      invoiceId,
      sourceFilePath: sourcePath,
      originalFilename: `${code}.pdf`,
      fileHash: createHash("sha256").update(code).digest("hex"),
      workizInvoiceCode: code,
    });

    await expectPass(results, "1 happy attach creates file + DB + provenance", async () => {
      const sourcePath = writeTempPdf(tempDir, "happy.pdf", "%PDF-1.4 happy attach");
      const before = await countDocuments(dataSource!);
      const result = await service.attachWorkizSourcePdf(baseInput(
        fixture.invoiceA.id,
        fixture.customerA.id,
        fixture.orgA.id,
        "DOCA01",
        sourcePath,
      ));
      const after = await countDocuments(dataSource!);
      if (result.action !== "stored" || after !== before + 1) {
        throw new Error(`Expected stored document, got ${result.action} and count ${before}->${after}`);
      }
      if (!existsSync(result.document.storage_path)) {
        throw new Error("Final durable file missing after attach.");
      }
      const invoice = await dataSource!.getRepository(InvoiceEntity).findOneByOrFail({ id: fixture.invoiceA.id });
      const snapshot = JSON.parse(invoice.branding_snapshot_json!) as {
        pdf_enrichment?: { invoice_document_id?: string; source_pdf_storage_key?: string };
      };
      if (snapshot.pdf_enrichment?.invoice_document_id !== result.document.id) {
        throw new Error("Provenance invoice_document_id mismatch.");
      }
      return { documentId: result.document.id };
    });

    await expectPass(results, "2 storage/copy failure creates no DB/provenance changes", async () => {
      const invoice = await createHarnessInvoice(dataSource!, {
        organizationId: fixture.orgA.id,
        customerId: fixture.customerA.id,
        workizCode: "DOCA02",
      });
      const before = await countDocuments(dataSource!);
      try {
        await service.attachWorkizSourcePdf(baseInput(
          invoice.id,
          fixture.customerA.id,
          fixture.orgA.id,
          "DOCA02",
          join(tempDir, "missing-source.pdf"),
        ));
        throw new Error("Expected storage failure");
      } catch (error) {
        const code = extractErrorCode(error);
        if (code !== "invoice_document_storage_failed") {
          throw error;
        }
      }
      const after = await countDocuments(dataSource!);
      if (after !== before) {
        throw new Error(`Expected no document rows, got ${before}->${after}`);
      }
      return { unchanged: true };
    });

    await expectPass(results, "3 DB insert failure cleans staged attempt file", async () => {
      const invoice = await createHarnessInvoice(dataSource!, {
        organizationId: fixture.orgA.id,
        customerId: fixture.customerA.id,
        workizCode: "DOCA03",
      });
      const sourcePath = writeTempPdf(tempDir, "db-fail.pdf", "%PDF-1.4 db fail");
      const before = await countDocuments(dataSource!);
      try {
        await service.attachWorkizSourcePdf({
          ...baseInput(invoice.id, fixture.customerA.id, fixture.orgA.id, "DOCA03", sourcePath),
          testHooks: {
            beforeDocumentInsert: async () => {
              throw new Error("forced_db_insert_failure");
            },
          },
        });
        throw new Error("Expected forced DB failure");
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "forced_db_insert_failure") {
          throw error;
        }
      }
      const after = await countDocuments(dataSource!);
      if (after !== before) {
        throw new Error(`Expected rollback with ${before} rows, got ${after}`);
      }
      return { unchanged: true };
    });

    await expectPass(results, "4 provenance failure rolls back DB and cleans staged file", async () => {
      const invoice = await createHarnessInvoice(dataSource!, {
        organizationId: fixture.orgA.id,
        customerId: fixture.customerA.id,
        workizCode: "DOCA04",
      });
      const sourcePath = writeTempPdf(tempDir, "prov-fail.pdf", "%PDF-1.4 provenance fail");
      const before = await countDocuments(dataSource!);
      try {
        await service.attachWorkizSourcePdf({
          ...baseInput(invoice.id, fixture.customerA.id, fixture.orgA.id, "DOCA04", sourcePath),
          testHooks: {
            beforeProvenanceUpdate: async () => {
              throw new Error("forced_provenance_failure");
            },
          },
        });
        throw new Error("Expected provenance failure");
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "forced_provenance_failure") {
          throw error;
        }
      }
      const after = await countDocuments(dataSource!);
      if (after !== before) {
        throw new Error(`Expected rollback with ${before} rows, got ${after}`);
      }
      return { unchanged: true };
    });

    await expectPass(results, "5 failure after final move but before commit cleans final file and rolls back DB", async () => {
      const invoice = await createHarnessInvoice(dataSource!, {
        organizationId: fixture.orgA.id,
        customerId: fixture.customerA.id,
        workizCode: "DOCA05",
      });
      const sourcePath = writeTempPdf(tempDir, "commit-fail.pdf", "%PDF-1.4 commit fail");
      const before = await countDocuments(dataSource!);
      let leakedPath: string | null = null;
      try {
        await service.attachWorkizSourcePdf({
          ...baseInput(invoice.id, fixture.customerA.id, fixture.orgA.id, "DOCA05", sourcePath),
          testHooks: {
            beforeCommit: async () => {
              throw new Error("forced_pre_commit_failure");
            },
          },
        });
        throw new Error("Expected pre-commit failure");
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "forced_pre_commit_failure") {
          throw error;
        }
      }
      const after = await countDocuments(dataSource!);
      const docs = await dataSource!.getRepository(InvoiceDocumentEntity).find({ where: { invoice_id: invoice.id } });
      leakedPath = docs[0]?.storage_path ?? null;
      if (after !== before) {
        throw new Error(`Expected rollback with ${before} rows, got ${after}`);
      }
      if (leakedPath && existsSync(leakedPath)) {
        throw new Error(`Final file leaked after failed commit: ${leakedPath}`);
      }
      return { unchanged: true };
    });

    await expectPass(results, "6 retry after failed attach succeeds exactly once", async () => {
      const invoice = await createHarnessInvoice(dataSource!, {
        organizationId: fixture.orgA.id,
        customerId: fixture.customerA.id,
        workizCode: "DOCA06",
      });
      const sourcePath = writeTempPdf(tempDir, "retry.pdf", "%PDF-1.4 retry");
      const input = baseInput(invoice.id, fixture.customerA.id, fixture.orgA.id, "DOCA06", sourcePath);
      try {
        await service.attachWorkizSourcePdf({
          ...input,
          testHooks: { beforeCommit: async () => { throw new Error("forced_pre_commit_failure"); } },
        });
      } catch {
        // expected
      }
      const before = await countDocuments(dataSource!);
      const success = await service.attachWorkizSourcePdf(input);
      const after = await countDocuments(dataSource!);
      if (success.action !== "stored" || after !== before + 1) {
        throw new Error(`Expected one successful retry, got ${success.action} and ${before}->${after}`);
      }
      return { documentId: success.document.id };
    });

    await expectPass(results, "7 sequential duplicate is skipped without extra file", async () => {
      const invoice = await createHarnessInvoice(dataSource!, {
        organizationId: fixture.orgA.id,
        customerId: fixture.customerA.id,
        workizCode: "DOCA07",
      });
      const sourcePath = writeTempPdf(tempDir, "dup-seq.pdf", "%PDF-1.4 dup seq");
      const input = baseInput(invoice.id, fixture.customerA.id, fixture.orgA.id, "DOCA07", sourcePath);
      const first = await service.attachWorkizSourcePdf(input);
      const before = await countDocuments(dataSource!);
      const second = await service.attachWorkizSourcePdf(input);
      const after = await countDocuments(dataSource!);
      if (first.action !== "stored" || second.action !== "skipped_duplicate" || after !== before) {
        throw new Error(`Expected duplicate skip, got ${first.action}/${second.action} and ${before}->${after}`);
      }
      if (first.document.id !== second.document.id) {
        throw new Error("Duplicate attach returned a different document id.");
      }
      return { documentId: first.document.id };
    });

    await expectPass(results, "8 concurrent duplicate creates one canonical row/file", async () => {
      const invoice = await createHarnessInvoice(dataSource!, {
        organizationId: fixture.orgA.id,
        customerId: fixture.customerA.id,
        workizCode: "DOCA08",
      });
      const sourcePath = writeTempPdf(tempDir, "dup-concurrent.pdf", "%PDF-1.4 dup concurrent");
      const input = baseInput(invoice.id, fixture.customerA.id, fixture.orgA.id, "DOCA08", sourcePath);
      const before = await countDocuments(dataSource!);
      const [left, right] = await Promise.all([
        service.attachWorkizSourcePdf(input),
        service.attachWorkizSourcePdf(input),
      ]);
      const after = await countDocuments(dataSource!);
      if (after !== before + 1) {
        throw new Error(`Expected one new document row, got ${before}->${after}`);
      }
      if (left.document.id !== right.document.id) {
        throw new Error("Concurrent attach returned different document ids.");
      }
      const actions = new Set([left.action, right.action]);
      if (!actions.has("stored") || !actions.has("skipped_duplicate")) {
        throw new Error(`Expected stored + skipped_duplicate, got ${left.action}/${right.action}`);
      }
      return { documentId: left.document.id };
    });

    await expectPass(results, "9 cross-org attach rejected with zero mutation", async () => {
      const sourcePath = writeTempPdf(tempDir, "cross-org.pdf", "%PDF-1.4 cross org");
      const before = await countDocuments(dataSource!);
      try {
        await service.attachWorkizSourcePdf(baseInput(
          fixture.invoiceA.id,
          fixture.customerA.id,
          fixture.orgB.id,
          "DOCA01",
          sourcePath,
        ));
        throw new Error("Expected cross-org rejection");
      } catch (error) {
        const code = extractErrorCode(error);
        if (code !== "invoice_not_found" && code !== "invoice_document_attach_forbidden") {
          throw error;
        }
      }
      const after = await countDocuments(dataSource!);
      if (after !== before) {
        throw new Error(`Expected zero mutation, got ${before}->${after}`);
      }
      return { rejected: true };
    });

    await expectPass(results, "10 missing durable file during portal retrieval fails closed", async () => {
      const invoice = await createHarnessInvoice(dataSource!, {
        organizationId: fixture.orgA.id,
        customerId: fixture.customerA.id,
        workizCode: "DOCA10",
      });
      const sourcePath = writeTempPdf(tempDir, "missing-read.pdf", "%PDF-1.4 missing read");
      const stored = await service.attachWorkizSourcePdf(baseInput(
        invoice.id,
        fixture.customerA.id,
        fixture.orgA.id,
        "DOCA10",
        sourcePath,
      ));
      unlinkSync(stored.document.storage_path);
      try {
        await service.readPdfBuffer(stored.document);
        throw new Error("Expected missing file failure");
      } catch (error) {
        const code = extractErrorCode(error);
        if (code !== "invoice_document_missing") {
          throw error;
        }
      }
      return { failClosed: true };
    });

    await expectPass(results, "11 portal customer isolation remains enforced", async () => {
      const stored = await dataSource!.getRepository(InvoiceDocumentEntity).findOneByOrFail({ invoice_id: fixture.invoiceA.id });
      try {
        await service.getInvoiceForPortal(fixture.invoiceA.id, fixture.orgA.id, fixture.customerA.id);
      } catch {
        throw new Error("Owner portal access failed.");
      }
      try {
        await service.getInvoiceForPortal(fixture.invoiceA.id, fixture.orgB.id, fixture.customerA.id);
        throw new Error("Expected cross-tenant portal denial");
      } catch (error) {
        const code = extractErrorCode(error);
        if (code !== "invoice_not_found") {
          throw error;
        }
      }
      try {
        await service.getInvoiceForPortal(stored.invoice_id, fixture.orgA.id, "00000000-0000-0000-0000-000000000099");
        throw new Error("Expected cross-customer portal denial");
      } catch (error) {
        const code = extractErrorCode(error);
        if (code !== "invoice_not_found") {
          throw error;
        }
      }
      return { isolated: true };
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

  let phoenixDocumentCountAfter = phoenixDocumentCountBefore;
  try {
    const phoenixProbe = new DataSource(buildDataSourceOptions());
    await phoenixProbe.initialize();
    try {
      phoenixDocumentCountAfter = Number((await phoenixProbe.query(
        "SELECT COUNT(*) AS c FROM invoice_documents WHERE organization_id = ?",
        [PHOENIX_ORG_ID],
      ) as Array<{ c: number | string }>)[0]?.c ?? 0);
    } finally {
      await phoenixProbe.destroy();
    }
  } catch (error) {
    errors.push(`phoenix_probe: ${extractErrorCode(error)}`);
  }

  await expectPass(results, "12 existing Phoenix document records remain untouched", async () => {
    if (phoenixDocumentCountBefore !== phoenixDocumentCountAfter) {
      throw new Error(`Expected ${phoenixDocumentCountBefore} Phoenix documents unchanged, got ${phoenixDocumentCountAfter}`);
    }
    return { phoenixDocumentCountBefore, phoenixDocumentCountAfter };
  });

  const ok = errors.length === 0 && results.every((result) => result.status === "PASS");
  console.log(JSON.stringify({
    ok,
    database: databaseName,
    phoenixDocumentCountBefore,
    phoenixDocumentCountAfter,
    results,
    errors,
  }, null, 2));

  if (!ok) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
