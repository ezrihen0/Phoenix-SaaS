# Gate 12 — Recovery: verification enablement

**Package:** G12 Recovery — Verification Enablement (executed).  
**Gate:** 12 only.  
**Purpose:** Remove blockers so a **valid** Gate 12 GO **attempt** can be run later: MySQL smoke harness + documented 3-org verification data. **No** application logic changes. **No** `backend/package.json` or convenience npm script changes (per owner).

**Out of scope for this package (explicit):**

- **Section I Path A** (product implementation: signup / org provisioning) — **not executed**. If chosen, prepare a **separate** product implementation plan outside this document.
- **Section I Path B** (formal scope amendment) — **executed** in [gate-12-section-i-scope-amendment.md](./gate-12-section-i-scope-amendment.md) (2026-05-13). This recovery file does **not** itself waive criteria; it documents enablement only.
- **npm script ergonomics** — do not add or change workspace scripts for smokes; operators use existing commands from [gate-11-p6-regression-checklist.md](./gate-11-p6-regression-checklist.md) with env set in the shell or a **local** env file (not committed with secrets).

---

## 1. MySQL isolation-smoke blocker — technical fact

Isolation smokes (`inspections`, `document-snapshot`, `telephony-messaging`, `public-booking`) all:

1. Read connection options via `buildDataSourceOptions()` → **`DB_HOST`**, **`DB_PORT`**, **`DB_USERNAME`**, **`DB_PASSWORD`** (see [backend/src/database/typeorm.config.ts](../backend/src/database/typeorm.config.ts)).
2. Open a **server-level** `mysql2` connection with that **username/password** (no database selected).
3. Run **`CREATE DATABASE \`<verify_name>\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`**, then connect with TypeORM to that DB and run migrations.

Default verify DB names (unless overridden):

| Smoke | Default name pattern |
|--------|-------------------------|
| Inspections | `phoenix_crm_inspections_verify_<timestamp>` |
| Document snapshot | `phoenix_crm_doc_snap_verify_<timestamp>` |
| Telephony / messaging | `phoenix_crm_tel_msg_verify_<timestamp>` |
| Public booking | `phoenix_crm_pub_book_verify_<timestamp>` |

Optional env (all four scripts):

- **`DB_SMOKE_DATABASE`** — pin a fixed database name instead of timestamp suffix.
- **`DB_SMOKE_DROP`** — when `true`, scripts run `DROP DATABASE IF EXISTS` before `CREATE` (see each `*-isolation-smoke.ts`).

**Exact privilege requirement:** The MySQL account used for **`DB_USERNAME` / `DB_PASSWORD` when running the smoke** must be allowed to:

- **`CREATE DATABASE`** (global or sufficient equivalent),
- **`DROP DATABASE`** on those verify databases (cleanup paths),
- **`CREATE` / `ALTER` / `INDEX` / etc.** inside the new database after creation (migrations).

Failure observed in Gate 12: `Access denied for user 'phoenix'@'%' to database 'phoenix_crm_*_verify_*'` — consistent with an app user limited to a **single** database (`phoenix_crm`) without global `CREATE`.

---

## 2. Smallest safe enablement options (pick one; DB / credential only)

### Option A — Alternate smoke credential (recommended)

Use a **dedicated** MySQL user for smoke runs only (e.g. `root` on local Docker, or `phoenix_smoke`):

1. Create user (example — adjust host/password):

   ```sql
   CREATE USER IF NOT EXISTS 'phoenix_smoke'@'%' IDENTIFIED BY '***use-a-strong-secret***';
   GRANT CREATE, DROP ON *.* TO 'phoenix_smoke'@'%';
   -- Tighten host to 'localhost' or your CI runner IP where possible.
   FLUSH PRIVILEGES;
   ```

2. For **each** smoke command, set env in the **shell** (PowerShell example) so **`DB_USERNAME` / `DB_PASSWORD`** point at `phoenix_smoke` while leaving the app’s normal `.env` unchanged:

   ```powershell
   $env:DB_USERNAME="phoenix_smoke"
   $env:DB_PASSWORD="***"
   npm.cmd run inspections:isolation:smoke --workspace backend
   ```

3. Leave **`DB_NAME`** as your normal app DB for other commands; smokes **ignore** `DB_NAME` for the initial `CREATE DATABASE` step but migrations run **inside** the verify DB.

**Why this is smallest:** No repo code change; production `phoenix` stays least-privileged.

### Option B — Grant the existing `phoenix` user

```sql
GRANT CREATE, DROP ON *.* TO 'phoenix'@'%';
FLUSH PRIVILEGES;
```

**Risk:** Any process using that user can create/drop **any** database name the account can see — avoid on shared/production hosts.

### Option C — DBA pre-creates one verify database

Pre-creating **`DB_SMOKE_DATABASE`** does **not** remove the need for **`CREATE DATABASE`** in current scripts unless scripts are changed later — **not** part of this recovery package.

---

## 3. Three-org runtime topology — verification data setup

