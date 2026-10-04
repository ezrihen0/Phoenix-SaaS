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
- **Technicians** — `ensureTechnicianForOrganizationMembership` (`backend/src/crm/technician-membership-link.ts`) creates tenant-scoped technician roster rows per org when system role is `technician`.
- **Seats** — per-org seat checks inside a single DB transaction; seat-limit failure rolls back user/membership/technician writes.
- **Frontend** — Settings → Team & Permissions Add User flow: Organization Access step (single vs multiple), organization names (not raw UUIDs), confirm summary; reload after create.

## Tests

- `backend/src/team/team-rbac-contract-check.ts`
- `backend/src/database/team-rbac-smoke.ts` — includes multi-org create, unauthorized org injection, seat-limit rollback, existing-user reuse, role conflict, deduplicated org IDs, custom-role multi-org rejection, and partial membership preservation scenarios (Org B entitlement restored after seat-limit test for fixture isolation).

## Commands

```bash
npm run migration:run --workspace backend
npm run team:rbac:contract-check --workspace backend
npm run team:rbac:smoke --workspace backend
npm run build --workspace backend
npm run build --workspace frontend
```
