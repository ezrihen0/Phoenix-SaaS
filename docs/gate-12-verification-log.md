# Gate 12 — Verification log

**Gate:** 12 — Beta Readiness + Security Audit  
**Workspace:** Phoenix_SaaS (not Phoenix_CRM)  
**Initial execution date:** 2026-05-12  
**Re-verification run (toward GO):** 2026-05-13 — per owner-approved preview (smokes + builds + matrix/script scope; **no** application code edits).  
**Recovery — Verification enablement:** 2026-05-13 — package executed; see [gate-12-recovery-verification-enablement.md](./gate-12-recovery-verification-enablement.md) and **§ Gate 12 Recovery** below (**no** `package.json` changes). **Path B** executed 2026-05-13 — [gate-12-section-i-scope-amendment.md](./gate-12-section-i-scope-amendment.md).  
**Documentation correction:** 2026-05-12 (self-serve onboarding reframed as **Gate 12 product-readiness blocker**; see audit §3.I / §5b).  
**Executor:** Cursor agent (automated CLI + live local runtime verification)  
**Topology target:** User1 → Org A + Org B; User2 → Org C (**provisioned** in `phoenix_crm_rebase_run_20260512`)

## Gate 12 — Owner clarification (fixture data; deployment *)

**Mock/seed for current closure:** Runtime verification for this Gate 12 closure attempt **may use mock or seeded test data** for User1/User2, orgs A/B/C, customers, leads, jobs, invoices, search markers, booking slugs, portal tokens, and other matrix/script fixtures. **Tenant isolation is not relaxed** — all required checks and smokes must still **PASS**. **GO / NO-GO rules are unchanged** except that **fixtures need not be real external beta users**.

**Mandatory domain + backend re-verification (*):** Gate 12 may be verified and closed in the current development/test environment using mock or seeded fixture data. However, once Phoenix_SaaS is connected to a real public domain and live backend / production-like environment, a mandatory focused Gate 12 re-verification must be executed before inviting real beta users or treating the beta environment as externally ready. That activity is **not** a full restart of Gate 12 architecture work; it is a **mandatory production-like runtime confidence check** and must re-check at minimum: (1) public booking on the real domain, (2) portal/magic-link on the real domain, (3) auth/session on the deployed backend, (4) org switching with 3-org or equivalent test accounts, (5) direct cross-tenant access negatives, (6) relevant smokes, builds, and deployment evidence if applicable. Canonical text: [gate-12-beta-readiness-security-audit.md](./gate-12-beta-readiness-security-audit.md) §1a.

## Gate 12 verdict (final continuation, 2026-05-13)

**NO-GO** — Gate 12 is **not** complete in the development/test environment.

**Path B filed:** [gate-12-section-i-scope-amendment.md](./gate-12-section-i-scope-amendment.md) (**I1 / I2 / I5** waived for this closure). **Mock/seed §1a** and **mandatory domain + backend re-verification (*)** unchanged.

**Exact remaining blocker:** Multi-org password login is broken for **User1**. `POST /api/auth/login` with `gate12-user1@fixture.local` returns **401** `organization_membership_missing` even though User1 has two active memberships (Org A + Org B). This blocks a normal product sign-in path for the required multi-org runtime checks and prevents Gate 12 **GO** without application-code changes.

### Final continuation evidence (SQL compatibility + closure run)

- **Fixture SQL blocker removed:** [gate-12-fixture-bootstrap.sql](./gate-12-fixture-bootstrap.sql) no longer references `organization_billing` and no longer hardcodes `USE phoenix_crm`.
- **Detected active app DB:** `phoenix_crm_rebase_run_20260512` (live local MySQL schema with Gate 12 tables).
- **Fixture SQL application:** **PASS** on `phoenix_crm_rebase_run_20260512`.
- **Fixture confirmation:** organizations `4`; users `2`; memberships `3`; customers `3`; leads `3`; jobs `3`; quotes `3`; invoices `3`; portal magic links `2`.
- **Topology confirmation:** User1 → Org A + Org B; User2 → Org C only.
- **Smoke credential:** local dedicated MySQL principal `phoenix_smoke` created and used for smokes (password intentionally omitted from docs).
- **All four isolation smokes:** **PASS** (`ok: true`).
- **Runtime pass evidence completed:** User2 single-org login/session; User1 session / forbidden switch / allowed switch via seeded auth session; search isolation; dashboard org separation; settings isolation; portal valid + invalid + expired link checks; public booking valid + invalid/inactive slug checks; unauthenticated bare UUID probe returns 401.
- **Runtime blocker evidence:** direct backend login for User1 returns `{"error":{"code":"organization_membership_missing","message":"This account is not assigned to an active organization yet."}}`.

