# WIZFIELD — FULL SYSTEM ARCHITECTURE & RUNTIME AUDIT

> **HISTORICAL AUDIT EVIDENCE (2026-08-27).**  
> Original findings below are retained for traceability. They are **not** the current production verdict.  
> **Current closeout:** [docs/audit/production-2026-09/WIZFIELD_PRODUCTION_CLOSEOUT.md](docs/audit/production-2026-09/WIZFIELD_PRODUCTION_CLOSEOUT.md) — **CONDITIONAL GO**.  
> **Current product truth:** [docs/WizField_Master_Source_of_Truth.md](docs/WizField_Master_Source_of_Truth.md).  
> Closed later: TXT tenant isolation, operational-access APP_GUARD, disabled-user sessions, booking durability, payment integrity, and related P0/P1/P2 items. Do not rewrite the original finding text.

Audit date: 2026-08-27  
Audited branch / revision: `SaaS-master` / `d115a54`  
Audited state: current dirty worktree, including tracked and untracked files  
Audit mode: inspection and non-destructive verification only

Supersession note (2026-09-02 pre-audit Stripe removal): Stripe checkout, Stripe webhook runtime handling, Stripe SDK wiring, and Stripe production secret requirements have been removed from the active WizField runtime after this audit artifact was written. Treat Stripe findings below as historical pre-removal context unless a line explicitly describes preserved schema/migration history.

Supersession note (2026-09-03 production closeout): the **NOT LAUNCH READY** / TXT / unpaid-API verdicts below are historical. Final engineering closeout found no remaining engineering NO-GO blocker; remaining items are owner activation conditions.

Evidence labels used below:

- **Runtime-confirmed** — observed in this audit by executing the current code.
- **Static-confirmed** — directly established from current source, schema, migrations, or configuration.
- **External-config-required** — implementation exists, but a provider account, secret, deployment, or live callback is required.
- **Not verified** — evidence was insufficient to claim operation.

## 1. Executive Verdict

WizField is a substantial, buildable SaaS application, not a documentation-only prototype. The current worktree contains a broad CRM, inspections, pricebook, inventory, billing, customer portal, public booking, telephony, messaging, marketing, Language Store, and AI implementation. The local MySQL schema is current, both production builds pass, and all executed tenant-isolation smoke suites pass.

The system is nevertheless **not safe for multi-tenant production launch in its current state**.

The decisive blocker is the newer TXT conversation system under `backend/src/messaging/txt/`. It has no organization key on conversations or messages, lists and opens conversations globally, resolves short links globally, mutates read state by globally addressable conversation IDs, and performs inbound customer matching across all organizations. Its outbound path also upserts the configured sending number without an acting organization and can clear that number's `tenant_id`. These facts directly contradict the canonical claim that no tenant-crossing communications inbox exists.

Two additional launch blockers are independent of TXT:

1. Application startup creates or ensures a bootstrap owner using source-code default credentials when environment overrides are absent.
2. Unpaid-account access is enforced by Next.js route redirects, not by a backend-wide billing guard. An authenticated unpaid user can call operational backend APIs directly.

The historical Gate 11–14 and program PASS records are valid as historical evidence for the paths they exercised. They are not a current whole-system security verdict. In particular, the passing `telephony-messaging:isolation:smoke` tests the older organization-derived telephony/SMS services; it does not exercise the unsafe `/api/messaging/txt/*` controller and raw-SQL conversation path.

**Overall verdict: NOT LAUNCH READY.**  
**Controlled single-tenant engineering use: viable with external integrations disabled or tightly controlled.**  
**Multi-tenant beta: blocked until P0 findings are corrected and regression-tested.**

## 2. System Health Score

**57 / 100 — technically substantial, operationally unready**

| Area | Score | Basis |
|---|---:|---|
| Architecture and modularity | 7/10 | Clear NestJS modules and Next.js application boundaries; communications and billing gates contradict the intended architecture. |
| Core CRM/product workflows | 8/10 | Broad implementation, successful builds, and multiple passing database smokes. |
| Tenant isolation | 4/10 | Core and tested paths are strong; the current TXT system is a critical tenant-crossing exception. |
| Authentication and security | 4/10 | Hashed sessions, RBAC, and secure cookie settings exist; default bootstrap credentials, unsigned Twilio intake, and no general rate limiter remain. |
| Database and schema | 7/10 | Migrations and manifest pass; 26 nullable tenant keys, indirect communications ownership, and incomplete manifest coverage weaken guarantees. |
| API contracts | 6/10 | Consistent controllers and response helpers exist; runtime DTO enforcement is inconsistent and duplicate messaging contracts exist. |
| External integrations | 4/10 | Provider adapters are implemented, but no live provider flow was verified and some security/reliability gaps remain. |
| Verification quality | 8/10 | Extensive smoke coverage passed; the unsafe TXT path and several modules lack equivalent coverage. |
| Operations and launch controls | 4/10 | Build/rebuild guidance exists; production monitoring, provider activation, durable file storage, and cleanup require work. |
| Documentation accuracy | 5/10 | Canonical docs are detailed but overstate current communications isolation and hard billing enforcement. |

## 3. Architecture Map

### Runtime topology

