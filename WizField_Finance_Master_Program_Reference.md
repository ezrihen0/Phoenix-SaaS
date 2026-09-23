# WizField Finance Master Program Reference

**Document type:** Execution Reference / Master Program Map  
**Project:** WizField  
**Program:** Finance / Estimates / Invoices Production Cleanup  
**Status:** Planning reference — no implementation authority by itself  
**Owner intent:** Build a reliable, production-safe Finance spine for WizField in controlled layers.

---

# 1. Purpose

This document is the master reference for the complete WizField Finance cleanup program.

It exists so every future agent or execution package understands:

- the full Finance roadmap
- the order of execution
- the boundary of each Part
- what must already be true before the next Part begins
- which areas are protected
- what must not be mixed together
- what "done" means for the whole Finance program

This file does **not** authorize implementation on its own.

Every Part still requires:

1. a specific execution plan
2. exact file inventory
3. owner approval
4. implementation
5. testing
6. closeout
7. canonical documentation updates when product truth changes

---

# 2. Program North Star

WizField Finance must become one coherent operating spine:

```text
Customer
→ Job
→ Estimate
→ Invoice
→ Payment Ledger
→ Financial Lifecycle
→ Historical Snapshot
→ PDF / Customer Document
→ Customer / Portal / Reporting
```

The system must be understandable from both directions:

```text
Owner UX
→ business action
→ API
→ service
→ data model
→ financial truth
→ historical document
```

and:

```text
Stored financial truth
→ lifecycle
→ document snapshot
→ PDF
→ customer-visible output
```

The target is **not** merely to fix the invoice screen.

The target is a reliable Finance domain for WizField.

---

# 3. Program Execution Rules

## 3.1 Controlled execution

Work must be completed one Part at a time.

Do not execute multiple Parts simultaneously unless the owner explicitly approves a combined scope.

## 3.2 Production safety

Finance contains real customer and money data.

Protected areas include:

- invoices
- estimates
- payments
- payment ledger
- financial calculations
- historical snapshots
- document/PDF history
- Workiz imported records
- tenant isolation
- production database
- organization ownership

## 3.3 No broad cleanup

Do not perform unrelated:

- refactors
- naming cleanup
- dependency upgrades
- schema cleanup
- UI redesign
- migration rewriting

unless directly required by the approved Part.

## 3.4 Backend authority

The final financial truth must be backend-authoritative.

Frontend math may exist for preview and UX, but it must not become a competing financial authority.

## 3.5 Historical truth

Historical financial/customer-facing documents must not silently change because of later edits to:

- customers
- jobs
- organization settings
- Pricebook
- warranties
- payment instructions
- renderer templates
- translation settings

## 3.6 Imported historical truth

Workiz historical records are evidence of past business activity.

They must not be silently normalized to match future native WizField models.

---

# 4. Complete Program Map

The Finance program is divided into **7 Parts** covering the original 16 phases.

```text
PART 1
Production Truth & Finance Contract
Phases 0–1

PART 2
Core Creation Flows
Phases 2–3

PART 3
Conversion & Money Engine
Phases 4–5

PART 4
Ledger & Historical Snapshot Foundation
Phases 6–7

PART 5
Document Engine
Phases 8–10

PART 6
Historical Data & Product Integrations
Phases 11–12

PART 7
Hardening, UX & Production Closeout
Phases 13–15
```

Dependency direction:

```text
Part 1
↓
Part 2
↓
Part 3
↓
Part 4
↓
Part 5
↓
Part 6
↓
Part 7
```

Later Parts may depend on truths created by earlier Parts.

Do not skip dependencies.

---

# PART 1 — Production Truth & Finance Contract

**Original phases:** 0–1

## Goal

Establish exactly what exists in production and define the canonical Finance rules before implementation begins.

## Scope

### Phase 0 — Production Truth & Baseline

Establish:

- canonical Phoenix production organization
- real production database
- real Finance row counts
- native WizField vs imported Workiz records
- current runtime invoice path
- current Invoice / Estimate / Payment / PDF behavior
- production anomalies
- actual owner blockers

### Phase 1 — Finance Domain Contract

Define:

- entity ownership
- financial authority
- financial invariants
- estimate lifecycle
- invoice lifecycle
- payment ledger lifecycle
- snapshot rules
- historical document rules
- imported Workiz rules
- PDF boundary

## Required outputs

- Production Truth report
- Finance Domain Contract
- Financial Invariant Matrix
- Estimate lifecycle contract
- Invoice lifecycle contract
- Payment lifecycle contract
- Historical Snapshot Contract
- Owner decision list
- Part 2 readiness verdict

## Explicitly out of scope