## Gate 12 verdict (after re-verification, 2026-05-13) — superseded notes

Historical **NO-GO** reasons from the earlier 2026-05-13 pass were **superseded** by the final continuation: fixture SQL was applied and smoke access was repaired, but the closure still ends **NO-GO** because of the multi-org User1 login defect.

**Section I (superseded for I1/I2/I5 only):** [gate-12-section-i-scope-amendment.md](./gate-12-section-i-scope-amendment.md) (**Path B**) waives **I1 / I2 / I5** for this dev/test closure. **I3 / I4 / I6** and **A–H** are still **mandatory** and were **NOT RUN** in the agent environment. The prior “signup route absent → Gate 12 BLOCKER” line applies to **Path A** / unamended criteria only.

## Environment notes

- Builds executed on Windows host at `c:\Projects\Phoenix-SaaS`.
- Local MySQL container `phoenix_mysql` is healthy; active app DB detected for this continuation: `phoenix_crm_rebase_run_20260512`.
- Isolation smokes were re-run with dedicated local MySQL user `phoenix_smoke`; all four reached `ok: true`.
- Fixture SQL was applied successfully to the active app DB in this continuation.
- User2 single-org login works normally. User1 multi-org password login fails before session creation with `organization_membership_missing`.
- **Self-serve onboarding:** Under **Path B** ([gate-12-section-i-scope-amendment.md](./gate-12-section-i-scope-amendment.md)), **I1/I2/I5** are **waived** for this closure; **I3/I4/I6** still require a live run with fixture users. For **unamended** / **Path A** criteria, absence of a public signup route remains a **readiness blocker** — see audit §3.I / §5b.

---

## Command log

### 1. Backend build

```text
Command: npm.cmd run build --workspace backend
CWD: c:\Projects\Phoenix-SaaS
Result: PASS (exit 0)
Output summary: tsc -p tsconfig.build.json completed successfully
```

### 2. Frontend build

```text
Command: npm.cmd run build --workspace frontend
CWD: c:\Projects\Phoenix-SaaS
Result: PASS (exit 0)
Output summary: Next.js 16.2.4 production build; compiled successfully; TypeScript OK
```

### 3. Isolation smoke — inspections

```text
Command: npm.cmd run inspections:isolation:smoke --workspace backend
Result: FAIL (exit 1)
First error: Access denied for user 'phoenix'@'%' to database 'phoenix_crm_inspections_verify_<timestamp>'
Phase: databaseCreate → FAIL
```

### 4. Isolation smoke — document snapshot

```text
Command: npm.cmd run document-snapshot:isolation:smoke --workspace backend
Result: FAIL (exit 1)
First error: Access denied for user 'phoenix'@'%' to database 'phoenix_crm_doc_snap_verify_<timestamp>'
Phase: databaseCreate → FAIL
```

### 5. Isolation smoke — telephony / messaging

```text
Command: npm.cmd run telephony-messaging:isolation:smoke --workspace backend
Result: FAIL (exit 1)
First error: Access denied for user 'phoenix'@'%' to database 'phoenix_crm_tel_msg_verify_<timestamp>'
Phase: databaseCreate → FAIL
```

### 6. Isolation smoke — public booking

```text
Command: npm.cmd run public-booking:isolation:smoke --workspace backend
Result: FAIL (exit 1)
First error: Access denied for user 'phoenix'@'%' to database 'phoenix_crm_pub_book_verify_<timestamp>'
Phase: databaseCreate → FAIL
```

### 7. Git status (post-execution; repo may contain unrelated local changes)

```text
Command: git status --short
CWD: c:\Projects\Phoenix-SaaS
Output (snapshot):
 M frontend/app/technician/technician-workspace.tsx
 M frontend/components/app-shell.tsx
?? docs/gate-11-acceptance-script.md
?? docs/gate-11-p0-ux-contract.md
?? docs/gate-11-p6-regression-checklist.md
?? docs/gate-11-verification-log.md
?? frontend/components/organization-switcher.tsx
```

Note: Gate 12 deliverables (`docs/gate-12-*.md`) were not present in this snapshot until written in the same session.

### 7b. Git status (after writing Gate 12 docs)

