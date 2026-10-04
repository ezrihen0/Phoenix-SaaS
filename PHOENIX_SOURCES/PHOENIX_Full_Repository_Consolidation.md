# Phoenix full repository consolidation

**Document role:** Consolidation plan and reading order for the `PHOENIX_SOURCES` package.  
**Package date:** 2026-10-02  
**Scope:** Documentation only. Originals were copied, not renamed or deleted. Application code, database, migrations, configuration, and deployment were not changed.

This file did not previously exist in the repository. It records how the current source set was selected, which copy wins when documents disagree, and which files were left out because a newer Source of Truth or closeout already replaced them.

---

## 1. What this package is

`PHOENIX_SOURCES/` is one flat folder of the current Phoenix / WizField source documents for external review (ChatGPT).

Rules used to build it:

1. Prefer `docs/` over `docs/chatgpt-review-package/`. The Master Source of Truth states that the review package is a historical snapshot and is not current authority. Every paired file in that package differs from `docs/`.
2. Copy the newest canonical file byte-for-byte. Copies were hash-checked against their originals.
3. Do not copy a superseded planning file when a current Source of Truth or closeout already owns that subject.
4. When two included documents conflict, the newest canonical Source of Truth wins. The older text is kept so the conflict stays visible. It is not rewritten inside the copy.
5. Every filename in this folder contains `PHOENIX`.

Internal links inside the copies still point at their original repository paths (`docs/…`, `frontend/…`, `backend/…`). They were not rewritten.

---

## 2. Authority order

Read in this order. A later file does not override an earlier one.

| Order | Wins on | File in this package |
|---|---|---|
| 1 | Product architecture, tenant model, production operating verdict, domains | `PHOENIX_WizField_Master_Source_of_Truth.md` |
| 2 | AI architecture, Home AI, Brain, Copilot, read/write policy | `PHOENIX_WizField_AI_Master_Source_of_Truth.md` |
| 3 | Language Store | `PHOENIX_WizField_Language_Store_Source_of_Truth.md` |
| 4 | Growth Center | `PHOENIX_WizField_Growth_Center_Source_of_Truth.md` |
| 5 | Service Intelligence taxonomy and persistence | `PHOENIX_WizField_Service_Intelligence_Source_of_Truth.md` |
| 6 | Backup, restore, rebuild procedure | `PHOENIX_WizField_Disaster_Recovery_and_Rebuild_Runbook.md` |
| 7 | Owner activation items still outside engineering | `PHOENIX_WizField_Owner_Launch_Activation_Checklist.md` |
| 8 | Gate 11–14 evidence plus the 2026-10-03 Phoenix cutover addendum | `PHOENIX_WizField_Engineering_Closeout_and_Verification.md` |
| 9 | Replay procedure, including the 2026-10-03 invoice-delivery addendum | `PHOENIX_WizField_Reverification_Runbook.md` |
| 10 | September 2026 verification evidence | `PHOENIX_WIZFIELD_PRODUCTION_CLOSEOUT.md` |

The September production closeout is evidence. It is not a second Source of Truth. Where its header disagrees with the Master Source of Truth, use the Master Source of Truth.

---

## 3. Current operating verdict (resolved)

Use this statement when older pages still say only **CONDITIONAL GO**:

**Phoenix CRM production domain cutover is CLOSED / GO (2026-10-03).**

| Surface | URL |
|---|---|
| Staff CRM | `https://app.phoenixfireplace.ca` |
| Customer portal | `https://portal.phoenixfireplace.ca` |
| Rollback staff surface | `https://app.wizfield.com` |

- Production database remains **`wizfield`**. No schema migration and no database copy/rename were part of the domain cutover.
- Current Phoenix Fireplace organization: `8d5bc762-eb13-43e5-85a1-723477adb47c` / slug `phoenix-fireplace`.
- Production owner login recorded in the Master Source of Truth: `service@phoenixfireplace.ca`.
- Outbound invoice email on Railway: `EMAIL_TRANSPORT=cloudflare_api`. SMTP remains the local/dev path.
- Portal host routing in production uses Cloudflare Worker `phoenix-portal-host-proxy` until `portal.phoenixfireplace.ca` is attached directly on the Vercel project.

Owner conditions that the Master Source of Truth still leaves open:

- production Terms (remove DRAFT placeholders)
- production Privacy (remove DRAFT placeholders)
- production support email (`NEXT_PUBLIC_SUPPORT_EMAIL`)
- actual DB and uploaded-file backup execution/evidence beyond the 2026-10-03 logical DB backup
- controlled release staging / pending migrations / clean baseline

WizField SaaS commercialization remains paused. Paid acquisition remains owner-gated. Stripe is not an active billing provider.

---

## 4. Conflicts (newest Source of Truth wins)

Copies were not edited to hide these. Reviewers should apply the resolution below.

### 4.1 Production verdict wording

| Document | What it still says | Resolution |
|---|---|---|
| Master Source of Truth | Domain cutover **CLOSED / GO (2026-10-03)**. Earlier CONDITIONAL GO items remain only where not explicitly closed. | **Wins.** |
| Engineering Closeout, 2026-10-03 addendum | Engineering verdict **CLOSED / GO** for `app.phoenixfireplace.ca` / `portal.phoenixfireplace.ca`. Opening paragraphs still point at the September closeout **CONDITIONAL GO** for the older foundation record. | Use the 2026-10-03 addendum for the current Phoenix CRM verdict. Use the opening sections only as Gate 11–14 history. |
| Reverification Runbook §6B | Records the same **CLOSED / GO (2026-10-03)**, and also keeps a replay gate: portal host routing is **BLOCKED** until `phoenix-portal-host-routing:verify` and the production invoice E2E pass. | The recorded cutover is CLOSED / GO. The blocker sentence is the replay rule if portal routing regresses. It does not reopen the recorded closeout. |
| Production closeout §1 | **CONDITIONAL GO** (generated 2026-09-03). | Historical evidence for the September audit. Not the current domain verdict. |
| Owner Launch Activation Checklist | Opens with **CONDITIONAL GO / YES WITH CONDITIONS** and does not yet record the 2026-10-03 domain cutover. | Still the owner checklist for legal, support, and backup evidence. Its opening verdict line is stale relative to the Master Source of Truth. |