- code fixes
- schema changes
- migrations
- invoice redesign
- PDF redesign
- payment repair
- Workiz data repair

## Exit gate

Part 1 is complete only when:

```text
Production truth verified OR explicitly blocked with exact reason
Finance domain contract complete
Financial invariants defined
Snapshot contract defined
Owner decisions resolved or listed
Part 2 can be planned safely
```

---

# PART 2 — Core Creation Flows

**Original phases:** 2–3

## Goal

Make Invoice and Estimate creation reliable, simple, and canonical.

## Phase 2 — Invoice Creation V2

Target owner flow:

```text
Quick Create
→ Invoice
→ Customer
→ Job / required context
→ Invoice Composer
→ Lines
→ Tax / supported pricing
→ Save Draft
→ Resume / Edit
```

### Required capabilities

- canonical Quick Create route
- real New Invoice flow
- customer selection
- job selection or owner-approved job bootstrap
- one canonical invoice composer
- manual line creation
- Pricebook line creation
- save
- reload
- edit
- permission handling
- tenant-safe ownership

### Part 2 implementation truth (Finance creation — 2026-09)

**Routes**

- Invoice chooser: `/invoices/create` (legacy `/invoices/new` redirects with query preserved).
- Invoice owner composer: `/invoices/create/[jobId]`.
- Estimate chooser: `/estimates/create` (legacy `/estimates/new` redirects).
- Estimate owner composer: `/estimates/create/[jobId]`.
- Job detail tabs remain the full workflow surface (`?tab=invoice`, `?tab=quote`).

**Post-save (owner composers — locked)**

- Save **does not** auto-navigate to document detail.
- Composer stays open; shows explicit **Saved** acknowledgement; hydrates invoice/estimate id and state for resume/edit.
- **View Invoice** / **View Estimate** is an explicit action after the document exists.

**Minimal job bootstrap (shared)**

- `FinanceJobBootstrapPanel` on invoice and estimate choosers when a customer has no jobs.
- Owner selects **job type** and **service type**; service address is prefilled from the customer when present and editable.
- No fabricated defaults for type, scheduling, technician, or internal notes. Full intake remains at `/jobs/new`.

**Owner vs job-tab composer**

- Owner: no pull-from-quote, no record-full-payment (invoice), no mark-approved shortcut (estimate).
- Job tab: unchanged (pull from quote, payments, approval actions).

### Product question to resolve

Determine whether:

```text
One Invoice per Job
```

is:

- intended product truth

or:

- a current technical limitation

Do not casually remove this rule without owner approval.

## Phase 3 — Estimate System Cleanup

Build a coherent Estimate creation path with:

- canonical composer
- customer/job context
- manual lines
- Pricebook lines
- bundles where supported
- tax
- totals
- statuses
- approval
- signature
- lock/finalization rules

The Estimate system should share concepts with Invoice where appropriate without forcing unsafe premature abstraction.

## Explicitly out of scope

- Estimate → Invoice conversion engine
- payment ledger redesign
- PDF V2
- invoice numbering
- discount architecture unless required to preserve existing truth

## Exit gate

```text
Invoice creation reliable
Estimate creation reliable
Core save/edit/reload flows tested
Tenant isolation tested
No conversion or payment redesign accidentally mixed in
```

---

# PART 3 — Conversion & Money Engine

**Original phases:** 4–5

**Implementation status:** Shipped in codebase (money engine + conversion API + job-tab UI). Discounts remain deferred.

## Goal

Make financial transformation and calculation deterministic.

## Part 3 implementation truth (2026-09)

**Money engine (Phase 5 — discounts deferred)**

- Backend authority: [`MoneyEngineService`](backend/src/crm/money-engine.service.ts) / [`money-engine.core.ts`](backend/src/crm/money-engine.core.ts) (line subtotal via quantity thousandths → document subtotal → tax → total).
- Frontend preview parity: [`frontend/lib/crm/money-engine.ts`](frontend/lib/crm/money-engine.ts) used by invoice/estimate preview totals.
- Upsert paths reject client total drift when line items are present (`totals_mismatch`).

**Estimate → Invoice conversion (Phase 4)**

- API: `POST /api/jobs/:jobId/invoice/convert-from-estimate` with optional `{ estimateId }`.
- Gate: estimate must be **approved or signed** (locked customer-facing truth).
- Copies **persisted quote line snapshots** to invoice lines (no live Pricebook re-hydration on this path).
- Provenance: `invoices.source_quote_id` exposed as `source_estimate_id` on invoice reads.
- Job tab UI: **Convert from estimate** replaces **Pull from quote**; owner composer unchanged.
- Idempotency: repeat conversion from same estimate when invoice already has lines → `409 invoice_already_converted`.

