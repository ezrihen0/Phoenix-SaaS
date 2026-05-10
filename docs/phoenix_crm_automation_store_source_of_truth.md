# Phoenix CRM — Automation Store Source of Truth

## 1. Executive Summary

The Automation Store is a first-class product area inside Phoenix CRM.

It is not a small utility, not a settings page, and not a background script collection.

Its purpose is to turn trusted CRM activity into safe, auditable, money-producing business actions.

Core product sentence:

```text
Automation Store is the revenue automation layer of Phoenix CRM. It turns CRM events into safe, controlled, and auditable follow-ups, reminders, reviews, alerts, and internal actions.
```

The Automation Store must support Phoenix Chimney & Fireplace first, while being structured so the same logic can later support other companies with minimal rewrite.

Strategic direction:

```text
Phoenix-first. SaaS-aware. Not full SaaS yet.
```

The system must be useful immediately for Phoenix operations, but it must not hardcode Phoenix-specific values into automation logic.

Phoenix-specific business data must come from organization settings, templates, tokens, or configuration.

Examples:

```text
Correct: send {{company.google_review_url}}
Wrong: send hardcoded Phoenix Google review link

Correct: {{company.name}}
Wrong: Phoenix Chimney & Fireplace hardcoded inside the automation engine

Correct: {{company.timezone}}
Wrong: Calgary timezone hardcoded inside the scheduler
```

---

## 2. Product Philosophy

The Automation Store exists because CRM data is only valuable if it creates action.

Phoenix CRM already stores operational truth:

- jobs
- customers
- leads
- estimates / quotes
- invoices
- payments
- calls
- messaging
- inventory
- inspections
- warranty certificate previews
- settings

The Automation Store sits above these roots and asks:

```text
When something important happens, what should the business do automatically or semi-automatically?
```

The Automation Store is built around this model:

```text
IF this happened → THEN do that → safely → with audit → with owner control.
```

The store must feel like a premium business command center, not a technical CRUD table.

It should make the user feel:

```text
This system is working for me even when I am not touching it.
```

---

## 3. Business Purpose

The Automation Store exists to improve Phoenix in five business areas:

1. Revenue recovery
2. Review generation
3. Customer communication
4. Office efficiency
5. Operational control

High-value examples:

```text
Invoice paid and balance is zero → send Google review request
Estimate not approved after X days → create sales follow-up
Job scheduled → send customer reminder
Missed call → create callback task / pending action
Job completed → remind technician or office to record inventory used
Warranty nearing expiry → create follow-up opportunity
```

The most important early money automation is:

```text
When invoice is fully paid and the job is completed, send the customer a Google review request link after a controlled delay, only if a review request has not already been sent.
```

Why this matters:

```text
More reviews → more trust → higher conversion → lower ad dependency → more profitable leads.
```

---

## 4. Scope Boundary

### Automation Store owns

- automation discovery
- automation categories
- automation template cards
- active automation rules
- sentence-based automation builder
- trigger/action/condition/timing selection
- approval queue
- automation run history
- automation logs
- manual approval mode
- auto-send mode for safe customer-facing messages
- global kill switch / pause behavior
- automation-safe message template selection
- token and placeholder usage

### Automation Store does not own

- live Pricebook pricing
- inventory stock truth
- invoice totals
- quote totals
- payment ledger truth
- job status source of truth
- inspection report source of truth
- SMS transport internals
- call webhook internals
- customer record ownership
- authentication/session ownership

Automation may consume these systems. It must not become their source of truth.

---

## 5. Strategic SaaS-Ready Rule

The Automation Store must be designed as if Phoenix is the first tenant.

This does not mean building public SaaS now.

It means:

- no hardcoded Phoenix business values inside automation logic
- templates use tokens
- company values come from organization settings
- automation rules belong to an organization / tenant concept
- actions are registry-driven, not hardcoded button-by-button
- audit logs are organization-scoped
- manual approval can be enabled per rule
- customer-facing messages use approved templates
- dangerous actions require human approval

Correct architecture sentence:

```text
Build the system for Phoenix today, but model it so another contractor can use the same automation engine later by changing company settings, templates, tokens, and enabled rules.
```

---

## 6. Route Ownership

