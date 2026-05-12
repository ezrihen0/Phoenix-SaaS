# TypeORM Entity Ownership Audit

## Executive Summary

This audit classifies all active TypeORM entities in Phoenix_SaaS for tenant ownership. 7 entities already have organization_id (automation module). All others lack organizationId. Core CRM entities require organization ownership for SaaS isolation. Automation entities are already tenant-ready. Platform entities (User) remain global.

## Locked ORM Decision

- TypeORM is the active ORM for Phoenix_SaaS conversion.
- Prisma is frozen / reference-only.
- Do not migrate to Prisma during SaaS surgery.
- Do not use Prisma schema as runtime source of truth.
- All tenant ownership work must happen through TypeORM entities, TypeORM migrations, NestJS services, controllers, and query filters.

## Entity Classification Rules

1. Platform-owned: Global infrastructure, users, sessions
2. Organization-owned: CRM data, settings, inventory per tenant
3. Membership-owned: User-organization relationships
4. User-owned: User profiles, preferences
5. Public-access resource: Portal tokens, public links
6. Immutable snapshot: Historical data copies
7. Integration/provider-owned: External service data
8. Unknown / needs owner decision: Unclear ownership

## P0 Organization-Owned Entities

| Entity | File Path | Current organizationId | SaaS Target | Risk | Why | Action | Gate |
|--------|-----------|-------------------------|-------------|------|------|--------|------|
| CustomerEntity | backend/src/database/entities/customer.entity.ts | missing | organization-owned | Critical | Core customer data must be tenant-isolated | Add organizationId, filter all queries | Gate 4 P0 |
| LeadEntity | backend/src/database/entities/lead.entity.ts | missing | organization-owned | Critical | Lead management per organization | Add organizationId, filter all queries | Gate 4 P0 |
| JobEntity | backend/src/database/entities/job.entity.ts | missing | organization-owned | Critical | Service jobs belong to organization | Add organizationId, filter all queries | Gate 4 P0 |
| InvoiceEntity | backend/src/database/entities/invoice.entity.ts | missing | organization-owned | Critical | Billing data tenant isolation | Add organizationId, filter all queries | Gate 4 P0 |
| InvoicePaymentEntity | backend/src/database/entities/invoice-payment.entity.ts | missing | organization-owned | Critical | Payment records per organization | Add organizationId, filter all queries | Gate 4 P0 |
| RecentCallEntity | backend/src/database/entities/recent-call.entity.ts | missing | organization-owned | Critical | Call logs tenant isolation | Add organizationId, filter all queries | Gate 4 P0 |
| OrganizationSettingEntity | backend/src/database/entities/organization-setting.entity.ts | missing | organization-owned | High | Organization branding/settings | Add organizationId, filter all queries | Gate 4 P0 |

## P1 Organization-Owned Entities

| Entity | File Path | Current organizationId | SaaS Target | Risk | Why | Action | Gate |
|--------|-----------|-------------------------|-------------|------|------|--------|------|
| QuoteEntity | backend/src/database/entities/quote.entity.ts | missing | organization-owned | High | Quotes per organization | Add organizationId, filter all queries | Gate 4 P1 |
| QuoteLineItemEntity | backend/src/database/entities/quote-line-item.entity.ts | missing | organization-owned | High | Quote details tenant isolation | Add organizationId, filter all queries | Gate 4 P1 |
| InvoiceLineItemEntity | backend/src/database/entities/invoice-line-item.entity.ts | missing | organization-owned | High | Invoice details per organization | Add organizationId, filter all queries | Gate 4 P1 |
| TechnicianEntity | backend/src/database/entities/technician.entity.ts | missing | organization-owned | High | Staff management per tenant | Add organizationId, filter all queries | Gate 4 P1 |
| InventoryItemEntity | backend/src/database/entities/inventory-item.entity.ts | missing | organization-owned | High | Inventory tracking tenant isolation | Add organizationId, filter all queries | Gate 4 P1 |
| InventoryLocationEntity | backend/src/database/entities/inventory-location.entity.ts | missing | organization-owned | High | Warehouse locations per org | Add organizationId, filter all queries | Gate 4 P1 |
| InventoryMovementEntity | backend/src/database/entities/inventory-movement.entity.ts | missing | organization-owned | High | Stock movements tenant isolation | Add organizationId, filter all queries | Gate 4 P1 |
| PricebookItemEntity | backend/src/database/entities/pricebook-item.entity.ts | missing | organization-owned | High | Pricing per organization | Add organizationId, filter all queries | Gate 4 P1 |
| PricebookBundleEntity | backend/src/database/entities/pricebook-bundle.entity.ts | missing | organization-owned | High | Service bundles per tenant | Add organizationId, filter all queries | Gate 4 P1 |
| PricebookBundleItemEntity | backend/src/database/entities/pricebook-bundle-item.entity.ts | missing | organization-owned | High | Bundle details tenant isolation | Add organizationId, filter all queries | Gate 4 P1 |
| ServiceEntity | backend/src/database/entities/service.entity.ts | missing | organization-owned | High | Service offerings per org | Add organizationId, filter all queries | Gate 4 P1 |
| InspectionEntity | backend/src/database/entities/inspection.entity.ts | missing | organization-owned | Medium | Inspection reports per tenant | Add organizationId, filter all queries | Gate 4 P1 |
| InspectionItemEntity | backend/src/database/entities/inspection-item.entity.ts | missing | organization-owned | Medium | Inspection details tenant isolation | Add organizationId, filter all queries | Gate 4 P1 |
| InspectionPhotoEntity | backend/src/database/entities/inspection-photo.entity.ts | missing | organization-owned | Medium | Photo storage per organization | Add organizationId, filter all queries | Gate 4 P1 |
| InspectionRequiredFieldEntity | backend/src/database/entities/inspection-required-field.entity.ts | missing | organization-owned | Medium | Inspection templates per org | Add organizationId, filter all queries | Gate 4 P1 |
| JobNoteEntity | backend/src/database/entities/job-note.entity.ts | missing | organization-owned | Medium | Job notes tenant isolation | Add organizationId, filter all queries | Gate 4 P1 |
| JobStatusEventEntity | backend/src/database/entities/job-status-event.entity.ts | missing | organization-owned | Medium | Status tracking per organization | Add organizationId, filter all queries | Gate 4 P1 |

