# WizField Master Source of Truth

## Purpose

This is the single canonical product and architecture truth for the WizField project.

It states **current system behavior** after the September 2026 production closeout. Historical Gate 0–14 roadmap docs, SaaS foundation fragments, and older planning files are not current authority.

**Current verification evidence (not a second SoT):** [WIZFIELD_PRODUCTION_CLOSEOUT.md](audit/production-2026-09/WIZFIELD_PRODUCTION_CLOSEOUT.md)

This document does not copy audit evidence. It states current truth and points to evidence.

---

## Document authority

| Layer | Owns | Canonical file |
|---|---|---|
| **Master SoT** | Product architecture, tenant model, major modules, operating model, production readiness summary | This file |
| **AI Master SoT** | AI architecture, Home AI, Brain, Copilot, tools, permissions, read/write policy | [WizField_AI_Master_Source_of_Truth.md](WizField_AI_Master_Source_of_Truth.md) |
| **Language Store SoT** | Localization architecture and language entitlement | [WizField_Language_Store_Source_of_Truth.md](WizField_Language_Store_Source_of_Truth.md) |
| **Growth Center SoT** | Marketing / publishing model | [WizField_Growth_Center_Source_of_Truth.md](WizField_Growth_Center_Source_of_Truth.md) |
| **Service Intelligence SoT** | Planned taxonomy + current classification persistence | [WizField_Service_Intelligence_Source_of_Truth.md](WizField_Service_Intelligence_Source_of_Truth.md) |
| **DR / Rebuild Runbook** | Backup, restore, rebuild procedure | [WizField_Disaster_Recovery_and_Rebuild_Runbook.md](WizField_Disaster_Recovery_and_Rebuild_Runbook.md) |
| **Owner launch checklist** | Owner activation items | [WizField_Owner_Launch_Activation_Checklist.md](WizField_Owner_Launch_Activation_Checklist.md) |
| **Engineering closeout** | Historical Gate 11–14 foundation evidence | [WizField_Engineering_Closeout_and_Verification.md](WizField_Engineering_Closeout_and_Verification.md) |
| **Audit / closeout evidence** | What was tested and when | [WIZFIELD_PRODUCTION_CLOSEOUT.md](audit/production-2026-09/WIZFIELD_PRODUCTION_CLOSEOUT.md) |

`docs/chatgpt-review-package/` is a **historical review snapshot**. It is not current authority.

---

## Current production operating verdict

**CONDITIONAL GO / YES WITH CONDITIONS**

Phoenix Fireplace may begin using WizField as its primary daily operating system for real customers and real money after the owner closes the remaining activation items. No engineering NO-GO blocker remains from the September 2026 closeout.

Remaining owner activation items:

- production Terms (remove DRAFT placeholders)
- production Privacy (remove DRAFT placeholders)
- production support email (`NEXT_PUBLIC_SUPPORT_EMAIL`; avoid `support@example.com` fallback)
- actual DB and uploaded-file backup execution/evidence
- controlled release staging / pending migrations / clean baseline

Closed P0/P1/P2 audit findings are **not** current blockers. See the closeout for IDs and evidence.

Paid acquisition remains owner-gated. See [WizField_Owner_Launch_Activation_Checklist.md](WizField_Owner_Launch_Activation_Checklist.md).

---

## 1. Product identity and project separation

- The repository is the WizField workstream: a multi-tenant SaaS conversion of the proven Phoenix CRM operating engine.
- `Phoenix_CRM` and `WizField` are separate workstreams and must remain mentally and operationally separate.
- Historical boundary preserved: `Phoenix_CRM is protected. WizField is the surgery room.`
- The product direction is `WizField`: a field-service operating system for owners running one or more service businesses from one account.

## 2. Phoenix_CRM vs WizField safety boundary

- Do not treat `WizField` as a place for casual production fixes, broad cleanup, or mixed-scope refactors.
- Do not treat `Phoenix_CRM` as a safe place to experiment with SaaS tenant architecture.
- The active SaaS truth lives in this document plus the companion canonical docs listed above.
- Git history preserves historical detail; the active docs tree should stay small and current.

## 3. TypeORM-first execution decision

- TypeORM is the active ORM and execution path.
- Prisma is frozen / reference-only during the SaaS conversion.
- Do not use Prisma for active reads, writes, migrations, or dual-runtime planning.
- Tenant ownership, migrations, services, controllers, and query filters are defined through the active TypeORM/NestJS stack.
- The objective is to make the existing engine tenant-safe first, not to change ORM and architecture at the same time.

