# Phoenix CRM — Automation Store Source of Truth v2

## 1. Executive Summary

The Automation Store is an independent first-class product body inside Phoenix CRM.

It is not a settings subsection.
It is not a utility page.
It is not a list of scripts.
It is not a background-job feature hidden inside invoices, jobs, messaging, or calls.

The Automation Store is its own business command center.

Its job is to sit above the CRM roots and turn trusted CRM events into safe, auditable, money-producing actions.

Core product sentence:

```text
Automation Store is the independent revenue automation body of Phoenix CRM.
It listens to trusted CRM events, applies approved business rules, and creates safe actions, messages, reminders, reviews, tasks, and follow-ups.
```

Strategic direction:

```text
Phoenix-first. SaaS-aware. Independent product body.
```

Phoenix Chimney & Fireplace is the first company using it. The system must serve Phoenix immediately, but the architecture must avoid Phoenix-only hardcoding so the same automation body can later serve another company with minimal rewrite.

---

## 2. Independent Product Body Doctrine

The Automation Store must be treated as a standalone CRM domain.

It owns its own:

- route family
- navigation identity
- UI/UX standard
- store categories
- templates
- rules
- pending actions
- scheduler
- execution logs
- safety rules
- kill switches
- role permissions
- future SaaS extension model

The Automation Store may read from Jobs, Customers, Invoices, Estimates, Calls, Messaging, Inventory, Inspections, and Settings.

But it must not belong to any of them.

Correct relationship:

```text
Jobs / Invoices / Estimates / Calls / Messaging / Inventory / Inspections = business roots
Automation Store = independent layer above the roots
```

Wrong relationship:

```text
Automation Store hidden inside Settings
Automation logic scattered inside every route
Automation actions hardcoded inside invoice/job/call components
Automation templates mixed directly into messaging templates without store ownership
```

The store should feel like a major product area, similar in importance to:

- Jobs
- Invoices
- Estimates
- Messaging
- Calls
- Inventory
- Inspections

It must appear in the main app navigation as its own route:

```text
/automations
```

Future route family:

```text
/automations
/automations/store
/automations/active
/automations/pending-actions
/automations/logs
/automations/templates
/automations/settings
```

Settings may contain global automation preferences, but the Store itself must not live inside Settings.

---

## 3. Business Purpose

The Automation Store exists to make money and prevent operational leakage.

Primary business outcomes:

1. Increase Google reviews.
2. Recover missed revenue from unpaid invoices.
3. Recover stale estimates and quotes.
4. Reduce forgotten customer follow-up.
5. Improve appointment reminder consistency.
6. Reduce manual office work.
7. Help technicians and office staff act at the right time.
8. Create a future SaaS-ready product advantage.

High-value examples:

```text
Invoice fully paid → send Google review request.
Estimate not approved after X days → create sales follow-up.
Job scheduled → send client reminder.
Missed call → create recovery action.
Job completed → remind technician to report inventory used.
Warranty expiring → create customer follow-up.
```

The Automation Store is not a cosmetic feature. It is a revenue and operations layer.

---

## 4. Phoenix-First, SaaS-Aware Rule

The system is built first for Phoenix operations.

Phoenix-specific needs are allowed:

- chimney and fireplace service workflows
- WETT / inspection flows
- Calgary / Alberta operating needs
- Phoenix review link
- Phoenix templates
- Phoenix internal roles

But Phoenix-specific values must come from configuration, not hardcoded automation logic.

Correct:

```text
{{company.name}}
{{company.google_review_url}}
{{company.phone}}
{{company.timezone}}
{{client.name}}
{{job.scheduled_at}}
{{invoice.balance_due}}
```

Wrong:

```text
Phoenix Chimney & Fireplace hardcoded inside engine
Calgary timezone hardcoded inside scheduler
Google review link hardcoded inside action code
Chimney-only wording hardcoded inside generic automation action
```

The future SaaS version should be able to reuse the same automation engine with a different company profile, different templates, different review link, different timezone, and different service categories.

---

## 5. Store UX Identity

The Automation Store must feel like a premium store, not a database table.

The main page should communicate:

```text
This is where the business turns CRM activity into automatic action.
```

Recommended top-level UI areas:

- Featured Automations
- Recommended for Phoenix
- Revenue Recovery
- Customer Experience
- Office Operations
- Marketing & Reviews
- Phone Actions
- Payments & Documents
- Technician & Field Ops
- Inventory & Stock
- Warranty & Retention
- Active Automations
- Pending Actions
- Activity Logs

