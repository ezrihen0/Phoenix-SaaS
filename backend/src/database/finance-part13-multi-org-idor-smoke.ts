import "dotenv/config";
import "reflect-metadata";

import { HttpException } from "@nestjs/common";
import { DataSource } from "typeorm";

import { normalizeInvoiceNumberSearchQuery } from "../crm/invoice-display-number";
import { InvoiceCustomerFacingSnapshotService } from "../crm/invoice-customer-facing-snapshot.service";
import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";
import { InvoicePaymentRecordingService } from "../crm/invoice-payment-recording.service";
import { InvoicePdfViewModelService } from "../crm/invoice-pdf-view-model.service";
import { InvoicePdfService } from "../crm/invoice-pdf.service";
import { PortalNativeInvoicePdfService } from "../crm/portal-native-invoice-pdf.service";
import { PhoenixInvoiceDocumentPresentationService } from "../crm/phoenix-invoice-document-presentation.service";
import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import { PdfRenderService } from "../documents/pdf/pdf-render.service";
import { InvoiceDocumentsService } from "../documents/invoice-documents/invoice-documents.service";
import { InvoiceNativeDocumentService } from "../documents/invoice-documents/invoice-native-document.service";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceDocumentEntity } from "./entities/invoice-document.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationSettingEntity } from "./entities/organization-setting.entity";
import { QuoteEntity } from "./entities/quote.entity";
import {
  assertConfiguredSmokeDatabaseIsSafe,
  extractErrorCode,
} from "./estimate-invoice-conversion-smoke.harness";
import {
  cleanupFinancePart13Fixture,
  seedFinancePart13Fixture,
} from "./finance-part13-multi-org-idor-smoke.harness";
import { buildDataSourceOptions } from "./typeorm.config";

type SmokeResult = { name: string; ok: boolean; detail?: unknown };

function expectCode(error: unknown, expected: string[]) {
  const code = extractErrorCode(error);
  if (!expected.includes(code)) {
    throw new Error(`Expected one of [${expected.join(", ")}], got ${code}`);
  }
}

