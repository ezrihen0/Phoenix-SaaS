import "dotenv/config";
import "reflect-metadata";

import { createHash, randomUUID } from "crypto";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

const pdf = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;
import { DataSource, In, Like } from "typeorm";

import {
  inferServiceType,
  mapPaymentMethod,
  normalizeEmail,
  normalizePhone,
  parseWorkizInvoiceText,
  type WorkizParsedCustomer,
  type WorkizParsedInvoice,
} from "./workiz/workiz-invoice-parser";
import { mapServiceTypeToDefaultJobType } from "../crm/constants";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";

const DEFAULT_SOURCE_DIR = "C:\\Projects\\workiz invoices";
const PHOENIX_SLUG = "phoenix";
const IMPORT_SOURCE = "workiz_historical_import";

export type WorkizImportReport = {
  mode: "dry-run" | "execute";
  sourceDirectory: string;
  phoenixOrganizationId: string;
  phoenixOrganizationName: string;
  filesDiscovered: number;
  filesParsed: number;
  filesRejected: number;
  filesFailed: number;
  customersMatched: number;
  customersToCreate: number;
  jobsToCreate: number;
  invoicesToCreate: number;
  lineItemsToCreate: number;
  paymentsToCreate: number;
  duplicatesDetected: number;
  importedInvoices: number;
  skippedInvoices: number;
  totalHistoricalInvoiceValueCents: number;
  totalPaymentsCents: number;
  totalOutstandingBalanceCents: number;
  reconciliationProblems: string[];
  ambiguousRecords: string[];
  rejectedFiles: Array<{ file: string; reason: string }>;
  failedFiles: Array<{ file: string; error: string }>;
  invoicesContainingEmail: number;
  invoicesWithoutEmail: number;
  invalidEmails: Array<{ invoiceCode: string; rawValue: string }>;
  customersUpdatedWithEmail: number;
  customersAlreadyHadSameEmail: number;
  emailConflicts: Array<{
    invoiceCode: string;
    customerId: string;
    customerName: string;
    existingEmail: string;
    sourceEmail: string;
  }>;
  duplicateRecordsCreated: number;
};

type ExistingImportIndex = Map<string, {
  invoiceId: string;
  jobId: string;
  invoiceCode: string;
}>;

type CustomerMatchResult =
  | { kind: "matched"; customerId: string; strategy: string }
  | { kind: "create"; customerKey: string };

function buildProvenanceSnapshot(parsed: WorkizParsedInvoice, importedAt: string) {
  return JSON.stringify({
    import_source: IMPORT_SOURCE,
    workiz_invoice_code: parsed.invoiceCode,
    workiz_file_number: parsed.workizFileNumber,
    source_filename: parsed.sourceFile,
    source_path: parsed.sourcePath,
    imported_at: importedAt,
    parse_warnings: parsed.parseWarnings,
  });
}

function customerExternalKey(customer: WorkizParsedCustomer): string {
  if (customer.email) return `workiz:email:${normalizeEmail(customer.email)}`;
  const phoneDigits = customer.phone.replace(/\D/g, "");
  if (phoneDigits.length >= 10 && phoneDigits !== "0000000000") {
    return `workiz:phone:${phoneDigits}`;
  }
  const hash = createHash("sha1")
    .update(`${customer.name}|${customer.addressLine1}|${customer.postalCode}`.toLowerCase())
    .digest("hex")
    .slice(0, 16);
  return `workiz:name:${hash}`;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function resolvePhoenixOrganization(dataSource: DataSource) {
  const repo = dataSource.getRepository(OrganizationEntity);
  const bySlug = await repo.findOne({ where: { slug: PHOENIX_SLUG } });
  if (bySlug) return bySlug;

  const candidates = await repo
    .createQueryBuilder("organization")
    .where("LOWER(organization.name) LIKE :name", { name: "%phoenix%" })
    .andWhere("LOWER(organization.name) LIKE :fireplace", { fireplace: "%fireplace%" })
    .getMany();

  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new Error(`Multiple Phoenix Fireplace organizations found: ${candidates.map((org) => org.id).join(", ")}`);
  }

  throw new Error("Phoenix Fireplace organization could not be resolved from the database.");
}

