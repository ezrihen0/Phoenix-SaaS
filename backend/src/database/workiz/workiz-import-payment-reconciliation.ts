import { randomUUID } from "crypto";

import { EntityManager, In } from "typeorm";

import { mapPaymentMethod } from "./workiz-invoice-parser";
import type { WorkizPdfNormalizedInvoice } from "./workiz-invoice-pdf-normalizer";
import { InvoicePaymentEntity } from "../entities/invoice-payment.entity";
import { InvoiceEntity } from "../entities/invoice.entity";

export const WORKIZ_IMPORTER_PAYMENT_REFERENCE_PATTERN = /^workiz:([A-Z0-9]+):payment:(\d+)$/i;

export const WORKIZ_PAYMENT_RECONCILIATION_TOLERANCE_CENTS = 2;

export type WorkizPaymentSnapshotRow = {
  occurred_at: string | null;
  method: string;
  amount_cents: number;
  status: string;
};

export type WorkizPaymentRowKind =
  | "synthetic_csv_settlement"
  | "authoritative_pdf"
  | "legacy_workiz_import"
  | "importer_unknown"
  | "native_manual";

export type WorkizPaymentRowClassification = {
  paymentId: string;
  kind: WorkizPaymentRowKind;
  reference: string | null;
  amountCents: number;
  note: string | null;
};

export type AuthoritativePdfPaymentInput = {
  amountCents: number;
  methodLabel: string;
  statusLabel: string;
  occurredAt: Date | null;
};

export type ProposedWorkizPaymentRow = {
  reference: string;
  amountCents: number;
  method: ReturnType<typeof mapPaymentMethod>;
  note: string;
  occurredAt: Date;
};

export function parseWorkizPaymentReference(reference: string | null | undefined) {
  if (!reference) return null;
  const match = reference.trim().match(WORKIZ_IMPORTER_PAYMENT_REFERENCE_PATTERN);
  if (!match) return null;
  return {
    invoiceCode: match[1].toUpperCase(),
    index: Number(match[2]),
  };
}

export function classifyWorkizInvoicePayment(
  payment: Pick<InvoicePaymentEntity, "id" | "reference" | "note" | "amount_cents" | "created_by_auth_user_id" | "idempotency_key">,
  workizInvoiceCode: string | null,
): WorkizPaymentRowClassification {
  if (payment.idempotency_key) {
    return {
      paymentId: payment.id,
      kind: "native_manual",
      reference: payment.reference,
      amountCents: payment.amount_cents,
      note: payment.note,
    };
  }

  if (payment.created_by_auth_user_id) {
    return {
      paymentId: payment.id,
      kind: "native_manual",
      reference: payment.reference,
      amountCents: payment.amount_cents,
      note: payment.note,
    };
  }

  const parsedReference = parseWorkizPaymentReference(payment.reference);
  if (!parsedReference) {
    return {
      paymentId: payment.id,
      kind: "native_manual",
      reference: payment.reference,
      amountCents: payment.amount_cents,
      note: payment.note,
    };
  }

  if (workizInvoiceCode && parsedReference.invoiceCode !== workizInvoiceCode.toUpperCase()) {
    return {
      paymentId: payment.id,
      kind: "native_manual",
      reference: payment.reference,
      amountCents: payment.amount_cents,
      note: payment.note,
    };
  }

  const note = payment.note ?? "";
  if (note.includes("derived_from_csv_balance") || note.includes("Workiz CSV import:")) {
    return {
      paymentId: payment.id,
      kind: "synthetic_csv_settlement",
      reference: payment.reference,
      amountCents: payment.amount_cents,
      note: payment.note,
    };
  }

  if (note.includes("Workiz PDF enrichment:")) {
    return {
      paymentId: payment.id,
      kind: "authoritative_pdf",
      reference: payment.reference,
      amountCents: payment.amount_cents,
      note: payment.note,
    };
  }

  if (note.includes("Workiz import:")) {
    return {
      paymentId: payment.id,
      kind: "legacy_workiz_import",
      reference: payment.reference,
      amountCents: payment.amount_cents,
      note: payment.note,
    };
  }

  return {
    paymentId: payment.id,
    kind: "importer_unknown",
    reference: payment.reference,
    amountCents: payment.amount_cents,
    note: payment.note,
  };
}

export function isWorkizImporterGeneratedPayment(
  payment: Pick<InvoicePaymentEntity, "id" | "reference" | "note" | "amount_cents" | "created_by_auth_user_id" | "idempotency_key">,
  workizInvoiceCode: string | null,
) {
  const classification = classifyWorkizInvoicePayment(payment, workizInvoiceCode);
  return classification.kind !== "native_manual";
}

