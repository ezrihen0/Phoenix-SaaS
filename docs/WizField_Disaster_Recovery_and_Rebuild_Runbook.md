# WizField Disaster Recovery and Rebuild Runbook

## 1. Purpose

This document is **operational disaster recovery guidance**, not product or architecture truth.

Use it when a local machine, operator workstation, or deployment environment is lost and a future agent or operator must rebuild a working WizField environment from:

- GitHub source code
- database backups
- owner-controlled secrets and environment variables
- deployment provider access
- the verification procedures already defined in the canonical engineering docs

This runbook does **not** replace:

- `WizField_Master_Source_of_Truth.md` (product/architecture truth)
- `WizField_Engineering_Closeout_and_Verification.md` (engineering closeout evidence)
- `WizField_Reverification_Runbook.md` (production-like replay procedure)
- `WizField_Owner_Launch_Activation_Checklist.md` (owner launch activation)

---

## 2. What this runbook can and cannot do

### Can do

- Provide a ordered rebuild checklist from repo checkout through verification
- Point to the authoritative verification commands already recorded in engineering closeout and reverification docs
- List the **categories** of external assets required before recovery can succeed
- State stop conditions when recovery should pause instead of guessing

### Cannot do

- Rebuild the application from documentation alone
- Recover lost secrets, database contents, Stripe/Telnyx/SMTP/AI credentials, or deployment access without owner-provided backups
- Recreate owner launch activation decisions, live billing state, or production customer data
- Guarantee production recovery without a valid database backup and environment-specific deployment knowledge

---

## 3. Required external assets

Do **not** proceed with recovery until the operator can locate or restore all required assets below.

| Asset | Requirement | Placeholder / source |
|---|---|---|
| GitHub repository | Authoritative application source | `<GITHUB_REPO_URL>` — confirm with `git remote -v` on any surviving clone |
| Authoritative branch | Branch containing the intended recovery baseline | `<AUTHORITATIVE_BRANCH>` — engineering docs reference `SaaS-master` for shipped AI/Growth Center truth; confirm with owner before recovery |
| GitHub access | Clone/fetch permission | `<GITHUB_ACCESS_METHOD>` — SSH key, PAT, or org SSO as configured by owner |
| Database backup | Restored tenant/business data | `<DATABASE_BACKUP_LOCATION>` — owner-managed dump/snapshot; docs cannot recreate data |
| Database server | MySQL reachable by backend | `<DB_HOST>`, `<DB_PORT>`, `<DB_NAME>` — see `backend/.env.example` for variable names only |
| Backend environment file | Local/staging/prod backend secrets | Copy from `backend/.env.example` → `backend/.env`; populate from `<OWNER_SECRET_STORE>` |
| Frontend environment file | Public/client config | Copy from `frontend/.env.example` → `frontend/.env.local` or deployment env; populate from `<OWNER_SECRET_STORE>` |
| Docker MySQL env (if used locally) | Local database bootstrap | Copy from `docker/mysql/.env.example` → `docker/mysql/.env` |
| Deployment provider access | If recovering hosted environment | `<DEPLOYMENT_PROVIDER>` — e.g. hosting panel, CI/CD, container platform; **UNCERTAIN in repo docs** |
| Stripe credentials | Billing checkout/webhook sync | `<STRIPE_SECRET_KEY>`, `<STRIPE_WEBHOOK_SECRET>`, price IDs — names in `backend/.env.example`; values from Stripe dashboard / owner secret store |
| Stripe publishable key | Frontend checkout surfaces | `<NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY>` — name in `frontend/.env.example` |
| Telnyx credentials | Telephony, SMS, voice webhooks/tools | `<TELNYX_API_KEY>`, `<TELNYX_PUBLIC_KEY>`, `<TELNYX_OUTBOUND_FROM_NUMBER>`, WebRTC vars as required — referenced in backend code/config; **not fully enumerated in `.env.example`** — confirm from owner secret store |
| SMTP / email provider | If outbound email is required for recovered environment | `<SMTP_*>` or provider-specific vars — **UNCERTAIN in repo `.env.example`** — confirm from owner/deployment config |
| AI provider credentials | Brain/Copilot/Language Store when enabled | `<OPENAI_API_KEY>`, `<GEMINI_API_KEY>`, AI flag bundle — names in `backend/.env.example`; see `WizField_AI_Master_Source_of_Truth.md` |
| Growth Center OAuth secrets | Marketing channel integrations when enabled | `<MARKETING_*>` vars — names in `backend/.env.example` |
| Owner support / launch config | Launch surfaces | `<NEXT_PUBLIC_SUPPORT_EMAIL>` and related frontend public vars — names in `frontend/.env.example`; launch process in `WizField_Owner_Launch_Activation_Checklist.md` |

**Secret rule:** Never commit real `.env` values. Use placeholders in tickets/logs. Populate local/deployment env files only from the owner-controlled secret store.

---

## 4. Local machine rebuild steps

