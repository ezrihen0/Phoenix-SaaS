# WizField Finance Repair Execution Report

Date: 2026-09-29

Scope: repairs only. No new invoices-per-job model, deposit documents, progress billing, credit memos, discount engine, estimate numbering, GST/PST split, or accounting module.

## Files Changed

Repair files:

- `backend/src/crm/invoice-native-ledger-policy.ts`
- `backend/src/crm/invoice-payment-recording.service.ts`
- `backend/src/crm/crm-document-persistence.ts`
- `backend/src/crm/crm.controller.ts`
- `backend/src/crm/validation.ts`
- `backend/src/crm/invoice-tax-policy.ts` (new)
- `backend/src/crm/document-tax-label.ts` (new)
- `backend/src/crm/invoice-pdf-view-model.service.ts`
- `backend/src/crm/phoenix-invoice-document-presentation.service.ts`
- `backend/src/crm/portal-native-invoice-pdf.service.ts`
- `backend/src/crm/customer-send-sequence.ts` (new)
- `backend/src/crm/invoice-send-pipeline.service.ts`
- `backend/src/crm/invoice-financial-lifecycle.core.ts`
- `backend/src/crm/finance-metrics.core.ts` (new)
- `backend/src/crm/finance-invoice-presentation.service.ts`
- `backend/src/crm/crm-office-dashboard.service.ts`
- `backend/src/database/entities/invoice.entity.ts`
- `backend/src/database/migrations/active/1792000000000-invoice-job-delete-restrict.ts` (new)
- `backend/src/crm/finance-integrity-unit-check.ts` (new)
- `backend/src/crm/invoice-ledger-lifecycle-unit-check.ts`
- `backend/src/database/invoice-payment-recording-smoke.ts`
- `backend/src/database/finance-part9-document-contract-check.ts`
- `backend/package.json` (`finance-integrity:unit-check`)
- `frontend/lib/crm/invoice-payment-attempt.mjs` (new)
- `frontend/lib/crm/invoice-payment-form.tsx`
- `frontend/lib/crm/finance-api-errors.ts`
- `frontend/scripts/check-invoice-payment-attempt.mjs` (new)
- `frontend/app/jobs/[jobId]/job-invoice-section.tsx`
- `frontend/components/invoice-line-items-editor.tsx`
- `frontend/app/invoices/create/[jobId]/page.tsx`
- `frontend/app/invoices/create/[jobId]/invoice-create-workspace.tsx`
- `frontend/app/invoices/page.tsx`
- `frontend/messages/en.ts`
- `frontend/messages/es.ts`
- `frontend/messages/he.ts`
- `frontend/messages/uk.ts`
- `frontend/messages/pl.ts`

The working tree also contains unrelated pre-existing edits (email service, invoice detail layout, job page, app shell, remote probe scripts, `.env.example`). Those were not part of this repair.

## Database Migration

`1792000000000-invoice-job-delete-restrict.ts`

Looks up the single foreign key on `invoices.job_id` that references `jobs`, drops it, and re-adds the same constraint with `ON DELETE RESTRICT`. The entity `onDelete` is `RESTRICT`.

The migration throws if that lookup is missing or ambiguous. It was not executed. Local MySQL on `127.0.0.1:3306` refused the connection, and Docker Desktop was not running, so the ephemeral payment smoke could not apply migrations.

`down` restores `ON DELETE CASCADE` on that same constraint.

## Fixed Findings

| ID | Repair | Proof |
| --- | --- | --- |
| WF-FIN-P1-001 | Invoice upsert rejects line, subtotal, tax, and total changes when any ledger row is loaded. Persist throws `invoice_has_ledger_activity` before rewriting the header. | Policy unit test passed. Database row proof is in smoke case K and was not executed. |
| WF-FIN-P1-002 | A normal payment larger than the locked invoice balance returns `invoice_payment_exceeds_balance`. No new overpayment workflow was added. Historical overpaid rows can still be summarized. | Balance-cap unit test passed. Concurrent two-payment case is smoke case J and was not executed. |
| WF-FIN-P1-003 | One payment attempt keeps one idempotency key until success or the amount, method, or note changes. Backend unique index is unchanged. | Frontend attempt check passed. Backend replay case in the payment smoke was not re-executed. |
| WF-FIN-P1-004 | Invoice save uses the branch tax rate. Client values `0`, `500`, and `100000` do not replace `1300`. Missing branch context is rejected. An explicit configured `0` remains valid. `ORG_TAX_RATE_BPS` is not used. | `finance-integrity:unit-check` passed. |
| WF-FIN-P1-005 | Frozen PDF tax label comes from `snapshot.branch.tax_label`. A later live branch label does not change that frozen label. Live drafts can use the current branch label. V1 snapshots with no branch stay on the generic Tax label. | View-model unit test passed (HST frozen, GST live). |
| WF-FIN-P1-007 | Email and SMS delivery run before the customer snapshot is committed. A thrown provider call does not commit the freeze. The document number is reserved once and reused on retry. `finalizeCustomerFacingSend` remains for the existing numbering and snapshot smokes. | `executeCustomerSend` unit test passed. Live SMTP/SMS was not called. |
| WF-FIN-P1-008 | Open on a frozen invoice throws `invoice_customer_snapshot_frozen` before `signed_at`, `signed_by_name`, `approved_at`, or the snapshot JSON are cleared. The controller calls that guard before the field clears. | Unit test and source-order assertion passed. |
| WF-FIN-P1-009 | Open A/R is balance > 0 and lifecycle `sent`, `partial`, or `refunded` in the dashboard, customer open summary, and invoice list. Cash collected is payments minus refunds. Partial-payment labels no longer say deposits. Customer profile still sums invoice totals and is labeled Invoiced. | Fixture unit test passed. Browser UI was not exercised. |
| WF-FIN-P1-010 | Job delete is restricted at the invoice foreign key so invoice, payment, and stored PDF rows are not removed by deleting the job. | Migration and smoke case M are written. Neither was executed. Not claimed fixed. |
| WF-FIN-P1-011 | A native $0 invoice with no payments is lifecycle `paid`, `paidReason` `zero_total`, balance `0`, and is not open A/R. A normal payment against balance `0` is rejected by the same balance cap. | Lifecycle unit test passed. Database $0 payment case is smoke case L and was not executed. |

