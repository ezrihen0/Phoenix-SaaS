# WizField Marketing Growth Center
## Phase 3 — Publishing Integrations Feature Card

**Feature:** Growth Center `/marketing` Phase 3 — **Publishing Integrations (V1)** for **Google Business Profile** and **Facebook Pages**, with **WizField-owned publish jobs**, explicit OAuth/target lifecycle, publish-now and schedule-later execution, attempts/failures/retries, and honest operational boundaries for external verification gaps.

**Why now:** Phase 2 Content Studio ships **manual drafts**, **three platform variants** (`google_business`, `facebook`, `instagram`), **review workflow ending in `approved`**, and **editorial calendar metadata** (`draft.scheduled_at`) with **no outbound publishing**. Phase 3 closes the first **real publish loop** for GBP + Facebook while **preserving architecture** for Instagram **V1.5** without blocking Phase 3 core delivery.

**Priority:** Approved successor to Phase 2; bounded to Phase 3 core + deferred Instagram surfacing only.

**Business value:** Org-owned channel connections and trustworthy publish execution increase Growth Center retention (connected channels + scheduled posts as switching costs per master plan narrative).

**Monetization value:** Not wired in Phase 3 unless explicitly authorized later; prefer honest capability shipping before SKU gates.

---

## Strategic alignment

- [`docs/WizField_Growth_Center_Marketing_Master_Plan.md`](docs/WizField_Growth_Center_Marketing_Master_Plan.md) — `/marketing/channels`, Phase 3 roadmap, channel card expectations (§13), tenant ownership (§18–19).
- [`docs/WizField_Marketing_Growth_Center_Phase_2_Content_Studio_Feature_Card.md`](docs/WizField_Marketing_Growth_Center_Phase_2_Content_Studio_Feature_Card.md) — Phase 2 hard boundary explicitly excludes OAuth/publish; Phase 3 begins **after** that closure.
- Accepted **Phase 3 PLAN MODE audit** (Publishing Integrations) — architectural baseline for OAuth surfaces, provider realities, job model, and risks; superseded where **this Feature Card’s owner locks** are stricter.

---

## Owner locked decisions (Phase 3 — non-negotiable)

### 1. Instagram scope

**In Phase 3 infrastructure (must not delay core closure):**

- Retain platform key **`instagram`** and Phase 2 **variant rows** unchanged.
- Design **connected-channel** and **publish-job / attempt** models so Instagram can attach in **V1.5** without schema churn (nullable/disabled paths, explicit platform guards).
- **`/marketing/channels`**: Instagram row/card **visible** as **`Coming Soon`** or **`V1.5`** — **no live actions**.

**Excluded from Phase 3 (V1.5 follow-on):**

- Instagram OAuth, account selection, Meta media-container publishing, IG image/video publishing, media-hosting bridge for Instagram.

### 2. Scheduling model

- **`draft.scheduled_at`** remains **editorial calendar metadata only** — **never** auto-creates or executes publish jobs.
- Publishing occurs **only** on explicit user actions: **`Publish Now`** or **`Schedule Publishing`**.
- **`publish_job.scheduled_at`** is the **authoritative execution time** for scheduled delivery.
- UI may **prefill** schedule UI from `draft.scheduled_at`; silent auto-queue is **forbidden**.

### 3. Background execution

- **WizField internal dispatcher** with **DB-safe claim/lease** (or equivalent state machine) as **authority**.
- HTTP handlers **enqueue** work; execution **must not** depend on request lifecycle completion.
- **No Redis / BullMQ / external queue** unless execution surfaces a **documented blocker** and stops for owner decision.

### 4. Target model (MVP)

- **One active selected publishing target per platform per organization:** one **GBP location**, one **Facebook Page**.
- Schema **must not foreclose** future multi-target rows; **product behavior** this phase is single-target only.

### 5. Roles

| Capability | Roles |
|------------|--------|
| OAuth connect / reconnect / disconnect / target selection | **`owner`**, **`admin`** only |
| Publish now / schedule publishing / cancel scheduled / retry failed publish | **`owner`**, **`admin`**, **`office_admin`** |
| **`dispatcher`** | **Must not** perform external publish or channel-management APIs in Phase 3 |

### 6. Phase 3 completion target

Ship a **complete V1 publishing system** for **GBP + Facebook** with lifecycle, targets, publish-now, WizField-scheduled jobs, attempts, failures, retries/non-retry policy, frontend status visibility, and **operationally honest** handling where live verification is limited by credentials or Meta/Google app-review gates.

Instagram: **architecturally preserved**, **visibly deferred**.

---

## Scope included

- Extend **`marketing_connected_channels`** usage (and related tables per Execution Prompt) for **encrypted token storage**, connection health, selected target refs (**GBP location**, **Facebook page**).
- OAuth **start + callback** flows for **Google** and **Meta (Facebook Page)** only; **CSRF-safe state** binding to org context.
- **Publish job** + **publish attempt** persistence; dispatcher execution; deterministic duplicate prevention + retry rules.
- Provider clients / HTTP integration for **GBP local posts (MVP mapping)** and **Facebook Page feed posts** — **immediate publish only at Meta** (no native FB scheduling API use in Phase 3).
- APIs and UI for **`/marketing/channels`** (real connect/disconnect/reconnect + deferred Instagram card).
- **`/marketing/create`** and overview/calendar surfaces: publish actions + job status (**honest partial failure** UX).
- Tenant safety: **session org only** for ACL; no trusting client-supplied `organization_id` for authorization.

---

## Scope excluded (hard boundary)

- Instagram live publishing stack (Phase **V1.5**).
- **Facebook native scheduled posts** (`scheduled_publish_time`) — scheduling is **WizField job** only.
- CRM opportunity detection, campaigns, marketing automations/autopilot, analytics beyond **operational publish status**, monetization packaging, AI content generation.
- Multi-location GBP / multi-page Facebook **in product behavior** (may not add UX for switching multiple active targets).
- **`dispatcher`** channel management or publish APIs.

---

## Done when (acceptance summary)

See [`docs/WizField_Marketing_Growth_Center_Phase_3_Publishing_Integrations_Execution_Prompt_PLAN_MODE.md`](docs/WizField_Marketing_Growth_Center_Phase_3_Publishing_Integrations_Execution_Prompt_PLAN_MODE.md) for full **Definition of Done**, **test plan**, **risk register**, **rollback**, and **stop conditions**.

**Elevator checklist:**

- GBP + Facebook: connect → select target → disconnect/reconnect semantics work for **owner/admin**.
- **office_admin** can publish/schedule/cancel/retry where spec allows; **dispatcher** blocked on those routes.
- **Publish Now** and **Schedule Publishing** create jobs; **`draft.scheduled_at` alone** never runs a job.
- Dispatcher runs with **lease/claim**; no duplicate concurrent success for same job without explicit retry policy.
- Attempts logged; failures visible; retry policy deterministic.
- Instagram card **Coming Soon / V1.5**; variants unchanged; no IG OAuth or media pipeline.
- Builds + schema verification green; **code-complete** vs **live-provider verified** called out in test report where applicable.