```text
?? docs/gate-12-beta-readiness-security-audit.md
?? docs/gate-12-cross-tenant-verification-matrix.md
?? docs/gate-12-owner-acceptance-script.md
?? docs/gate-12-verification-log.md
```

(Other untracked/modified files in the repo pre-existed this Gate 12 run — see section 7.)

---

## Manual / API matrix execution (initial agent pass, 2026-05-12)

**Update (2026-05-13 re-verification):** Authoritative section-by-section status for owner script **A–I** is **§ Re-verification run → R8** below.

| Area | Status | Notes |
|------|--------|-------|
| A Auth / active org | **NOT RUN** | Requires authenticated sessions and membership matrix |
| B Org switcher regression | **NOT RUN** | Requires browser + multi-org user |
| C Core tenant isolation (CRUD/FK) | **NOT RUN** | Requires API calls with Org A/B/C credentials |
| D Search + dashboard | **NOT RUN** | Requires session per org |
| E Portal / public links | **NOT RUN** | Requires magic links + token cases |
| F Public booking | **NOT RUN** (runtime) | Smoke failed before assertions; static review noted in audit doc |
| G Telephony | **NOT RUN** (runtime) | Smoke failed at DB create |
| H Settings / branding / docs | **NOT RUN** | Requires live orgs |
| I Self-serve onboarding | **BLOCKER / NOT RUN** | **Readiness:** Under current Gate 12 criteria, signup + first org + second-org self-serve are **unproven** / **not found** on reviewed surface — **not** treated as harmless N/A (see audit §3.I). I6 switch test also **NOT RUN**. |

---

## Blocker report (code vs readiness)

**Confirmed code defect (IDOR, etc.):** None filed (initial or re-verification).

**Gate 12 readiness blockers (criteria vs evidence):** Unchanged — MySQL smoke harness; missing runtime 3-org harness; self-serve onboarding **BLOCKER** per current criteria (see §R8–R9).

---

## Remediation to re-run Gate 12 toward GO

1. Grant MySQL user used by backend smokes permission to **create/drop** ephemeral verification databases, or run smokes with a credential that can create verify DBs; document URL/host used.  
2. Provision **User1 (Org A + B)** and **User2 (Org C)** with known credentials; execute [gate-12-owner-acceptance-script.md](./gate-12-owner-acceptance-script.md) and fill [gate-12-cross-tenant-verification-matrix.md](./gate-12-cross-tenant-verification-matrix.md).  
3. Re-run all four `npm run *:isolation:smoke --workspace backend` until `ok: true`.  
4. Re-run workspace builds and record PASS in this log.  
5. **Self-serve onboarding:** Either **execute and PASS** signup → first org → owner/active org → second org (self-serve) per current criteria, **or** obtain an **explicit owner amendment** to Gate 12 beta scope naming which onboarding requirements are waived — and record that decision in this verification package so “missing flow” is no longer a blocker **by scope**, not by silent N/A.

---

## Re-verification run (2026-05-13) — command evidence

**CWD:** `c:\Projects\Phoenix-SaaS`. **Application code:** not modified.

### R1. Inspections isolation smoke (re-run)

```text
Command: npm.cmd run inspections:isolation:smoke --workspace backend
Exit code: 1
ok: false
database: phoenix_crm_inspections_verify_1778643454680
phases.databaseCreate: FAIL
errors[0]: Access denied for user 'phoenix'@'%' to database 'phoenix_crm_inspections_verify_1778643454680'
```

### R2. Document snapshot isolation smoke (re-run)

```text
Command: npm.cmd run document-snapshot:isolation:smoke --workspace backend
Exit code: 1
ok: false
database: phoenix_crm_doc_snap_verify_1778643462405
phases.databaseCreate: FAIL
errors[0]: Access denied for user 'phoenix'@'%' to database 'phoenix_crm_doc_snap_verify_1778643462405'
```

### R3. Telephony messaging isolation smoke (re-run)

```text
Command: npm.cmd run telephony-messaging:isolation:smoke --workspace backend
Exit code: 1
ok: false
database: phoenix_crm_tel_msg_verify_1778643467683
phases.databaseCreate: FAIL
errors[0]: Access denied for user 'phoenix'@'%' to database 'phoenix_crm_tel_msg_verify_1778643467683'
```

### R4. Public booking isolation smoke (re-run)

```text
Command: npm.cmd run public-booking:isolation:smoke --workspace backend
Exit code: 1
ok: false
database: phoenix_crm_pub_book_verify_1778643470889
phases.databaseCreate: FAIL
errors[0]: Access denied for user 'phoenix'@'%' to database 'phoenix_crm_pub_book_verify_1778643470889'
```