## 4. Product north star

WizField is not a generic CRM reskin. It is a multi-tenant field-service operating system built from the Phoenix CRM operational engine.

Core promise:

> WizField helps field-service owners manage calls, leads, jobs, estimates, invoices, communication, reports, and customer access across multiple businesses from one operating system.

The product remains anchored in real field-service operations: customer history, lead intake, job management, estimates, invoices, payments, calls, SMS, inspections, reports, warranty documents, dispatch, and scheduling.

### 4.1 Pricebook catalog and field invoice chain

Canonical pricebook taxonomy is **System → Category → Item** within each organization (for example Gas / Wood / General systems, with categories such as Pilot Assemblies under Gas). This is separate from legacy `trade_area` on pricebook items and separate from Service Intelligence historical `system_json` classification on imported invoices.

Field invoice creation resolves exact pricebook items into immutable invoice line snapshots (`pricebook_item_id`, pricing snapshots, `warranty_months_snapshot`). Invoice bundles are reusable requirement recipes (category slots), not inventory items or fixed invoice lines. Inventory consumption remains a distinct later event on the append-only inventory movement ledger; selecting a catalog item in the invoice builder does not deduct stock.

---

- Organizations remain the tenant boundary for business data.
- Users are global identities.
- Memberships link users to organizations.
- Roles and permissions belong to memberships, not globally to users.
- Actor / session organization resolution is authoritative. Frontend org ids are not trusted for authorization.
- Every tenant-owned request resolves actor, active organization, membership, role, and permissions.
- Tenant-owned operational access remains org-scoped.
- Platform-owned concepts remain distinct from organization-owned records, public-access resources, immutable snapshots, and provider/integration records.

Conceptual model:

```text
Platform
-> Users
-> Organizations
-> Memberships
-> Membership-scoped roles and permissions
-> Organization-owned business records
-> Public access resources bound back to organization-owned records
```

### 5.1 Auth / session

- The active organization comes from the authenticated session.
- Successful org switching performs a full navigation to `/home` so stale client state is cleared.
- Disabled users cannot continue using an existing session (verified `auth:inactive-session:smoke`).

### 5.2 Team RBAC

- Team RBAC is server-enforced (`team.view` / `team.invite` / `team.manage` plus membership custom roles).
- Canonical permission registry: `backend/src/auth/permissions.ts`.
- Implementation detail: [TEAM_PERMISSIONS_V1_IMPLEMENTATION.md](TEAM_PERMISSIONS_V1_IMPLEMENTATION.md).

### 5.3 Operational access

- `GlobalOperationalAccessGuard` is the canonical `APP_GUARD` / default-deny operational-access architecture.
- Staff operational APIs require an eligible local billing state (`trialing` / `active`) or an active `controlled_access_grant`.
- `TeamController` is protected through that global architecture (session + APP_GUARD), not a separate local exception.
- Operational access does not depend on Stripe configuration, subscription IDs, or webhook state.

## 6. Multi-org UX model

- One user may access multiple businesses / workspaces.
- Users switch organizations by explicit click through the supported switcher flow.
- Full UX and data context change with the active organization: dashboard, customers, leads, jobs, estimates, invoices, settings, search, calls, messaging, reports, booking, and portal-adjacent context.
- Single-membership users get a simple current-workspace display, not a fake switcher.
- Multi-business capability is a core product differentiator, not an edge feature.

## 7. Local access / entitlement model

- Local access authority is shared-billing-account based, not workspace-by-workspace only.
- `billing_accounts` is the authoritative payer / local entitlement layer.
- `organization_billing` is coverage / linkage and entitlement projection, not the subscription authority.
- A single billing account may cover multiple organizations under one entitlement.
- Current plan structure:
  - Starter = 1 business
  - Pro = up to 3 businesses
  - Business = expanded local model with no fixed hard cap currently enforced in local repo truth
- Plan enforcement resolves from organization context through the linked shared billing account.
- This local entitlement layer is **not** SaaS subscription billing and is **not** CRM invoice/payment money.

## 8. SaaS billing / Stripe

- Active Stripe runtime integration has been **removed / disabled**.
- Stripe checkout, Stripe webhook handling, and Stripe SDK runtime wiring are not part of the active product.
- Historical billing schema and migrations (including `stripe_webhook_event_receipts`) may remain intentionally for lineage and possible future owner-approved reactivation.
- CRM invoice / payment functionality does **not** depend on Stripe.
- Stripe reintroduction is a future separate project. Do not treat checkout-session or billing-webhook runtime as current.

