# PhoenixOS SaaS Roadmap — TypeORM-First Execution Plan

**Project:** Phoenix_SaaS / PhoenixOS  
**Repository:** `https://github.com/ezrihen0/Phoenix-SaaS.git`  
**Execution Mode:** SaaS Surgery on existing Phoenix CRM clone  
**ORM Direction:** TypeORM-first  
**Market Direction:** North America-ready, Canada-first  
**Roadmap Version:** v1.0  

---

## 0. Executive Decision

PhoenixOS is not being built from zero.

PhoenixOS is a SaaS conversion of an existing working Phoenix CRM engine.

The goal is to convert the existing single-company CRM into a scalable, tenant-safe SaaS platform for field-service companies.

The product must support:

- self-serve signup
- multiple businesses under one user account
- business switching / “hat switching”
- full Phoenix engine conversion, not only a small demo
- tenant-safe customer portal
- TypeORM as the active ORM for the first SaaS conversion
- billing after the tenant foundation and beta readiness

---

## 1. Locked Product Decisions

These decisions are locked for this roadmap.

| Area | Decision |
|---|---|
| First release model | Self-serve capable, not only manually onboarded beta |
| Business structure | One user may own/manage multiple organizations/businesses |
| Org switcher | Required early; user can switch between businesses such as Garage Door, Chimney, HVAC, etc. |
| MVP scope | Full Phoenix engine becomes scalable, not only Customers/Jobs |
| Billing timing | Billing/Stripe after core tenant-safe beta foundation |
| Portal | Portal must be fixed and tenant-safe, not disabled long-term |
| ORM | TypeORM remains the active ORM for this conversion |
| Prisma | Frozen / ignored for now; no Prisma migration during SaaS surgery |
| Launch budget intent | Product must be strong enough to support advertising spend later |

---

## 2. Product North Star

PhoenixOS is not a generic CRM.

PhoenixOS is a field-service operating system that helps small service companies:

- stop losing calls
- stop losing leads
- manage jobs
- send estimates
- send invoices
- collect payments
- organize customer history
- run multiple businesses from one account
- save admin time
- recover lost revenue

### Core Product Promise

> PhoenixOS helps field-service owners manage calls, leads, jobs, estimates, invoices, communication, reports, and customer access across multiple businesses from one operating system.
E.G - 1. Chimney & Fireplace Services
2. HVAC Services
3. Garage Door Repair & Installation
4. Plumbing & Rooter Services
5. Electrical Contracting
6. Appliance Repair Services
Secondary Trades - 
7. Roofing & Gutter Maintenance
8. Pest Control Services
9. Restoration & Remediation
10. Landscaping & Tree Surgery

---

## 3. TypeORM-First Meaning

TypeORM is the active database layer currently used by the backend.

That means the SaaS conversion must happen in the real active system:

- TypeORM entities
- TypeORM repositories
- NestJS services
- controllers
- query filters
- database migrations matching TypeORM

Prisma may contain useful planning information, but it is not the active execution path right now.

### Rule

```text
Do not migrate to Prisma during the first SaaS conversion.
Do not use Prisma schema as the runtime source of truth.
Make TypeORM tenant-safe first.
```

### Why

Changing ORM and converting to SaaS at the same time creates two surgeries at once.

That is unnecessary risk.

The current objective is not to rebuild the engine.

The current objective is to make the existing engine SaaS-safe.

---

## 4. Critical SaaS Risk Summary

Current audit findings show these show-stoppers:

| Risk | Why It Matters | Roadmap Response |
|---|---|---|
| ActorContext missing organizationId | Backend cannot know which tenant the request belongs to | Gate 3 |
| TypeORM entities missing organizationId | Active database layer is not tenant-owned | Gate 4 |
| ID-only queries | User can access another org's records by direct ID | Gate 5 |
| Global search | Search can leak cross-tenant data | Gate 6 |
| Public booking no org context | New leads may be created under wrong org | Gate 7 |
| Portal not org-verified | Customer portal can leak tenant data | Gate 7 |
| Telephony/SMS not org-routed | Calls/SMS may attach to wrong company | Gate 8 |
| Hardcoded Phoenix branding | Tenant documents may show Phoenix data | Gate 9 |
| Billing before tenant model | Plan limits cannot be trusted | Gate 13 |

---

## 5. Roadmap Overview

