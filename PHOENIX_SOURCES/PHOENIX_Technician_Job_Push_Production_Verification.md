# Technician Job Push — Production Verification

**Scope:** [https://app.phoenixfireplace.ca](https://app.phoenixfireplace.ca) only. Do not use `app.wizfield.com` for this rollout.

**Backend:** Railway `phoenix-crm-backend` → production MySQL database `wizfield`.

**Commits:** `199e89a` (Web Push feature), `70b2462` (public VAPID key endpoint).

---

## Infrastructure closeout — PASS (2026-10-05)

| Check | Result |
|---|---|
| Railway backend `DB_NAME` | `wizfield` |
| Migration `WebPushSubscriptions1795000000000` on production | Applied once (id 61, timestamp `1795000000000`); table `web_push_subscriptions` exists |
| Railway env | `WEB_PUSH_ENABLED=true`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:service@phoenixfireplace.ca` (private key not in repo) |
| Backend deployed from Phoenix-SaaS | `railway up` + production redeploy |
| Frontend production alias | `app.phoenixfireplace.ca` (Vercel `pheonix-crm-frontend-6bxw`, root directory `frontend`) |
| `GET /api/push/vapid-public-key` | Returns `{ enabled: true, publicKey: "…" }` |
| `GET /push-sw.js` | Served from Phoenix app origin (service worker for OS notifications) |
| Technician UI | “Enable job alerts” banner for `technician` role; auto re-subscribe when permission already granted |

**Ops scripts (read-only / idempotent):**

- `node backend/scripts/check-web-push-migration-production.mjs`
- `node backend/scripts/run-web-push-migration-production.mjs` (skips if migration already recorded)

---

## Michael device acceptance — owner execution

Perform on **iPhone** with Phoenix added to **Home Screen** (required for reliable iOS Web Push), or on **Android Chrome** via **Install app** (requires manifest `192`/`512` icons + registered service worker on `app.phoenixfireplace.ca`).

1. Sign in as Michael (`kuflikmichael@gmail.com`).
2. Tap **Enable alerts** and allow notifications.
3. Force-close the PWA.
4. From an **office/owner** account on another device, on a job **assigned to Michael**:
   - Assign or create → **push expected**
   - Reschedule date/window → **push expected**
   - Change title, address, service, or field-relevant note → **push expected**
   - Cancel job → **push expected**
5. As **Michael**, edit the same assigned job (status, schedule, note) → **no push expected**
6. Tap each notification → must open **`/jobs/{id}`** for that job
7. Confirm **no duplicate** notifications for a single office action and **no pushes** for Michael’s own edits

Record outcome below:

| Step | Pass? | Notes |
|---|---|---|
| Home Screen + Enable alerts | ☐ | |
| Office assign | ☐ | |
| Office reschedule | ☐ | |
| Office detail change | ☐ | |
| Office cancel | ☐ | |
| Michael self-edit (no push) | ☐ | |
| Tap → correct job URL | ☐ | |
| No duplicates | ☐ | |

When all rows are checked, status = **PRODUCTION CLOSED / PASS (device acceptance)**.

---

## Behavior reference

- Push fires only when the **assigned technician’s** linked auth user is **not** the actor making the change.
- Delivery uses **Web Push** subscriptions in `web_push_subscriptions` (not SMS/email).
- Automations `notify_technician` registry remains separate; this is a deterministic CRM hook on job create/update/status/note.
