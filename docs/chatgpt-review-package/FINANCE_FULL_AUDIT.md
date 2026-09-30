# WizField Finance — Full Audit

Read-only source audit. No code, data, environment, or deployment changes were made. Findings are from the implementation in this repository. Runtime behavior that depends on production rows is marked as requiring verification.

Overall Finance health: **YELLOW**

No confirmed cross-tenant financial read or write was found. The ledger math for ordinary invoices is integer cents and is the source of balance. The system is not safe to treat as a closed accounting product: unsent invoices can be rewritten after cash is recorded, overpayments are accepted, tax is whatever the client sends, sent documents cannot be voided, and several owner-facing totals do not mean the same thing.

---

## 1. Executive Summary

### Strongest areas

- Money is stored in integer cents. Line totals, document tax, and document total are computed in one backend engine (`backend/src/crm/money-engine.core.ts`). The invoice save path rejects a client total that does not match that engine.
- Amount paid and balance are derived from `invoice_payments`, not from a separately trusted `amount_paid` column. Native “paid” without a ledger row is ignored. Workiz historical paid-without-ledger is an explicit exception.
- Customer send freezes a customer-facing snapshot (business, customer, address, lines, tax, total, document number). Later organization or pricebook edits do not rewrite that snapshot. PDF balance and payment lines are taken from the live ledger, so a payment after send updates the balance without rewriting historical line prices.
- Invoice numbers are allocated under a row lock, start at 1001, and are unique per organization. The sequence is not rewound on delete.
- Payment writes are organization-scoped, reject void/cancelled invoices (if those timestamps were set), cap refunds at net paid, and have a unique idempotency key per organization + invoice + key.
- Staff and portal invoice reads filter by `organization_id`. Portal PDFs also require the invoice’s job customer to match the portal session.

### Weakest areas

- One invoice per job, and that invoice stays editable after payments until it is emailed or texted.
- No void, credit memo, or refund screen. A mistaken sent invoice cannot be corrected except by an API adjustment/refund.
- Tax is a single client-supplied rate. Branch HST/GST configuration is only a default, and the PDF prints “Tax (n%)” instead of the branch tax name.
- Owner metrics disagree with each other: “open” on the invoice list is not the same set as dashboard open invoices, “deposits held” is partial payments, and customer “total revenue” is the sum of invoice totals, including unpaid ones.

### Production risks

- Recording a payment and then saving the invoice composer (before send) replaces line items and changes the total the payment applies to.
- Two browsers, or a retry after a timeout, can record two payments for one intended collection. The UI generates a new idempotency key on every submit and does not reject an amount above the balance.
- Email/SMS send freezes the invoice inside the database before the message is confirmed sent. A failed send leaves a numbered, immutable invoice the customer may never have received.

### Financial integrity risks

- Overpayment is a supported ledger state and is not blocked.
- Adjustments increase “amount paid” the same way cash does. The same permission that records cash can zero a balance without cash. The office UI never exposes this.
- `$0` invoices stay lifecycle `sent` with balance `0`. The invoice screen still calls that “fully paid.”
- `total_cents || amount_cents` treats a real zero as missing and falls back to `amount_cents`. Native saves write both fields together, so this bites legacy or drifted rows, not a normal new invoice.

### Security risks

- Tenant isolation on the finance HTTP routes that were traced is organization-scoped on the server. That is not a substitute for a fresh multi-org penetration test against a running environment.
- `invoices.organization_id` and `quotes.organization_id` are nullable, and organization delete is `ON DELETE SET NULL`. A row that lost its organization id would disappear from tenant queries and would no longer be covered by the document-number unique index (MySQL unique indexes allow multiple NULLs).
- Technicians assigned to a job can create, edit, and send that job’s invoice. They cannot record payments. Viewers and CSRs can download invoice PDFs.

### Architectural debt

- Frontend and backend money engines are duplicated copies, kept honest by a parity check rather than one shared module.
- `CrmController` owns estimate, invoice, payment, send, and signature routes in one file.
- Discounts are hard-coded to zero in the native engine. Workiz import still parses discounts.
- Branch `invoice_prefix` and `estimate_prefix` are stored and unused. Estimates have no customer-facing number.
- Job → invoice → payments → stored PDFs use `ON DELETE CASCADE`. The product API blocks customer delete when jobs exist and does not expose job delete. A direct job delete still destroys the financial history.

---

## 2. Finance Architecture Map

```
Pricebook item/bundle
        │ snapshots (sku, name, unit price, qty) at save time
        ▼
Estimate (quotes, one per job)
        │ approve / sign locks edits and freezes a customer snapshot
        │ convert copies line snapshots, recomputes tax with the money engine
        ▼
Invoice (invoices, one per job, job_id UNIQUE)
        │ lines in invoice_line_items
        │ header cents: subtotal_cents, tax_rate_bps_snapshot, tax_cents, total_cents, amount_cents
        │ send allocates document_number and freezes customer_facing_snapshot_json
        ▼
Payment ledger (invoice_payments: payment | refund | adjustment)
        │ summarizeInvoiceLedger()
        ▼
Balance / lifecycle (sent, partial, paid, overpaid, refunded, void, cancelled)
        │
        ├── Invoice UI, job invoice embed, customer profile
        ├── Office dashboard open-invoice count
        ├── Live PDF balance (lines/tax from snapshot once frozen)
        └── Stored PDF bytes written at send time
```

There is no separate deposit document, credit memo, or card-processor charge. “Card” is `card_manual`: a recorded method, not a capture. Warranty certificates read invoice line warranty snapshots and payment rows; they do not calculate tax.

### Source of truth

| Value | Source of truth | Also stored / displayed |
| --- | --- | --- |
| Line amount | `computeLineSubtotalCents` at save | `invoice_line_items.line_subtotal_cents` |
| Subtotal, tax, total | `computeDocumentTotals` at save | invoice header columns; snapshot JSON after send |
| Amount paid | Sum of payment + adjustment − refund | Not a stored column. API field `amount_paid_cents` |
| Balance | `max(0, total − net paid)` | API `balance_cents`. Void/cancel forces balance 0 |
| Paid / unpaid column | Derived from the ledger after each payment | `invoices.status` is only `unpaid` or `paid` |
| Document number | Organization sequence, assigned on send | Drafts display `INV-` + first 8 hex chars of the UUID |

### Backend

| Role | Path |
| --- | --- |
| Money rules | `backend/src/crm/money-engine.core.ts`, `money-engine.service.ts` |
| Save header + replace lines | `backend/src/crm/crm-document-persistence.ts`, `document-snapshot.service.ts` |
| Ledger math | `backend/src/crm/invoice-financial-lifecycle.core.ts` |
| Paid-requires-ledger policy | `backend/src/crm/invoice-native-ledger-policy.ts` |
| Record payment | `backend/src/crm/invoice-payment-recording.service.ts` |
| Estimate → invoice | `backend/src/crm/estimate-invoice-conversion.service.ts` |
| Numbering | `backend/src/crm/invoice-numbering.service.ts` |
| Send / freeze | `backend/src/crm/invoice-send-pipeline.service.ts`, `invoice-customer-facing-snapshot.service.ts` |
| PDF view | `backend/src/crm/invoice-pdf-view-model.service.ts`, `invoice-pdf.service.ts` |
| List/detail presentation | `backend/src/crm/finance-invoice-presentation.service.ts` |
| HTTP API | `backend/src/crm/crm.controller.ts` |
| Dashboard | `backend/src/crm/crm-office-dashboard.service.ts` |
| Portal PDF | `backend/src/crm/portal-native-invoice-pdf.service.ts`, `backend/src/customer-portal/customer-portal.read.controller.ts`, `backend/src/documents/invoice-documents/invoice-documents.portal.controller.ts` |
| Permissions | `backend/src/auth/permissions.ts` |
| Branch tax | `backend/src/crm/branch-scope.service.ts`, `backend/src/database/entities/branch.entity.ts` |

### Entities and migrations