The roadmap is divided into Gates.

A Gate is a checkpoint. Do not move to the next Gate until the current Gate passes build, tests, and owner review.

```text
Gate 0  — Repo Safety + Build Baseline
Gate 1  — SaaS Source of Truth Lock
Gate 2  — TypeORM Direction Lock
Gate 3  — Auth, ActorContext, Membership, activeOrgId
Gate 4  — Organization Entity Ownership in TypeORM
Gate 5  — Core Query Isolation
Gate 6  — Search + Dashboard Isolation
Gate 7  — Self-Serve + Portal/Public Access Isolation
Gate 8  — Calls/SMS/Webhook Organization Routing
Gate 9  — Settings + Branding + Document Snapshots
Gate 10 — Full Engine SaaS Conversion
Gate 11 — Multi-Business User Experience
Gate 12 — Beta Readiness + Security Audit
Gate 13 — Billing + Plan Enforcement
Gate 14 — Launch Preparation
```

---

# GATE 0 — Repo Safety + Build Baseline

## Goal

Confirm Phoenix_SaaS is isolated from Phoenix_CRM and can build before SaaS surgery begins.

## What Happens Here

The agent verifies:

- current repo
- remote URL
- branch
- git status
- latest commit
- backend build
- frontend build

## Why This Matters

Phoenix_CRM is the production/money system.

Phoenix_SaaS is the surgery room.

Any confusion here can damage the active business CRM.

## Required Commands

```powershell
cd "C:\Users\edenz\Videos\Projects\Phoenix_SaaS"
git remote -v
git branch
git status --short
git log -1 --oneline
npm.cmd run build --workspace backend
npm.cmd run build --workspace frontend
```

## Pass Criteria

- `origin` points only to `https://github.com/ezrihen0/Phoenix-SaaS.git`
- no Phoenix_CRM remote
- clean or clearly approved working tree
- backend build passes
- frontend build passes

## Stop Conditions

Stop if:

- remote points to old Phoenix CRM repo
- branch is wrong
- build fails
- unexpected dirty files exist

## Agent Prompt

```text
You are working in Phoenix_SaaS.
Do not change code.
Verify repo safety and build baseline only.
Run git remote -v, git branch, git status --short, git log -1 --oneline.
Then run backend and frontend builds.
Report results only.
No code changes.
```

---

# GATE 1 — SaaS Source of Truth Lock

## Goal

Create/lock the SaaS rules before touching protected code.

## What Happens Here

Create and approve a central SaaS roadmap and supporting source-of-truth documents.

Minimum docs:

```text
docs/saas/00-phoenixos-saas-roadmap.md
docs/saas/01-platform-foundation.md
docs/saas/02-auth-users-organizations-roles.md
docs/saas/03-core-crm-entity-ownership.md
docs/saas/04-public-portal-booking-access.md
docs/saas/05-calls-sms-telephony.md
docs/saas/06-settings-branding-documents.md
```

## Why This Matters

A SaaS product without written tenant rules becomes chaos.

Every agent must know:

- what data belongs to platform
- what data belongs to organization
- what belongs to membership
- what must be immutable
- what is public-access risk
- what must never be global

## Pass Criteria

- documents exist
- decisions are written
- TypeORM-first is written
- no global Phoenix rename rule is written
- no Prisma migration rule is written
- protected file rules are written

## Stop Conditions

Stop if the agent tries to code before docs are approved.

## Agent Prompt

```text
You are working in Phoenix_SaaS documentation mode.
Do not change application code.
Create SaaS source-of-truth documents under docs/saas.
Include tenant model, TypeORM-first decision, auth/membership rules, entity ownership rules, public access rules, portal safety rules, calls/SMS org routing rules, and stop conditions.
No backend/frontend code changes.
Return changed file list only.
```

---

# GATE 2 — TypeORM Direction Lock

## Goal

Remove ORM confusion.

## What Happens Here

The project officially commits to TypeORM as the active SaaS conversion path.

Prisma is treated as inactive/reference-only.

## Why This Matters

The audit found dual ORM mismatch:

- Prisma has `organizationId`
- TypeORM active entities do not fully have it

The real system uses TypeORM, so TypeORM must become SaaS-safe.

## Required Decision

```text
TypeORM is the active ORM.
Prisma is frozen.
No Prisma migration during SaaS conversion.
All tenant ownership work must be done in TypeORM entities, migrations, services, and queries.
```

