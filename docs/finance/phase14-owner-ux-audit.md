# Phase 14 — Owner UX audit & closeout

Status: **CLOSED** (2026-09-26).

Scope: owner-facing Finance UX only — no Money Engine, ledger, snapshot, PDF renderer, numbering, or schema changes.

## Resolved gaps (summary)

| ID | Severity | Resolution |
|----|----------|------------|
| UX-14-001 | P0 | `InvoicePaymentForm` on invoice detail |
| UX-14-002 | P0 | Job invoice tab uses shared payment form (partial + full) |
| UX-14-003 | P1 | Customer sidebar **Add New Invoice** quick action |
| UX-14-004 | P1 | Estimate detail: edit composer link, status copy, approval guidance |
| UX-14-005 | P1 | Jargon sweep (ledger/snapshot/stored status → owner language) |
| UX-14-006 | P1 | Invoice list passes numeric `q` and `customerId` to API |
| UX-14-007 | P1 | `invoice_exists` owner message updated |

## Owner workflow smoke matrix

- [ ] Quick Create → Invoice → job → composer → line → save → saved ack → View Invoice
- [ ] Customer → Add New Invoice → chooser → composer
- [ ] Job → Invoice tab → Create/Edit → composer
- [ ] Invoice detail → Record payment (partial) → balance updates
- [ ] Invoice detail → Pay full balance → Paid lifecycle
- [ ] Invoice list search by document number (`q` with digits)
- [ ] `/invoices?customerId=` from customer tab link
- [ ] Estimate detail → Edit estimate → composer; approval block usable
- [ ] Portal home → invoice list → view HTML/PDF
- [ ] `node frontend/scripts/phoenix-test-invoice-ui.mjs` (payment on detail)

## Files (primary)

- `frontend/lib/crm/invoice-payment-form.tsx`
- `frontend/lib/crm/estimate-lifecycle.ts`
- `frontend/lib/crm/finance-api-errors.ts`
- `frontend/app/invoices/[invoiceId]/page.tsx`
- `frontend/app/jobs/[jobId]/job-finance-tab-panels.tsx`
- `frontend/app/customers/[customerId]/customer-profile-workspace.tsx`
- `frontend/app/invoices/page.tsx`