## 9. Tenant isolation rules

- Never fetch tenant-owned data by `id` only.
- Tenant-owned reads, updates, deletes, counts, and lists must remain organization-scoped.
- Cross-organization access is forbidden.
- Backend membership validation is authoritative on every request.
- Search, dashboard, aggregates, automations, and communication flows must remain scoped to the active organization unless an explicit audited platform-admin surface exists.
- Cross-tenant leakage is the primary product risk and remains unacceptable.

### 9.1 Database tenant invariants

Verified classification (September 2026 closeout):

- 87 tables reviewed
- no strict A-table Phoenix NULL-org defect
- no verified cross-org FK mismatch
- application tenant invariants remain important
- **Do not** state that every tenant table is DB-level `NOT NULL` — some core CRM columns remain nullable at the schema layer
- Schema hardening debt is distinct from current exploitable tenant leakage
- Phoenix production data was clean; app scoping verified

## 10. Public access: portal, booking, and token ownership

- Public booking must resolve the target organization first.
- Public portal and access-token flows must bind back to organization-owned resources.
- Token resolution must prove validity, expiry status, target resource ownership, and correct organization scope.
- Public routes must not expose internal records by bare UUID alone.
- Invalid, expired, or reused tokens must fail safely.
- Public booking must never silently default to the wrong tenant.

### 10.1 Public booking durable architecture (current)

- Persistent idempotency receipt (`public_booking_submissions`)
- Transactional lead/customer creation
- Replay / concurrency protection
- Rate limiting
- Tenant isolation (org resolved from public slug)
- Bounded soft dedupe

### 10.2 Customer portal

- Portal sessions and magic links are organization- and customer-scoped.
- Portal PDF / invoice visibility is tenant-isolated.
- Historical Workiz invoice PDFs are visible to the owning customer only.

## 11. Communications and telephony

- Phone numbers are organization-owned.
- `OwnedPhoneNumber` is the routing boundary for telephony and messaging ownership.
- Inbound webhook processing resolves the organization from the receiving number before creating or attaching records.
- Outbound telephony caller-ID authorization is tenant-owned and fail-closed (`dial_from_forbidden` when the selected caller ID is not registered to the active organization).
- Calls, SMS threads, messages, callback tasks, and related communication records remain organization-scoped.
- There is no tenant-crossing global communications inbox for regular tenant users.
- **Telephony activation itself remains deferred.** Phoenix daily CRM does not require live Telnyx. TXT/telephony raw-SQL schema debt is accepted post-launch hardening when telephony is activated.

## 12. Documents, branding, and inspections

- Platform brand and tenant brand are separate.
- Do not globally rename `Phoenix_CRM` or historical CRM/business data.
- Tenant-facing business identity comes from organization-owned settings.
- Generated invoices, estimates, reports, warranties, and similar artifacts must use immutable snapshots where historical truth matters.
- A later settings change must not silently rewrite a previously generated tenant document.

### 12.1 Invoice documents (current)

- Invoice document durability is verified (staged file + DB transaction + compensation).
- Provenance is tenant-scoped.
- Workiz historical invoice PDFs are attached and isolated.
- **RZISD4** is an accepted historical provenance-backlink anomaly: document/file valid; portal unaffected.

### 12.2 Inspections (current)

- Accepted photo types: JPEG / PNG / WEBP only
- Server-side content / signature validation
- Upload limits: 10 MB per file, 20 files per request, 40 MB per request, 100 photos per inspection
- Atomic batch persistence
- Tenant / RBAC enforcement
- HEIC mobile normalization is **deferred** (backend rejects HEIC)

## 13. CRM money: jobs, invoices, payments

- CRM invoices and tenant customer payments are operating records. They are independent from SaaS subscription billing and do not depend on Stripe.
- Native payment recording has transaction + idempotency protection.
- Invoice / job / payment synchronization is atomic.
- Imported Workiz historical payment stacking was repaired for approved `AUTO_ELIGIBLE` cases.
- Remaining `MANUAL_REVIEW` historical anomalies are accepted historical follow-up, not current corruption.
- Current native payment policy still **permits** certain states (overpayment, already-paid invoice, cancelled-job payment) unless later remediation changes this.
- Do **not** document the proposed V1 REJECT policy as implemented. That remains an owner decision.