## Pass Criteria

- documented decision
- no Prisma migration started
- TypeORM entity audit exists

## Agent Prompt

```text
You are working in Phoenix_SaaS.
Do not change code.
Create a TypeORM-first SaaS entity audit.
List every active TypeORM entity and classify it as Platform-owned, Organization-owned, Membership-owned, User-owned, Public-access resource, Immutable snapshot, or Unknown.
Identify which organization-owned entities are missing organizationId.
Return markdown only.
No code changes.
```

---

# GATE 3 — Auth, ActorContext, Membership, activeOrgId

## Goal

Every authenticated backend request must resolve:

```text
actor
userId
membershipId
organizationId
role
permissions
```

## What Happens Here

The auth/session layer is upgraded from user-only context to tenant-aware context.

## Why This Matters

Without `organizationId` in request context, the backend cannot safely filter records.

This Gate is the foundation for all SaaS isolation.

## Required Backend Model

```text
User
Organization
Membership
Role
activeOrgId
ActorContext
```

## Required Behavior

- user logs in
- system loads memberships
- user has active organization
- request carries active organization
- backend verifies user belongs to that organization
- role is resolved from membership, not global user

## Important Product Requirement

Because users may manage multiple businesses, the architecture must support multiple memberships.

Example:

```text
User: owner@example.com
Membership 1: Garage Door Business — owner
Membership 2: Chimney Business — owner
Membership 3: HVAC Business — admin
```

## Package Work

Likely areas:

```text
backend/src/auth/*
backend/src/auth/actor-context*
backend/src/database/entities/user*
backend/src/database/entities/organization*
backend/src/database/entities/membership*
backend/src/common/guards/*
frontend auth/session helpers
```

## Tests

- user with one org resolves activeOrgId
- user with two orgs can switch activeOrgId
- user cannot select org they are not a member of
- no authenticated request proceeds without valid organization context

## Stop Conditions

Stop if:

- membership model is unclear
- activeOrgId cannot be trusted
- frontend sends org ID but backend does not verify membership
- role remains global only

## Agent Prompt

```text
Work Mode: Database Change + Auth/Security Change.
Do not code yet.
Prepare an execution preview for tenant-aware ActorContext.
Goal: add active organization context to authenticated requests using TypeORM and existing auth/session system.
Include exact files likely to touch, risk level, test plan, rollback point, and stop conditions.
No code changes until file list is approved.
```

---

# GATE 4 — Organization Entity Ownership in TypeORM

## Goal

Every tenant-owned entity in the active TypeORM system gets `organizationId` ownership.

## What Happens Here

Add organization ownership to business data entities.

## Priority Entities

P0:

```text
Customer
Lead
Job
Estimate
Invoice
InvoicePayment
RecentCall
TxtConversation
TxtMessage
OrganizationSetting
```

P1:

```text
PricebookItem
PricebookBundle
InventoryItem
InventoryLocation
InventoryMovement
Technician
Inspection
Report
WarrantyCertificate
AutomationRule
AutomationRun
OwnedPhoneNumber
CallbackTask
```

## Why This Matters

A SaaS system cannot rely on app logic alone.

The database model must express ownership.

## Required Pattern

Every organization-owned entity must include:

```ts
organizationId: string
organization: Organization relation
```

Recommended DB index:

```text
INDEX (organizationId)
INDEX (organizationId, id)
INDEX (organizationId, status) where useful
INDEX (organizationId, createdAt) where useful
```

## Migration Strategy

Because this is a cloned SaaS system:

1. Create a default seed organization for existing Phoenix data.
2. Backfill existing records with default organizationId.
3. Make organizationId required after backfill.
4. Add indexes.
5. Only then enforce query filters.

## Tests

- migration runs on local DB
- existing records assigned to default org
- new records require org
- build passes

## Stop Conditions

Stop if:

- migration touches unrelated columns
- existing data cannot be backfilled cleanly
- entity relation breaks build
- agent tries to change Prisma instead of TypeORM

## Agent Prompt

```text
Work Mode: Database Change.
TypeORM-first only.
Do not touch Prisma.
Prepare a TypeORM organization ownership package.
Goal: add organizationId to P0 tenant-owned entities and create a safe migration/backfill path.
Include exact TypeORM entity files, migration file, seed/backfill approach, indexes, risks, tests, and rollback plan.
No code changes until approved.
```

