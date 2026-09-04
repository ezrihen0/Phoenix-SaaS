import type { EntityManager } from "typeorm";

import type { InvoiceStatus, QuoteStatus } from "./constants";
import type { DocumentSnapshotService, SnapshotLineDraft } from "./document-snapshot.service";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { QuoteEntity } from "../database/entities/quote.entity";

export type CrmDocumentPersistenceTestHooks = {
  afterHeaderWrite?: (manager: EntityManager) => void | Promise<void>;
  afterLineDelete?: (manager: EntityManager) => void | Promise<void>;
};

type DocumentTotals = {
  totalCents: number;
  subtotalCents: number;
  taxRateBpsSnapshot: number;
  taxCents: number;
};

export async function persistInvoiceHeaderAndLineItems(
  manager: EntityManager,
  documentSnapshotService: DocumentSnapshotService,
  input: {
    organizationId: string;
    jobId: string;
    existingInvoice: InvoiceEntity | null;
    description: string;
    invoiceTotals: DocumentTotals;
    status: InvoiceStatus;
    paid_at: Date | null;
    due_at: Date;
    hasSnapshotLineItems: boolean;
    lineDrafts: SnapshotLineDraft[];
    testHooks?: CrmDocumentPersistenceTestHooks;
  },
) {
  const invoiceRepository = manager.getRepository(InvoiceEntity);
  let invoice: InvoiceEntity;

  if (input.existingInvoice) {
    input.existingInvoice.description = input.description;
    input.existingInvoice.amount_cents = input.invoiceTotals.totalCents;
    input.existingInvoice.subtotal_cents = input.invoiceTotals.subtotalCents;
    input.existingInvoice.tax_rate_bps_snapshot = input.invoiceTotals.taxRateBpsSnapshot;
    input.existingInvoice.tax_cents = input.invoiceTotals.taxCents;
    input.existingInvoice.total_cents = input.invoiceTotals.totalCents;
    input.existingInvoice.status = input.status;
    input.existingInvoice.paid_at = input.paid_at;
    input.existingInvoice.due_at = input.due_at;
    invoice = await invoiceRepository.save(input.existingInvoice);
  } else {
    invoice = await invoiceRepository.save(
      invoiceRepository.create({
        organization_id: input.organizationId,
        job_id: input.jobId,
        description: input.description,
        amount_cents: input.invoiceTotals.totalCents,
        subtotal_cents: input.invoiceTotals.subtotalCents,
        tax_rate_bps_snapshot: input.invoiceTotals.taxRateBpsSnapshot,
        tax_cents: input.invoiceTotals.taxCents,
        total_cents: input.invoiceTotals.totalCents,
        status: input.status,
        paid_at: input.paid_at,
        due_at: input.due_at,
      }),
    );
  }

  await input.testHooks?.afterHeaderWrite?.(manager);

  await documentSnapshotService.replaceInvoiceLineItems(
    invoice.id,
    input.hasSnapshotLineItems ? input.lineDrafts : [],
    {
      manager,
      afterLineDelete: input.testHooks?.afterLineDelete,
    },
  );

  return invoice;
}

export async function persistQuoteHeaderAndLineItems(
  manager: EntityManager,
  documentSnapshotService: DocumentSnapshotService,
  input: {
    organizationId: string;
    jobId: string;
    existingQuote: QuoteEntity | null;
    description: string;
    quoteTotals: DocumentTotals;
    status: QuoteStatus;
    sent_at: Date | null;
    approved_at: Date | null;
    hasSnapshotLineItems: boolean;
    lineDrafts: SnapshotLineDraft[];
    testHooks?: CrmDocumentPersistenceTestHooks;
  },
) {
  const quoteRepository = manager.getRepository(QuoteEntity);
  let quote: QuoteEntity;

  if (input.existingQuote) {
    input.existingQuote.description = input.description;
    input.existingQuote.price_cents = input.quoteTotals.totalCents;
    input.existingQuote.subtotal_cents = input.quoteTotals.subtotalCents;
    input.existingQuote.tax_rate_bps_snapshot = input.quoteTotals.taxRateBpsSnapshot;
    input.existingQuote.tax_cents = input.quoteTotals.taxCents;
    input.existingQuote.total_cents = input.quoteTotals.totalCents;
    input.existingQuote.status = input.status;
    input.existingQuote.sent_at = input.sent_at;
    input.existingQuote.approved_at = input.approved_at;
    quote = await quoteRepository.save(input.existingQuote);
  } else {
    quote = await quoteRepository.save(
      quoteRepository.create({
        organization_id: input.organizationId,
        job_id: input.jobId,
        description: input.description,
        price_cents: input.quoteTotals.totalCents,
        subtotal_cents: input.quoteTotals.subtotalCents,
        tax_rate_bps_snapshot: input.quoteTotals.taxRateBpsSnapshot,
        tax_cents: input.quoteTotals.taxCents,
        total_cents: input.quoteTotals.totalCents,
        status: input.status,
        sent_at: input.sent_at,
        approved_at: input.approved_at,
      }),
    );
  }

  await input.testHooks?.afterHeaderWrite?.(manager);

  await documentSnapshotService.replaceQuoteLineItems(
    quote.id,
    input.hasSnapshotLineItems ? input.lineDrafts : [],
    {
      manager,
      afterLineDelete: input.testHooks?.afterLineDelete,
    },
  );

  return quote;
}