### 4.2 Phoenix organization id

| Document | Organization id | Resolution |
|---|---|---|
| Master Source of Truth | `8d5bc762-eb13-43e5-85a1-723477adb47c` | **Current production organization.** |
| Production closeout addendum (2026-09-20) | same `8d5bc762-…` | Agrees with the Master Source of Truth for the post-cutover org. |
| Production closeout header | `5edc3ccd-efbd-4f74-9f99-d2b8c05ad644` | Stale header. Do not use it as the current org id. |
| Service Intelligence Source of Truth | `5edc3ccd-…` as the first classified Workiz corpus | Left as written. It is not updated here to the current org id, because this package does not prove whether that historical corpus id was remapped. Current operating identity remains `8d5bc762-…`. |

### 4.3 Staff app URL inside the September closeout addendum

The 2026-09-20 addendum still lists the app URL as `https://app.wizfield.com`.

The Master Source of Truth and the 2026-10-03 engineering addendum list `https://app.phoenixfireplace.ca` as the staff production surface and `https://app.wizfield.com` as rollback.

**Resolution:** use the Master Source of Truth URLs.

### 4.4 Duplicate review snapshot

`docs/chatgpt-review-package/` duplicates the canonical docs at an older freeze (lean-cutover commit). The Master Source of Truth marks that folder as not current authority. Those copies were not brought into this package. `WizField_ChatGPT_Review_Bundle.md` is the concatenated form of that same snapshot.

---

## 5. Execute / execution rules

`Execute.txt` is not in the worktree and has no git history in this repository. The historical review report listed it as excluded by design, and the built-product inventory already recorded it as not found. It was not invented for this package.

Current execution process for AI and engineering work:

- `PHOENIX_AI_WORKFLOW_RULES.md` (from `docs/AI_WORKFLOW_RULES.md`)
- `PHOENIX_OWNER_FEATURE_CHECKLIST_EN.md` (from `docs/OWNER_FEATURE_CHECKLIST_EN.md`)

`WizField_Finance_Master_Program_Reference.md` contains a section titled “Program Execution Rules.” That file labels itself a planning reference with no implementation authority. It was not copied. Finance product truth that is already locked lives in the Master Source of Truth, not in that program map.

---

## 6. Files intentionally excluded

| Path | Why it was not copied |
|---|---|
| `docs/chatgpt-review-package/**` | Historical review snapshot. Differs from `docs/`. Not current authority. |
| `docs/archive/ai/**` | Phase execution prompts. AI Master Source of Truth says they are audit-only, not authoritative. |
| `docs/WizField_Built_Product_Inventory_and_Working_System_Map.md` | Historical inventory (2026-05-29). The file itself says it is not a Source of Truth. |
| `PART2_IMPLEMENTATION_CHECKPOINT.md`, `PART3_IMPLEMENTATION_CHECKPOINT.md` | Historical implementation checkpoints. Later closeout superseded their open verdicts. |
| `WIZFIELD_FULL_SYSTEM_AUDIT.md` | Historical audit (2026-08-27). Not the current production verdict. |
| `docs/HOME_AI_V1_RBAC_AUDIT.md`, `docs/WizField_AI_Chat_WIP_Scope_Decision.md` | Historical. AI Master Source of Truth says they do not describe current Home AI. |
| `docs/TEAM_PERMISSIONS_V1_RBAC_AUDIT.md` | Pre-implementation audit. Current RBAC truth is Master Source of Truth §5. The implementation summary was copied; the audit was not. |
| `docs/WizField_AI_Agents_V1.md` | Older `POST /api/ai/chat` agent. Not Home AI. Not listed as canonical AI truth. |
| `docs/WizField_AI_Actions_V1_Integration_Map.md` | Actions framework note. Must not be read as shipped AI write actions. AI Master Source of Truth does not list it as canonical. |
| `docs/Mobile_Field_App_V1_Design_Freeze.md`, `docs/Mobile_Field_App_V1_Functional_Freeze.md` | May 2026 design/functional freeze records, not current product authority. |
| `docs/finance/phase*.md` | Finance program worksheets. Not a Source of Truth. |
| `WizField_Finance_Master_Program_Reference.md` | Planning reference. No implementation authority by itself. |
| `docs/ops/pilot/**` | Field-partner ops templates, not architecture truth. |
| `docs/field-knowledge/**` | Trade knowledge corpus and candidate updates. Not the product Source of Truth set. |
| `backend/src/integrations/phoenix/PHOENIX_REQUEST_SERVICE_SCHEDULING_CONTRACT.md` | Implementation note beside production code. It cites “Phoenix SOT §36,” and the current Master Source of Truth has no §36. Not copied, so a stale section pointer is not treated as canonical. |

Retired plans already removed from the active tree (Growth Center master plan, signup/activation master plan, Language Store execution packages) stay in git history only. They were not reconstructed.

---

## 7. Package inventory

See the review handoff for the full original-path map. Every copied file except this plan is a byte-identical copy of the path named in its review row.

This plan is new. It is the consolidation record for the package.

---

## 8. Change boundary

Confirmed for this consolidation:

- No application source, database, migration, configuration, or deployment file was edited.
- Original documents were not deleted or renamed.
- Nothing in this folder has been committed or pushed.
