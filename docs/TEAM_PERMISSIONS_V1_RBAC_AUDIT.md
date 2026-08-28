# Team & Permissions V1 — Pre-Implementation RBAC Audit

Generated before Team & Permissions V1 implementation.

## Architecture (preserved)

- **User** → global auth identity (`users`)
- **Profile** → global profile row (`profiles.role` — legacy, synced on team changes)
- **Membership** → org-scoped role authority (`memberships.role`, `status`)
- **Session** → `auth_sessions.active_organization_id` resolves tenant context
- **ActorContext** → `membership.role` drives `permissions[]` via `listPermissionsForRole()`

## Existing roles (unchanged identifiers)

| Backend ID | Product label |
|------------|---------------|
| `owner` | Owner |
| `admin` | Admin |
| `office_admin` | Office / CSR |
| `dispatcher` | Dispatcher |
| `csr` | CSR (legacy preset, kept) |
| `technician` | Technician |
| `viewer` | Viewer (legacy read-only, kept) |

## Permission keys (50 today)

Canonical source: `backend/src/auth/permissions.ts` — `roleModePermissions`.

Team V1 adds: `team.view`, `team.invite`, `team.manage`, `billing.view` (aliases wired to existing checks where applicable).

## Direct role-string checks (compatibility debt)

- Growth Center: `marketing-access.ts`, `marketing.service.ts`
- AI chat/usage: hard-coded owner/admin sets
- Language store manage: owner/admin only
- Frontend: `shell-nav-policy.ts`, route guards, settings visibility

**Decision:** Extend permission registry; do not remove role strings in unrelated modules in this phase.

## Staff creation today

- `POST /api/auth/staff` — owner-only via `system.roles.manage`
- No user limit enforcement
- `updateStaffRole` updated membership only (profile drift) — **fixed in V1**

## Entitlements vs RBAC

- Plan org limits: `billing.constants.ts` (`organization_limit` for businesses)
- Feature gates: `EntitlementService` (automations, inventory, pricebook)
- **New:** `maxUsers` capability (default 5) separate from plan org count

## Gaps addressed by V1

1. Centralized `maxUsers` entitlement with backend enforcement
2. Custom roles (org-scoped reusable permission sets)
3. Membership-level custom permissions / custom role assignment
4. Team audit log for RBAC changes
5. Settings → Team & Permissions UI with responsibility-based recommendations
6. Owner protection (final owner, no owner demotion via custom editor)