## Phase 4 — Estimate → Invoice Conversion Engine

Replace frontend-style "pull from quote" behavior with an explicit conversion contract.

Required rule:

> The Invoice created from an Estimate must copy frozen Estimate customer-facing financial truth and must not silently rebuild values from live Pricebook data.

### Conversion should preserve

- line name
- description
- quantity
- unit price
- warranty/customer-facing line data
- tax basis
- approved values
- estimate provenance

Store or expose the relationship:

```text
Invoice created from Estimate X
```

where technically appropriate.

## Phase 5 — Money Engine

Create one canonical backend financial authority for:

```text
Line Amount
→ Subtotal
→ Discount
→ Taxable Amount
→ Tax
→ Total
```

Define and implement:

- rounding rules
- quantity behavior
- line pricing
- document pricing
- discounts if approved
- tax calculation
- taxable/non-taxable policy if required
- stored vs derived values

Frontend calculations become preview/parity behavior only.

## Explicitly out of scope

- payment ledger overhaul
- PDF V2 layout
- historical PDF persistence
- Workiz bulk repair

## Exit gate

```text
Estimate conversion snapshot-safe
Backend money engine authoritative
Frontend/backend parity verified
No live Pricebook drift after approved Estimate conversion
```

---

# PART 4 — Ledger & Historical Snapshot Foundation

**Original phases:** 6–7

## Goal

Make money state and historical document truth reliable.

## Phase 6 — Payment Ledger & Financial Lifecycle

Payment ledger becomes the canonical basis for financial lifecycle.

Required lifecycle model should define behavior for:

- unpaid
- partial
- paid
- overpaid
- refunded
- adjustment
- void
- cancelled

Required rules include:

```text
net payment truth comes from ledger
balance derives from financial truth
paid must have a canonical reason
overpayment must remain visible
refund must affect lifecycle correctly
dashboard/reporting must not rely on stale legacy status
```

Any legacy `invoice.status` behavior must be reconciled with the canonical lifecycle contract.

## Phase 7 — Historical Snapshot Foundation

Create the historical customer-facing truth required for stable invoices.

Snapshot requirements may include:

- business identity
- logo reference if used
- business address
- business phone/email
- customer Bill To identity
- customer address
- service address
- job/service reference
- line content
- quantities
- pricing
- discounts
- tax
- totals
- warranties
- terms
- payment instructions
- dates
- immutable invoice identifier

Snapshot timing must be explicit.

Possible lifecycle points:

- save
- send
- approval
- signature
- finalization

The owner-approved contract decides the final rule.

## Part 4 implementation truth (2026-09)

**Ledger (Phase 6)**

- Canonical summarize logic: [`invoice-financial-lifecycle.core.ts`](backend/src/crm/invoice-financial-lifecycle.core.ts) via [`InvoicePaymentLedgerService`](backend/src/crm/invoice-payment-ledger.service.ts).
- API exposes `lifecycle_status`, `balance_cents`, `overpayment_cents`, `paid_reason` (internal on ledger summary); legacy `invoice.status` sync still binary paid/unpaid from lifecycle paid/overpaid.
- Document-terminal lifecycle: `void` / `cancelled` when `invoices.voided_at` / `cancelled_at` set (columns present; workflow UI deferred).
- Office dashboard open-invoice counts/lists use ledger summaries, not `invoices.status = unpaid` alone.

**Customer-facing snapshot (Phase 7)**

- Column: `invoices.customer_facing_snapshot_json` schema v1 ([`invoice-customer-facing-snapshot.types.ts`](backend/src/crm/invoice-customer-facing-snapshot.types.ts)).
- **Freeze trigger:** first customer-facing send (email or SMS) via [`InvoiceSendPipelineService`](backend/src/crm/invoice-send-pipeline.service.ts).
- Post-freeze invoice upserts return `409 invoice_customer_snapshot_frozen`.

## Explicitly out of scope

- visual PDF V2 redesign
- invoice sequence redesign unless required structurally
- portal redesign

## Exit gate

```text
Ledger authoritative
Lifecycle reproducible
Old invoice customer/settings edits cannot alter frozen truth
Snapshot model verified
```

---

# PART 5 — Document Engine

**Original phases:** 8–10

## Goal

Turn correct Finance truth into durable professional customer documents.

## Phase 8 — Invoice PDF V2

PDF V2 must render from the canonical document snapshot / Finance truth.

Target information architecture:

```text
Business Header
Invoice Number / Dates / Status

Bill To
Service Location

Job / Service Reference

Line Items
- Name
- Description
- Quantity
- Unit Price
- Discount
- Tax
- Amount

Subtotal
Discount
Tax
Total

Payments
Balance Due

Customer Notes
Warranty / Terms
Payment Instructions

Business Footer
```