1. Install baseline tooling on the replacement machine:
   - Git
   - Node.js/npm compatible with repo workspaces
   - Docker Desktop or Docker Engine (if using repo MySQL compose path)
   - MySQL client (optional but useful for backup restore verification)
2. Clone the repository:
   ```text
   git clone <GITHUB_REPO_URL>
   cd <REPO_ROOT>
   git fetch origin
   git checkout <AUTHORITATIVE_BRANCH>
   ```
3. Confirm the checkout matches the intended recovery commit/tag recorded by the owner.
4. Copy environment templates (no secrets committed):
   ```text
   copy backend\.env.example backend\.env
   copy frontend\.env.example frontend\.env.local
   copy docker\mysql\.env.example docker\mysql\.env
   ```
   On Unix shells, use `cp` instead of `copy`.
5. Populate `backend/.env`, `frontend/.env.local`, and any deployment env from `<OWNER_SECRET_STORE>`.
6. Continue with dependency install, database restore, migrations, startup, and verification below.

---

## 5. Dependency install steps

From repo root:

```text
npm install
```

Expected result:

- Root workspace installs `frontend` and `backend` dependencies
- No install errors blocking build

If install fails, stop and record the first real error before changing application source.

---

## 6. Database restore / migration steps

### 6A. Local/dev path using repo Docker MySQL (optional)

From repo root:

```text
npm run db:up
```

This uses `docker/mysql/docker-compose.yml`. Confirm container health before continuing.

### 6B. Restore owner database backup (required for real data recovery)

1. Obtain the owner-approved backup artifact from `<DATABASE_BACKUP_LOCATION>`.
2. Restore into the target MySQL instance/database named in `backend/.env`.
3. Verify the database is reachable with the credentials configured in `backend/.env`.

**UNCERTAIN:** Exact restore command depends on backup format (`.sql`, managed snapshot, provider export). The repo docs do not define a single canonical restore script.

### 6C. Apply migrations on recovered database

From repo root:

```text
npm.cmd run migration:run --workspace backend
npm.cmd run schema:verify --workspace backend
```

Expected result:

- migrations apply cleanly against the restored database
- schema verification passes

If migration or schema verification fails, stop. Do not patch migrations ad hoc during disaster recovery without owner approval.

Optional Gate 12 fixture bootstrap for dev/test reruns only:

- `docs/gate-12-fixture-bootstrap.sql` — use only when intentionally seeding controlled verification topology, not as a substitute for production backup restore

---

## 7. Backend startup

Development:

```text
npm run start:dev --workspace backend
```

Production-like local run after build:

```text
npm.cmd run build --workspace backend
npm run start --workspace backend
```

Expected result:

- backend listens on the port configured in `BACKEND_PORT` (default in `backend/.env.example`: `4000`)
- health/auth endpoints respond without startup crash

Stop if backend fails to boot due to missing env vars, DB connectivity, or migration mismatch.

---

## 8. Frontend startup

Development:

```text
npm run dev --workspace frontend
```

Or local-only frontend dev:

```text
npm run dev:local --workspace frontend
```

Production-like local run after build:

```text
npm.cmd run build --workspace frontend
npm run start --workspace frontend
```

Expected result:

- frontend serves on its configured dev/prod port (commonly `3000` in local examples)
- frontend can reach backend via configured API/proxy settings

Combined dev shortcut from repo root (optional):

```text
npm run dev
```

---

## 9. Verification command checklist

Run from repo root after backend env + database are in place.

### Part 3 money / production verification (V1.3)

Source: Part 3 implementation checkpoint and `part3:suite`

```text
npm.cmd run part3:checkpoint --workspace backend
npm.cmd run auth:operational-access:check --workspace backend
npm.cmd run billing:plan-catalog:check --workspace backend
npm.cmd run billing:webhook-contract-check --workspace backend
npm.cmd run production-config:check --workspace backend
npm.cmd run security:secrets-check --workspace backend
npm.cmd run launch:surface:check --workspace backend
npm.cmd run billing:lifecycle:smoke --workspace backend
npm.cmd run billing:activation:smoke --workspace backend
npm.cmd run billing:multi-org:smoke --workspace backend
npm.cmd run operational-access:isolation:smoke --workspace backend
npm.cmd run part2:suite --workspace backend
npm.cmd run part3:deployment-check --workspace backend
curl http://127.0.0.1:4000/api/health
```

Expected result:

- Part 3 static checks pass
- billing/operational-access smokes return `ok: true` (requires MySQL + `DB_SMOKE_DROP=true` for disposable DB)
- `GET /api/health` returns process + database checks without secrets
- Stripe webhook receipts table exists after migrations (`stripe_webhook_event_receipts`)

**Launch constraint:** Inspection photos and warranty PDFs use local `backend/uploads` unless owner configures durable shared storage. Single-instance persistent disk or shared storage backup is required for multi-instance production.

### Core engineering closeout commands

Source: `WizField_Engineering_Closeout_and_Verification.md` §7 and `WizField_Reverification_Runbook.md` §6

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

- each smoke returns `ok: true`
- backend and frontend builds pass

### Language Store V1 addendum (when LS verification is in scope)

