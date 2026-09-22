export type DocumentTotals = {
  subtotalCents: number;
  taxRateBpsSnapshot: number;
  taxCents: number;
  totalCents: number;
};

/**
 * Canonical WizField document money rules (Part 3):
 * - Line subtotal = round(unitPriceCents * quantityThousandths / 1000)
 * - Quantity stored as decimal string with up to 3 fractional digits
 * - Tax = round(subtotalCents * taxRateBps / 10000)
 * - Total = subtotalCents + taxCents (no discounts in Part 3)
 */
export function quantityToThousandths(quantity: string) {
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

export function computeLineSubtotalCents(quantity: string, unitPriceCents: number) {
  const quantityThousandths = quantityToThousandths(quantity);
  return Math.round((unitPriceCents * quantityThousandths) / 1000);
}

export function buildLegacyDocumentTotals(flatAmountCents: number): DocumentTotals {
  return {
    subtotalCents: flatAmountCents,
    taxRateBpsSnapshot: 0,
    taxCents: 0,
    totalCents: flatAmountCents,
  };
}

export function computeDocumentTotals(
  lines: Array<{ quantity: string; unitPriceCents: number }>,
  taxRateBps: number,
): DocumentTotals {
  const subtotalCents = lines.reduce(
    (runningTotal, line) => runningTotal + computeLineSubtotalCents(line.quantity, line.unitPriceCents),
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

export function assertClientTotalMatchesEngine(
  clientTotalCents: number,
  engineTotals: DocumentTotals,
  label: string,
) {
  if (clientTotalCents !== engineTotals.totalCents) {
    throw new Error(
      `${label} total mismatch: client sent ${clientTotalCents} but the money engine computed ${engineTotals.totalCents}.`,
    );
  }
}
