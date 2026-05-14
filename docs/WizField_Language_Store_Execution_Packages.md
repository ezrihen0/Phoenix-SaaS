# WizField Language Store
# Execution Packages

**Document status:** Canonical execution split for Language Store  
**Depends on:** `docs/WizField_Language_Store_Source_of_Truth.md`  
**Purpose:** Convert the approved master plan into small reviewable implementation packages with exact boundaries, likely file targets, tests, rollback notes, and stop conditions.

---

# 1. Execution rules

These rules are locked for all packages:

- Do not reopen Gate 0-14 foundation decisions.
- Do not turn the first technical package into a full billing rewrite.
- Do not combine billing architecture expansion, store UI, user preference switching, translation engine, and estimate/invoice integration in one package.
- Each package must stop once its own seam is stable and verifiable.
- If a package begins to require a later-package behavior, stop and split that work forward instead of widening the current cut.

---

# 2. P0 delivered

P0 is now represented by:

- `docs/WizField_Language_Store_Source_of_Truth.md`
- `docs/WizField_Language_Store_Execution_Packages.md`

P0 outcome:

- billing architecture locked
- V1 launch matrix locked
- first supported translation surfaces locked
- phased execution boundaries locked

No product or billing reinterpretation should happen inside later code packages unless the source-of-truth doc changes first.

---

# 3. P1 Smallest Safe Technical Foundation

## Goal

Create the minimum durable Language Store seam in the codebase without changing billing behavior, adding UI product surfaces, or wiring translation into quotes/invoices.

## Included

- introduce a dedicated backend module namespace for Language Store
- add the first organization-scoped and user-scoped language entities
- add a stable language catalog constant/source
- create a minimal service layer and read-safe contracts that later packages can extend

## Excluded

- Stripe subscription-item mirroring
- add-on purchase flows
- Language Store route work
- user-facing language switcher
- translation generation
- quote/invoice integration

## Primary file targets

### Backend existing files
- `backend/src/app.module.ts`
- `backend/src/database/typeorm.config.ts`

### Backend new files
- `backend/src/language-store/language-store.module.ts`
- `backend/src/language-store/language-store.constants.ts`
- `backend/src/language-store/language-store.service.ts`
- `backend/src/database/entities/organization-enabled-language.entity.ts`
- `backend/src/database/entities/user-organization-language-preference.entity.ts`
- `backend/src/database/migrations/active/<new>-language-store-foundation.ts`

## Acceptance

- repo builds cleanly
- migration and schema verification pass
- new schema is organization-safe and does not alter current billing behavior
- no user-visible product behavior changes yet

## Verification

- `npm.cmd run migration:run --workspace backend`
- `npm.cmd run schema:verify --workspace backend`
- `npm.cmd run build --workspace backend`
- `npm.cmd run build --workspace frontend`

## Rollback

- revert the foundation migration and new Language Store module files
- remove the module import from `backend/src/app.module.ts`

## Stop conditions

Stop this package immediately if the work starts requiring:

- new Stripe webhook reconciliation behavior
- changes to `backend/src/billing/stripe/stripe-webhook.service.ts`
- frontend route/nav/product-surface work
- quote/invoice translation behavior

---

# 4. P2 Billing and Add-On Entitlement Expansion

## Goal

Extend the existing shared billing model so Language Store can be represented as plan entitlements plus recurring add-on items under the same Stripe subscription.

## Included

- local mirror of Stripe subscription items
- normalized Language Store entitlement resolution
- organization-scoped allocation/projection of purchased Language Store rights
- preservation of one `billing_account`, one Stripe customer, and one Stripe subscription relationship

## Excluded

- Language Store route UI
- personal language switcher UI
- translation generation
- quote/invoice integration

## Primary file targets

### Backend existing files
- `backend/src/billing/billing.module.ts`
- `backend/src/billing/billing.constants.ts`
- `backend/src/billing/billing-orchestration.service.ts`
- `backend/src/billing/organization-billing.service.ts`
- `backend/src/billing/entitlement.service.ts`
- `backend/src/billing/stripe/stripe-billing.provider.ts`
- `backend/src/billing/stripe/stripe-webhook.service.ts`
- `backend/src/billing/billing-provider.types.ts`
- `backend/src/database/entities/billing-account.entity.ts`
- `backend/src/database/entities/organization-billing.entity.ts`

### Backend new files
- `backend/src/database/entities/billing-account-subscription-item.entity.ts`
- `backend/src/database/entities/organization-language-entitlement.entity.ts`
- `backend/src/billing/language-store-entitlement.service.ts`
- `backend/src/database/migrations/active/<new>-language-store-billing-expansion.ts`

