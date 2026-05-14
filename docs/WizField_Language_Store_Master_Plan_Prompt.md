# WizField Language Store — Master Planning Prompt

## Purpose

This document is the official **PLAN MODE prompt** for the engineering agent to produce the full MASTER PLAN for the **WizField Language Store**.

This is a **planning-only** instruction set.

- Do **not** write code.
- Do **not** modify files.
- Do **not** begin implementation.
- Return a complete engineering-ready master plan only.

---

# PROMPT TO SEND TO THE AGENT

```text
You are working inside Phoenix_SaaS / WizField, not Phoenix_CRM.

Selected Work Mode:
New Feature — Product Architecture / Master Planning only.

Do NOT write code.
Do NOT modify files.
Do NOT propose implementation as a vague feature sketch.
Your mission is to produce a complete engineering-ready MASTER PLAN for the official WizField Language Store, including billing architecture, data model, API/UI surfaces, feature entitlements, translation output pipeline, and phased execution packages.

You must follow the existing PhoenixOS / WizField execution discipline:
- TypeORM-first only.
- Prisma is reference-only and must not be used as active runtime truth.
- No global Phoenix/WizField renames.
- No coding before owner approval.
- Every future implementation package must have exact files, risks, tests, rollback, and stop conditions.
- Tenant isolation is mandatory: all organization-owned feature access and data must be organization-scoped.
- Current multi-business model must be respected: one user may belong to multiple organizations, and the active organization is session-backed.
- Customer-facing generated documents must preserve immutable snapshot behavior.

Use the current SaaS project source-of-truth rules, especially:
- platform/tenant boundary
- organization-owned data rules
- activeOrgId/session rules
- document snapshot rules
- Gate 13 billing direction
- controlled feature planning discipline

---

# Product Mission

Design the official WizField Language Store as a standalone paid product surface, similar in spirit to the Automation Store, that allows field-service businesses to operate with multilingual staff while keeping customer-facing output professional and defaulted to English.

This feature is NOT just “UI translation.”

It has two layers:

1. Workspace Language Layer
   - Individual employees can use the WizField interface in their preferred language.
   - The organization enables which worker languages are available.
   - Each user selects their preferred UI language from the languages enabled for the active organization.
   - The same user may use different UI languages in different organizations.

2. Customer English Output Layer
   - A technician/admin may write customer-facing dynamic content in an enabled non-English language.
   - WizField generates professional English customer-facing output.
   - The customer receives English PDFs / outbound content by default, even if the worker wrote internally in Hebrew, Spanish, Ukrainian, Polish, etc.
   - Example:
     Internal worker text:
       "ניקיון ארובה - ניקיתי את הארובה בגובה של 60 מטר"
     Customer PDF output:
       "Chimney Cleaning — Cleaned the chimney at a height of 60 meters."

---

# Locked Product Decisions

These decisions are already approved conceptually and must be treated as product requirements:

1. English is always available by default.
2. English does NOT consume a paid language slot.
3. Customer-facing output defaults to English in V1.
4. V1 does NOT include customer-selectable PDF language.
5. V1 does NOT include bilingual PDFs.
6. V1 does NOT include legal/compliance translation packs for special jurisdictions.
7. Future architecture must remain extensible for customer-facing output languages later.
8. The organization purchases/receives language capabilities.
9. Individual users choose their own language preference inside the limits of the active organization.
10. Language Store must be a standalone product surface, not buried inside Settings only.
11. The same employee may belong to Org A and Org B and use different language preferences per organization.
12. Org switching and language switching are separate concepts and must not be mixed.
13. All customer-facing output translation must be organization-scoped and must not cross tenant boundaries.
14. Customer-facing generated outputs must be snapshot-safe and historically stable after generation.
15. WizField is not responsible for whether a worker wrote factually correct content; the business remains responsible for employee training and review. WizField’s responsibility is to transform submitted customer-facing content into English output according to the product rule.

---

# Billing / Commercial Architecture — Locked Direction

The Language Store must NOT become a totally separate customer-facing subscription with a second invoice.

Correct billing model:

ONE WizField subscription charge to the customer
→ internal plan entitlements
→ internal add-ons / feature rights
→ Language Store unlocked according to plan or add-on

The product must support:

A. Plan-Included Language Access
Examples:
- Starter: English only / no Language Store
- Pro: English + 2 additional worker languages
- Business: English + 5 additional worker languages
- Higher tier / later: more or unlimited additional worker languages

B. Add-On Entitlement Expansion
Examples:
- Additional Language Pack
- Additional translation usage pack
- Future bilingual document pack
- Future customer-language output pack

C. Internal Product / Feature SKU Thinking
The system may need internal product keys or entitlement keys such as:
- language_store.enabled
- included_additional_languages
- customer_english_output.enabled
- monthly_translation_usage_limit
- extra_language_pack_quantity

D. Billing must remain organization-based, not user-based.
If a billing account can own multiple organizations under one subscription in the future, the architecture must clearly explain whether language entitlement is:
- per paying billing account,
- per covered organization,
- or distributed across organizations according to plan rules.

The plan should recommend the correct model for WizField and explain why.

E. External payment provider mapping
The plan must decide whether:
- Language Store is only an internal entitlement under the main plan,
- or also represented as a recurring add-on line item in the billing provider,
- while still appearing to the customer as one consolidated WizField payment.

You must recommend the cleanest production architecture.

---

# Master Plan Output Required

Produce a comprehensive MASTER PLAN with the following sections:

## 1. Feature Card
Include:
- Feature
- Why now
- Priority
- Business value
- Monetization value
- Scope
- Done when

## 2. Product Definition
Define in one precise business sentence what the Language Store is.

## 3. Core Product Rules
List all locked product decisions in clean architectural language.

## 4. User Personas & Real Use Cases
Cover at least:
- Owner/dispatcher operating in English
- Technician writing in Spanish
- Technician writing in Hebrew
- Garage door company, HVAC company, plumbing company, chimney company
- User working across two organizations with different preferred languages
- Business with multilingual field staff but English-speaking customers

## 5. Language Store UX Architecture
Design:
- standalone route/page concept
- language cards
- lock/active/available states
- flags and labels
- toggle behavior
- upgrade prompts
- slot usage display such as “2 of 3 additional languages active”
- what appears when organization is not entitled
- what happens when a language is deactivated
- what is admin-only vs regular staff visibility

## 6. Language Switcher UX Architecture
Design:
- where it appears
- when it appears
- how it behaves
- relation to active organization
- user-level vs org-level preference
- default/fallback behavior
- behavior when previously selected language is later disabled by the organization

## 7. Customer English Output Engine
Define the canonical system pipeline:
Original worker input
→ source language recorded/detected
→ English output generated
→ optional preview/edit model
→ outbound PDF/email/SMS/customer surface
→ immutable snapshot where required

Clarify:
- which content is translated
- whether translation happens on save, on preview, on send, or hybrid
- how to avoid last-second surprise translations at PDF generation
- how to allow future human review/edit if needed
- how to avoid corrupting historical sent documents

## 8. Initial Output Surfaces for V1
Identify recommended V1 inclusion surfaces:
- Estimate title/description
- Invoice title/description
- Receipt notes if customer-facing
- Customer-facing job summary/completion note if already part of current product
- Any obvious existing customer-facing dynamic fields that should be included in V1

Also explicitly define V1 exclusions:
- WETT / inspection legal-sensitive language
- warranty/legal clauses
- Terms / Privacy / contract legal text
- bilingual documents
- customer-selectable document language

## 9. Future-Proof Customer Output Languages
Design the extension path without building it now:
- English only today
- future “customer preferred language”
- future bilingual PDF
- future English + second language output
- future jurisdiction-specific packs such as French/Quebec if commercially justified

Explain what must be architected today so this is not blocked later.

## 10. Billing / Plan / Entitlement Architecture
This section must be especially strong.

It must answer:
- Is the Language Store a product? If yes, internal or external billing product?
- Is it an add-on, included feature, or both?
- How does it fit into one monthly WizField payment?
- How should plans represent included additional languages?
- How should add-ons extend language limits?
- How should AI translation usage be tracked or limited?
- Should language usage be pooled per organization or per billing account?
- How should we avoid charging separately for every small action in a way that feels cheap or confusing?
- Recommend the best monetization model for launch and the best future expansion path.

You must produce a clear recommendation, not a list of maybe-options.

## 11. Proposed Data Model
Recommend entity/data model concepts only — no code yet.

At minimum evaluate whether we need:
- OrganizationLanguageEntitlement
- OrganizationEnabledLanguage
- UserOrganizationLanguagePreference
- TranslationDraft / TranslationRecord
- CustomerOutputTranslation
- DocumentTranslationSnapshot
- TranslationUsageLedger or similar usage counter

For each recommended entity/object:
- ownership level
- why it exists
- key fields
- whether it is V1 or future
- risk if omitted

Tenant isolation requirements are mandatory.

## 12. Proposed API / Service Architecture
No code, but define likely service boundaries:
- entitlement resolution service
- language catalog service
- organization language management service
- user language preference service
- translation output service
- output snapshot service
- billing/plan enforcement hooks
- translation usage tracking hook

Also define high-level API responsibilities:
- fetch store languages
- activate/deactivate language
- fetch organization entitlements
- save user language preference
- generate/update customer English output
- read translation preview where appropriate

## 13. UI Route & Product Surface Impact Map
Map how this feature touches:
- Language Store route
- Settings if needed for admin management
- Header/user menu switcher
- Invoices
- Estimates
- Receipts
- Documents/PDF generation
- Potential email/SMS send flows
- Billing panel / plan entitlements display

Explain what should be standalone vs reused in existing Settings/Billing screens.

## 14. Risk Map
Include risks such as:
- billing model confusion
- accidental separate subscription mess
- translation quality risk
- documents being regenerated inconsistently
- user writes in one language, stale English output not updated
- entitlement scope conflicts across multiple organizations
- hidden tenant leakage through shared translation records
- output pipeline breaking PDFs
- role permission confusion: who can activate languages?

For each risk:
- impact
- mitigation
- stop condition if applicable

## 15. Recommended Implementation Phases
Design a phased roadmap, not code.

Suggested macro-phases:
P0 — Source-of-truth docs and decision lock
P1 — Entitlement + billing architecture lock
P2 — Language Store catalog/admin product surface
P3 — User preference + language switcher
P4 — English Customer Output Engine V1
P5 — Estimate/Invoice integration
P6 — Snapshot + acceptance verification
P7 — Future add-ons / customer document language extension

You may improve this sequence if there is a better one.

For every phase include:
- goal
- what is included
- what is excluded
- dependency on previous phase
- test/acceptance requirements
- why this phase order is correct

## 16. Acceptance Criteria
Define product-level success criteria for the full Language Store initiative.

Must include examples like:
- Org on Pro can activate 2 additional worker languages.
- Org cannot activate a third without entitlement/add-on.
- User selects Hebrew UI inside Org A and Spanish UI inside Org B.
- Technician writes non-English estimate description; customer PDF renders English.
- English output remains unchanged in sent snapshot.
- Deactivating Hebrew does not corrupt historical invoices/estimates.
- Billing still appears as one consolidated WizField subscription/customer payment architecture.

## 17. What Must Be Decided by Eden Before Coding
List only true product-owner decisions still required.
Do not ask for decisions that the existing product direction already resolves.

---

# Critical Architectural Constraints

Do not produce a weak feature note.
Produce a master engineering/product architecture plan suitable for later splitting into implementation packages.

The plan must align with:
- tenant isolation
- organization-level entitlements
- multi-org membership model
- document snapshot behavior
- future Gate 13 billing/plan enforcement model
- controlled phased execution

Do not code.
Do not modify files.
Return a structured markdown plan only.
```