Automation cards should include:

- title
- category
- short business value
- risk level
- current status
- action mode
- configure button
- enable / disable button
- view activity button

Example card:

```text
Review Request After Payment
Send a Google review request after an invoice is fully paid.

Category: Marketing & Reviews
Risk: Low
Mode: Auto-send or Approval
Status: Available

[Preview] [Configure] [Enable]
```

The Store must visually signal importance. It should not look like an admin maintenance screen.

---

## 6. Automation Categories

Initial category map:

1. Reminders
2. Sales Follow-Up
3. Payments & Documents
4. Marketing & Reviews
5. Phone Actions
6. Office Operations
7. Technician & Field Ops
8. Inventory & Stock
9. Warranty & Retention
10. Inspections & Reports

The system may contain many possible automation templates, but only activated rules should run.

Important distinction:

```text
Automation template = available product in the store.
Automation rule = configured active/draft version for this company.
Automation run = one actual execution attempt.
Automation log = audit trail of what happened.
```

The store may hold 50–60 template opportunities over time, but V1 should only activate a small number of safe automations.

---

## 7. Template, Rule, Run, Log Separation

The Automation Store must not store everything as one blob.

It must separate four concepts.

### 7.1 Automation Template

A template is the reusable product card in the store.

Example:

```json
{
  "templateKey": "review_request_after_paid_invoice",
  "title": "Review Request After Payment",
  "category": "marketing_reviews",
  "riskLevel": "low",
  "defaultMode": "auto_send",
  "description": "Send a Google review request after an invoice is fully paid."
}
```

### 7.2 Automation Rule

A rule is the company-specific configured automation.

Example:

```json
{
  "ruleId": "rule_123",
  "templateKey": "review_request_after_paid_invoice",
  "enabled": true,
  "trigger": {
    "entity": "invoice",
    "event": "balance_zero"
  },
  "conditions": [
    {
      "field": "job.status",
      "operator": "equals",
      "value": "completed"
    }
  ],
  "action": {
    "type": "send_review_link",
    "target": "client",
    "medium": "sms",
    "templateKey": "review_request_sms"
  },
  "approval": {
    "required": false
  }
}
```

### 7.3 Automation Run

A run is a specific execution attempt.

Example:

```json
{
  "runId": "run_789",
  "ruleId": "rule_123",
  "entityType": "invoice",
  "entityId": "inv_456",
  "status": "sent"
}
```

### 7.4 Automation Log

A log records what happened.

Example:

```json
{
  "runId": "run_789",
  "message": "Review SMS sent to client.",
  "createdAt": "2026-05-10T12:00:00Z"
}
```

No automation should execute without traceability.

---

## 8. Sentence-Based Builder

The builder should let the user configure automations as readable business sentences.

Base structure:

```text
When [entity] [event]
Do [action] [target] [medium] [timing]
Only if [conditions]
Approval: [auto-send] or [after my approval]
```

Example:

```text
When [an invoice] [is fully paid]
send [client] [a review request] [by SMS] [1 hour after payment]
only if [job status] [is] [completed]
with [auto-send]
```

The UI sentence must be human-friendly, but it must save structured data.

The sentence is display.
The JSON rule is truth.

---

## 9. Token and Placeholder System

Tokens are required for SaaS-aware design.

The user may see:

```text
send [client] [an SMS]
```

But the stored action should behave like:

```text
send {{target.type}} {{action.medium}}
```

Message templates must use placeholders:

```text
Hi {{client.first_name}}, thank you for choosing {{company.name}}.
If you were happy with our service, please leave us a review here:
{{company.google_review_url}}
```

Initial token groups:

### Company Tokens

```text
{{company.name}}
{{company.phone}}
{{company.email}}
{{company.website}}
{{company.google_review_url}}
{{company.timezone}}
```

### Client Tokens

```text
{{client.name}}
{{client.first_name}}
{{client.phone}}
{{client.email}}
```

### Job Tokens

```text
{{job.id}}
{{job.status}}
{{job.scheduled_at}}
{{job.completed_at}}
{{job.service_type}}
{{job.technician_name}}
```

### Invoice Tokens

```text
{{invoice.number}}
{{invoice.total}}
{{invoice.balance_due}}
{{invoice.paid_at}}
```

