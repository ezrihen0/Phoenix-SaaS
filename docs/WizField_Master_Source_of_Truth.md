# WizField Master Source of Truth

## Purpose

This is the single canonical product and architecture truth for the WizField project.

It replaces the older scattered Gate 0-14 roadmap, SaaS foundation, numbered Gate 1-10 source-of-truth docs, the Gate 11 UX contract, and the standalone Gate 13 billing sync document as the first document to read before any future WizField discussion.

## 1. Product identity and project separation

- The repository is the WizField workstream: a multi-tenant SaaS conversion of the proven Phoenix CRM operating engine.
- `Phoenix_CRM` and `WizField` are separate workstreams and must remain mentally and operationally separate.
- Historical boundary preserved: `Phoenix_CRM is protected. WizField is the surgery room.`
- The product direction is `WizField`: a field-service operating system for owners running one or more service businesses from one account.

## 2. Phoenix_CRM vs WizField safety boundary

- Do not treat `WizField` as a place for casual production fixes, broad cleanup, or mixed-scope refactors.
- Do not treat `Phoenix_CRM` as a safe place to experiment with SaaS tenant architecture.
- The active SaaS truth lives in this document plus the three companion canonical docs, not in historical planning fragments.
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

## 5. Multi-tenant architecture model

- Platform and tenant concerns are separate.
- Organizations are the top-level tenant boundary for business data.
- Users are global identities.
- Memberships link users to organizations.
- Roles and permissions belong to memberships, not globally to users.
- Every tenant-owned request resolves actor, active organization, membership, role, and permissions.
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

## 6. Multi-org UX model

- One user may access multiple businesses / workspaces.
- Users switch organizations by explicit click through the supported switcher flow.
- The active organization comes from the authenticated session, not from an arbitrary frontend org id.
- Successful switching performs a full navigation to `/home` so stale client state is cleared.
- Full UX and data context change with the active organization: dashboard, customers, leads, jobs, estimates, invoices, settings, search, calls, messaging, reports, booking, and portal-adjacent context.
- Single-membership users get a simple current-workspace display, not a fake switcher.
- Multi-business capability is a core product differentiator, not an edge feature.

## 7. Billing model

- Billing authority is shared-billing-account based, not workspace-by-workspace only.
- `billing_accounts` is the authoritative payer / subscription layer.
- `organization_billing` is coverage / linkage and entitlement projection, not the subscription authority.
- A single billing account may cover multiple organizations under one entitlement.
- Current plan structure:
  - Starter = 1 business
  - Pro = up to 3 businesses
  - Business = expanded local model with no fixed hard cap currently enforced in local repo truth
- Plan enforcement resolves from organization context through the linked shared billing account.
- Billing is SaaS/platform billing and remains separate from tenant CRM invoice/payment records.

## 8. Stripe-first provider model

- Billing uses a provider abstraction boundary.
- Stripe is the active provider implementation.
- Stripe is webhook-authoritative for subscription state synchronization.
- Checkout does not activate billing from the success redirect page.
- Verified Stripe webhook events reconcile local billing state.
- Clover is parked as historical traceability only and is not the active Gate 13 path.
- Clover code, provider references, and schema lineage may remain in repo history for traceability, but Stripe remains the active billing-provider truth unless a future owner-approved provider reactivation explicitly changes that.

## 9. Tenant isolation rules

- Never fetch tenant-owned data by `id` only.
- Tenant-owned reads, updates, deletes, counts, and lists must remain organization-scoped.
- Cross-organization access is forbidden.
- Backend membership validation is authoritative on every request.
- Frontend state is not trusted for authorization by itself.
- Search, dashboard, aggregates, automations, and communication flows must remain scoped to the active organization unless an explicit audited platform-admin surface exists.
- Cross-tenant leakage is the primary product risk and remains unacceptable.

## 10. Public access rules: portal, booking, and token ownership

- Public booking must resolve the target organization first.
- Public portal and access-token flows must bind back to organization-owned resources.
- Token resolution must prove validity, expiry status, target resource ownership, and correct organization scope.
- Public routes must not expose internal records by bare UUID alone.
- Invalid, expired, or reused tokens must fail safely.
- Public booking must never silently default to the wrong tenant.

## 11. Communications ownership rules: calls, SMS, and owned numbers

