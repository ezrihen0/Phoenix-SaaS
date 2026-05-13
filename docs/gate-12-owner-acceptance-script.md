# Gate 12 — Owner acceptance script

**Purpose:** Final human verification for **limited beta** readiness and **tenant safety**, including Gate 11 multi-org UX and section **I** (owner membership, active org, org switch) per **Path B** [gate-12-section-i-scope-amendment.md](./gate-12-section-i-scope-amendment.md) where **I1/I2/I5** are waived for this dev/test closure.  
**Prerequisites:** MySQL-backed environment; **User 1** with memberships on **Org A** and **Org B**; **User 2** on **Org C** only (use [gate-12-fixture-bootstrap.sql](./gate-12-fixture-bootstrap.sql) or equivalent); HTTP client (browser devtools or curl) for API negatives; optional second browser profile. **Before first run:** complete DB + fixture enablement per [gate-12-recovery-verification-enablement.md](./gate-12-recovery-verification-enablement.md) (smoke-capable MySQL principal; fixture identifiers in [gate-12-verification-log.md](./gate-12-verification-log.md)). The fixture SQL no longer hardcodes `USE`; execute it against the active app DB explicitly (current local detection: `phoenix_crm_rebase_run_20260512`).

**P0 rule:** Any section marked **(P0)** that cannot be run to completion → **STOP** and record **NO-GO** until executed and passing (no conditional GO).

### Owner clarification — mock/seed fixtures and deployment (*)

**Mock/seed acceptance (current closure):** User1 / User2, orgs A/B/C, and all CRM, booking, portal, and search fixtures **may** be **mock or seeded test data** in the development/test environment. **Isolation and behavioral requirements are unchanged** — all **P0** checks, smokes, booking, portal, and org-switch steps must still **PASS**. **GO / NO-GO rules are unchanged** except that **fixture data need not be real external beta users**.

**Mandatory domain + backend re-verification (*):** Gate 12 may be verified and closed in the current development/test environment using mock or seeded fixture data. However, once Phoenix_SaaS is connected to a real public domain and live backend / production-like environment, a mandatory focused Gate 12 re-verification must be executed before inviting real beta users or treating the beta environment as externally ready. That pass is **not** a full Gate 12 architecture restart; it is a **mandatory production-like runtime confidence check** covering at minimum: public booking and portal/magic-link on the real domain; auth/session on the deployed backend; org switching (3-org or equivalent); cross-tenant negatives; smokes/builds/deployment evidence as applicable. See [gate-12-beta-readiness-security-audit.md](./gate-12-beta-readiness-security-audit.md) §1a for the canonical checklist.

---

## 0. Environment and accounts (P0)

1. Confirm database URL and backend/frontend builds succeed (`npm.cmd run build --workspace backend` and `frontend`).
2. Confirm **User 1** can sign in and sees **two** active organizations (A and B); **User 2** sees only **Org C**.
3. **Pass:** Accounts and org layout match the topology.

---

## A. Auth and active organization (P0)

4. As User 1, call `GET /api/auth/session` (or observe Network tab after load).
5. **Pass:** `active_organization.id` is one of A or B; `memberships` include both A and B; permissions align with active membership role.
6. As User 1, `POST /api/auth/active-organization` with body `{ "organizationId": "<Org_C_uuid>" }`.
7. **Pass:** HTTP 403 (or 4xx); error code **`organization_access_forbidden`** (or documented equivalent); no cookie/session implying Org C.
8. Switch User 1 to Org B via supported API/UI; repeat `GET /api/auth/session`.
9. **Pass:** Active org is B; CRM subsequent calls use B until switched again.
10. Hard refresh browser; **Pass:** Active org remains B (unless product explicitly resets — document if observed).

---

## B. Gate 11 org switcher (P0)

Follow [gate-11-acceptance-script.md](./gate-11-acceptance-script.md) sections A–F for shell, single-org, multi-org switch to `/home`, forbidden switch (API), technician variant, and deep-link stale view.

11. **Pass:** All Gate 11 script expectations still hold after any Gate 12 environment changes.

---

## C. Core cross-tenant isolation (P0)