### R5. Backend build (re-run)

```text
Command: npm.cmd run build --workspace backend
Exit code: 0
(tsc -p tsconfig.build.json)
```

### R6. Frontend build (re-run)

```text
Command: npm.cmd run build --workspace frontend
Exit code: 0
(Next.js 16.2.4 production build — compiled successfully)
```

### R7. Git status — short (re-verification snapshot)

```text
Command: git status --short
Output (representative; workspace may differ):
 M frontend/app/technician/technician-workspace.tsx
 M frontend/components/app-shell.tsx
?? backend/src/billing/
?? docs/gate-11-acceptance-script.md
?? docs/gate-11-p0-ux-contract.md
?? docs/gate-11-p6-regression-checklist.md
?? docs/gate-11-verification-log.md
?? docs/gate-12-beta-readiness-security-audit.md
?? docs/gate-12-cross-tenant-verification-matrix.md
?? docs/gate-12-owner-acceptance-script.md
?? docs/gate-12-verification-log.md
?? docs/gate-13-billing-sync.md
?? frontend/components/organization-switcher.tsx
```

*(Untracked paths outside `docs/gate-12-*` are out of scope for Gate 12 verdict; recorded for traceability only.)*

### R8. Owner acceptance script A–I — execution status (this pass)

| Section | Status | Evidence |
|---------|--------|----------|
| 0 Environment | **BLOCKER** | Fixture SQL applied; builds pass; User2 login works; **User1 multi-org login fails** with `organization_membership_missing` |
| A Auth | **BLOCKER** | Direct User1 password login fails; seeded session proves `GET /api/auth/session`, forbidden switch to Org C, and allowed switch to Org B work once an active session exists |
| B Gate 11 switcher | **BLOCKER** | `/home` loads 200 for seeded sessions, but the required normal multi-org sign-in path is broken |
| C Cross-tenant isolation | **PARTIAL / BLOCKED BY A** | Read negatives passed for customers, leads, jobs, estimates, invoices; full CRUD/FK runtime pass not completed after login blocker |
| D Search / dashboard | **PASS** | Org A dashboard/search show A fixtures; after switch to Org B, dashboard/search show B fixtures |
| E Portal | **PASS** | Valid token redeems Org A customer session; expired + invalid tokens return 401 |
| F Public booking | **PASS** | Valid Org A slug creates lead under Org A; invalid + inactive slugs return 404 `booking_unavailable` |
| G Telephony | **PASS** smoke / **NOT RUN** manual | `telephony-messaging:isolation:smoke` → `ok: true`; no live webhook provider exercised |
| H Settings / docs | **PASS** | Org A settings update does not affect Org B; document snapshot smoke passed |
| I Self-serve | **WAIVED** I1/I2/I5; **BLOCKER** for normal I3/I4/I6 sign-in path | Path B filed; owner/session/switch logic works only after manually seeded session because User1 login fails |

### R9. Product blocker report (code defect)

**None.** No IDOR or tenant defect reproduced; **no code edits** performed.

---

## Gate 12 Recovery — Verification enablement (package executed)

**Date:** 2026-05-13  
**Scope:** Documentation + `.env.example` comments only. **No** `backend/package.json` changes. Historical enablement package only; final continuation evidence lives in this log.

**Deliverable:** [gate-12-recovery-verification-enablement.md](./gate-12-recovery-verification-enablement.md) — contains:

- Exact MySQL privilege requirement for smoke runner (`CREATE DATABASE` / `DROP DATABASE` + migration rights).
- Smallest safe options: **alternate smoke credential** (recommended) vs widening `phoenix` grants (risk).
- Optional env **`DB_SMOKE_DATABASE`**, **`DB_SMOKE_DROP`** (script-supported; no new npm scripts).
- 3-org topology + **fixture checklist** (manual / ops; no new seed script in repo).
- Explicit **out of scope:** Path A product plan, Path B amendment package, npm script ergonomics.

**Continuation update (2026-05-13):** Fixture SQL was applied by the agent to `phoenix_crm_rebase_run_20260512`; `phoenix_smoke` was created locally and all four smokes were re-run successfully.

### Fixture log (deterministic bootstrap — [gate-12-fixture-bootstrap.sql](./gate-12-fixture-bootstrap.sql))