---

# GATE 5 — Core Query Isolation

## Goal

No tenant-owned query may run by `id` only.

## What Happens Here

All core CRM queries are converted to include organization context.

## Critical Rule

Bad:

```ts
findOne({ where: { id } })
```

Good:

```ts
findOne({ where: { id, organizationId: actor.organizationId } })
```

## Modules First

```text
Customers
Leads
Jobs
Estimates
Invoices
Invoice payments
Dashboard counters
Customer timeline
Notes/photos if present
```

## Why This Matters

This is where cross-tenant leakage actually happens.

Entities having `organizationId` is not enough.

Every read/update/delete must use it.

## Required Rules

For organization-owned records:

- create must assign active organizationId
- read must filter by organizationId
- update must filter by id + organizationId
- delete must filter by id + organizationId
- list must filter by organizationId
- counts must filter by organizationId
- includes/relations must not pull cross-org data

## Tests

Create two orgs:

```text
Org A
Org B
```

Create data in both.

Verify:

- Org A cannot fetch Org B customer by ID
- Org A cannot update Org B invoice by ID
- Org A dashboard does not count Org B leads
- Org A job list does not show Org B jobs
- direct API manipulation fails

## Stop Conditions

Stop if:

- query volume is too large for one package
- query uses raw SQL without clear org filter
- service does not receive ActorContext
- includes create cross-org leak

## Agent Prompt

```text
Work Mode: Database/SaaS Change.
Do not code yet.
Prepare Package: Core Query Isolation for Customers, Leads, Jobs, Estimates, and Invoices.
Audit all findOne/findMany/count/update/delete/upsert/raw queries in these modules.
For each query, show current risk and target tenant-safe rule.
List exact files to touch.
No code changes until approved.
```

---

# GATE 6 — Search + Dashboard Isolation

## Goal

Search and dashboard must only show active organization data.

## What Happens Here

Global search adapters and dashboard aggregate queries receive organization context.

## Why This Matters

Search is one of the easiest ways to leak data.

Dashboard is one of the easiest ways to leak aggregate business numbers.

## Search Rule

Tenant users search only inside active organization.

Platform-wide search is forbidden until a separate platform super-admin system exists.

## Dashboard Rule

Every counter must be organization-scoped.

Bad:

```ts
leadsRepository.countBy({ status: "new_lead" })
```

Good:

```ts
leadsRepository.countBy({ status: "new_lead", organizationId })
```

## Tests

- Org A search cannot find Org B customer
- Org A search cannot find Org B invoice
- dashboard counts match Org A only
- switching org updates dashboard data

## Stop Conditions

Stop if:

- search adapter cannot receive org context
- global search is reused for tenant UI
- dashboard queries are not traceable

## Agent Prompt

```text
Work Mode: Database/SaaS Change.
Do not code yet.
Prepare Search and Dashboard Isolation package.
Audit all search adapters and dashboard aggregate queries.
Target: every search/count/list must include active organizationId.
List exact files, risks, tests, rollback.
No code changes until approved.
```

---

# GATE 7 — Self-Serve + Portal/Public Access Isolation

## Goal

Self-serve onboarding and public customer access must be tenant-safe.

## What Happens Here

Build/fix:

- signup
- create organization
- create first membership
- active organization selection
- customer portal org-bound tokens
- public booking organization resolution
- quote/payment/report/warranty link ownership

## Why This Matters

You want self-serve, and you want Portal fixed.

That means public routes cannot be treated as later cleanup.

They must become tenant-safe before real users enter.

## Self-Serve Flow

```text
User signs up
→ creates account
→ creates first organization
→ becomes owner membership
→ organization settings initialized
→ activeOrgId selected
→ enters dashboard
```

## Multi-Business Flow

```text
User opens organization switcher
→ creates second organization
→ receives owner membership
→ can switch active business
→ each business has separate customers/jobs/invoices/settings
```

## Portal/Public Access Rule

Every public token must resolve:

```text
token
→ organizationId
→ resourceId
→ resource ownership verified
→ permission/scope verified
→ access granted
```

## Public Access Types

```text
Customer portal
Public booking
Quote approval
Payment link
Report link
Warranty certificate link
SMS short link
```