export function hasNativeOrManualPayments(
  payments: Array<Pick<InvoicePaymentEntity, "id" | "reference" | "note" | "amount_cents" | "created_by_auth_user_id" | "idempotency_key">>,
  workizInvoiceCode: string | null,
) {
  return payments.some((payment) => classifyWorkizInvoicePayment(payment, workizInvoiceCode).kind === "native_manual");
}

export function parseWorkizImportSnapshot(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      import_source?: string;
      source_kind?: string;
      workiz_invoice_code?: string;
      enrichment_status?: string;
      pdf_enrichment?: {
        payments_snapshot?: WorkizPaymentSnapshotRow[];
      };
    };
  } catch {
    return null;
  }
}

export function hasAuthoritativePdfEnrichment(snapshot: ReturnType<typeof parseWorkizImportSnapshot>) {
  return snapshot?.enrichment_status === "complete"
    && Array.isArray(snapshot?.pdf_enrichment?.payments_snapshot)
    && snapshot.pdf_enrichment.payments_snapshot.length > 0;
}

export function buildAuthoritativePdfPaymentRows(input: {
  invoiceCode: string;
  pdfPayments: AuthoritativePdfPaymentInput[];
  defaultOccurredAt: Date;
}): ProposedWorkizPaymentRow[] {
  return input.pdfPayments.map((payment, index) => ({
    reference: `workiz:${input.invoiceCode}:payment:${index + 1}`,
    amountCents: payment.amountCents,
    method: mapPaymentMethod(payment.methodLabel),
    note: `Workiz PDF enrichment: ${payment.methodLabel} (${payment.statusLabel})`,
    occurredAt: payment.occurredAt ?? input.defaultOccurredAt,
  }));
}

export function buildAuthoritativePdfPaymentRowsFromNormalized(
  invoiceCode: string,
  normalized: Pick<WorkizPdfNormalizedInvoice, "payments">,
  defaultOccurredAt: Date,
) {
  return buildAuthoritativePdfPaymentRows({
    invoiceCode,
    defaultOccurredAt,
    pdfPayments: normalized.payments.map((payment) => ({
      amountCents: payment.amount_cents,
      methodLabel: payment.method,
      statusLabel: payment.status,
      occurredAt: payment.occurred_at ? new Date(payment.occurred_at) : null,
    })),
  });
}

export function buildAuthoritativePdfPaymentRowsFromSnapshot(
  invoiceCode: string,
  paymentsSnapshot: WorkizPaymentSnapshotRow[],
  defaultOccurredAt: Date,
) {
  return buildAuthoritativePdfPaymentRows({
    invoiceCode,
    defaultOccurredAt,
    pdfPayments: paymentsSnapshot.map((payment) => ({
      amountCents: payment.amount_cents,
      methodLabel: payment.method,
      statusLabel: payment.status,
      occurredAt: payment.occurred_at ? new Date(payment.occurred_at) : null,
    })),
  });
}

function paymentRowsMatch(
  existing: InvoicePaymentEntity[],
  proposed: ProposedWorkizPaymentRow[],
  workizInvoiceCode: string,
) {
  const importerRows = existing
    .filter((payment) => isWorkizImporterGeneratedPayment(payment, workizInvoiceCode))
    .sort((left, right) => (left.reference ?? "").localeCompare(right.reference ?? ""));

  if (importerRows.length !== proposed.length) {
    return false;
  }

  for (let index = 0; index < proposed.length; index += 1) {
    const current = importerRows[index];
    const next = proposed[index];
    if ((current.reference ?? "") !== next.reference) return false;
    if (current.amount_cents !== next.amountCents) return false;
    if (current.method !== next.method) return false;
    if ((current.note ?? "") !== next.note) return false;
  }

  return true;
}

export function sumPaymentRowsCents(rows: Array<{ amountCents?: number; amount_cents?: number }>) {
  return rows.reduce((sum, row) => sum + (row.amountCents ?? row.amount_cents ?? 0), 0);
}

export function withinPaymentTolerance(left: number, right: number, toleranceCents = WORKIZ_PAYMENT_RECONCILIATION_TOLERANCE_CENTS) {
  return Math.abs(left - right) <= toleranceCents;
}