| Table | Entity | Notes |
| --- | --- | --- |
| `quotes` | `quote.entity.ts` | One per job. No document number. |
| `quote_line_items` | `quote-line-item.entity.ts` | Price snapshots. CASCADE with quote. |
| `invoices` | `invoice.entity.ts` | One per job. Nullable `organization_id`. CASCADE with job. |
| `invoice_line_items` | `invoice-line-item.entity.ts` | Snapshots. Replaced wholesale on edit. |
| `invoice_payments` | `invoice-payment.entity.ts` | Ledger. CASCADE with invoice. |
| `invoice_documents` | `invoice-document.entity.ts` | Stored PDFs. CASCADE with invoice and customer. |
| `organization_invoice_sequences` | `organization-invoice-sequence.entity.ts` | `next_value`, pessimistic lock. |
| `branch_invoice_sequences` | `branch-invoice-sequence.entity.ts` | Present. Numbering service does not use it. |
| `branches` | `branch.entity.ts` | `tax_label`, `default_tax_rate_bps`, unused prefixes. |
| `organization_settings` | `organization-setting.entity.ts` | GST number, due days, branding. No per-org tax rate column. |

Relevant migrations: `1785000000000-invoice-payment-idempotency.ts` (unique idempotency index), `1787000000000-finance-part4-part5-foundation.ts` (unique `(organization_id, document_number)`), `1779705000000-invoice-v1-professionalization.ts` (GST number on settings).

### Frontend

| Surface | Path |
| --- | --- |
| Invoice list and KPI tiles | `frontend/app/invoices/page.tsx` |
| Invoice detail, overdue, payment | `frontend/app/invoices/[invoiceId]/page.tsx`, `frontend/lib/crm/invoice-payment-form.tsx` |
| Job invoice composer | `frontend/app/jobs/[jobId]/job-invoice-section.tsx` |
| Create-invoice workspace | `frontend/app/invoices/create/[jobId]/` |
| Estimates | `frontend/app/estimates/`, `frontend/app/jobs/[jobId]/job-quote-section.tsx` |
| Preview math | `frontend/lib/crm/money-engine.ts`, `invoice-line-model.ts`, `quote-line-model.ts` |
| Customer “total revenue” | `frontend/app/customers/[customerId]/customer-profile-workspace.tsx` |
| PDF template | `frontend/components/phoenix-invoice-document-template.tsx` |

### Lifecycle that actually exists

Legacy column `invoices.status` is only `unpaid` | `paid`.

Derived lifecycle (`summarizeInvoiceLedger`):

| State | Rule |
| --- | --- |
| `void` / `cancelled` | `voided_at` or `cancelled_at` is set. Balance forced to 0. **Nothing in `backend/src` assigns these timestamps.** |
| `sent` | No payments, and not a Workiz historical row marked paid. Also the state of a `$0` invoice with no payments. |
| `partial` | Net paid &gt; 0 and balance &gt; 0 |
| `paid` | Balance 0 and net paid &gt; 0 and not over |
| `overpaid` | Net paid &gt; total |
| `refunded` | Net paid ≤ 0 and some refund rows exist. Balance returns to the full total, so the invoice is open A/R again |

There is no draft status on the invoice row. An unsent invoice is already `issued_at = now` with a due date. “Draft” is only a display number (`INV-XXXXXXXX`) and a PDF banner (`legacy_live`) before a snapshot exists.

Immutable after **email or SMS send**: description, lines, tax, total, bill-to, service address, and business identity inside `customer_facing_snapshot_json`. Upsert returns `409 invoice_customer_snapshot_frozen`.

Not immutable after send: payment rows (still accepted), live signature columns (`POST .../open` clears them), job status.

Immutable after **approve or sign**, until someone with `invoices.manage` calls `POST /api/invoices/:id/open`: line edits. Opening does not check the frozen snapshot. After send, upsert is still frozen, but the live signature fields are cleared anyway.

Payments do not freeze the document.

---

## 3. Findings

### WF-FIN-P1-001 — Invoice totals can change after payments are recorded

**Severity:** P1  
**Area:** Invoice lifecycle / money integrity  
**Files:** `backend/src/crm/crm.controller.ts` (`upsertInvoice`), `backend/src/crm/crm-document-persistence.ts`, `backend/src/crm/document-snapshot.service.ts`  
**Evidence:** Upsert blocks edits when `approved_at` / `signed_at` is set, or when a customer snapshot exists. It does not look at `payments`. `replaceInvoiceLineItems` deletes every line for the invoice, then inserts the new set. The audit log for `invoice.upsert` stores `{ job_id }` only.  
**Current behavior:** CONFIRMED DEFECT. A partial payment, then a composer save, before send, rewrites subtotal, tax, and total. Existing payment rows stay. The ledger then recomputes balance against the new total. If the new total is below net paid, the invoice becomes overpaid. Prior line items are gone.  
**Expected behavior:** After the first payment, financial lines and totals change only through an explicit adjustment document (credit memo, revised invoice, or audited write-off), with the previous lines retained.  
**Why it matters:** Cash was collected against one total. The books can then show a different total with no line history.  
**Business impact:** High. A technician or office user can change what the customer was billed after money was taken, as long as the invoice was not emailed.  
**Recommended fix:** Reject upsert when any payment, refund, or adjustment exists. Keep line replacement out of the payment path. If a correction is required before send, require a privileged “revise unpaid invoice” action that snapshots the previous lines into an audit row.  
**Risk of fix:** Medium. Office staff who fix a draft after a deposit will need a supported correction path.  
**Tests required:** Payment, then PUT invoice with a different total, expect 409. Assert previous line rows still exist. Assert balance is unchanged.

### WF-FIN-P1-002 — Payments above the balance are accepted, and concurrent payments are not serialized

**Severity:** P1  
**Area:** Payment ledger  
**Files:** `backend/src/crm/invoice-payment-recording.service.ts`, `backend/src/crm/invoice-financial-lifecycle.core.ts`, `frontend/lib/crm/invoice-payment-form.tsx`, `backend/src/crm/invoice-ledger-lifecycle-unit-check.ts`  
**Evidence:** Recording checks `amountCents > 0`, terminal void/cancel, and refund ≤ net paid. It does not compare a payment to `balanceCents`. The unit check named “overpayment visible” expects a $120 payment on a $100 invoice to become `overpaid` by $20. The insert transaction does not `SELECT … FOR UPDATE` the invoice row. The form submits whatever amount was typed.  
**Current behavior:** CONFIRMED DEFECT for the missing cap. Overpayment as a *displayed* state is intentional. Two simultaneous “pay balance” requests with different idempotency keys both insert.  
**Expected behavior:** Either reject amounts above the open balance, or require an explicit overpayment flag. Concurrent payments must lock the invoice row and re-read the balance inside the transaction.  
**Why it matters:** Accidental extra cash, or two tabs, leaves the invoice overpaid with no customer-credit workflow to clear it.  
**Business impact:** High for trust in “balance due.” The extra cents are visible as `overpayment_cents`, so this is not a silent disappearance. It is still wrong cash application.  
**Recommended fix:** In the payment transaction, lock the invoice, recompute the ledger, and reject `payment` amounts above balance unless `allowOverpayment` is set. Surface the same rule on the form before submit.  
**Risk of fix:** Low if overpayment remains available behind a confirmation. Medium if existing imports rely on unrestricted amounts.  
**Tests required:** Payment of balance+1 cent returns 409. Two parallel payments of the full balance: one succeeds, one returns 409 or an idempotent replay. The successful path still allows a later explicit overpayment when the flag is set.

### WF-FIN-P1-003 — A retried payment uses a new idempotency key

**Severity:** P1  
**Area:** Payment ledger / idempotency  
**Files:** `frontend/lib/crm/invoice-payment-form.tsx`, `backend/src/database/migrations/active/1785000000000-invoice-payment-idempotency.ts`  
**Evidence:** Each submit sends `idempotencyKey: crypto.randomUUID()`. The unique index is `(organization_id, invoice_id, idempotency_key)`. The form sets `isBusy`, so a double-click on one response is blocked. A timeout after the server committed, followed by another click, is a new key.  
**Current behavior:** CONFIRMED DEFECT for retry. CONFIRMED safe for a second click while the first request is in flight in that same form instance.  
**Expected behavior:** One user action, one key, reused if that action is retried. The server returns the original payment.  
**Why it matters:** The database protection only works when the client sends the same key.  
**Business impact:** High. Network loss after a successful insert looks like a failure, and the next click collects again.  
**Recommended fix:** Generate the key when the amount/method is committed to an attempt, and reuse it until success. On the server, keep the unique index.  
**Risk of fix:** Low.  
**Tests required:** Same key twice returns `idempotent: true` and one row. Two keys for the same amount create two rows only when the second is still within the balance rule from WF-FIN-P1-002.

