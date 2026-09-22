export type DocumentPreviewTotals = {
  subtotalCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
};

export function quantityToThousandths(quantity: string) {
  const normalizedQuantity = quantity.trim();

  if (!/^\d+(\.\d{1,3})?$/.test(normalizedQuantity)) {
    return 0;
  }

  const parsedQuantity = Number(normalizedQuantity);

  if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
    return 0;
  }

  return Math.round(parsedQuantity * 1000);
}

export function computeLineSubtotalCents(quantity: string, unitPriceCents: number) {
  const quantityThousandths = quantityToThousandths(quantity);

  if (quantityThousandths <= 0) {
    return 0;
  }

  return Math.round((unitPriceCents * quantityThousandths) / 1000);
}

export function computeDocumentPreviewTotals(
  lines: Array<{ quantity: string; unitPriceCents: number }>,
  taxRateBps: number,
): DocumentPreviewTotals {
  const subtotalCents = lines.reduce(
    (runningTotal, line) => runningTotal + computeLineSubtotalCents(line.quantity, line.unitPriceCents),
    0,
  );

  const taxCents = Math.round((subtotalCents * taxRateBps) / 10000);

  return {
    subtotalCents,
    taxRateBps,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}