## 14. Historical Workiz data vs native operational data

Distinguish clearly:

| Class | Meaning |
|---|---|
| **NATIVE OPERATIONAL DATA** | Records created in WizField after cutover |
| **WORKIZ HISTORICAL IMPORT DATA** | Imported Phoenix Fireplace corpus |

- Do not silently rewrite historical records.
- Historical anomalies (line-item quality, `MANUAL_REVIEW` queue, RZISD4 provenance gap) are accepted follow-up.
- Closeout evidence verified that historical anomalies do **not** contaminate current operational KPIs.
- Unpaid imported Workiz invoices may appear in org-scoped AR widgets. That is correct historical representation, not current-revenue KPI inflation.
- At closeout snapshot: Phoenix invoices were historical Workiz import (native invoices = 0).

## 15. Home AI and AI architecture (summary)

Canonical AI truth: [WizField_AI_Master_Source_of_Truth.md](WizField_AI_Master_Source_of_Truth.md)

Current Home AI (shipped):

- persisted conversation per user + organization (`home_ai_conversations` / `home_ai_messages`)
- role-aware profiles
- server-side tenant and permission enforcement
- **read-only tools only** — no AI write actions
- supported CRM reads: customers, leads, jobs, schedule, estimates, invoices, historical service-intelligence search
- historical vs current financial context must remain correctly represented

Do not describe future AI write capabilities as shipped.

Brain V1 (deterministic `/home` brief) and Operator Copilot remain separate shipped surfaces. Voice intake live pilot remains flag-gated and telephony-dependent.

## 16. Service Intelligence (summary)

Canonical taxonomy and persistence: [WizField_Service_Intelligence_Source_of_Truth.md](WizField_Service_Intelligence_Source_of_Truth.md)

**PLANNED CANONICAL ARCHITECTURE:**

```text
System → Primary Service → Service Detail → Component → Work Action → Labor → Warranty → Findings
```

**CURRENT PRODUCTION IMPLEMENTATION:** Classification V1 tables and a historical Workiz classifier/persist path exist. Service Intelligence **expansion is deferred**. Do not treat the full future Service Intelligence product as shipped.

Service Intelligence is a derived, organization-scoped, versioned layer. It must not overwrite financials, PDFs, or customer master.

## 17. Growth Center and Language Store (summary)

- Growth Center: organization-scoped marketing operations; explicit publish jobs only. See [WizField_Growth_Center_Source_of_Truth.md](WizField_Growth_Center_Source_of_Truth.md).
- Language Store: Settings / add-on-oriented localization and English customer-output. See [WizField_Language_Store_Source_of_Truth.md](WizField_Language_Store_Source_of_Truth.md).
- Language Store must not be added to primary shell navigation unless a future owner IA decision changes that.

## 18. Recovery

Canonical procedure: [WizField_Disaster_Recovery_and_Rebuild_Runbook.md](WizField_Disaster_Recovery_and_Rebuild_Runbook.md)

Current recovery state from closeout:

| Item | Classification |
|---|---|
| DB backup procedure | **DOCUMENTED BUT NOT TESTED** |
| DB restore procedure | **DOCUMENTED BUT NOT TESTED** |
| Uploaded-files backup / restore | **DOCUMENTED BUT NOT TESTED** |
| Secrets / provider recovery | **DOCUMENTED** (owner-controlled) |
| Destructive restore test | **NOT TESTED / NOT VERIFIED** |

Do not state that production restore is proven.

## 19. Gate 0-14 final status table (historical foundation)

These statuses remain locked for the completed foundation phase. They are **not** the current production-readiness verdict. Current verdict is § Current production operating verdict above.

| Gate | Title | Final status |
|---|---|---|
| 0 | Repo Safety + Build Baseline | Completed / absorbed into current repo truth |
| 1 | SaaS Source of Truth Lock | Completed / absorbed into current repo truth |
| 2 | TypeORM Direction Lock | Completed / absorbed into current repo truth |
| 3 | Auth, ActorContext, Membership, activeOrgId | Completed / absorbed into current repo truth |
| 4 | Organization Entity Ownership in TypeORM | Completed / absorbed into current repo truth |
| 5 | Core Query Isolation | Completed / absorbed into current repo truth |
| 6 | Search + Dashboard Isolation | Completed / absorbed into current repo truth |
| 7 | Self-Serve + Portal/Public Access Isolation | Completed / absorbed into current repo truth |
| 8 | Calls/SMS/Webhook Organization Routing | Completed / absorbed into current repo truth |
| 9 | Settings + Branding + Document Snapshots | Completed / absorbed into current repo truth |
| 10 | Full Engine SaaS Conversion | Completed / absorbed into current repo truth |
| 11 | Multi-Business User Experience | CLOSED / GO |
| 12 | Beta Readiness + Security Audit | CLOSED / GO |
| 13 | Billing + Plan Enforcement | ENGINEERING PASS |
| 14 | Launch Preparation | ENGINEERING COMPLETE |

