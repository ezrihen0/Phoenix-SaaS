import { Injectable } from "@nestjs/common";

import { MoneyEngineService, type DocumentTotals } from "./money-engine.service";

export type { DocumentTotals };

/** @deprecated Prefer MoneyEngineService — retained for existing smoke harness wiring. */
@Injectable()
export class DocumentPricingService {
  constructor(private readonly moneyEngineService: MoneyEngineService) {}

  buildLegacyTotals(flatAmountCents: number): DocumentTotals {
    return this.moneyEngineService.buildLegacyTotals(flatAmountCents);
  }

  computeLineSubtotal(quantity: string, unitPriceCents: number) {
    return this.moneyEngineService.computeLineSubtotal(quantity, unitPriceCents);
  }

  computeSnapshotTotals(
    lines: Array<{ quantity: string; unitPriceCents: number }>,
    taxRateBps: number,
  ): DocumentTotals {
    return this.moneyEngineService.computeSnapshotTotals(lines, taxRateBps);
  }
}