```text
Browser
  -> Next.js 16 / React 19 frontend
     -> server-side session and role checks
     -> /api proxy / rewrite
        -> NestJS 11 backend
           -> cookie session resolution + ActorContext
           -> module/controller permission checks
           -> TypeORM repositories and raw SQL services
           -> MySQL
           -> Stripe / Telnyx / Twilio / SMTP / DeepSeek / Gemini / Google / Meta
           -> local inspection-photo filesystem
```

### Repository reality

- Frontend: 52 App Router `page.tsx` routes; production build enumerated all expected product and public surfaces.
- Backend: 42 NestJS controllers.
- Persistence: 78 application tables plus `typeorm_migrations`.
- ORM: 65 entity files in `backend/src/database/entities/`, plus the three messaging entities outside that directory.
- Migrations: 30 active TypeORM migrations.
- Configuration: environment-driven database, billing, communications, AI, OAuth, mail, and feature flags.
- Current worktree: dirty. It includes field-knowledge additions, AI check files, AI UI files, duplicate review-package documents, and runtime-review artifacts that are not part of `HEAD`.

### Domain ownership and dependencies

| Domain | Primary code | Data / external dependency |
|---|---|---|
| Auth and organizations | `backend/src/auth/` | `users`, `profiles`, `memberships`, `auth_sessions`, `organizations` |
| Core CRM | `backend/src/crm/`, `search/`, `settings/` | customers, leads, jobs, quotes, invoices, payments, tasks, settings |
| Inspections | `backend/src/inspections/` | inspections, items, fields, photos; local photo storage |
| Pricebook and inventory | `backend/src/pricebook/`, `inventory/` | pricebook, bundles, stock locations and movements |
| Billing | `backend/src/billing/` | shared billing accounts, Stripe, Language Store entitlement projection |
| Portal and public booking | `customer-portal/`, `public/` | scoped tokens/sessions/events and organization slugs |
| Legacy telephony/SMS | `backend/src/telephony/` | Telnyx, Twilio, recent-call and SMS-log tables |
| New TXT messaging | `backend/src/messaging/txt/` | Telnyx and globally keyed TXT conversations/messages |
| Growth Center | `backend/src/marketing/` | Google/Meta OAuth, encrypted channel secrets, publish jobs |
| AI | `backend/src/ai/` | DeepSeek, Telnyx AI, feature flags, recommendation/draft/usage records |
| Language Store | `backend/src/language-store/` and billing services | Gemini, entitlements, preferences, translation records and ledger |

### Important architectural contradiction

Communications have two coexisting data/API systems:

- Organization-derived telephony/SMS APIs in `backend/src/telephony/`, covered by the passing telephony isolation smoke.
- TXT conversation APIs in `backend/src/messaging/txt/`, which are not organization-scoped and are not covered by that smoke.

The presence of a safe older path does not make the newer path safe.

## 4. Feature Reality Matrix

| Product area | Current classification | Evidence and boundary |
|---|---|---|
| Login, logout, sessions | **WORKING WITH CRITICAL CONFIG RISK** | Session hashes, expiry, and HttpOnly/SameSite cookies are implemented. Default bootstrap owner credentials block production readiness. |
| Signup and first organization | **WORKING / PARTIAL LAUNCH** | Transactional user, organization, membership, billing-account, and coverage creation exists. Live Stripe activation was not verified. |
| Organization switching and RBAC | **WORKING** | Active membership/org resolution and permission maps exist; core controllers derive org from session. |
| Password recovery | **BROKEN AS RECOVERY** | `/reset-password` only changes the password of an already authenticated session while displaying “recovery link” language. No forgot-password token/email flow was found. |
| Customers, leads, jobs, services | **WORKING** | Implemented end to end and consistently organization-filtered in reviewed services. Build passes. |
| Search and dashboards | **WORKING / STATIC-CONFIRMED** | Organization-aware queries exist; historical runtime evidence exists, but no HTTP end-to-end replay was performed in this audit. |
| Estimates, invoices, payments | **WORKING / EXTERNAL DELIVERY PARTIAL** | Core records and snapshot rules exist; document snapshot isolation passed. SMTP/customer delivery requires external configuration. |
| Warranty certificates | **WORKING / STATIC-CONFIRMED** | Backend, portal endpoint, and frontend routes compile; no full live delivery replay. |
| Inspections | **WORKING** | Isolation smoke passed all listed create, cross-org, photo, workspace, and PDF assertions. Some report types intentionally fail closed until templates exist. |
| Pricebook and bundles | **WORKING** | Cross-org and nested-item document snapshot checks passed. |
| Inventory | **PARTIAL VERIFICATION** | Implementation and plan enforcement exist; no dedicated current isolation smoke was found or run. |
| CRM automations | **PARTIAL** | Rules, runs, scheduling, pending actions, and logs exist. No production scheduler/delivery replay was performed. |
| Customer portal | **WORKING** | Token/session model is organization/resource-scoped; `portal:scope-check` passed. |
| Public booking | **WORKING WITH ABUSE RISK** | Public booking isolation smoke passed. No application-level request throttling was found. |
| Calls and legacy recent-text views | **WORKING / EXTERNAL-CONFIG-REQUIRED** | Telephony isolation smoke passed 9a–9d and related call/SMS assertions. Live Telnyx operation was not verified. |
| New TXT inbox and threads | **BROKEN FOR MULTI-TENANCY** | Global conversation listing, lookup, message access, unread totals, state changes, short links, and inbound customer matching. |
| Outbound TXT | **BROKEN TENANT OWNERSHIP CONTRACT** | Customer lookup uses the active org, but configured sender upsert can clear `tenant_id`; unknown-number send has no tenant attribution. |
| Call-flow and missed-call settings | **PARTIAL / GLOBAL** | Role-gated but singleton/global rather than organization-scoped. |
| Twilio inbound SMS | **IMPLEMENTED BUT UNSAFE** | Public controller is active and accepts unsigned request bodies. |
| Stripe platform billing | **PARTIAL** | Signature verification and shared-account model exist. Live Stripe is unverified; event ordering/idempotency and backend access enforcement are incomplete. |
| Growth Center | **CODE-COMPLETE / LIVE INTEGRATIONS NOT VERIFIED** | Phases, APIs, data model, and frontend exist. Google/Meta OAuth and publishing require live credentials and provider replay. |
| Language Store | **WORKING INTERNALLY / PROVIDER PARTIAL** | All five executed Language Store smokes passed. Live Gemini translation was not exercised. |
| Operator Copilot | **WORKING INTERNALLY / PROVIDER PARTIAL** | Isolation and contract checks passed. Runtime feature flags and provider configuration are required. |
| General AI Chat / AI Actions | **CURRENT WORKTREE WIP** | API/UI code exists; three direct checks passed. Canonical AI source of truth does not yet cover this scope, and related files remain untracked. |
| Field Knowledge | **WORKING CHECKS / DIRTY CONTENT STATE** | Contract, unit, runtime-safety, QA appendix, and adversarial checks passed. New doors/windows content and manifest edits are uncommitted. |
| Localization | **BROKEN PARITY** | Frontend builds, but `i18n:check` fails with 448 missing keys in each of four non-English catalogs. |
| Legal/support/monitoring launch work | **NOT READY** | Canonical owner checklist itself leaves final production activation items open. |