## Acceptance

- Stripe base plan plus recurring add-on items can reconcile into local Language Store entitlements
- `billing_accounts` remains the commercial authority
- `organization_billing` remains linkage/projection only
- no Language Store storefront or translation behavior ships in this package

## Verification

- focused unit coverage for entitlement resolution
- webhook reconciliation tests for multi-item subscription payloads
- `npm.cmd run migration:run --workspace backend`
- `npm.cmd run schema:verify --workspace backend`
- `npm.cmd run build --workspace backend`

## Rollback

- revert the billing-expansion migration and new entities/services
- restore webhook reconciliation to single-plan behavior if needed

## Stop conditions

Stop this package immediately if the work begins to include:

- a standalone `/language-store` route
- switcher UX
- translation preview/generation
- quote/invoice editor changes

---

# 5. P3 Language Store Product Surface

## Goal

Create the standalone authenticated Language Store experience for org admins without adding personal language switching or translation engine behavior.

## Included

- standalone Language Store route
- org entitlement summary
- enabled-language management UI
- upgrade/add-on prompts driven by resolved entitlements
- optional entry point or summary from Settings

## Excluded

- user language switching
- translation generation
- quote/invoice wiring

## Primary file targets

### Frontend existing files
- `frontend/components/app-shell.tsx`
- `frontend/app/settings/page.tsx`
- `frontend/app/settings/settings-workspace.tsx`
- `frontend/app/settings/organization-profile-panel.tsx`
- `frontend/app/settings/billing-panel.tsx`
- `frontend/app/pricebook/page.tsx`

### Frontend new files
- `frontend/app/language-store/page.tsx`
- `frontend/app/language-store/language-store-workspace.tsx`
- `frontend/components/language-store-language-card.tsx`
- `frontend/lib/language-store/client-language-store.ts`

### Backend new files
- `backend/src/language-store/language-store.controller.ts`

## Acceptance

- owner/admin can open a standalone Language Store route
- route shows entitlement state, slot counts, enabled languages, and locked states
- staff cannot spend org slots from this surface

## Verification

- route loads under authenticated app shell
- frontend build passes
- backend build passes
- role/permission checks behave correctly

## Rollback

- remove the new route and navigation link
- revert controller/service endpoints added for the admin surface

## Stop conditions

Stop this package immediately if the work starts to include:

- per-user preference persistence
- live translation generation
- quote/invoice editor behavior

---

# 6. P4 User Preference and Switcher

## Goal

Allow users to choose their own preferred language per active organization, independently from org switching.

## Included

- per-user per-org preference read/write
- fallback-to-English behavior when a previously selected language is disabled
- separate language switcher control

## Excluded

- billing reconciliation changes
- store admin catalog changes
- translation engine work
- quote/invoice integration

## Primary file targets

### Frontend existing files
- `frontend/components/app-shell.tsx`
- `frontend/components/organization-switcher.tsx`
- `frontend/lib/auth/client-auth.ts`
- `frontend/lib/auth/server-session.ts`

### Frontend new files
- `frontend/components/language-switcher.tsx`
- `frontend/lib/language-store/client-language-preferences.ts`

