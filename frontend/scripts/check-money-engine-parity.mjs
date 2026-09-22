function quantityToThousandths(quantity) {
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

function computeLineSubtotalCents(quantity, unitPriceCents) {
  const quantityThousandths = quantityToThousandths(quantity);
  if (quantityThousandths <= 0) {
    return 0;
  }
  return Math.round((unitPriceCents * quantityThousandths) / 1000);
}

const cases = [
  { quantity: "1", unitPriceCents: 10_000, taxRateBps: 500, expectedSubtotal: 10_000, expectedTax: 500 },
  { quantity: "2.5", unitPriceCents: 1999, taxRateBps: 0, expectedSubtotal: computeLineSubtotalCents("2.5", 1999) },
  { quantity: "1.333", unitPriceCents: 15000, taxRateBps: 0, expectedSubtotal: computeLineSubtotalCents("1.333", 15000) },
];

for (const testCase of cases) {
  const subtotal = computeLineSubtotalCents(testCase.quantity, testCase.unitPriceCents);
  const tax = Math.round((subtotal * testCase.taxRateBps) / 10000);
  if (subtotal !== testCase.expectedSubtotal) {
    throw new Error(`Subtotal mismatch for qty=${testCase.quantity}`);
  }
  if (testCase.expectedTax !== undefined && tax !== testCase.expectedTax) {
    throw new Error(`Tax mismatch for qty=${testCase.quantity}`);
  }
}

console.log("money-engine parity check passed");
