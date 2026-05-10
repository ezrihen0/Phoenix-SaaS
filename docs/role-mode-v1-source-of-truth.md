# Role Mode V1 Source Of Truth

Role Mode V1 defines the staff authorization model for Phoenix CRM. The backend is the source of truth for every permission decision; frontend checks only improve navigation and hide unavailable actions.

## Roles

- `owner`: full access to CRM operations and owner-only account or role administration.
- `admin`: full operational access, excluding owner-only account ownership actions.
- `office_admin`: day-to-day office operations across jobs, customers, estimates, invoices, pricebook, inventory, calls, messaging, and non-owner settings.
- `dispatcher`: call handling, messaging, dispatch coordination, schedule visibility, and limited job/customer access required to dispatch work.
- `csr`: customer intake, leads, calls, messaging, and limited job/customer creation or read access.
- `technician`: assigned-job workspace access only, including assigned job detail, allowed job status updates, notes, assigned documents when enabled, and scoped inventory.
- `viewer`: read-only access to non-sensitive CRM records; no mutations, messaging sends, payment actions, or settings changes.

## Permission Groups

- `system.roles.manage`: manage staff roles and owner/admin account controls.
- `dashboard.office.view`: view office dashboard data.
- `search.global`: use global CRM search.
- `calls.view`: view calls, recent calls, callback tasks, and call reporting.
- `calls.manage`: manage call-related settings, callback assignments, and phone registry records.
- `messaging.view`: view TXT conversations and templates.
- `messaging.send`: send TXT messages and mark conversations read.
- `jobs.view`: view all jobs.
- `jobs.create`: create jobs.
- `jobs.update`: update job fields, assignment, schedule, and quote/invoice links.
- `jobs.status.update`: update job status.
- `jobs.notes.create`: create job notes.
- `jobs.assigned.view`: view assigned technician jobs.
- `jobs.assigned.status.update`: update allowed assigned-job statuses.
- `customers.view`: view customers.
- `customers.manage`: create or update customers.
- `leads.view`: view leads.
- `leads.manage`: create or update leads.
- `estimates.view`: view estimates.
- `estimates.manage`: create, update, approve, or send estimates.
- `estimates.assigned.view`: view estimates tied to assigned technician jobs.
- `invoices.view`: view invoices.
- `invoices.manage`: create, update, approve, sign, or send invoices.
- `invoices.payment.manage`: record payments, refunds, or adjustments.
- `invoices.assigned.view`: view invoices tied to assigned technician jobs.
- `pricebook.view`: view pricebook items and bundles.
- `pricebook.manage`: create, update, archive, restore, duplicate, or bundle pricebook records.
- `inventory.view`: view global inventory.
- `inventory.manage`: create or update inventory items, locations, transfers, adjustments, and movements.
- `inventory.assigned.view`: view technician-scoped inventory records.
- `settings.view`: view workspace and organization settings.
- `settings.manage`: update non-owner workspace or organization settings.
- `inspections.admin`: access inspection administration features.

## Role Permissions

- `owner`: all permissions.
- `admin`: all permissions except `system.roles.manage`.
- `office_admin`: all operational permissions except owner-only role administration.
- `dispatcher`: `dashboard.office.view`, `calls.view`, `messaging.view`, `messaging.send`, `jobs.view`, `jobs.create`, `jobs.status.update`, `customers.view`, `leads.view`, `leads.manage`, `inventory.view`, and read access to estimates/invoices needed for dispatch coordination.
- `csr`: `calls.view`, `messaging.view`, `messaging.send`, `customers.view`, `customers.manage`, `leads.view`, `leads.manage`, `jobs.create`, limited `jobs.view`, and read access to estimates/invoices needed for customer support.
- `technician`: `jobs.assigned.view`, `jobs.assigned.status.update`, `jobs.notes.create`, `estimates.assigned.view`, `invoices.assigned.view`, and `inventory.assigned.view`.
- `viewer`: read-only CRM permissions for non-sensitive records: `dashboard.office.view`, `jobs.view`, `customers.view`, `leads.view`, `estimates.view`, `invoices.view`, `pricebook.view`, and `inventory.view`.

## Route Rules

- `/calls`: owner, admin, office_admin, dispatcher, csr for view; management actions require `calls.manage`.
- `/messaging`: owner, admin, office_admin, dispatcher, csr.
- `/pricebook`: owner, admin, office_admin, viewer can read; owner, admin, office_admin can manage.
- `/inventory`: owner, admin, office_admin, dispatcher, viewer can view; owner, admin, office_admin can manage; technicians receive scoped views only.
- `/settings`: owner, admin, office_admin for settings; viewer/technician/csr/dispatcher should not change settings.
- `/jobs`: owner, admin, office_admin, dispatcher, csr, viewer for appropriate office views; technicians use assigned-job scope through `/technician`.
- `/customers`: owner, admin, office_admin, dispatcher, csr, viewer for permitted views; mutations require `customers.manage`.
- `/invoices`: owner, admin, office_admin for full access; dispatcher/csr/viewer read only where permitted; technicians assigned scope only.
- `/estimates`: owner, admin, office_admin for full access; dispatcher/csr/viewer read only where permitted; technicians assigned scope only.

## Technician Assigned-Job Scope

Technician access is never based on frontend route visibility alone. The backend must compare `actor.technician.id` with the target job's `assigned_technician_id` before returning assigned job, estimate, invoice, note, or inventory data.

Technicians may update only statuses that are explicitly allowed for technician workflow. Office-only statuses such as intake, cancellation, paid, or administrative states must stay blocked unless a future package changes the workflow rules.

## Backend Enforcement Rules

Every protected API route must do both checks when applicable:

1. Role/action permission, such as `pricebook.manage` or `messaging.send`.
2. Resource scope, such as assigned technician job matching.

Public customer portal routes and provider webhooks are outside staff Role Mode. They must keep their existing portal/session or provider-signature authorization instead of using staff `SessionGuard`.

## Frontend Rules

Frontend route guards, nav filtering, and action visibility must mirror backend permissions but never replace backend checks. If frontend and backend disagree, the backend wins and should return `403`.
