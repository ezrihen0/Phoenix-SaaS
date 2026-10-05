import { randomUUID } from "crypto";

import { DataSource, EntityManager } from "typeorm";

import { mapServiceTypeToDefaultJobType } from "../../crm/constants";
import { CustomerEntity } from "../entities/customer.entity";
import { InvoiceEntity } from "../entities/invoice.entity";
import { InvoiceLineItemEntity } from "../entities/invoice-line-item.entity";
import { InvoicePaymentEntity } from "../entities/invoice-payment.entity";
import { JobEntity } from "../entities/job.entity";
import { inferServiceType } from "../workiz/workiz-invoice-parser";
import { JOBBER_HISTORICAL_IMPORT_SOURCE, parseJobberJobProvenance } from "./jobber-job-provenance";

export type ExistingJobberImportIndex = Map<string, {
  invoiceId: string;
  jobId: string;
  invoiceNumber: string;
}>;

export type JobberHistoricalLineItemInput = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

export type JobberHistoricalInvoiceInput = {
  invoiceNumber: string;
  jobRef: string | null;
  invoiceDate: Date;
  dueDate: Date | null;
  subtotalCents: number;
  taxCents: number;
  taxRateBps: number;
  totalCents: number;
  paid: boolean;
  paidAt: Date | null;
  lineItems: JobberHistoricalLineItemInput[];
  provenance: Record<string, unknown>;
};

export function buildJobberCsvProvenanceSnapshot(input: {
  invoiceNumber: string;
  jobRef: string | null;
  sourceFilename: string;
  importedAt: string;
  statusRaw: string;
}): string {
  return JSON.stringify({
    import_source: JOBBER_HISTORICAL_IMPORT_SOURCE,
    source_kind: "csv",
    jobber_invoice_number: input.invoiceNumber,
    jobber_job_ref: input.jobRef,
    source_filename: input.sourceFilename,
    imported_at: input.importedAt,
    status_raw: input.statusRaw,
  });
}

export async function loadExistingJobberImportIndex(
  dataSource: DataSource,
  organizationId: string,
): Promise<ExistingJobberImportIndex> {
  const invoices = await dataSource.getRepository(InvoiceEntity).find({
    where: { organization_id: organizationId },
  });

  const index: ExistingJobberImportIndex = new Map();
  for (const invoice of invoices) {
    if (!invoice.branding_snapshot_json) continue;
    try {
      const snapshot = JSON.parse(invoice.branding_snapshot_json) as {
        import_source?: string;
        jobber_invoice_number?: string;
      };
      if (snapshot.import_source !== JOBBER_HISTORICAL_IMPORT_SOURCE || !snapshot.jobber_invoice_number) continue;
      index.set(snapshot.jobber_invoice_number, {
        invoiceId: invoice.id,
        jobId: invoice.job_id,
        invoiceNumber: snapshot.jobber_invoice_number,
      });
    } catch {
      // ignore malformed snapshots
    }
  }

  return index;
}

async function findJobForInvoice(input: {
  dataSource: DataSource;
  organizationId: string;
  customerId: string;
  jobRef: string | null;
}): Promise<string | null> {
  if (!input.jobRef) return null;
  const jobs = await input.dataSource.getRepository(JobEntity).find({
    where: {
      organization_id: input.organizationId,
      customer_id: input.customerId,
    },
  });

  for (const job of jobs) {
    const provenance = parseJobberJobProvenance(job.description);
    if (provenance?.job_ref === input.jobRef) {
      return job.id;
    }
    if (job.title.includes(input.jobRef)) {
      return job.id;
    }
  }

  return null;
}

async function upsertJobberCsvSyntheticSettlementPayment(input: {
  manager: EntityManager;
  organizationId: string;
  invoice: InvoiceEntity;
  invoiceNumber: string;
  amountCents: number;
  occurredAt: Date | null;
}) {
  const paymentRepo = input.manager.getRepository(InvoicePaymentEntity);
  const reference = `jobber:${input.invoiceNumber}:payment:1`;
  const existingPayment = await paymentRepo.findOne({
    where: {
      invoice_id: input.invoice.id,
      reference,
      organization_id: input.organizationId,
    },
  });

  if (existingPayment) {
    return { action: "unchanged" as const };
  }

  await paymentRepo.save(paymentRepo.create({
    id: randomUUID(),
    organization_id: input.organizationId,
    invoice_id: input.invoice.id,
    entry_type: "payment",
    amount_cents: input.amountCents,
    method: "other",
    reference,
    note: "Jobber CSV import: derived_from_invoice_paid_status",
    occurred_at: input.occurredAt ?? input.invoice.issued_at,
    created_by_auth_user_id: null,
  }));

  return { action: "created" as const };
}