### Estimate / Quote Tokens

```text
{{estimate.number}}
{{estimate.total}}
{{estimate.status}}
{{estimate.approval_url}}
```

Tokens must render differently per company in the future.

---

## 10. Registry Architecture

The Automation Store must use registries, not hardcoded UI combinations.

Required registries:

- Trigger Registry
- Action Registry
- Condition Registry
- Timing Registry
- Token Registry
- Template Registry
- Risk Registry

The builder should only show valid options based on previous choices.

Example:

If the user selects:

```text
When [a lead] ...
```

The builder must not show:

```text
[job completed date]
[invoice balance]
[warranty months]
```

If the user selects:

```text
When [an invoice] [is fully paid]
```

The builder may show:

```text
send review link
notify office
create task
suggest warranty certificate
```

This prevents invalid automations.

---

## 11. Trigger System

Triggers are events the Automation Store can listen to.

Initial trigger families:

### Jobs

```text
job.created
job.scheduled
job.rescheduled
job.started
job.completed
job.cancelled
```

### Invoices / Payments

```text
invoice.created
invoice.sent
invoice.payment_recorded
invoice.balance_zero
invoice.unpaid_after_x_days
```

### Estimates / Quotes

```text
estimate.created
estimate.sent
estimate.approved
estimate.not_approved_after_x_days
```

### Calls

```text
call.missed
call.voicemail_received
call.callback_not_completed_after_x_time
```

### Messaging

```text
sms.received
sms.unread_after_x_time
sms.failed
```

### Inventory

```text
inventory.low_stock
inventory.item_used
inventory.reorder_point_reached
```

### Inspections / Reports

```text
inspection.created
inspection.completed
report.ready
report.missing_required_fields
```

V1 should only activate a small safe subset.

---

## 12. Action System

Actions are what the Automation Store can do.

### V1 Safe Actions

```text
send SMS from approved template
send review link from approved template
notify office
notify technician
create CRM task
create pending action
```

### V1.5 Business Actions

```text
send payment reminder
send quote approval reminder
suggest warranty certificate
send maintenance reminder
```

### V2 Advanced Actions

```text
update status
deduct inventory
create document
send document automatically
trigger external integration
```

V2 actions must not be enabled until the audit, approval, permission, and rollback model is mature.

---

## 13. Approval Queue

The Automation Store must support human-in-the-loop approval.

Some automations may auto-send.
Some automations must create pending actions.

Route:

```text
/automations/pending-actions
```

Pending action example:

```text
Review SMS ready to send to John Cohen
Invoice: INV-1042
Trigger: Invoice fully paid
Message preview: "Hi John, thank you..."

[Approve & Send] [Edit] [Dismiss]
```

Rule-level setting:

```text
Require manual approval before sending
```

Sentence UI option:

```text
When [an invoice] [is fully paid]
send [client] [review link] [after my approval]
```

Default policy:

- low-risk marketing/service messages may auto-send from approved templates
- financial/document/status-changing actions require approval
- new SaaS customers should start with manual approval by default

---

## 14. Risk Levels

Each automation template and action must have a risk level.

### Low Risk

Can auto-send if template is approved.

Examples:

```text
review request
thank-you SMS
appointment reminder
office notification
technician notification
create internal task
```

### Medium Risk

Approval recommended by default.

Examples:

```text
payment reminder
quote follow-up
warranty upsell
maintenance campaign
```

### High Risk

No auto-run in V1.

Examples:

```text
change invoice total
change quote total
mark invoice paid
deduct inventory
change job financial state
issue warranty certificate automatically
send legal/insurance report automatically
```

No high-risk action should execute silently.

---

## 15. Customer Communication Rules

Customer-facing automations must obey stricter rules.

Requirements:

1. Use approved templates.
2. Support token preview.
3. Check customer phone/email exists.
4. Respect future communication preferences.
5. Avoid duplicate sends.
6. Log every send attempt.
7. Support manual approval mode.
8. Respect kill switch.

The automation engine must never send random free-text generated content to customers in V1.

---

## 16. Message Template Rules

Automation messages must come from approved templates.

Template requirements:

- title
- channel: SMS / email
- category
- body
- allowed tokens
- active flag
- approval status
- preview support

Example SMS template:

```text
Hi {{client.first_name}}, thank you for choosing {{company.name}}.
If you were happy with our service, please leave us a Google review here:
{{company.google_review_url}}
```

