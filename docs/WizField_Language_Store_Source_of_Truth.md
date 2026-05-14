# WizField Language Store
# Source of Truth

**Document status:** Canonical P0 decision lock - active Language Store truth  
**Project:** WizField  
**Scope:** Billing architecture, entitlement scope, V1 product contract, and execution guardrails for Language Store  
**Not a reopen of foundation work:** This document builds on the already-closed Gate 0-14 foundation and does not reopen tenancy, multi-org UX, billing-account authority, or document snapshot rules.

---

# 1. Why this document exists

WizField already closed the foundation that Language Store must sit on top of:

- organizations are the tenant boundary
- active organization is session-backed
- `billing_accounts` is the authoritative payer / subscription layer
- `organization_billing` is coverage / linkage only
- Stripe is webhook-authoritative
- immutable document snapshots are already a locked product rule

Language Store is therefore a controlled product-extension initiative, not a new SaaS-foundation project.

This document freezes the product and billing rules that later execution packages must inherit exactly.

---

# 2. Product definition

> WizField Language Store enables multilingual field-service teams to work internally in their preferred language while ensuring customer-facing business output defaults to professional English.

Language Store is a standalone authenticated WizField product surface, not just a hidden settings toggle and not just generic UI translation.

It has two layers:

1. **Workspace language layer**
   - the organization decides which worker languages are enabled
   - each user picks their own preferred language within the active organization
   - the same user may use different preferred languages in different organizations

2. **Customer English output layer**
   - a worker may write customer-facing dynamic content in an enabled non-English language
   - WizField generates English customer-facing output for the supported V1 surfaces
   - historical customer-facing output remains snapshot-safe after approval / send

---

# 3. Foundation assumptions that are already locked

Language Store must inherit these rules exactly from the current WizField canonical docs:

- Do not reopen Gate 11-14 status.
- Do not create a second subscription authority beside `billing_accounts`.
- Do not make tenant-owned feature access global across organizations.
- Do not let frontend org state override session-backed active organization truth.
- Do not let translation or language changes rewrite historical sent documents.
- Do not reopen the shared-billing-account model as a workspace-by-workspace payer model.

---

# 4. Locked commercial architecture

## 4.1 Final production billing rule

Language Store will use:

```text
One customer billing relationship with WizField
-> one shared billing account
-> one Stripe customer
-> one Stripe subscription
-> one base plan item
-> optional recurring Language Store add-on items
-> internal entitlement projection to covered organizations
```

Language Store must **not** create:

- a second subscription for the same customer
- a second invoice stream outside the main WizField subscription
- a separate standalone checkout that behaves like a disconnected product

## 4.2 Authority model

- `billing_accounts` remains the sole commercial authority.
- `organization_billing` remains coverage / linkage only.
- Language Store entitlements resolve from the active organization through the linked `billing_account`.

## 4.3 Add-on representation

Language Store add-ons must be represented:

1. internally as local entitlement records used by the application
2. externally as recurring Stripe subscription items on the same Stripe subscription

This is the required production model because internal-only paid add-ons would create local-versus-provider drift, while separate subscriptions would violate the one-relationship billing rule.

## 4.4 Customer experience rule

The customer still has one consolidated WizField billing relationship.

The invoice may show multiple subscription line items internally through Stripe, but commercially it remains one WizField subscription relationship managed through one shared billing account.

---

# 5. Locked entitlement scope rule

## 5.1 Scope model

- Billing authority is shared at the `billing_account`.
- Language activation and usage enforcement is organization-scoped.
- Effective Language Store rights are enforced per covered organization, not as a floating shared pool across all organizations on the billing account.

## 5.2 Why pooled floating slots are rejected

Floating slot consumption across all covered organizations would create:

- ambiguous support outcomes
- cross-org commercial disputes inside one payer account
- hidden coupling where Org A can consume capacity intended for Org B
- a weaker fit with the already-locked organization-owned feature model

Language Store therefore uses:

- account-level purchase authority
- organization-level activation rights
- organization-level usage accounting

## 5.3 Allocation rule

- Plan-included language capacity applies per covered organization.
- Recurring add-on packs are purchased at the billing-account level and allocated to a specific covered organization unless a later product rule explicitly declares a particular add-on as account-wide.
- V1 assumes Language Store add-ons are allocated to one covered organization, not globally pooled.

---

# 6. Locked V1 launch matrix

## 6.1 Worker language entitlements by plan

English is always available and does **not** consume a paid slot.

V1 launch entitlement matrix:

- **Starter**
  - English only
  - Language Store disabled
  - `0` additional worker-language slots per covered organization
  - `0` monthly customer-output translation units

- **Pro**
  - Language Store enabled
  - `2` additional worker-language slots per covered organization
  - `250` monthly customer-output translation units per covered organization

- **Business**
  - Language Store enabled
  - `5` additional worker-language slots per covered organization
  - `1000` monthly customer-output translation units per covered organization

## 6.2 V1 recurring add-on packs

V1 recurring add-on packs are locked as:

- **Additional Language Slot Pack**
  - adds `1` additional worker-language slot
  - allocated to one covered organization

- **Translation Usage Pack**
  - adds `250` monthly customer-output translation units
  - allocated to one covered organization

## 6.3 Usage-metering rule

V1 customer-output translation usage is measured in **translation units**:

- `1` translation unit = up to `1,000` source characters submitted for English customer-output generation
- each request rounds up to the nearest whole unit
- regenerated output consumes units again

This keeps local cost accounting stable without exposing end users to raw model-token billing.

## 6.4 Why this metering model is locked

This approach is preferred over per-click or per-token pricing because it:

- avoids cheap-feeling microbilling
- stays implementation-agnostic across translation provider changes
- gives finance and support a stable unit for plan and add-on packaging

---

# 7. Locked V1 product scope

## 7.1 Included in V1

V1 includes:

- organization-level worker language activation
- per-user, per-organization language preference
- standalone authenticated Language Store product surface
- English customer-output generation for the first supported customer-facing dynamic text surfaces
- organization-scoped translation usage accounting

## 7.2 First English-output surfaces in V1

The first V1 customer-facing translation surfaces are locked to:

1. **Estimate line-item customer-facing names**
2. **Estimate line-item customer-facing descriptions**
3. **Invoice line-item customer-facing names**
4. **Invoice line-item customer-facing descriptions**
5. **Manual line text entered in estimate and invoice composition flows that becomes customer-facing snapshot text**

V1 does **not** expand first-pass translation to every customer-visible field in the product.

## 7.3 Explicit V1 exclusions

V1 excludes:

- customer-selectable output language
- bilingual PDFs
- legal/compliance translation packs
- warranty/legal clause translation
- WETT or inspection-jurisdiction translation packs
- dynamic translation of already-sent documents
- pooled floating translation capacity across covered organizations
- action-by-action customer billing
- receipts, job completion summaries, email bodies, and SMS bodies until separately approved

---

# 8. Locked translation and snapshot rule

## 8.1 Final V1 pipeline rule

Language Store must use this product pipeline:

```text
Worker enters source text
-> source language is selected or inferred
-> English customer-output draft is generated
-> user reviews the English output inside the supported workflow
-> final approved customer-facing output is persisted
-> quote/invoice snapshot stores the frozen English customer-facing text
```

## 8.2 Rejected model

The rejected model is:

```text
Store only source text
-> translate only at final PDF generation time
```

That model is rejected because it would:

- create surprise output changes late in the workflow
- make historical output unstable
- couple document rendering to live translation behavior

## 8.3 Snapshot rule

Once a quote or invoice reaches the snapshot-safe point already used by WizField, the chosen English customer-facing output becomes immutable historical document truth.

Later changes to:

- enabled languages
- user preference
- translation prompts
- translation provider
- translation quality

must not rewrite the already-snapshotted customer document.

---

# 9. Locked UX rule

## 9.1 Product surface

Language Store must be a standalone authenticated route.

Settings may show a summary or entry point, but the primary product surface must not be buried inside Settings alone.

## 9.2 Admin and staff responsibilities

- Org owners / admins manage which worker languages are active for the organization.
- Regular staff may select their personal preferred language only from the languages enabled for the active organization.
- Org switching and language switching remain separate controls.

## 9.3 Disabled-language behavior

If an organization disables a language that a user previously selected:

- the user must safely fall back to English for that organization
- historical translated document output remains unchanged
- the user's preference record may remain stored for future reuse if that language is re-enabled later

---

# 10. Execution guardrails

- The first implementation package must **not** become a massive billing surgery.
- P0 decision-doc closure comes first.
- The smallest safe technical foundation package comes second.
- Billing/add-on entitlement expansion, Language Store UI, user language preference, translation engine, and estimate/invoice integration must remain separate execution packages.
- No implementation package may combine billing architecture expansion, store UI, language switcher, and translation engine into one large cut.

---

# 11. Open decisions after this lock

There are no remaining open owner decisions required for P0.

Any future change to the rules in this document must be treated as an explicit product decision change, not as an implementation-side reinterpretation.
