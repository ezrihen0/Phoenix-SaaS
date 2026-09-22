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

Part 1:
Production Truth & Finance Contract
STATUS: STARTING / PLANNING

Parts 2–7:
NOT AUTHORIZED FOR IMPLEMENTATION YET
```

---

# 11. One-Line Program Principle

> Truth first. Creation second. Financial math third. Ledger and history fourth. Documents fifth. Integration sixth. Hardening and production closeout last.
