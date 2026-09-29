# Phase 11 — Historical Finance Compatibility Report

**Status:** Compatibility preparation (no Workiz import)  
**Date:** 2026-09-26  
**Owner override:** Actual Workiz Historical Data + Document Intelligence Migration is **deferred until after Phase 15**.

## Purpose

Prove the native WizField Finance architecture (Phases 4–10) can accept historical business data in a future migration workstream **without redesigning Finance**.

Target outcome: *Workiz migration can begin after Phase 15 without redesigning Finance.*

## Evidence (read-only)

**Automated checks:**

```bash
npm run finance-part11:checks
```

Use `FINANCE_SMOKE_USE_CONFIGURED_DATABASE=true` when ephemeral `CREATE DATABASE` is unavailable (same as other finance smokes).

Optional org row audit:

```bash
FINANCE_AUDIT_ORG_ID=<phoenix-org-uuid> npm run finance-part11:readonly-audit
# or: npm run finance-part6:workiz-audit
```

Artifact: `backend/_runtime_harness/finance-part6-workiz-audit/classification-*.json`

Corpus requirements (prior audit, not re-imported in Phase 11):

| Metric | Approximate count |
|--------|-------------------|
| Customers | 642 |
| Invoice CSV records | 415 |
| PDFs | 413 |
| Unique PDF invoice numbers | 410 |
| Duplicate PDF invoice-number pairs | 3 |
| CSV without matching PDF | 5 |
| Discounts | Subset of invoices |
| Payment/status evidence | Partial |

## Domain compatibility matrix

| Domain | Current model | Historical compatibility | Known gap | Workiz migration impact |
|--------|---------------|--------------------------|-----------|-------------------------|
| Customers | `customers.external_client_number`, `legacy_created_at`, notes + Phoenix provenance marker | PARTIAL | Multiple link strategies; no `source_system` column | Matching engine in migration project |
| Jobs | `jobs` entity; API requires schedule↔technician coupling | PARTIAL | No `source_job_id` column; codes in branding JSON | Importer uses entity layer, not public job API |
| Invoices | Dual JSON: `branding_snapshot_json` vs `customer_facing_snapshot_json` | PARTIAL | Workiz truth often not in Phase 7 v3 snapshot | Assign canonical `document_number`; internal source ref only in provenance |
| Line items | `document_line_key` unique per invoice | YES | — | Idempotent by `workiz:{code}:line:{n}` |
| Totals / tax | Header cents + `tax_rate_bps_snapshot` | PARTIAL | Discounts not persisted | Classify VERIFIED / PARTIAL / UNKNOWN |
| Discounts | Snapshot field exists; engine forces 0 | BLOCKED (faithful) | No invoice `discount_cents` | Schema + engine or snapshot-only exception in migration |
| Payment ledger | `invoice_payments`; lifecycle core | PARTIAL | `legacy_status_migration` for evidence-only paid | Do not fabricate ledger without approval |
| Lifecycle | Ledger-authoritative presentation | YES | Legacy columns for Workiz only | — |
| Phase 7 snapshot | v3 schema + freeze service | PARTIAL | Freeze wired through send pipeline | Future direct historical freeze API |
| Numbering | Org sequence on send (Phase 10) | PARTIAL | Historical rows may lack `document_number` | Allocate canonical number on import |
| Documents | `workiz_source_pdf` + `native_customer_pdf` | YES | Native PDF needs v3 freeze | Dual origin supported |
| Provenance | Branding JSON, document rows, customer notes | PARTIAL | Fragmented; no import_run table | Normalize per `phase11-provenance-contract.md` |
| Portal / AI | `buildHistoricalSnapshotAiReadModel` | PARTIAL | AI reads v3 snapshot only | Backfill v3 or extend reads in Phase 12 / migration |

## Legacy production row policy

**Do not use** any malformed or selectively migrated legacy production invoice as the design baseline.

| Classification signal | Recommendation |
|----------------------|----------------|
| `native_model_incompatibility` (v3 snapshot + Workiz branding) | MANUAL REPAIR LATER or REIMPORT FROM SOURCE |
| `do_not_repair` (overpayment) | KEEP AS LEGACY; separate correction plan |
| `missing_source_evidence` | REIMPORT FROM SOURCE when migration runs |
| `historical_source_truth` | KEEP AS LEGACY until migration pass |

Phase 11 performs **no automatic repair**.

## Pre-import classification vocabulary

Maps to Part 6 production audit classes where rows already exist:

| Pre-import class | Part 6 / tooling analog |
|------------------|-------------------------|
| SOURCE_VERIFIED | historical_source_truth + FINANCIAL_MATCH |
| SOURCE_PARTIAL | missing PDF / partial payments |
| DUPLICATE | DUPLICATE_PDF (coverage audit) |
| MISSING_PDF | UNMATCHED CSV |
| FINANCIAL_MISMATCH | financial_mismatch in branding / reconcile |
| PAYMENT_EVIDENCE_ONLY | paid + zero ledger + workiz_historical |
| MANUAL_REVIEW | import_mapping_issue, AMBIGUOUS |

## Schema gap register

| GAP | Blocks migration? | Schema change? | Before Phase 15? | Defer to Workiz? |
|-----|-------------------|----------------|------------------|------------------|
| No invoice discount persistence | Yes (discount subset) | Yes | No (default) | Yes |
| Dual snapshot systems | Yes for native PDF + AI | Process | Document | Partially |
| Workiz code display fallback | Yes for UI policy | No | Policy in migration | Yes |
| No source_job_id column | No | Optional | No | Yes |
| No import_run table | No | Optional | No | Yes |
| Historical freeze without send | Yes for native doc path | Service API | Design only | Yes |
| AI read v3-only | Yes for structured Q&A | No | Phase 12 | Migration backfill |

**Schema changes required in Phase 11:** NO

## Final Phase 11 statement

**ACTUAL WORKIZ MIGRATION: DEFERRED UNTIL AFTER PHASE 15**

Phase 11 validates compatibility only. No import, no PDF attach, no ledger reconstruction, no production historical mutation.

## Readiness summary

| Area | Status |
|------|--------|
| PHASE 11 PLAN | READY |
| Historical customer | PARTIAL |
| Historical job | PARTIAL |
| Historical invoice | PARTIAL |
| Financial compatibility | PARTIAL |
| Payment evidence | PARTIAL |
| Snapshot | PARTIAL |
| Source + native PDF coexistence | READY |
| Provenance | PARTIAL |
| Future numbering | PARTIAL |
| Workiz migration executable now | **NO** |
