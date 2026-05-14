# WizField Marketing Growth Center
## Phase 3 — Publishing Integrations Execution Prompt
## PLAN MODE

## Purpose

Convert the accepted **Phase 3 Publishing Integrations PLAN MODE audit** plus **owner-locked decisions** (Feature Card) into an **implementation execution boundary** for **Google Business Profile** and **Facebook Page** publishing — with **WizField-owned publish jobs**, a **DB-authoritative dispatcher**, and **Instagram architecturally preserved but visibly deferred (V1.5)**.

This document is the **single execution contract** for Phase 3. Do not broaden scope beyond **Approved scope** without a written product update.

---

## Selected work mode

**New capabilities** on the authenticated `/marketing` module: **OAuth**, **secrets handling**, **outbound provider calls**, **background-style job execution** (no new external queue dependency unless a **stop condition** is triggered — see §Stop conditions).

---

## Locked inputs

- [`docs/WizField_Growth_Center_Marketing_Master_Plan.md`](docs/WizField_Growth_Center_Marketing_Master_Plan.md)
- [`docs/WizField_Marketing_Growth_Center_Phase_2_Content_Studio_Feature_Card.md`](docs/WizField_Marketing_Growth_Center_Phase_2_Content_Studio_Feature_Card.md)
- [`docs/WizField_Marketing_Growth_Center_Phase_3_Publishing_Integrations_Feature_Card.md`](docs/WizField_Marketing_Growth_Center_Phase_3_Publishing_Integrations_Feature_Card.md)
- Accepted **Phase 3 Publishing Integrations audit** (architectural baseline: OAuth patterns, GBP `accounts.locations.localPosts`, Meta Page `feed`, IG container deferred, no in-repo queue today, Stripe webhook precedent for verified `POST` handling where relevant)

**Repo truth anchors (implementation must align):**

- [`backend/src/marketing/marketing.controller.ts`](backend/src/marketing/marketing.controller.ts) — Phase 2 routes; Phase 3 **adds** channel + publish surfaces without breaking existing contracts.
- [`backend/src/marketing/marketing-content.service.ts`](backend/src/marketing/marketing-content.service.ts) — draft/variant lifecycle; **`draft.scheduled_at` is not a publish trigger**.
- [`backend/src/database/entities/marketing-connected-channel.entity.ts`](backend/src/database/entities/marketing-connected-channel.entity.ts) — exists but **unused in services** today; **must be extended or complemented** per packages below.
- [`backend/src/database/entities/marketing-content-draft.entity.ts`](backend/src/database/entities/marketing-content-draft.entity.ts) / [`marketing-content-variant.entity.ts`](backend/src/database/entities/marketing-content-variant.entity.ts) — platform keys include **`instagram`**; **do not remove** IG variant seeding from Phase 2.
- [`backend/src/main.ts`](backend/src/main.ts) — `rawBody` available (useful if any provider webhook is introduced later; **not required** for core Phase 3 if polling-only).
- [`backend/package.json`](backend/package.json) — **no** BullMQ/Redis queue today; dispatcher must respect **no new external queue** rule unless stop condition.

---

## Owner locked clarifications (non-negotiable)

1. **Instagram** — In data model + UI as **deferred (Coming Soon / V1.5)**. **No** IG OAuth, selection, containers, media hosting, or IG publish. Preserve **`instagram`** variant rows from Phase 2.
2. **Scheduling** — **`publish_job.scheduled_at`** is authoritative. **`draft.scheduled_at`** is **editorial metadata only**. **Explicit** Publish Now / Schedule Publishing only; **prefill allowed**, **silent job creation forbidden**. **Do not** use Facebook native scheduling API (`scheduled_publish_time`) in Phase 3.
3. **Dispatcher** — Internal process with **DB claim/lease** or equivalent **safe transitions**; HTTP enqueues only. **Duplicate execution prevented**. **Retries deterministic**. **No Redis/Bull/external queue** unless §Stop conditions force escalation.
4. **Targets** — **One active GBP location** and **one active Facebook Page** per org (MVP). Schema may allow future multi-row; **product** enforces single active selection.
5. **Roles** — **owner/admin**: OAuth + target selection + disconnect/reconnect. **owner/admin/office_admin**: publish now, schedule, cancel, retry (per policy). **`dispatcher`**: **403** on Phase 3 publish + channel-management mutations (read-only marketing surfaces unchanged unless separately specified).

---

## Approved scope

### Included

