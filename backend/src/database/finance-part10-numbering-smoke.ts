import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import { DataSource, In } from "typeorm";

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

async function createHarnessInvoice(
  dataSource: DataSource,
  input: {
    organizationId: string;
    customerId: string;
    token: string;
    suffix: string;
  },
) {
  const job = await dataSource.getRepository(JobEntity).save(
    dataSource.getRepository(JobEntity).create({
      organization_id: input.organizationId,
      customer_id: input.customerId,
      title: `Phase10 job ${input.suffix} ${input.token}`,
      description: "phase10 numbering smoke",
      lead_source: "website",
      requested_service_type: "inspection",
      job_type: "inspection",
      status: "completed",
      service_address_line_1: "1 Number Lane",
      service_city: "Testville",
      service_postal_code: "T0T0T0",
    }),
  );

  const invoice = await dataSource.getRepository(InvoiceEntity).save(
    dataSource.getRepository(InvoiceEntity).create({
      organization_id: input.organizationId,
      job_id: job.id,
      description: `Phase10 invoice ${input.suffix}`,
      status: "unpaid",
      amount_cents: 10_000,
      subtotal_cents: 10_000,
      tax_rate_bps_snapshot: 0,
      tax_cents: 0,
      total_cents: 10_000,
      issued_at: new Date(),
      due_at: new Date(),
      document_number: null,
      customer_facing_snapshot_json: null,
    }),
  );

  await dataSource.getRepository(InvoiceLineItemEntity).save(
    dataSource.getRepository(InvoiceLineItemEntity).create({
      invoice_id: invoice.id,
      pricebook_item_id: null,
      document_line_key: `p10-line-${input.suffix}-${input.token}`,
      sku_snapshot: "SKU-P10",
      name_snapshot: "Phase10 line",
      description_snapshot: null,
      item_type_snapshot: "service",
      unit_of_measure_snapshot: "each",
      unit_price_cents_snapshot: 10_000,
      quantity: "1",
      line_subtotal_cents: 10_000,
      sort_order: 0,
    }),
  );

  const customer = await dataSource.getRepository(CustomerEntity).findOneOrFail({
    where: { id: input.customerId },
  });

  return { job, invoice, customer };
}

