# Team & Permissions V1 — Implementation Summary

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

## Tests

- `backend/src/team/team-rbac-contract-check.ts`
- `backend/src/database/team-rbac-smoke.ts`

## Commands

```bash
npm run migration:run --workspace backend
npm run team:rbac:contract-check --workspace backend
npm run team:rbac:smoke --workspace backend
npm run build --workspace backend
npm run build --workspace frontend
```