## 20. Current owner launch activation boundary

Internal engineering for the Gate 0-14 foundation phase is complete. September 2026 production closeout is **CONDITIONAL GO**.

What remains is owner-managed launch activation:

- production Terms and Privacy
- production support email and escalation handling
- actual DB / uploaded-file backup execution and evidence
- controlled release staging, pending migrations, and a clean deploy baseline
- owner decision on native payment V1 REJECT policy (optional; current ALLOW policy is accepted)
- owner-selected analytics / error-monitoring setup
- final program / public launch and paid-acquisition decision

Stripe live activation is **not** a current launch requirement.

## 21. Pre-AI and Post-AI program posture (historical)

The Pre-AI Product Foundation, Pre-AI UX / FE correction package, and Portal V1 lifecycle + hardening pass were closed before the AI workstream began.

Owner review accepted the Post-AI full-program audit verdict as:

```text
B - WIZFIELD POST-AI PROGRAM CLEAN WITH NON-BLOCKING GAPS
```

That historical posture is not a substitute for the September 2026 production closeout.

The standalone `WizField_Pre_AI_Final_Correction_Summary.md` is not present in the current checkout. Its closure truth is preserved here and in the engineering closeout record rather than recreated as a new active standalone document.

## 22. Companion handoff

- [WizField_Engineering_Closeout_and_Verification.md](WizField_Engineering_Closeout_and_Verification.md) — historical Gate 11–14 evidence
- [WizField_AI_Master_Source_of_Truth.md](WizField_AI_Master_Source_of_Truth.md) — current AI truth
- [WizField_AI_Engineering_Closeout_and_Gap_Register.md](WizField_AI_Engineering_Closeout_and_Gap_Register.md) — AI Phases 0–4 evidence
- [WizField_Growth_Center_Source_of_Truth.md](WizField_Growth_Center_Source_of_Truth.md)
- [WizField_Service_Intelligence_Source_of_Truth.md](WizField_Service_Intelligence_Source_of_Truth.md)
- [WizField_Language_Store_Source_of_Truth.md](WizField_Language_Store_Source_of_Truth.md)
- [WizField_Owner_Launch_Activation_Checklist.md](WizField_Owner_Launch_Activation_Checklist.md)
- [WizField_Reverification_Runbook.md](WizField_Reverification_Runbook.md)
- [WizField_Disaster_Recovery_and_Rebuild_Runbook.md](WizField_Disaster_Recovery_and_Rebuild_Runbook.md)
- [WIZFIELD_PRODUCTION_CLOSEOUT.md](audit/production-2026-09/WIZFIELD_PRODUCTION_CLOSEOUT.md) — current production verification evidence

## 23. Self-serve signup and activation product contract

Locked product rules (do not reopen Gate 11-14 architecture):

- Auth at signup: email + password only; no social login in V1 launch scope.
- Signup form fields: Full Name, Email, Password, Business Name only — no phone, address, industry, or team-size fields at first launch.
- Flow order: signup → first workspace created → local trialing access state → full CRM access.
- Rejected current model: checkout-before-signup or mandatory SaaS checkout for Phoenix runtime access.
- Post-signup UX: user lands in the operating workspace when role and organization resolution succeed.
- Hard gate: operational CRM access requires local eligible billing state (`trialing` / `active`) or an active controlled access grant; it must not require Stripe secrets, subscription IDs, or webhook state.
- `/billing/success` is a stale compatibility surface only and must not claim subscription activation.
- Signup internal truth: user, first organization, owner membership, session active org, shared billing_account, org–billing coverage, local trialing status.
- Access states:

| State | CRM access | Activation screen |
|---|---|---|
| local_trialing | Yes | No |
| local_active | Yes | No |
| past_due / canceled / deactivated | No, unless controlled grant active | Owner/admin resolution |

- Add-business: entitlement resolved from shared billing account before org creation; Starter=1, Pro=3, Business=expanded local model; block + upgrade path when over limit.