Source: `WizField_Reverification_Runbook.md` §6A

```text
npm.cmd run language-store-entitlement:smoke --workspace backend
npm.cmd run language-store-translation:smoke --workspace backend
npm.cmd run language-store-preference:smoke --workspace backend
npm.cmd run language-store-snapshot-safety:smoke --workspace backend
```

### AI program addendum (when AI verification is in scope)

Source: `WizField_Reverification_Runbook.md` §6B and `WizField_AI_Engineering_Closeout_and_Gap_Register.md`

Set the AI flag bundle from owner-approved env values, then run:

```text
npm.cmd run telephony-messaging:isolation:smoke --workspace backend
npm.cmd run operator-copilot:isolation:smoke --workspace backend
npm.cmd run operator-copilot:contract-check --workspace backend
```

---

## 10. Smoke test checklist

Record PASS/FAIL for each item.

| Check | Source | PASS / FAIL |
|---|---|---|
| Migration run | §9 |  |
| Schema verify | §9 |  |
| Inspections isolation smoke | §9 |  |
| Document snapshot isolation smoke | §9 |  |
| Telephony/messaging isolation smoke | §9 |  |
| Public booking isolation smoke | §9 |  |
| Backend build | §9 |  |
| Frontend build | §9 |  |
| Language Store smokes (if in scope) | §9 |  |
| AI copilot smokes/contract-check (if in scope) | §9 |  |
| Manual login/session sanity | operator |  |
| Org switch sanity (if multi-org fixtures exist) | `WizField_Reverification_Runbook.md` §7 |  |

---

## 11. Production-like recovery checklist

Use when recovering or validating a deployed/staging environment, not just a fresh laptop.

Source: `WizField_Reverification_Runbook.md` §1, §7–§10 and `WizField_Engineering_Closeout_and_Verification.md` §8

1. Confirm deployed backend/frontend URLs resolve.
2. Confirm restored/provisioned database matches target environment.
3. Re-run §9 verification commands against that environment's credentials.
4. Replay multi-org UX checks (`WizField_Reverification_Runbook.md` §7).
5. Replay cross-tenant negative reads (§8).
6. Replay portal token flows (§9).
7. Replay public booking flows (§9).
8. Replay self-serve signup/add-business checks if in scope (§10).
9. Record evidence using the runbook result template (`WizField_Reverification_Runbook.md` §11).
10. For owner launch/billing recovery, follow `WizField_Owner_Launch_Activation_Checklist.md` — live Stripe/webhook proof remains owner scope.

---

## 12. What cannot be reconstructed from docs alone

The following require owner/external systems and cannot be inferred safely from documentation:

- Real `.env` secret values
- Production/staging database contents
- Stripe customer/subscription state unless restored from Stripe + DB together
- Telnyx number ownership, webhook URLs, and provider-side configuration
- SMTP/provider delivery configuration
- Deployment provider infrastructure state
- DNS/TLS/domain routing for public launch surfaces
- Historical audit evidence not captured in git
- Field/mobile app implementation — **not claimed anywhere in current canonical docs**

---

## 13. Stop conditions

Stop recovery and escalate to the owner if any of the following occurs:

- GitHub access or authoritative branch/tag cannot be confirmed
- No valid database backup is available for a data-bearing recovery
- Required secret categories in §3 cannot be populated
- `migration:run` or `schema:verify` fails
- Any required isolation smoke fails
- Backend or frontend build fails
- Recovery would require editing migrations, package files, or undocumented production hotfixes without owner approval
- The operator is being asked to reopen Gate 11–14 statuses instead of replaying evidence on the recovered environment

When stopping, record:

- exact command/output
- environment name
- commit/branch
- missing asset category from §3

---

## 14. Final recovery acceptance checklist

Recovery is accepted only when all applicable items below are true:

- [ ] Repository cloned at intended branch/commit
- [ ] Environment files created from examples and populated from owner secret store (no secrets committed)
- [ ] Database restored or intentionally rebuilt with owner approval
- [ ] `migration:run` PASS
- [ ] `schema:verify` PASS
- [ ] Required smokes PASS
- [ ] Backend build PASS
- [ ] Frontend build PASS
- [ ] Manual login/core route sanity PASS
- [ ] Production-like replay completed if target environment is deployed/public
- [ ] Owner informed of any UNCERTAIN/external-config gaps (Telnyx/SMTP/deployment)
- [ ] No Gate 11–14 status reopening performed during recovery
- [ ] Recovery evidence log stored outside git if needed

---

## References (canonical docs in this set)

- `WizField_Master_Source_of_Truth.md`
- `WizField_Engineering_Closeout_and_Verification.md`
- `WizField_Reverification_Runbook.md`
- `WizField_Owner_Launch_Activation_Checklist.md`
- `WizField_AI_Master_Source_of_Truth.md`
- `WizField_AI_Engineering_Closeout_and_Gap_Register.md`

Environment variable names only (not values):

- `backend/.env.example`
- `frontend/.env.example`
- `docker/mysql/.env.example`