### WF-FIN-P1-004 — Tax rate is client-controlled, uncapped, and 0% when the job has no branch

**Severity:** P1  
**Area:** Tax  
**Files:** `backend/src/crm/validation.ts`, `backend/src/crm/crm.controller.ts` (`resolveJobBranchDefaultTaxRateBps`, `upsertInvoice`), `backend/src/crm/branch-scope.service.ts`, `frontend/app/jobs/[jobId]/job-invoice-section.tsx`  
**Evidence:** `taxRateBps` is any non-negative integer. The server uses `payload.taxRateBps ?? branchDefault`. The composer always sends `taxRateBps`. If `job.branch_id` is empty, or the branch is inactive, the default is 0. There is no maximum (for example 13% / 15% / 100%). Organization settings expose `taxRateBps` from the process env `ORG_TAX_RATE_BPS`, not from a per-organization column (`backend/src/settings/settings.service.ts`).  
**Current behavior:** CONFIRMED DEFECT. Branch HST/GST is a suggestion. Any invoice editor can save 0% or an absurd rate. A job with no branch is untaxed unless the user types a rate.  
**Expected behavior:** The invoice stores the branch rate (and label) that applied at issue time. Overrides require a permission and a reason. The rate is bounded. Jobs without a branch cannot be issued, or they inherit an explicit organization default stored on the organization.  
**Why it matters:** Canadian sales tax on the customer document will not reliably match the province the branch was configured for.  
**Business impact:** High. Under-collected HST is a filing problem. A later settings change does **not** rewrite invoices that were already saved, because `tax_rate_bps_snapshot` is a column. The hole is at save time, not after the fact.  
**Recommended fix:** Ignore client `taxRateBps` unless the caller has an override permission. Persist the branch label with the rate. Reject rates above a documented ceiling. Stop reading tax from `ORG_TAX_RATE_BPS` for document math.  
**Risk of fix:** Medium. Existing composers send the field; they must be updated to display the server rate rather than own it.  
**Tests required:** PUT with `taxRateBps: 0` on a branch whose default is 1300 stores 1300. PUT with `taxRateBps: 100000` is rejected. A job with a null branch is rejected or uses a stored org default, never a silent 0.

### WF-FIN-P1-005 — Customer documents say “Tax (n%)”, not GST or HST

**Severity:** P1  
**Area:** Tax / PDF  
**Files:** `backend/src/crm/invoice-pdf-view-model.service.ts`, `backend/src/database/entities/branch.entity.ts`, `backend/src/crm/invoice-customer-facing-snapshot.types.ts`  
**Evidence:** Both the frozen and live PDF builders set `taxLabel` to ``Tax (${(taxRateBps / 100).toFixed(2)}%)`` or `"Tax"`. The branch snapshot block has `tax_label` (`HST`, `GST`, and so on). The view model never reads it. The React template prints `financial_summary.tax_label`.  
**Current behavior:** CONFIRMED DEFECT. A branch configured as HST 13% still produces a line labeled “Tax (13.00%)”. GST number on the header can still be correct, because that comes from the branding snapshot.  
**Expected behavior:** The frozen snapshot’s branch tax label is what the customer sees. Live drafts use the branch label captured at render, and sent documents keep the label from freeze time.  
**Why it matters:** The rate can be right while the tax name is wrong. That is what the customer and a bookkeeper read.  
**Business impact:** Medium. It does not change the cents. It makes the document look like a generic tax instead of the tax the company is registered for.  
**Recommended fix:** Store `tax_label` inside `financial` at freeze time and render that string. Do not recompute the label from the rate alone.  
**Risk of fix:** Low.  
**Tests required:** Branch `tax_label = HST`, rate 1300. Frozen PDF view model label is `HST`, not `Tax (13.00%)`. Changing the branch label afterward does not change an already frozen snapshot.

### WF-FIN-P1-006 — No void, and no way in the product UI to refund or write off

**Severity:** P1  
**Area:** Invoice lifecycle  
**Files:** `backend/src/crm/invoice-financial-lifecycle.core.ts`, `backend/src/crm/invoice-native-ledger-policy.ts`, `backend/src/crm/crm.controller.ts` (`recordInvoicePayment`), `frontend/lib/crm/invoice-payment-form.tsx`  
**Evidence:** `voided_at` / `cancelled_at` are read in the ledger and never assigned anywhere under `backend/src` (search for assignment found none). The payment API accepts `entryType` `payment | refund | adjustment`. The form only posts `payment`. A full refund sets lifecycle to `refunded` and puts the **full invoice total** back into balance. An adjustment **increases** net paid; it does not reduce the invoice total.  
**Current behavior:** CONFIRMED DEFECT for void (missing). CONFIRMED for refund/write-off being API-only. MISSING CAPABILITY: credit memo that reduces total.  
**Expected behavior:** A sent invoice that should not be collected can be voided or credited. Void keeps the number, zeroes the open balance, and does not delete payments. Refunds and write-offs are visible office actions with a reason.  
**Why it matters:** Send makes the document immutable (WF-FIN-P1-007 / freeze). Without void, a wrong sent total stays the legal-looking total forever. Staff can only add cash, or call the API.  
**Business impact:** High. Collections will keep chasing a bad invoice, or someone will post an adjustment that looks like a payment.  
**Recommended fix:** Add a void transition that sets `voided_at`, blocks further payments (already implemented once the timestamp exists), and leaves rows in place. Add a refund form that posts `entryType: "refund"` with the existing cap. Do not treat adjustment as cash in owner “collected” totals.  
**Risk of fix:** Medium. Void must not cascade-delete. Dashboard queries must keep excluding void balance (they already force balance 0).  
**Tests required:** Void after a partial payment: lifecycle `void`, balance 0, payment rows remain, further POST payment returns 409. Refund greater than net paid returns 400. UI refund of a partial amount reduces net paid and increases balance.

### WF-FIN-P1-007 — Send freezes and numbers the invoice before the email or SMS succeeds

**Severity:** P1  
**Area:** Document identity / lifecycle  
**Files:** `backend/src/crm/invoice-send-pipeline.service.ts`, `backend/src/crm/crm.controller.ts` (`sendInvoiceEmail`, `sendInvoiceSms`, `completeInvoiceCustomerSend`)  
**Evidence:** `finalizeCustomerFacingSend` allocates `document_number`, writes the snapshot, and commits. `completeInvoiceCustomerSend` then renders and stores the PDF. Only after that does `emailService.send` or `txtService.sendMessage` run.  
**Current behavior:** CONFIRMED DEFECT. If the provider throws, the invoice is already numbered and `invoice_customer_snapshot_frozen`. The user cannot fix a typo and resend a corrected document. The sequence number is consumed.  
**Expected behavior:** Freeze and number in the same transaction as a durable “send intended” record, but if the provider fails, either roll back the freeze or leave an explicit “send failed, safe to revise” state. Do not burn immutability on a failed send.  
**Why it matters:** The control that protects historical invoices (the freeze) fires before the customer communication it is meant to match.  
**Business impact:** High on the first send of a real invoice. Staff get a locked wrong invoice and a gap in the number sequence.  
**Recommended fix:** Send first to a staging path, or commit freeze only after the provider accepts the message. On failure, keep the draft editable and do not advance the sequence. If the number must be stable for retries, reserve it without freezing lines.  
**Risk of fix:** Medium. Retry must not send two different PDFs under one number, and must not send one PDF under two numbers.  
**Tests required:** Provider failure after `finalizeCustomerFacingSend` is simulated. Assert the invoice is either still editable and unnumbered, or marked send-failed with a single number and a single stored PDF. A second successful send does not allocate another number.

### WF-FIN-P1-008 — “Open for changes” strips signature on an already sent invoice