Templates should be reusable by the Automation Store.

Messaging templates and Automation templates are related, but not identical:

```text
Messaging template = message body reusable in conversation.
Automation template = business rule/product card in the Store.
```

The Automation Store may use messaging templates, but it must own automation rules independently.

---

## 17. Scheduler and Timing Model

A full Automation Store needs scheduling.

Examples:

```text
4 hours before job
1 hour after invoice paid
3 days after estimate sent
11 months after service completed
```

The scheduler should support:

- immediate runs
- delayed runs
- before/after anchor dates
- cancellation when anchor changes
- retry state
- failure logs

Important example:

If a job reminder is scheduled for 4 hours before appointment, and the job is rescheduled, the old scheduled run must be cancelled or recalculated.

Scheduled run draft model:

```json
{
  "scheduledRunId": "sched_123",
  "ruleId": "rule_456",
  "entityType": "job",
  "entityId": "job_789",
  "anchorField": "scheduled_at",
  "scheduledFor": "2026-05-12T10:00:00Z",
  "status": "pending"
}
```

---

## 18. Audit and Observability

Every automation must be auditable.

The system must answer:

```text
What rule ran?
Why did it run?
What record triggered it?
What action was created?
Was it sent, queued, approved, dismissed, failed, or skipped?
Who approved it?
What message was sent?
When did it happen?
```

Required audit views:

```text
/automations/logs
/automations/:ruleId/activity
record-level automation activity later
```

No silent automation.

---

## 19. Kill Switches

The system must include emergency controls.

Required kill switches:

```text
Pause all automations
Disable all customer-facing sends
Disable review requests
Disable payment reminders
Disable scheduled runs
```

Pause all means nothing runs.

Disable customer-facing sends means internal tasks and alerts may still be created, but no customer message leaves the system.

Kill switches should be available only to owner/admin-level roles.

---

## 20. Access and Role Rules

The Automation Store must be role-gated.

Suggested permissions:

### Owner

Can do everything:

- create automation
- edit automation
- enable/disable automation
- approve pending actions
- view logs
- manage kill switches
- manage templates

### Admin

Can manage operational automations, unless owner-only restriction applies.

### Office Admin / Dispatcher

Can view active automations and approve permitted pending actions.

### Technician

Should not manage the Automation Store in V1.
May receive technician notifications/tasks created by automations.

No role should receive automation power by accident.

---

## 21. Relationship to Existing CRM Roots

The Automation Store depends on other roots but must not be absorbed by them.

### Jobs

Automation may listen to job lifecycle events and schedule reminders.

### Invoices / Payments

Automation may listen to payment and balance events for review requests, payment reminders, and office notifications.

Financial mutation is not allowed in V1.

### Estimates / Quotes

Automation may create follow-up tasks or reminders when estimates are stale.

It must not change quote totals or approval state silently.

### Messaging

Automation may send approved SMS templates through the existing messaging transport.

Messaging remains the communication engine.
Automation Store owns the business reason for sending.

### Calls

Automation may create recovery workflows from missed calls and voicemail events.

Existing telephony-specific callback tasks should not become the generic task system for all automation.

### Inventory

Automation may show alerts or create tasks for low stock.

It must not deduct stock automatically in V1.

### Inspections

Automation may create reminders around missing fields, report completion, and report-ready follow-up.

It must not send insurance/WETT reports automatically without explicit approved workflow.

### Settings

Settings provides company values, review link, business identity, timezone, and global automation switches.

Settings does not own the Automation Store.

---

## 22. Required Supporting CRM Readiness

For the Store to become fully powerful, Phoenix CRM should support these roots cleanly:

1. Reliable role permissions.
2. Reliable technician workflow.
3. Reliable invoice/payment lifecycle.
4. Reliable estimate/quote lifecycle.
5. Reliable inspection/report workflow.
6. Clean organization settings.
7. Google review URL setting.
8. Communication preferences later.
9. Generic CRM task system.
10. Record-level activity timeline later.

These are not all required before Store UI exists, but they matter before full automation execution.

---

## 23. Data Model Draft

Recommended core tables:

```text
automation_templates
automation_rules
automation_runs
automation_logs
automation_pending_actions
automation_scheduled_runs
automation_settings
```

Possible future tables:

```text
automation_rule_versions
automation_template_categories
automation_token_registry
automation_action_registry
automation_trigger_registry
```

