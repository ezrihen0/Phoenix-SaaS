import type { MichaelReportCompanyParts, MichaelReportJobPayload } from "./phoenix-field-report.types";

export type MichaelReportEntryFinancials = {
  saleExcludingTaxCents: number;
  taxCents: number;
  saleIncludingTaxCents: number;
  partsCostIncludingTaxCents: number;
  remainingAfterPartsCents: number;
};

export function readPartsCostIncludingTaxCents(parts: MichaelReportCompanyParts) {
  const cents = parts.costIncludingTaxCents;
  if (cents === undefined || cents === null) {
    return 0;
  }

  return cents;
}

export function computeRemainingAfterPartsCents(
  saleIncludingTaxCents: number,
  partsCostIncludingTaxCents: number,
) {
  return saleIncludingTaxCents - partsCostIncludingTaxCents;
}

export function buildEntryFinancials(
  payload: MichaelReportJobPayload,
  saleExcludingTaxCents: number,
  taxCents: number,
): MichaelReportEntryFinancials {
  const saleIncludingTaxCents = payload.totalChargedCents;
  const partsCostIncludingTaxCents = readPartsCostIncludingTaxCents(payload.companyParts);

  return {
    saleExcludingTaxCents,
    taxCents,
    saleIncludingTaxCents,
    partsCostIncludingTaxCents,
    remainingAfterPartsCents: computeRemainingAfterPartsCents(
      saleIncludingTaxCents,
      partsCostIncludingTaxCents,
    ),
  };
}

export function aggregateEntryFinancials(rows: MichaelReportEntryFinancials[]) {
  return rows.reduce(
    (totals, row) => ({
      saleExcludingTaxCents: totals.saleExcludingTaxCents + row.saleExcludingTaxCents,
      taxCents: totals.taxCents + row.taxCents,
      saleIncludingTaxCents: totals.saleIncludingTaxCents + row.saleIncludingTaxCents,
      partsCostIncludingTaxCents: totals.partsCostIncludingTaxCents + row.partsCostIncludingTaxCents,
      remainingAfterPartsCents: totals.remainingAfterPartsCents + row.remainingAfterPartsCents,
    }),
    {
      saleExcludingTaxCents: 0,
      taxCents: 0,
      saleIncludingTaxCents: 0,
      partsCostIncludingTaxCents: 0,
      remainingAfterPartsCents: 0,
    },
  );
}
