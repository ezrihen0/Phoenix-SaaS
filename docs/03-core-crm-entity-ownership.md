# Core CRM Entity Ownership

## Organization-Owned Entities

All core CRM entities must belong to an organization:

- Customer
- Lead
- Job
- Estimate
- Invoice
- InvoicePayment
- RecentCall
- TxtConversation
- TxtMessage
- PricebookItem
- InventoryItem
- Technician
- Inspection
- Report
- WarrantyCertificate
- AutomationRule
- AutomationRun
- OwnedPhoneNumber
- CallbackTask

## Never Fetch by ID Only

- All entity queries must include organizationId filter
- API endpoints require organizationId parameter
- Direct ID lookups return 404 if organization mismatch
- No global entity access allowed

## CRUD Operations Filter by organizationId

- Create: Set organizationId from request context
- Read: Filter by organizationId
- Update: Verify organizationId matches before update
- Delete: Soft delete or hard delete within organization
- List/Count: Always scoped to organizationId

## TypeORM-First Ownership Direction

- Add organizationId column to all entity tables via TypeORM migrations
- Create TypeORM entities with organizationId relations
- Implement repository methods with organization filtering
- Existing Prisma data remains read-only during transition

## Migration/Backfill Concept Only

- Plan data migration to populate organizationId for existing records
- Backfill scripts will assign organizationId based on business rules
- Migration runs in maintenance window
- No live code changes until migration complete

## Stop Conditions

- Stop if any entity lacks organizationId enforcement
- Halt if cross-organization data leakage detected

## Pass Criteria

- All listed entities have organizationId columns
- TypeORM repositories filter by organizationId
- API endpoints validate organization ownership
- Migration plan documented and reviewed