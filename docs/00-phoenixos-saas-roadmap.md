# PhoenixOS SaaS Roadmap

## Gate Roadmap

- **Gate 0**: Repo Safety + Build Baseline
- **Gate 1**: SaaS Source of Truth Lock
- **Gate 2**: TypeORM Direction Lock
- **Gate 3**: Auth, ActorContext, Membership, activeOrgId
- **Gate 4**: Organization Entity Ownership in TypeORM
- **Gate 5**: Core Query Isolation
- **Gate 6**: Search + Dashboard Isolation
- **Gate 7**: Self-Serve + Portal/Public Access Isolation
- **Gate 8**: Calls/SMS/Webhook Organization Routing
- **Gate 9**: Settings + Branding + Document Snapshots
- **Gate 10**: Full Engine SaaS Conversion
- **Gate 11**: Multi-Business User Experience
- **Gate 12**: Beta Readiness + Security Audit
- **Gate 13**: Billing + Plan Enforcement
- **Gate 14**: Launch Preparation

## TypeORM Direction Lock

- TypeORM is the active ORM and execution path.
- Prisma is frozen / ignored / reference-only.
- Do not use Prisma for active reads, writes, migrations, or dual-runtime planning during SaaS surgery.
- Do not create TypeORM alongside Prisma as a dual-read strategy.
- Tenant ownership work must happen in TypeORM entities, TypeORM migrations, NestJS services, controllers, and query filters.

## Prisma Frozen / Reference-Only

- Prisma is frozen / ignored / reference-only.
- Prisma must not be used for active reads, writes, migrations, or runtime query planning during SaaS surgery.
- Do not create a dual-runtime Prisma + TypeORM transition path.
- Do not phase from Prisma to TypeORM during this SaaS conversion; TypeORM is already the active execution path.
- Prisma may only be consulted as a historical/reference schema, not as an implementation source of truth.

## No Global Phoenix Rename

- Do not rename "Phoenix" globally in branding or code
- Classify all Phoenix references before any changes
- Platform-level branding remains "Phoenix"
- Tenant-level branding is configurable per organization

## No Code Before Source-of-Truth Approval

- No backend, frontend, or database code changes until all gate documents are approved
- Documentation must be complete and reviewed before implementation begins
- Each gate requires explicit approval before proceeding

## Every Package Must Have File Approval Before Coding

- Create implementation plan documents for each package
- Get approval on package-level files before writing code
- Package files must detail: entities, migrations, API endpoints, frontend components

## Stop Conditions

- Halt all development if roadmap deviates
- Require re-approval if major changes needed
- No code commits without corresponding approved documentation

## Pass Criteria

- Gate 1/2 pass requires approved SaaS source-of-truth documents and the TypeORM entity ownership audit
- No backend, frontend, database, Prisma, entity, or migration code changes
- No unauthorized Phoenix renames
- Zero code changes before Gate 1 approval