- Phone numbers are organization-owned.
- `OwnedPhoneNumber` is the routing boundary for telephony and messaging ownership.
- Inbound webhook processing resolves the organization from the receiving number before creating or attaching records.
- Outbound sending verifies that the sending number belongs to the active organization.
- Calls, SMS threads, messages, callback tasks, and related communication records remain organization-scoped.
- There is no tenant-crossing global communications inbox for regular tenant users.

## 12. Document, branding, and snapshot rules

- Platform brand and tenant brand are separate.
- Do not globally rename `Phoenix_CRM` or historical CRM/business data.
- Tenant-facing business identity comes from organization-owned settings.
- Generated invoices, estimates, reports, warranties, and similar artifacts must use immutable snapshots where historical truth matters.
- A later settings change must not silently rewrite a previously generated tenant document.

## 13. Gate 0-14 final status table

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

## 14. Current owner launch activation boundary

Internal engineering for the Gate 0-14 foundation phase is complete enough that no Gate 11-14 status should be reopened by this rename pass.

What remains is owner-managed launch activation, not unfinished foundation engineering:

- live Stripe activation and webhook confirmation
- final Terms
- final Privacy
- production support email and escalation handling
- owner-selected analytics / error-monitoring setup
- production-like deployed rerun evidence where required
- final program/public launch decision

Paid acquisition remains outside engineering closeout and stays gated on owner launch activation completion.

## 15. Pre-AI and Post-AI program posture

The Pre-AI Product Foundation, Pre-AI UX / FE correction package, and Portal V1 lifecycle + hardening pass were closed before the AI workstream began.

The closed Pre-AI correction baseline includes:

- role-aware navigation / role-sensitive shell affordances
- CRM Automations vs Growth Center Automations clarity
- Schedule / Dispatch IA visibility
- Office Home snapshot improvements
- Pricing / Billing Success credibility cleanup
- Portal staff magic-link generation lifecycle
- Portal org/resource read hardening
- Portal redeem transaction hardening
- Customer profile Generate + Copy portal link UX

The standalone `WizField_Pre_AI_Final_Correction_Summary.md` is not present in the current checkout. Its closure truth is preserved here and in the engineering closeout record rather than recreated as a new active standalone document.

Owner review accepted the Post-AI full-program audit verdict as:

```text
B - WIZFIELD POST-AI PROGRAM CLEAN WITH NON-BLOCKING GAPS
```

This means:

- no P0 or P1 blockers were accepted after AI Phase 0-4 closure
- the AI Program did not introduce a serious cross-product architecture risk
- the bounded Post-AI Correction Pass is cleanup and alignment work, not a reopening of Gate 11-14, Growth Center V1, Language Store V1, Portal V1, or AI Phase 0-4

Language Store remains a Settings / add-on-oriented surface for now. It must not be added to primary shell navigation unless a future owner IA decision changes that.

## 16. Current next-phase handoff

The next phase is not "redo SaaS architecture." The next phase is controlled launch activation on top of the completed engineering foundation.

Use the companion docs this way:

- `WizField_Engineering_Closeout_and_Verification.md` for final engineering evidence and locked closeout truth
- `WizField_AI_Master_Source_of_Truth.md` for shipped AI program truth (Phases 0–4)
- `WizField_AI_Engineering_Closeout_and_Gap_Register.md` for AI verification evidence and gap closure
- `WizField_Growth_Center_Source_of_Truth.md` for active Growth Center V1 implementation truth
- `WizField_Language_Store_Source_of_Truth.md` for active Language Store product and architecture truth
- `WizField_Owner_Launch_Activation_Checklist.md` for owner-managed launch activation items
- `WizField_Reverification_Runbook.md` for future production-like reruns and operator replay (see §6B for AI)

Subordinate planning artifacts:

- `PhoenixOS_WizField_Signup_Activation_Master_Plan.md` preserves signup and activation planning context only; current signup, billing, and owner activation truth comes from this document, the engineering closeout, and the owner launch checklist.
- `WizField_Growth_Center_Marketing_Master_Plan.md` preserves strategic Growth Center planning context only; active Growth Center V1 truth comes from the Growth Center Source of Truth and closeout records.

Short handoff summary:

1. Keep the Gate 11-14 engineering statuses unchanged.
2. Treat live Stripe, legal/support closeout, monitoring, and launch-program approval as owner activation scope.
3. Use the reverification runbook for any future production-like replay.
4. Keep the active documentation system small and canonical; rely on git history for retired detail.