## Tests

- portal token for Org A cannot access Org B customer
- expired token fails
- invalid token fails
- booking link creates lead under correct org
- organization-specific booking page loads correct branding
- switching org does not change existing portal token target

## Stop Conditions

Stop if:

- token is global only
- public route cannot resolve organization
- public booking creates records without organizationId
- portal session can access customer by id only

## Agent Prompt

```text
Work Mode: Auth/Security + Public Access Change.
Do not code yet.
Prepare Self-Serve and Public Access Isolation package.
Include signup, organization creation, owner membership creation, organization switcher dependency, customer portal token binding, public booking org resolution, and public link ownership verification.
List exact files, risks, tests, rollback, and stop conditions.
No code changes until approved.
```

---

# GATE 8 — Calls/SMS/Webhook Organization Routing

## Goal

Inbound and outbound communications must belong to the correct organization.

## What Happens Here

Calls and SMS are converted from global communication records to organization-owned communication records.

## Required Model

```text
OwnedPhoneNumber
→ organizationId
→ provider
→ phoneNumber
→ status
```

Inbound flow:

```text
Webhook received
→ read To/Receiving number
→ lookup OwnedPhoneNumber
→ resolve organizationId
→ create RecentCall or TxtMessage under that organization
```

Outbound flow:

```text
User sends SMS/call
→ active organization resolved
→ sending number verified belongs to organization
→ message/call created under organization
```

## Why This Matters

Calls/SMS are a core money engine.

But in SaaS, phone numbers are tenant boundaries.

## Tests

- inbound call to Org A number creates Org A call
- inbound SMS to Org B number creates Org B SMS
- Org A cannot send from Org B number
- callback tasks are organization-scoped
- call recordings/AI summaries are organization-scoped

## Stop Conditions

Stop if:

- webhook cannot map phone number to org
- existing call records lack backfill strategy
- outgoing number is not verified against active org

## Agent Prompt

```text
Work Mode: Telephony/Messaging SaaS Change.
Do not code yet.
Prepare Calls/SMS organization routing package.
Goal: every inbound/outbound call and SMS resolves organization through OwnedPhoneNumber and activeOrgId.
Include TypeORM entities, webhook routing, outbound verification, data backfill, files, risks, tests, rollback.
No code changes until approved.
```

---

# GATE 9 — Settings + Branding + Document Snapshots

## Goal

Separate Phoenix brand from tenant brand.

## What Happens Here

Move tenant-facing values into organization-owned settings.

## Tenant Settings

```text
company name
logo
phone
email
website
address
country
region/province/state
currency
timezone
tax profile
invoice header
estimate header
report header
SMS sender label
portal branding
booking branding
warranty terms
report terms
```

## Critical Rule

Do not global replace Phoenix.

Classify every Phoenix reference first:

```text
safe UI label
tenant branding
legal/report wording
invoice/estimate wording
SMS wording
config/env
historical data
business logic
```

## Document Snapshot Rule

Generated documents must preserve historical truth.

Examples:

```text
invoice PDF snapshot
estimate snapshot
inspection report snapshot
warranty certificate snapshot
payment receipt snapshot
```

If a company changes logo later, old documents should not silently change.

## Tests

- Org A invoice shows Org A branding
- Org B invoice shows Org B branding
- old generated PDF remains unchanged after settings update
- reports do not show Phoenix hardcoded branding unless tenant is Phoenix
- SMS template uses tenant company name

## Stop Conditions

Stop if:

- agent tries global rename
- reports/legal wording are changed without owner approval
- snapshots are not preserved
- Phoenix customer history is overwritten

## Agent Prompt

```text
Work Mode: Settings/Branding SaaS Change.
Do not code yet.
Prepare Organization Settings and Document Snapshot package.
Audit Phoenix hardcoded references and classify them.
Target: tenant-facing branding must come from OrganizationSetting; generated documents must use immutable snapshots.
List files, risks, tests, rollback, and stop conditions.
No code changes until approved.
```

---

# GATE 10 — Full Engine SaaS Conversion

## Goal

Convert the full Phoenix CRM engine into scalable SaaS modules.

## What Happens Here

After tenant foundation is stable, convert each engine one by one.

## Module Order