Primary route:

```text
/automations
```

Future child routes may include:

```text
/automations/store
/automations/active
/automations/pending-actions
/automations/logs
/automations/templates
/automations/settings
```

The route must be a main internal CRM area, visible in the app shell navigation for permitted roles.

It must not be buried inside `/settings`.

Settings may later contain global automation controls, but the main product experience belongs in `/automations`.

---

## 7. UI / UX Standard

The Automation Store must feel premium and operationally valuable.

The UI should follow a store / command-center model, not a plain admin table.

### Main page sections

Suggested layout:

```text
Hero section
- Title: Automation Store
- Subtitle: Turn CRM events into automatic follow-ups, reminders, reviews, and office actions.
- Summary cards: Active automations, Pending approvals, Runs today, Failed actions

Category tabs / filters
- Recommended
- Revenue Recovery
- Customer Experience
- Marketing & Reviews
- Payments & Documents
- Phone Actions
- Office Operations
- Field Operations
- Inventory
- Warranty

Automation cards grid
- Name
- Short description
- Category
- Risk level
- Status
- Mode
- CTA buttons
```

### Automation card statuses

```text
Available
Draft
Active
Paused
Disabled
Coming Soon
Needs Setup
Failed
```

### Automation card actions

```text
Preview
Configure
Enable
Disable
Duplicate
View Activity
```

### Required design behavior

- cards must be scannable
- risk level must be visible
- customer-facing actions must be clearly marked
- financial/document-related automations must show caution
- coming-soon automations may exist as placeholders, but must not run
- no hidden activation
- no silent customer messaging without clear mode

---

## 8. Automation Categories

Initial category set:

### 8.1 Recommended

Phoenix-priority automations selected for immediate business value.

Examples:

```text
Review Request After Payment
Estimate Follow-Up
Job Reminder SMS
Missed Call Recovery
Unpaid Invoice Follow-Up
```

### 8.2 Revenue Recovery

Automations that recover money from existing leads, estimates, invoices, and calls.

Examples:

```text
Unpaid invoice reminder
Estimate not approved follow-up
Lead with no scheduled job follow-up
Missed call callback task
```

### 8.3 Customer Experience

Automations that improve service quality and customer communication.

Examples:

```text
Appointment reminder
Technician on-the-way message
Thank-you after service
Post-job satisfaction check
```

### 8.4 Marketing & Reviews

Automations that create reputation, referrals, and repeat business.

Examples:

```text
Review request after payment
Seasonal fireplace maintenance reminder
Annual chimney cleaning reminder
Referral request
```

### 8.5 Payments & Documents

Automations related to invoices, estimates, payments, approvals, signatures, warranty, and document workflows.

Examples:

```text
Payment reminder
Quote approval reminder
Payment received office notification
Warranty certificate suggestion
```

### 8.6 Phone Actions

Automations related to calls, missed calls, voicemail, callback recovery, and queue follow-up.

Examples:

```text
Missed call creates callback task
Voicemail received alerts office
Callback not completed after X hours escalates
Unknown caller creates lead review task
```

### 8.7 Office Operations

Automations that help the office manage internal workflow.

Examples:

```text
Create office task
Notify office when report is missing
Notify office when job has no invoice
Notify office when customer reply is unread
```

### 8.8 Field Operations

Automations that support technicians and field work.

Examples:

```text
Technician job reminder
Technician inventory usage reminder
Missing inspection photos reminder
Job completed without notes alert
```

### 8.9 Inventory

Automations that surface inventory risk without mutating stock silently.

Examples:

```text
Low stock alert
Reorder point reached
Technician stock needs review
Inventory usage report missing after job
```

### 8.10 Warranty

Automations related to warranty certificates, warranty terms, and warranty follow-up.

Examples:

```text
Warranty certificate suggestion after paid invoice
Warranty expiry follow-up
Extended warranty upsell suggestion
```

---

## 9. Core Architecture Model

The Automation Store must separate these concepts:

```text
Template
Rule
Run
Log
Pending Action
Scheduled Run
```

This separation is mandatory.

Do not merge these concepts into one table or one object.

---

## 10. Automation Template

An Automation Template is the product card shown in the store.

