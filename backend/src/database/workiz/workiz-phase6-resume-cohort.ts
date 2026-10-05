import type { WorkizHistoricalParseCandidate } from "./workiz-historical-types.v1";
import { isWorkizWarrantyReconstructionValid } from "./workiz-historical-service-warranty.v1";
import {
  isPhase6OwnerExcludedCluster,
  isPhase6OwnerExcludedInvoice,
  PHASE6_OWNER_EXCLUDED_CLUSTER_IDS,
  PHASE6_OWNER_EXCLUDED_INVOICE_CODES,
} from "./workiz-phase6-resume-owner-decisions";

export function isEligibleForProductionImport(candidate: WorkizHistoricalParseCandidate): boolean {
  if (!candidate.source.is_canonical_for_invoice) return false;
  if (!candidate.invoice || !candidate.customer) return false;
  if (candidate.financial_gate !== "PASS") return false;
  if (candidate.identity.classification === "MANUAL_REVIEW") return false;
  if (!isWorkizWarrantyReconstructionValid(candidate.warranty_reconstruction)) return false;
  return true;
}

/** Safe cohort for Phase 6 resume (pre-import eligible minus owner exclusions). */
export function filterResumeSafeEligible(candidates: WorkizHistoricalParseCandidate[]): WorkizHistoricalParseCandidate[] {
  return candidates.filter(isEligibleForProductionImport).filter((candidate) => {
    if (isPhase6OwnerExcludedCluster(candidate.identity.cluster_id)) return false;
    if (isPhase6OwnerExcludedInvoice(candidate.invoice!.workiz_invoice_number)) return false;
    return true;
  });
}

export type ResumeCohortTotals = {
  customerClusters: number;
  invoices: number;
  jobs: number;
  paymentEvents: number;
  sourceDocuments: number;
  invoiceValueCents: number;
  paymentCents: number;
  excludedClusterIds: string[];
  excludedInvoiceCodes: string[];
  preResumeEligibleInvoices: number;
  preResumeEligibleClusters: number;
};

export function buildResumeCohortTotals(candidates: WorkizHistoricalParseCandidate[]): ResumeCohortTotals {
  const preResumeEligible = candidates.filter(isEligibleForProductionImport);
  const eligible = filterResumeSafeEligible(candidates);
  const clusterIds = new Set(
    eligible.map((c) => c.identity.cluster_id).filter(Boolean) as string[],
  );

  let invoiceValueCents = 0;
  let paymentCents = 0;
  let paymentEvents = 0;
  for (const candidate of eligible) {
    invoiceValueCents += candidate.invoice?.total_cents ?? 0;
    for (const payment of candidate.payments) {
      paymentEvents += 1;
      paymentCents += payment.amount_cents;
    }
  }

  const preResumeClusterIds = new Set(
    preResumeEligible.map((c) => c.identity.cluster_id).filter(Boolean) as string[],
  );

  return {
    customerClusters: clusterIds.size,
    invoices: eligible.length,
    jobs: eligible.length,
    paymentEvents,
    sourceDocuments: eligible.length,
    invoiceValueCents,
    paymentCents,
    excludedClusterIds: [...PHASE6_OWNER_EXCLUDED_CLUSTER_IDS],
    excludedInvoiceCodes: [...PHASE6_OWNER_EXCLUDED_INVOICE_CODES],
    preResumeEligibleInvoices: preResumeEligible.length,
    preResumeEligibleClusters: preResumeClusterIds.size,
  };
}