async function loadExistingImportIndex(
  dataSource: DataSource,
  organizationId: string,
): Promise<ExistingImportIndex> {
  const invoices = await dataSource.getRepository(InvoiceEntity).find({
    where: {
      organization_id: organizationId,
    },
  });

  const index: ExistingImportIndex = new Map();
  for (const invoice of invoices) {
    if (!invoice.branding_snapshot_json) continue;
    try {
      const snapshot = JSON.parse(invoice.branding_snapshot_json) as {
        import_source?: string;
        workiz_invoice_code?: string;
      };
      if (snapshot.import_source !== IMPORT_SOURCE || !snapshot.workiz_invoice_code) continue;
      index.set(snapshot.workiz_invoice_code, {
        invoiceId: invoice.id,
        jobId: invoice.job_id,
        invoiceCode: snapshot.workiz_invoice_code,
      });
    } catch {
      // ignore malformed snapshots
    }
  }

  return index;
}

function customerEmailIsEmpty(email: string | null | undefined): boolean {
  return !email || !email.trim();
}

function emailsMatch(existing: string | null | undefined, source: string | null): boolean {
  const normalizedExisting = normalizeEmail(existing);
  const normalizedSource = normalizeEmail(source);
  return Boolean(normalizedExisting && normalizedSource && normalizedExisting === normalizedSource);
}

async function resolveImportedCustomer(
  dataSource: DataSource,
  organizationId: string,
  jobId: string,
): Promise<CustomerEntity | null> {
  const job = await dataSource.getRepository(JobEntity).findOne({
    where: { id: jobId, organization_id: organizationId },
  });
  if (!job) return null;

  return dataSource.getRepository(CustomerEntity).findOne({
    where: { id: job.customer_id, organization_id: organizationId },
  });
}

type CustomerEmailSyncResult =
  | { kind: "updated"; customerId: string; email: string }
  | { kind: "already_set"; customerId: string; email: string }
  | { kind: "conflict"; customerId: string; customerName: string; existingEmail: string; sourceEmail: string }
  | { kind: "no_source_email" }
  | { kind: "invalid_source_email"; rawValue: string };

async function syncCustomerEmailFromInvoice(input: {
  dataSource: DataSource;
  organizationId: string;
  customer: CustomerEntity;
  parsedCustomer: WorkizParsedCustomer;
  invoiceCode: string;
  execute: boolean;
}): Promise<CustomerEmailSyncResult> {
  const sourceEmail = normalizeEmail(input.parsedCustomer.email);
  if (!input.parsedCustomer.email) {
    return { kind: "no_source_email" };
  }
  if (!sourceEmail) {
    return { kind: "invalid_source_email", rawValue: input.parsedCustomer.email };
  }

  if (customerEmailIsEmpty(input.customer.email)) {
    if (!input.execute) {
      return { kind: "updated", customerId: input.customer.id, email: sourceEmail };
    }

    await input.dataSource.getRepository(CustomerEntity).update(
      { id: input.customer.id, organization_id: input.organizationId },
      { email: sourceEmail },
    );
    return { kind: "updated", customerId: input.customer.id, email: sourceEmail };
  }

  if (emailsMatch(input.customer.email, sourceEmail)) {
    return { kind: "already_set", customerId: input.customer.id, email: sourceEmail };
  }

  return {
    kind: "conflict",
    customerId: input.customer.id,
    customerName: input.customer.full_name,
    existingEmail: input.customer.email ?? "",
    sourceEmail,
  };
}

function recordEmailSyncOutcome(
  report: WorkizImportReport,
  invoiceCode: string,
  outcome: CustomerEmailSyncResult,
) {
  switch (outcome.kind) {
    case "updated":
      report.customersUpdatedWithEmail += 1;
      break;
    case "already_set":
      report.customersAlreadyHadSameEmail += 1;
      break;
    case "conflict":
      report.emailConflicts.push({
        invoiceCode,
        customerId: outcome.customerId,
        customerName: outcome.customerName,
        existingEmail: outcome.existingEmail,
        sourceEmail: outcome.sourceEmail,
      });
      break;
    case "invalid_source_email":
      report.invalidEmails.push({ invoiceCode, rawValue: outcome.rawValue });
      break;
    default:
      break;
  }
}

function trackParsedInvoiceEmail(
  report: WorkizImportReport,
  record: WorkizParsedInvoice,
) {
  if (!record.invoiceCode || !record.customer) return;

  if (normalizeEmail(record.customer.email)) {
    report.invoicesContainingEmail += 1;
    return;
  }

  if (record.customer.email) {
    report.invalidEmails.push({
      invoiceCode: record.invoiceCode,
      rawValue: record.customer.email,
    });
    return;
  }

  report.invoicesWithoutEmail += 1;
}