export async function reconcileAuthoritativePdfPayments(input: {
  manager: EntityManager;
  organizationId: string;
  invoice: InvoiceEntity;
  invoiceCode: string;
  pdfPayments: AuthoritativePdfPaymentInput[];
  defaultOccurredAt: Date;
}) {
  if (input.pdfPayments.length === 0) {
    return { action: "skipped_no_pdf_payments" as const };
  }

  const paymentRepo = input.manager.getRepository(InvoicePaymentEntity);
  const existing = await paymentRepo.find({
    where: {
      invoice_id: input.invoice.id,
      organization_id: input.organizationId,
    },
    order: { occurred_at: "ASC" },
  });

  if (hasNativeOrManualPayments(existing, input.invoiceCode)) {
    throw new Error(`Refusing to reconcile Workiz payments for ${input.invoiceCode}: native/manual payment rows exist.`);
  }

  const proposed = buildAuthoritativePdfPaymentRows({
    invoiceCode: input.invoiceCode,
    pdfPayments: input.pdfPayments,
    defaultOccurredAt: input.defaultOccurredAt,
  });

  if (paymentRowsMatch(existing, proposed, input.invoiceCode)) {
    return { action: "unchanged" as const, proposed };
  }

  const importerRows = existing.filter((payment) => isWorkizImporterGeneratedPayment(payment, input.invoiceCode));
  if (importerRows.length > 0) {
    await paymentRepo.delete({ id: In(importerRows.map((payment) => payment.id)) });
  }

  for (const row of proposed) {
    await paymentRepo.save(paymentRepo.create({
      id: randomUUID(),
      organization_id: input.organizationId,
      invoice_id: input.invoice.id,
      entry_type: "payment",
      amount_cents: row.amountCents,
      method: row.method,
      reference: row.reference,
      note: row.note,
      occurred_at: row.occurredAt,
      created_by_auth_user_id: null,
    }));
  }

  return { action: "replaced" as const, proposed };
}

export async function upsertCsvSyntheticSettlementPayment(input: {
  manager: EntityManager;
  organizationId: string;
  invoice: InvoiceEntity;
  invoiceCode: string;
  payment: AuthoritativePdfPaymentInput;
}) {
  const snapshot = parseWorkizImportSnapshot(input.invoice.branding_snapshot_json);
  if (hasAuthoritativePdfEnrichment(snapshot)) {
    return { action: "skipped_pdf_enriched" as const };
  }

  const paymentRepo = input.manager.getRepository(InvoicePaymentEntity);
  const reference = `workiz:${input.invoiceCode}:payment:1`;
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
    amount_cents: input.payment.amountCents,
    method: "other",
    reference,
    note: `Workiz CSV import: ${input.payment.methodLabel}`,
    occurred_at: input.payment.occurredAt ?? input.invoice.issued_at,
    created_by_auth_user_id: null,
  }));

  return { action: "created" as const };
}

export type WorkizPaymentRepairEligibility =
  | "AUTO_ELIGIBLE"
  | "NO_CHANGE"
  | "MANUAL_REVIEW";

export type WorkizPaymentRepairPlan = {
  invoiceId: string;
  workizInvoiceCode: string | null;
  invoiceTotalCents: number;
  currentPaymentRows: WorkizPaymentRowClassification[];
  currentPaymentSumCents: number;
  authoritativePaymentRows: ProposedWorkizPaymentRow[];
  authoritativePaymentSumCents: number;
  proposedRemovals: string[];
  proposedCreates: ProposedWorkizPaymentRow[];
  proposedLedgerSumCents: number;
  proposedLifecycleStatus: "sent" | "partial" | "paid" | "refunded" | "overpaid";
  eligibility: WorkizPaymentRepairEligibility;
  confidence: "high" | "low";
  skipReason: string | null;
};

function deriveLifecycleStatus(totalCents: number, netPaidCents: number): WorkizPaymentRepairPlan["proposedLifecycleStatus"] {
  if (netPaidCents <= 0) {
    return "sent";
  }
  if (netPaidCents > totalCents) {
    return "overpaid";
  }
  if (netPaidCents >= totalCents) {
    return "paid";
  }
  return "partial";
}

