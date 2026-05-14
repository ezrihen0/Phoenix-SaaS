import { apiError } from "../common/api-response";

/**
 * Rejects payloads that look like raw card numbers. Clover card tokens (clv_…)
 * must be created in the browser or Clover tooling — never send PAN to WizField.
 */
export function rejectLikelyRawCardNumber(source: string): void {
  const compact = source.replace(/\s+/g, "");
  if (/^\d{12,19}$/.test(compact)) {
    apiError(
      400,
      "billing_raw_card_rejected",
      "Do not send raw card numbers to the server. Use a Clover card token (for example clv_…) from Clover tokenization.",
    );
  }
}