PDF is a renderer.

PDF must **not** become a source of financial truth.

## Phase 9 — Document Storage & Versioning

Define durable native WizField document history.

Potential concepts:

- generated invoice document
- finalized invoice PDF
- sent invoice version
- immutable customer-facing document record
- original imported Workiz PDF

Required ability:

> Know exactly which customer-facing document version existed or was sent at a given point in time.

Imported source PDFs must remain distinguishable from native WizField PDFs.

## Phase 10 — Invoice Numbering

Replace UUID-prefix display numbering with business-grade organization-scoped numbering.

Required properties:

- immutable
- organization-scoped
- unique
- concurrency-safe
- historical compatibility
- deterministic display

Do not rewrite historical imported invoice identifiers without explicit owner approval.

## Part 5 implementation truth (2026-09)

**Invoice PDF V2 (Phase 8)**

- Renderer: [`InvoicePdfService`](backend/src/crm/invoice-pdf.service.ts) fed by [`InvoicePdfViewModelService`](backend/src/crm/invoice-pdf-view-model.service.ts) (snapshot-first when frozen; live draft preview before send).
- Layout adds job/service reference, payments list, overpayment line, discount row when present, company address in header.

**Document storage (Phase 9)**

- Native PDF kind: `native_customer_pdf` on `invoice_documents` with `generation_sequence`, `snapshot_hash`, `sent_via`, `renderer_version` (`invoice-pdf-v2`).
- Persisted on send after freeze via [`InvoiceNativeDocumentService`](backend/src/documents/invoice-documents/invoice-native-document.service.ts).
- Portal PDF prefers latest native document, else `workiz_source_pdf`.

**Invoice numbering (Phase 10)**

- Column: `invoices.document_number` unique per org; allocated on first send from `organization_invoice_sequences` ([`InvoiceNumberingService`](backend/src/crm/invoice-numbering.service.ts)).
- Draft display falls back to Workiz provenance or `INV-{uuid8}` until send.

**Checks:** `npm run finance-part4-part5:checks` (backend).

## Exit gate

```text
PDF V2 renders canonical snapshot truth
Native document history durable
Invoice numbering production-safe
Old documents remain stable
```

---

# PART 6 — Historical Data & Product Integrations

**Original phases:** 11–12

## Goal

Reconcile legacy historical Finance and reconnect the finished Finance spine to the rest of WizField.

## Phase 11 — Workiz Historical Reconciliation

Audit real imported Workiz Finance for:

- totals
- tax
- discounts
- payments
- overpayments
- original PDFs
- provenance
- invoice identifiers
- customer/job relationships
- anomalies

Classify anomalies rather than blindly repairing them.

Potential classifications:

```text
Historical source truth
Import mapping issue
Missing source evidence
Native model incompatibility
Safe repair candidate
Do not repair
```

Any write repair requires a separate approved correction plan.

## Phase 12 — Customer / Job / Portal Integration

Reconnect Finance consistently into:

- Customer history
- Job Finance tab
- Estimate relationship
- Invoice relationship
- Payments
- Customer Portal
- dashboard
- reporting
- AI read surfaces where applicable

One domain truth should feed every surface.

Do not create separate status logic per screen.

## Part 6 implementation truth (2026-09)

**Unified Finance reads (Phase 12)**

- [`FinanceInvoicePresentationService`](backend/src/crm/finance-invoice-presentation.service.ts) builds invoice list/detail fields: ledger totals, `finance_origin`, `display_document_number`, `snapshot_frozen`.
- Customer portal home invoice rows expose `lifecycle_status`, `balance_cents`, `finance_origin`, `document_origin`; `payment_state` uses ledger (not legacy `invoice.status` alone).
- Home AI money widget and invoice tool reads use ledger open-balance rules via presentation service.

**Workiz audit (Phase 11 — read-only)**

- `npm run finance-part6:workiz-audit` (requires `FINANCE_AUDIT_ORG_ID` or `PHOENIX_ORG_ID`) writes classification JSON under `_runtime_harness/finance-part6-workiz-audit/`.
- **No bulk repair** in Part 6; `workiz:final:reconcile` remains out of scope for automated closeout.

**Checks:** `npm run finance-part6:checks`

## Exit gate

```text
Historical Workiz truth classified
Native vs imported behavior understood
Customer/Job/Portal read the same canonical Finance truth
No duplicate lifecycle models
```

---

# PART 7 — Hardening, UX & Production Closeout

**Original phases:** 13–15

## Goal