**Severity:** P1  
**Area:** Approvals / document integrity  
**Files:** `backend/src/crm/crm.controller.ts` (`openInvoiceDocument`)  
**Evidence:** `POST /api/invoices/:invoiceId/open` requires `invoices.manage`, then nulls `approval_requested_at`, `approved_at`, `signature_requested_at`, `signed_at`, and `signed_by_name`. It does not check `isFrozen`. Upsert still rejects frozen content. Estimates have no equivalent open route.  
**Current behavior:** CONFIRMED DEFECT. After send, the frozen PDF can still show the signature captured in the snapshot, while the live invoice row says it was never signed.  
**Expected behavior:** Opening a frozen invoice is rejected. Opening an unsent signed invoice is an audited unlock, and it is refused once any payment exists (see WF-FIN-P1-001).  
**Why it matters:** Staff and the customer document disagree about whether the invoice was approved.  
**Business impact:** Medium. It does not change cents. It damages the audit story of a signed bill.  
**Recommended fix:** If `isFrozen`, return 409. Write an audit row that includes the previous signature name and timestamp.  
**Risk of fix:** Low.  
**Tests required:** Sign, send, open. Live `signed_at` remains set (or open returns 409). Snapshot signature is unchanged.

### WF-FIN-P1-009 — Owner totals do not share one definition of paid, open, deposit, or revenue

**Severity:** P1  
**Area:** Dashboard / customer reporting  
**Files:** `frontend/app/invoices/page.tsx`, `backend/src/crm/crm-office-dashboard.service.ts`, `frontend/app/customers/[customerId]/customer-profile-workspace.tsx`, `frontend/messages/en.ts`  
**Evidence:**

- Invoice list pipeline `open` keeps only `lifecycle_status === "sent"` and `balance_cents > 0`. Partial and refunded invoices with a balance are excluded.
- `deriveInvoiceMetrics` outstanding sums every `balance_cents > 0`, so partial and refunded balances are in the tile and not in the “open” filter.
- Dashboard `isOpenInvoice` includes `sent`, `partial`, and `refunded` when balance &gt; 0.
- “Deposits held” sums `amount_paid_cents` on **partial** invoices only. The helper text says “Partial payments collected on deposit invoices.” There is no deposit document.
- “Paid invoices” sums `total_cents` of paid and overpaid invoices, not cash collected. Overpayment above the total is omitted. A refunded invoice is omitted even though cash moved.
- Customer profile `totalRevenueCents` sums `invoice.total_cents` for every invoice returned, paid or not.

**Current behavior:** CONFIRMED DEFECT (semantic). The cents inside each formula match the fields they read. The labels do not match each other.  
**Expected behavior:** One definition, used everywhere:

- Open A/R = sum of balance where lifecycle is collectible (`sent`, `partial`, `refunded`) and balance &gt; 0.
- Cash collected = sum of net paid on non-void invoices.
- Deposits = a real deposit liability, or the label is changed to “Partial payments.”
- Customer revenue = collected, or the label is changed to “Invoiced.”

**Why it matters:** An owner reconciling the invoice tile, the office dashboard, and the customer page will get three different stories.  
**Business impact:** High for trust. Medium for actual bank deposits, because this layer does not move money.  
**Recommended fix:** Compute the tiles from `summarizeInvoiceLedger` in one backend endpoint. Stop summing in the browser. Name the metrics the way the formula works, or change the formula to match the name.  
**Risk of fix:** Medium. People may already be used to the inflated “revenue” number.  
**Tests required:** Fixture: one unpaid, one partial, one fully refunded, one overpaid. Assert list outstanding, dashboard open count, and customer revenue against the written definitions. They must match.

### WF-FIN-P1-010 — Deleting a job cascades through invoices, payments, and stored PDFs

**Severity:** P1  
**Area:** Data integrity  
**Files:** `backend/src/database/entities/invoice.entity.ts`, `invoice-payment.entity.ts`, `invoice-document.entity.ts`, `quote.entity.ts`, `backend/src/crm/customer-deletion.service.ts`  
**Evidence:** Invoice → job is `onDelete: "CASCADE"`. Payments and line items cascade from the invoice. `invoice_documents` cascade from both the invoice and the customer. Customer delete in the API counts jobs and returns `409 customer_has_jobs` without deleting jobs. No production job-delete route was found (only smoke tests call `jobsRepository.delete`). Organization and branch links are `ON DELETE SET NULL`.  
**Current behavior:** CONFIRMED schema behavior. The office UI does not currently offer the destructive path. A SQL delete of a job, or a future job-delete feature that uses the ORM relation, destroys the ledger.  
**Expected behavior:** Financial rows survive job and customer removal. Foreign keys from invoice/payment/document to job and customer should be `RESTRICT` or the job should be archived.  
**Why it matters:** The ledger is only as durable as the job row.  
**Business impact:** High if any operator, import repair, or future feature deletes jobs. Low in the current UI.  
**Recommended fix:** Change invoice and quote FKs to `RESTRICT`. Change payment and invoice-document FKs to `RESTRICT`. Archive jobs instead of deleting them. Keep the customer-delete guard.  
**Risk of fix:** Medium. Smoke tests and import tools that delete jobs must be updated. Production data is untouched until a migration runs.  
**Tests required:** Delete job with an invoice expects a constraint error and unchanged payment count. Customer delete with a job still returns 409.

### WF-FIN-P1-011 — A zero-dollar invoice is “sent” in the ledger and “fully paid” on screen

**Severity:** P1  
**Area:** Edge cases / UX  
**Files:** `backend/src/crm/invoice-financial-lifecycle.core.ts`, `frontend/app/invoices/[invoiceId]/page.tsx`, `frontend/app/jobs/[jobId]/job-invoice-section.tsx`  
**Evidence:** With no payment rows, lifecycle is `paid` only for Workiz historical `status = paid`. A native `$0` invoice takes the no-payment branch: lifecycle `sent`, balance `0`. `paidReason: "zero_total"` is only set when the status is already `paid` or `overpaid`, which for a `$0` total requires a positive payment (that payment is then `overpaid`). The detail page treats `balance_cents <= 0` as “Closed out / This invoice is fully paid.” The composer asks for confirmation before saving `$0`, so the state is reachable on purpose. Recording a payment requires `amountCents > 0`, so you cannot post a zero-amount payment to flip it to paid.  
**Current behavior:** CONFIRMED DEFECT.  
**Expected behavior:** Total 0 and net paid 0 is `paid` with reason `zero_total`, or an explicit `no_charge` state. The screen uses that status. Posting cash on a zero invoice is rejected or becomes customer credit, not a casual overpayment.  
**Why it matters:** Warranty or goodwill invoices look unpaid in filters that key off `sent`, and look paid on the detail page.  
**Business impact:** Medium. They do not distort outstanding A/R (balance is 0, and outstanding sums balances). They distort “needs follow-up” and status language.  
**Recommended fix:** In `summarizeInvoiceLedger`, if `totalCents === 0` and net paid is 0, return `paid` / `zero_total`. Reject payments against a zero total unless overpayment is explicit.  
**Risk of fix:** Low.  
**Tests required:** `$0`, no payments → `paid`, `paidReason = zero_total`, not in the open queue. `$0` plus a $1 payment → 409, or `overpaid` only with the explicit flag.

### WF-FIN-P1-012 — One invoice per job, so deposits and progress bills are not real documents

**Severity:** P1  
**Area:** Estimate → revenue / product model  
**Files:** `backend/src/database/entities/invoice.entity.ts` (`job_id` unique), `quote.entity.ts` (`job_id` unique), `frontend/app/invoices/page.tsx`  
**Evidence:** Both tables declare `job_id` unique. Conversion writes that single invoice. “Deposits held” is the sum of payments on invoices that are only partly paid.  
**Current behavior:** MISSING CAPABILITY. A deposit and a final invoice cannot both exist. A second estimate on the same job cannot exist.  
**Expected behavior:** If the business takes a deposit before the final bill, those are either separate documents with their own numbers and balances, or the UI stops calling partial payments “deposits held.”  
**Why it matters:** Field-service cash flow is often deposit, then balance. This model collapses both into one mutable-then-frozen invoice.  
**Business impact:** High for companies that collect before the work is finished. The partial-payment ledger itself is internally consistent.  
**Recommended fix:** Decide the product rule. Short term: rename the metric. Longer term: allow multiple invoices per job (deposit, progress, final) with one sequence and explicit links, and stop using a unique `job_id` on `invoices`.  
**Risk of fix:** High for the schema change. Low for the rename.  
**Tests required:** After any schema change: two invoices on one job, independent balances, no shared line overwrite. Until then: a partial payment appears under a label that says partial payment, not deposit.

