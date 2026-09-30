/** 50% — above any current Canadian combined sales-tax rate, below unbounded client input. */
export const MAX_DOCUMENT_TAX_RATE_BPS = 5_000;

export function resolveServerDocumentTaxRateBps(input: {
  branchId: string | null | undefined;
  branchDefaultTaxRateBps: number | null | undefined;
  clientTaxRateBps: number | undefined;
}) {
  if (!input.branchId?.trim() || input.branchDefaultTaxRateBps == null) {
    throw new InvoiceTaxContextMissingError();
  }

  const serverRate = input.branchDefaultTaxRateBps;
  if (!Number.isInteger(serverRate) || serverRate < 0 || serverRate > MAX_DOCUMENT_TAX_RATE_BPS) {
    throw new InvoiceTaxRateOutOfRangeError(serverRate);
  }

  if (input.clientTaxRateBps !== undefined && input.clientTaxRateBps !== serverRate) {
    throw new InvoiceTaxRateMismatchError(serverRate, input.clientTaxRateBps);
  }

  return serverRate;
}

export class InvoiceTaxContextMissingError extends Error {
  readonly code = "invoice_tax_context_missing";

  constructor() {
    super("This job has no branch tax rate. Assign a branch with a tax rate before saving the invoice.");
    this.name = "InvoiceTaxContextMissingError";
  }
}

export class InvoiceTaxRateMismatchError extends Error {
  readonly code = "invoice_tax_rate_mismatch";

  constructor(
    readonly serverTaxRateBps: number,
    readonly clientTaxRateBps: number,
  ) {
    super("Invoice tax rate must match the branch tax rate.");
    this.name = "InvoiceTaxRateMismatchError";
  }
}

export class InvoiceTaxRateOutOfRangeError extends Error {
  readonly code = "invoice_tax_rate_out_of_range";

  constructor(readonly taxRateBps: number) {
    super("Branch tax rate is outside the supported range.");
    this.name = "InvoiceTaxRateOutOfRangeError";
  }
}
