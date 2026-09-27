import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import { DataSource } from "typeorm";

import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import { InvoiceCustomerFacingSnapshotService } from "../crm/invoice-customer-facing-snapshot.service";
import { InvoiceNumberingService } from "../crm/invoice-numbering.service";
import { InvoiceSendPipelineService } from "../crm/invoice-send-pipeline.service";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationInvoiceSequenceEntity } from "./entities/organization-invoice-sequence.entity";
import { buildDataSourceOptions } from "./typeorm.config";

type SmokeResult = { name: string; ok: boolean; detail?: unknown };

async function main() {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  const token = randomUUID().slice(0, 8);
  const results: SmokeResult[] = [];
  let orgId = "";
  let customerId = "";
  let jobId = "";
  let invoiceId = "";

  const snapshotService = new InvoiceCustomerFacingSnapshotService(new DocumentBrandingSnapshotService());
  const numberingService = new InvoiceNumberingService(
    dataSource.getRepository(OrganizationInvoiceSequenceEntity),
  );
  const sendPipeline = new InvoiceSendPipelineService(dataSource, numberingService, snapshotService);

  try {
    const org = await dataSource.getRepository(OrganizationEntity).save(
      dataSource.getRepository(OrganizationEntity).create({
        name: `Send Snapshot Smoke ${token}`,
        slug: `send-snap-${token}`,
        is_active: true,
      }),
    );
    orgId = org.id;

    const customer = await dataSource.getRepository(CustomerEntity).save(
      dataSource.getRepository(CustomerEntity).create({
        organization_id: orgId,
        full_name: "Send Snapshot Customer",
        email: `send-snap-${token}@example.com`,
        company_name: null,
        service_address_line_1: "1 Snapshot Lane",
        service_address_line_2: null,
        service_city: "Testville",
        service_state_or_region: null,
        service_postal_code: "T0T0T0",
        phone: "5551119999",
        source: "website",
        preferred_service_type: "inspection",
        lifecycle_status: "active",
        notes: null,
      }),
    );
    customerId = customer.id;

    const job = await dataSource.getRepository(JobEntity).save(
      dataSource.getRepository(JobEntity).create({
        organization_id: orgId,
        customer_id: customerId,
        title: `Send Snapshot Job ${token}`,
        description: "finance send snapshot smoke",
        lead_source: "website",
        requested_service_type: "inspection",
        job_type: "inspection",
        status: "completed",
        service_address_line_1: "1 Snapshot Lane",
        service_address_line_2: null,
        service_city: "Testville",
        service_state_or_region: null,
        service_postal_code: "T0T0T0",
      }),
    );
    jobId = job.id;

    const invoice = await dataSource.getRepository(InvoiceEntity).save(
      dataSource.getRepository(InvoiceEntity).create({
        organization_id: orgId,
        job_id: jobId,
        description: "Send snapshot harness invoice",
        status: "unpaid",
        amount_cents: 15_000,
        subtotal_cents: 15_000,
        tax_rate_bps_snapshot: 0,
        tax_cents: 0,
        total_cents: 15_000,
        issued_at: new Date(),
        due_at: new Date(),
        paid_at: null,
        document_number: null,
        customer_facing_snapshot_json: null,
      }),
    );
    invoiceId = invoice.id;

    await dataSource.getRepository(InvoiceLineItemEntity).save(
      dataSource.getRepository(InvoiceLineItemEntity).create({
        invoice_id: invoiceId,
        pricebook_item_id: null,
        document_line_key: `snap-line-${token}`,
        sku_snapshot: "SKU-SNAP",
        name_snapshot: "Snapshot line",
        description_snapshot: "Line for send smoke",
        item_type_snapshot: "service",
        unit_of_measure_snapshot: "each",
        unit_price_cents_snapshot: 15_000,
        base_cost_cents_snapshot: null,
        material_cost_cents_snapshot: null,
        labor_cost_cents_snapshot: null,
        estimated_labor_minutes_snapshot: null,
        warranty_months_snapshot: null,
        pricebook_bundle_id: null,
        bundle_requirement_id: null,
        catalog_unit_price_cents_snapshot: null,
        quantity: "1",
        line_subtotal_cents: 15_000,
        sort_order: 0,
      }),
    );

    const sendResult = await sendPipeline.finalizeCustomerFacingSend({
      organizationId: orgId,
      invoice,
      job,
      customer,
      orgSettings: null,
      frozenVia: "email",
    });

    const reloaded = await dataSource.getRepository(InvoiceEntity).findOneOrFail({
      where: { id: invoiceId, organization_id: orgId },
    });

    results.push({
      name: "send allocates document_number and freezes snapshot",
      ok: Boolean(reloaded.customer_facing_snapshot_json?.trim())
        && Boolean(reloaded.document_number?.trim())
        && sendResult.documentNumber === reloaded.document_number,
      detail: {
        documentNumber: reloaded.document_number,
        frozen: snapshotService.isFrozen(reloaded),
      },
    });

    results.push({
      name: "frozen invoice would reject customer-facing line edits (409 guard)",
      ok: snapshotService.isFrozen(reloaded),
      detail: { guardCode: "invoice_customer_snapshot_frozen" },
    });

    const secondSend = await sendPipeline.finalizeCustomerFacingSend({
      organizationId: orgId,
      invoice: reloaded,
      job,
      customer,
      orgSettings: null,
      frozenVia: "sms",
    });

    results.push({
      name: "second send is idempotent (same document number)",
      ok: secondSend.documentNumber === reloaded.document_number,
      detail: { first: reloaded.document_number, second: secondSend.documentNumber },
    });
  } catch (error) {
    results.push({
      name: "send snapshot smoke harness",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (invoiceId) {
      await dataSource.getRepository(InvoiceLineItemEntity).delete({ invoice_id: invoiceId });
      await dataSource.getRepository(InvoiceEntity).delete({ id: invoiceId });
    }
    if (jobId) {
      await dataSource.getRepository(JobEntity).delete({ id: jobId });
    }
    if (customerId) {
      await dataSource.getRepository(CustomerEntity).delete({ id: customerId });
    }
    if (orgId) {
      await dataSource.getRepository(OrganizationInvoiceSequenceEntity).delete({ organization_id: orgId });
      await dataSource.getRepository(OrganizationEntity).delete({ id: orgId });
    }
    await dataSource.destroy();
  }

  const failed = results.filter((row) => !row.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
