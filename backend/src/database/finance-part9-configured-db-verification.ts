import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { DataSource, Like } from "typeorm";

import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import { InvoiceCustomerFacingSnapshotService } from "../crm/invoice-customer-facing-snapshot.service";
import { InvoicePdfService } from "../crm/invoice-pdf.service";
import { PdfRenderService } from "../documents/pdf/pdf-render.service";
import { PhoenixInvoiceDocumentPresentationService } from "../crm/phoenix-invoice-document-presentation.service";
import { InvoicePdfViewModelService } from "../crm/invoice-pdf-view-model.service";
import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";
import { InvoicePaymentRecordingService } from "../crm/invoice-payment-recording.service";
import { InvoiceNativeDocumentService } from "../documents/invoice-documents/invoice-native-document.service";
import { resolveSmokeDatabasePlan, useConfiguredSmokeDatabase } from "./db-smoke-database-plan";
import { requireMySqlOptions } from "./estimate-invoice-conversion-smoke.harness";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceDocumentEntity } from "./entities/invoice-document.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationSettingEntity } from "./entities/organization-setting.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { UserEntity } from "./entities/user.entity";

async function main() {
  const configured = useConfiguredSmokeDatabase();
  if (!configured) {
    console.log(JSON.stringify({ outcome: "SKIP", error: "configured_database_required" }, null, 2));
    process.exitCode = 1;
    return;
  }

  const options = requireMySqlOptions();
  const plan = resolveSmokeDatabasePlan(options, "wizfield_finance_part9_verify");
  const dataSource = new DataSource({
    ...options,
    database: plan.databaseName,
    synchronize: false,
    migrationsRun: false,
    logging: false,
  });

  const token = randomUUID().slice(0, 8);
  const errors: string[] = [];
  const categories: Record<string, "PASS" | "FAIL"> = {
    firstSendPersist: "FAIL",
    byteIdentityDedupe: "FAIL",
    paymentChangeNewArtifact: "FAIL",
    artifactImmutability: "FAIL",
    tenantIsolation: "FAIL",
  };

  const snapshotService = new InvoiceCustomerFacingSnapshotService(new DocumentBrandingSnapshotService());
  const viewModelService = new InvoicePdfViewModelService(snapshotService, new DocumentBrandingSnapshotService());
  const presentation = new PhoenixInvoiceDocumentPresentationService(
    viewModelService,
    new InvoicePaymentLedgerService(),
  );
  const pdfService = new InvoicePdfService(new PdfRenderService());
  const nativeDocuments = new InvoiceNativeDocumentService(
    dataSource,
    dataSource.getRepository(InvoiceDocumentEntity),
  );

  try {
    await dataSource.initialize();

    const organization = await dataSource.getRepository(OrganizationEntity).save(
      dataSource.getRepository(OrganizationEntity).create({
        name: `Phase9 ${token}`,
        slug: `phase9-${token}`.toLowerCase(),
        is_active: true,
      }),
    );

    const user = await dataSource.getRepository(UserEntity).save(
      dataSource.getRepository(UserEntity).create({
        email: `phase9-${token}@example.com`,
        password_hash: "hash",
        is_active: true,
      }),
    );

    const profile = await dataSource.getRepository(ProfileEntity).save(
      dataSource.getRepository(ProfileEntity).create({
        auth_user_id: user.id,
        full_name: "Phase9 Owner",
        phone: "5551000100",
        role: "owner",
      }),
    );

    await dataSource.getRepository(OrganizationSettingEntity).save(
      dataSource.getRepository(OrganizationSettingEntity).create({
        settings_key: `org:${organization.id}`,
        organization_id: organization.id,
        business_name: "Phase9 Biz",
        display_initials: "P9",
      }),
    );

    const orgSettings = await dataSource.getRepository(OrganizationSettingEntity).findOneOrFail({
      where: { organization_id: organization.id },
    });

    const customer = await dataSource.getRepository(CustomerEntity).save(
      dataSource.getRepository(CustomerEntity).create({
        organization_id: organization.id,
        full_name: "Phase9 Customer",
        email: `phase9-cust-${token}@example.com`,
        service_address_line_1: "1 Bill St",
        service_city: "Calgary",
        service_postal_code: "T2P1A1",
        phone: "5551000101",
        source: "website",
        lifecycle_status: "active",
        notes: null,
      }),
    );

    const job = await dataSource.getRepository(JobEntity).save(
      dataSource.getRepository(JobEntity).create({
        organization_id: organization.id,
        customer_id: customer.id,
        title: "Phase9 Job",
        description: "phase9",
        lead_source: "website",
        requested_service_type: "inspection",
        job_type: "inspection",
        status: "completed",
        service_address_line_1: "99 Service Rd",
        service_city: "Calgary",
        service_postal_code: "T3P1A1",
        scheduled_for: new Date(),
        scheduled_window: "morning",
        requested_at: new Date(),
        completed_at: new Date(),
        created_by_auth_user_id: user.id,
        updated_by_auth_user_id: user.id,
      }),
    );

    const invoice = await dataSource.getRepository(InvoiceEntity).save(
      dataSource.getRepository(InvoiceEntity).create({
        organization_id: organization.id,
        job_id: job.id,
        description: "Phase9 invoice",
        status: "unpaid",
        amount_cents: 10_000,
        subtotal_cents: 10_000,
        tax_cents: 0,
        tax_rate_bps_snapshot: 0,
        total_cents: 10_000,
        issued_at: new Date(),
        due_at: new Date(),
      }),
    );

    await dataSource.getRepository(InvoiceLineItemEntity).save(
      dataSource.getRepository(InvoiceLineItemEntity).create({
        invoice_id: invoice.id,
        sku_snapshot: "SKU",
        name_snapshot: "Line",
        item_type_snapshot: "service",
        unit_of_measure_snapshot: "each",
        unit_price_cents_snapshot: 10_000,
        quantity: "1",
        line_subtotal_cents: 10_000,
        sort_order: 0,
      }),
    );

    let invoiceReload = await dataSource.getRepository(InvoiceEntity).findOneOrFail({
      where: { id: invoice.id },
      relations: { line_items: true, payments: true },
    });

    snapshotService.freezeInvoiceRecord({
      invoice: invoiceReload,
      lineItems: invoiceReload.line_items ?? [],
      customer,
      job,
      orgSettings,
      documentNumber: `P9-${token}`,
      frozenAt: new Date(),
      frozenVia: "email",
      organizationId: organization.id,
    });
    await dataSource.getRepository(InvoiceEntity).save(invoiceReload);

    const snapshot = snapshotService.parseSnapshot(invoiceReload.customer_facing_snapshot_json);
    assert.ok(snapshot);

    const renderPdf = async () => {
      const reload = await dataSource.getRepository(InvoiceEntity).findOneOrFail({
        where: { id: invoice.id },
        relations: { line_items: true, payments: true },
      });
      const view = presentation.buildInvoiceDocumentView({
        invoice: reload,
        customer,
        job,
        orgSettings,
      });
      return pdfService.renderInvoicePdf(view);
    };

    const bufferA = await renderPdf();
    const artifactA = await nativeDocuments.persistNativePdf({
      organizationId: organization.id,
      customerId: customer.id,
      invoice: invoiceReload,
      pdfBuffer: bufferA,
      snapshot,
      sentVia: "email",
    });

    assert.equal(artifactA.generation_sequence, 1);
    assert.ok(artifactA.storage_path);
    categories.firstSendPersist = "PASS";

    const emailHash = createHash("sha256").update(bufferA).digest("hex");
    assert.equal(artifactA.file_hash, emailHash);
    categories.byteIdentityDedupe = "PASS";

    const artifactADup = await nativeDocuments.persistNativePdf({
      organizationId: organization.id,
      customerId: customer.id,
      invoice: invoiceReload,
      pdfBuffer: bufferA,
      snapshot,
      sentVia: "email",
    });
    assert.equal(artifactADup.id, artifactA.id);

    const recording = new InvoicePaymentRecordingService(dataSource, new InvoicePaymentLedgerService());
    await recording.recordNativePayment({
      organizationId: organization.id,
      invoiceId: invoice.id,
      actorUserId: user.id,
      actorProfileId: profile.id,
      payload: {
        idempotencyKey: randomUUID(),
        entryType: "payment",
        amountCents: 4000,
        method: "cash",
        reference: null,
        note: null,
        occurredAt: null,
      },
    });

    const bufferB = await renderPdf();
    assert.notEqual(createHash("sha256").update(bufferB).digest("hex"), artifactA.file_hash);

    invoiceReload = await dataSource.getRepository(InvoiceEntity).findOneOrFail({
      where: { id: invoice.id },
      relations: { line_items: true, payments: true },
    });

    const artifactB = await nativeDocuments.persistNativePdf({
      organizationId: organization.id,
      customerId: customer.id,
      invoice: invoiceReload,
      pdfBuffer: bufferB,
      snapshot,
      sentVia: "email",
    });

    assert.equal(artifactB.generation_sequence, 2);
    assert.notEqual(artifactB.id, artifactA.id);
    categories.paymentChangeNewArtifact = "PASS";

    const bytesA = await readFile(artifactA.storage_path);
    assert.equal(createHash("sha256").update(bytesA).digest("hex"), artifactA.file_hash);
    categories.artifactImmutability = "PASS";

    const foreignList = await nativeDocuments.listNativeDocumentsForInvoice(
      "00000000-0000-0000-0000-000000000099",
      invoice.id,
    );
    assert.equal(foreignList.length, 0);
    categories.tenantIsolation = "PASS";
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    const orgs = await dataSource.getRepository(OrganizationEntity).find({
      where: { slug: Like(`phase9-%`) },
    });
    for (const org of orgs) {
      const invoices = await dataSource.getRepository(InvoiceEntity).find({
        where: { organization_id: org.id },
        select: { id: true },
      });
      for (const row of invoices) {
        await dataSource.getRepository(InvoiceLineItemEntity).delete({ invoice_id: row.id });
      }
      await dataSource.getRepository(InvoiceDocumentEntity).delete({ organization_id: org.id });
      await dataSource.getRepository(InvoiceEntity).delete({ organization_id: org.id });
      await dataSource.getRepository(JobEntity).delete({ organization_id: org.id });
      await dataSource.getRepository(CustomerEntity).delete({ organization_id: org.id });
      await dataSource.getRepository(OrganizationSettingEntity).delete({ organization_id: org.id });
      await dataSource.getRepository(OrganizationEntity).delete({ id: org.id });
    }
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }

  const outcome = Object.values(categories).every((value) => value === "PASS") && errors.length === 0 ? "PASS" : "FAIL";
  console.log(JSON.stringify({ outcome, categories, errors }, null, 2));
  if (outcome !== "PASS") {
    process.exitCode = 1;
  }
}

void main();
