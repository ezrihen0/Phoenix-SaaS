# Platform Foundation

## Platform vs Tenant Boundary

- Platform: Global infrastructure, super-admin access, cross-tenant operations
- Tenant: Organization-specific data, tenant-admin access, isolated operations
- Platform code handles organization creation/management
- Tenant code operates within organization context only

## Organization Model

- Organizations have: id, name, createdAt, updatedAt
- Organizations are the top-level tenant boundary
- All business data belongs to exactly one organization
- Organization creation requires platform-level approval

## User / Membership / Role Model

- Users: Global identity with email, password, profile
- Memberships: Link users to organizations with specific roles
- Roles: Define permissions within an organization (admin, user, etc.)
- Users can have multiple memberships across organizations

## activeOrgId Rule

- Every authenticated request must specify activeOrgId
- Backend validates user has membership in activeOrgId
- Frontend stores activeOrgId in session/context
- API calls must include organizationId parameter

## Super-Admin vs Tenant-Admin Boundary

- Super-admin: Platform-level, manages organizations, global settings
- Tenant-admin: Organization-level, manages org users/settings/data
- Super-admin can access all organizations
- Tenant-admin limited to their organization only

## Tenant Isolation Principles

- Never query data without organizationId filter
- All entities must have organizationId foreign key
- Cross-organization data access is forbidden
- Audit logs must track organization context

## Billing Later, Not Before Tenant Foundation

- Implement tenant isolation before billing features
- Billing will use organizationId for tenant-specific pricing
- No billing code until organization ownership is complete

## Stop Conditions

- Stop if organization model changes required
- Halt if activeOrgId validation fails in any API

## Pass Criteria

- Organization table created with proper constraints
- User/Membership/Role tables designed and linked
- Backend validates activeOrgId on all requests
- Frontend enforces organization context