For V1, registries may live in code if safer and easier to control.

---

## 24. Backend Ownership Draft

Suggested backend ownership:

```text
backend/src/automations/automations.module.ts
backend/src/automations/automations.controller.ts
backend/src/automations/automations.service.ts
backend/src/automations/automation-registry.ts
backend/src/automations/automation-evaluator.service.ts
backend/src/automations/automation-executor.service.ts
backend/src/automations/automation-scheduler.service.ts
backend/src/automations/automation-template-renderer.service.ts
backend/src/automations/automation-audit.service.ts
```

Database entities:

```text
backend/src/database/entities/automation-template.entity.ts
backend/src/database/entities/automation-rule.entity.ts
backend/src/database/entities/automation-run.entity.ts
backend/src/database/entities/automation-log.entity.ts
backend/src/database/entities/automation-pending-action.entity.ts
backend/src/database/entities/automation-scheduled-run.entity.ts
```

Protected areas:

- app module wiring
- database entities
- CRM controller/payment flows
- messaging transport
- telephony services
- invoice payment ledger
- document snapshot services

---

## 25. Frontend Ownership Draft

Suggested frontend ownership:

```text
frontend/app/automations/page.tsx
frontend/app/automations/store/page.tsx
frontend/app/automations/active/page.tsx
frontend/app/automations/pending-actions/page.tsx
frontend/app/automations/logs/page.tsx
frontend/components/automations/automation-store-card.tsx
frontend/components/automations/automation-builder-modal.tsx
frontend/components/automations/sentence-builder.tsx
frontend/components/automations/pending-action-card.tsx
frontend/lib/automations/automation-model.ts
frontend/lib/automations/automation-registry-client.ts
```

Shared navigation:

```text
frontend/components/app-shell.tsx
```

Navigation change must be treated carefully because it affects the global CRM shell.

---

## 26. V1 Automation Candidates

Recommended first Phoenix automations:

### 1. Review Request After Payment

```text
When invoice balance is 0
send client Google review request
1 hour after payment
only if job is completed
only if no review request was already sent
```

### 2. Job Reminder SMS

```text
When job is scheduled
send client appointment reminder
4 hours before scheduled time
```

### 3. Estimate Follow-Up

```text
When estimate is sent and not approved after X days
create sales follow-up task or pending SMS
```

### 4. Invoice Payment Follow-Up

```text
When invoice is unpaid after X days
create office follow-up or pending payment reminder
```

### 5. Missed Call Recovery

```text
When call is missed
create recovery task or alert
```

The first automation should probably be Review Request After Payment because it has direct revenue impact through Google reviews.

---

## 27. V1 / V1.5 / V2 Roadmap

### V1 — Independent Store Foundation

- `/automations` route
- main navigation entry
- premium store UI
- categories
- automation cards
- builder modal
- sentence-based preview
- rule storage
- template/rule/run/log model
- pending actions
- low-risk SMS/review/internal actions only
- kill switch planning

### V1.5 — Revenue Execution

- review request after paid invoice
- appointment reminders
- stale estimate follow-up
- unpaid invoice follow-up
- internal task creation
- approval queue improvements
- scheduler for delayed automations

### V2 — Advanced Automation

- data-changing actions
- warranty workflows
- inventory deduction suggestions
- report workflows
- external integrations
- SaaS tenant hardening
- public marketplace-style packaging

---

## 28. No-Go Rules

Do not build the Automation Store as a settings panel.

Do not scatter automation logic inside unrelated routes.

Do not hardcode Phoenix business values into the engine.

Do not allow customer-facing free-text automation sends in V1.

Do not allow financial mutations in V1.

Do not allow inventory deduction in V1.

Do not send legal/insurance/WETT reports automatically without explicit approval workflow.

Do not build a giant Zapier clone before Phoenix gets value.

Do not run automations without logs.

Do not build without kill switch strategy.

Do not make callback tasks the generic task system.

Do not confuse message templates with automation templates.

Do not confuse Store templates with active rules.

---

## 29. Final Product Principle

The Automation Store is not a feature attached to Phoenix CRM.

It is an independent product body inside Phoenix CRM.

It reads from CRM roots, but it owns its own business logic, UI identity, safety model, registry model, execution history, and future SaaS path.

Final principle:

```text
The Automation Store should feel like the place where Phoenix CRM starts working without the owner touching every step.
```