It describes what can be installed or configured.

Template example:

```json
{
  "templateKey": "review_request_after_paid_invoice",
  "category": "marketing_reviews",
  "title": "Review Request After Payment",
  "description": "Send a Google review link after an invoice is fully paid.",
  "riskLevel": "low",
  "defaultMode": "auto_send",
  "status": "available",
  "supportedTriggers": ["invoice.balance_zero"],
  "supportedActions": ["send_review_link", "create_pending_action"],
  "requiredSettings": ["company.google_review_url"],
  "requiredTokens": ["client.name", "company.name", "company.google_review_url"]
}
```

Template rules:

- templates can exist without being active
- templates may be built-in or future custom
- templates define allowed triggers, actions, conditions, tokens, and risk defaults
- templates do not represent a live automation until a rule is created
- coming-soon templates may appear in the store but must not be executable

---

## 11. Automation Rule

An Automation Rule is an enabled or draft configuration created from a template.

Rule example:

```json
{
  "ruleId": "rule_123",
  "templateKey": "review_request_after_paid_invoice",
  "organizationId": "phoenix",
  "name": "Review Request After Paid Invoice",
  "enabled": true,
  "mode": "auto_send",
  "trigger": {
    "entity": "invoice",
    "event": "balance_zero"
  },
  "conditions": [
    {
      "field": "job.status",
      "operator": "equals",
      "value": "completed"
    },
    {
      "field": "review_request.sent",
      "operator": "equals",
      "value": false
    }
  ],
  "action": {
    "type": "send_review_link",
    "target": "client",
    "medium": "sms",
    "templateKey": "review_request_sms_default"
  },
  "timing": {
    "relation": "after",
    "value": 1,
    "unit": "hour",
    "anchor": "invoice.balance_zero_at"
  },
  "approval": {
    "required": false
  }
}
```

Rule rules:

- a rule may be draft, active, paused, disabled, or failed
- only active rules can create runs
- every rule must reference one template or a future custom rule definition
- rules must store structured JSON, not plain English only
- sentence UI is display/editing layer only
- backend must validate rule JSON before saving

---

## 12. Automation Run

An Automation Run is one execution attempt caused by one automation rule and one triggering record.

Run example:

```json
{
  "runId": "run_789",
  "ruleId": "rule_123",
  "organizationId": "phoenix",
  "triggerEntityType": "invoice",
  "triggerEntityId": "inv_456",
  "status": "completed",
  "startedAt": "2026-05-10T18:00:00Z",
  "completedAt": "2026-05-10T18:00:02Z"
}
```

Run statuses:

```text
queued
scheduled
running
pending_approval
completed
failed
cancelled
skipped
```

Run rules:

- every execution attempt must create or update a run record
- skipped runs must be logged with a reason
- failed runs must store a safe error message
- repeated duplicate sends must be prevented through idempotency

---

## 13. Automation Log

Automation Logs are the audit trail.

Every meaningful step must be logged.

Log example:

```json
{
  "logId": "log_123",
  "runId": "run_789",
  "level": "info",
  "message": "Review SMS sent to client.",
  "metadata": {
    "conversationId": "customer:123",
    "messageTemplate": "review_request_sms_default"
  },
  "createdAt": "2026-05-10T18:00:02Z"
}
```

Log levels:

```text
info
warning
error
system
```

Log rules:

- no automation may run without logs
- customer-facing sends must log target, template, rule, and source record
- financial/document-related automations must log approval state
- logs must be visible in `/automations/logs` or a rule activity panel

---

## 14. Pending Action / Approval Queue

Pending Actions are actions created by automations that require human approval before execution.

Route:

```text
/automations/pending-actions
```

Pending action example:

```json
{
  "pendingActionId": "pa_123",
  "ruleId": "rule_123",
  "runId": "run_789",
  "organizationId": "phoenix",
  "type": "send_sms",
  "targetType": "client",
  "targetId": "customer_456",
  "relatedEntityType": "invoice",
  "relatedEntityId": "inv_456",
  "preview": "Hi John, thank you for choosing Phoenix...",
  "status": "pending",
  "createdAt": "2026-05-10T18:00:00Z"
}
```

Pending action statuses:

