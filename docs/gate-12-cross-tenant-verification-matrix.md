# Gate 12 — Cross-tenant verification matrix

**Operator enablement:** See [gate-12-recovery-verification-enablement.md](./gate-12-recovery-verification-enablement.md) (MySQL smoke credentials; fixture checklist). **No** `package.json` script changes in that package.

**Legend:** **P0** = must pass for limited beta under **current** Gate 12 rules (no conditional GO if missing).  
**Status values:** PASS | FAIL | **NOT RUN** (equivalent: **NOT EXECUTED**) | **BLOCKER** | **WAIVED** (formal Gate 12 scope amendment only)

**Gate 12 acceptance criteria (Section I):** Under **Path B** ([gate-12-section-i-scope-amendment.md](./gate-12-section-i-scope-amendment.md)), **I1 / I2 / I5** (self-serve signup, first org self-serve, second org self-serve) are **waived** for this dev/test closure; **I3 / I4 / I6** remain **P0**. Without Path B, self-serve **I1–I5** remain mandatory and “missing in UI” is a **readiness blocker**, not a neutral skip.

**Execution status (2026-05-12 initial):** Runtime **P0** rows for tenancy matrix were **NOT RUN**; self-serve rows **BLOCKER** / **NOT RUN**. **NO-GO.**

**Re-verification (2026-05-13, approved preview):** All four isolation smokes **re-run** — still **`ok: false`** at `databaseCreate` (`Access denied for user 'phoenix'@'%'`). Manual matrix rows **A–H** and **I3/I4/I6** remained **NOT RUN** in that earlier pass. **Path B** filed 2026-05-13 — **I1/I2/I5** → **WAIVED**.

**Final continuation (2026-05-13):** Fixture SQL [gate-12-fixture-bootstrap.sql](./gate-12-fixture-bootstrap.sql) was **patched** (removed `organization_billing`, removed hardcoded `USE`) and applied to `phoenix_crm_rebase_run_20260512`. Dedicated local MySQL user `phoenix_smoke` was created and all four smokes returned **`ok: true`**. Runtime evidence for booking / portal / search / dashboard / settings was captured. **Exact remaining blocker:** normal **multi-org User1 login** fails with `organization_membership_missing`, so the required product sign-in path for final multi-org acceptance is still **NO-GO**.

---

## Topology

| Actor | Organizations |
|--------|----------------|
| User 1 | Org A (membership), Org B (membership) |
| User 2 | Org C (membership only) |

### Owner clarification — fixture data and deployment (*)

For the **current** Gate 12 closure attempt, **runtime verification may use mock or seeded test data** for this topology and all matrix fixtures. **Tenant-isolation requirements are not weakened:** every **P0** check must still **PASS**. **GO / NO-GO rules are unchanged** except that **non-production fixture data is acceptable** for the verification topology.

Gate 12 may be verified and closed in the current development/test environment using mock or seeded fixture data. However, once Phoenix_SaaS is connected to a real public domain and live backend / production-like environment, a mandatory focused Gate 12 re-verification must be executed before inviting real beta users or treating the beta environment as externally ready.

That follow-on pass is **not** a full restart of Gate 12 architecture work; it is a **mandatory production-like runtime confidence check**. At minimum it must re-check: **(1)** public booking on the real domain, **(2)** portal / magic-link on the real domain, **(3)** auth/session on the deployed backend, **(4)** org switching with the 3-org topology or equivalent controlled accounts, **(5)** direct cross-tenant access negatives, **(6)** relevant smokes, builds, and deployment evidence if applicable. Full wording: [gate-12-beta-readiness-security-audit.md](./gate-12-beta-readiness-security-audit.md) §1a.

---

## A. Auth and active organization (P0)

| # | Check | User / Org context | Expected | Status |
|---|--------|-------------------|----------|--------|
| A1 | `GET /api/auth/session` | Logged in | `active_organization` matches session row `active_organization_id` | **PASS** (seeded session) |
| A2 | `POST /api/auth/active-organization` with Org C id | User 1 | 403 + `organization_access_forbidden` (or equivalent) | **PASS** |
| A3 | `POST /api/auth/active-organization` with Org B id | User 1 | Success; subsequent CRM scoped to B | **PASS** |
| A4 | Permissions | After switch | Match **membership** for active org, not another org | **PASS** (owner permissions remained owner-scoped) |
| A5 | Session refresh / cookie | After switch + refresh | Active org unchanged until explicit switch | **PASS** (repeat session read retained Org B) |

*Implementation note (static):* `AuthService.switchActiveOrganization` loads actor with requested org and returns 403 if no membership ([backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts)).

---

## B. Gate 11 org switcher regression (P0)

| # | Check | Expected | Status |
|---|--------|----------|--------|
| B1 | Single membership | Label only; no misleading switch menu | **NOT RUN** |
| B2 | Zero eligible orgs | Empty state + Settings link (per G11 contract) | **NOT RUN** |
| B3 | Multi-org switch | Full navigation to `/home`; header shows new org | **NOT RUN** |
| B4 | Technician variant | Switcher behaves; lands per role contract | **NOT RUN** |
| B5 | Stale data | After switch, lists/dashboard not showing prior org rows | **NOT RUN** |

---

## C. Core tenant isolation — foreign ID / cross-org (P0)

For each entity, verify: create scoped; list scoped; read/update/delete by **foreign** org id fails; cross-org FK assignment fails.