async function main() {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  const token = randomUUID().slice(0, 8);
  const results: SmokeResult[] = [];
  const orgIds: string[] = [];
  const cleanupInvoiceIds: string[] = [];
  const cleanupJobIds: string[] = [];
  const cleanupCustomerIds: string[] = [];

  const snapshotService = new InvoiceCustomerFacingSnapshotService(new DocumentBrandingSnapshotService());
  const numberingService = new InvoiceNumberingService(
    dataSource.getRepository(OrganizationInvoiceSequenceEntity),
  );
  const sendPipeline = new InvoiceSendPipelineService(dataSource, numberingService, snapshotService);

  try {
    const org = await dataSource.getRepository(OrganizationEntity).save(
      dataSource.getRepository(OrganizationEntity).create({
        name: `Phase10 Numbering ${token}`,
        slug: `p10-num-${token}`,
        is_active: true,
      }),
    );
    orgIds.push(org.id);

    const customer = await dataSource.getRepository(CustomerEntity).save(
      dataSource.getRepository(CustomerEntity).create({
        organization_id: org.id,
        full_name: "Phase10 Customer",
        email: `p10-${token}@example.com`,
        service_address_line_1: "1 Lane",
        service_city: "Testville",
        service_postal_code: "T0T0T0",
        phone: "5551112222",
        source: "website",
        preferred_service_type: "inspection",
        lifecycle_status: "active",
      }),
    );
    cleanupCustomerIds.push(customer.id);

    const first = await createHarnessInvoice(dataSource, {
      organizationId: org.id,
      customerId: customer.id,
      token,
      suffix: "a",
    });
    const second = await createHarnessInvoice(dataSource, {
      organizationId: org.id,
      customerId: customer.id,
      token,
      suffix: "b",
    });
    cleanupJobIds.push(first.job.id, second.job.id);
    cleanupInvoiceIds.push(first.invoice.id, second.invoice.id);

    const [sendA, sendB] = await Promise.all([
      sendPipeline.finalizeCustomerFacingSend({
        organizationId: org.id,
        invoice: first.invoice,
        job: first.job,
        customer: first.customer,
        orgSettings: null,
        frozenVia: "email",
      }),
      sendPipeline.finalizeCustomerFacingSend({
        organizationId: org.id,
        invoice: second.invoice,
        job: second.job,
        customer: second.customer,
        orgSettings: null,
        frozenVia: "email",
      }),
    ]);

    results.push({
      name: "concurrent send assigns distinct sequential document numbers",
      ok: sendA.documentNumber !== sendB.documentNumber
        && /^\d+$/.test(sendA.documentNumber)
        && /^\d+$/.test(sendB.documentNumber),
      detail: { a: sendA.documentNumber, b: sendB.documentNumber },
    });

    const orgB = await dataSource.getRepository(OrganizationEntity).save(
      dataSource.getRepository(OrganizationEntity).create({
        name: `Phase10 Tenant B ${token}`,
        slug: `p10-b-${token}`,
        is_active: true,
      }),
    );
    orgIds.push(orgB.id);

    const customerB = await dataSource.getRepository(CustomerEntity).save(
      dataSource.getRepository(CustomerEntity).create({
        organization_id: orgB.id,
        full_name: "Phase10 Customer B",
        email: `p10b-${token}@example.com`,
        service_address_line_1: "2 Lane",
        service_city: "Testville",
        service_postal_code: "T0T0T0",
        phone: "5553334444",
        source: "website",
        preferred_service_type: "inspection",
        lifecycle_status: "active",
      }),
    );
    cleanupCustomerIds.push(customerB.id);

    const tenantBInvoice = await createHarnessInvoice(dataSource, {
      organizationId: orgB.id,
      customerId: customerB.id,
      token,
      suffix: "tenant-b",
    });
    cleanupJobIds.push(tenantBInvoice.job.id);
    cleanupInvoiceIds.push(tenantBInvoice.invoice.id);

    const sendTenantB = await sendPipeline.finalizeCustomerFacingSend({
      organizationId: orgB.id,
      invoice: tenantBInvoice.invoice,
      job: tenantBInvoice.job,
      customer: tenantBInvoice.customer,
      orgSettings: null,
      frozenVia: "email",
    });

    results.push({
      name: "two organizations may both use document number 1001",
      ok: sendA.documentNumber === "1001" && sendTenantB.documentNumber === "1001",
      detail: { orgA: sendA.documentNumber, orgB: sendTenantB.documentNumber },
    });

    const retrySend = await sendPipeline.finalizeCustomerFacingSend({
      organizationId: org.id,
      invoice: first.invoice,
      job: first.job,
      customer: first.customer,
      orgSettings: null,
      frozenVia: "sms",
    });

    results.push({
      name: "resend is idempotent for document number",
      ok: retrySend.documentNumber === sendA.documentNumber,
      detail: { first: sendA.documentNumber, retry: retrySend.documentNumber },
    });
  } catch (error) {
    results.push({
      name: "finance-part10-numbering-smoke harness",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (cleanupInvoiceIds.length > 0) {
      await dataSource.getRepository(InvoiceLineItemEntity).delete({ invoice_id: In(cleanupInvoiceIds) });
    }
    for (const invoiceId of cleanupInvoiceIds) {
      await dataSource.getRepository(InvoiceEntity).delete({ id: invoiceId });
    }
    for (const jobId of cleanupJobIds) {
      await dataSource.getRepository(JobEntity).delete({ id: jobId });
    }
    for (const customerId of cleanupCustomerIds) {
      await dataSource.getRepository(CustomerEntity).delete({ id: customerId });
    }
    for (const orgId of orgIds) {
      await dataSource.getRepository(OrganizationInvoiceSequenceEntity).delete({ organization_id: orgId });
      await dataSource.getRepository(OrganizationEntity).delete({ id: orgId });
    }
    await dataSource.destroy();
  }

  const failed = results.filter((row) => !row.ok);
  console.log(JSON.stringify({ outcome: failed.length === 0 ? "PASS" : "FAIL", results }, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
