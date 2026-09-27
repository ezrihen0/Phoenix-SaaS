import { Injectable } from "@nestjs/common";

import type { InvoiceStatus } from "./constants";
import {
  summarizeInvoiceLedger as summarizeInvoiceLedgerCore,
  type InvoiceLedgerSummary,
  type InvoicePaymentLifecycleStatus,
} from "./invoice-financial-lifecycle.core";
import type { FinanceInvoiceOrigin } from "./finance-invoice-origin";
import type { InvoicePaymentEntity } from "../database/entities/invoice-payment.entity";

export type { InvoiceLedgerSummary, InvoicePaymentLifecycleStatus };

@Injectable()
export class InvoicePaymentLedgerService {
  summarizeInvoice(options: {
    totalCents: number;
    legacyStatus: InvoiceStatus;
    legacyPaidAt: Date | null;
    payments: InvoicePaymentEntity[];
    voidedAt?: Date | null;
    cancelledAt?: Date | null;
    financeOrigin?: FinanceInvoiceOrigin;
  }): InvoiceLedgerSummary {
    return summarizeInvoiceLedgerCore(options);
  }
}