---

# Owner Notes — Product Positioning Lock

The product direction behind this plan is:

> WizField Language Store enables multilingual field-service teams to operate internally in their preferred language while ensuring customer-facing business output defaults to professional English.

This is not a niche chimney-only feature. It must be designed for:
- Garage door companies
- HVAC companies
- Plumbing companies
- Chimney/fireplace companies
- Other North American field-service businesses

The commercial value is:
- Faster onboarding of non-English-speaking staff
- Fewer communication errors
- Better owner control
- Professional customer-facing documents
- Stronger monetization through plan differentiation and add-ons

---

# Billing Direction Lock

The commercial architecture must remain:

```text
One customer payment to WizField
→ shared subscription / billing account
→ internal feature entitlements
→ organization-level activation rights
→ Language Store access based on plan or add-on
```

The Language Store should **not** create:
- a separate standalone subscription checkout,
- a separate invoice stream outside the main WizField bill,
- or a fragmented customer billing experience.

The clean architectural direction is:
- Main SaaS subscription stays primary.
- Language Store is represented through plan entitlements and, where needed, recurring add-on line items under the same billing relationship.
- The customer sees one consolidated WizField commercial relationship.

---

# Ready-to-Send Status

This document is ready to send to the engineering agent in PLAN MODE.

Expected output from the agent:
- A full master architecture plan
- No code
- No file changes
- Clear billing recommendation
- Clear data/API/UX architecture
- Phased implementation roadmap
- Exact open product-owner decisions before coding
