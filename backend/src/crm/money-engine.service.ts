import { Injectable } from "@nestjs/common";

import {
  buildLegacyDocumentTotals,
  computeDocumentTotals,
  computeLineSubtotalCents,
  type DocumentTotals,
} from "./money-engine.core";

export type { DocumentTotals };

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
}