```text
pending
approved
dismissed
edited
sent
failed
expired
```

Approval Queue UI actions:

```text
Approve & Send
Edit
Dismiss
View Record
View Rule
```

Approval rules:

- manual approval mode creates pending actions instead of sending immediately
- high-risk automations must default to manual approval
- users must see message preview before approval
- approval action must be logged
- dismissal must be logged with optional reason

---

## 15. Sentence-Based Builder

The builder must use a natural sentence structure.

Base grammar:

```text
WHEN [entity] [event]
DO [action] [target] [medium] [timing]
ONLY IF [condition]
WITH [approval mode]
```

Example:

```text
When [an invoice] [is fully paid]
send [client] [a review link] [by SMS] [1 hour after payment]
only if [job status] [is] [completed]
with [auto-send]
```

Another example:

```text
When [a job] [is scheduled]
send [client] [an appointment reminder] [by SMS] [4 hours before the job]
with [manual approval]
```

Builder rules:

- static words display as plain text
- dynamic words display as clickable/selectable tokens
- clicking a token opens a dropdown or popover
- changing one block must filter valid options in later blocks
- invalid combinations must be impossible, not merely error-prone
- frontend may render the sentence, but backend must validate the final JSON

Correct model:

```text
User sees sentence.
System stores structured JSON.
Engine executes structured JSON.
```

---

## 16. Token & Placeholder System

Tokens are required for SaaS-ready automation.

Tokens must allow the same automation to work for Phoenix and later for another company.

### Company tokens

```text
{{company.name}}
{{company.phone}}
{{company.email}}
{{company.website}}
{{company.google_review_url}}
{{company.timezone}}
{{company.logo_url}}
```

### Client tokens

```text
{{client.name}}
{{client.first_name}}
{{client.phone}}
{{client.email}}
```

### Job tokens

```text
{{job.id}}
{{job.type}}
{{job.status}}
{{job.scheduled_at}}
{{job.completed_at}}
{{job.address}}
{{job.technician_name}}
```

### Invoice tokens

```text
{{invoice.number}}
{{invoice.total}}
{{invoice.balance}}
{{invoice.paid_at}}
{{invoice.payment_link}}
```

### Estimate / Quote tokens

```text
{{estimate.number}}
{{estimate.total}}
{{estimate.status}}
{{estimate.approval_link}}
```

### User / technician tokens

```text
{{technician.name}}
{{technician.phone}}
{{office_user.name}}
```

Token rules:

- unresolved tokens must not be sent to customers
- customer-facing previews must show rendered values or safe fallback values
- token registry must define which tokens are available for each trigger entity
- tokens must not expose internal-only fields to customer messages
- tokens must support future organization/tenant separation

---

## 17. Trigger Registry

Triggers define what starts an automation.

Initial trigger categories:

### Job triggers

```text
job.created
job.scheduled
job.rescheduled
job.completed
job.cancelled
job.status_changed
```

### Invoice triggers

```text
invoice.created
invoice.sent
invoice.payment_recorded
invoice.balance_zero
invoice.unpaid_after_x_days
```

### Estimate / Quote triggers

```text
estimate.created
estimate.sent
estimate.approved
estimate.not_approved_after_x_days
estimate.signed
```

### Payment triggers

```text
payment.recorded
payment.failed
payment.balance_zero
```

### Call triggers

```text
call.missed
call.voicemail_received
call.callback_not_completed_after_x_hours
call.unknown_caller
```

### Messaging triggers

```text
sms.received
sms.unread_after_x_hours
customer.replied
```

### Inventory triggers

```text
inventory.low_stock
inventory.reorder_point_reached
inventory.usage_report_missing_after_job
```

### Inspection triggers

```text
inspection.created
inspection.completed
inspection.report_ready
inspection.missing_required_fields
inspection.missing_photos
```

### Warranty triggers

```text
warranty.certificate_suggested
warranty.expiring_in_x_days
warranty.expired
```

Trigger rules:

- every trigger must be registered
- every trigger must define entity type and payload shape
- time-based triggers require scheduler support
- no trigger may be created from unstable or ambiguous state
- financial triggers must rely on payment ledger truth, not UI assumptions

---

