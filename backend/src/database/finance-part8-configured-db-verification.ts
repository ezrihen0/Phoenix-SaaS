import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "crypto";
import { DataSource, Like } from "typeorm";

import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import { InvoiceCustomerFacingSnapshotService } from "../crm/invoice-customer-facing-snapshot.service";
import { InvoicePdfService } from "../crm/invoice-pdf.service";
import { PdfRenderService } from "../documents/pdf/pdf-render.service";
import { PhoenixInvoiceDocumentPresentationService } from "../crm/phoenix-invoice-document-presentation.service";
import { InvoicePdfViewModelService } from "../crm/invoice-pdf-view-model.service";
import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";
import { InvoicePaymentRecordingService } from "../crm/invoice-payment-recording.service";
import { resolveSmokeDatabasePlan, useConfiguredSmokeDatabase } from "./db-smoke-database-plan";
import { requireMySqlOptions } from "./estimate-invoice-conversion-smoke.harness";
import { CustomerEntity } from "./entities/customer.entity";
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
  const plan = resolveSmokeDatabasePlan(options, "wizfield_finance_part8_verify");
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
    draftBanner: "FAIL",
    frozenParity: "FAIL",
    pdfRender: "FAIL",
    paymentLedgerDisplay: "FAIL",
    logoFallback: "PASS",
  };

  const snapshotService = new InvoiceCustomerFacingSnapshotService(new DocumentBrandingSnapshotService());
  const viewModelService = new InvoicePdfViewModelService(snapshotService, new DocumentBrandingSnapshotService());
  const presentation = new PhoenixInvoiceDocumentPresentationService(
    viewModelService,
    new InvoicePaymentLedgerService(),
  );
  const pdfService = new InvoicePdfService(new PdfRenderService());

  try {
    await dataSource.initialize();

    const organization = await dataSource.getRepository(OrganizationEntity).save(
      dataSource.getRepository(OrganizationEntity).create({
        name: `Phase8 ${token}`,
        slug: `phase8-${token}`.toLowerCase(),
        is_active: true,
      }),
    );

    const user = await dataSource.getRepository(UserEntity).save(
      dataSource.getRepository(UserEntity).create({
        email: `phase8-${token}@example.com`,
        password_hash: "hash",
        is_active: true,
      }),
    );

    const profile = await dataSource.getRepository(ProfileEntity).save(
      dataSource.getRepository(ProfileEntity).create({
        auth_user_id: user.id,
        full_name: "Phase8 Owner",
        phone: "5551000100",
        role: "owner",
      }),
    );

    await dataSource.getRepository(OrganizationSettingEntity).save(
      dataSource.getRepository(OrganizationSettingEntity).create({
        settings_key: `org:${organization.id}`,
        organization_id: organization.id,
        business_name: "Phase8 Biz",
        display_initials: "P8",
        invoice_pdf_footer: "Footer text",
        warranty_message: "Warranty text",
        payment_instructions: "Pay by e-transfer",
      }),
    );

    const orgSettings = await dataSource.getRepository(OrganizationSettingEntity).findOneOrFail({
      where: { organization_id: organization.id },
    });

    const customer = await dataSource.getRepository(CustomerEntity).save(
      dataSource.getRepository(CustomerEntity).create({
        organization_id: organization.id,
        full_name: "Phase8 Customer",
        email: `cust-${token}@example.com`,
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
        title: "Phase8 Job",
        description: "phase8",
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

    const draftInvoice = await dataSource.getRepository(InvoiceEntity).save(
      dataSource.getRepository(InvoiceEntity).create({
        organization_id: organization.id,
        job_id: job.id,
        description: "Draft invoice",
        status: "unpaid",
        amount_cents: 5000,
        subtotal_cents: 5000,
        tax_cents: 0,
        tax_rate_bps_snapshot: 0,
        total_cents: 5000,
        issued_at: new Date(),
        due_at: new Date(),
      }),
    );

    await dataSource.getRepository(InvoiceLineItemEntity).save(
      dataSource.getRepository(InvoiceLineItemEntity).create({
        invoice_id: draftInvoice.id,
        sku_snapshot: "SKU",
        name_snapshot: "Line",
        item_type_snapshot: "service",
        unit_of_measure_snapshot: "each",
        unit_price_cents_snapshot: 5000,
        quantity: "1",
        line_subtotal_cents: 5000,
        sort_order: 0,
      }),
    );

    const draftReload = await dataSource.getRepository(InvoiceEntity).findOneOrFail({
      where: { id: draftInvoice.id },
      relations: { line_items: true, payments: true },
    });

    const draftView = presentation.buildInvoiceDocumentView({
      invoice: draftReload,
      customer,
      job,
      orgSettings,
    });

    assert.equal(draftView.render_mode, "legacy_live");
    assert.equal(draftView.show_draft_banner, true);
    assert.match(draftView.service_location.address_lines.join(" "), /99 Service Rd/);
    categories.draftBanner = "PASS";

    const frozenJob = await dataSource.getRepository(JobEntity).save(
      dataSource.getRepository(JobEntity).create({
        organization_id: organization.id,
        customer_id: customer.id,
        title: "Phase8 Frozen Job",
        description: "phase8 frozen",
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

    const frozenInvoice = await dataSource.getRepository(InvoiceEntity).save(
      dataSource.getRepository(InvoiceEntity).create({
        organization_id: organization.id,
        job_id: frozenJob.id,
        description: "Frozen invoice",
        status: "unpaid",
        amount_cents: 12_000,
        subtotal_cents: 12_000,
        tax_cents: 0,
        tax_rate_bps_snapshot: 0,
        total_cents: 12_000,
        issued_at: new Date(),
        due_at: new Date(),
      }),
    );

    await dataSource.getRepository(InvoiceLineItemEntity).save(
      dataSource.getRepository(InvoiceLineItemEntity).create({
        invoice_id: frozenInvoice.id,
        sku_snapshot: "SKU2",
        name_snapshot: "Frozen line",
        item_type_snapshot: "service",
        unit_of_measure_snapshot: "each",
        unit_price_cents_snapshot: 12_000,
        quantity: "1",
        line_subtotal_cents: 12_000,
        sort_order: 0,
      }),
    );

    const frozenReload = await dataSource.getRepository(InvoiceEntity).findOneOrFail({
      where: { id: frozenInvoice.id },
      relations: { line_items: true, payments: true },
    });

    snapshotService.freezeInvoiceRecord({
      invoice: frozenReload,
      lineItems: frozenReload.line_items ?? [],
      customer,
      job: frozenJob,
      orgSettings,
      documentNumber: "P8-1001",
      frozenAt: new Date(),
      frozenVia: "email",
      organizationId: organization.id,
    });
    await dataSource.getRepository(InvoiceEntity).save(frozenReload);

    const frozenHash = createHash("sha256")
      .update(frozenReload.customer_facing_snapshot_json ?? "")
      .digest("hex");

    await dataSource.getRepository(CustomerEntity).update(customer.id, { full_name: "Mutated" });
    await dataSource.getRepository(JobEntity).update(frozenJob.id, { service_address_line_1: "Changed" });

    const frozenReload2 = await dataSource.getRepository(InvoiceEntity).findOneOrFail({
      where: { id: frozenInvoice.id },
      relations: { line_items: true, payments: true },
    });

    const frozenView = presentation.buildInvoiceDocumentView({
      invoice: frozenReload2,
      customer: await dataSource.getRepository(CustomerEntity).findOneOrFail({ where: { id: customer.id } }),
      job: await dataSource.getRepository(JobEntity).findOneOrFail({ where: { id: frozenJob.id } }),
      orgSettings,
    });

    assert.equal(frozenView.render_mode, "frozen");
    assert.equal(frozenView.show_draft_banner, false);
    assert.equal(frozenView.bill_to.name, "Phase8 Customer");
    assert.match(frozenView.service_location.address_lines.join(" "), /99 Service Rd/);
    assert.equal(
      createHash("sha256").update(frozenReload2.customer_facing_snapshot_json ?? "").digest("hex"),
      frozenHash,
    );
    categories.frozenParity = "PASS";

    const pdfBuffer = pdfService.renderInvoicePdf(frozenView);
    assert.ok(pdfBuffer.byteLength > 500);
    categories.pdfRender = "PASS";

    const recording = new InvoicePaymentRecordingService(dataSource, new InvoicePaymentLedgerService());
    await recording.recordNativePayment({
      organizationId: organization.id,
      invoiceId: frozenInvoice.id,
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

    const paidReload = await dataSource.getRepository(InvoiceEntity).findOneOrFail({
      where: { id: frozenInvoice.id },
      relations: { line_items: true, payments: true },
    });

    const paidView = presentation.buildInvoiceDocumentView({
      invoice: paidReload,
      customer,
      job: frozenJob,
      orgSettings,
    });

    assert.equal(paidView.financial_summary.total_cents, 12_000);
    assert.ok(paidView.balance_due.balance_cents > 0);
    assert.ok(paidView.payments_ledger.payments.length >= 1);
    categories.paymentLedgerDisplay = "PASS";

    assert.ok(buildLogoInitialsFromView(draftView));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    const orgs = await dataSource.getRepository(OrganizationEntity).find({
      where: { slug: Like(`phase8-%`) },
    });
    for (const org of orgs) {
      const invoices = await dataSource.getRepository(InvoiceEntity).find({
        where: { organization_id: org.id },
        select: { id: true },
      });
      for (const invoice of invoices) {
        await dataSource.getRepository(InvoiceLineItemEntity).delete({ invoice_id: invoice.id });
      }
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

function buildLogoInitialsFromView(view: { business_header: { display_initials: string | null; business_name: string | null } }) {
  return Boolean(view.business_header.display_initials?.trim() || view.business_header.business_name?.trim());
}

void main();
