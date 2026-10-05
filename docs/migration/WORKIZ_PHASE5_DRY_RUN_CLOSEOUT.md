# Workiz Phase 5 Dry Run Closeout

Status: **PHASE 5 — PASS**

Production import remains **NOT AUTHORIZED**.

## First pass imported counts

- Customers: 334
- Jobs: 339
- Invoices: 339
- Payments: 439
- Source documents (Workiz provenance invoices): 339
- First-pass create delta: {"customersCreated":334,"jobsCreated":339,"invoicesCreated":339,"paymentsCreated":439,"sourceDocumentsCreated":339}

## Second pass new rows

- Customers: 0
- Jobs: 0
- Invoices: 0
- Payments: 0
- Source documents: 0

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

## Idempotency

{
  "secondRunCustomersCreated": 0,
  "secondRunJobsCreated": 0,
  "secondRunInvoicesCreated": 0,
  "secondRunPaymentsCreated": 0,
  "secondRunSourceDocumentsCreated": 0,
  "pass": true
}

## Unresolved anomalies

- None