## 5. Critical Findings

### P0-01 — TXT conversations permit tenant-crossing access and attribution

**Evidence:**

- `TxtController.listConversations`, `listConversationMessages`, `markConversationMessagesRead`, `markConversationMessagesUnread`, and `getUnreadSummary` pass no `organizationId`.
- `TxtConversationsService.listRecentConversations` reads every active conversation.
- `listActiveByCustomerId`, `listActiveUnknownByPhoneNormalized`, `getConversationByIdOrCode`, unread updates, and activity updates use globally addressable IDs/phone values.
- `MessagingShortLinkController` authorizes by role only; creation/resolution does not bind to the active organization.
- `TxtService.matchCustomerByPhoneNormalized` reads up to 5,000 customers across all organizations and chooses the most recently updated phone match.
- `txt_conversations` and `txt_messages` have no organization key.
- The existing telephony isolation smoke does not invoke these paths.

**Impact:** Any tenant user with messaging access can see or mutate other tenants' TXT conversations. Inbound messages can be attached to a same-phone customer from the wrong organization. This is a confidentiality and integrity failure.

**Required correction:** Establish one authoritative tenant owner for each owned number/conversation/message; require active-org predicates on every read/write/short-link operation; scope inbound customer matching through the owned number's organization; add negative cross-org tests against the actual `/api/messaging/txt/*` service path.

### P0-02 — Outbound TXT can remove owned-number tenant ownership

**Evidence:**

- `TxtService.sendMessage` calls `OwnedPhoneNumbersService.upsertOwnedPhoneNumber` without `actingOrganizationId`, `organizationId`, or `tenantId`.
- `upsertOwnedPhoneNumber` derives `organizationId = null` and writes `tenant_id = ?` on an existing normalized phone-number row.
- No ownership assertion proves that `TELNYX_SMS_FROM_NUMBER` belongs to the actor's active organization.

**Impact:** Sending can clear an existing number's tenant assignment, make tenant-derived call/SMS records invisible or misrouted, and violate the canonical sender-ownership rule.

**Required correction:** Never perform registry ownership mutation in the send path; resolve the sender inside the active organization and fail closed when it is not owned and enabled.

### P0-03 — Source defaults create a known bootstrap owner

**Evidence:**

- `AuthService.ensureBootstrapAdmin` defaults to `admin@phoenixcrm.local` / `Admin12345!`.
- `AppModule.onModuleInit` invokes it at every application startup.
- Startup creates the user, owner profile, default organization, and membership if absent.

**Impact:** A production database initialized without explicit overrides can contain a predictable owner account. Changing environment values later does not automatically invalidate an account already created with the default password.

**Required correction:** Production startup must fail closed or skip bootstrap unless explicit one-time bootstrap configuration is supplied; existing deployments must be checked separately for the default account and credential.

### P0-04 — The mandatory paid-access gate is frontend-only

**Evidence:**