## Platform-Owned Entities

| Entity | File Path | Current organizationId | SaaS Target | Risk | Why | Action | Gate |
|--------|-----------|-------------------------|-------------|------|------|--------|------|
| UserEntity | backend/src/database/entities/user.entity.ts | not applicable | platform-owned | Low | Global user identities | No change needed | No tenant change |

## Membership/User-Owned Entities

| Entity | File Path | Current organizationId | SaaS Target | Risk | Why | Action | Gate |
|--------|-----------|-------------------------|-------------|------|------|--------|------|
| ProfileEntity | backend/src/database/entities/profile.entity.ts | not applicable | user-owned | Low | User profile data | No change needed | No tenant change |
| AuthSessionEntity | backend/src/database/entities/auth-session.entity.ts | not applicable | user-owned | Low | User authentication sessions | No change needed | No tenant change |

## Public-Access / Token Entities

| Entity | File Path | Current organizationId | SaaS Target | Risk | Why | Action | Gate |
|--------|-----------|-------------------------|-------------|------|------|--------|------|
| PortalMagicLinkEntity | backend/src/database/entities/portal-magic-link.entity.ts | missing | public-access resource | Medium | Public portal access tokens | Add organizationId via customer relation, validate tokens | Gate 4 P1 |
| PortalSessionEntity | backend/src/database/entities/portal-session.entity.ts | missing | public-access resource | Medium | Portal user sessions | Add organizationId via token resolution | Gate 4 P1 |
| PortalAccessEventEntity | backend/src/database/entities/portal-access-event.entity.ts | missing | public-access resource | Low | Portal access logging | Add organizationId via session | Later gate |

## Immutable Snapshot Entities

| Entity | File Path | Current organizationId | SaaS Target | Risk | Why | Action | Gate |
|--------|-----------|-------------------------|-------------|------|------|--------|------|
| (None identified) | - | - | - | - | - | - | - |

## Integration Entities

| Entity | File Path | Current organizationId | SaaS Target | Risk | Why | Action | Gate |
|--------|-----------|-------------------------|-------------|------|------|--------|------|
| (None identified) | - | - | - | - | - | - | - |

## Unknown / Needs Decision

| Entity | File Path | Current organizationId | SaaS Target | Risk | Why | Action | Gate |
|--------|-----------|-------------------------|-------------|------|------|--------|------|
| CrmTaskEntity | backend/src/database/entities/crm-task.entity.ts | present | organization-owned | Medium | Task management - confirm ownership | Verify organization_id usage | Gate 4 P1 |

## Missing organizationId Summary

- 29 entities missing organizationId
- 7 entities have organizationId (automation module)
- 2 entities not applicable (platform/user-owned)
- Total entities audited: 38

## Gate 4 Recommended Package Boundary

Do not include every entity in the first database package. Recommend P0 first only:

- Customer
- Lead
- Job
- Estimate (if exists)
- Invoice
- InvoicePayment
- RecentCall
- TxtConversation (if exists)
- TxtMessage (if exists)
- OrganizationSetting

P1 entities can follow in subsequent packages after P0 validation.

## Stop Conditions

- Stop if any P0 entity lacks organizationId enforcement
- Halt if cross-organization data access detected
- Pause if automation organization_id conflicts with new schema

## Pass Criteria

- All P0 entities have organizationId columns
- TypeORM repositories filter by organizationId
- API endpoints validate organization ownership
- Automation entities remain functional