WF-FIN-P1-006 (void and refund UI) and WF-FIN-P1-012 (one invoice per job / deposit documents) were not in this repair.

## Tests Added / Updated

- `backend/src/crm/finance-integrity-unit-check.ts`
- `backend/src/crm/invoice-ledger-lifecycle-unit-check.ts` ($0 no-charge case)
- `frontend/scripts/check-invoice-payment-attempt.mjs`
- `backend/src/database/invoice-payment-recording-smoke.ts` cases I–M (full payment, one-cent over, concurrent full payments, ledger lock, $0 payment, job-delete restrict)
- `backend/src/database/finance-part9-document-contract-check.ts` (email attaches the pre-commit PDF buffer)

## Test Results

Passed:

- `finance-integrity:unit-check`
- `invoice-ledger-lifecycle:unit-check`
- `frontend/scripts/check-invoice-payment-attempt.mjs`
- `finance-send-snapshot:contract-check`
- `finance-part9:document-contract-check`
- `finance-endpoint-tenant:check` (source contract)
- `invoice-ledger-native-write-contract-check`
- `finance-part13:audit-contract-check`
- `finance-part13:rbac-contract-check`

Not executed:

- `crm:invoice-payment-recording:smoke` — `connect ECONNREFUSED 127.0.0.1:3306`
- `finance-part13:multi-org-idor-smoke` — same database dependency
- `portal:isolation:smoke` — same database dependency

Docker Desktop was not running, and no local MySQL service was installed.

## Backend Build

`npm run build` (`tsc -p tsconfig.build.json`) passed.

## Frontend Build

`next build` compiled, then TypeScript failed on a pre-existing job-page mismatch that this repair did not introduce:

`frontend/app/jobs/[jobId]/page.tsx` passes `canManageJobInvoice` into `JobDetailWorkspace`, and `JobDetailWorkspaceProps` does not declare that prop.

The finance files were included in that compile. No finance-file type error was reported.

The invoice list, tax field, and payment form were not verified in a browser. The app server was not running, and MySQL was unavailable.

## Tenant Isolation Verification

`finance-endpoint-tenant:check` passed. It is a source contract that staff and portal finance queries stay organization-scoped.

The database isolation smokes were not re-run. Tenant isolation behavior was not changed by this repair. Database re-verification is still outstanding.

## Remaining Known Finance Risks

- Adjustments can still exceed the invoice balance. This repair caps normal `payment` rows only.
- Void is still not assigned by an API. Refund UI beyond existing ledger rows was out of scope.
- A crash after the provider accepts the message and before snapshot commit can send again on retry. The document number stays the same, and stored PDF bytes dedupe by file hash.
- `ORG_TAX_RATE_BPS` is still an environment display setting. It is not document tax.
- Quote save still accepts the client tax rate. Conversion still copies the quote tax snapshot.
- Payments and stored documents still cascade when an invoice row itself is deleted.
- Job cancel does not close the invoice.
- Due dates still use server-local date arithmetic.
- `total_cents || amount_cents` can still treat a real `0` as missing on some read paths outside the lifecycle summarizer.
- Branch invoice prefixes are still unused.
- One invoice per job remains.

## Explicitly Deferred Features

- Multiple invoices per job
- Deposit invoice documents
- Progress billing
- Credit memos
- New refund architecture
- Write-off product
- Discounts
- Estimate numbers
- Branch prefixes
- GST/PST or QST engines
- Accounting exports
- New reports or dashboards
- CRM controller refactor
- New permissions
- List-query performance work

## Git Status

Repair changes are uncommitted. The worktree also contains unrelated pre-existing modifications and untracked probe scripts. No commit was created.

## Rollback Notes

- Code: revert the repair files listed above. Leave the unrelated working-tree files alone.
- Database: if the migration has been applied, run its `down`, which restores `ON DELETE CASCADE` on `invoices.job_id`. Do not run `down` while the application still expects `RESTRICT`, or a job delete can remove invoice, payment, and stored PDF rows again.
- The migration was not applied in this session.
- No production data was mutated.