- `frontend/lib/auth/server-session.ts` redirects `/pricing` destinations before rendering protected routes.
- `SessionGuard` only resolves authentication and attaches `request.actor`.
- No global NestJS billing/activation guard was found.
- Feature-specific `EntitlementService` checks exist, but they do not enforce the canonical “unpaid users cannot reach operational CRM” contract across CRM APIs.

**Impact:** An authenticated registered-but-unpaid user can bypass Next.js navigation and invoke backend operational endpoints directly.

**Required correction:** Enforce account activation at the backend trust boundary, with an explicit allowlist for auth, billing activation, and other pre-activation endpoints.

### P1-01 — Twilio webhook has no request authentication

`TwilioMessagesWebhookController` accepts a public body and calls `processTwilioMessageWebhook` without validating `X-Twilio-Signature`. Provider-message deduplication does not authenticate the sender. Forged inbound records and status changes are possible.

### P1-02 — Telephony settings are global singleton state

Call-flow configuration selects the most recently updated active row globally; missed-call SMS uses `settings_key = 'default'`. Controllers check office roles but pass no organization. The tables have no tenant key. One tenant can alter behavior for every tenant sharing the deployment.

### P1-03 — Stripe webhook processing lacks receipt idempotency and event ordering

Stripe signatures are verified, but `StripeEventPayload` does not retain `event.id` or event creation time. No webhook-receipt table or monotonic version check is used. Each delivery writes “now” as `last_webhook_at`, so an older event delivered later can overwrite newer subscription state.

### P1-04 — Billing snapshot and entitlement projection are not atomic

`BillingOrchestrationService.applyProviderSnapshot` updates the billing account, reloads it, then reconciles Language Store entitlements without one transaction. A reconciliation failure leaves provider state updated and entitlements stale.

### P1-05 — No general request throttling is installed

No Nest throttler or equivalent application-level limiter was found for login, signup, public booking, portal token endpoints, provider callbacks, or AI requests. Provider-edge controls were not verified.

### P1-06 — PostgreSQL is selectable but not operationally supported

`DB_TYPE=postgres` and the `pg` dependency advertise a PostgreSQL path, but all 30 active migrations contain MySQL-specific SQL constructs such as backticks, `tinyint`, `ON UPDATE`, MySQL `enum`, `BINARY`, and `DATABASE()`. The current schema/runbook is MySQL-only.

### P1-07 — Local filesystem photo storage is not horizontally durable

Inspection-photo smoke output confirms local `backend/uploads/inspection-photos` files. A multi-instance or ephemeral deployment can lose assets or serve inconsistent files without shared durable storage.

### P2 findings

- **P2-01:** Twenty-six tenant-key columns are nullable, allowing orphan/global-looking rows if application stamping fails.
- **P2-02:** Organization foreign keys commonly use `ON DELETE SET NULL`; deletion can erase tenant ownership instead of preserving an auditable tombstone or cascading through a controlled workflow.
- **P2-03:** Seven high-volume tenant columns lack an index beginning with the tenant key: automation logs, pending actions, rules, runs, scheduled runs, CRM tasks, and owned phone numbers.
- **P2-04:** The schema does not enforce same-organization parent/child relationships with composite keys; application checks carry most of that burden.
- **P2-05:** Global `ValidationPipe` uses `whitelist: false` and `transform: false`; many bodies are interfaces or inline types, so runtime DTO enforcement is inconsistent and mostly manual.
- **P2-06:** Password “recovery” is an authenticated password-change page, not account recovery.
- **P2-07:** Localization parity fails with 1,792 total missing key entries.
- **P2-08:** There is no current automated test that would detect P0-01/P0-02.
- **P2-09:** Backend `lint` is an echo placeholder; no general backend test runner is configured.

### P3 findings

- Clover clients and `BillingLifecycleService` remain in source but are not registered in `BillingModule`; Stripe is the active path.
- Three unused schema-alter helper methods remain in `TelnyxWebhookService`. They are dead code, not an active runtime-DDL finding.
- Two migrations share timestamp `1778740000000`; their current tables are unrelated, but ordering identity is ambiguous.
- `CrmController` and `TelnyxWebhookService` are very large aggregation points and raise change/review risk.
- Untracked `docs/chatgpt-review-package/` duplicates canonical documents and can mislead reviewers about authority.

## 6. Tenant Isolation Report

### Strong or passing boundaries

- Auth actor context derives active organization from a valid active membership.
- Core customer, lead, job, estimate, invoice, inspection, pricebook, inventory, settings, and marketing services generally use active-org predicates.
- Inspection isolation smoke passed all cross-org negative assertions.
- Document snapshot isolation smoke passed same-org and cross-org pricebook/bundle assertions.
- Public booking smoke correctly mapped organization slugs and rejected unknown, inactive, malformed, and empty slugs.
- Portal scope check passed.
- Telephony legacy/recent-call isolation smoke passed call, text, callback, reporting, voice-ingest, and post-call assertions.
- Operator Copilot rejected foreign-org calls and passed guarded-send/outcome assertions.
- Language Store entitlement, preference, translation, and snapshot isolation checks passed.

### Unsafe or structurally weak boundaries