## 18. Condition Registry

Conditions filter whether an automation should run.

Examples:

```text
only if job status is completed
only if invoice balance is 0
only if client has phone number
only if client has not received review request
only if estimate is not approved
only if inventory stock is below reorder point
only if message template exists
only if company review link is configured
```

Condition structure:

```json
{
  "field": "invoice.balance",
  "operator": "equals",
  "value": 0
}
```

Supported operators:

```text
equals
not_equals
greater_than
less_than
contains
exists
not_exists
before
after
within_last
not_within_last
```

Condition rules:

- conditions must be backend-validated
- unavailable fields must not appear in builder options
- condition failures should create skipped logs when useful
- conditions must prevent duplicate customer sends

---

## 19. Action Registry

Actions define what the automation can do.

V1 safe actions:

```text
send_sms_from_template
send_review_link
notify_office
notify_technician
create_task
create_pending_action
```

V1.5 actions:

```text
send_payment_link
send_quote_approval_reminder
suggest_warranty_certificate
create_follow_up_task
```

V2 advanced actions:

```text
create_callback_task
update_status
create_document_draft
trigger_external_webhook
inventory_deduction_suggestion
```

Dangerous actions not allowed in V1:

```text
change invoice total
change quote total
mark invoice paid
delete customer data
deduct inventory automatically
issue legal/warranty document automatically without approval
change payment ledger directly
```

Action rules:

- every action must be registered
- every action must define risk level
- every action must define required permissions
- every action must define whether manual approval is required
- customer-facing actions must use approved templates
- dangerous write actions are not V1

---

## 20. Risk Levels

Every automation template and action must have a risk level.

### Low Risk

Usually allowed to auto-send if template is approved.

Examples:

```text
review request
appointment reminder
thank-you message
internal office notification
technician reminder
create internal task
```

### Medium Risk

Usually defaults to manual approval unless owner changes mode.

Examples:

```text
payment reminder
quote follow-up
warranty upsell
maintenance reminder
customer follow-up after complaint
```

### High Risk

Must require human approval in V1.

Examples:

```text
financial document actions
legal/report actions
warranty certificate sending
payment-related status changes
inventory deduction
customer data mutations
```

Risk rules:

```text
Customer-facing communication from approved templates may auto-send.
Financial/document/data mutations require human-in-the-loop.
```

---

## 21. Timing & Scheduler Model

The Automation Store must support immediate and delayed automations.

Timing examples:

```text
immediately
1 hour after payment
4 hours before job scheduled time
3 days after estimate sent
7 days after unpaid invoice
11 months after job completed
30 days before warranty expiry
```

Timing structure:

```json
{
  "relation": "before",
  "value": 4,
  "unit": "hour",
  "anchor": "job.scheduled_at"
}
```

Scheduler requirements:

- scheduled runs must be stored
- scheduled runs must support cancellation
- scheduled runs must support recalculation when anchor date changes
- scheduled runs must prevent duplicate sends
- scheduled runs must respect organization timezone
- scheduled runs must log execution status

Scheduled run statuses:

```text
pending
running
completed
failed
cancelled
skipped
expired
```

Critical rule:

```text
If a job is rescheduled, old scheduled reminders must not send the wrong time.
```

---

## 22. Message Template Rules

V1 customer-facing messages must use approved templates.

The automation rule chooses a template. It does not store random freeform copy as the main source of truth.

Template example:

```text
Hi {{client.first_name}}, thank you for choosing {{company.name}}. If you were happy with our service, please leave us a Google review here: {{company.google_review_url}}
```

Template rules:

- must support tokens
- must preview rendered output
- must validate required tokens
- must prevent sending unresolved tokens
- must identify channel: SMS, email, internal
- must support active/inactive state
- must be organization-aware for future SaaS

SMS should reuse the existing messaging/SMS infrastructure where possible.

Email may be planned in the source of truth, but should not be implemented until an email provider/transport is selected and approved.

---

## 23. Customer Communication Safety

Before sending customer-facing communication, automation must check:

```text
customer has valid phone/email
message template is active
required company setting exists
required tokens resolve
customer has not already received this automation recently
rule is enabled
global customer-facing automation switch is not disabled
approval mode is satisfied
```

