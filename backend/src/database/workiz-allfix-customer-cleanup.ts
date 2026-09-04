import "dotenv/config";
import "reflect-metadata";

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { DataSource, EntityManager, In } from "typeorm";

import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceDocumentEntity } from "./entities/invoice-document.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { JobEntity } from "./entities/job.entity";
import { JobNoteEntity } from "./entities/job-note.entity";
import { JobStatusEventEntity } from "./entities/job-status-event.entity";
import { LeadEntity } from "./entities/lead.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { PortalMagicLinkEntity } from "./entities/portal-magic-link.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { WarrantyCertificateEntity } from "./entities/warranty-certificate.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import {
  excludedWorkizCustomerReason,
  isExcludedWorkizCustomerEmail,
} from "./workiz/workiz-customer-exclusion";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "./workiz/workiz-invoice-upsert";

const PHOENIX_ORG_ID = "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644";
const PHOENIX_ORG_SLUG = "phoenix-fireplace";

export type AllfixCustomerPreview = {
  customerId: string;
  fullName: string;
  email: string | null;
  phone: string;
  externalClientNumber: string | null;
  linkedInvoices: Array<{
    invoiceId: string;
    invoiceCode: string | null;
    jobId: string;
    totalCents: number;
    enrichmentStatus: string | null;
    workizHistorical: boolean;
  }>;
  linkedPdfDocuments: Array<{
    documentId: string;
    invoiceId: string;
    originalFilename: string;
    workizInvoiceCode: string | null;
  }>;
  linkedJobs: Array<{ jobId: string; title: string; status: string }>;
  linkedLeads: number;
  linkedEstimates: number;
  linkedWarrantyCertificates: number;
  linkedPayments: number;
  safeToRemove: boolean;
  blockReason: string | null;
};

export type AllfixCleanupReport = {
  mode: "preview" | "execute";
  generatedAt: string;
  phoenixOrganizationId: string;
  allfixRecordsFound: number;
  safelyRemoved: number;
  blockedFromRemoval: number;
  remainingAllfixCustomers: number;
  records: AllfixCustomerPreview[];
  removalResults: Array<{
    customerId: string;
    action: "removed" | "blocked" | "skipped";
    detail: string;
  }>;
};

function parseInvoiceSnapshot(invoice: InvoiceEntity): {
  workizHistorical: boolean;
  invoiceCode: string | null;
  enrichmentStatus: string | null;
  pdfCustomerEmail: string | null;
} {
  if (!invoice.branding_snapshot_json) {
    return { workizHistorical: false, invoiceCode: null, enrichmentStatus: null, pdfCustomerEmail: null };
  }
  try {
    const snapshot = JSON.parse(invoice.branding_snapshot_json) as {
      import_source?: string;
      workiz_invoice_code?: string;
      enrichment_status?: string;
      pdf_enrichment?: { customer?: { email?: string | null } };
    };
    return {
      workizHistorical: snapshot.import_source === WORKIZ_HISTORICAL_IMPORT_SOURCE,
      invoiceCode: snapshot.workiz_invoice_code ?? null,
      enrichmentStatus: snapshot.enrichment_status ?? null,
      pdfCustomerEmail: snapshot.pdf_enrichment?.customer?.email ?? null,
    };
  } catch {
    return { workizHistorical: false, invoiceCode: null, enrichmentStatus: null, pdfCustomerEmail: null };
  }
}