### Backend existing files
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/auth.controller.ts`

### Backend new files
- `backend/src/language-store/language-preference.controller.ts`

## Acceptance

- the same user can store different preferences for Org A and Org B
- language fallback is safe when a language becomes disabled
- org switch and language switch remain separate behaviors

## Verification

- backend build passes
- frontend build passes
- focused session / preference tests cover multi-org behavior

## Rollback

- remove the switcher UI and preference endpoints
- keep org-enabled language data intact if only preference UX must roll back

## Stop conditions

Stop this package immediately if the work begins to include:

- billing add-on allocation behavior
- translation preview/edit flows
- quote/invoice customer-output changes

---

# 7. P5 Customer English Output Engine

## Goal

Create the translation-generation and usage-accounting engine as a separate service layer before wiring it into specific quote/invoice flows.

## Included

- source-language capture contract
- English-output generation service
- translation usage metering
- draft/final translation record handling

## Excluded

- direct quote/invoice editor integration
- Language Store route changes
- personal switcher UX

## Primary file targets

### Backend existing files
- `backend/src/language-store/language-store.service.ts`

### Backend new files
- `backend/src/language-store/customer-output-translation.service.ts`
- `backend/src/language-store/customer-output-translation.controller.ts`
- `backend/src/database/entities/translation-usage-ledger.entity.ts`
- `backend/src/database/entities/customer-output-translation-record.entity.ts`
- `backend/src/database/migrations/active/<new>-language-store-translation-engine.ts`

## Acceptance

- supported requests can generate English customer-output drafts
- usage units are consumed using the locked 1,000-character rule
- translation records remain organization-scoped

## Verification

- unit tests for usage-metering logic
- unit tests for org-scoped translation persistence
- `npm.cmd run migration:run --workspace backend`
- `npm.cmd run schema:verify --workspace backend`
- `npm.cmd run build --workspace backend`

## Rollback

- revert translation-engine migration and service files
- disable translation endpoints while leaving prior language-management packages intact

## Stop conditions

Stop this package immediately if the work starts to include:

- line-item editor changes
- document preview rendering changes
- snapshot persistence changes inside CRM flows

---

# 8. P6 Estimate and Invoice Integration

## Goal

Attach the translation engine to the first locked V1 customer-facing surfaces and freeze the final English output into quote/invoice snapshot data.

## Included

- estimate line-item customer-facing name translation
- estimate line-item customer-facing description translation
- invoice line-item customer-facing name translation
- invoice line-item customer-facing description translation
- snapshot-safe persistence of the final chosen English output

## Excluded

- customer-selectable language
- bilingual documents
- receipts, SMS, email bodies, and other future surfaces

## Primary file targets

### Backend existing files
- `backend/src/crm/crm.controller.ts`
- `backend/src/crm/document-snapshot.service.ts`
- `backend/src/crm/validation.ts`
- `backend/src/database/entities/quote.entity.ts`
- `backend/src/database/entities/invoice.entity.ts`
- `backend/src/database/entities/quote-line-item.entity.ts`
- `backend/src/database/entities/invoice-line-item.entity.ts`

### Backend new files
- `backend/src/database/entities/document-translation-snapshot.entity.ts`
- `backend/src/database/migrations/active/<new>-language-store-document-snapshots.ts`

### Frontend existing files
- `frontend/app/jobs/[jobId]/job-quote-section.tsx`
- `frontend/app/jobs/[jobId]/job-invoice-section.tsx`
- `frontend/components/document-pricebook-picker.tsx`
- `frontend/components/quote-line-items-editor.tsx`
- `frontend/components/invoice-line-items-editor.tsx`
- `frontend/components/document-preview.tsx`
- `frontend/app/estimates/[estimateId]/page.tsx`
- `frontend/app/invoices/[invoiceId]/page.tsx`

## Acceptance

- supported estimate/invoice customer-facing line text can be translated into English before final customer output
- final chosen English output is what lands in snapshot-safe document history
- later language or provider changes do not rewrite historical output

## Verification

- backend build passes
- frontend build passes
- focused regression coverage for quote/invoice save and preview flows
- snapshot behavior confirms stable historical output after later changes

## Rollback

- disable translation wiring in quote/invoice flows
- preserve existing snapshot behavior without Language Store augmentation

## Stop conditions

Stop this package immediately if the work expands into:

- bilingual rendering
- receipts or job-summary rollout
- customer-facing email/SMS translation surfaces

---

# 9. P7 Verification and Snapshot Safety

## Goal

Run focused verification on the completed Language Store packages without reopening unrelated foundation work.

## Included

- org-scoped entitlement isolation replay
- multi-org user preference isolation replay
- translation usage accounting checks
- snapshot immutability checks for translated output

## Primary file targets

### Existing docs and verification surfaces
- `docs/WizField_Reverification_Runbook.md`
- `docs/WizField_Engineering_Closeout_and_Verification.md`

### Likely new verification artifacts
- `backend/src/database/language-store-org-isolation-smoke.ts`
- `backend/src/database/language-store-snapshot-isolation-smoke.ts`
- `backend/package.json`

## Acceptance

- no cross-org language leakage
- no historical document rewrite after language disablement or translation changes
- billing projection remains consistent for covered organizations

## Verification

- package-specific smokes for org isolation and snapshot stability
- backend build passes
- frontend build passes

## Rollback

- disable only the failing Language Store capability while keeping completed lower-risk packages if safe

## Stop conditions

Stop this package immediately if it starts to reopen:

- Gate 11-14 foundation truth
- unrelated public booking, portal, or telephony architecture

---

# 10. P8 Future expansion only

Future-only work, not launch work:

- customer-preferred output language
- bilingual PDFs
- jurisdiction-specific language packs
- translated receipts, job summaries, email bodies, and SMS bodies

These remain out of scope until separately approved against the locked commercial model.