Future customer preference fields should be considered:

```text
can_sms
can_email
preferred_contact_method
do_not_contact
```

If communication preferences are not implemented yet, the source of truth must document current limitation and require conservative behavior.

---

## 24. Approval Queue Rules

Every automation rule must support approval mode:

```text
auto_send
manual_approval
always_draft
```

Builder wording examples:

```text
with [auto-send]
with [manual approval]
with [draft only]
```

Approval behavior:

- auto-send executes safe action automatically
- manual approval creates a pending action
- always-draft creates a draft/pending record but never sends until approved

Approval queue must show:

```text
what action will happen
who receives it
why it was created
which automation created it
related customer/job/invoice/estimate
message preview
approve/edit/dismiss controls
```

---

## 25. Kill Switch Rules

The system must include emergency controls.

Minimum controls:

```text
Pause all automations
Disable all customer-facing automation sends
Disable review request automations
Disable payment reminder automations
```

Recommended distinction:

### Pause all automations

Stops all automation evaluation/execution.

### Disable customer-facing sends

Allows internal tasks and alerts to continue, but prevents SMS/email/customer messages.

Kill switch rules:

- kill switch state must be visible
- customer-facing sends must check kill switch before sending
- kill switch changes must be logged
- only owner/admin roles may change kill switch settings

---

## 26. Access Rules

Suggested access model:

### Owner

Can:

```text
view all automations
create/edit/delete rules
enable/disable rules
approve pending actions
change kill switch
view logs
manage templates
```

### Admin

Can:

```text
view all automations
create/edit operational rules if permitted
enable/disable non-high-risk rules
approve pending actions
view logs
manage templates if permitted
```

### Office Admin / Dispatcher

Can:

```text
view automations
approve pending actions if role permits
view related logs
use configured templates
```

### Technician

Can:

```text
view assigned automation-created tasks/reminders only if field workflow requires it
```

Technician should not manage global automations in V1.

Access rules must be backend-enforced. Frontend hiding is convenience only.

---

## 27. Data Model Draft

Suggested initial tables/entities:

```text
automation_templates
automation_rules
automation_runs
automation_logs
automation_pending_actions
automation_scheduled_runs
automation_settings
crm_tasks
```

### automation_templates

Purpose: built-in or custom store templates.

Important fields:

```text
id
template_key
category
title
description
risk_level
status
default_mode
definition_json
created_at
updated_at
```

### automation_rules

Purpose: active/draft configured automations.

Important fields:

```text
id
organization_id
template_key
name
status
enabled
mode
trigger_json
conditions_json
action_json
timing_json
approval_json
created_by_user_id
created_at
updated_at
```

### automation_runs

Purpose: execution attempt tracking.

Important fields:

```text
id
organization_id
rule_id
trigger_entity_type
trigger_entity_id
status
started_at
completed_at
failure_reason
idempotency_key
created_at
updated_at
```

### automation_logs

Purpose: audit trail.

Important fields:

```text
id
organization_id
rule_id
run_id
level
message
metadata_json
created_at
```

### automation_pending_actions

Purpose: manual approval queue.

Important fields:

```text
id
organization_id
rule_id
run_id
type
status
target_type
target_id
related_entity_type
related_entity_id
preview_json
approved_by_user_id
dismissed_by_user_id
created_at
updated_at
```

### automation_scheduled_runs

Purpose: delayed execution.

Important fields:

```text
id
organization_id
rule_id
trigger_entity_type
trigger_entity_id
anchor_field
scheduled_for
status
attempts
last_error
idempotency_key
created_at
updated_at
```

### automation_settings

Purpose: global kill switches and automation configuration.

Important fields:

```text
id
organization_id
pause_all
disable_customer_facing_sends
disable_review_requests
disable_payment_reminders
created_at
updated_at
```

### crm_tasks

Purpose: generic CRM-wide tasks created manually or by automation.

Important fields:

```text
id
organization_id
title
description
status
priority
due_at
assigned_to_user_id
related_entity_type
related_entity_id
source
source_automation_rule_id
source_automation_run_id
created_at
completed_at
```

---

## 28. Generic Tasks Rule

Automation Store must not misuse telephony-specific callback tasks for every workflow.