**Owner clarification:** For the **current** Gate 12 closure attempt, **User1, User2, orgs A/B/C, and all listed fixtures may be mock or seeded** in dev/test. **All matrix and script checks must still pass** — this does **not** weaken tenant isolation. **GO / NO-GO rules are unchanged** except for acceptance of **non-production fixture identities**. After move to a **real public domain** and **production-like** backend, perform the **mandatory focused Gate 12 re-verification** described in [gate-12-beta-readiness-security-audit.md](./gate-12-beta-readiness-security-audit.md) §1a (not an architecture restart; minimum booking, portal, auth/session, org switch, cross-tenant negatives, smokes/build/deploy evidence).

**Topology**

| Actor | Organizations |
|--------|-----------------|
| User 1 | Org **A** + Org **B** (active memberships, active orgs) |
| User 2 | Org **C** only |

**How to create (this package does not run it)**

| Need | Suggested approach |
|------|-------------------|
| Users + orgs + memberships | **Manual** admin / SQL / bootstrap already in your environment (`BACKEND_BOOTSTRAP_*` in [backend/.env.example](../backend/.env.example) is for local admin only — extend with your own seed if needed). **Update (2026-05-13 continuation):** [gate-12-fixture-bootstrap.sql](./gate-12-fixture-bootstrap.sql) was patched to remove `organization_billing` and the hardcoded `USE` statement, then applied successfully to `phoenix_crm_rebase_run_20260512`. |
| Record in Gate 12 | After creation, write User1/User2 emails, org names, and **UUIDs** into [gate-12-verification-log.md](./gate-12-verification-log.md). |

### Fixture checklist (for matrix + owner script A–H)

Record each item in the verification log when created (stable IDs help re-runs).

| Fixture | Used for | Notes |
|---------|-----------|--------|
| Customer IDs in A, B, C | Cross-org **GET/PATCH/DELETE** | User1 on B must not read A’s customer id, etc. |
| Lead IDs | Same | |
| Job IDs | Same + optional FK tests | |
| Estimate / invoice IDs | Same | |
| Unique search string per org | Search isolation (e.g. `G12-SEARCH-A-xxx`) | |
| Dashboard observable | Counts or list rows after org switch | |
| Org A **active** `organizations.slug` | Public booking `/book/<slug>` | |
| Inactive org slug (optional) | Negative booking | |
| Portal magic link token (Org A customer) | `/access/[token]`, portal session | Staff flow or controlled DB row |
| Invalid / expired portal token | Negative portal | |
| Org C UUID (for User1) | Forbidden `POST /api/auth/active-organization` | |

**Repo note:** No checked-in `*seed*` script was found for this topology; treat as **manual or external ops** unless you add a seed package later (outside this enablement).

---

## 4. Commands to run after DB enablement (unchanged; no new npm scripts)

From repo root, with **`DB_USERNAME` / `DB_PASSWORD`** set to the smoke-capable principal:

```text
npm.cmd run inspections:isolation:smoke --workspace backend
npm.cmd run document-snapshot:isolation:smoke --workspace backend
npm.cmd run telephony-messaging:isolation:smoke --workspace backend
npm.cmd run public-booking:isolation:smoke --workspace backend
npm.cmd run build --workspace backend
npm.cmd run build --workspace frontend
git status --short
```

Expect each smoke summary **`"ok": true`**. Log full JSON or stdout in [gate-12-verification-log.md](./gate-12-verification-log.md).

---

## 5. Section I — decision framing only (not executed here)

| Path | What it is | Where it belongs |
|------|--------------|------------------|
| **Path A** | Product work: self-serve signup, first org, second org, etc. | **Separate** product implementation plan (not Gate 12 Recovery). |
| **Path B** | Owner formally waives specific Gate 12 section **I** requirements | **Separate** documentation-only scope amendment package; then re-run Gate 12 matrix/script with waived rows explicitly marked. |

This enablement package **does not** choose Path A or B.

---

## 6. Protected status

| Area | Status |
|------|--------|
| `backend/src/**`, `frontend/src/**` (application logic) | **Do not change** for enablement |
| `backend/package.json` scripts | **Do not change** (owner) |
| Billing / non–Gate 12 product scope | **Out of scope** |
| Gate 12 verdict | Remains **NO-GO** until a future re-verification **passes** P0 checks |

---

## 7. Risks

- Over-broad **`GRANT`** on shared MySQL.  
- Smoke DB names colliding if `DB_SMOKE_DATABASE` reused without `DB_SMOKE_DROP=true`.  
- Fixture drift if UUIDs are not copied into the verification log.

---

## 8. Test plan (after operator applies §2–§4)

1. Four smokes → `ok: true`.  
2. Both builds → PASS.  
3. Run [gate-12-owner-acceptance-script.md](./gate-12-owner-acceptance-script.md) A–H with fixtures.  
4. Section **I** per owner’s **separate** Path A or B outcome.  
5. Update matrix + audit + verdict.

---

## 9. Rollback

- Revoke `phoenix_smoke` or extra grants on `phoenix`.  
- Delete this file’s operational notes from the log if mistaken (keep audit trail if possible).

---

## 10. Stop conditions (enablement operator)

- If `CREATE DATABASE` still fails after credential change → stop; capture exact MySQL error.  
- Do not implement Path A or Path B inside this package.
