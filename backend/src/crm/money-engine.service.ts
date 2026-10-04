import { Injectable } from "@nestjs/common";

import {
  buildLegacyDocumentTotals,
  computeDocumentMoney,
  computeDocumentTotals,
  computeLineSubtotalCents,
  computeTaxInclusiveDocumentTotals,
  toDocumentMoneyResult,
  type DocumentMoneyResult,
  type DocumentTotals,
} from "./money-engine.core";

export type { DocumentMoneyResult, DocumentTotals };

@Injectable()
export class MoneyEngineService {
  buildLegacyTotals(flatAmountCents: number): DocumentTotals {
    return buildLegacyDocumentTotals(flatAmountCents);
  }

  computeLineSubtotal(quantity: string, unitPriceCents: number) {
    return computeLineSubtotalCents(quantity, unitPriceCents);
  }

  computeSnapshotTotals(
    lines: Array<{ quantity: string; unitPriceCents: number }>,
    taxRateBps: number,
  ): DocumentTotals {
    return computeDocumentTotals(lines, taxRateBps);
  }

  computeTaxInclusiveTotals(totalCents: number, taxRateBps: number): DocumentTotals {
    return computeTaxInclusiveDocumentTotals(totalCents, taxRateBps);
  }

  computeDocumentMoney(
    lines: Array<{ quantity: string; unitPriceCents: number }>,
    taxRateBps: number,
  ): DocumentMoneyResult {
    return computeDocumentMoney(lines, taxRateBps);
  }

  toDocumentMoneyResult(totals: DocumentTotals): DocumentMoneyResult {
    return toDocumentMoneyResult(totals);
  }
}