async function buildAllfixPreview(ds: DataSource): Promise<AllfixCustomerPreview[]> {
  const customers = await ds.getRepository(CustomerEntity).find({
    where: { organization_id: PHOENIX_ORG_ID },
  });
  const allfixCustomers = customers.filter((customer) => isExcludedWorkizCustomerEmail(customer.email));
  const allfixIds = new Set(allfixCustomers.map((customer) => customer.id));

  const jobs = await ds.getRepository(JobEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
  const invoices = await ds.getRepository(InvoiceEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
  const documents = await ds.getRepository(InvoiceDocumentEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
  const leads = await ds.getRepository(LeadEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
  const quotes = await ds.getRepository(QuoteEntity).find();
  const warranties = await ds.getRepository(WarrantyCertificateEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
  const payments = await ds.getRepository(InvoicePaymentEntity).find();

  const invoiceByJob = new Map(invoices.map((invoice) => [invoice.job_id, invoice]));
  const paymentsByInvoice = new Map<string, number>();
  for (const payment of payments) {
    paymentsByInvoice.set(payment.invoice_id, (paymentsByInvoice.get(payment.invoice_id) ?? 0) + 1);
  }

  const previews: AllfixCustomerPreview[] = [];

  for (const customer of allfixCustomers) {
    const customerJobs = jobs.filter((job) => job.customer_id === customer.id);
    const customerInvoices = customerJobs
      .map((job) => invoiceByJob.get(job.id))
      .filter((invoice): invoice is InvoiceEntity => invoice != null);

    const linkedInvoices = customerInvoices.map((invoice) => {
      const snapshot = parseInvoiceSnapshot(invoice);
      return {
        invoiceId: invoice.id,
        invoiceCode: snapshot.invoiceCode,
        jobId: invoice.job_id,
        totalCents: invoice.total_cents,
        enrichmentStatus: snapshot.enrichmentStatus,
        workizHistorical: snapshot.workizHistorical,
      };
    });

    const invoiceIds = new Set(customerInvoices.map((invoice) => invoice.id));
    const linkedPdfDocuments = documents
      .filter((document) => invoiceIds.has(document.invoice_id))
      .map((document) => ({
        documentId: document.id,
        invoiceId: document.invoice_id,
        originalFilename: document.original_filename,
        workizInvoiceCode: document.workiz_invoice_code,
      }));

    let blockReason: string | null = null;

    for (const invoice of customerInvoices) {
      const snapshot = parseInvoiceSnapshot(invoice);
      if (
        snapshot.pdfCustomerEmail
        && !isExcludedWorkizCustomerEmail(snapshot.pdfCustomerEmail)
        && snapshot.enrichmentStatus === "complete"
      ) {
        blockReason = `Invoice ${snapshot.invoiceCode ?? invoice.id} enriched with non-excluded PDF customer email ${snapshot.pdfCustomerEmail}`;
        break;
      }
    }

    if (!blockReason && customer.external_client_number) {
      const duplicateClient = customers.find(
        (other) => other.id !== customer.id
          && other.external_client_number === customer.external_client_number
          && !isExcludedWorkizCustomerEmail(other.email),
      );
      if (duplicateClient) {
        blockReason = `external_client_number ${customer.external_client_number} also belongs to non-excluded customer ${duplicateClient.full_name} (${duplicateClient.id})`;
      }
    }

    if (!blockReason) {
      for (const job of customerJobs) {
        const invoice = invoiceByJob.get(job.id);
        if (!invoice) continue;
        const jobCustomerId = job.customer_id;
        if (!allfixIds.has(jobCustomerId)) {
          blockReason = `Job ${job.id} customer_id is not an @allfix.ca record`;
          break;
        }
      }
    }

    previews.push({
      customerId: customer.id,
      fullName: customer.full_name,
      email: customer.email,
      phone: customer.phone,
      externalClientNumber: customer.external_client_number,
      linkedInvoices,
      linkedPdfDocuments,
      linkedJobs: customerJobs.map((job) => ({ jobId: job.id, title: job.title, status: job.status })),
      linkedLeads: leads.filter((lead) => lead.customer_id === customer.id).length,
      linkedEstimates: quotes.filter((quote) => customerJobs.some((job) => job.id === quote.job_id)).length,
      linkedWarrantyCertificates: warranties.filter((warranty) => warranty.customer_id === customer.id).length,
      linkedPayments: customerInvoices.reduce((sum, invoice) => sum + (paymentsByInvoice.get(invoice.id) ?? 0), 0),
      safeToRemove: blockReason == null,
      blockReason,
    });
  }

  return previews;
}

async function removeAllfixCustomer(manager: EntityManager, customerId: string): Promise<void> {
  const jobRepo = manager.getRepository(JobEntity);
  const invoiceRepo = manager.getRepository(InvoiceEntity);
  const lineItemRepo = manager.getRepository(InvoiceLineItemEntity);
  const paymentRepo = manager.getRepository(InvoicePaymentEntity);
  const documentRepo = manager.getRepository(InvoiceDocumentEntity);
  const quoteRepo = manager.getRepository(QuoteEntity);
  const noteRepo = manager.getRepository(JobNoteEntity);
  const statusRepo = manager.getRepository(JobStatusEventEntity);
  const leadRepo = manager.getRepository(LeadEntity);
  const warrantyRepo = manager.getRepository(WarrantyCertificateEntity);
  const magicLinkRepo = manager.getRepository(PortalMagicLinkEntity);
  const customerRepo = manager.getRepository(CustomerEntity);

  const jobs = await jobRepo.find({ where: { customer_id: customerId, organization_id: PHOENIX_ORG_ID } });
  const jobIds = jobs.map((job) => job.id);
  const invoices = jobIds.length > 0
    ? await invoiceRepo.find({ where: { job_id: In(jobIds) } })
    : [];
  const invoiceIds = invoices.map((invoice) => invoice.id);

  if (invoiceIds.length > 0) {
    await lineItemRepo.delete({ invoice_id: In(invoiceIds) });
    await paymentRepo.delete({ invoice_id: In(invoiceIds) });
    await documentRepo.delete({ invoice_id: In(invoiceIds) });
    await warrantyRepo.delete({ related_invoice_id: In(invoiceIds) });
    await invoiceRepo.delete({ id: In(invoiceIds) });
  }

  if (jobIds.length > 0) {
    await quoteRepo.delete({ job_id: In(jobIds) });
    await noteRepo.delete({ job_id: In(jobIds) });
    await statusRepo.delete({ job_id: In(jobIds) });
    await warrantyRepo.delete({ related_job_id: In(jobIds) });
    await jobRepo.delete({ id: In(jobIds) });
  }

  await warrantyRepo.delete({ customer_id: customerId });
  await magicLinkRepo.delete({ customer_id: customerId });
  await leadRepo.update({ customer_id: customerId }, { customer_id: null });
  await customerRepo.delete({ id: customerId, organization_id: PHOENIX_ORG_ID });
}

export async function runAllfixCustomerCleanup(options?: { execute?: boolean }): Promise<AllfixCleanupReport> {
  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();

  try {
    const org = await ds.getRepository(OrganizationEntity).findOne({ where: { id: PHOENIX_ORG_ID } });
    if (!org || org.slug !== PHOENIX_ORG_SLUG) {
      throw new Error(`Phoenix org verification failed for ${PHOENIX_ORG_ID}`);
    }

    const previews = await buildAllfixPreview(ds);
    const removalResults: AllfixCleanupReport["removalResults"] = [];
    let safelyRemoved = 0;
    let blockedFromRemoval = 0;

    if (options?.execute) {
      for (const preview of previews) {
        if (!preview.safeToRemove) {
          blockedFromRemoval += 1;
          removalResults.push({
            customerId: preview.customerId,
            action: "blocked",
            detail: preview.blockReason ?? "unsafe to remove",
          });
          continue;
        }

        await ds.transaction(async (manager) => {
          await removeAllfixCustomer(manager, preview.customerId);
        });
        safelyRemoved += 1;
        removalResults.push({
          customerId: preview.customerId,
          action: "removed",
          detail: excludedWorkizCustomerReason(preview.email),
        });
      }
    } else {
      for (const preview of previews) {
        removalResults.push({
          customerId: preview.customerId,
          action: preview.safeToRemove ? "skipped" : "blocked",
          detail: preview.safeToRemove
            ? "Preview only — pass --execute to remove"
            : (preview.blockReason ?? "unsafe to remove"),
        });
        if (!preview.safeToRemove) blockedFromRemoval += 1;
      }
    }

    const remaining = await ds.getRepository(CustomerEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
    const remainingAllfix = remaining.filter((customer) => isExcludedWorkizCustomerEmail(customer.email)).length;

    return {
      mode: options?.execute ? "execute" : "preview",
      generatedAt: new Date().toISOString(),
      phoenixOrganizationId: PHOENIX_ORG_ID,
      allfixRecordsFound: previews.length,
      safelyRemoved,
      blockedFromRemoval,
      remainingAllfixCustomers: remainingAllfix,
      records: previews,
      removalResults,
    };
  } finally {
    await ds.destroy();
  }
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const harnessRoot = join(process.cwd(), "_runtime_harness", "workiz-final-audit");
  mkdirSync(harnessRoot, { recursive: true });

  const report = await runAllfixCustomerCleanup({ execute });
  writeFileSync(join(harnessRoot, "excluded-allfix-customers.json"), JSON.stringify(report, null, 2));

  console.log("MODE:", report.mode);
  console.log("@allfix.ca RECORDS FOUND:", report.allfixRecordsFound);
  console.log("@allfix.ca SAFELY REMOVED:", report.safelyRemoved);
  console.log("@allfix.ca BLOCKED:", report.blockedFromRemoval);
  console.log("@allfix.ca REMAINING:", report.remainingAllfixCustomers);
  console.log("\nFULL REPORT written to _runtime_harness/workiz-final-audit/excluded-allfix-customers.json");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
