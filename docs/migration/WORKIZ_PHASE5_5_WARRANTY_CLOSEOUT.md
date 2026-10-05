# Workiz Phase 5.5 — Warranty Source Completeness Closeout

Status: **PHASE 5.5 — PASS**

Production import remains **NOT AUTHORIZED**.

## Warranty classification (full corpus — 413 PDFs)

- Documented parts warranties: 88
- Ambiguous parts warranties (MANUAL_REVIEW): 2
- Default parts warranties (12-month policy): 323
- Documented labor warranties: 10
- Ambiguous labor warranties (MANUAL_REVIEW): 3
- Default labor warranties (6-month policy): 400

## Phase 0 audit comparison

{
  "phase0ExplicitPartsPdfs": 77,
  "phase0ExplicitLaborPdfs": 74,
  "phase0GenericWarrantyPdfs": 17,
  "partsOutcome": {
    "documented": 76,
    "ambiguous": 0,
    "defaultPolicy": 1,
    "phase0SignalNoWarrantyEvidenceInCorpus": 0
  },
  "laborOutcome": {
    "documented": 10,
    "ambiguous": 1,
    "defaultPolicy": 63,
    "phase0SignalNoWarrantyEvidenceInCorpus": 0
  },
  "genericPhase0Mapping": {
    "ambiguousParts": 2,
    "ambiguousLabor": 1,
    "documentedBoth": 0,
    "defaultBoth": 5
  }
}

Reductions from Phase 0 loose signals must be explainable by classification (DOCUMENTED / AMBIGUOUS / DEFAULT), not excluded source locations.

## Phase 5 dry run (re-run)

{
  "database": "wizfield_workiz_preprod_1791167410214",
  "organizationId": "8d5bc762-eb13-43e5-85a1-723477adb47c",
  "eligibleInvoices": 339,
  "firstPass": {
    "customersCreated": 334,
    "jobsCreated": 339,
    "invoicesCreated": 339,
    "paymentsCreated": 439,
    "sourceDocumentsCreated": 339
  },
  "countsAfterFirst": {
    "customers": 334,
    "jobs": 339,
    "invoices": 339,
    "payments": 439,
    "sourceDocuments": 339
  },
  "verificationAfterFirst": {
    "crossOrgMismatches": 0,
    "duplicateCustomers": 0,
    "duplicateJobs": 0,
    "duplicateInvoices": 0,
    "duplicatePayments": 0,
    "duplicateSourceDocuments": 0,
    "financialReconciliationFailuresAmongPass": 0,
    "sourceDocumentLinkageFailures": 0,
    "warrantyCalculationFailures": 0,
    "pass": true,
    "details": []
  },
  "countsAfterSecond": {
    "customers": 334,
    "jobs": 339,
    "invoices": 339,
    "payments": 439,
    "sourceDocuments": 339
  },
  "moneyTotals": {
    "invoiceValueCents": 15266293,
    "paymentsCents": 15214873
  },
  "phase5Status": "PASS"
}

## Idempotency (second pass)

{
  "secondRunCustomersCreated": 0,
  "secondRunJobsCreated": 0,
  "secondRunInvoicesCreated": 0,
  "secondRunPaymentsCreated": 0,
  "secondRunSourceDocumentsCreated": 0,
  "pass": true
}

## Verification

{
  "crossOrgMismatches": 0,
  "duplicateCustomers": 0,
  "duplicateJobs": 0,
  "duplicateInvoices": 0,
  "duplicatePayments": 0,
  "duplicateSourceDocuments": 0,
  "financialReconciliationFailuresAmongPass": 0,
  "sourceDocumentLinkageFailures": 0,
  "warrantyCalculationFailures": 0,
  "pass": true,
  "details": []
}