- New TXT conversations/messages: **unsafe and global**.
- Owned number outbound upsert: **can clear tenant ownership**.
- Call-flow and missed-call settings: **global by design in current schema**.
- Inbound TXT customer phone match: **global customer search**.
- Core tenant keys: application-scoped but nullable at the database level.
- Communications ownership: often derived indirectly through owned numbers/customers/leads instead of stored on each record.
- Shared billing accounts: intentionally cross-organization at payer level; entitlement allocation is organization-specific and passed current smokes.

### Nullable tenant-key inventory

The live schema reported nullable `organization_id` or `tenant_id` on:

`customers`, `inspection_items`, `inspection_photos`, `inspection_required_fields`, `inspections`, `inventory_items`, `inventory_locations`, `inventory_movements`, `invoice_payments`, `invoices`, `job_notes`, `job_status_events`, `jobs`, `leads`, `organization_settings`, `owned_phone_numbers`, `portal_access_events`, `portal_magic_links`, `portal_sessions`, `pricebook_bundle_items`, `pricebook_bundles`, `pricebook_items`, `quotes`, `services`, `technicians`, and `warranty_certificates`.

Nullability is not proof of current leakage because reviewed services usually require equality with the active organization. It is a material defense-in-depth and data-repair weakness.

## 7. Database and Schema Report

### Current state

- Database target used for verification: local MySQL, default database `wizfield`.
- Active migrations: 30.
- Migration result: no pending migrations.
- Application tables: 78.
- TypeORM migration bookkeeping table: 1.
- Manifest result: all required tables, selected columns, indexes, and foreign keys passed.
- `DB_SYNCHRONIZE` defaults to false.

### Schema manifest coverage

The manifest is a selected invariant set, not a complete schema specification:

| Contract | Manifest assertions | Live schema total |
|---|---:|---:|
| Application tables | 78 | 78 |
| Columns | 393 | 1,157 |
| Index assertions | 66 | 272 indexes including primary indexes |
| Foreign keys | 77 | 116 |

The only database table outside `requiredTables` is the expected `typeorm_migrations` table. No manifest-required table was missing.

Therefore, `schema:verify` PASS means the asserted floor exists; it does not prove all 1,157 columns, all index definitions, nullability, defaults, delete rules, or tenant relationships match an exhaustive canonical contract.

### Raw-SQL-owned schema

Ten communications tables have no corresponding registered TypeORM entity and are operated primarily through raw SQL:

`sms_templates`, `call_flow_configs`, `call_flow_business_hours`, `call_flow_ivr_options`, `callback_tasks`, `missed_call_sms_settings`, `missed_call_sms_cooldowns`, `recent_call_sms_logs`, `recent_call_activity_events`, and `telnyx_webhook_event_receipts`.

Raw SQL is not inherently defective, but these tables require dedicated query-level review and tests because repository-level scoping cannot protect them.

### Integrity and scale findings

- The new TXT schema cannot express tenant ownership.
- Many core tenant columns remain nullable for historical compatibility.
- Same-tenant relationships are mostly an application invariant, not a composite database constraint.
- Automation and task tenant predicates will degrade under growth where `organization_id` is not the leading index column.
- `owned_phone_numbers.phone_number_normalized` is globally unique while `tenant_id` is nullable; this supports one deployment-wide owner per number, not shared or independently configured tenant numbers.
- The duplicate migration timestamp is not currently failing, but should not be repeated.

## 8. API Contract Report

### What is sound

- Authenticated controllers generally use `SessionGuard`.
- Permission helpers centralize roles and named permissions.
- Most tenant-aware APIs derive organization from `ActorContext`, not request-supplied organization IDs.
- Public booking derives organization from a validated slug.
- Portal APIs use separate portal-session/resource scope.
- Stripe and Telnyx primary webhooks use raw-body signature verification.
- API success/error helpers provide a mostly consistent envelope.

### Contract gaps and mismatches

1. **Duplicate communications contracts:** `/api/telephony/*` and `/api/messaging/txt/*` represent overlapping SMS products with different ownership rules.
2. **Frontend/backend billing mismatch:** frontend route access is billing-aware; backend API access is not globally billing-aware.
3. **Reset-password contract mismatch:** route and copy imply recovery; API behavior requires an authenticated session.
4. **Runtime validation gap:** the global pipe does not strip unknown fields, does not transform, and cannot validate type-only DTOs.
5. **No generated API specification:** no OpenAPI/Swagger contract was found, so frontend/backend drift is discovered by builds and manual coupling.
6. **Public webhook inconsistency:** Stripe/Telnyx verify signatures; Twilio does not.
7. **Messaging short-link semantics:** called a short link, but resolution is an authenticated role-gated API and the underlying code is global rather than tenant-bound.
8. **Failure-shape inconsistency risk:** explicit `apiError` paths are structured, while framework validation/exceptions can use Nest default shapes.

### Endpoint classes that require explicit trust-boundary treatment

- Public: registration, login, public booking, portal grant redemption, marketing OAuth callback, Stripe webhook, Telnyx webhooks/tools, Twilio webhook.
- Authenticated pre-activation: session, destination, logout, organization selection, billing summary/checkout.
- Authenticated paid-operation: all CRM, communications, marketing, Language Store, AI, pricebook, inventory, and inspections APIs.