### WF-FIN-P2-013 — Native discounts do not exist

**Severity:** P2  
**Area:** Discounts  
**Files:** `backend/src/crm/money-engine.core.ts`  
**Evidence:** `DocumentMoneyResult.discountCents` is the literal `0`. Comment: “discounts deferred” and “no discounts in Part 3.” Taxable amount equals subtotal. Workiz CSV import has a discount parser (`workiz-invoice-csv-parser.ts`) that is not the native save path.  
**Current behavior:** MISSING CAPABILITY for new WizField invoices. Not a math bug inside the engine that runs today.  
**Expected behavior:** Either no discount field anywhere in the product, or discount is an engine input: taxable base = subtotal − discount, with a stored snapshot, and a rule for discount greater than subtotal.  
**Why it matters:** Staff will fake discounts by lowering the unit price, which destroys the catalog price and the audit trail.  
**Business impact:** Medium.  
**Recommended fix:** Do not add a discount box until the engine, snapshot, PDF, and ledger all take `discount_cents` from one function. Reject discount &gt; subtotal.  
**Risk of fix:** Medium when implemented. Low to leave it absent, as long as the UI does not imply a discount.  
**Tests required:** When built: 10% discount, 100% discount, and discount above subtotal. Tax base must match the engine, not the UI.

### WF-FIN-P2-014 — Estimate numbers and branch prefixes are not part of sequencing

**Severity:** P2  
**Area:** Document identity  
**Files:** `backend/src/crm/invoice-numbering.service.ts`, `backend/src/database/entities/branch.entity.ts`, `backend/src/database/entities/quote.entity.ts`  
**Evidence:** Quotes have no `document_number`. The numbering service states that branch sequences “remain in schema but are intentionally not used.” `allocateOrganizationDocumentNumber` uses `sequence.prefix`, and new rows set `prefix: ""`. Branch columns `invoice_prefix` and `estimate_prefix` are not read there. Unsent invoices display `INV-` plus eight characters of the UUID (`invoice-display-number.ts`), then switch to `1001` style at send.  
**Current behavior:** CONFIRMED for invoices (org-wide numeric sequence, pessimistic lock, unique index). MISSING CAPABILITY for estimate numbers. ARCHITECTURAL RISK: a branch prefix configured in settings will not appear on invoices.  
**Expected behavior:** Customer-facing estimate numbers are unique per organization and are not reused. If branch prefixes are a setting, the allocator uses them, or the setting is removed.  
**Why it matters:** Two drafts can be discussed only by a UUID fragment. After send, the number is stable. Estimates never get that stability.  
**Business impact:** Medium for quote follow-up. Low for invoice uniqueness, which is in good shape.  
**Recommended fix:** Add an estimate sequence with the same lock and unique `(organization_id, document_number)` pattern. Wire or delete branch prefixes so settings match output.  
**Risk of fix:** Medium. Historical Workiz codes must remain the display number when `document_number` is null and the branding snapshot says Workiz (that fallback already exists).  
**Tests required:** Two concurrent allocations get distinct numbers. Deleting an invoice does not reissue its number. An estimate receives a number once, and editing the draft does not change it.

### WF-FIN-P2-015 — Provincial tax is one combined rate, not GST + PST

**Severity:** P2  
**Area:** Tax (Canada)  
**Files:** `money-engine.core.ts`, `branch.entity.ts`  
**Evidence:** One `tax_rate_bps_snapshot` and one tax amount. No PST/QST/GST split, no tax-exempt line flag, no place-of-supply engine. Branch defaults in tests use GST 500 bps and HST 1300 bps (`branch-foundation-unit-check.ts`).  
**Current behavior:** MISSING CAPABILITY beyond a single rate and label per branch. HST provinces can be represented as one rate. BC/Saskatchewan/Manitoba/Quebec-style GST+PST (or GST+QST) cannot be shown as two taxes. The product does not claim a split-tax engine in the money module.  
**Expected behavior:** Do not show two tax lines until they exist. Document that each branch has one rate. When a split is required, snapshot each component on the invoice so a later rate change cannot alter history.  
**Why it matters:** A combined 12% line is not the same document as GST 5% plus PST 7%, even when the total matches.  
**Business impact:** Medium for multi-province companies that must show both taxes. Low if every branch is HST-only or GST-only.  
**Recommended fix:** Keep the single rate until a province needs a split. Then extend the snapshot, not the live branch row, as the document source.  
**Risk of fix:** High if done now, because PDF, portal, and Workiz import all assume one tax figure.  
**Tests required:** None until the model grows. Existing test: tax cents = `round(subtotal * bps / 10000)` once per document, not per line.

### WF-FIN-P2-016 — `total_cents || amount_cents` treats zero as “missing”

**Severity:** P2  
**Area:** Money integrity  
**Files:** `backend/src/crm/finance-invoice-presentation.service.ts`, `backend/src/crm/crm-office-dashboard.service.ts`, `backend/src/crm/invoice-payment-recording.service.ts`, `backend/src/crm/invoice-pdf-view-model.service.ts`  
**Evidence:** Ledger input is `invoice.total_cents || invoice.amount_cents`. The same pattern is used for subtotal. Native persist writes `amount_cents` and `total_cents` to the same value, so a real `$0` invoice stays `$0`. A legacy row with `total_cents = 0` and a positive `amount_cents` is reported as `amount_cents` on purpose for backfill. Any future row that is legitimately zero in `total_cents` while `amount_cents` is stale will show the stale number.  
**Current behavior:** ARCHITECTURAL RISK. Not a confirmed wrong balance on native invoices created by `persistInvoiceHeaderAndLineItems`.  
**Expected behavior:** Use `total_cents` when the column has been backfilled. Use an explicit “legacy amount only” flag for old rows. Never use JavaScript truthiness on money.  
**Why it matters:** The next zero-total bug will be invisible because the fallback hides it.  
**Business impact:** Medium on imported data if `total_cents` was not backfilled and is a real zero. Low on new native invoices.  
**Recommended fix:** `const total = invoice.total_cents ?? invoice.amount_cents` only if the column is null. It is not null; it defaults to 0. Backfill, then read `total_cents` only.  
**Risk of fix:** Medium on Workiz rows. Verify a sample of imported invoices before switching.  
**Tests required:** `total_cents = 0`, `amount_cents = 5000` is either rejected or classified as legacy and tested. `total_cents = 0`, `amount_cents = 0` stays 0.

### WF-FIN-P2-017 — Due date “today” is computed in two clocks

**Severity:** P2  
**Area:** Overdue  
**Files:** `backend/src/crm/crm.controller.ts` (`computeDueAt`), `frontend/app/invoices/[invoiceId]/page.tsx` (`isPastDue`)  
**Evidence:** Due date is `issuedAt` plus `default_due_days` via `Date#setDate` on the server’s local clock. Overdue on the invoice page compares calendar dates in the browser’s local clock (`setHours(0,0,0,0)`). The invoice list does not show an overdue queue; overdue is a detail-page signal. Organization settings have a timezone field; due math does not use it.  
**Current behavior:** CONFIRMED behavior, LIKELY DEFECT at the timezone boundary. An invoice due “today” can be overdue on a laptop in another zone, or not overdue on the server.  
**Expected behavior:** Due dates are calendar dates in the organization timezone. Overdue is `organization today > due date` and balance &gt; 0, computed once on the server.  
**Why it matters:** Follow-up calls will fire a day early or a day late for companies not in the server’s zone.  
**Business impact:** Medium.  
**Recommended fix:** Store `due_on` as a date. Compare it to the organization’s local date on the server. Have the UI display that flag.  
**Risk of fix:** Low.  
**Tests required:** Org timezone `America/Edmonton`, server UTC, due date equal to the Edmonton calendar day: not overdue. The next Edmonton day: overdue. A paid invoice is never overdue.

### WF-FIN-P2-018 — Cancelling a job does not close its invoice