**Execution status:** Applied successfully to `phoenix_crm_rebase_run_20260512` after removing the obsolete `organization_billing` dependency and the hardcoded `USE` line. **Passwords:** documented only in the SQL file header — rotate after verification if required by policy.

| Item | Value |
|------|--------|
| User1 email | `gate12-user1@fixture.local` |
| User1 id | `c2222222-2222-4222-8222-000000000001` |
| User1 password (bootstrap) | `Gate12Test!2026` (see SQL file) |
| User2 email | `gate12-user2@fixture.local` |
| User2 id | `c2222222-2222-4222-8222-000000000002` |
| Org A id / name / slug | `c1111111-1111-4111-8111-0000000000a1` / Gate 12 Org A / **`g12-or-a`** (public booking) |
| Org B id / name / slug | `c1111111-1111-4111-8111-0000000000b1` / Gate 12 Org B / `g12-or-b` |
| Org C id / name / slug | `c1111111-1111-4111-8111-0000000000c1` / Gate 12 Org C / `g12-or-c` (**forbidden** `active-organization` target for User1) |
| Org D (inactive booking negative) | `c1111111-1111-4111-8111-0000000000d1` / slug **`g12-or-inactive`**, `is_active` = 0 |
| Customer A / B / C ids | `c9000001-9001-4001-8001-000000000001` (A), `…000002` (B), `…000003` (C) |
| Search markers (customer `full_name`) | **`G12-SEARCH-A-marker`**, **`G12-SEARCH-B-marker`**, **`G12-SEARCH-C-marker`** |
| Lead A / B / C ids | `c7000001-7001-4001-8001-000000000001` (A), `…000002` (B), `…000003` (C) |
| Job A / B / C ids | `c5000001-5001-4001-8001-000000000001` (A), `…000002` (B), `…000003` (C) |
| Quote A / B / C ids | `c6000001-6001-4001-8001-000000000001` (A), `…000002` (B), `…000003` (C) |
| Invoice A / B / C ids | `c6100001-6101-4001-8001-000000000001` (A), `…000002` (B), `…000003` (C) |
| Portal magic link row ids | `c8000001-8001-4001-8001-000000000001` (valid), `…000002` (expired) |
| Portal URL path tokens (raw) | Valid: **`gate12-portal-test-token`** → `/access/gate12-portal-test-token`. Expired: **`gate12-portal-expired-token`** |

### Eden — MySQL smoke principal (run as admin; **do not** commit passwords)

If the agent cannot create DB users, run **one** of the following on the MySQL server (replace host and password). **Preferred:** dedicated `phoenix_smoke` — see [gate-12-recovery-verification-enablement.md](./gate-12-recovery-verification-enablement.md) §2 Option A.

```sql
CREATE USER IF NOT EXISTS 'phoenix_smoke'@'%' IDENTIFIED BY '<strong-secret>';
GRANT CREATE, DROP ON *.* TO 'phoenix_smoke'@'%';
FLUSH PRIVILEGES;
```

Then in **PowerShell** for each smoke (example):

```powershell
$env:DB_USERNAME="phoenix_smoke"
$env:DB_PASSWORD="<same-secret>"
npm.cmd run inspections:isolation:smoke --workspace backend
npm.cmd run document-snapshot:isolation:smoke --workspace backend
npm.cmd run telephony-messaging:isolation:smoke --workspace backend
npm.cmd run public-booking:isolation:smoke --workspace backend
```

**Credential used in this continuation:** `phoenix_smoke` (local MySQL only; password intentionally omitted). **Do not** paste production passwords into git.

### Final closure — smoke / build summary (2026-05-13)

| Command | Result |
|---------|--------|
| `npm.cmd run inspections:isolation:smoke --workspace backend` | **PASS** — `ok: true` with `phoenix_smoke` |
| `npm.cmd run document-snapshot:isolation:smoke --workspace backend` | **PASS** — `ok: true` with `phoenix_smoke` |
| `npm.cmd run telephony-messaging:isolation:smoke --workspace backend` | **PASS** — `ok: true` with `phoenix_smoke` |
| `npm.cmd run public-booking:isolation:smoke --workspace backend` | **PASS** — `ok: true` with `phoenix_smoke` |
| `npm.cmd run build --workspace backend` | **PASS** (exit 0) |
| `npm.cmd run build --workspace frontend` | **PASS** (exit 0) |

**Verdict (this continuation):** **NO-GO** — exact remaining blocker: **multi-org password login** for User1 returns `organization_membership_missing`, preventing a normal product sign-in path for the required Gate 12 multi-org runtime checks.