The backend currently does not centrally enforce the distinction between the latter two classes.

## 9. External Integration Readiness

| Integration | Implementation status | Audit readiness verdict |
|---|---|---|
| MySQL | Active and runtime-confirmed locally | **READY for local engineering; production topology not verified** |
| PostgreSQL | Selectable in config | **BROKEN/UNSUPPORTED with active migrations** |
| Stripe | Checkout provider, signature verification, shared billing projection | **PARTIAL; live keys/webhooks not verified; ordering/idempotency and hard-gate gaps** |
| Telnyx voice | Signed webhook, calls, voice-flow, AI attach, post-call ingest | **PARTIAL; internal smokes pass; live account replay required** |
| Telnyx TXT | Signed webhook and send client | **BLOCKED by tenant ownership defects** |
| Twilio SMS | Active public inbound compatibility endpoint | **NOT READY; signature verification absent** |
| SMTP | Nodemailer adapter with fail-closed not-configured behavior | **EXTERNAL-CONFIG-REQUIRED** |
| DeepSeek | General AI chat/actions provider path | **EXTERNAL-CONFIG-REQUIRED; current worktree scope not canonicalized** |
| Gemini | Language Store translation provider | **EXTERNAL-CONFIG-REQUIRED; internal accounting/safety smokes pass** |
| Google Business OAuth/publish | Growth Center adapter and OAuth state model | **EXTERNAL-CONFIG-REQUIRED; live callback/publish not verified** |
| Meta/Facebook OAuth/publish | Growth Center adapter and OAuth state model | **EXTERNAL-CONFIG-REQUIRED; live callback/publish not verified** |
| File storage | Local inspection photo filesystem | **LOCAL ONLY; not ready for ephemeral or multi-instance production** |
| Monitoring/analytics | Owner checklist leaves selection/activation open | **NOT VERIFIED / NOT ACTIVATED** |

No live payment, phone call, SMS, email, AI generation, OAuth exchange, or social publish was attempted. Build success is not evidence of provider readiness.

## 10. Build and Verification Results

The database target was first classified without printing secrets. It resolved to local, `NODE_ENV` was unset, and no explicit database override or smoke database override was present.

### Required commands

| Command | Result | Exact audit outcome |
|---|---|---|
| `npm.cmd run migration:run --workspace backend` | **PASS** | `No migrations are pending` |
| `npm.cmd run schema:verify --workspace backend` | **PASS** | `Schema verification passed for database 'wizfield'.` |
| `npm.cmd run inspections:isolation:smoke --workspace backend` | **PASS** | `ok: true`; all listed assertions passed |
| `npm.cmd run document-snapshot:isolation:smoke --workspace backend` | **PASS** | `ok: true`; 6/6 assertions passed |
| `npm.cmd run telephony-messaging:isolation:smoke --workspace backend` | **PASS** | `ok: true`; all legacy telephony/SMS and 9a–9d assertions passed |
| `npm.cmd run public-booking:isolation:smoke --workspace backend` | **PASS** | `ok: true`; 7/7 assertions passed |
| `npm.cmd run operator-copilot:isolation:smoke --workspace backend` | **PASS** | C1–C5 passed |
| `npm.cmd run operator-copilot:contract-check --workspace backend` | **PASS** | `operator_copilot_contract_check: ok` |
| `npm.cmd run language-store-entitlement:smoke --workspace backend` | **PASS** | Entitlement reprojection passed |
| `npm.cmd run language-store-translation:smoke --workspace backend` | **PASS** | Translation engine passed |
| `npm.cmd run language-store-preference:smoke --workspace backend` | **PASS** | Preference isolation passed |
| `npm.cmd run language-store-snapshot-safety:smoke --workspace backend` | **PASS** | Snapshot translation safety passed |
| `npm.cmd run build --workspace backend` | **PASS** | TypeScript compilation completed with exit 0 |
| `npm.cmd run build --workspace frontend` | **PASS** | Next.js production build and TypeScript completed; 52 app routes emitted |

### Additional current checks

| Command | Result |
|---|---|
| `language-store-billing-dev:smoke` | **PASS** |
| `portal:scope-check` | **PASS** |
| `field-knowledge:contract-check` | **PASS** |
| `field-knowledge:unit-check` | **PASS** |
| `field-knowledge:runtime-safety-check` | **PASS** |
| `field-knowledge:qa-appendix-check` | **PASS** — 320 prompts; 80 per trade; voice/text split 40/40 |
| `field-knowledge:runtime-adversarial-check` | **PASS** — all six groups passed; S0–S3 failures = 0 |
| `shell-nav-policy:check` | **PASS** |
| Direct untracked `ai-chat-context-unit-check.ts` | **PASS** |
| Direct untracked `general-ai-chat-contract-check.ts` | **PASS** |
| Direct untracked `general-ai-chat-unit-check.ts` | **PASS** |
| `i18n:check` | **FAIL** |

### Localization failure

The parity checker reported 448 missing keys in each of:

- Spanish (`es`)
- Hebrew (`he`)
- Ukrainian (`uk`)
- Polish (`pl`)

Total missing locale-key entries: **1,792**.

### Verification side effects and limitations