**Method:** As User 1 on **Org A**, create or pick a **customer id**, **lead id**, **job id**, **estimate id**, **invoice id** (as applicable). Switch session to **Org B**. Attempt **read** (and **update**/**delete** if safe in test data) using Org A’s IDs.

12. **Pass:** 404 or forbidden; **no** payload from Org A. Repeat User 1 on Org B against Org C ids (should fail). Repeat User 2 on Org C against Org A/B ids (should fail).
13. **FK / assignment:** Attempt to attach an Org A entity to an Org B-only resource via API (if UI exposes). **Pass:** Server rejects.

---

## D. Search and dashboard (P0)

14. On Org A, create uniquely named test customer or job token in name field. Search from Org A; **Pass:** result appears.
15. Switch to Org B; search same token. **Pass:** no Org A row returned.
16. Open office dashboard (and technician dashboard if role applies). Note headline counts or list totals. Switch org; **Pass:** aggregates/lists change; no cross-org bleed.

---

## E. Portal and public links (P0)

17. Issue or use a **valid** customer portal magic link for a customer in **Org A**; open `/access/[token]` flow; complete redeem; open portal home.
18. **Pass:** Data belongs to Org A customer only; no other tenant’s jobs/invoices visible.
19. Open invalid token and expired (if testable) token. **Pass:** Clear failure; no portal session.
20. Confirm no unauthenticated route exposes CRM records by bare UUID without token/session (spot-check known patterns).

---

## F. Public booking (P0)

21. Open `/book/<Org_A_slug>`; submit minimal valid booking (`source: "website"` per API contract).
22. **Pass:** Success response; lead stored under **Org A** (`organization_id` = A in DB or admin query).
23. Use bad slug and inactive org slug. **Pass:** Safe error; no lead under wrong org; no silent default to another tenant.

---

## G. Calls / SMS / telephony (P0 where integrated)

24. Run `npm run telephony-messaging:isolation:smoke --workspace backend` in a DB that allows ephemeral DB creation; **Pass:** `ok: true`.
25. If Twilio/webhooks available: inbound known number → correct org thread; unknown caller does not attach to wrong org; outbound uses only org-owned numbers.

---

## H. Settings, branding, documents (P0)

26. Change Org A organization settings / branding fields (within product limits). Reload Org B session.
27. **Pass:** Org B branding/settings unchanged.
28. Run `npm run document-snapshot:isolation:smoke --workspace backend`; **Pass:** `ok: true` (or documented skip only if policy allows — owner default: **NO-GO** if skipped).

---

## I. Self-serve onboarding (**P0**) — Path B amendment (2026-05-13)

**Formal waiver:** [gate-12-section-i-scope-amendment.md](./gate-12-section-i-scope-amendment.md) **waives** self-serve **signup (former I1)**, **self-serve first-organization creation (former I2)**, and **self-serve second-organization creation (former I5)** for **this** Gate 12 dev/test closure. **Do not execute** those self-serve-only steps as **P0** blockers.

**Still mandatory (mock/seed allowed):** Use **User1 / User2 / Orgs A–C** from [gate-12-fixture-bootstrap.sql](./gate-12-fixture-bootstrap.sql) (or equivalent provisioned data). **§1a** mock/seed policy and **mandatory domain + backend re-verification (*)** in [gate-12-beta-readiness-security-audit.md](./gate-12-beta-readiness-security-audit.md) remain in force.

29. **(Waived — Path B)** Self-serve signup — **SKIP**; use fixture users `gate12-user1@fixture.local` / `gate12-user2@fixture.local` (password `Gate12Test!2026` per SQL file).

30. **(Waived — Path B)** Self-serve first org creation — **SKIP**; use org IDs from fixture SQL.

31. **Owner membership:** Sign in as **User1**; **Pass:** session / profile shows **owner** (or equivalent) for the active org membership.

32. **Active org initialization:** **Pass:** `GET /api/auth/session` shows `active_organization` matching an org User1 belongs to (A or B after switch tests).

33. **(Waived — Path B)** Self-serve second org — **SKIP**; User1’s second membership on **Org B** may be **seed-created** per amendment.

34. **Org switching (User1, Org A ↔ Org B):** Switch between **Org A** and **Org B**; **Pass:** full navigation to `/home`, session, search, and dashboard match selected org; no stale data (align with section **B**).

---

## Closure

Record date, tester, **PASS** / **FAIL** / **BLOCKER** / **NOT RUN** / **WAIVED** per section, attach smoke JSON outputs and `git status --short` after Gate 12 run. Any **(P0)** **FAIL** or **NOT RUN** (non-waived) → **NO-GO** until resolved. **WAIVED** steps are satisfied by [gate-12-section-i-scope-amendment.md](./gate-12-section-i-scope-amendment.md) only for **I1/I2/I5-class** self-serve requirements.

---

## Re-verification sign-off (fill on human run)

Use this table when executing the script in a real environment. **Latest agent continuation (2026-05-13):** fixtures applied, smokes **PASS**, and runtime checks progressed until the multi-org User1 login blocker — see [gate-12-verification-log.md](./gate-12-verification-log.md).

| Section | Tester | Date | Result | Evidence link / notes |
|---------|--------|------|--------|------------------------|
| 0 | Cursor agent | 2026-05-13 | **BLOCKER** | Fixtures + builds ready, but User1 normal multi-org login fails with `organization_membership_missing` |
| A | Cursor agent | 2026-05-13 | **BLOCKER** | Manual seeded session proved session + switch behavior; direct User1 password login failed |
| B | Cursor agent | 2026-05-13 | **BLOCKER** | `/home` loads 200 with seeded session, but Gate 11 multi-org sign-in path is not functional |
| C | Cursor agent | 2026-05-13 | **BLOCKER** | Read-side cross-tenant negatives passed for core entities; final owner sign-off blocked by User1 login defect |
| D | Cursor agent | 2026-05-13 | **PASS** | Search + dashboard separated Org A vs Org B fixture data |
| E | Cursor agent | 2026-05-13 | **PASS** | Valid portal token redeemed; invalid + expired returned 401 |
| F | Cursor agent | 2026-05-13 | **PASS** | Valid Org A booking created Org A lead; invalid + inactive slugs rejected |
| G | Cursor agent | 2026-05-13 | **PASS** smoke / **NOT RUN** manual | `telephony-messaging:isolation:smoke` returned `ok: true`; no live webhook provider |
| H | Cursor agent | 2026-05-13 | **PASS** | Org A settings isolated from Org B; document snapshot smoke passed |
| I | Cursor agent | 2026-05-13 | **WAIVED** (I1/I2/I5) + **BLOCKER** (I3/I4/I6 normal sign-in path) | Path B filed; seeded session proved owner/switch behavior but User1 password login failed |