| Entity / surface | Create org-scoped | List org-scoped | Read foreign ID | Update foreign ID | Delete foreign ID | FK cross-org | Status |
|------------------|-------------------|-----------------|-----------------|-------------------|-------------------|--------------|--------|
| Customers | REQ | REQ | REQ | REQ | REQ (if exposed) | REQ | **NOT RUN** |
| Leads | REQ | REQ | REQ | REQ | REQ | REQ | **NOT RUN** |
| Jobs | REQ | REQ | REQ | REQ | REQ | REQ | **NOT RUN** |
| Estimates / quotes | REQ | REQ | REQ | REQ | REQ | REQ | **NOT RUN** |
| Invoices | REQ | REQ | REQ | REQ | REQ | REQ | **NOT RUN** |
| Payments (if exposed) | REQ | REQ | REQ | REQ | REQ | REQ | **NOT RUN** |
| Technician assignment (if exposed) | — | — | REQ | REQ | — | REQ | **NOT RUN** |
| Inspections / reports (if active) | REQ | REQ | REQ | REQ | REQ | REQ | **NOT RUN** |
| Pricebook / inventory (spot) | REQ | REQ | REQ | REQ | REQ | REQ | **NOT RUN** |

*Static sample (not a substitute for matrix execution):* `getLead`, `getCustomer` use `where: { id, organization_id: activeOrg }` in [backend/src/crm/crm.controller.ts](../backend/src/crm/crm.controller.ts).

---

## D. Search and dashboard (P0)

| # | Check | Expected | Status |
|---|--------|----------|--------|
| D1 | `GET /api/search?q=...` as User1 Org A | No Org B/C hits | **PASS** |
| D2 | Same user Org B | No Org A/C hits | **PASS** |
| D3 | Office dashboard aggregates | Scoped to active org | **PASS** |
| D4 | After org switch | Dashboard counts change; no leak | **PASS** |

*Static note:* [backend/src/search/search.controller.ts](../backend/src/search/search.controller.ts) requires `organization_id`; [SearchService.search](../backend/src/search/search.service.ts) takes `organizationId` into query context.

---

## E. Portal and public links (P0)

| # | Check | Expected | Status |
|---|--------|----------|--------|
| E1 | Valid magic link redeem | Session binds to correct customer/org context | **NOT RUN** |
| E2 | Invalid / expired token | Safe failure; no session | **NOT RUN** |
| E3 | Token cannot cross orgs | Org A link cannot access Org B customer | **NOT RUN** |
| E4 | No bare public CRM ID route | No tenant resource without auth/portal session | **NOT RUN** (spot URL review) |

---

## F. Public booking (P0)

| # | Check | Expected | Status |
|---|--------|----------|--------|
| F1 | Valid slug | Lead created with resolved org’s `organization_id` | **NOT RUN** |
| F2 | Invalid / inactive slug | 404 / safe error; no default org | **NOT RUN** |
| F3 | Cross-slug | Booking for slug A does not attach to org B | **NOT RUN** |

*Static note:* [public-bookings.service.ts](../backend/src/public/public-bookings.service.ts) resolves org by slug + `is_active`; rejects unknown without leaking.

---

## G. Calls / SMS / telephony (P0 where applicable)

| # | Check | Expected | Status |
|---|--------|----------|--------|
| G1 | Automated isolation smoke | `ok: true` | **PASS** |
| G2 | Inbound number → org | Correct mapping | **NOT RUN** |
| G3 | Unknown inbound | No wrong-org rows | **NOT RUN** |
| G4 | Outbound | Cannot send as another org’s number | **NOT RUN** |

---

## H. Settings, branding, documents (P0)

| # | Check | Expected | Status |
|---|--------|----------|--------|
| H1 | Org A settings change | Org B/C unchanged | **PASS** |
| H2 | Branding per org | Correct tenant branding | **NOT RUN** (UI branding not browser-verified) |
| H3 | Document / snapshot rules (Gate 9) | Isolation smoke `ok: true` | **PASS** |

---

## I. Self-serve onboarding (**P0**; Path B amendment 2026-05-13)

**Path B:** [gate-12-section-i-scope-amendment.md](./gate-12-section-i-scope-amendment.md) **waives** **I1**, **I2**, and **I5** for this Gate 12 dev/test closure only. **I3**, **I4**, and **I6** remain **mandatory** (mock/seed topology allowed per §1a in audit). **§1a** mock/seed and **mandatory domain + backend re-verification (*)** asterisk remain unchanged.

| # | Check | Expected | Status | Notes |
|---|--------|----------|--------|--------|
| I1 | New user signup (self-serve) | (waived) | **WAIVED** | Path B — provisioned users allowed. |
| I2 | First organization creation (self-serve) | (waived) | **WAIVED** | Path B — seed/admin orgs allowed. |
| I3 | Owner membership init | Owner (or equivalent) on first org | **BLOCKER** | User1 normal password login fails with `organization_membership_missing`; seeded session shows owner role once an active org is forced. |
| I4 | Active org initialization | Session shows first org | **PASS** (seeded session) | Active org A loaded correctly once session existed. |
| I5 | Second organization creation (self-serve) | (waived) | **WAIVED** | Path B — second membership may be seed-created. |
| I6 | Switch between two organizations | `/home` reload; no stale data | **BLOCKER** | API switch + backend scoping pass, but normal User1 sign-in path is broken so final product acceptance cannot be signed off. |

---

## Build / automation summary (includes 2026-05-13 re-verification)

| Command | Result (latest re-run) |
|---------|-------------------------|
| `npm.cmd run build --workspace backend` | PASS |
| `npm.cmd run build --workspace frontend` | PASS |
| `inspections:isolation:smoke` | PASS |
| `document-snapshot:isolation:smoke` | PASS |
| `telephony-messaging:isolation:smoke` | PASS |
| `public-booking:isolation:smoke` | PASS |
