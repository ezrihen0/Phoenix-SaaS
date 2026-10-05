import type { WorkizFinancialGate } from "./workiz-historical-types.v1";

const MONEY_TOLERANCE_CENTS = 2;

export type WorkizFinancialInput = {
  subtotalCents: number | null;
  discountCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  balanceCents: number | null;
  paymentTotalCents: number;
  parseWarnings?: string[];
};

export type WorkizFinancialResult = {
  status: WorkizFinancialGate;
  appliedRule: "SUBTOTAL_PLUS_TAX" | "SUBTOTAL_MINUS_DISCOUNT_PLUS_TAX" | null;
  reasons: string[];
  primaryCause: string | null;
};

function withinTolerance(left: number | null, right: number | null): boolean {
  if (left == null || right == null) return false;
  return Math.abs(left - right) <= MONEY_TOLERANCE_CENTS;
}

export function reconcileWorkizHistoricalFinancials(input: WorkizFinancialInput): WorkizFinancialResult {
  const reasons: string[] = [];
  const discount = input.discountCents ?? 0;
  const appliedRule: WorkizFinancialResult["appliedRule"] =
    discount > 0 ? "SUBTOTAL_MINUS_DISCOUNT_PLUS_TAX" : "SUBTOTAL_PLUS_TAX";

  const { subtotalCents, taxCents, totalCents, balanceCents, paymentTotalCents } = input;

  if (subtotalCents == null) reasons.push("missing_subtotal");
  if (totalCents == null) reasons.push("missing_total");
  if (taxCents == null && subtotalCents != null && totalCents != null) reasons.push("missing_tax");
  if (balanceCents == null) reasons.push("missing_balance");

  const expectedTotal =
    appliedRule === "SUBTOTAL_MINUS_DISCOUNT_PLUS_TAX"
      && subtotalCents != null
      && taxCents != null
      ? subtotalCents - discount + taxCents
      : subtotalCents != null && taxCents != null
        ? subtotalCents + taxCents
        : null;

  if (expectedTotal != null && totalCents != null && !withinTolerance(expectedTotal, totalCents)) {
    reasons.push("total_mismatch");
  }

  if (
    totalCents != null
    && balanceCents != null
    && !withinTolerance(paymentTotalCents, totalCents - balanceCents)
  ) {
    reasons.push("payments_mismatch");
  }

  if (
    totalCents != null
    && balanceCents != null
    && !withinTolerance(totalCents - paymentTotalCents, balanceCents)
  ) {
    reasons.push("balance_mismatch");
  }

  if (totalCents != null && paymentTotalCents > totalCents + MONEY_TOLERANCE_CENTS) {
    reasons.push("payments_exceed_total");
  }

  for (const warning of input.parseWarnings ?? []) {
    if (warning.includes("line_items_subtotal_mismatch")) reasons.push("line_item_parse_warning");
    if (warning.includes("payment_reconciliation_mismatch")) reasons.push("payment_parse_warning");
    if (warning.includes("synthetic_line_item_from_subtotal")) reasons.push("synthetic_line_item_warning");
  }

  const uniqueReasons = [...new Set(reasons)];
  const primaryCause = uniqueReasons.length === 0
    ? null
    : uniqueReasons.includes("missing_tax")
      ? "MISSING_TAX"
      : uniqueReasons.includes("missing_balance")
        ? "MISSING_BALANCE"
        : uniqueReasons.includes("payments_exceed_total")
          ? "PAYMENTS_EXCEED_TOTAL"
          : uniqueReasons.includes("payments_mismatch")
            || uniqueReasons.includes("balance_mismatch")
            || uniqueReasons.includes("payment_parse_warning")
            ? "PAYMENT_PARSE_OR_ALLOCATION"
            : uniqueReasons.includes("line_item_parse_warning")
              || uniqueReasons.includes("synthetic_line_item_warning")
              ? "LINE_ITEM_PARSE"
              : uniqueReasons.includes("total_mismatch")
                ? "TOTAL_MISMATCH"
                : "MISSING_CORE_TOTALS";

  return {
    status: uniqueReasons.length === 0 ? "PASS" : "MANUAL_REVIEW",
    appliedRule: subtotalCents != null && taxCents != null && totalCents != null ? appliedRule : null,
    reasons: uniqueReasons,
    primaryCause,
  };
}
