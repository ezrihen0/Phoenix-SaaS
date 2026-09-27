# Phase 12 — Cross-surface Finance audit

Status: **CLOSED with Phase 12 implementation** (2026-09-26).

Canonical SoT: [`FinanceInvoicePresentationService`](../backend/src/crm/finance-invoice-presentation.service.ts) + Phase 6 ledger + Phase 10 numbering + Phase 7–10 documents.

## Surface register

| Surface | Data source | Canonical after Phase 12 |
|---------|-------------|-------------------------|
| Customer profile metrics | `GET /api/customers/:id` → `finance_summary` (FIPS) | Yes |
| Customer invoice/estimate tabs | `/api/invoices`, `/api/estimates` | Yes |
| Job detail invoice embed | `loadJobDetail` + `buildJobDetailResponse` (FIPS fields) | Yes |
| Job finance tabs | `GET /api/invoices/:id` | Yes (unchanged) |
| Invoice list/detail | FIPS list + `document_view` | Yes |
| Invoice document history | `GET /api/invoices/:id/documents` + staff panel | Yes |
| Portal home | Portal service ledger + Phase 12 UI lifecycle/balance | Yes |
| Office dashboard | Open count = FIPS open rules; controls use balance | Yes |
| Home AI | FIPS | Yes (unchanged) |

## Stale consumer register (fixed in Phase 12)

| Location | Issue | Resolution |
|----------|-------|------------|
| `frontend/app/portal/page.tsx` | Legacy `invoice.status` in UI | Lifecycle + balance |
| `frontend/app/invoices/page.tsx` | `paidCount` via `status` | Lifecycle-based |
| `frontend/app/jobs/.../job-detail-workspace.tsx` | Header `invoice.status` | Lifecycle + balance |
| `frontend/lib/crm/jobs-list-utils.ts` | `status === "unpaid"` fallback | Ledger-first |
| `frontend/lib/crm/job-field-display.ts` | Payment signal from legacy status | Lifecycle labels |
| `backend/.../crm-office-dashboard.service.ts` | Open count without balance; control amounts | FIPS-aligned |

## Checks

- `npm run finance-part12:checks` — contract gate + cross-surface readonly + portal isolation + Phase 11 regression chain
- Manual: `backend/_runtime_harness/finance-program-closeout/cross-surface-walkthrough.md`

## Out of scope (unchanged)

Workiz import, schema migrations, warranty local ledger duplicate, Phase 14 cosmetic pass.