Harden Finance for real production use and close the program.

## Phase 13 — Permissions / Tenant / Audit Trail

Verify all financial operations are organization-scoped.

Audit:

- invoice list/detail/create/edit
- estimate list/detail/create/edit
- conversion
- payment recording
- refund/adjustment
- document retrieval
- PDF
- search
- dashboard
- portal
- imported document access

Requirements:

- no ID-only tenant-owned reads
- backend organization scope authoritative
- correct role permissions
- auditability of high-risk mutations
- foreign-org negative tests

## Phase 14 — Owner UX Polish

Final owner workflow target:

```text
+
→ Invoice
→ Customer
→ Job / Service
→ Lines
→ Tax / Discount
→ Review
→ Save
→ PDF / Send
```

Improve only after underlying Finance truth is stable.

Potential improvements:

- fewer clicks
- sensible defaults
- consistent Estimate/Invoice terminology
- clear status language
- better error messages
- reduced technical jargon
- obvious payment state
- direct navigation
- reliable resume/edit behavior

The goal is operational speed, not decorative redesign.

## Phase 15 — Production Reverification & Finance Closeout

Run final production-grade verification.

Required verification classes:

- migration/schema verification
- invoice creation tests
- estimate creation tests
- conversion tests
- money-engine tests
- partial payment tests
- full payment tests
- refund tests
- overpayment tests
- document snapshot tests
- PDF golden/document tests
- invoice numbering tests
- imported historical compatibility
- tenant negative tests
- real Phoenix production verification
- frontend/backend builds
- git review

Final program status may only be marked closed after evidence is recorded.

## Part 7 implementation truth (2026-09)

**Permissions / tenant / audit (Phase 13)**

- Table `finance_audit_events` + [`FinanceAuditService`](backend/src/crm/finance-audit.service.ts) logs invoice upsert, send, snapshot freeze, payments/refunds/adjustments, estimate→invoice conversion.
- `npm run finance-endpoint-tenant:check` — static guard that core Finance handlers call `requireActiveOrganizationId`.
- `npm run finance-org-isolation:smoke` — baseline org-scoped invoice read isolation fixture.

**Owner UX helpers (Phase 14)**

- [`frontend/lib/crm/invoice-lifecycle.ts`](frontend/lib/crm/invoice-lifecycle.ts) — shared lifecycle labels (incl. sent-locked).
- [`frontend/lib/crm/finance-api-errors.ts`](frontend/lib/crm/finance-api-errors.ts) — owner-plain messages for common Finance API codes.

**Closeout (Phase 15)**

- `npm run finance-part7:closeout` — orchestrates build, Part 6 checks, tenant check, isolation smoke, payment recording smoke.
- `npm run phoenix-finance:closeout-readonly` — read-only org invoice origin counts → `_runtime_harness/finance-program-closeout/phoenix-readonly.json`.

## Post-program closeout & certification (Plans 8–9 — 2026-09)

**Evidence pack (Plan 8)**

- Folder: `backend/_runtime_harness/finance-program-closeout/<timestamp>/` (and `latest/` mirror for key artifacts).
- `npm run finance-part8:evidence-pack` — alias for full certification run.
- No Workiz mutating repair in closeout; read-only audit only when `FINANCE_AUDIT_ORG_ID` or `PHOENIX_ORG_ID` is set.

**§9 certification matrix (Plan 9)**

- `npm run finance-part9:certify` — orchestrates build, Part 6 checks, tenant/isolation/portal smokes, payment recording smoke, frontend `tsc`, Phoenix readonly closeout; optional Workiz audit and Playwright when env flags set.
- `npm run finance-program:finish` — §11 orchestrator: configured-DB smokes, resolves Phoenix org for Workiz audit, then `finance-part9:certify`.
- Emits: `completion-matrix.json`, `closeout-summary.json`, `open-items-waivers.json`, `cross-surface-walkthrough.md`, `CERTIFICATION.md`, `git-sha.txt`.
- Env: `FINANCE_CLOSEOUT_DIR` (output path), `FINANCE_CERTIFY_PLAYWRIGHT=1` (UI smokes), `FINANCE_CERTIFY_MANUAL_PASS=1` (owner completed manual §9 items).
- Program status derived: `COMPLETE` | `COMPLETE WITH WAIVERS` | `NOT COMPLETE` (exit code 1 on `NOT COMPLETE`).

## Exit gate

```text
Finance production behavior verified
Financial truth reproducible
Historical documents stable
Tenant safety verified
Owner workflow usable
Production evidence recorded
```

---

# 5. Original 16-Phase Mapping