**Severity:** P2  
**Area:** Lifecycle  
**Files:** `backend/src/crm/crm.controller.ts` (`updateJobStatus`)  
**Evidence:** Setting job status to `cancelled` writes job columns and a status event. It does not set invoice `cancelled_at`, void the invoice, or block payment.  
**Current behavior:** CONFIRMED. The invoice remains collectible.  
**Expected behavior:** Cancelling a job with an open balance requires a choice: void the invoice, or keep it and say so. Silent independence is how invoices get collected for cancelled work, or how cancelled work still shows in A/R.  
**Why it matters:** The office dashboard and the job screen will disagree about whether the work is dead.  
**Business impact:** Medium.  
**Recommended fix:** When a job is cancelled, if the invoice has no payments and is unsent, mark the invoice cancelled. If it has payments or was sent, block cancellation until the invoice is voided or credited (WF-FIN-P1-006).  
**Risk of fix:** Medium.  
**Tests required:** Cancel job with an unpaid unsent invoice → invoice not in open A/R. Cancel job with a payment → 409 until void/refund.

### WF-FIN-P2-019 — Conversion can overwrite an empty invoice and does not copy the stored estimate total

**Severity:** P2  
**Area:** Estimate conversion  
**Files:** `backend/src/crm/estimate-invoice-conversion.service.ts`  
**Evidence:** Conversion requires an approved or signed estimate, blocks rejected estimates, blocks a locked invoice, blocks any payment rows, and blocks an invoice that already has lines (same quote → `invoice_already_converted`, other lines → `invoice_exists`). It then recomputes totals with `computeSnapshotTotals` and the quote’s `tax_rate_bps_snapshot`. It does not assert equality with `quote.total_cents`. Status and `paid_at` are copied from the existing invoice when one exists with **zero** lines. That path does not call `resolveNativeUpsertInvoiceStatus`.  
**Current behavior:** PARTIAL. The happy path (approved estimate, no invoice lines, no payments) copies line snapshots and retaxes them with the same engine, so a native estimate matches. LIKELY DEFECT: a paid Workiz invoice that imported with no line items and no payment rows can be replaced while `status` stays `paid`. If origin remains `workiz_historical`, the ledger will treat the new total as paid with no cash (`legacy_status_migration`).  
**Expected behavior:** Conversion copies frozen estimate lines and the stored total, or recomputes and fails if it differs. It never runs against a historical paid invoice. A second conversion is a no-op.  
**Why it matters:** Estimate and invoice can diverge by a cent if rounding rules change later, and a legacy paid shell can be turned into a different paid invoice.  
**Business impact:** Medium, high if empty historical invoices exist. This audit did not query production to count them.  
**Recommended fix:** Refuse conversion when `financeOrigin === "workiz_historical"` or `status === "paid"`. After recompute, require `invoiceTotals.totalCents === quote.total_cents`.  
**Risk of fix:** Low.  
**Tests required:** Convert twice → 409. Convert onto an invoice with a payment → 409. Recomputed total must equal the quote total. Workiz paid + zero lines → 409.

### WF-FIN-P2-020 — Adjustments are unscoped write-offs sharing the payment permission

**Severity:** P2  
**Area:** Payments / RBAC  
**Files:** `backend/src/crm/invoice-native-ledger-policy.ts`, `backend/src/crm/crm.controller.ts`  
**Evidence:** `entry_type === "adjustment"` is added into gross paid, same as `payment`. No extra permission, no required note, no ceiling other than a positive integer. The audit action is `invoice.adjustment`, metadata is amount and payment id, not a reason code.  
**Current behavior:** CONFIRMED. Any owner, admin, or office admin who can record cash can also mark an invoice paid without cash by posting an adjustment. The UI does not offer it, so this is an API capability.  
**Expected behavior:** Write-offs are a separate permission, require a note, and show up in reporting as write-offs, not as cash collected.  
**Why it matters:** “Amount paid” stops meaning money received.  
**Business impact:** Medium. It is also the only way to clear a bad balance until void exists.  
**Recommended fix:** Split reporting: cash vs adjustments. Require `note` for adjustments. Optional: `invoices.writeoff.manage`.  
**Risk of fix:** Low.  
**Tests required:** Adjustment without a note returns 400. Customer cash-collected total excludes adjustments. Balance still drops.

### WF-FIN-P3-021 — Finance rules live in a duplicated engine and a very large controller

**Severity:** P3  
**Area:** Architecture  
**Files:** `backend/src/crm/money-engine.core.ts`, `frontend/lib/crm/money-engine.ts`, `backend/src/crm/crm.controller.ts`, `backend/src/crm/money-engine-parity-check.ts`, `frontend/scripts/check-money-engine-parity.mjs`  
**Evidence:** The frontend copies quantity thousandths, line rounding, and tax rounding. A parity script compares them. Invoice routes, estimate routes, send, and signatures are methods on `CrmController`.  
**Current behavior:** ARCHITECTURAL RISK. Parity holds only while both copies stay aligned. A check exists; that is better than an unguarded copy.  
**Expected behavior:** One module imported by both sides, or the client displays server totals only. Controller split is worthwhile when the next person has to change payment rules without reading thousands of lines.  
**Why it matters:** A one-line rounding change on the server with a stale client produces `totals_mismatch` failures, or worse, a client that stops sending the check.  
**Business impact:** Low today because `assertClientTotalMatchesEngine` fails closed.  
**Recommended fix:** Keep the parity check in CI. Move the frontend file to import generated or shared source when the repo layout allows it. Do not rewrite the controller for style.  
**Risk of fix:** Medium for a shared package. Low for keeping the parity script mandatory.  
**Tests required:** The existing parity vectors, plus a negative test that a drifted client total returns 400 `totals_mismatch`.

### WF-FIN-P3-022 — Invoice lists load every invoice for the organization, then filter in memory

**Severity:** P3  
**Area:** Reporting  
**Files:** `backend/src/crm/crm.controller.ts` (`listInvoices`), `backend/src/crm/crm-office-dashboard.service.ts` (`countOpenInvoices`)  
**Evidence:** Both load all invoices for `organization_id` with payments (and jobs, on the list) and filter in process. Technician visibility is applied after the query, on the server, before the response. This is not a cross-tenant leak. It is an unbounded read.  
**Current behavior:** CONFIRMED implementation. Not a confirmed outage.  
**Expected behavior:** SQL filters for status, customer, and search, with an index on `(organization_id, issued_at)`.  
**Why it matters:** A/R pages get slower as history grows, and a bug in the in-memory filter would be the only thing between a technician and another job’s invoice in that org. The filter itself is correct today (`canAccessInvoiceResource`).  
**Business impact:** Low until invoice volume is large.  
**Recommended fix:** Push organization, customer, and lifecycle filters into the query when the list is next changed. Do not do it as a drive-by.  
**Risk of fix:** Medium. Easy to drop the technician assignment rule if it moves to SQL incorrectly.  
**Tests required:** Technician A does not receive technician B’s invoice in the list payload. Query plan uses `organization_id`.

---

## 4. Financial Integrity Matrix

| Area | Result | Why |
| --- | --- | --- |
| Invoice math | PASS | Integer cents. Line = `round(unitPriceCents * quantityThousandths / 1000)`. Total = subtotal + tax. Client total must match or save returns 400. |
| Tax | PARTIAL | One document-level `round(subtotal * bps / 10000)`. Snapshot column exists. Rate is client-supplied and unlabeled on the PDF (WF-FIN-P1-004, P1-005). |
| Discounts | FAIL | Native discount is hard-coded 0. Not applied, not validated. |
| Payments | PARTIAL | Ledger rows have id, time, method, invoice, org, actor, idempotency key. No balance cap, retry key is unstable (WF-FIN-P1-002, P1-003). |
| Partial payments | PASS | Net paid between 0 and total → `partial`, balance = total − net paid. |
| Deposits | FAIL | No deposit document or liability. UI “deposits held” = partial payments (WF-FIN-P1-012). |
| Balances | PARTIAL | Formula is consistent in the ledger service. Void forces 0 but void cannot be set. `$0` balance is described as paid on the detail page while lifecycle stays `sent`. |
| Refund / reversal | PARTIAL | Refund rows reduce net paid and cannot exceed it. No UI. Full refund reopens the full balance as `refunded`. No reversal of a single payment except another refund row. Payments cannot be edited or deleted through an API that this audit found. |
| Estimate conversion | PARTIAL | Line snapshots are copied. Duplicate conversion and payments block it. Stored quote total is not asserted. Empty historical invoices are a hole (WF-FIN-P2-019). |
| PDF consistency | PARTIAL | After send, lines and totals come from the snapshot; balance comes from the live ledger. That split is correct. Tax **label** does not come from the branch. A send failure can store a PDF the customer did not get. `POST .../open` can desync signature fields from the snapshot. |
| Dashboard consistency | FAIL | See WF-FIN-P1-009. |
| Customer revenue | FAIL | Sum of invoice totals, including unpaid. |
| Document numbering | PARTIAL | Invoice numbers: unique per org, locked sequence, not reused by the allocator, assigned at send. Draft display id is not the legal number. Estimates have no number. Branch prefixes are ignored. |