1. Customers
2. Leads
3. Jobs
4. Estimates
5. Invoices
6. Payments status / manual billing records
7. Pricebook
8. Inventory
9. Technicians / staff assignment
10. Schedule / dispatch
11. Reports / inspections / WETT
12. Warranty certificates
13. Automations
14. Portal
15. Booking
16. Calls/SMS

## Rule

Each module must answer:

```text
Who owns this data?
Which organization owns it?
Which membership can access it?
What public links expose it?
What documents snapshot it?
What plan should unlock it later?
```

## Package Template

Every module package must include:

```text
Purpose
Business reason
Entities touched
Routes touched
Services touched
Frontend pages touched
Tenant ownership rule
Public access rule if relevant
Risk level
Test plan
Rollback point
Stop conditions
```

## Tests

For every module:

- Org A create/list/read/update/delete only Org A data
- Org B cannot access Org A data by direct ID
- org switcher changes visible data
- build passes
- no unrelated files changed

## Stop Conditions

Stop if:

- package touches too many modules
- ownership unclear
- protected area expands without approval
- build fails

---

# GATE 11 — Multi-Business User Experience

## Goal

Make switching between businesses natural and safe.

## What Happens Here

Build the frontend experience for users who manage several businesses.

## UX Concept

The user can “change hat”:

```text
Garage Door Business
Chimney Business
HVAC Business
Roofing Business
```

Each selected organization changes:

- dashboard data
- customers
- jobs
- invoices
- settings
- calls/SMS numbers
- reports
- booking/portal branding

## Required UI

```text
Organization switcher
Create organization flow
Organization settings
Staff/members page
Current organization badge
Safe loading state when switching
```

## Required Backend

```text
POST /active-organization or equivalent
Membership verification
Session update
Context refresh
```

## Tests

- user switches from Org A to Org B
- dashboard refreshes to Org B only
- browser refresh keeps active org
- user cannot switch to org they do not belong to
- two businesses can have customers with same name without collision

## Stop Conditions

Stop if:

- frontend trusts orgId without backend verification
- localStorage-only org switching is used without server validation
- switcher changes UI but not API context

---

# GATE 12 — Beta Readiness + Security Audit

## Goal

Get ready for real users before advertising spend.

## Beta Target

You have two known people likely to use the system.

Beta should support them safely.

## Required Before Beta

```text
Self-serve signup works
Create first organization works
Create second organization works
Org switcher works
Customers/jobs/leads/invoices are org-safe
Search is org-safe
Portal is org-safe
Calls/SMS are at least safely scoped or clearly limited
Settings/branding are tenant-owned
No Phoenix branding leaks into other tenant documents
Builds pass
Critical P0 leaks fixed
```

## Beta Acceptance Test

Create:

```text
User 1
→ Org A
→ Org B

User 2
→ Org C
```

Verify:

- User 1 can switch A/B
- User 1 cannot see C
- User 2 cannot see A/B
- portal links stay bound to correct org
- search cannot leak
- direct ID manipulation fails
- invoices/reports show correct branding

## Security Checklist

```text
No id-only tenant queries
No global search for tenant users
No portal token without organization binding
No webhook without organization resolution
No payment/invoice route without organization filtering
No staff assignment across orgs
No automation execution across orgs
```

## Stop Conditions

Do not invite beta users if any P0 remains open.

---

# GATE 13 — Billing + Plan Enforcement

## Goal

Turn PhoenixOS into a real SaaS business.

## Timing

Billing comes after tenant-safe beta foundation.

Manual billing/free pilot is acceptable before this Gate.

## What Happens Here

Add:

```text
Stripe customer per organization
trial state
subscription status
plan guard
feature limits
billing portal
failed payment handling
upgrade/downgrade path
```

## Plan Model Draft

### Trial

Limited time, limited usage.

### Starter

```text
Customers
Jobs
Basic estimates
Basic invoices
1 business
1-2 users
```

### Pro

```text
Everything in Starter
Multiple businesses
Callbacks
SMS templates
Review requests
Pricebook
```

### Business

```text
Everything in Pro
Calls/SMS routing
Reports
Warranty certificates
Inventory
Automations
Portal
Public booking
More users
```

### Enterprise Later

```text
White-label
Custom domain
Advanced admin
Priority support
Custom limits
```

## Important Decision

Because multi-business is a core differentiator, do not hide all multi-org behind Enterprise.

Better model:

