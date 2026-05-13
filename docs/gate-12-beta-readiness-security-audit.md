# Gate 12 — Beta readiness and security audit

**Product:** Phoenix_SaaS  
**Gate:** 12 — Beta Readiness + Security Audit (verification only; **no application code changes** in this package)  
**Initial audit date:** 2026-05-12  
**Re-verification run (toward GO):** 2026-05-13 — executed per approved preview; evidence in [gate-12-verification-log.md](./gate-12-verification-log.md) § “Re-verification run”.  
**TypeORM:** Active execution path (per gate constraints). **Billing:** Out of scope. **Prisma:** Not used as active runtime path.

---

## 1. Mission and scope

**Mission:** Establish whether the platform is **genuinely beta-ready** and **tenant-safe** for limited external users, using:

- **3-org topology:** User 1 → Org A + Org B; User 2 → Org C  
- **Gate 11** regression checks (org switcher, stale data)  
- **Core isolation**, search, dashboard, portal, public booking, telephony, settings/docs  
- **Self-serve onboarding** (required under the **current** Gate 12 acceptance criteria): self-serve **signup**, **first-organization creation**, **second-organization creation** *or* a **formal, documented** Gate 12 scope change that names which of those items are out of scope for this beta — this audit does **not** relax criteria; it records evidence against them.

**Out of scope:** Feature work, redesign, broad refactors, billing, global rename, package installs, Prisma runtime. *(Documentation-only updates to Gate 12 deliverables are in scope.)*

---

## 1a. Gate 12 — Owner clarification: fixture data and post-deployment re-verification

### Fixture data (current closure attempt)

For the **current** Gate 12 closure attempt, **runtime verification may use mock or seeded test data** for: User1 → Org A + Org B; User2 → Org C; and customers, leads, jobs, invoices, search markers, booking slugs, portal tokens, and other fixtures required by the Gate 12 matrix and owner acceptance script. **This does not weaken tenant-isolation requirements:** all Gate 12 runtime checks, isolation smokes, public booking checks, portal checks, and org-switch verification must still **PASS** using that mock/seed topology. **GO / NO-GO rules are unchanged** except for this clarification that **non-production fixture data is acceptable** for identities and records used in the topology.

### Mandatory domain + backend re-verification (*)

Gate 12 may be verified and closed in the current development/test environment using mock or seeded fixture data. However, once Phoenix_SaaS is connected to a real public domain and live backend / production-like environment, a mandatory focused Gate 12 re-verification must be executed before inviting real beta users or treating the beta environment as externally ready.

This follow-on activity is **not** a full restart of Gate 12 architecture work. It is a **mandatory production-like runtime confidence check**. At minimum it must re-check:

1. Public booking route on the real domain  
2. Portal / magic-link route on the real domain  
3. Auth / session behavior on the deployed backend  
4. Org switching with the 3-org topology or equivalent controlled test accounts  
5. Direct cross-tenant access negatives  
6. Relevant smokes, builds, and deployment evidence if applicable  

Record evidence in the Gate 12 verification package (or a dated addendum) when performed.

---

## 2. Methodology

| Layer | Initial run (2026-05-12) | **Re-verification run (2026-05-13)** |
|--------|---------------------------|-------------------------------------|
| **Builds** | Backend + frontend **PASS** | Backend + frontend **PASS** (re-run) |
| **Automated isolation smokes** | All four **FAIL** at `databaseCreate` (`Access denied for user 'phoenix'@'%'`) | **Final continuation:** all four **PASS** with local `phoenix_smoke` credential |
| **Runtime 3-org / portal / booking / A–H manual** | **Not executed** | **Partially executed** — fixtures applied on `phoenix_crm_rebase_run_20260512`; portal, booking, search, dashboard, settings, and read-side cross-tenant checks ran; final closure blocked by multi-org User1 login failure |
| **Self-serve onboarding (I)** | Static review + **BLOCKER** | **Re-checked:** [auth.controller.ts](../backend/src/auth/auth.controller.ts) `@Post` routes = `login`, `logout`, `active-organization`, `staff` only — **no** `register` / signup; `frontend/app` grep: **no** signup/register/Create account route; **BLOCKER** unchanged; steps 29–34 **NOT RUN** end-to-end |
| **Static code spot-check** | CRM, auth switch, booking, search, portal | Unchanged sampling (no code edits) |

