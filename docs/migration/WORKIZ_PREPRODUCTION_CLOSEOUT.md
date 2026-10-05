# Workiz Pre-Production Closeout

Status: **PRE-PRODUCTION PHASES 1–4 COMPLETE — PRODUCTION IMPORT NOT AUTHORIZED**

Pipeline: `workiz-historical-preproduction-v1.1`

## Parser coverage

- Source PDFs scanned: 413
- Parsed with invoice number: 413
- Canonical logical invoices (duplicate exports collapsed): 410

## Identity

- Unique customer clusters: 399
- Confirmed repeat-customer clusters: 10
- Manual identity review clusters: 1 (includes locked Natalie cluster)

## Financial gate

- PASS (canonical): 340
- MANUAL_REVIEW (canonical): 70
- Eligible for automatic dry-run import: 339

## Service + warranty

- Invoices with primary service classification: 413
- Documented parts warranties: 88
- Ambiguous parts warranties (MANUAL_REVIEW): 2
- Default parts warranties (12-month policy): 323
- Documented labor warranties: 10
- Ambiguous labor warranties (MANUAL_REVIEW): 3
- Default labor warranties (6-month policy): 400

## Payments

- Parsed payment events (source PDFs): 479

## Calgary

- Estimated unique Calgary customers after conservative dedupe: 228

## Dry run (Phase 5)

```json
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
```

## Second-run idempotency

```json
{
  "secondRunCustomersCreated": 0,
  "secondRunJobsCreated": 0,
  "secondRunInvoicesCreated": 0,
  "secondRunPaymentsCreated": 0,
  "secondRunSourceDocumentsCreated": 0,
  "pass": true
}
```

## Unresolved blockers

- None recorded

## Production boundary

Production import on `app.phoenixfireplace.ca` remains **NOT AUTHORIZED** until separate owner approval after dry-run verification.