Rounding check performed while auditing: every cent amount from `$0.01` through `$2,000.00`, converted with `Math.round(Number(toFixed(2)) * 100)`, round-tripped. Zero mismatches. Quantity thousandths from `1` through `100000` also round-tripped. This does not prove MySQL `INT` overflow above `$21,474,836.47` per column, and validation does not cap at signed 32-bit max.

---

## 5. Edge Case Matrix

| Scenario | Current behavior | Expected | Risk | Result |
| --- | --- | --- | --- | --- |
| $0 invoice | Saved after a browser confirm. Lifecycle `sent`, balance 0. Detail copy says fully paid. | Explicit paid / no-charge. | Follow-up noise | UNSAFE |
| $0.01 invoice | Cents path supports it. | Same | Low | SAFE |
| Very large invoice | No max in `requireNonNegativeInteger`. MySQL signed `INT` overflows past 2,147,483,647 cents. | Reject above a stated ceiling. | DB error or bad row | UNSAFE |
| Fractional quantity | Up to 3 decimal places, rounded to thousandths. | Same | Low | SAFE |
| Quantity zero | Regex and `quantityToThousandths` reject `<= 0`. | Reject | Low | SAFE |
| Negative quantity | Rejected by the decimal pattern. | Reject | Low | SAFE |
| Negative price | `unitPriceCents` must be a non-negative integer. | Reject | Low | SAFE |
| 100% discount | No discount input. | Defined rule | Staff edit the price instead | NOT IMPLEMENTED |
| Discount &gt; 100% | No discount input. | Reject | Same | NOT IMPLEMENTED |
| Duplicate payment submit (double-click) | `isBusy` blocks the second click in one form. | One row | Low | SAFE |
| Duplicate payment after timeout | New UUID, second row. | Same key, one row | Extra cash | UNSAFE |
| Payment greater than balance | Accepted. Status `overpaid`. | Reject or explicit confirm | Wrong cash application | UNSAFE |
| Payment after void | Rejected **if** `voided_at` or `cancelled_at` is set. Nothing sets them. | Reject | Cannot void, so the guard never runs | NOT IMPLEMENTED |
| Edit invoice after payment | Allowed until send or signature lock. Lines deleted and replaced. | Block | History loss | UNSAFE |
| Delete customer with invoice history | API returns 409 while any job exists. | Preserve history | Low via API | SAFE |
| Delete job with invoice history | No product delete route. FK CASCADE would destroy invoice, payments, and PDFs. | RESTRICT | Ops / future API | UNSAFE |
| Organization switch during composer | Save uses the session organization and the job id. A job in another org returns 404. This audit did not click through a live session switch. | Job and invoice stay in one org | Medium if the client keeps a stale job id | UNKNOWN |
| Double-click Save | Composer returns immediately when `isSaving` is true. | One write | Low | SAFE |
| Double-click Record Payment | Blocked while `isBusy`. | One write | Low | SAFE |
| Refresh during save | Second request is another PUT. Last write wins. No idempotency key on upsert. | Safe retry | Lost intermediate edit | UNDEFINED |
| Timeout after server accepted payment | Client shows failure. Retry inserts another payment. | Idempotent retry | Duplicate cash | UNSAFE |
| Simultaneous tabs | Two payment keys both commit. Two invoice PUTs last-write-wins. | Lock | Overpay / lost update | UNSAFE |
| Timezone / date boundary | Server `setDate` vs browser local midnight. Org timezone ignored. | Org calendar date | Wrong overdue | UNSAFE |
| Tax config changed after issue | Saved `tax_rate_bps_snapshot` and, after send, snapshot JSON stay. Unsent invoices change only if saved again, and then they use the client rate, not automatically the new branch rate. | Historical docs stable | Medium | PARTIAL / SAFE once sent |
| Customer or address changed after send | Frozen bill-to and service address stay on the PDF. Live customer record can change. | Snapshot holds | Low | SAFE |
| Pricebook changed after invoice save | Line stores `unit_price_cents_snapshot` and related cost snapshots. | Independent | Low | SAFE |
| Negative net refund | API `assertRefundAmountAllowed`. | Reject | Low | SAFE |
| Mark paid with no payment | Native upsert throws `invoice_paid_requires_ledger`. Workiz historical may stay paid. | Native requires cash | Low for native | SAFE |

---

## 6. Security and Tenant Isolation

**Financial tenant isolation was proven by code inspection of the routes below, not by a new runtime attack against a running server.** Existing smoke coverage includes `backend/src/database/finance-part13-multi-org-idor-smoke.ts` and `backend/src/database/portal-isolation-smoke.ts`. This audit did not re-execute them.

What the code does:

- Staff invoice list, detail, PDF, stored PDF, send email, send SMS, approval, signature, open, and payment all set `organization_id` from the actor and put it in the `WHERE` clause.
- Estimate list/detail and quote upsert do the same.
- Conversion loads the job and the quote with `organization_id`, then requires `quote.job_id === jobId`.
- Portal document view and portal PDF load the invoice by id **and** `organization_id`, then require `job.customer_id === portal customer`. A foreign id returns 404, not the other tenant’s body.
- Payment idempotency lookup includes `organization_id` and `invoice_id`.
- Warranty generate/read requires an organization id and an invoice permission. Generate uses `invoices.manage` (not the technician assigned-manage permission).

What is **not** proven:

- A live cross-org session was not attempted in this audit.
- Rows with `organization_id` NULL are invisible to every tenant query (`organization_id = :id` does not match NULL). They are not readable by org B through these filters. They are also unprotected by the unique document-number index. That is an orphan-data risk, not a demonstrated cross-tenant read.
- In-memory technician filtering happens after a full org fetch. The response is filtered. A defect in that filter would be an intra-org leak, not a cross-org leak.

**No confirmed P0 cross-tenant financial exposure was found. Do not treat that as a penetration test.**

---

## 7. RBAC Matrix

Permissions are enforced in `backend/src/auth/permissions.ts` and checked inside `CrmController`. Hiding a button is not what this table records.

`canManageInvoiceResource` is `invoices.manage`, or `invoices.assigned.manage` when the actor is the job’s technician.  
`canAccessInvoiceResource` is `invoices.view`, or `invoices.assigned.view` for that technician.

| Capability | Owner | Admin | Office admin | Dispatcher | CSR | Technician (assigned job) | Technician (other job) | Viewer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| View all invoices | Yes | Yes | Yes | Yes | Yes | No | No | Yes |
| View assigned invoice | Yes | Yes | Yes | Yes | Yes | Yes | No | Yes |
| Create / edit invoice | Yes | Yes | Yes | No | No | Yes | No | No |
| Send invoice email/SMS | Yes | Yes | Yes | No | No | Yes | No | No |
| Record payment / refund / adjustment API | Yes | Yes | Yes | No | No | No | No | No |
| Approve, sign, or open invoice | Yes | Yes | Yes | No | No | No (`invoices.manage` only) | No | No |
| Download invoice PDF | Yes, if they can view | Yes | Yes | Yes | Yes | Yes, assigned only | No | Yes |
| View estimates | Yes | Yes | Yes | Yes | Yes | Assigned only (`estimates.assigned.view`) | No | Yes |
| Create / edit estimates | Yes | Yes | Yes | No | No | No | No | No |
| Approve / sign estimate | Yes (`estimates.manage` on the write routes) | Yes | Yes | No | No | No | No | No |
| Convert estimate → invoice | Yes | Yes | Yes | No | No | Yes, assigned (`canManageInvoiceResource`) | No | No |
| View customer page and its invoice rollup | Yes | Yes | Yes | Yes (`customers.view`) | Yes | No | No | Yes |
| Office dashboard | Yes | Yes | Yes | Yes | No | No | No | Yes |
| Organization settings / GST number | Yes | Yes | Yes (`settings.manage` is in the office set via “all minus exclusions”; exclusions do not remove `settings.manage`) | No | No | No | No | No |