export function planWorkizPaymentRepair(input: {
  invoice: Pick<InvoiceEntity, "id" | "total_cents" | "status" | "issued_at" | "branding_snapshot_json">;
  payments: Array<Pick<InvoicePaymentEntity, "id" | "reference" | "note" | "amount_cents" | "created_by_auth_user_id" | "idempotency_key" | "entry_type" | "method">>;
}): WorkizPaymentRepairPlan {
  const snapshot = parseWorkizImportSnapshot(input.invoice.branding_snapshot_json);
  const workizInvoiceCode = snapshot?.workiz_invoice_code?.toUpperCase() ?? null;
  const currentRows = input.payments.map((payment) => classifyWorkizInvoicePayment(payment, workizInvoiceCode));
  const currentPaymentSumCents = input.payments.reduce((sum, payment) => {
    if (payment.entry_type === "payment" || payment.entry_type === "adjustment") {
      return sum + payment.amount_cents;
    }
    return sum;
  }, 0) - input.payments.reduce((sum, payment) => {
    if (payment.entry_type === "refund") {
      return sum + payment.amount_cents;
    }
    return sum;
  }, 0);

  const basePlan: WorkizPaymentRepairPlan = {
    invoiceId: input.invoice.id,
    workizInvoiceCode,
    invoiceTotalCents: input.invoice.total_cents,
    currentPaymentRows: currentRows,
    currentPaymentSumCents,
    authoritativePaymentRows: [],
    authoritativePaymentSumCents: 0,
    proposedRemovals: [],
    proposedCreates: [],
    proposedLedgerSumCents: 0,
    proposedLifecycleStatus: deriveLifecycleStatus(input.invoice.total_cents, currentPaymentSumCents),
    eligibility: "MANUAL_REVIEW",
    confidence: "low",
    skipReason: null,
  };

  if (snapshot?.import_source !== "workiz_historical_import") {
    return { ...basePlan, skipReason: "Invoice is not a Workiz historical import." };
  }

  const paymentsSnapshot = snapshot?.pdf_enrichment?.payments_snapshot ?? [];
  if (paymentsSnapshot.length === 0) {
    return { ...basePlan, skipReason: "No authoritative PDF payment snapshot in provenance." };
  }

  if (!workizInvoiceCode) {
    return { ...basePlan, skipReason: "Missing workiz_invoice_code in provenance." };
  }

  if (hasNativeOrManualPayments(input.payments, workizInvoiceCode)) {
    return { ...basePlan, skipReason: "Native or manual payment rows are present." };
  }

  const authoritativePaymentRows = buildAuthoritativePdfPaymentRowsFromSnapshot(
    workizInvoiceCode,
    paymentsSnapshot,
    input.invoice.issued_at,
  );
  const authoritativePaymentSumCents = sumPaymentRowsCents(authoritativePaymentRows);

  if (!withinPaymentTolerance(authoritativePaymentSumCents, input.invoice.total_cents)
    && !(input.invoice.total_cents === 0 && authoritativePaymentSumCents === 0)) {
    return {
      ...basePlan,
      authoritativePaymentRows,
      authoritativePaymentSumCents,
      skipReason: "Authoritative PDF payment sum does not reconcile to invoice total.",
    };
  }

  const importerPaymentIds = input.payments
    .filter((payment) => isWorkizImporterGeneratedPayment(payment, workizInvoiceCode))
    .map((payment) => payment.id);

  const unmatchedRows = input.payments.filter((payment) => !importerPaymentIds.includes(payment.id));
  if (unmatchedRows.length > 0) {
    return {
      ...basePlan,
      authoritativePaymentRows,
      authoritativePaymentSumCents,
      skipReason: "Unclassified payment rows would remain after repair.",
    };
  }

  const proposedLedgerSumCents = authoritativePaymentSumCents;
  const proposedLifecycleStatus = deriveLifecycleStatus(input.invoice.total_cents, proposedLedgerSumCents);

  const currentImporterRows = input.payments
    .filter((payment) => isWorkizImporterGeneratedPayment(payment, workizInvoiceCode))
    .sort((left, right) => (left.reference ?? "").localeCompare(right.reference ?? ""));

  const alreadyCorrect = currentImporterRows.length === authoritativePaymentRows.length
    && currentImporterRows.every((payment, index) => {
      const proposed = authoritativePaymentRows[index];
      return payment.reference === proposed.reference
        && payment.amount_cents === proposed.amountCents
        && payment.method === proposed.method
        && (payment.note ?? "") === proposed.note;
    });

  if (alreadyCorrect) {
    return {
      ...basePlan,
      authoritativePaymentRows,
      authoritativePaymentSumCents,
      proposedLedgerSumCents: currentPaymentSumCents,
      proposedLifecycleStatus: deriveLifecycleStatus(input.invoice.total_cents, currentPaymentSumCents),
      eligibility: "NO_CHANGE",
      confidence: "high",
      skipReason: null,
    };
  }

  return {
    ...basePlan,
    authoritativePaymentRows,
    authoritativePaymentSumCents,
    proposedRemovals: importerPaymentIds,
    proposedCreates: authoritativePaymentRows,
    proposedLedgerSumCents,
    proposedLifecycleStatus,
    eligibility: "AUTO_ELIGIBLE",
    confidence: "high",
    skipReason: null,
  };
}
