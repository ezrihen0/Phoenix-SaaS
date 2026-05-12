# Auth, Users, Organizations, Roles

## Auth Resolution Requirements

- Authentication must resolve: actor (user), userId, membershipId, organizationId, role, permissions
- Every request context includes full organization membership details
- Permissions are role-based within organization scope
- Invalid organization access returns 403 Forbidden

## Role Belongs to Membership

- Roles are assigned per membership, not globally to user
- Same user can have different roles in different organizations
- Role changes affect only that organization's membership
- Permissions cascade from role to membership

## User Multiple Organizations

- Users can join multiple organizations via memberships
- Each membership has unique role within organization
- User switches active organization via activeOrgId
- Membership history tracks join/leave dates

## Backend Organization Membership Verification

- All API endpoints validate organizationId against user's memberships
- Backend rejects requests where user lacks membership in organizationId
- Membership status must be active (not suspended/expired)
- Audit logs record organization access attempts

## Frontend Not Trusted for orgId

- Frontend cannot set organizationId without backend validation
- All organization-specific requests include orgId in payload
- Backend re-validates orgId on every request
- No implicit organization context from frontend state

## Stop Conditions

- Stop if auth fails to resolve organization context
- Halt if frontend can bypass organization validation

## Pass Criteria

- Auth middleware populates organization context
- All endpoints validate organization membership
- Role-based permissions enforced per organization
- Frontend sends orgId with all tenant requests