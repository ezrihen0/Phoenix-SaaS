import type { InvoiceLedgerSummary } from "./invoice-financial-lifecycle.core";
import type { InvoicePaymentEntity } from "../database/entities/invoice-payment.entity";
import type { InvoiceCustomerFacingSnapshotAny } from "./invoice-customer-facing-snapshot.types";

export type HistoricalDocumentRenderMode = "frozen" | "legacy_live";

export type HistoricalDocumentRenderInput = {
  snapshot: InvoiceCustomerFacingSnapshotAny | null;
  renderMode: HistoricalDocumentRenderMode;
  ledgerSummary?: InvoiceLedgerSummary;
  payments?: InvoicePaymentEntity[];
};

export function resolveHistoricalDocumentRenderMode(
  snapshot: InvoiceCustomerFacingSnapshotAny | null | undefined,
): HistoricalDocumentRenderMode {
  return snapshot ? "frozen" : "legacy_live";
}
