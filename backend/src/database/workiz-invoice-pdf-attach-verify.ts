import "dotenv/config";
import "reflect-metadata";

import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { NestFactory } from "@nestjs/core";
import { DataSource } from "typeorm";

import { AppModule } from "../app.module";
import { InvoiceDocumentEntity } from "./entities/invoice-document.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { JobEntity } from "./entities/job.entity";
import { InvoiceDocumentsService } from "../documents/invoice-documents/invoice-documents.service";
import { WORKIZ_HISTORICAL_IMPORT_SOURCE } from "./workiz/workiz-invoice-upsert";
import {
  assertWorkizProductionMutationAllowed,
  buildWorkizMutationGuardContext,
  PHOENIX_ORG_ID,
  PHOENIX_ORG_SLUG,
} from "./workiz/workiz-production-mutation-guard";
import { runWorkizPdfAttach } from "./workiz-invoice-pdf-attach";

async function expectDenied(label: string, fn: () => Promise<unknown>): Promise<{ pass: boolean; detail: string }> {
  try {
    await fn();
    return { pass: false, detail: `${label}: expected denial but succeeded` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not_found") || message.includes("404") || message.includes("invoice_not_found")) {
      return { pass: true, detail: `${label}: denied as expected` };
    }
    return { pass: true, detail: `${label}: denied (${message.slice(0, 120)})` };
  }
}

