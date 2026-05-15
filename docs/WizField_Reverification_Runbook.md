# WizField Reverification Runbook

## Purpose

This is the reusable operator runbook for future WizField reverification on production-like or deployed environments.

It is a replay tool, not an active engineering gate blocker.

## 1. When to use this runbook

Use this runbook when:

- replaying the required production-like Gate 12 confidence pass
- validating a deployed environment before external beta or broader launch
- rechecking tenant safety after major auth, tenancy, booking, portal, billing-surface, or org-switch changes
- re-establishing confidence after environment recovery or migration activity

Do not use this document to reopen internal Gate 11-14 closeout statuses. Use it to capture fresh runtime evidence on a new environment.

## 2. Required environment

- WizField backend and frontend reachable in the target environment
- Migrated application database
- Ability to run backend and frontend builds
- Ability to run `migration:run`, `schema:verify`, and the four isolation smoke commands
- Access to controlled test accounts and organization fixtures
- If using the smoke harness, a MySQL principal capable of creating and dropping the ephemeral verification databases used by the smoke scripts

## 3. Required test topology

Use this minimum topology:

| Actor | Organizations |
|---|---|
| User1 | Org A + Org B |
| User2 | Org C |

Expectation:

- User1 can sign in normally and switch between Org A and Org B
- User2 signs in normally and sees Org C only
- User1 cannot access Org C
- User2 cannot access Org A or Org B

## 4. Optional fixture and setup guidance

- Controlled mock or seeded fixture data is acceptable for reruns unless the goal is live-customer validation.
- Record stable IDs and slugs for:
  - Org A / Org B / Org C
  - customer, lead, job, estimate, and invoice fixtures
  - search markers per organization
  - valid and invalid portal tokens
  - active and inactive public booking slugs
- If a fixture bootstrap script is used, verify that it matches current schema truth before execution.
- Historical Path B exists only as audit history and is not active rerun scope; current repo truth includes signup and add-business flows.

## 5. MySQL smoke credential requirement and recovery note

The isolation smoke scripts create temporary verification databases. The MySQL principal used for smoke execution must be able to:

- create databases
- drop temporary verification databases
- run migrations inside those verification databases

Recommended approach:

- use a dedicated local smoke user rather than broadening the normal app credential

If smoke execution fails during database creation:

1. Stop and capture the exact MySQL error.
2. Verify the credential used for the smoke commands.
3. Re-run only after DB privilege or credential recovery is complete.

## 6. Exact smoke, build, migration, and schema commands

From the repo root, with the correct environment configured:

```text
npm.cmd run migration:run --workspace backend
npm.cmd run schema:verify --workspace backend
npm.cmd run inspections:isolation:smoke --workspace backend
npm.cmd run document-snapshot:isolation:smoke --workspace backend
npm.cmd run telephony-messaging:isolation:smoke --workspace backend
npm.cmd run public-booking:isolation:smoke --workspace backend
npm.cmd run build --workspace backend
npm.cmd run build --workspace frontend
git status --short
```

Expected result:

- migration and schema verification pass
- each smoke returns `ok: true`
- backend and frontend builds pass

## 6A. Language Store V1 reverification addendum

Use this addendum when the completed Language Store V1 package must be replayed as a bounded verification pass without reopening the underlying Gate 11-14 foundation decisions.

This addendum is procedural only. Active Language Store product, billing, entitlement, and snapshot rules remain owned by `docs/WizField_Language_Store_Source_of_Truth.md`.

### Language Store V1 prerequisites

- backend migrations already applied in the target environment
- backend app credential available for normal `migration:run`, `schema:verify`, and build commands
- same-user multi-org fixture available for a Language Store operator who belongs to Org LS-A and Org LS-B
- Org LS-A and Org LS-B linked under the intended shared `billing_account`
- Language Store enabled under the verified entitlement projection for the fixture organizations
- the standard local smoke principal available when any ephemeral-DB smoke needs `CREATE DATABASE` / `DROP DATABASE`

### Language Store V1 fixture identifiers to record

Record these before the run:

- operator user id / email
- Org LS-A id / slug
- Org LS-B id / slug
- shared `billing_account_id`
- one verified quote id for Org LS-A
- one verified invoice id for Org LS-A