- **Persistence:** migrations + [`schema-manifest`](backend/src/database/schema-manifest.ts) + [`typeorm.config`](backend/src/database/typeorm.config.ts) for:
  - extended **connected channel** representation suitable for **encrypted tokens**, expiry, scopes, selected target identifiers (`google_account_id`, `location_id`, `facebook_page_id`, etc. — exact columns per Package A design),
  - **`marketing_publish_jobs`** (org-scoped, FK to draft, status machine, **`scheduled_at`** for queued execution, idempotency fields),
  - **`marketing_publish_attempts`** (append-only audit of per-platform tries: timestamps, outcome, sanitized provider error envelope, optional external post id),
  - optional **`marketing_oauth_states`** or equivalent **short-lived CSRF/state** storage (TTL documented).
- **OAuth:** Google Business Profile + Meta login sufficient for **Facebook Page** token acquisition and Page publishing.
- **Publishing:** Map Phase 2 variant payloads → **provider MVP payloads** (text-first); document gaps where GBP/Facebook accept richer media later.
- **Execution:** Dispatcher loop/tick claiming **`queued`** jobs whose **`scheduled_at <= now`** (timezone policy documented — prefer UTC storage).
- **APIs:** Org-scoped authenticated endpoints per Feature Card expectations (listed in §API checklist below).
- **Frontend:** Real **`/marketing/channels`** for GBP + FB + deferred IG card; composer/out overlay for publish + status; overview hints for failures (minimal acceptable scope documented in DoD).
- **Security:** Encrypt secrets at rest; never log raw tokens; bind OAuth `state` to org + TTL + single-use.

### Explicitly excluded (stop if tempted)

- Instagram publishing pipeline (**V1.5** track).
- Native Facebook scheduling delegation.
- CRM/opportunity/campaign/automation/analytics expansion beyond operational publish visibility.
- Monetization entitlements for Growth Center publishing.
- AI generation or suggestion backends.
- Multi-target UX for GBP/Facebook in Phase 3 **product behavior**.
- **`dispatcher`** publishing or managing OAuth connections.

---

## Architectural inheritance (Phase 2 repo truth summary)

Phase 2 provides:

- **`approved`** drafts as publish-eligibility spine (with §Draft eligibility rules below).
- Three variants **`google_business`**, **`facebook`**, **`instagram`** — Phase 3 executes **GBP + Facebook only**; **skips Instagram** with explicit UI copy + structured logs (“skipped_platform_not_enabled”).
- **`draft.scheduled_at`** drives **calendar visualization only** — Phase 3 jobs **must not** subscribe to silent triggers from this field.

`MarketingConnectedChannelEntity` today lacks token ciphertext, refresh/expiry columns, and normalized target FKs — **Package A must rectify**.

---

## Draft eligibility rules (Phase 3 — precise)

| Rule | Behavior |
|------|----------|
| Workflow gate | Only **`approved`** drafts may enqueue publish jobs (reject `draft` / `needs_review`). |
| Explicit intent | **`Publish Now`** → job with **`scheduled_at ≈ now`** (immediate eligibility on next dispatcher tick). **`Schedule Publishing`** → job with user-chosen **`publish_job.scheduled_at`**. |
| Draft calendar field | **`draft.scheduled_at`** may **prefill** schedule UI **only**; **never** creates or executes jobs implicitly. |
| Partial connectivity | If Facebook disconnected, attempt GBP only if connected — job outcome **`partial`** or **`failed`** per deterministic rules documented in code + tests. |
| Instagram | Always **skipped** with explicit attempt reason **`deferred_v1_5`** (or equivalent canonical code) — **no OAuth**. |
| Idempotency | Prevent duplicate **`queued`** jobs for same `(organization_id, draft_id, publish_intent)` per documented uniqueness — owner may allow **deliberate republish** via explicit second job after terminal success if product confirms (default: **block duplicate queued** until prior terminal state unless user confirms override — pick one and test). |

---

## API checklist (authenticated unless noted)

Implement endpoints consistent with Nest patterns and **`SessionGuard`**. **Org scope:** always **`actor.organization_id`**.