async function matchCustomer(
  dataSource: DataSource,
  organizationId: string,
  parsedCustomer: WorkizParsedCustomer,
): Promise<CustomerMatchResult> {
  const repo = dataSource.getRepository(CustomerEntity);
  const externalKey = customerExternalKey(parsedCustomer);

  const byExternal = await repo.findOne({
    where: {
      organization_id: organizationId,
      external_client_number: externalKey,
    },
  });
  if (byExternal) {
    return { kind: "matched", customerId: byExternal.id, strategy: "external_client_number" };
  }

  if (parsedCustomer.email) {
    const normalizedEmail = normalizeEmail(parsedCustomer.email);
    if (normalizedEmail) {
      const byEmail = await repo.findOne({
        where: {
          organization_id: organizationId,
          email: normalizedEmail,
        },
      });
      if (byEmail) {
        return { kind: "matched", customerId: byEmail.id, strategy: "email" };
      }
    }
  }

  const phoneDigits = parsedCustomer.phone.replace(/\D/g, "");
  if (phoneDigits.length >= 10 && phoneDigits !== "0000000000") {
    const phoneCandidates = await repo.find({
      where: { organization_id: organizationId },
    });
    const phoneMatch = phoneCandidates.find((customer) => customer.phone.replace(/\D/g, "") === phoneDigits);
    if (phoneMatch) {
      return { kind: "matched", customerId: phoneMatch.id, strategy: "phone" };
    }
  }

  const normalizedName = normalizeName(parsedCustomer.name);
  const postal = parsedCustomer.postalCode.trim().toUpperCase();
  if (normalizedName && postal) {
    const namePostalCandidates = await repo.find({
      where: {
        organization_id: organizationId,
        service_postal_code: postal,
      },
    });
    const exactName = namePostalCandidates.find(
      (customer) => normalizeName(customer.full_name) === normalizedName,
    );
    if (exactName) {
      return { kind: "matched", customerId: exactName.id, strategy: "name_postal" };
    }
  }

  return { kind: "create", customerKey: externalKey };
}

