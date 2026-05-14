# WizField Marketing Growth Center
## Phase 1 Foundation Execution Prompt
## PLAN MODE

## Purpose
Convert the approved `/marketing` roadmap into a single safe implementation slice for **Phase 1 only - Marketing Foundation**.

This artifact is the execution boundary for the first authorized Growth Center build step.

## Selected Work Mode
New Feature

## Locked Inputs
- Strategic source: `docs/WizField_Growth_Center_Marketing_Master_Plan.md`
- Approved execution boundary: `/marketing` Super Plan
- Phase authorized: **Phase 1 only - Marketing Foundation**

## Hard Boundaries
- Do not reopen or reinterpret Gate 11-14 closeout.
- Do not blend this work into owner launch activation.
- Do not implement Content Studio, AI generation, publishing, CRM intelligence, campaigns, automations, analytics, or monetization wiring.
- Do not touch the `/marketing` Super Plan file during implementation.

## Feature Card
Reference:
- `docs/WizField_Marketing_Growth_Center_Phase_1_Foundation_Feature_Card.md`

## Exact Approved Scope
Included now:
- authenticated office-side `/marketing` route family
- office navigation entry for Growth Center
- empty-state page shells for the approved sub-routes
- organization-scoped backend foundation endpoint
- initial organization-owned marketing entity contracts

Excluded now:
- content generation
- draft editing workflows
- channel connection flows
- publish actions
- CRM opportunity detection
- campaign execution
- marketing automations
- analytics logic
- billing or entitlement enforcement

## Exact File Inventory

### Files to edit
- `frontend/components/app-shell.tsx`
  - Why: add the Growth Center office nav entry.
  - Risk: Low
  - Protected: No

- `backend/src/app.module.ts`
  - Why: register the new backend marketing module.
  - Risk: Medium
  - Protected: Yes

- `backend/src/database/typeorm.config.ts`
  - Why: register initial marketing entities.
  - Risk: High
  - Protected: Yes

### Files to create
- `frontend/app/marketing/[[...slug]]/page.tsx`
  - Why: provide the authenticated `/marketing` route family in one controlled Phase 1 entry point.
  - Risk: Low
  - Protected: No

- `frontend/components/marketing/marketing-foundation-workspace.tsx`
  - Why: render the shared Phase 1 Growth Center shell and empty states.
  - Risk: Low
  - Protected: No

- `backend/src/marketing/marketing.module.ts`
  - Why: define the backend module boundary for marketing foundation work.
  - Risk: Medium
  - Protected: Yes

- `backend/src/marketing/marketing.controller.ts`
  - Why: expose an organization-scoped Phase 1 foundation endpoint.
  - Risk: Medium
  - Protected: Yes

- `backend/src/marketing/marketing.service.ts`
  - Why: centralize foundation response shaping and later-safe expansion.
  - Risk: Low
  - Protected: No

- `backend/src/database/entities/marketing-profile.entity.ts`
  - Why: define the org-owned marketing profile persistence contract.
  - Risk: High
  - Protected: Yes

- `backend/src/database/entities/marketing-connected-channel.entity.ts`
  - Why: define the org-owned marketing channel connection contract.
  - Risk: High
  - Protected: Yes

- `backend/src/database/entities/marketing-opportunity.entity.ts`
  - Why: define the org-owned marketing opportunity contract.
  - Risk: High
  - Protected: Yes

## Protected-Area Disclosure
Protected areas touched in this phase:
- app/module wiring
- database/entities
- API routing at the controller level

Why protected areas are required:
- the frontend shell needs a real office entry point
- the backend needs a real module boundary so `/marketing` is not a fake UI-only surface
- the data layer needs organization-owned contracts so future phases do not start with tenant ambiguity

What can break:
- backend bootstrap if module registration is wrong
- backend startup if entity registration is invalid
- office navigation if the shell link is malformed
- authenticated route loading if the new page uses the wrong server-side guard

## Tenant-Safety Rules
- every marketing record must be organization-owned
- no cross-organization queries are allowed
- Phase 1 API responses must derive organization context from the authenticated actor
- no global marketing records are allowed in this phase
- the route family must remain office-side only

## Test Plan
- load `/marketing` while signed out and confirm it redirects to login through the page guard
- load `/marketing` while signed in as an allowed office role and confirm the Growth Center renders
- load `/marketing/opportunities`, `/marketing/create`, `/marketing/calendar`, `/marketing/campaigns`, `/marketing/channels`, `/marketing/automations`, `/marketing/analytics`, and `/marketing/settings`
- confirm the office nav highlights Growth Center correctly
- confirm the backend foundation endpoint returns the active organization context
- run backend build
- run frontend build

## Rollback Point
Rollback point:
Remove the Growth Center nav link, delete the new `/marketing` frontend route family and workspace, unregister the backend marketing module, and remove the marketing entities from TypeORM registration.

Rollback method:
Revert only the files listed in this execution artifact.

## Stop Conditions
- any requirement expands into later-phase marketing behavior
- a migration becomes mandatory for this slice to boot
- a shared auth file outside this approved inventory becomes necessary
- existing dirty files in login/auth flows become entangled with this work

## What Must Remain Untouched
- Gate 11-14 closeout artifacts
- owner launch activation artifacts
- login/signup/auth files already carrying unrelated local changes unless they become explicitly approved later
- public marketing site route group under `frontend/app/(marketing)` for this phase

## Acceptance Criteria
- the authenticated Growth Center exists at `/marketing`
- approved sub-routes resolve inside the office shell
- the Growth Center clearly identifies Phase 1 as a foundation-only slice
- the backend returns an organization-scoped foundation response
- initial marketing persistence contracts exist and are organization-owned
- no later-phase behavior is implemented
