import "dotenv/config";
import "reflect-metadata";

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

import { DataSource } from "typeorm";

import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import type { WorkizPdfNormalizedInvoice } from "./workiz/workiz-invoice-pdf-normalizer";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "./workiz/workiz-invoice-upsert";
import {
  assertWorkizProductionMutationAllowed,
  buildWorkizMutationGuardContext,
  PHOENIX_ORG_ID,
  PHOENIX_ORG_SLUG,
} from "./workiz/workiz-production-mutation-guard";
import { runWorkizPdfEnrichmentWrite } from "./workiz-invoice-pdf-enrichment-write";

type Snapshot = {
  import_source?: string;
  enrichment_status?: string;
  workiz_invoice_code?: string;
  pdf_enrichment?: {
    source_pdf_hash?: string;
    service_summary?: unknown[];
    warranty?: unknown;
    operational_line_items?: unknown[];
  };
};

function loadExtractions(extractionsDir: string): Map<string, WorkizPdfNormalizedInvoice> {
  const map = new Map<string, WorkizPdfNormalizedInvoice>();
  if (!existsSync(extractionsDir)) return map;
  for (const file of readdirSync(extractionsDir).filter((name) => name.endsWith(".json"))) {
    const payload = JSON.parse(readFileSync(join(extractionsDir, file), "utf8")) as WorkizPdfNormalizedInvoice;
    if (payload.invoice_number) map.set(payload.invoice_number, payload);
  }
  return map;
}