### Language Store V1 exact command set

Run these from repo root:

```text
npm.cmd run migration:run --workspace backend
npm.cmd run schema:verify --workspace backend
npm.cmd run language-store-entitlement:smoke --workspace backend
npm.cmd run language-store-translation:smoke --workspace backend
npm.cmd run language-store-preference:smoke --workspace backend
npm.cmd run language-store-snapshot-safety:smoke --workspace backend
npm.cmd run build --workspace backend
npm.cmd run build --workspace frontend
git status --short
```

### Language Store V1 replay expectations

- entitlement reprojection remains organization-scoped across shared billing coverage and item reassignment
- the same user can retain different preferred worker languages in Org LS-A and Org LS-B
- disabling a previously selected language falls back to English only in the affected organization
- translation usage units still follow the `1 unit per 1,000 source characters, rounded up` rule
- regeneration consumes units again
- finalize consumes no extra unit
- quote and invoice customer-facing snapshots accept only finalized `final_text`
- cross-org, cross-document, and field-mismatched translation references fail safely
- already-snapshotted customer-facing text remains unchanged after later preference, enablement, or translation-record changes

### Language Store V1 result logging fields

Add these fields to the normal run log when Language Store V1 is in scope:

| Field | Value |
|---|---|
| Language Store entitlement smoke | PASS / FAIL |
| Language Store translation smoke | PASS / FAIL |
| Language Store preference smoke | PASS / FAIL |
| Language Store snapshot safety smoke | PASS / FAIL |
| Language Store build/schema closeout | PASS / FAIL |
| Language Store notes / anomalies |  |

### Language Store V1 stop conditions

Stop the Language Store portion of the run if any of the following occurs:

- entitlement projection drifts across organizations under the same `billing_account`
- preference state leaks across organizations for the same user
- translation usage accounting no longer matches the locked unit rule
- draft, foreign-org, foreign-document, or field-mismatched translation records can enter customer-facing snapshots
- a new Language Store verification failure would require schema expansion, billing-model redesign, or product-scope widening to explain

## 6B. AI Program Phases 0–4 reverification addendum

Use this addendum when the shipped AI program (foundation through Copilot outcome loop) must be replayed without reopening Gate 11–14 foundation decisions.

Product truth: `docs/WizField_AI_Master_Source_of_Truth.md`. Evidence matrices: `docs/WizField_AI_Engineering_Closeout_and_Gap_Register.md`.

### AI prerequisites

- backend migrations applied in the target environment
- MySQL smoke principal with `CREATE DATABASE` / `DROP DATABASE` when running isolation smokes locally
- controlled test org(s) with `calls.view` and `messaging.send` roles for manual Copilot send replay (optional)

### AI flag bundle (staging / local replay)

Set enabling tokens (`true` / `1` / `yes` / `on`) for the surfaces under test:

```text
AI_FOUNDATION_ENABLED=true
AI_BRAIN_V1_ENABLED=true
AI_VOICE_INTAKE_FOUNDATION_ENABLED=true
AI_VOICE_INTAKE_LIVE_PILOT_ENABLED=true
AI_VOICE_INTAKE_LIVE_PILOT_OWNED_PHONE_IDS=<comma-separated owned_phone_numbers.id>
AI_OPERATOR_COPILOT_ENABLED=true
AI_COPILOT_CALLS_SURFACE_ENABLED=true
AI_COPILOT_CUSTOMER_SMS_DRAFT_ENABLED=true
AI_COPILOT_CUSTOMER_SMS_GUARDED_SEND_ENABLED=true
AI_COPILOT_CUSTOMER_SMS_OUTCOME_TRACKING_ENABLED=true
```

Post-call webhook finalize requires `AI_FOUNDATION_ENABLED` + `AI_VOICE_INTAKE_FOUNDATION_ENABLED` only (not live pilot). See AI SoT §4.

### AI exact command set

Run from repo root:

```text
npm.cmd run migration:run --workspace backend
npm.cmd run schema:verify --workspace backend
npm.cmd run telephony-messaging:isolation:smoke --workspace backend
npm.cmd run operator-copilot:isolation:smoke --workspace backend
npm.cmd run operator-copilot:contract-check --workspace backend
npm.cmd run build --workspace backend
npm.cmd run build --workspace frontend
git status --short
```