Callback tasks may continue to exist for calls.

General follow-up, office, technician, sales, and service tasks should use a generic task model.

Correct future split:

```text
callback_tasks = telephony/call recovery specific
crm_tasks = general CRM work items
```

Automation can create `crm_tasks` for:

```text
sales follow-up
office review
technician reminder
inventory usage reminder
inspection missing data reminder
warranty follow-up
```

---

## 29. Existing CRM Integration Points

Automation may later integrate with these existing areas:

### Jobs

Use as trigger source for:

```text
job created
job scheduled
job completed
job rescheduled
job cancelled
```

### Invoices / Payments

Use as trigger source for:

```text
invoice created
invoice sent
payment recorded
balance zero
invoice unpaid after X days
```

Do not mutate invoice totals or payment ledger from automation in V1.

### Estimates / Quotes

Use as trigger source for:

```text
estimate sent
estimate not approved after X days
estimate approved
estimate signed
```

### Messaging / SMS

Use as action transport for approved SMS templates.

Automation should call messaging service/API patterns rather than reimplement SMS sending.

### Calls

Use as trigger source for:

```text
missed calls
voicemail
callback not completed
unknown caller
```

Calls already contain callback recovery concepts. Automation must not break current call recovery behavior.

### Inventory

Use as trigger source for:

```text
low stock
reorder point reached
missing inventory usage report
```

Automation must not mutate inventory stock automatically in V1.

### Inspections

Use as trigger source later for:

```text
inspection completed
report ready
missing photos
required fields missing
```

### Warranty Certificate Preview

Use as action/suggestion source later for:

```text
suggest warranty certificate
send warranty certificate after approval
warranty expiry follow-up
```

Warranty certificate is currently derived from invoice state and snapshots unless a dedicated backend warranty resource is created later.

### Settings

Use for:

```text
company profile
company contact info
timezone
google review URL
branding
kill switch settings
```

---

## 30. Organization Settings Required For Automation

Before or during Automation Store rollout, organization settings should support:

```text
company.name
company.phone
company.email
company.website
company.logo_url
company.timezone
company.google_review_url
company.default_sms_number
company.business_hours
```

These settings allow Phoenix-specific values to remain configurable and SaaS-ready.

---

## 31. First Automation Candidates

Recommended first active automations for Phoenix:

### 31.1 Review Request After Paid Invoice

```text
When invoice balance becomes 0
send client Google review link by SMS
1 hour after payment
only if job is completed
only if review request has not already been sent
```

Risk: Low to Medium

Default mode: Auto-send if template and review link are approved; manual approval optional.

### 31.2 Job Reminder SMS

```text
When job is scheduled
send client appointment reminder by SMS
4 hours before job scheduled time
```

Risk: Low

Default mode: Auto-send from approved template.

### 31.3 Estimate Not Approved Follow-Up

```text
When estimate is sent and not approved after X days
create sales follow-up task or send follow-up SMS after approval
```

Risk: Medium

Default mode: Manual approval for customer-facing send.

### 31.4 Unpaid Invoice Follow-Up

```text
When invoice is unpaid after X days
create office follow-up task or payment reminder pending action
```

Risk: Medium

Default mode: Manual approval.

### 31.5 Missed Call Recovery

```text
When call is missed
create callback task or pending action
```

Risk: Low to Medium

Default mode: Internal task/pending action.

### 31.6 Inventory Usage Reminder After Job Completion

```text
When job is completed
create technician/office task to report inventory used
```

Risk: Low

Default mode: Internal task.

---

## 32. V1 / V1.5 / V2 Roadmap

### V1 — Foundation + Safe Business Actions

Goal: create the Automation Store foundation and run only safe actions.

Includes:

```text
/automations route
Store UI
Category filters
Automation cards
Builder modal
Template registry
Rule storage
Token registry foundation
Pending actions
Approval mode
Audit logs
Kill switch
First safe actions
```

Safe actions:

```text
send SMS from approved template
send review link
notify office
notify technician
create generic task
create pending action
```

### V1.5 — Revenue Operations

Goal: automate controlled revenue follow-ups.

Includes:

```text
payment reminders
quote/estimate follow-up
warranty certificate suggestion
maintenance reminders
scheduler/delayed runs
stronger duplicate prevention
```

### V2 — Advanced Automation

Goal: support advanced workflow changes with strict approval.

Includes:

```text
status updates
external webhooks
inventory deduction suggestions
advanced branching
multi-step automations
SaaS marketplace packaging
```

V2 must not be started until V1 is stable.

---

## 33. No-Go Rules

Stop immediately if any of these occur:

```text
Automation tries to change invoice totals automatically.
Automation tries to mark invoice paid.
Automation tries to mutate payment ledger.
Automation tries to deduct inventory automatically in V1.
Automation sends customer message without approved template.
Automation sends unresolved tokens to customer.
Automation lacks audit log.
Automation lacks idempotency for customer-facing send.
Automation requires protected file changes without approval.
Automation mixes inspections, invoices, calls, messaging, and inventory in one uncontrolled package.
Automation builder allows invalid entity/action combinations.
Automation route is treated as settings-only utility.
Automation code hardcodes Phoenix values into engine logic.
```

---

## 34. Protected / Contract-Sensitive Areas

Changes to these areas require explicit approval and tight test plan:

```text
backend/src/app.module.ts
backend/src/main.ts
backend/src/auth/*
backend/src/database/entities/*
backend/src/crm/*
backend/src/messaging/*
backend/src/telephony/*
backend/src/inventory/*
backend/src/inspections/*
frontend/components/app-shell.tsx
frontend/app/invoices/*
frontend/app/estimates/*
frontend/app/jobs/*
frontend/app/messaging/*
frontend/app/calls/*
frontend/app/inventory/*
frontend/app/inspections/*
frontend/app/settings/*
package.json
package-lock.json
.env.example
vercel.json
```

Reason:

These areas control auth, routing, live messaging, telephony webhooks, financial state, document snapshots, inventory movements, inspections, navigation, and deployment behavior.

---

## 35. Testing Requirements

Every Automation Store package must test:

```text
backend build
frontend build
git status review
no unrelated files changed
route loads
authorized role access
unauthorized role blocked
create draft automation rule
edit automation rule
enable/disable automation rule
pending action creation
approval queue action
automation log creation
kill switch behavior
customer-facing send blocked when switch disabled
```

For customer-facing sends, also test:

```text
template selected
tokens render
missing required token blocks send
duplicate send prevention works
message appears in expected SMS thread if using messaging
```

For scheduler packages, also test:

```text
scheduled run created
scheduled run executes
scheduled run cancels or recalculates when anchor changes
failed run logs error
```

---

## 36. Release Rules

Every Automation Store implementation must follow controlled release rules:

```text
No broad refactor.
No git add .
No unrelated cleanup.
No hidden protected-file edits.
No production push without builds and smoke tests.
No customer-facing automation enabled by default without owner approval.
```

Before commit:

```text
git status --short
backend build passed
frontend build passed
approved files only
smoke test passed
```

Commit naming suggestion:

```text
automation-store-source-of-truth
automation-store-shell
automation-store-rule-storage
automation-store-pending-actions
automation-store-review-request-v1
```

---

## 37. Implementation Direction

Recommended execution order:

### Phase 0 — Source of Truth

Create this document and approve the architecture.

### Phase 1 — Store Shell

Build `/automations` route with premium UI, categories, cards, static/draft templates, and no dangerous runtime.

### Phase 2 — Rule Storage

Add automation rule persistence and builder JSON validation.

### Phase 3 — Pending Actions + Logs

Add approval queue, run records, and audit logs.

### Phase 4 — First Safe Action

Implement Review Request After Paid Invoice as the first money automation.

### Phase 5 — Scheduler

Support delayed actions like job reminders and follow-ups.

### Phase 6 — More Templates

Add additional safe automations gradually.

### Phase 7 — Advanced Engine

Only after stable usage, consider advanced writes and SaaS marketplace packaging.

---

## 38. Final Principle

The Automation Store must not become a messy shortcut layer.

It must become the controlled business engine of Phoenix CRM.

Final operating principle:

```text
The Automation Store may act automatically only when the data is trusted, the action is safe, the message is approved, and the result is auditable.
```

