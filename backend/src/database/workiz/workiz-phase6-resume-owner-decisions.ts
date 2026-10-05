/**
 * Owner-locked Phase 6 resume decisions (Phase 6B recovery).
 * Do not change without explicit owner approval.
 */
export const PHASE6_OWNER_EXCLUDED_CLUSTER_IDS = new Set(["customer-0026"]);

export const PHASE6_OWNER_EXCLUDED_INVOICE_CODES = new Set(["18WKSZ"]);

/** Angie — EXCLUDE_FROM_AUTOMATED_IMPORT; remains MANUAL_REVIEW. */
export const PHASE6_OWNER_EXCLUDED_CLUSTER_LABEL = "customer-0026 (Angie)";

export const PHASE6_OWNER_PINNED_EXISTING_CUSTOMER_IDS: Readonly<Record<string, string>> = {
  /** Brenda Shields */
  "customer-0049": "1ee3ff39-7adb-4085-a178-3cea109ddb5b",
  /** Kevin Shier */
  "customer-0225": "69058467-d41e-445b-9517-0e1b90c2fdc1",
};

export function isPhase6OwnerExcludedCluster(clusterId: string | null | undefined): boolean {
  if (!clusterId) return false;
  return PHASE6_OWNER_EXCLUDED_CLUSTER_IDS.has(clusterId);
}

export function isPhase6OwnerExcludedInvoice(invoiceCode: string | null | undefined): boolean {
  if (!invoiceCode) return false;
  return PHASE6_OWNER_EXCLUDED_INVOICE_CODES.has(invoiceCode);
}