Deliverables: [gate-12-cross-tenant-verification-matrix.md](./gate-12-cross-tenant-verification-matrix.md), [gate-12-owner-acceptance-script.md](./gate-12-owner-acceptance-script.md), [gate-12-verification-log.md](./gate-12-verification-log.md), [gate-12-recovery-verification-enablement.md](./gate-12-recovery-verification-enablement.md) (verification enablement runbook), this document.

---

## 3. Findings by area

### A. Auth + active organization

- **Runtime:** Not verified this run.  
- **Static:** Session-backed active org; `switchActiveOrganization` rejects non-members with `organization_access_forbidden` when `loadActorContextByUserId` yields no org ([backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts)). `POST /api/auth/active-organization` in [auth.controller.ts](../backend/src/auth/auth.controller.ts).

### B. Gate 11 org switcher

- **Runtime:** Not verified this run.  
- **Static (prior implementation):** [organization-switcher.tsx](../frontend/components/organization-switcher.tsx) calls `setClientActiveOrganization` then `window.location.assign("/home")`. Contract documented in [gate-11-p0-ux-contract.md](./gate-11-p0-ux-contract.md).

### C. Core tenant isolation

- **Runtime:** Not verified (matrix NOT EXECUTED).  
- **Static sample:** Lead and customer fetches include `organization_id: organizationId` in `findOne` / `find` where clauses ([crm.controller.ts](../backend/src/crm/crm.controller.ts)).

### D. Search + dashboard

- **Runtime:** Not verified.  
- **Static:** Search API requires `request.actor.organization_id` or 400 ([search.controller.ts](../backend/src/search/search.controller.ts)); `SearchService.search(query, organizationId)` threads org into adapters.

### E. Portal / public links

- **Runtime:** Not verified.  
- **Static:** Redeem endpoint [customer-portal.auth.controller.ts](../backend/src/customer-portal/customer-portal.auth.controller.ts); read controller guarded by `PortalSessionGuard`. Frontend [access/[token]/page.tsx](../frontend/app/access/[token]/page.tsx) redeems then routes to `/portal`.

### F. Public booking organization resolution

- **Runtime smoke:** Failed (DB).  
- **Static:** Slug validated; inactive/unknown → `booking_unavailable` 404 path; leads saved with `organization_id` from resolved org ([public-bookings.service.ts](../backend/src/public/public-bookings.service.ts)).

### G. Telephony / SMS

- **Runtime smoke:** Failed (DB). No webhook test in this run.

### H. Settings / branding / documents

- **Runtime:** Not verified.  
- **Static:** Settings controller requires `actor.organization_id` ([settings.controller.ts](../backend/src/settings/settings.controller.ts)). Document snapshot smoke not run successfully.

### I. Self-serve onboarding (Gate 12 **product-readiness** / criterion gap)

**Path B (formal scope amendment — 2026-05-13):** For **this** Gate 12 closure in dev/test, the owner has **waived** self-serve **I1** (signup), **I2** (first-organization creation), and **I5** (second-organization creation). Full text: [gate-12-section-i-scope-amendment.md](./gate-12-section-i-scope-amendment.md). **I3, I4, I6** and all **A–H** requirements remain mandatory and must **PASS** at runtime when verification is executed.

**Evidence (reviewed product surface, for context only — waived items):**

- No public **signup / register** API on reviewed [auth.controller.ts](../backend/src/auth/auth.controller.ts); login UI is password-only ([login-form.tsx](../frontend/app/login/login-form.tsx)).

**Runtime:** **I3–I6** and **A–H** require a provisioned harness; see **§10** final closure attempt status.

---

## 4. Blocker report (confirmed product code defect — IDOR / similar)

**None (initial and re-verification).** No reproducible IDOR, missing filter, or booking/portal **code defect** was demonstrated. **No application code changes** were made.

---

## 5. Blockers that prevent GO (two classes)

### 5a. Environment / test-execution blockers

1. **Multi-org login regression:** `POST /api/auth/login` for **User1** (`gate12-user1@fixture.local`) returns **401** `organization_membership_missing` even though User1 has two active memberships (Org A + Org B). This blocks the required **normal product sign-in** path for Gate 12 multi-org runtime verification and prevents **GO** without application-code changes.  
2. **Remaining runtime rows blocked by (1):** Several runtime checks were executed successfully via seeded sessions, but the required end-user multi-org sign-in path is still broken.

