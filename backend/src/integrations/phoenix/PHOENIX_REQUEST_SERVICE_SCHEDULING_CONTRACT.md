# Phoenix request-service live timing contract (WizField)

Authority for product behavior remains Phoenix SOT §36; this note documents the integration implementation.

## Scope

- Single Phoenix organization (`PHOENIX_INTEGRATION_ORGANIZATION_ID`).
- Branch isolation by province code on `jobs.branch_id`: Calgary/Edmonton/Red Deer marketing slugs → **AB**; Ottawa → **ON**.
- **Live timing V1** availability and booking locations: **`calgary` and `ottawa` only** (public website flags gate UI; integration rejects other slugs on scheduling routes).

**Production schema dependency:** Live timing requires `branches`, `jobs.branch_id`, and branch-scoped availability queries. That DDL is defined in deferred migration `1790000000000-multi-branch-phase1-foundation.ts` (not loaded from `migrations/active`). Phoenix tenants running live timing **must** have this schema applied in production—it is not test-only. Ephemeral harness DBs apply the same DDL via `phoenix-request-service-smoke-bootstrap.ts` without promoting the migration into `active/`.

## Blocking job statuses

A scheduled window is occupied when a job matches org + branch + `scheduled_window` + local calendar day of `scheduled_for`, and `status` is one of:

| Status | Blocks slot |
|--------|-------------|
| `scheduled` | yes |
| `on_the_way` | yes |
| `in_progress` | yes |
| `waiting_for_approval` | yes |
| `cancelled` | no |
| `completed` | no |
| `paid` | no |
| `new_lead` | no |
| `contacted` | no |

Source: `PHOENIX_SLOT_BLOCKING_JOB_STATUSES` in `phoenix-scheduling.constants.ts`.

## Time windows (V1)

Five fixed windows per day (local branch time): 09–11, 11–13, 13–15, 15–17, 17–19.

## Horizon and range

- Booking horizon: start of current UTC calendar month through end of month **+2** (`PHOENIX_BOOKING_HORIZON_MONTHS`).
- Availability query: `from`/`to` inclusive ISO dates, max **31** days, entirely within horizon.

## Timezone

- AB branch: `America/Edmonton`
- ON branch: `America/Toronto`

`scheduled_for` is stored UTC; day keys and window starts use IANA conversion (DST-safe).

## Booking write

- Idempotency key: `phoenix-rs:{requestId}` in `public_booking_submissions`.
- MySQL named locks: per-request and per-slot before revalidation.
- Slot taken: HTTP **409** / `SLOT_UNAVAILABLE` (unchanged semantics).

## Performance / index

Range availability query filters:

- `organization_id`, `branch_id`, `status IN (blocking)`, `scheduled_for >= rangeStart`, `scheduled_for < rangeEndExclusive`.

**Index assessment (2026-09):** no dedicated migration found for `(organization_id, branch_id, status, scheduled_for)` on `jobs`. Recommend a follow-up migration before high-volume production load; not applied in this hardening pass.

## Security

- `PhoenixIntegrationGuard` bearer required; org from integration credential only (no client `organizationId`).
