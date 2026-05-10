import { Injectable } from "@nestjs/common";

export type DocumentTotals = {
  subtotalCents: number;
  taxRateBpsSnapshot: number;
  taxCents: number;
  totalCents: number;
};

@Injectable()
export class DocumentPricingService {
  buildLegacyTotals(flatAmountCents: number): DocumentTotals {
    return {
      subtotalCents: flatAmountCents,
      taxRateBpsSnapshot: 0,
      taxCents: 0,
      totalCents: flatAmountCents,
    };
  }

  computeLineSubtotal(quantity: string, unitPriceCents: number) {
    const quantityThousandths = this.quantityToThousandths(quantity);
    return Math.round((unitPriceCents * quantityThousandths) / 1000);
  }

  computeSnapshotTotals(
    lines: Array<{ quantity: string; unitPriceCents: number }>,
    taxRateBps: number,
  ): DocumentTotals {
    const subtotalCents = lines.reduce(
      (runningTotal, line) =>
        runningTotal + this.computeLineSubtotal(line.quantity, line.unitPriceCents),
      0,
    );

    const taxCents = Math.round((subtotalCents * taxRateBps) / 10000);

    return {
      subtotalCents,
      taxRateBpsSnapshot: taxRateBps,
      taxCents,
      totalCents: subtotalCents + taxCents,
    };
  }

  private quantityToThousandths(quantity: string) {
    const normalizedQuantity = quantity.trim();

    if (!/^\d+(\.\d{1,3})?$/.test(normalizedQuantity)) {
      throw new Error("Quantity must be a positive decimal with up to three decimal places.");
    }

    const parsedQuantity = Number(normalizedQuantity);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      throw new Error("Quantity must be greater than zero.");
    }

    return Math.round(parsedQuantity * 1000);
  }
}