- Several database smokes reported `cleanup: PASS` while also reporting `droppedDatabase: false`; generated local verification databases remain and should not be mistaken for application data.
- Inspection smoke removed its temporary photo file.
- Post-run git status still showed the dirty source/document worktree; builds did not introduce a new tracked source diff.
- No browser E2E, production deployment, concurrency/load test, live provider test, restore test, or penetration test was performed.
- A passing smoke proves its named assertions only. It does not cover the newer TXT API.

## 11. Documentation Drift

### Documentation claims contradicted by code

1. `WizField_Master_Source_of_Truth.md` says outbound sending verifies the sender belongs to the active organization. The current TXT send path does not.
2. It says calls, SMS threads, messages, and callback tasks remain organization-scoped. New TXT threads/messages do not.
3. It says no tenant-crossing global communications inbox exists. `TxtConversationsService.listRecentConversations` is global.
4. It says registered-but-unpaid users must not reach operational CRM routes. That is a frontend navigation rule, not a backend API invariant.
5. It preserves a post-AI verdict with no accepted P0/P1 blocker. The current worktree now contains P0/P1 findings, regardless of historical acceptance.
6. Engineering closeout lists telephony isolation PASS without clarifying that a second, untested TXT data path exists.
7. Gate 13 “Billing + Plan Enforcement — ENGINEERING PASS” overstates backend-wide enforcement.

### Code present but absent or incomplete in canonical documentation

- General AI Chat and AI Actions endpoints/UI and their current checks.
- The active unsigned Twilio compatibility endpoint.
- Selectable PostgreSQL configuration despite MySQL-only migrations.
- The dual communications API/data model.
- Current localization parity failure.
- Current doors/windows field-knowledge expansion and AI review artifacts, which remain worktree WIP.

### Documentation-only or externally incomplete claims

- Growth Center “implemented and shipped” is accurate for code presence but not evidence of live Google/Meta authorization or publishing.
- Language Store commercial/provider readiness remains dependent on Stripe/Gemini activation.
- Final Terms, Privacy, support escalation, monitoring, analytics, and paid launch are explicitly still owner tasks.
- Live Stripe activation and production webhook confirmation remain unverified, as the canonical docs correctly state.

### Authority problem

Canonical root `docs/` files are the source of truth. The untracked `docs/chatgpt-review-package/` contains duplicates and review artifacts that can diverge. They must not be treated as a second canonical set.

## 12. Dead Code and Technical Debt

### Dead or parked systems

- Clover ecommerce/recurring clients and lifecycle service remain in source, but `BillingModule` registers only Stripe. Legacy Clover columns/fallback projections still enlarge the billing model.
- Unused `ensureRecentCallsColumn`, `ensureRecentCallsPrimaryKeyColumn`, and `ensureRecentCallSmsLogsColumn` methods contain DDL but have no call sites.
- Twilio is described as legacy but its unsigned controller is active, so it is not dead; it is a live risk.

### Duplication

- Two SMS/TXT systems and API families.
- Canonical docs plus untracked review-package copies.
- Provider-era billing fields for both Clover and current generic/Stripe data.
- Duplicate migration timestamp `1778740000000`.

### Maintainability

- `CrmController` centralizes a very large API surface.
- `TelnyxWebhookService` combines webhook ingest, calls, SMS, settings, callback, AI enrichment, matching, and compatibility behavior.
- Numerous raw-SQL communications services bypass repository abstractions.
- Backend lint is not configured and there is no broad unit-test command.
- No TODO/FIXME/HACK/TEMP markers were found in backend or frontend source; the debt is architectural and behavioral rather than marker-driven.

## 13. Architectural Stress Test

### At 10× tenants

- Core organization predicates should remain logically correct, but unindexed automation/task tenant columns will increase scan cost.
- Global call-flow and missed-call settings become immediately invalid for independent businesses.
- One globally configured outbound TXT number cannot represent independent tenant ownership.
- Global TXT listing becomes both a larger leak and a performance bottleneck.

### At 100× data volume

- `TxtService.matchCustomerByPhoneNormalized` caps a global in-memory scan at 5,000 customers; matches become incomplete and nondeterministic.
- Large global TXT recent-conversation reads and grouping in application memory will degrade.
- Raw SQL paths need query-plan/index verification beyond the current manifest.
- Large controller/services increase regression probability because unrelated concerns change together.

### With multiple backend instances

- Local inspection photos are not consistently available across instances.
- In-process “schema ensured” booleans are per-instance, though current implementations primarily assert table presence.
- Scheduled/publish workers need distributed claiming/idempotency guarantees; current production concurrency was not tested.
- Webhook retries can race without Stripe receipt idempotency and transactional projections.

### With delayed or out-of-order events

- Telnyx conversation smoke explicitly passed ended-before-insights ordering.
- Stripe has no equivalent event-age or receipt protection and can regress state.
- TXT provider-message IDs provide some deduplication, but tenant attribution remains unsafe.

### With tenant deletion or data corruption

- Nullable keys plus `ON DELETE SET NULL` can produce ownershipless rows.
- Indirect communications ownership can disappear if the owned-number/customer/lead link changes.
- Application predicates hide many orphans rather than making them impossible.