| Endpoint | Purpose | Roles |
|---------|---------|-------|
| `GET /api/marketing/channels` | List connection cards + health + selected targets | office roles read (existing Phase 2 gate); clarify whether **dispatcher** may read — **default yes read, no mutate** |
| `POST /api/marketing/channels/google/start-oauth` | Start Google OAuth | owner, admin |
| `GET /api/marketing/oauth/google/callback` | Exchange code; store tokens provisional | **Public callback** — integrity via signed state |
| `POST /api/marketing/channels/google/select-location` | Persist single selected location | owner, admin |
| `POST /api/marketing/channels/meta/start-oauth` | Start Meta OAuth for Pages | owner, admin |
| `GET /api/marketing/oauth/meta/callback` | Exchange code; enumerate pages; persist | **Public callback** |
| `POST /api/marketing/channels/meta/select-page` | Persist single selected Page | owner, admin |
| `POST /api/marketing/channels/:id/disconnect` | Revoke locally (+ remote revoke where supported) | owner, admin |
| `POST /api/marketing/channels/:id/reconnect` | Re-run OAuth handoff | owner, admin |
| `POST /api/marketing/drafts/:draftId/publish-now` | Enqueue immediate job | owner, admin, office_admin |
| `POST /api/marketing/drafts/:draftId/publish-schedule` | Enqueue future job (**body.scheduled_at**) | owner, admin, office_admin |
| `POST /api/marketing/publish-jobs/:jobId/cancel` | Cancel queued job not yet leased/running | owner, admin, office_admin |
| `GET /api/marketing/publish-jobs` | List jobs | owner, admin, office_admin |
| `GET /api/marketing/publish-jobs/:jobId` | Detail + attempts | owner, admin, office_admin |
| `POST /api/marketing/publish-attempts/:attemptId/retry` | Controlled retry **only if policy allows** | owner, admin, office_admin |

**`dispatcher`:** **`403`** on all mutation rows above + publish endpoints.

Exact paths may be renamed for REST consistency — **document final routes** in changelog.

---

## Implementation packages (safe slicing)

Recommended execution order:

| Package | Contents |
|---------|----------|
| **A — Data model + secrets scaffolding** | Migrations for publish tables + extend connected channel columns; encrypt/decrypt helper boundary; schema-manifest/typeorm wiring; smoke migration revert dry-run notes. |
| **B — OAuth + target selection (GBP + Meta)** | Start/callback/state TTL; token persistence; RBAC enforcement; **`GET channels`** summary; frontend **`/marketing/channels`** for GBP + FB + IG deferred card — **no publish yet**. |
| **C — Publish job API surface** | Create job endpoints (publish now / schedule / cancel); validation rules; **no dispatcher yet** except stub transition tests — optional intermediate checkpoint. |
| **D — Dispatcher + leasing** | Claim `queued` jobs, transition `running`, timeout stale leases, finalize terminal states; deterministic duplicate guards; unit/integration tests around transitions. |
| **E — GBP executor** | Map variant → local post MVP; attempts logging; retries classification. |
| **F — Facebook executor** | Page token usage; **`feed`** immediate publish path only; attempts + retries; respect Meta permission errors as non-retry vs retry. |
| **G — Frontend publish UX** | Composer buttons + schedule modal + status surfaces + IG deferred styling; overview minimal failure badge optional per DoD. |

Packages **E/F** may parallelize behind **D** with contract tests.

---

## Likely file inventory (preliminary)

**Backend**

- [`backend/src/marketing/marketing.module.ts`](backend/src/marketing/marketing.module.ts) — wire new services/controllers/providers.
- New: `marketing-channels*.ts`, `marketing-oauth*.ts`, `marketing-publish*.ts`, `marketing-dispatcher*.ts`, provider clients (`google-business*.ts`, `meta-graph*.ts`).
- [`backend/src/database/migrations/active/`](backend/src/database/migrations/active/) — new migration(s).
- Entities alongside [`marketing-connected-channel.entity.ts`](backend/src/database/entities/marketing-connected-channel.entity.ts).

**Frontend**

- [`frontend/components/marketing/marketing-foundation-workspace.tsx`](frontend/components/marketing/marketing-foundation-workspace.tsx) — channels route becomes functional section.
- [`frontend/lib/marketing/client-marketing.ts`](frontend/lib/marketing/client-marketing.ts) — expand API client.
- [`frontend/app/marketing/[[...slug]]/page.tsx`](frontend/app/marketing/[[...slug]]/page.tsx) — pass-through unchanged unless props needed.

**Config / env**

- Google OAuth client id/secret, redirect URIs.
- Meta app id/secret, redirect URIs.
- Token encryption key material (document rotation posture).

**Protected areas**

- **Billing / Stripe webhooks** — do not regress [`billing-webhook.controller.ts`](backend/src/billing/billing-webhook.controller.ts) signature verification patterns when touching global middleware.
- **Session / actor semantics** — preserve [`SessionGuard`](backend/src/auth/session.guard.ts) expectations; never trust client org id.
- **Phase 2 behavior** — invalidation rules on drafts/variants unchanged unless additive migrations only.