Privilege notes:

- A technician can change prices and send the invoice, and cannot record the payment. That split is real on the server.
- A technician can convert an estimate they are not allowed to edit.
- Viewer and CSR can download PDFs for every invoice in the org. That matches `invoices.view`.
- `POST .../open` is office-level (`invoices.manage`), so a technician cannot clear a signature. An office admin can, including after send (WF-FIN-P1-008).
- There is no separate “void invoice” or “refund” permission because those actions are missing or folded into `invoices.payment.manage`.

---

## 8. Test Gap Report

Ordered by financial risk. Names are the tests that should exist, not a coverage slogan.

### P0 — tenant and corruption

1. Org A session calls `GET /api/invoices/:orgBInvoiceId`, `GET .../pdf`, `GET .../documents/:id/pdf`, `POST .../payments`, `PUT /api/jobs/:orgBJob/invoice`. Expect 404, zero rows written.
2. Portal session for customer A requests customer B’s invoice id. Expect 404.
3. Payment transaction: two concurrent full-balance payments, one row or one success plus a 409. Today this would fail the test, which is the point.
4. Upsert after a payment returns 409 and line count is unchanged.
5. Job delete with an invoice fails and payment count is unchanged (after the FK change).

### P1 — wrong balance, tax, payment, document

6. `$0` invoice lifecycle and UI flag agree.
7. Client `taxRateBps: 0` does not override a branch rate of 1300.
8. Frozen PDF label equals branch `tax_label`.
9. Email provider failure does not leave a frozen numbered invoice, or it leaves a single explicit failed-send state.
10. `open` after send returns 409 and `signed_at` is unchanged.
11. Refund above net paid returns 400. Refund equal to net paid reopens balance to the total and dashboard open A/R includes it.
12. Void sets balance 0, retains payments, blocks another payment.
13. Same idempotency key returns the original payment id. A second key above the remaining balance returns 409.
14. Invoice list outstanding, dashboard open balance, and a single backend A/R figure are equal on a fixture of sent + partial + refunded + overpaid.
15. Customer “invoiced” and “collected” are separate fields and match the ledger.
16. Conversion onto a paid zero-line historical invoice returns 409. Second conversion returns 409. Recomputed total equals `quote.total_cents`.

### P2 — workflow

17. Cancel job with an open unsent invoice removes it from A/R or returns 409 when cash exists.
18. Due date uses organization timezone, not the browser.
19. Estimate allocation does not collide under parallel calls, once estimate numbers exist.
20. Adjustment without a note is rejected and is excluded from cash collected.

### Already present (do not re-build blindly)

- `backend/src/crm/invoice-ledger-lifecycle-unit-check.ts` — partial, paid, overpaid, refunded, void-if-timestamp-set, Workiz legacy paid.
- `backend/src/crm/money-engine-unit-check.ts` and `money-engine-parity-check.ts` — rounding parity.
- `backend/src/database/invoice-payment-recording-smoke.ts` — recording path.
- `backend/src/database/finance-part13-multi-org-idor-smoke.ts` — multi-org IDOR smoke (not re-run here).
- `backend/src/database/estimate-invoice-conversion-smoke.ts` and pricebook drift smoke.
- `backend/src/auth/invoice-assigned-manage-unit-check.ts` — technician assignment.

Missing from those files: balance cap, upsert-after-payment, tax override rejection, send failure rollback, dashboard definition parity, zero-total paid reason.

---

## 9. Cleanup Opportunities

Evidence only. None of these are required to stop a live exploit.

- Delete or stop displaying `ORG_TAX_RATE_BPS` on organization settings. Document tax comes from the branch, and the env value is process-wide (`settings.service.ts`).
- Remove `branch_invoice_sequences` from the active design, or start using it. The numbering service already says it is unused.
- Remove `invoice_prefix` and `estimate_prefix` from the branch UI until the allocator reads them.
- Replace `total_cents || amount_cents` with an explicit legacy flag after a one-time backfill check. The pattern is copied in the presentation service, the dashboard, the payment recorder, and the PDF view model.
- `discount_cents: 0` on every native document can stay until discounts exist. Do not add UI for it.
- `CrmController` finance methods can move beside the services that already exist (`InvoicePaymentRecordingService`, conversion, send pipeline). Do this when touching those routes for the P1 fixes, not as a standalone rewrite.
- Frontend `money-engine.ts` should remain covered by `frontend/scripts/check-money-engine-parity.mjs` until it is a shared module.

---

## 10. Ranked Remediation Plan

### Immediate — P0

None confirmed.

Closest items are financial corruption by an authorized user, not cross-tenant reads. Treat the first three P1 items as the production blockers.

### Next — P1

| Action | Effort | Risk | Business impact | Files / systems |
| --- | --- | --- | --- | --- |
| Block invoice edits once any ledger row exists; stop deleting line history | M | Medium | High | `crm.controller.ts`, `document-snapshot.service.ts`, audit log |
| Cap payments at balance and lock the invoice row; stable idempotency key in the form | M | Low | High | `invoice-payment-recording.service.ts`, `invoice-payment-form.tsx` |
| Server-owned tax rate and label; PDF uses the snapshotted label | M | Medium | High | `crm.controller.ts`, `invoice-pdf-view-model.service.ts`, snapshot types, composers |
| Freeze only after send succeeds, or add a failed-send state that can still be revised | M | Medium | High | `invoice-send-pipeline.service.ts`, `crm.controller.ts` |
| Void transition that keeps rows; refund UI; stop calling partial payments “deposits” until a real deposit exists | L | Medium | High | New route, payment form, `invoices/page.tsx`, dashboard |
| One A/R definition for list, dashboard, and customer profile | M | Medium | High | `finance-invoice-presentation.service.ts`, invoice list, customer profile |
| Refuse `open` on frozen invoices | S | Low | Medium | `crm.controller.ts` |
| `$0` invoice lifecycle matches the screen | S | Low | Medium | `invoice-financial-lifecycle.core.ts`, invoice detail |
| Change job/invoice/payment/document FKs from CASCADE to RESTRICT | M | Medium | High | Entities, migration, smoke cleanup |

### Then — P2

| Action | Effort | Risk | Business impact | Files / systems |
| --- | --- | --- | --- | --- |
| Estimate document numbers | M | Medium | Medium | New sequence, quote entity, estimate UI |
| Organization-timezone due dates | S | Low | Medium | Due-date helper, invoice detail |
| Job cancel vs invoice policy | M | Medium | Medium | `updateJobStatus` |
| Conversion guards for historical paid shells and total equality | S | Low | Medium | `estimate-invoice-conversion.service.ts` |
| Split cash vs adjustment in reporting; require a note | S | Low | Medium | Ledger presentation, payment validation |
| Stop using truthiness on cent fields after a data check | M | Medium | Medium | Presentation, dashboard, PDF |
| Discount engine, only if the product will show a discount | L | Medium | Medium | Money engine, snapshot, PDF, both composers |

### Later — P3

| Action | Effort | Risk | Business impact | Files / systems |
| --- | --- | --- | --- | --- |
| Keep money-engine parity in CI; share the module when practical | S | Low | Low | `money-engine.core.ts`, frontend copy, CI |
| SQL-side invoice list filters | M | Medium | Low | `listInvoices`, dashboard counts |
| Remove unused branch sequence and env tax display | S | Low | Low | Settings UI, numbering comments |
| Split finance routes out of `CrmController` while doing the P1 work | L | Medium | Low | `crm.controller.ts` |

---

## Audit limits

- No production database was queried. Counts of Workiz invoices with zero lines, null `organization_id`, or drifted `total_cents` vs `amount_cents` are unknown.
- No browser session was logged in. UI copy cited from source (`isPastDue`, metric helpers, payment form) was not re-clicked.
- IDOR smokes were read as existing tests, not re-run.
- Card settlement, SMS delivery success, and mailbox delivery were not exercised.