### AI replay expectations

- telephony smoke **9a–9d** pass (voice ingest + post-call audit)
- copilot smoke **C1–C5** pass (draft, foreign-org negative, guarded send, outcomes)
- contract-check confirms Copilot uses `TxtService` only
- manual (optional): CSR with `messaging.send` confirms send modal on `/calls`; viewer cannot access `/calls`

### AI result logging fields

| Field | Value |
|---|---|
| Telephony messaging smoke | PASS / FAIL |
| Operator Copilot isolation smoke | PASS / FAIL |
| Operator Copilot contract-check | PASS / FAIL |
| AI build/schema closeout | PASS / FAIL |
| AI manual notes |  |

### AI stop conditions

Stop the AI portion if:

- copilot smoke or telephony **9d** fails after flag bundle is confirmed
- guarded send succeeds without `messaging.send`
- outcome tracking triggers outbound send
- verification failure would require a new AI product phase to explain

## 7. Multi-org UX verification replay

Replay the Gate 11 contract:

1. Sign in as User1 with a normal password flow.
2. Confirm session resolves an active organization and includes Org A + Org B memberships.
3. Confirm User2 signs in normally and sees only Org C.
4. Attempt a forbidden switch from User1 to Org C. Expect safe failure.
5. Switch User1 from Org A to Org B. Expect success.
6. Confirm the product returns to `/home` after switching.
7. Confirm stale deep links from the previous org are no longer readable.
8. Confirm the active workspace displayed in the product matches the active organization in session truth.

## 8. Cross-tenant matrix replay

While signed in under the wrong organization context, attempt foreign-org reads for:

- customer
- lead
- job
- estimate / quote
- invoice

Expected result:

- each request fails safely
- no foreign payload is returned

Also verify:

- dashboard output changes with org switching
- search stays org-scoped
- settings changes in Org A do not affect Org B
- document snapshot isolation remains tenant-safe
- telephony / messaging isolation smoke passes

## 9. Portal and public booking replay

Portal replay:

1. Redeem a valid portal token.
2. Confirm the portal session resolves only the expected customer/org.
3. Attempt expired, invalid, or already-used token flows.
4. Confirm safe failure with no cross-tenant exposure.

Public booking replay:

1. Submit a valid booking for Org A.
2. Confirm the created lead is stamped to Org A.
3. Attempt inactive or invalid slug paths.
4. Confirm safe failure and no wrong-tenant defaulting.

## 10. Self-serve onboarding replay

Replay the current product truth directly:

1. Register a fresh account through the public signup flow or `POST /api/auth/register`.
2. Confirm first-workspace creation occurs and the new session has an active organization.
3. Attempt add-business on the default starter entitlement.
4. Confirm the request is blocked with the organization limit.
5. Expand entitlement in a safe controlled environment.
6. Retry add-business.
7. Confirm the second organization is created and linked under the same shared billing account where expected.

## 11. Result logging template

Record the run using this template:

| Field | Value |
|---|---|
| Date |  |
| Environment |  |
| Tester / operator |  |
| Backend commit / build context |  |
| User1 / Org A / Org B identifiers |  |
| User2 / Org C identifiers |  |
| Migration run | PASS / FAIL |
| Schema verify | PASS / FAIL |
| Smokes | PASS / FAIL |
| Multi-org UX replay | PASS / FAIL |
| Cross-tenant matrix replay | PASS / FAIL |
| Portal replay | PASS / FAIL |
| Public booking replay | PASS / FAIL |
| Self-serve onboarding replay | PASS / FAIL |
| Notes / anomalies |  |
| Final result | PASS / FAIL |

Attach command output, runtime notes, and any dated addendum needed for the environment being verified.

## 12. Stop conditions

Stop the run and record failure if any of the following occurs:

- normal multi-org login fails
- active-organization switching cannot be trusted
- a foreign-org record is readable
- search or dashboard leaks cross-tenant data
- portal or booking routes fail organization binding
- any smoke required for the run cannot execute and no approved skip policy exists
- migration or schema verification fails
- the environment is too incomplete to represent the target launch surface

If a stop condition is hit, do not paper over it with historical waiver text. Record the failure against the current rerun environment and investigate separately.