function filterInvoicesByNumberForOrg(invoices: InvoiceEntity[], searchQuery: string) {
  const normalizedSearch = normalizeInvoiceNumberSearchQuery(searchQuery);
  if (!normalizedSearch) {
    return invoices;
  }
  const needle = normalizedSearch.toLowerCase();
  return invoices.filter((invoice) => {
    const haystack = [invoice.document_number, invoice.id].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}

async function main() {
  const options = buildDataSourceOptions();
  const databaseName = typeof options.database === "string" ? options.database : "";
  assertConfiguredSmokeDatabaseIsSafe(databaseName);

  const dataSource = new DataSource(options);
  await dataSource.initialize();

  const fixture = await seedFinancePart13Fixture(dataSource);
  const results: SmokeResult[] = [];

  const customerRepo = dataSource.getRepository(CustomerEntity);
  const jobRepo = dataSource.getRepository(JobEntity);
  const quoteRepo = dataSource.getRepository(QuoteEntity);
  const invoiceRepo = dataSource.getRepository(InvoiceEntity);
  const paymentRepo = dataSource.getRepository(InvoicePaymentEntity);
  const documentRepo = dataSource.getRepository(InvoiceDocumentEntity);

  const ledgerService = new InvoicePaymentLedgerService();
  const recordingService = new InvoicePaymentRecordingService(dataSource, ledgerService);

  const brandingSnapshotService = new DocumentBrandingSnapshotService();
  const presentationService = new PhoenixInvoiceDocumentPresentationService(
    new InvoicePdfViewModelService(
      new InvoiceCustomerFacingSnapshotService(brandingSnapshotService),
      brandingSnapshotService,
    ),
    ledgerService,
  );
  const portalPdfService = new PortalNativeInvoicePdfService(
    dataSource.getRepository(InvoiceEntity),
    dataSource.getRepository(OrganizationSettingEntity),
    presentationService,
    new InvoicePdfService(new PdfRenderService()),
  );

  const invoiceDocumentsService = new InvoiceDocumentsService(
    dataSource,
    dataSource.getRepository(InvoiceDocumentEntity),
    dataSource.getRepository(InvoiceEntity),
    dataSource.getRepository(JobEntity),
  );

  const nativeDocumentService = new InvoiceNativeDocumentService(
    dataSource,
    dataSource.getRepository(InvoiceDocumentEntity),
  );

  async function run(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, detail: extractErrorCode(error) });
    }
  }

  await run("foreign customer scoped to org A returns null", async () => {
    const row = await customerRepo.findOne({
      where: { id: fixture.customerBId, organization_id: fixture.orgAId },
    });
    if (row) {
      throw new Error("Foreign customer visible under org A scope");
    }
  });

  await run("foreign job scoped to org A returns null", async () => {
    const row = await jobRepo.findOne({
      where: { id: fixture.jobBId, organization_id: fixture.orgAId },
    });
    if (row) {
      throw new Error("Foreign job visible under org A scope");
    }
  });

  await run("foreign estimate scoped to org A returns null", async () => {
    const row = await quoteRepo.findOne({
      where: { id: fixture.quoteBId, organization_id: fixture.orgAId },
    });
    if (row) {
      throw new Error("Foreign estimate visible under org A scope");
    }
  });

  await run("foreign invoice scoped to org A returns null", async () => {
    const row = await invoiceRepo.findOne({
      where: { id: fixture.invoiceBId, organization_id: fixture.orgAId },
    });
    if (row) {
      throw new Error("Foreign invoice visible under org A scope");
    }
  });

  await run("foreign payment scoped to org A returns null", async () => {
    const row = await paymentRepo.findOne({
      where: { invoice_id: fixture.invoiceBId, organization_id: fixture.orgAId },
    });
    if (row) {
      throw new Error("Org B payment visible under org A scope");
    }
  });

  await run("foreign invoice payment mutation rejected", async () => {
    try {
      await recordingService.recordNativePayment({
        organizationId: fixture.orgAId,
        invoiceId: fixture.invoiceBId,
        actorUserId: fixture.userId,
        actorProfileId: fixture.profileId,
        payload: {
          amountCents: 100,
          entryType: "payment",
          method: "cash",
          idempotencyKey: `p13-foreign-${fixture.token}`,
          reference: null,
          note: null,
          occurredAt: null,
        },
      });
      throw new Error("Expected foreign invoice payment to fail");
    } catch (error) {
      if (error instanceof HttpException) {
        expectCode(error, ["invoice_not_found"]);
        return;
      }
      throw error;
    }
  });

  await run("portal PDF rejects foreign org invoice", async () => {
    try {
      await portalPdfService.renderForPortal({
        organizationId: fixture.orgAId,
        customerId: fixture.customerAId,
        invoiceId: fixture.invoiceBId,
      });
      throw new Error("Expected portal PDF foreign invoice rejection");
    } catch (error) {
      expectCode(error, ["invoice_not_found"]);
    }
  });

  await run("portal document-view rejects same-org other customer invoice", async () => {
    try {
      await portalPdfService.getDocumentViewForPortal({
        organizationId: fixture.orgAId,
        customerId: fixture.customerA2Id,
        invoiceId: fixture.invoiceAId,
      });
      throw new Error("Expected same-org other-customer portal rejection");
    } catch (error) {
      expectCode(error, ["invoice_not_found"]);
    }
  });

  await run("getInvoiceForPortal rejects cross-customer", async () => {
    try {
      await invoiceDocumentsService.getInvoiceForPortal(
        fixture.invoiceAId,
        fixture.orgAId,
        fixture.customerBId,
      );
      throw new Error("Expected cross-customer portal document rejection");
    } catch (error) {
      expectCode(error, ["invoice_not_found"]);
    }
  });

  await run("native document lookup rejects foreign invoice id", async () => {
    const doc = await nativeDocumentService.findNativeDocumentForInvoice(
      fixture.orgAId,
      fixture.invoiceBId,
      fixture.documentAId,
    );
    if (doc) {
      throw new Error("Document resolved under foreign invoice id");
    }
  });

  await run("invoice number search does not leak org B invoice into org A set", async () => {
    const orgAInvoices = await invoiceRepo.find({ where: { organization_id: fixture.orgAId } });
    const orgBInvoices = await invoiceRepo.find({ where: { organization_id: fixture.orgBId } });
    const merged = [...orgAInvoices, ...orgBInvoices];
    const orgASearch = filterInvoicesByNumberForOrg(orgAInvoices, "INV-1001");
    const mergedSearch = filterInvoicesByNumberForOrg(merged, "#1001");
    if (orgASearch.length !== 1 || orgASearch[0]?.id !== fixture.invoiceAId) {
      throw new Error("Org A search did not return only org A invoice 1001");
    }
    if (mergedSearch.length !== 2) {
      throw new Error("Merged search proves duplicate numbers exist across orgs");
    }
    if (orgASearch.some((row) => row.organization_id !== fixture.orgAId)) {
      throw new Error("Org A search returned foreign org row");
    }
  });

  await cleanupFinancePart13Fixture(dataSource, fixture);
  await dataSource.destroy();

  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