```text
Starter: 1 business
Pro: up to 3 businesses
Business: more businesses + advanced modules
```

## Tests

- organization has Stripe customer
- plan status controls feature access
- expired trial blocks paid features
- plan guard uses organization, not user only
- user with multiple orgs can have different plans per org if needed

## Stop Conditions

Stop if:

- billing is user-level only instead of organization-level
- plan guard does not use organizationId
- Stripe webhooks are not org-bound

---

# GATE 14 — Launch Preparation

## Goal

Prepare PhoenixOS for public advertising and paid acquisition.

## Required Before $3,000 Ad Spend

```text
Landing page
Clear positioning
Pricing page
Self-serve signup
Demo/onboarding video
Support email/process
Terms + Privacy
Tenant-safe beta tests passed
Production error monitoring
Backup plan
Basic analytics
Trial conversion path
```

## Positioning

Do not sell “CRM”.

Sell:

```text
Field-service operating system for owners who are tired of losing calls, jobs, estimates, invoices, and customer history.
```

## Launch Offer

Recommended:

```text
14-day trial
Founding customer discount
Setup help for first 10 customers
```

## Conversion Metrics

Track:

```text
signups
organizations created
second business created
first customer created
first job created
first estimate sent
first invoice created
portal link opened
SMS/callback used
trial-to-paid conversion
support tickets per account
```

## Stop Conditions

Do not run ads if:

- signup breaks
- org switching breaks
- customer/job isolation not proven
- portal token unsafe
- pricing page not connected to product value
- onboarding requires too much manual explanation

---

# Execution Rules for Every Package

Every code package must follow this process.

## 1. Before Coding Preview

The agent must provide:

```text
Feature/task summary
Selected work mode
Exact files likely to be touched
Why each file is needed
Protected files
Main risks
Test plan
Rollback point
Stop conditions
```

## 2. Owner Approval

No code changes until file list is approved.

## 3. Build Gate

Before commit:

```powershell
npm.cmd run build --workspace backend
npm.cmd run build --workspace frontend
git status --short
```

## 4. Git Rules

```text
Never use git add .
Add only approved files
No dirty unrelated files
Clear commit message
No push without owner approval
```

## 5. SaaS Stop Conditions

Stop immediately if:

```text
organization ownership unclear
query missing organizationId
public token not org-bound
webhook cannot resolve org
frontend trusts orgId without backend verification
protected files expand beyond approval
build fails
unexpected files changed
```

---

# Agent Master Prompt for This Roadmap

Use this when starting a new package.

```text
You are working inside Phoenix_SaaS, not Phoenix_CRM.
Phoenix_CRM is production and must not be touched.
Phoenix_SaaS is the SaaS surgery clone.

We are executing the PhoenixOS SaaS Roadmap.
Direction: TypeORM-first.
Do not migrate to Prisma.
Do not edit Prisma as the active schema.
Do not install packages unless explicitly approved.
Do not use git add .
Do not make broad refactors.
Do not global rename Phoenix.

Before coding, provide an execution preview:
- selected work mode
- goal
- exact files likely to touch
- why each file is needed
- protected files
- main risks
- test plan
- rollback point
- stop conditions

No code changes until owner approves the file list.

Every SaaS-owned query must include active organization context.
Every public access token must resolve to organization-owned resource.
Every webhook must resolve organization before creating records.
Every generated document must use tenant settings and/or immutable snapshots.
```

---

# Immediate Next Step

Start with Gate 0 and Gate 1.

Do not jump into code yet unless the docs already exist and are approved.

Recommended next agent request:

```text
You are working in Phoenix_SaaS.
Do not change application code.
First verify repo safety and build baseline.
Then create docs/saas/00-phoenixos-saas-roadmap.md from the approved roadmap content.
Report changed files only.
Do not edit backend/frontend code.
```

---

# Final Principle

PhoenixOS must not become a CRM clone with a SaaS sticker.

It must become a tenant-safe operating system for field-service businesses.

The order is:

```text
Control
→ Tenant Isolation
→ Self-Serve
→ Multi-Business Switching
→ Full Engine Conversion
→ Portal/Public Safety
→ Communication Routing
→ Branding/Snapshots
→ Beta
→ Billing
→ Launch
```

If tenant isolation is weak, the product is not ready.

If tenant isolation is strong, the existing Phoenix engine becomes a serious SaaS asset.