### 5b. Section I — after Path B amendment (2026-05-13)

**Resolved by formal waiver:** Self-serve **I1**, **I2**, and **I5** are **out of scope** for this Gate 12 closure only ([gate-12-section-i-scope-amendment.md](./gate-12-section-i-scope-amendment.md)). **I3, I4, I6** remain **mandatory** and require runtime execution with the mock/seed topology.

Per owner instruction: **conditional GO is not allowed** when remaining **P0** verifications are missing or unmet → **NO-GO** until smokes and matrix/script runtime pass.

---

## 6. PASS / FAIL summary (final closure attempt, 2026-05-13)

| Category | Result |
|----------|--------|
| Backend build | **PASS** (re-run) |
| Frontend build | **PASS** (re-run) |
| Inspections isolation smoke | **PASS** (`ok: true`) |
| Document snapshot isolation smoke | **PASS** (`ok: true`) |
| Telephony messaging isolation smoke | **PASS** (`ok: true`) |
| Public booking isolation smoke | **PASS** (`ok: true`) |
| Fixture SQL apply | **PASS** on `phoenix_crm_rebase_run_20260512` |
| Public-access manual (portal + booking) | **PASS** |
| Search / dashboard / settings runtime | **PASS** via seeded session |
| Owner script sections requiring normal User1 multi-org sign-in | **BLOCKER** |
| Self-serve onboarding | **I1/I2/I5:** **WAIVED** (Path B amendment). **I3/I4/I6:** **BLOCKER** because User1 cannot complete normal multi-org login |
| Final closure verdict | **NO-GO** — see §8 and §10 |

---

## 7. Unresolved risks (carry until next run)

- Tenant isolation **not empirically proven** in this environment until matrix **A–H** and smokes **PASS** on a running stack.  
- Telephony and document pipelines **unverified** until isolation smokes succeed.  
- **Mandatory domain + backend re-verification (*)** still applies after public deployment (§1a unchanged).

---

## 8. Verdict

### **NO-GO for limited beta** — **final closure attempt (2026-05-13)**

**Gate 12 is not GO in the development/test environment** for this attempt. **Exact remaining blockers:**

1. **Multi-org login (P0):** `POST /api/auth/login` for **User1** returns **401** `organization_membership_missing` even though the fixture topology and memberships exist in the active app DB. This is the exact remaining blocker for Gate 12 **GO**.  
2. **Closure consequence:** Because normal multi-org sign-in is broken, the remaining User1-driven Gate 11 / Gate 12 runtime acceptance path cannot be signed off as a real product flow without an application fix.

**Path B note:** **I1 / I2 / I5** are **waived** per [gate-12-section-i-scope-amendment.md](./gate-12-section-i-scope-amendment.md); they are **not** blockers for GO once all other **P0** items **PASS**.

### Next steps (remediation — Gate 12 only)

1. Fix the multi-org login path so a user with more than one active membership can complete normal password sign-in and receive an active organization context.  
2. Re-run the already-prepared Gate 12 runtime pass with the existing fixtures, smoke user, and docs package.  
3. Append the post-fix evidence to [gate-12-verification-log.md](./gate-12-verification-log.md).

---

## 9. Gate 12 completion statement

**Gate 12 is not complete** for beta sign-off in dev/test for this closure attempt. **NO-GO.** When blockers (1) and (2) above are cleared and evidence shows all **non-waived P0** checks **PASS**, a future update may declare **GO — Gate 12 complete in development/test environment** (mock/seed policy and deployment asterisk in §1a remain in force).

---

## 10. Final closure execution package (2026-05-13) — what was delivered

| Deliverable | Status |
|-------------|--------|
| [gate-12-section-i-scope-amendment.md](./gate-12-section-i-scope-amendment.md) (Path B) | **Filed** |
| [gate-12-fixture-bootstrap.sql](./gate-12-fixture-bootstrap.sql) (3-org + customers + leads + portal hashes) | **Patched and executed** on `phoenix_crm_rebase_run_20260512` |
| Isolation smokes ×4 | **PASS** with `phoenix_smoke` |
| Backend / frontend builds | **PASS** |
| Owner script A–H runtime | **Partially executed** — final product sign-in path blocked by User1 multi-org login failure |
| Matrix runtime rows | **Partially executed** — public booking / portal / search / dashboard / settings evidence captured; final GO blocked by multi-org login |