async function parseSourceDirectory(sourceDir: string): Promise<{
  parsed: WorkizParsedInvoice[];
  rejected: Array<{ file: string; reason: string }>;
  failed: Array<{ file: string; error: string }>;
}> {
  const parsed: WorkizParsedInvoice[] = [];
  const rejected: Array<{ file: string; reason: string }> = [];
  const failed: Array<{ file: string; error: string }> = [];

  const files = readdirSync(sourceDir)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort();

  for (const file of files) {
    const sourcePath = join(sourceDir, file);
    try {
      const buffer = readFileSync(sourcePath);
      const pdfData = await pdf(buffer);
      const record = parseWorkizInvoiceText({
        text: pdfData.text,
        sourceFile: file,
        sourcePath,
      });

      if (record.parseErrors.length > 0 || !record.invoiceCode || !record.customer) {
        rejected.push({
          file,
          reason: record.parseErrors.join(", ") || "missing_required_fields",
        });
        continue;
      }

      if (record.totalCents == null) {
        record.parseWarnings.push("missing_total");
      }

      parsed.push(record);
    } catch (error) {
      failed.push({
        file,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { parsed, rejected, failed };
}

async function upsertImportedInvoice(input: {
  dataSource: DataSource;
  organizationId: string;
  parsed: WorkizParsedInvoice;
  customerId: string;
  existing?: { invoiceId: string; jobId: string };
  importedAt: string;
}): Promise<{ jobId: string; invoiceId: string; created: boolean }> {
  const jobRepo = input.dataSource.getRepository(JobEntity);
  const invoiceRepo = input.dataSource.getRepository(InvoiceEntity);
  const lineItemRepo = input.dataSource.getRepository(InvoiceLineItemEntity);
  const paymentRepo = input.dataSource.getRepository(InvoicePaymentEntity);

  const customer = await input.dataSource.getRepository(CustomerEntity).findOneOrFail({
    where: { id: input.customerId, organization_id: input.organizationId },
  });

  const primaryDescription = input.parsed.lineItems[0]?.description ?? "Historical service";
  const serviceType = inferServiceType(primaryDescription);
  const invoiceDate = input.parsed.invoiceDate ?? input.parsed.dueDate ?? new Date("2020-01-01");
  const paid = (input.parsed.balanceDueCents ?? 0) <= 0
    && (input.parsed.payments.length > 0 || input.parsed.headerBalanceCents === 0);
  const lastPayment = input.parsed.payments[input.parsed.payments.length - 1];
  const paidAt = paid ? (lastPayment?.occurredAt ?? invoiceDate) : null;
  const totalCents = input.parsed.totalCents
    ?? input.parsed.subtotalCents
    ?? input.parsed.lineItems.reduce((sum, item) => sum + item.amountCents, 0);

  let jobId = input.existing?.jobId;
  if (!jobId) {
    const job = await jobRepo.save(jobRepo.create({
      id: randomUUID(),
      organization_id: input.organizationId,
      customer_id: customer.id,
      service_id: null,
      assigned_technician_id: null,
      title: `Workiz ${input.parsed.invoiceCode} — ${customer.full_name}`,
      description: [
        `Imported from Workiz historical invoice ${input.parsed.invoiceCode}.`,
        input.parsed.notes ? `Notes: ${input.parsed.notes}` : null,
      ].filter(Boolean).join("\n"),
      lead_source: "repeat_customer",
      requested_service_type: serviceType,
      job_type: mapServiceTypeToDefaultJobType(serviceType),
      status: paid ? "paid" : "completed",
      service_address_line_1: customer.service_address_line_1,
      service_address_line_2: customer.service_address_line_2,
      service_city: customer.service_city,
      service_state_or_region: customer.service_state_or_region,
      service_postal_code: customer.service_postal_code,
      scheduled_for: invoiceDate,
      scheduled_window: null,
      requested_at: invoiceDate,
      completed_at: invoiceDate,
      paid_at: paidAt,
      created_by_auth_user_id: null,
      updated_by_auth_user_id: null,
    }));
    jobId = job.id;
  } else {
    await jobRepo.update({ id: jobId, organization_id: input.organizationId }, {
      status: paid ? "paid" : "completed",
      completed_at: invoiceDate,
      paid_at: paidAt,
      scheduled_for: invoiceDate,
      requested_at: invoiceDate,
    });
  }

  const subtotalCents = input.parsed.subtotalCents
    ?? input.parsed.lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  const taxCents = input.parsed.taxCents ?? 0;
  const taxRateBps = input.parsed.taxRateBps ?? 0;

  let invoiceId = input.existing?.invoiceId;
  if (!invoiceId) {
    const invoice = await invoiceRepo.save(invoiceRepo.create({
      id: randomUUID(),
      job_id: jobId,
      organization_id: input.organizationId,
      description: `Workiz Invoice #${input.parsed.invoiceCode}`,
      amount_cents: totalCents,
      subtotal_cents: subtotalCents,
      tax_rate_bps_snapshot: taxRateBps,
      tax_cents: taxCents,
      total_cents: totalCents,
      status: paid ? "paid" : "unpaid",
      issued_at: invoiceDate,
      due_at: input.parsed.dueDate ?? invoiceDate,
      paid_at: paidAt,
      branding_snapshot_json: buildProvenanceSnapshot(input.parsed, input.importedAt),
    }));
    invoiceId = invoice.id;
  } else {
    await invoiceRepo.update({ id: invoiceId, organization_id: input.organizationId }, {
      description: `Workiz Invoice #${input.parsed.invoiceCode}`,
      amount_cents: totalCents,
      subtotal_cents: subtotalCents,
      tax_rate_bps_snapshot: taxRateBps,
      tax_cents: taxCents,
      total_cents: totalCents,
      status: paid ? "paid" : "unpaid",
      issued_at: invoiceDate,
      due_at: input.parsed.dueDate ?? invoiceDate,
      paid_at: paidAt,
      branding_snapshot_json: buildProvenanceSnapshot(input.parsed, input.importedAt),
    });
  }

  const existingLineItems = await lineItemRepo.find({ where: { invoice_id: invoiceId } });
  if (existingLineItems.length === 0) {
    await lineItemRepo.save(
      input.parsed.lineItems.map((lineItem, index) => lineItemRepo.create({
        id: randomUUID(),
        invoice_id: invoiceId!,
        pricebook_item_id: null,
        document_line_key: `workiz:${input.parsed.invoiceCode}:line:${index + 1}`,
        sku_snapshot: `WORKIZ-${input.parsed.invoiceCode}-${index + 1}`,
        name_snapshot: lineItem.description.slice(0, 255),
        description_snapshot: lineItem.description,
        item_type_snapshot: "service",
        unit_of_measure_snapshot: "each",
        unit_price_cents_snapshot: lineItem.unitPriceCents,
        quantity: String(lineItem.quantity),
        line_subtotal_cents: lineItem.amountCents,
        sort_order: index,
      })),
    );
  }

  for (let index = 0; index < input.parsed.payments.length; index += 1) {
    const payment = input.parsed.payments[index];
    const reference = `workiz:${input.parsed.invoiceCode}:payment:${index + 1}`;
    const existingPayment = await paymentRepo.findOne({
      where: {
        invoice_id: invoiceId,
        reference,
        organization_id: input.organizationId,
      },
    });
    if (existingPayment) continue;

    await paymentRepo.save(paymentRepo.create({
      id: randomUUID(),
      organization_id: input.organizationId,
      invoice_id: invoiceId!,
      entry_type: "payment",
      amount_cents: payment.amountCents,
      method: mapPaymentMethod(payment.methodLabel),
      reference,
      note: `Workiz import: ${payment.methodLabel}`,
      occurred_at: payment.occurredAt ?? invoiceDate,
      created_by_auth_user_id: null,
    }));
  }

  return {
    jobId: jobId!,
    invoiceId: invoiceId!,
    created: !input.existing,
  };
}

export async function runWorkizInvoiceImport(options: {
  sourceDir?: string;
  execute: boolean;
}): Promise<WorkizImportReport> {
  const sourceDirectory = options.sourceDir ?? process.env.WORKIZ_INVOICE_SOURCE_DIR ?? DEFAULT_SOURCE_DIR;
  if (!existsSync(sourceDirectory)) {
    throw new Error(`Workiz source directory not found: ${sourceDirectory}`);
  }

  const report: WorkizImportReport = {
    mode: options.execute ? "execute" : "dry-run",
    sourceDirectory,
    phoenixOrganizationId: "",
    phoenixOrganizationName: "",
    filesDiscovered: 0,
    filesParsed: 0,
    filesRejected: 0,
    filesFailed: 0,
    customersMatched: 0,
    customersToCreate: 0,
    jobsToCreate: 0,
    invoicesToCreate: 0,
    lineItemsToCreate: 0,
    paymentsToCreate: 0,
    duplicatesDetected: 0,
    importedInvoices: 0,
    skippedInvoices: 0,
    totalHistoricalInvoiceValueCents: 0,
    totalPaymentsCents: 0,
    totalOutstandingBalanceCents: 0,
    reconciliationProblems: [],
    ambiguousRecords: [],
    rejectedFiles: [],
    failedFiles: [],
    invoicesContainingEmail: 0,
    invoicesWithoutEmail: 0,
    invalidEmails: [],
    customersUpdatedWithEmail: 0,
    customersAlreadyHadSameEmail: 0,
    emailConflicts: [],
    duplicateRecordsCreated: 0,
  };

  const { parsed, rejected, failed } = await parseSourceDirectory(sourceDirectory);
  report.filesDiscovered = parsed.length + rejected.length + failed.length;
  report.filesParsed = parsed.length;
  report.filesRejected = rejected.length;
  report.filesFailed = failed.length;
  report.rejectedFiles = rejected;
  report.failedFiles = failed;

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const phoenix = await resolvePhoenixOrganization(dataSource);
    report.phoenixOrganizationId = phoenix.id;
    report.phoenixOrganizationName = phoenix.name;

    const existingIndex = await loadExistingImportIndex(dataSource, phoenix.id);
    const importedAt = new Date().toISOString();
    const customerCache = new Map<string, string>();
    const matchedCustomerKeys = new Set<string>();
    const pendingCustomerKeys = new Map<string, WorkizParsedCustomer>();

    for (const record of parsed) {
      if (!record.invoiceCode || !record.customer) continue;

      trackParsedInvoiceEmail(report, record);

      const existingImport = existingIndex.get(record.invoiceCode);
      if (existingImport) {
        report.duplicatesDetected += 1;
        report.skippedInvoices += 1;

        const linkedCustomer = await resolveImportedCustomer(dataSource, phoenix.id, existingImport.jobId);
        if (linkedCustomer) {
          const emailOutcome = await syncCustomerEmailFromInvoice({
            dataSource,
            organizationId: phoenix.id,
            customer: linkedCustomer,
            parsedCustomer: record.customer,
            invoiceCode: record.invoiceCode,
            execute: options.execute,
          });
          recordEmailSyncOutcome(report, record.invoiceCode, emailOutcome);
        }
        continue;
      }

      for (const warning of record.parseWarnings) {
        if (warning.includes("mismatch")) {
          report.reconciliationProblems.push(`${record.invoiceCode}:${warning}`);
        } else {
          report.ambiguousRecords.push(`${record.invoiceCode}:${warning}`);
        }
      }

      const customerKey = customerExternalKey(record.customer);
      const match = await matchCustomer(dataSource, phoenix.id, record.customer);
      if (match.kind === "matched") {
        customerCache.set(customerKey, match.customerId);
        matchedCustomerKeys.add(customerKey);
        pendingCustomerKeys.delete(customerKey);
      } else if (!matchedCustomerKeys.has(customerKey)) {
        pendingCustomerKeys.set(customerKey, record.customer);
      }

      report.jobsToCreate += 1;
      report.invoicesToCreate += 1;
      report.lineItemsToCreate += record.lineItems.length;
      report.paymentsToCreate += record.payments.length;

      const totalCents = record.totalCents
        ?? record.subtotalCents
        ?? record.lineItems.reduce((sum, item) => sum + item.amountCents, 0);
      report.totalHistoricalInvoiceValueCents += totalCents;
      report.totalPaymentsCents += record.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
      report.totalOutstandingBalanceCents += record.balanceDueCents ?? 0;

      if (!options.execute) continue;

      let customerId = customerCache.get(customerKey);
      if (!customerId) {
        const pendingCustomer = pendingCustomerKeys.get(customerKey) ?? record.customer;
        const created = await dataSource.getRepository(CustomerEntity).save(
          dataSource.getRepository(CustomerEntity).create({
            id: randomUUID(),
            organization_id: phoenix.id,
            external_client_number: customerKey,
            full_name: pendingCustomer.name,
            email: normalizeEmail(pendingCustomer.email),
            company_name: null,
            service_address_line_1: pendingCustomer.addressLine1,
            service_address_line_2: pendingCustomer.addressLine2,
            service_city: pendingCustomer.city,
            service_state_or_region: pendingCustomer.province,
            service_postal_code: pendingCustomer.postalCode,
            phone: pendingCustomer.phone ? normalizePhone(pendingCustomer.phone) : "",
            legacy_created_at: record.invoiceDate,
            source: "repeat_customer",
            preferred_service_type: inferServiceType(record.lineItems[0]?.description ?? ""),
            notes: `Imported from Workiz (${IMPORT_SOURCE}).`,
          }),
        );
        customerId = created.id;
        customerCache.set(customerKey, customerId);
        if (normalizeEmail(pendingCustomer.email)) {
          report.customersUpdatedWithEmail += 1;
        }
      }

      const result = await upsertImportedInvoice({
        dataSource,
        organizationId: phoenix.id,
        parsed: record,
        customerId,
        importedAt,
      });

      existingIndex.set(record.invoiceCode, {
        invoiceId: result.invoiceId,
        jobId: result.jobId,
        invoiceCode: record.invoiceCode,
      });

      if (result.created) {
        report.importedInvoices += 1;
      } else {
        report.skippedInvoices += 1;
      }
    }

    report.customersMatched = matchedCustomerKeys.size;
    report.customersToCreate = pendingCustomerKeys.size;

    if (options.execute) {
      const foreignLeak = await dataSource.getRepository(InvoiceEntity).count({
        where: {
          branding_snapshot_json: Like(`%${IMPORT_SOURCE}%`),
        },
      });
      const phoenixImported = await dataSource.getRepository(InvoiceEntity)
        .createQueryBuilder("invoice")
        .where("invoice.organization_id = :organizationId", { organizationId: phoenix.id })
        .andWhere("invoice.branding_snapshot_json LIKE :source", { source: `%${IMPORT_SOURCE}%` })
        .getCount();
      if (foreignLeak !== phoenixImported) {
        throw new Error(`Organization isolation failure: ${foreignLeak - phoenixImported} imported invoices outside Phoenix.`);
      }
    }
  } finally {
    await dataSource.destroy();
  }

  return report;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const report = await runWorkizInvoiceImport({ execute });
  console.log(JSON.stringify(report, null, 2));

  if (report.filesFailed > 0 || report.filesRejected > 0) {
    process.exitCode = report.mode === "execute" ? 0 : 0;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