export async function runWorkizPdfEnrichmentVerify(options?: {
  secondRun?: boolean;
  allowProductionMutation?: boolean;
}): Promise<Record<string, unknown>> {
  const batchDir = join(process.cwd(), "_runtime_harness", "workiz-invoice-pdf-batch1");
  const extractionsDir = join(batchDir, "extractions");
  const extractions = loadExtractions(extractionsDir);

  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();

  try {
    const org = await ds.getRepository(OrganizationEntity).findOne({ where: { id: PHOENIX_ORG_ID } });
    if (!org || org.slug !== PHOENIX_ORG_SLUG) {
      throw new Error("Phoenix org verification failed");
    }

    const invoices = await ds.getRepository(InvoiceEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
    const enrichedInvoices = invoices.filter((invoice) => {
      if (!invoice.branding_snapshot_json) return false;
      try {
        const snapshot = JSON.parse(invoice.branding_snapshot_json) as Snapshot;
        return snapshot.import_source === WORKIZ_HISTORICAL_IMPORT_SOURCE
          && snapshot.enrichment_status === "complete";
      } catch {
        return false;
      }
    });

    const foreignWrites = await ds.getRepository(InvoiceEntity)
      .createQueryBuilder("invoice")
      .where("invoice.organization_id <> :organizationId", { organizationId: PHOENIX_ORG_ID })
      .andWhere("invoice.branding_snapshot_json LIKE :marker", { marker: '%"enrichment_status":"complete"%' })
      .getCount();

    const customersBefore = await ds.getRepository(CustomerEntity).count({ where: { organization_id: PHOENIX_ORG_ID } });
    const jobsBefore = await ds.getRepository(JobEntity).count({ where: { organization_id: PHOENIX_ORG_ID } });
    const invoicesBefore = invoices.length;

    let financialValuesModified = 0;
    let withLineItems = 0;
    let withServiceSummary = 0;
    let withWarranty = 0;
    let withOperationalData = 0;

    for (const invoice of enrichedInvoices) {
      const snapshot = JSON.parse(invoice.branding_snapshot_json!) as Snapshot;
      const pdf = snapshot.pdf_enrichment;
      if (pdf?.service_summary && pdf.service_summary.length > 0) withServiceSummary += 1;
      if (pdf?.warranty) withWarranty += 1;
      if (pdf?.operational_line_items && pdf.operational_line_items.length > 0) withOperationalData += 1;

      const lineCount = await ds.getRepository(InvoiceLineItemEntity).count({ where: { invoice_id: invoice.id } });
      if (lineCount > 0) withLineItems += 1;

      const source = extractions.get(snapshot.workiz_invoice_code ?? "");
      if (source && source.financials.total_cents != null && source.financials.total_cents !== invoice.total_cents) {
        financialValuesModified += 1;
      }
    }

    const sampleCodes = enrichedInvoices
      .map((invoice) => {
        try {
          return JSON.parse(invoice.branding_snapshot_json!) as Snapshot;
        } catch {
          return null;
        }
      })
      .filter((snapshot): snapshot is Snapshot => snapshot != null && Boolean(snapshot.workiz_invoice_code))
      .map((snapshot) => snapshot.workiz_invoice_code!)
      .slice(0, 10);

    const sampleChecks: Array<Record<string, unknown>> = [];
    for (const code of sampleCodes) {
      const invoice = enrichedInvoices.find((row) => {
        const snapshot = JSON.parse(row.branding_snapshot_json!) as Snapshot;
        return snapshot.workiz_invoice_code === code;
      });
      const source = extractions.get(code);
      if (!invoice || !source) continue;

      const snapshot = JSON.parse(invoice.branding_snapshot_json!) as Snapshot;
      sampleChecks.push({
        invoiceCode: code,
        dbTotalCents: invoice.total_cents,
        pdfTotalCents: source.financials.total_cents,
        totalsMatchPdf: invoice.total_cents === source.financials.total_cents,
        enrichmentStatus: snapshot.enrichment_status,
        pdfHashMatch: snapshot.pdf_enrichment?.source_pdf_hash === source.extraction_meta.file_hash,
        pdfLineItemCount: source.line_items.length,
        dbLineItemCount: await ds.getRepository(InvoiceLineItemEntity).count({ where: { invoice_id: invoice.id } }),
        serviceSummaryBlocks: source.service_summary.length,
        warrantyPresent: source.warranty != null,
      });
    }

    let secondRunChanges = 0;
    if (options?.secondRun) {
      assertWorkizProductionMutationAllowed(buildWorkizMutationGuardContext({
        dataSourceOptions: ds.options as import("typeorm/driver/mysql/MysqlConnectionOptions").MysqlConnectionOptions,
        organizationId: PHOENIX_ORG_ID,
        organizationSlug: PHOENIX_ORG_SLUG,
        allowProductionMutation: options.allowProductionMutation,
        commandLabel: "workiz-invoice-pdf-enrichment-verify",
      }));

      const beforeEnriched = enrichedInvoices.length;
      const secondReport = await runWorkizPdfEnrichmentWrite();
      secondRunChanges = secondReport.enriched;
      if (secondReport.enriched !== 0) {
        throw new Error(`Second run created ${secondReport.enriched} new enrichments`);
      }
      void beforeEnriched;
    }

    const customersAfter = await ds.getRepository(CustomerEntity).count({ where: { organization_id: PHOENIX_ORG_ID } });
    const jobsAfter = await ds.getRepository(JobEntity).count({ where: { organization_id: PHOENIX_ORG_ID } });
    const invoicesAfter = await ds.getRepository(InvoiceEntity).count({ where: { organization_id: PHOENIX_ORG_ID } });

    const report = {
      ok: financialValuesModified === 0 && foreignWrites === 0,
      enrichedInvoices: enrichedInvoices.length,
      withLineItems,
      withServiceSummary,
      withWarranty,
      withOperationalData,
      financialValuesModified,
      newInvoicesCreated: invoicesAfter - invoicesBefore,
      newCustomersCreated: customersAfter - customersBefore,
      newJobsCreated: jobsAfter - jobsBefore,
      crossTenantWrites: foreignWrites,
      secondRunChanges,
      sampleChecks,
      phoenixOrganizationId: PHOENIX_ORG_ID,
    };

    return report;
  } finally {
    await ds.destroy();
  }
}

async function main() {
  const secondRun = process.argv.includes("--second-run");
  const report = await runWorkizPdfEnrichmentVerify({ secondRun });
  console.log("ENRICHED INVOICES:", report.enrichedInvoices);
  console.log("INVOICES WITH LINE ITEMS:", report.withLineItems);
  console.log("INVOICES WITH SERVICE SUMMARY:", report.withServiceSummary);
  console.log("INVOICES WITH WARRANTY:", report.withWarranty);
  console.log("INVOICES WITH OPERATIONAL DATA:", report.withOperationalData);
  console.log("FINANCIAL VALUES MODIFIED:", report.financialValuesModified);
  console.log("NEW INVOICES CREATED:", report.newInvoicesCreated);
  console.log("NEW CUSTOMERS CREATED:", report.newCustomersCreated);
  console.log("CROSS-TENANT WRITES:", report.crossTenantWrites);
  console.log("SECOND RUN CHANGES:", report.secondRunChanges);
  console.log("\nSAMPLE CHECKS:");
  console.log(JSON.stringify(report.sampleChecks, null, 2));
  console.log("\nFULL VERIFY REPORT:");
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
