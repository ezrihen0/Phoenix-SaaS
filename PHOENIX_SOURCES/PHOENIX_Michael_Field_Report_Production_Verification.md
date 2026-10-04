# Michael Field Historical Report — Production Verification

This checklist is **post-deploy** verification on `https://app.phoenixfireplace.ca`. It is separate from local harness runs (`npm run phoenix-field-report:smoke --workspace backend`).

## Preconditions

- Migrations `1792000000000-phoenix-field-historical-report` and `1792100000000-phoenix-field-report-delivery-closeout` applied on production `wizfield` DB.
- Backend env: `MICHAEL_HISTORICAL_REPORT_ENABLED=true`, `MICHAEL_HISTORICAL_REPORT_USER_EMAIL` set to Michael’s login email, email transport configured (`EMAIL_TRANSPORT=cloudflare_api` on Railway).
- Frontend env mirrors allowlist (`PHOENIX_OWNER_EMAIL`, `MICHAEL_HISTORICAL_REPORT_USER_EMAIL`, `MICHAEL_HISTORICAL_REPORT_ENABLED`).

## Verification steps

1. **Access:** Michael and owner can open `/michaelreport`; other staff accounts are redirected; wrong organization session returns forbidden from API.
2. **Draft persistence:** Enter complete and incomplete jobs (empty customer names, partial parts costs, multiple product lines). Confirm header shows **Saving…** then **Saved**. Hard-refresh immediately after typing, close/reopen the tab, and briefly go offline — every field (including warranty toggles and extra job rows) restores without duplicate CRM rows. Report recipient email is only required at review/submit.
3. **Submit:** Enter report delivery email on the review step (independent of login). Submit one paid and one unpaid job — CRM shows completed jobs, native invoice numbers, ledger payments match amounts received.
4. **PDF:** Download link returns a PDF with customer, work date, sold items, warranty, parts (description, qty, cost incl. tax), review status, payment details, and overall totals (sale before tax, tax, sale incl. tax, parts incl. tax, remaining after parts).
5. **Email (provider vs inbox):** Status shows CRM import separately from email provider acceptance. Provider acceptance does **not** mark inbox delivery verified. **Retry email only** re-sends without duplicating CRM rows if send fails.
6. **Owner closeout:** Owner confirms inbox receipt, then **Close one-time report tool** — new drafts/submits are blocked (`phoenix_field_historical_report_org_locks`); Michael can still open the done view and download PDF. Set `MICHAEL_HISTORICAL_REPORT_ENABLED=false` when convenient for defense in depth.
7. **No customer comms:** Confirm no invoice send, SMS, or review automation fired for imported customers (spot-check provider logs / absence of `sent_at` on invoices).

## Rollback

Set `MICHAEL_HISTORICAL_REPORT_ENABLED=false` on backend and frontend to disable the surface immediately. Org lock from owner closeout also blocks new entry without env changes. Imported CRM rows and stored PDFs are intentional production data — reverse via normal CRM tools if needed.