| Original Phase | Program Part |
|---|---|
| 0 — Production Truth & Baseline | Part 1 |
| 1 — Finance Domain Contract | Part 1 |
| 2 — Invoice Creation V2 | Part 2 |
| 3 — Estimate System Cleanup | Part 2 |
| 4 — Estimate → Invoice Conversion Engine | Part 3 |
| 5 — Money Engine | Part 3 |
| 6 — Payment Ledger & Lifecycle | Part 4 |
| 7 — Historical Snapshot Foundation | Part 4 |
| 8 — Invoice PDF V2 | Part 5 |
| 9 — Document Storage & Versioning | Part 5 |
| 10 — Invoice Numbering | Part 5 |
| 11 — Workiz Historical Reconciliation | Part 6 |
| 12 — Customer / Job / Portal Integration | Part 6 |
| 13 — Permissions / Tenant / Audit Trail | Part 7 |
| 14 — Owner UX Polish | Part 7 |
| 15 — Production Reverification & Closeout | Part 7 |

---

# 6. Program-Wide Financial Invariants

Every Part must preserve these principles.

## 6.1 Core calculation

Conceptually:

```text
Subtotal
- Discounts
= Taxable / Net pre-tax amount

+ Tax
= Total

Total
- Net Payments
= Balance
```

Exact taxability policy must follow the approved Finance contract.

## 6.2 Ledger

Payment truth must be explainable by ledger evidence.

## 6.3 Overpayment

Overpayment must not disappear because balance is clamped to zero.

## 6.4 Historical snapshots

Frozen customer-facing documents must remain reproducible.

## 6.5 Conversion

Approved Estimate customer-facing truth must not change because Pricebook changes later.

## 6.6 Tenant ownership

Every tenant-owned Finance read/write must remain scoped to the active organization.

## 6.7 Imported truth

Historical imported evidence is never silently rewritten merely to satisfy the native WizField model.

---

# 7. Program Stop Conditions

Stop execution immediately if:

- production organization identity is uncertain
- production DB identity is uncertain for a data-bearing operation
- financial formulas cannot be reconciled
- a migration threatens historical Finance data
- a foreign-org financial record becomes readable
- implementation would rewrite Workiz historical truth without an approved repair plan
- PDF work requires inventing missing financial data
- payment lifecycle cannot be reconciled safely
- unexpected files or unrelated modules must be modified
- a Part expands into later Parts without owner approval

When stopping, report:

```text
What happened:
Why it matters:
Affected Part:
Production risk:
Recommended next action:
```

---

# 8. Agent Reference Rule

At the beginning of every Finance Part:

1. Read this Master Program Reference.
2. Read the current canonical WizField Source of Truth files.
3. Read the previous Finance Part closeout.
4. Confirm the current Part number.
5. State what is explicitly in scope.
6. State what later Parts are explicitly out of scope.
7. Produce the required file inventory and risk plan.
8. Wait for owner approval before implementation.

The agent must never interpret this master document as permission to execute all 7 Parts.

---

# 9. Program Completion Definition

The Finance program is complete only when WizField can truthfully satisfy all of the following:

- Owner can reliably create an Estimate.
- Owner can reliably create an Invoice.
- Estimate converts to Invoice without financial drift.
- Backend owns financial math.
- Payment ledger explains payment state.
- Partial/full/refund/overpayment states are deterministic.
- Historical customer-facing Finance truth is immutable.
- Native PDF output is professional and reproducible.
- Native documents have durable historical records.
- Invoice numbers are business-grade and organization-scoped.
- Imported Workiz data remains historically honest.
- Customer, Job, Portal, Dashboard, and reporting use consistent Finance truth.
- Finance is tenant-safe.
- Real Phoenix production data has been reverified.
- Final production evidence is recorded.

---

# 10. Current Program Position

```text
Master Program: DEFINED

Parts 1–7:
IMPLEMENTATION SHIPPED (see Part N implementation truth blocks)

Post-program (Plans 8–9):
Evidence pack + §9 certification orchestrator SHIPPED
Run: npm run finance-part9:certify (backend)

Certification status:
COMPLETE WITH WAIVERS — automated smokes + Workiz audit PASS via finance-program:finish
Remaining waivers: Playwright/manual creation, snapshot/PDF sign-off, cross-surface walkthrough
Evidence: backend/_runtime_harness/finance-program-closeout/latest/
Owner sign-off on CERTIFICATION.md required for COMPLETE (no waivers).
```

---

# 11. Program Finish Master Plan

**Purpose:** Close the Finance program under §9 with evidence, owner sign-off, and no open FAIL rows in the certification matrix.  
**Scope:** Verification, documentation, and ops — **not** new Parts, Workiz bulk repair, or unrelated product work.  
**Definition of done:** `npm run finance-part9:certify` → program status **`COMPLETE`** (waivers only where owner explicitly accepts documented risk) + signed `CERTIFICATION.md` + git review of shipped Parts committed.