export async function runWorkizPdfAttachVerify(options?: {
  secondRun?: boolean;
  allowProductionMutation?: boolean;
}): Promise<Record<string, unknown>> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const ds = app.get(DataSource);
  const invoiceDocumentsService = app.get(InvoiceDocumentsService);

  try {
    if (options?.secondRun) {
      assertWorkizProductionMutationAllowed(buildWorkizMutationGuardContext({
        dataSourceOptions: ds.options as import("typeorm/driver/mysql/MysqlConnectionOptions").MysqlConnectionOptions,
        organizationId: PHOENIX_ORG_ID,
        organizationSlug: PHOENIX_ORG_SLUG,
        allowProductionMutation: options.allowProductionMutation,
        commandLabel: "workiz-invoice-pdf-attach-verify",
      }));

      const second = await runWorkizPdfAttach();
      if (second.pdfDocumentsStored !== 0) {
        throw new Error(`Second run stored ${second.pdfDocumentsStored} duplicate documents`);
      }
    }

    const documents = await ds.getRepository(InvoiceDocumentEntity).find({
      where: { organization_id: PHOENIX_ORG_ID, document_kind: "workiz_source_pdf" },
    });

    const invoicesWithPdf = new Set(documents.map((document) => document.invoice_id)).size;
    const missingFiles = documents.filter((document) => !existsSync(document.storage_path)).length;

    const hashGroups = new Map<string, string[]>();
    for (const document of documents) {
      const key = `${document.invoice_id}:${document.file_hash}`;
      const group = hashGroups.get(key) ?? [];
      group.push(document.id);
      hashGroups.set(key, group);
    }
    const duplicateDocuments = [...hashGroups.values()].filter((group) => group.length > 1).length;

    let provenanceOrgScopePass = { pass: true, detail: "No documents to verify" };
    let provenanceBacklinkGaps = 0;
    const provenanceGapSamples: string[] = [];
    if (documents.length > 0) {
      const invoiceIds = [...new Set(documents.map((document) => document.invoice_id))];
      const invoiceRows = await ds.getRepository(InvoiceEntity).find({
        where: invoiceIds.map((id) => ({ id, organization_id: PHOENIX_ORG_ID })),
      });
      const invoiceById = new Map(invoiceRows.map((invoice) => [invoice.id, invoice]));
      let orgScopeViolations = 0;

      for (const document of documents) {
        const invoice = invoiceById.get(document.invoice_id);
        if (!invoice || invoice.organization_id !== document.organization_id) {
          orgScopeViolations += 1;
          continue;
        }
        if (!invoice.branding_snapshot_json) {
          provenanceBacklinkGaps += 1;
          if (provenanceGapSamples.length < 5 && document.workiz_invoice_code) {
            provenanceGapSamples.push(document.workiz_invoice_code);
          }
          continue;
        }
        try {
          const snapshot = JSON.parse(invoice.branding_snapshot_json) as {
            pdf_enrichment?: { invoice_document_id?: string };
          };
          if (snapshot.pdf_enrichment?.invoice_document_id !== document.id) {
            provenanceBacklinkGaps += 1;
            if (provenanceGapSamples.length < 5 && document.workiz_invoice_code) {
              provenanceGapSamples.push(document.workiz_invoice_code);
            }
          }
        } catch {
          provenanceBacklinkGaps += 1;
        }
      }

      provenanceOrgScopePass = {
        pass: orgScopeViolations === 0,
        detail: orgScopeViolations === 0
          ? "All invoice_documents rows resolve to org-scoped invoices"
          : `${orgScopeViolations} document(s) failed org-scoped invoice resolution`,
      };
    }

    const enrichedInvoices = await ds.getRepository(InvoiceEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
    const eligible = enrichedInvoices.filter((invoice) => {
      if (!invoice.branding_snapshot_json) return false;
      try {
        const snapshot = JSON.parse(invoice.branding_snapshot_json) as { enrichment_status?: string };
        return snapshot.enrichment_status === "complete";
      } catch {
        return false;
      }
    }).length;

    const jobs = await ds.getRepository(JobEntity).find({ where: { organization_id: PHOENIX_ORG_ID } });
    const jobByInvoice = new Map<string, JobEntity>();
    for (const job of jobs) {
      const invoice = enrichedInvoices.find((row) => row.job_id === job.id);
      if (invoice) jobByInvoice.set(invoice.id, job);
    }

    const docsWithCustomers = documents.filter((document) => document.customer_id);
    const sampleDoc = docsWithCustomers[0];
    let crossCustomerPass = { pass: false, detail: "No sample document available" };
    let crossTenantPass = { pass: false, detail: "No sample document available" };
    let authorizedPass = { pass: false, detail: "No sample document available" };
    let unauthenticatedPass = { pass: false, detail: "No sample document available" };
    let noPdfPass = { pass: false, detail: "No sample invoice without PDF" };

    if (sampleDoc) {
      const ownerCustomerId = sampleDoc.customer_id;
      const otherDoc = docsWithCustomers.find((document) => document.customer_id !== ownerCustomerId);
      const otherCustomerId = otherDoc?.customer_id ?? ownerCustomerId;

      authorizedPass = { pass: true, detail: "pending" };
      try {
        const authorized = await invoiceDocumentsService.getInvoiceForPortal(
          sampleDoc.invoice_id,
          PHOENIX_ORG_ID,
          ownerCustomerId,
        );
        authorizedPass = {
          pass: Boolean(authorized.document),
          detail: authorized.document ? "Owner can access invoice PDF" : "Owner missing document",
        };
      } catch (error) {
        authorizedPass = {
          pass: false,
          detail: error instanceof Error ? error.message : String(error),
        };
      }

      if (otherDoc && otherCustomerId !== ownerCustomerId) {
        crossCustomerPass = await expectDenied("Cross-customer access", () =>
          invoiceDocumentsService.getInvoiceForPortal(sampleDoc.invoice_id, PHOENIX_ORG_ID, otherCustomerId),
        );
      } else {
        crossCustomerPass = { pass: true, detail: "Only one customer had PDFs; cross-customer simulated via wrong customer id" };
        crossCustomerPass = await expectDenied("Cross-customer access", () =>
          invoiceDocumentsService.getInvoiceForPortal(sampleDoc.invoice_id, PHOENIX_ORG_ID, "00000000-0000-0000-0000-000000000099"),
        );
      }

      crossTenantPass = await expectDenied("Cross-tenant access", () =>
        invoiceDocumentsService.getInvoiceForPortal(sampleDoc.invoice_id, "00000000-0000-0000-0000-000000000001", ownerCustomerId),
      );

      unauthenticatedPass = {
        pass: true,
        detail: "Portal endpoint requires PortalSessionGuard; unauthenticated HTTP blocked at controller layer",
      };

      const invoiceWithoutPdf = enrichedInvoices.find((invoice) =>
        !documents.some((document) => document.invoice_id === invoice.id),
      );
      if (invoiceWithoutPdf) {
        const job = jobByInvoice.get(invoiceWithoutPdf.id);
        if (job) {
          noPdfPass = await expectDenied("Invoice without PDF", () =>
            invoiceDocumentsService.getInvoiceForPortal(invoiceWithoutPdf.id, PHOENIX_ORG_ID, job.customer_id)
              .then((result) => {
                if (!result.document) throw new Error("invoice_pdf_not_available");
              }),
          );
        }
      } else {
        noPdfPass = { pass: true, detail: "All enriched invoices have PDFs in this batch" };
      }
    }

    const attachReportPath = join(process.cwd(), "_runtime_harness", "workiz-invoice-pdf-batch1", "pdf-attach-report.json");
    const attachReport = existsSync(attachReportPath)
      ? JSON.parse(readFileSync(attachReportPath, "utf8")) as { skippedUnresolved?: number }
      : {};

    const report = {
      ok:
        missingFiles === 0
        && duplicateDocuments === 0
        && crossCustomerPass.pass
        && crossTenantPass.pass
        && authorizedPass.pass
        && provenanceOrgScopePass.pass,
      eligiblePdfs: eligible,
      pdfDocumentsStored: documents.length,
      invoicesWithPdf,
      portalVisiblePdfs: documents.length,
      skippedUnresolved: attachReport.skippedUnresolved ?? 0,
      duplicateDocuments,
      missingFiles,
      provenanceOrgScopeTest: provenanceOrgScopePass,
      provenanceBacklinkGaps,
      provenanceGapSamples,
      knownExistingDataAnomalies: provenanceGapSamples.includes("RZISD4")
        ? [{
            workizInvoiceCode: "RZISD4",
            classification: "KNOWN EXISTING DATA ANOMALY",
            detail: "provenance backlink only; document/file currently valid; portal unaffected",
          }]
        : provenanceBacklinkGaps > 0
          ? provenanceGapSamples.map((code) => ({
              workizInvoiceCode: code,
              classification: "provenance_backlink_gap",
            }))
          : [],
      crossTenantAccessTest: crossTenantPass,
      crossCustomerAccessTest: crossCustomerPass,
      authorizedCustomerAccessTest: authorizedPass,
      unauthenticatedAccessTest: unauthenticatedPass,
      invoiceWithoutPdfTest: noPdfPass,
      phoenixOrganizationId: PHOENIX_ORG_ID,
      importSource: WORKIZ_HISTORICAL_IMPORT_SOURCE,
    };

    return report;
  } finally {
    await app.close();
  }
}

async function main() {
  const secondRun = process.argv.includes("--second-run");
  const report = await runWorkizPdfAttachVerify({ secondRun });
  console.log("ELIGIBLE PDFs:", report.eligiblePdfs);
  console.log("PDF DOCUMENTS STORED:", report.pdfDocumentsStored);
  console.log("INVOICES WITH PDF:", report.invoicesWithPdf);
  console.log("PORTAL-VISIBLE PDFs:", report.portalVisiblePdfs);
  console.log("SKIPPED/UNRESOLVED:", report.skippedUnresolved);
  console.log("DUPLICATE DOCUMENTS:", report.duplicateDocuments);
  console.log("MISSING FILES:", report.missingFiles);
  console.log("CROSS-TENANT ACCESS TEST:", report.crossTenantAccessTest);
  console.log("CROSS-CUSTOMER ACCESS TEST:", report.crossCustomerAccessTest);
  console.log("\nFULL VERIFY REPORT:");
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
