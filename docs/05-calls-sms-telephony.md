# Calls, SMS, Telephony

## OwnedPhoneNumber Organization Ownership

- Phone numbers belong to specific organizations
- Number assignment prevents conflicts across tenants
- Organization admins manage their phone numbers
- Platform can allocate numbers to organizations

## Inbound Webhook Organization Resolution

- Webhooks receive calls/SMS to specific numbers
- Receiving number maps to owning organization
- Webhook processing scoped to organization context
- Unknown numbers logged but not processed

## Outbound Verification

- Outbound calls/SMS check sending number ownership
- User must have active organization membership
- Sending number must belong to active organization
- Unauthorized sends blocked with error

## Organization-Owned Communication Entities

- RecentCall: Scoped to organization, tracks inbound/outbound
- TxtConversation: Organization-specific message threads
- TxtMessage: Individual messages within conversations
- CallbackTask: Organization-scheduled follow-ups

## No Global Inbox

- No platform-level call or SMS inbox
- All communications isolated to organization
- Users see only their organization's communications
- Cross-organization communication forbidden

## Stop Conditions

- Stop if calls/SMS leak between organizations
- Halt if webhooks process without organization validation

## Pass Criteria

- Phone numbers assigned to organizations
- Inbound webhooks resolve organization correctly
- Outbound sends validated against organization
- All communication entities filtered by organizationId