## 11.1 Finish gate (single outcome)

```text
§9: all 15 criteria PASS or owner-accepted WAIVED with written reason in open-items-waivers.json
Phase 15: evidence folder timestamped + latest/ mirror updated
§10: updated to PROGRAM CLOSED with certify git SHA and sign-off date
No STOP conditions from §7 triggered during finish work
```

## 11.2 Preconditions (before starting)

| Check | Owner action |
|-------|----------------|
| Canonical Phoenix org | Confirm org id/slug and DB (`PHOENIX_ORG_ID` / `.env` DB) match **production truth** intent |
| Code on disk | Parts 1–7 + Plans 8–9 merged or committed; migrations applied on target verify DB |
| No repair scope creep | Workiz changes limited to **read-only audit** unless a separate correction plan is approved |
| Runtime for UI tests | Backend + frontend running locally or in CI when using Playwright |

## 11.3 Workstreams (execute in order)

### Stream A — Environment & integration smokes (clears §9 #5, #6, #13 portal leg)

**Goal:** Payment and portal isolation smokes run **PASS**, not ephemeral-DB waiver.

1. **Local (no CREATE DATABASE):** set `FINANCE_SMOKE_USE_CONFIGURED_DATABASE=1` or run the finish orchestrator (sets it automatically).
2. **CI / privileged host:** grant `CREATE DATABASE` and run ephemeral smokes, **or** use configured DB on a disposable schema.
3. From `backend/`:

```bash
npm run crm:invoice-payment-recording:smoke
npm run portal:isolation:smoke
# full §11 automation:
npm run finance-program:finish
```

3. Fix any real FAIL (not access denied); do **not** weaken smoke assertions.

**Exit:** Both smokes green; re-run `npm run finance-part9:certify` — criteria 5–6 PASS; criterion 13 PASS without portal waiver note.

---

### Stream B — Workiz historical audit (clears §9 #11)

**Goal:** Classify imported Finance; no silent repair.

1. Set `FINANCE_AUDIT_ORG_ID` or `PHOENIX_ORG_ID` to canonical Phoenix org.
2. Run:

```bash
npm run finance-part6:workiz-audit
```

3. Owner reviews latest `backend/_runtime_harness/finance-part6-workiz-audit/classification-*.json`.
4. Triage anomalies per Part 6 classifications (`Do not repair` default); spawn **separate** correction plans only for approved `Safe repair candidate` rows.

**Exit:** Audit artifact copied into closeout folder on next certify; criterion 11 PASS or owner-documented WAIVED with anomaly list attached.

---

### Stream C — Owner creation & send path (clears §9 #1, #2, #7)

**Goal:** Prove Quick Create + send + freeze behavior.

**Option 1 — Automated (preferred when stack is up):**

```bash
# terminal 1: backend dev
# terminal 2: frontend dev
set FINANCE_CERTIFY_PLAYWRIGHT=1
npm run finance-part9:certify
```

**Option 2 — Manual script (same evidence class):**

1. Create Estimate → save draft → reload → edit.
2. Create Invoice → lines → save → send (email or SMS).
3. Confirm sequential `document_number`, frozen snapshot (`409` on line edit after send).
4. Download PDF; confirm matches sent snapshot.

**Exit:** Criteria 1–2 PASS (Playwright) or owner checklist signed in walkthrough; criterion 7 PASS after manual send test → set `FINANCE_CERTIFY_MANUAL_PASS=1` on final certify.

---

### Stream D — Cross-surface truth (clears §9 #12)

**Goal:** One invoice/customer sample matches everywhere (Part 6 Phase 12).

Use checklist: `backend/_runtime_harness/finance-program-closeout/latest/cross-surface-walkthrough.md`

Verify for the **same** org and sample rows:

- Invoices list — `lifecycle_status`, `balance_cents`, `document_number`, `finance_origin`
- Job → Invoice tab — conversion provenance when applicable
- Customer profile — open balance vs sum of open invoices
- Office dashboard — open invoice count
- Customer portal — lifecycle, PDF, `document_origin`
- Home AI — open/unpaid alignment with CRM

**Exit:** All boxes checked; owner initials on walkthrough file; include path in closeout folder copy; `FINANCE_CERTIFY_MANUAL_PASS=1` on final certify.

---

### Stream E — Native PDF sign-off (clears §9 #8)

**Goal:** Owner accepts native PDF for production use (Part 5 exit gate).

