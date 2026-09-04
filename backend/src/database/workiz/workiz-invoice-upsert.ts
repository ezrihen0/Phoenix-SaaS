import { randomUUID } from "crypto";

import { DataSource } from "typeorm";

import { inferServiceType } from "./workiz-invoice-parser";
import {
  hasAuthoritativePdfEnrichment,
  parseWorkizImportSnapshot,
  upsertCsvSyntheticSettlementPayment,
} from "./workiz-import-payment-reconciliation";
import { mapServiceTypeToDefaultJobType } from "../../crm/constants";
import { CustomerEntity } from "../entities/customer.entity";
import { InvoiceEntity } from "../entities/invoice.entity";
import { InvoiceLineItemEntity } from "../entities/invoice-line-item.entity";
import { JobEntity } from "../entities/job.entity";

export const WORKIZ_HISTORICAL_IMPORT_SOURCE = "workiz_historical_import";

export type ExistingWorkizImportIndex = Map<string, {
  invoiceId: string;
  jobId: string;
  invoiceCode: string;
}>;

export type WorkizHistoricalLineItemInput = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

export type WorkizHistoricalPaymentInput = {
  amountCents: number;
  occurredAt: Date | null;
  methodLabel: string;
};

export type WorkizHistoricalInvoiceInput = {
  invoiceCode: string;
  jobCode: string | null;
  invoiceDate: Date;
  dueDate: Date | null;
  subtotalCents: number;
  taxCents: number;
  taxRateBps: number;
  totalCents: number;
  paid: boolean;
  paidAt: Date | null;
  lineItems: WorkizHistoricalLineItemInput[];
  payments: WorkizHistoricalPaymentInput[];
  notes: string | null;
  provenance: Record<string, unknown>;
};

export function buildCsvProvenanceSnapshot(input: {
  invoiceCode: string;
  jobCode: string | null;
  sourceFilename: string;
  importedAt: string;
  financialMismatch: boolean;
  statusRaw: string;
  mismatchReason: string | null;
}): string {
  return JSON.stringify({
    import_source: WORKIZ_HISTORICAL_IMPORT_SOURCE,
    source_kind: "csv",
    workiz_invoice_code: input.invoiceCode,
    workiz_job_code: input.jobCode,
    source_filename: input.sourceFilename,
    imported_at: input.importedAt,
    financial_mismatch: input.financialMismatch,
    financial_mismatch_reason: input.mismatchReason,
    status_raw: input.statusRaw,
    enrichment_status: "pending_pdf",
  });
}

export async function loadExistingWorkizImportIndex(
  dataSource: DataSource,
  organizationId: string,
): Promise<ExistingWorkizImportIndex> {
  const invoices = await dataSource.getRepository(InvoiceEntity).find({
    where: { organization_id: organizationId },
  });

  const index: ExistingWorkizImportIndex = new Map();
  for (const invoice of invoices) {
    if (!invoice.branding_snapshot_json) continue;
    try {
      const snapshot = JSON.parse(invoice.branding_snapshot_json) as {
        import_source?: string;
        workiz_invoice_code?: string;
      };
      if (snapshot.import_source !== WORKIZ_HISTORICAL_IMPORT_SOURCE || !snapshot.workiz_invoice_code) continue;
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

export async function upsertHistoricalWorkizInvoice(input: {
  dataSource: DataSource;
  organizationId: string;
  historical: WorkizHistoricalInvoiceInput;
  customerId: string;
  existing?: { invoiceId: string; jobId: string };
}): Promise<{ jobId: string; invoiceId: string; created: boolean }> {
  const jobRepo = input.dataSource.getRepository(JobEntity);
  const invoiceRepo = input.dataSource.getRepository(InvoiceEntity);
  const lineItemRepo = input.dataSource.getRepository(InvoiceLineItemEntity);

  const customer = await input.dataSource.getRepository(CustomerEntity).findOneOrFail({
    where: { id: input.customerId, organization_id: input.organizationId },
  });

  const primaryDescription = input.historical.lineItems[0]?.description ?? "Historical Workiz service";
  const serviceType = inferServiceType(primaryDescription);
  const invoiceDate = input.historical.invoiceDate;
  const paidAt = input.historical.paid ? (input.historical.paidAt ?? invoiceDate) : null;

  let jobId = input.existing?.jobId;
  if (!jobId) {
    const job = await jobRepo.save(jobRepo.create({
      id: randomUUID(),
      organization_id: input.organizationId,
      customer_id: customer.id,
      service_id: null,
      assigned_technician_id: null,
      title: `Workiz ${input.historical.invoiceCode} — ${customer.full_name}`,
      description: [
        `Imported from Workiz historical invoice ${input.historical.invoiceCode}.`,
        input.historical.notes ? `Notes: ${input.historical.notes}` : null,
      ].filter(Boolean).join("\n"),
      lead_source: "repeat_customer",
      requested_service_type: serviceType,
      job_type: mapServiceTypeToDefaultJobType(serviceType),
      status: input.historical.paid ? "paid" : "completed",
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
  }

  const brandingSnapshot = JSON.stringify(input.historical.provenance);
  let invoiceId = input.existing?.invoiceId;
  if (!invoiceId) {
    const invoice = await invoiceRepo.save(invoiceRepo.create({
      id: randomUUID(),
      job_id: jobId,
      organization_id: input.organizationId,
      description: `Workiz Invoice #${input.historical.invoiceCode}`,
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
        document_line_key: `workiz:${input.historical.invoiceCode}:line:${index + 1}`,
        sku_snapshot: `WORKIZ-${input.historical.invoiceCode}-${index + 1}`,
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
  const snapshot = parseWorkizImportSnapshot(invoiceRecord.branding_snapshot_json)
    ?? (typeof input.historical.provenance === "object" ? input.historical.provenance : null);

  if (!hasAuthoritativePdfEnrichment(snapshot)) {
    for (const payment of input.historical.payments) {
      await upsertCsvSyntheticSettlementPayment({
        manager: input.dataSource.manager,
        organizationId: input.organizationId,
        invoice: invoiceRecord,
        invoiceCode: input.historical.invoiceCode,
        payment: {
          amountCents: payment.amountCents,
          methodLabel: payment.methodLabel,
          statusLabel: "Paid",
          occurredAt: payment.occurredAt,
        },
      });
    }
  }

  return {
    jobId: jobId!,
    invoiceId: invoiceId!,
    created: !input.existing,
  };
}