---

## Risk register

| ID | Risk | Mitigation |
|----|------|------------|
| R1 | Meta **App Review / verification** delays live publishing | Ship **code-complete** with sandbox/manual verification checklist; document **staging toggle** if needed |
| R2 | Google GBP API surface/version churn | Pin documented REST/RPC family per integration spike; isolate client adapter |
| R3 | Token leakage via logs/errors | Structured errors strip secrets; redaction tests |
| R4 | OAuth CSRF / wrong-org binding | Signed single-use `state` rows + TTL |
| R5 | Duplicate publishes on retries | Idempotency keys + external post id capture |
| R6 | Dispatcher multi-instance races | Lease columns + heartbeat + stale reclaim |
| R7 | Phase 3 scope creep into IG | Lint/feature flags + explicit skip codes in executor |
| R8 | **`dispatcher`** accidental exposure | Controller guard matrix tests |

---

## Test plan

### Automated / CI

- Unit tests: job state transitions; lease expiry reclaim; RBAC decorators/guards per endpoint (matrix).
- Integration tests (where feasible without secrets): mocked provider HTTP adapters — classify retry vs fatal errors.

### Manual / staged

- OAuth happy paths **Google** + **Meta** with real apps (**owner/admin** only).
- Publish Now **GBP** + **Facebook** from **`approved`** draft with both connected vs partial connectivity.
- Schedule Publishing: verify job fires **after** wall-clock threshold (UTC documented).
- Failure injection: revoked token → reconnect flow; Meta rate-limit simulated → backoff respected.
- **`dispatcher`** session: verify **403** on mutations.

### Code-complete vs live-provider verified

Track separately:

- **Code-complete:** migrations apply; builds green; mocked executor tests pass; UI wired.
- **Live-provider verified:** successful posts visible in GBP UI + Facebook Page feed using production-approved credentials — **may lag** behind merge if review pending; document gap in release notes **without claiming false completeness**.

---

## Rollback strategy

1. **Forward fix preferred** for isolated regressions (disable publish endpoints via env kill-switch if implemented).
2. **Migration rollback:** maintain reversible `down()` ordering consistent with FK dependencies (attempts → jobs → oauth states → alter channels).
3. **Feature disable:** env **`MARKETING_PUBLISH_DISPATCHER_ENABLED=false`** (recommended additive flag) stops leasing without tearing OAuth tokens — document behavior (queued jobs stall vs fail-fast — pick one explicitly during Package D).

---

## Stop conditions (must escalate — do not silently add infra)

1. **Dispatcher correctness cannot be guaranteed** without external queue **after documented spike** — produce decision memo with evidence (multi-instance chaos reproduction).
2. **Instagram creep** — any IG OAuth/media PR **blocks** Phase 3 closure until reverted or moved to **V1.5** branch.
3. **Facebook native scheduling** introduced — violates owner lock; revert.

---

## Definition of Done — `PHASE 3 PUBLISHING INTEGRATIONS — COMPLETE`

**Core product**

- [ ] **Google:** OAuth → select **one** location → disconnect/reconnect semantics (**owner/admin**).
- [ ] **Facebook:** OAuth → select **one** Page → disconnect/reconnect (**owner/admin**).
- [ ] **Instagram:** Channels UI shows **Coming Soon / V1.5**; variants untouched; executor never calls IG endpoints.
- [ ] **Publish Now** (`owner/admin/office_admin`): creates job → dispatcher executes GBP + FB attempts where connected.
- [ ] **Schedule Publishing**: **`publish_job.scheduled_at`** authoritative; **`draft.scheduled_at`** never triggers execution alone (automated test proving absence).
- [ ] **No Facebook native scheduling API** usage — grep/doc checkpoint.
- [ ] **Attempts** persisted per platform try; failures visible in UI/API with sanitized payloads.
- [ ] **Retry policy** documented + tested for retryable vs terminal failures.
- [ ] **Duplicate execution** prevented via lease + idempotency rules.
- [ ] **`dispatcher`** cannot mutate channels or publish routes (**403**).

**Engineering quality**

- [ ] Backend + frontend **`npm run build`** succeed.
- [ ] **`npm run schema:verify`** passes after migrations (or repo-standard schema gate).

**Operational honesty**

- [ ] README or internal runbook lists Google Cloud + Meta app setup, redirect URIs, and **live verification status** checklist distinguishing **code-complete** vs **production-verified**.

---

PHASE 3 EXECUTION PROMPT — READY FOR IMPLEMENTATION PLANNING