1. Send a native invoice; open `GET /api/invoices/:id/pdf` and portal PDF link.
2. Compare to Workiz historical PDF policy (portal prefers native then Workiz source).
3. If visual gaps remain (logo, multi-page): either **accept as v1** or schedule **Part 5.1** backlog — do not block close if owner waives with explicit “v1 acceptable.”

**Exit:** Criterion 8 PASS after owner sign-off on PDF sample stored in evidence pack (screenshot or PDF hash note in `CERTIFICATION.md`).

---

### Stream F — Phoenix production reverification (clears §9 #14 substantively)

**Goal:** Readonly counts reflect **real** Phoenix Finance rows, not empty dev DB by mistake.

1. Point `.env` / readonly script at intended DB and org (`phoenix-finance:closeout-readonly` uses org from env).
2. Run:

```bash
npm run phoenix-finance:closeout-readonly
```

3. Owner confirms `invoiceCount`, `originCounts`, `withDocumentNumber`, `withCustomerSnapshot` are plausible for production.

**Exit:** `phoenix-readonly.json` in closeout with non-surprising counts; owner note in `CERTIFICATION.md` if zero rows is expected (e.g. fresh org).

---

### Stream G — Final certification & program close (clears §9 #15)

1. Set env for full run:

```text
FINANCE_AUDIT_ORG_ID=<phoenix org uuid>   # if Stream B done
FINANCE_CERTIFY_PLAYWRIGHT=1              # if Stream C Option 1
FINANCE_CERTIFY_MANUAL_PASS=1             # after Streams C, D, E manual items
```

2. From `backend/`:

```bash
npm run finance-part9:certify
# or
npm run finance-part8:evidence-pack
```

3. Confirm `completion-matrix.json` → `programStatus`: **`COMPLETE`** (or **`COMPLETE WITH WAIVERS`** with owner acceptance of each waiver in `open-items-waivers.json`).
4. Sign `CERTIFICATION.md` (owner name, date).
5. Git: commit program code + master reference; tag or release note optional; **do not** commit secrets or `.env`.
6. CI (recommended): add job running `finance-part9:certify` on merge with privileged DB.

**Exit:** §10 updated to **PROGRAM CLOSED** with SHA, date, and link to evidence folder.

---

## 11.4 §9 criteria tracker (finish checklist)

| # | Criterion | Primary stream | Pass signal |
|---|-----------|----------------|-------------|
| 1 | Reliable Estimate create | C | Playwright or manual |
| 2 | Reliable Invoice create | C | Playwright or manual |
| 3 | Conversion no drift | — | Already PASS (part6 checks) |
| 4 | Backend owns math | — | Already PASS |
| 5 | Ledger explains state | A | Payment smoke PASS |
| 6 | Payment states deterministic | A | Smoke + unit checks |
| 7 | Snapshot immutable | C | Send + 409 manual |
| 8 | PDF professional | E | Owner sign-off |
| 9 | Durable native documents | — | Already PASS |
| 10 | Invoice numbering | — | Already PASS |
| 11 | Workiz honest | B | Audit artifact |
| 12 | Cross-surface consistent | D | Walkthrough complete |
| 13 | Tenant-safe | A | Smokes + tenant check |
| 14 | Phoenix reverified | F | Readonly plausible |
| 15 | Evidence recorded | G | Certify + sign |

## 11.5 Explicitly after program close (backlog — not finish blockers)

Track separately from §9; require new owner approval if scope expands:

- Money engine **discounts** (Part 3 deferred)
- **Void/cancelled** invoice owner workflow UI (Part 4 deferred)
- PDF **Part 5.1** — branding, multi-page, golden tests
- Wire **invoice-lifecycle** / **finance-api-errors** on all invoice surfaces
- Workiz **write repair** only via approved correction plans
- Part 1 **production truth** document refresh if prod drifted since baseline

## 11.6 Stop conditions during finish (§7)

Halt finish work and report per §7 if:

- production org or DB identity is uncertain for a data-bearing step
- certify exposes cross-org read or tenant regression
- a “fix” would rewrite Workiz historical truth without approval
- migration or repair would touch historical Finance rows without approved plan

## 11.7 Suggested owner calendar (minimal)

```text
Day 1 — Stream A (DB/CI smokes) + Stream B (Workiz audit review)
Day 2 — Streams C + D (manual or Playwright walkthrough)
Day 3 — Streams E + F + G (PDF sign-off, readonly, final certify, sign CERTIFICATION.md)
```

Adjust for CI availability; parallelize B with A where possible.

---

# 12. One-Line Program Principle

> Truth first. Creation second. Financial math third. Ledger and history fourth. Documents fifth. Integration sixth. Hardening and production closeout last.