### During disaster recovery

- Source, MySQL backup, environment secrets, OAuth/provider credentials, and uploaded files are all required.
- The rebuild runbook is useful, but a restore was not executed.
- Local uploaded photos require a separate backup/restore process.
- Uncommitted current worktree artifacts are not recoverable from `HEAD d115a54`.

## 14. What Is Ready

Ready for continued engineering and controlled local/staging verification:

- MySQL migrations and selected schema invariants.
- Backend and frontend production compilation.
- Core CRM and organization switching foundations.
- Inspection workflows covered by current smoke.
- Document snapshot tenant checks.
- Customer portal scope checks.
- Public booking organization routing, subject to rate limiting.
- Legacy recent-call/SMS organization queries covered by the current smoke.
- Language Store internal entitlement/preference/translation accounting and snapshot safeguards.
- Operator Copilot internal isolation/contract behavior.
- Field Knowledge safety checks.

Ready does not mean live-provider or production-scale verified.

## 15. What Is Not Ready

Not ready for multi-tenant beta:

- New TXT inbox, threads, short links, inbound matching, read-state mutation, and outbound number ownership.
- Global call-flow and missed-call settings.
- Backend-wide unpaid-account enforcement.
- Any environment that could create/use the default bootstrap owner.
- Public Twilio webhook exposure.

Not ready for public production launch:

- Live Stripe activation and robust webhook replay handling.
- Provider credentials/callback validation for Telnyx, SMTP, Gemini, DeepSeek, Google, and Meta.
- General request throttling/abuse controls.
- Durable shared photo storage for multi-instance/ephemeral hosting.
- Production monitoring, alerting, analytics, support escalation, and final legal approval.
- Full locale parity.
- PostgreSQL deployment.
- Recovery of current uncommitted WIP from source control.

## 16. Recommended Execution Order

### Wave 0 — Contain launch/security exposure

1. Disable or restrict the new TXT routes in any shared environment until tenant ownership is corrected.
2. Remove production reliance on source default bootstrap credentials and audit existing databases for the default account.
3. Add backend-wide activation enforcement with a narrow pre-activation allowlist.
4. Require Twilio signature verification or disable the endpoint.

### Wave 1 — Rebuild communications tenant invariants

1. Define one authoritative organization owner for owned numbers, conversations, messages, call flow, and missed-call settings.
2. Make all TXT lookup, short-link, unread, mutation, matching, and send operations require active-org scope.
3. Eliminate tenant mutation from the outbound send path.
4. Add controller/service-level negative isolation tests for both communications API families.
5. Decide whether the legacy telephony SMS system or new TXT system is authoritative; retire or adapt the other.

### Wave 2 — Billing and webhook reliability

1. Persist Stripe event receipts and reject duplicates/stale state transitions.
2. Make billing snapshot plus entitlement reconciliation atomic or explicitly recoverable.
3. Add replay tests for duplicate and out-of-order Stripe events.
4. Perform live sandbox checkout/webhook/activation/deactivation tests after the hard gate is in place.

### Wave 3 — Defense in depth and data integrity

1. Inventory and repair null tenant keys before changing constraints.
2. Strengthen tenant nullability, delete behavior, same-org parent/child invariants, and leading indexes through separately reviewed migrations.
3. Standardize runtime DTO validation and unknown-field policy.
4. Add throttling for auth, public, webhook, and AI surfaces.
5. Make the schema manifest explicit about whether it is exhaustive or selected, and expand high-risk assertions.

### Wave 4 — Operations and scale

1. Move inspection assets to durable shared object storage.
2. Validate scheduler/publisher multi-instance claiming and idempotency.
3. Activate monitoring, error tracking, alerting, backup, restore, and provider runbooks.
4. Resolve the PostgreSQL claim: either remove it or create and verify a real PostgreSQL migration path.

### Wave 5 — Product and documentation closeout

1. Fix i18n catalog parity or narrow the supported-locale claim.
2. Convert the current AI/field-knowledge WIP into an intentional, reviewed change set.
3. Reconcile canonical docs with the corrected communications and billing boundaries.
4. Remove/clearly quarantine duplicate review-package docs and parked code.
5. Re-run the complete command set plus browser E2E and live-provider sandbox tests before any GO decision.

## 17. Owner Decision Summary

- WizField is real, broad, and buildable; it is not a prototype.
- Core CRM, inspection, portal, billing-schema, Language Store, Copilot, and field-knowledge checks are in materially good condition.
- Do **not** launch multi-tenant access while `/api/messaging/txt/*` remains globally scoped.
- Treat the default bootstrap owner as an immediate credential exposure risk.
- Treat unpaid access as bypassable until the backend, not only Next.js, enforces activation.
- Disable or authenticate the Twilio webhook before public exposure.
- Keep MySQL as the only supported database today; PostgreSQL configuration is not truthful operational support.
- Live Stripe, Telnyx, email, AI, Google, and Meta readiness remains unverified.
- The next engineering work should be communications isolation first, billing trust-boundary/replay safety second, then data/operations hardening.
- A launch GO requires a new audit after P0/P1 correction; historical Gate PASS labels are not sufficient.
