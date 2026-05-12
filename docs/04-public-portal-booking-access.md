# Public Portal Booking Access

## Public Booking Organization Resolution

- Public booking URLs must include organization identifier
- Booking requests resolve organization before processing
- Organization context applied to all booking operations
- Invalid organization returns booking unavailable

## Portal Tokens Organization-Bound

- Portal access tokens linked to specific organization
- Tokens generated per organization with expiration
- Token validation includes organization verification
- Compromised tokens affect only issuing organization

## Link Resolution Chain

- Quote/payment/report/warranty links use tokens
- Token resolves to organizationId
- organizationId + resourceId validates access
- Public access fails without valid token chain

## Expired/Invalid Tokens

- Tokens have configurable expiration (default 30 days)
- Expired tokens return access denied
- Invalid tokens logged for security review
- Token revocation possible per organization

## Public Routes ID Safety

- Public endpoints never accept bare resource IDs
- All public fetches require token-validated organizationId
- Direct ID access returns 404 or access denied
- No public API exposes internal entity relationships

## Stop Conditions

- Stop if public booking bypasses organization validation
- Halt if token compromise affects multiple organizations

## Pass Criteria

- Public booking URLs resolve organization correctly
- Portal tokens validated with organization context
- All public links use secure token resolution
- No bare ID access in public routes