# Gate 13 — Owner acceptance script (Clover SaaS billing)

Run with a **owner** session and an **active organization** selected. Record PASS/FAIL.

## 1. Settings billing surface

1. Open `/settings` as **owner**. **Pass:** A **Billing** cube appears.
2. Open Billing. **Pass:** Plan and billing status display; copy states SaaS billing is separate from tenant invoices.
3. If server has `CLOVER_MERCHANT_ID` + `CLOVER_ACCESS_TOKEN` and org has `clover_subscription_id` in DB, click **Sync from Clover**. **Pass:** No unhandled error; message reflects success or missing data.
4. With ecommerce + recurring env configured, **Pass:** Lifecycle section shows tokenization bootstrap when `CLOVER_ECOMMERCE_PUBLIC_KEY` is set; **Start subscription** / **Change plan** / **Cancel** return clear errors or success without sending raw card numbers to the server (only `clv_…` tokens).

## 2. Plan gates (backend)

Prepare two org billing rows (SQL or migration clone) if needed: Org A `business`/`active`, Org B `starter`/`active`.

4. As user with access to Org B, call `POST /api/pricebook/items` (valid body). **Pass:** `403` `plan_pricebook_manage_forbidden`.
5. Switch to Org A, same call shape with permission. **Pass:** `200` or validation `400`, not `403 plan_*`.

6. On Org B, `POST /api/automations/rules` (or any automations route with org context). **Pass:** `403` `plan_automations_forbidden` or `billing_subscription_inactive` if status blocks.

7. On Org B, inventory mutate e.g. `POST /api/inventory/items`. **Pass:** `403` `plan_inventory_manage_forbidden` (office inventory role).

## 3. Regression

8. Record a tenant **invoice payment** via existing CRM flow. **Pass:** Still works; no Clover fields on invoice payment APIs.

## 4. Builds and git

9. `npm.cmd run build --workspace backend` → **PASS**  
10. `npm.cmd run build --workspace frontend` → **PASS**  
11. `git status --short` → **Pass:** Only Gate 13–related files (or expected env/docs).