export async function upsertHistoricalJobberInvoice(input: {
  dataSource: DataSource;
  organizationId: string;
  historical: JobberHistoricalInvoiceInput;
  customerId: string;
  existing?: { invoiceId: string; jobId: string };
}): Promise<{ jobId: string; invoiceId: string; created: boolean }> {
  const jobRepo = input.dataSource.getRepository(JobEntity);
  const invoiceRepo = input.dataSource.getRepository(InvoiceEntity);
  const lineItemRepo = input.dataSource.getRepository(InvoiceLineItemEntity);

  const customer = await input.dataSource.getRepository(CustomerEntity).findOneOrFail({
    where: { id: input.customerId, organization_id: input.organizationId },
  });

  const primaryDescription = input.historical.lineItems[0]?.description ?? "Jobber historical service";
  const serviceType = inferServiceType(primaryDescription);
  const invoiceDate = input.historical.invoiceDate;
  const paidAt = input.historical.paid ? (input.historical.paidAt ?? invoiceDate) : null;

  let jobId = input.existing?.jobId;
  if (!jobId) {
    const linkedJobId = await findJobForInvoice({
      dataSource: input.dataSource,
      organizationId: input.organizationId,
      customerId: customer.id,
      jobRef: input.historical.jobRef,
    });
    jobId = linkedJobId ?? undefined;
  }

  if (!jobId) {
    const job = await jobRepo.save(jobRepo.create({
      id: randomUUID(),
      organization_id: input.organizationId,
      customer_id: customer.id,
      service_id: null,
      assigned_technician_id: null,
      title: `Jobber ${input.historical.jobRef ?? input.historical.invoiceNumber} — ${customer.full_name}`,
      description: `Imported from Jobber historical invoice ${input.historical.invoiceNumber}.`,
      lead_source: customer.source ?? "other",
      requested_service_type: serviceType,
      job_type: mapServiceTypeToDefaultJobType(serviceType),
      status: input.historical.paid ? "paid" : "completed",
      service_address_line_1: customer.service_address_line_1,
      service_address_line_2: customer.service_address_line_2,
      service_city: customer.service_city,
      service_state_or_region: customer.service_state_or_region,
      service_postal_code: customer.service_postal_code,
      scheduled_for: null,
      scheduled_window: null,
      requested_at: invoiceDate,
      completed_at: invoiceDate,
      paid_at: paidAt,
      created_by_auth_user_id: null,
      updated_by_auth_user_id: null,
    }));
    jobId = job.id;
  }

  const brandingSnapshot = JSON.stringify(input.historical.provenance);
  let invoiceId = input.existing?.invoiceId;
  if (!invoiceId) {
    const invoice = await invoiceRepo.save(invoiceRepo.create({
      id: randomUUID(),
      job_id: jobId,
      organization_id: input.organizationId,
      description: `Jobber Invoice #${input.historical.invoiceNumber}`,
      amount_cents: input.historical.totalCents,
      subtotal_cents: input.historical.subtotalCents,
      tax_rate_bps_snapshot: input.historical.taxRateBps,
      tax_cents: input.historical.taxCents,
      total_cents: input.historical.totalCents,
      status: input.historical.paid ? "paid" : "unpaid",
      issued_at: invoiceDate,
      due_at: input.historical.dueDate ?? invoiceDate,
      paid_at: paidAt,
      branding_snapshot_json: brandingSnapshot,
    }));
    invoiceId = invoice.id;
  }

  const existingLineItems = await lineItemRepo.find({ where: { invoice_id: invoiceId } });
  if (existingLineItems.length === 0) {
    await lineItemRepo.save(
      input.historical.lineItems.map((lineItem, index) => lineItemRepo.create({
        id: randomUUID(),
        invoice_id: invoiceId!,
        pricebook_item_id: null,
        document_line_key: `jobber:${input.historical.invoiceNumber}:line:${index + 1}`,
        sku_snapshot: `JOBBER-${input.historical.invoiceNumber}-${index + 1}`,
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

  const invoiceRecord = await invoiceRepo.findOneOrFail({
    where: { id: invoiceId!, organization_id: input.organizationId },
  });

  if (input.historical.paid && input.historical.totalCents > 0) {
    await upsertJobberCsvSyntheticSettlementPayment({
      manager: input.dataSource.manager,
      organizationId: input.organizationId,
      invoice: invoiceRecord,
      invoiceNumber: input.historical.invoiceNumber,
      amountCents: input.historical.totalCents,
      occurredAt: paidAt,
    });
  }

  return {
    jobId: jobId!,
    invoiceId: invoiceId!,
    created: !input.existing,
  };
}
