export function resolveCustomerDocumentTaxLabel(input: {
  taxRateBps: number;
  snapshottedTaxLabel?: string | null;
}) {
  const label = input.snapshottedTaxLabel?.trim();
  if (label) {
    return label;
  }

  if (input.taxRateBps > 0) {
    return `Tax (${(input.taxRateBps / 100).toFixed(2)}%)`;
  }

  return "Tax";
}

export function readSnapshottedBranchTaxLabel(snapshot: object | null | undefined) {
  const label = (snapshot as { branch?: { tax_label?: string | null } | null } | null | undefined)?.branch?.tax_label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}
