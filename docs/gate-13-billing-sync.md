# Gate 13 — Billing state synchronization (Clover Recurring)

## Strategy (locked for Gate 13)

**Hybrid / reconciliation-first.** Clover’s published webhook event-type table does not document a dedicated recurring-subscription object key; recurring lifecycle webhooks are **not assumed** without sandbox proof.

### Authoritative writes

After any PhoenixOS-initiated Clover **subscription create / update / deactivate** that returns an HTTP body, persist Clover IDs and fields from the **API response** and set `last_clover_sync_at`.

### Reconciliation

`POST /api/billing/reconcile` (owner-only) calls `GET /recurring/v1/subscriptions/{subscriptionId}` when `CLOVER_MERCHANT_ID`, `CLOVER_ACCESS_TOKEN`, and a stored `clover_subscription_id` are configured. Results update local `billing_status`, `clover_plan_id`, and `last_clover_sync_at`. Repeated failures set `billing_status` to `unknown` and `attention_reason` (conservative fail-safe for paid feature gates).

### Subscription lifecycle (G13-P2)

**Clients:** `clover-ecommerce.client.ts` calls SCL `https://scl-*.dev.clover.com/v1/customers` (Bearer ecommerce access token). `clover-recurring.client.ts` calls `CLOVER_API_BASE_URL` + `/recurring/v1/...` with `X-Clover-Merchant-Id` + Bearer (recurring token). Do not merge these responsibilities.

**Tokenization bootstrap:** `GET /api/billing/tokenization-config` is **SessionGuard + billing.manage** only. It returns `merchant_id`, `api_access_key` (value of `CLOVER_ECOMMERCE_PUBLIC_KEY`), and SCL base URL for Clover.js. Widen to anonymous only if Clover’s browser flow proves it is required.

**Start:** `POST /api/billing/subscribe` with `{ plan_key, source, email? }` — `source` must be a Clover card token (e.g. `clv_…`). Server rejects digit-only strings that look like PAN. PhoenixOS creates or updates the ecommerce customer, then `POST /recurring/v1/plans/{planId}/subscriptions`. Local `plan_key` and subscription ids update only after Clover returns success.

**Change plan:** `POST /api/billing/change-plan` with `{ plan_key }` deactivates the stored subscription (`PUT` with `active: false`), then creates a new subscription on the target plan. If create fails after deactivate, local row gets `attention_reason` and `billing_status` `unknown`; resolve in Clover or restore payment method before retrying.

**Cancel:** `POST /api/billing/cancel-subscription` deactivates the Clover subscription and sets local billing to `deactivated`.

### Webhooks

Optional later: only subscribe after sandbox proves payload → organization mapping. Not required for Gate 13 pass.

## Single-merchant model

PhoenixOS uses **one** Clover merchant; each PhoenixOS **organization** maps to one Clover **customer** and optional **subscription** under that merchant.
