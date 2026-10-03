# Team & Permissions V1 — Implementation Summary

Current RBAC / operational-access operating truth: [WizField_Master_Source_of_Truth.md](WizField_Master_Source_of_Truth.md) §5.  
`TeamController` is protected by session plus global `GlobalOperationalAccessGuard` (`APP_GUARD`). This file remains implementation detail, not a second SoT.

## Existing RBAC findings

See [TEAM_PERMISSIONS_V1_RBAC_AUDIT.md](./TEAM_PERMISSIONS_V1_RBAC_AUDIT.md).

## Schema / migration

- `1779715000000-team-permissions-v1.ts`
- `organization_team_entitlements` (`max_users`, default 5)
- `organization_custom_roles`
- `team_rbac_audit_events`
- `memberships.custom_role_id`, `memberships.custom_permission_keys`

## User limit location

- Default: `backend/src/team/team-entitlements.ts` (`DEFAULT_MAX_USERS = 5`)
- Enforcement: `backend/src/team/team-seat-enforcement.ts`
- Persisted per org: `organization_team_entitlements.max_users`

## Role → permission matrix

Canonical source remains `backend/src/auth/permissions.ts` (`rolePermissionMap`).

V1 adds `team.view`, `team.invite`, `team.manage`, `billing.view` to the registry. Admin receives team.*; owner receives all permissions.

## Compatibility decisions

- Existing role identifiers unchanged (`office_admin`, `csr`, `viewer`, etc.)
- Product label **Office / CSR** maps to `office_admin`
- Legacy `/api/auth/staff` retained; accepts `team.*` or `system.roles.manage`
- `loadActorContext` resolves effective permissions from membership custom role/permissions

## Multi-organization user access (V1)

- **`GET /api/team/organizations`** — lists organizations the actor may manage for team invite (`team.invite` per org); session/active org remains authoritative for operational context.
- **`POST /api/team/members`** — optional `organizationIds` array; omission preserves single-active-org create behavior (one membership on the session organization).
- **Authorization** — every requested organization is validated server-side; frontend UUIDs are not trusted. Actor must hold `team.invite` on each target org.
- **Existing-user reuse** — when email matches an existing User in scope, attach missing memberships only (no duplicate User/Profile); password/profile updates from the request are not applied on reuse; role conflicts across orgs are rejected.
- **Custom roles** — `customRoleId` with multiple `organizationIds` returns `multi_org_custom_role_not_supported` (custom roles stay org-scoped).
- **Technicians** — tenant-scoped `technicians` rows are created or reactivated only through explicit write paths (`createMember`, Edit member with `assignableToJobs: true`, legacy staff create). Read-time roster provisioning was removed from CRM GET handlers.
- **Job assignment eligibility** — `memberships.assignable_to_jobs` (nullable boolean until backfill). Technician preset defaults to `true` on create; other roles default to `false`. Role changes do not auto-flip the flag unless Edit sends a new value. Saved `false` is **always** enforced server-side for new job assignments (list filter + PATCH assert), independent of `TEAM_ASSIGNMENT_ELIGIBILITY_MODE`. Mode `enforce` treats legacy `NULL` as ineligible for assignment selectors; `off`/`shadow` keep legacy NULL visible until backfill.
- **Technician list purpose** — `GET /api/technicians?purpose=assignment|roster` (default `assignment`). Schedule/dispatch use `roster`; job/call/inventory selectors use `assignment`.
- **Edit member (gated)** — `TEAM_MEMBER_EDIT_UI_ENABLED=true` enables `GET/PATCH /api/team/members/:profileId` and `POST .../reset-password`. Production keeps this `false` until rollout. Upcoming-job warning is client-side before save when disabling eligibility; server stores the denial regardless.
- **Password reset (admin)** — cross-membership protected roles (owner, admin, custom owner-level permissions) enforced in `team-role-privilege.ts`; sessions invalidated on success (`auth_sessions` delete). No password material in audit metadata.
- **Legacy staff role** — `PATCH /api/auth/staff/:profileId/role` delegates to `TeamService.updateMemberAccess` (membership-scoped; does not write global `profiles.role` on org access update).
- **Seats** — per-org seat checks inside a single DB transaction; seat-limit failure rolls back user/membership/technician writes.
- **Frontend** — Settings → Team & Permissions: Add User includes assignable toggle; Edit opens when `teamMemberEditEnabled` from summary.

## Schema / migration (assignment eligibility)

- `1793000000000-membership-assignable-to-jobs.ts` — `memberships.assignable_to_jobs` nullable boolean

## Staging rollout scripts

- `npm run team:assignment-eligibility:report --workspace backend` — NULL/true/false counts per org
- `npm run team:assignment-eligibility:backfill --workspace backend -- --dry-run` then `--apply` (owner-approved, staging/dev only)

## Tests

- `backend/src/team/team-rbac-contract-check.ts`
- `backend/src/team/team-assignment-eligibility-unit-check.ts` — explicit denial, mode defaults, password-reset privilege matrix
- `backend/src/database/team-rbac-smoke.ts` — includes multi-org create, unauthorized org injection, seat-limit rollback, existing-user reuse, role conflict, deduplicated org IDs, custom-role multi-org rejection, and partial membership preservation scenarios (Org B entitlement restored after seat-limit test for fixture isolation).

## Commands

```bash
npm run migration:run --workspace backend
npm run team:rbac:contract-check --workspace backend
npm run team:assignment-eligibility:unit-check --workspace backend
npm run team:rbac:smoke --workspace backend
npm run build --workspace backend
npm run build --workspace frontend
```
