export type AutomationRiskLevel = "low" | "medium" | "high";

export type AutomationTriggerDefinition = {
  key: string;
  family: string;
  label: string;
  entityType: string;
  payloadVersion: number;
};

export type AutomationActionDefinition = {
  key: string;
  label: string;
  riskLevel: AutomationRiskLevel;
  customerFacing: boolean;
  requiresApprovedTemplate: boolean;
};

export type AutomationTokenDefinition = {
  token: string;
  group: string;
  label: string;
};

export type AutomationConditionOperator =
  | "equals"
  | "not_equals"
  | "exists"
  | "not_exists"
  | "greater_than"
  | "less_than"
  | "before"
  | "after"
  | "within_last"
  | "not_within_last";

export type AutomationRegistry = {
  triggers: AutomationTriggerDefinition[];
  actions: AutomationActionDefinition[];
  successRecipes: Array<{
    templateKey: string;
    title: string;
    category: string;
    triggerKey: string;
    actionKey: string;
    requiredConditions: string[];
    requiredSettings: string[];
  }>;
  conditionOperators: AutomationConditionOperator[];
  conditionFieldsByEntity: Record<string, string[]>;
  allowedActionsByTriggerFamily: Record<string, string[]>;
  timingModes: string[];
  tokenGroups: string[];
  tokenDefinitions: AutomationTokenDefinition[];
  riskLevels: AutomationRiskLevel[];
};

export const automationRegistry: AutomationRegistry = {
  triggers: [
    { key: "job.created", family: "jobs", label: "Job created", entityType: "job", payloadVersion: 1 },
    { key: "job.scheduled", family: "jobs", label: "Job scheduled", entityType: "job", payloadVersion: 1 },
    { key: "job.rescheduled", family: "jobs", label: "Job rescheduled", entityType: "job", payloadVersion: 1 },
    { key: "job.started", family: "jobs", label: "Job started", entityType: "job", payloadVersion: 1 },
    { key: "job.completed", family: "jobs", label: "Job completed", entityType: "job", payloadVersion: 1 },
    { key: "job.cancelled", family: "jobs", label: "Job cancelled", entityType: "job", payloadVersion: 1 },
    { key: "invoice.created", family: "invoices_payments", label: "Invoice created", entityType: "invoice", payloadVersion: 1 },
    { key: "invoice.sent", family: "invoices_payments", label: "Invoice sent", entityType: "invoice", payloadVersion: 1 },
    {
      key: "invoice.payment_recorded",
      family: "invoices_payments",
      label: "Invoice payment recorded",
      entityType: "invoice",
      payloadVersion: 1,
    },
    {
      key: "invoice.balance_zero",
      family: "invoices_payments",
      label: "Invoice balance reaches zero",
      entityType: "invoice",
      payloadVersion: 1,
    },
    {
      key: "invoice.unpaid_after_x_days",
      family: "invoices_payments",
      label: "Invoice unpaid after X days",
      entityType: "invoice",
      payloadVersion: 1,
    },
    { key: "estimate.created", family: "estimates_quotes", label: "Estimate created", entityType: "estimate", payloadVersion: 1 },
    { key: "estimate.sent", family: "estimates_quotes", label: "Estimate sent", entityType: "estimate", payloadVersion: 1 },
    { key: "estimate.approved", family: "estimates_quotes", label: "Estimate approved", entityType: "estimate", payloadVersion: 1 },
    {
      key: "estimate.not_approved_after_x_days",
      family: "estimates_quotes",
      label: "Estimate not approved after X days",
      entityType: "estimate",
      payloadVersion: 1,
    },
    { key: "call.missed", family: "calls", label: "Call missed", entityType: "call", payloadVersion: 1 },
    { key: "call.voicemail_received", family: "calls", label: "Voicemail received", entityType: "call", payloadVersion: 1 },
    {
      key: "call.callback_not_completed_after_x_time",
      family: "calls",
      label: "Callback not completed after X time",
      entityType: "call",
      payloadVersion: 1,
    },
    { key: "sms.received", family: "messaging", label: "SMS received", entityType: "sms", payloadVersion: 1 },
    { key: "sms.unread_after_x_time", family: "messaging", label: "SMS unread after X time", entityType: "sms", payloadVersion: 1 },
    { key: "sms.failed", family: "messaging", label: "SMS failed", entityType: "sms", payloadVersion: 1 },
    { key: "inventory.low_stock", family: "inventory", label: "Inventory low stock", entityType: "inventory_item", payloadVersion: 1 },
    { key: "inventory.item_used", family: "inventory", label: "Inventory item used", entityType: "inventory_item", payloadVersion: 1 },
    {
      key: "inventory.reorder_point_reached",
      family: "inventory",
      label: "Inventory reorder point reached",
      entityType: "inventory_item",
      payloadVersion: 1,
    },
    { key: "inspection.created", family: "inspections_reports", label: "Inspection created", entityType: "inspection", payloadVersion: 1 },
    {
      key: "inspection.completed",
      family: "inspections_reports",
      label: "Inspection completed",
      entityType: "inspection",
      payloadVersion: 1,
    },
    { key: "report.ready", family: "inspections_reports", label: "Report ready", entityType: "report", payloadVersion: 1 },
    {
      key: "report.missing_required_fields",
      family: "inspections_reports",
      label: "Report missing required fields",
      entityType: "report",
      payloadVersion: 1,
    },
  ],
  actions: [
    {
      key: "send_sms_from_approved_template",
      label: "Send SMS from approved template",
      riskLevel: "low",
      customerFacing: true,
      requiresApprovedTemplate: true,
    },
    {
      key: "send_review_link_from_approved_template",
      label: "Send review link from approved template",
      riskLevel: "low",
      customerFacing: true,
      requiresApprovedTemplate: true,
    },
    {
      key: "notify_office",
      label: "Notify office",
      riskLevel: "low",
      customerFacing: false,
      requiresApprovedTemplate: false,
    },
    {
      key: "notify_technician",
      label: "Notify technician",
      riskLevel: "low",
      customerFacing: false,
      requiresApprovedTemplate: false,
    },
    {
      key: "create_crm_task",
      label: "Create CRM task",
      riskLevel: "low",
      customerFacing: false,
      requiresApprovedTemplate: false,
    },
    {
      key: "create_pending_action",
      label: "Create pending action",
      riskLevel: "low",
      customerFacing: false,
      requiresApprovedTemplate: false,
    },
  ],
  successRecipes: [
    {
      templateKey: "review_request_after_paid_invoice_sms",
      title: "Review Request After Paid Invoice by SMS",
      category: "marketing_reviews",
      triggerKey: "invoice.balance_zero",
      actionKey: "send_review_link_from_approved_template",
      requiredConditions: [
        "job.status",
        "client.phone",
        "company.google_review_url",
      ],
      requiredSettings: [
        "company.google_review_url",
        "company.timezone",
        "company.default_sms_number",
      ],
    },
    {
      templateKey: "missed_call_recovery_task",
      title: "Missed Call Recovery Task",
      category: "phone_actions",
      triggerKey: "call.missed",
      actionKey: "create_crm_task",
      requiredConditions: [
        "call.customer_id",
      ],
      requiredSettings: [
        "company.timezone",
      ],
    },
  ],
  conditionOperators: [
    "equals",
    "not_equals",
    "exists",
    "not_exists",
    "greater_than",
    "less_than",
    "before",
    "after",
    "within_last",
    "not_within_last",
  ],
  conditionFieldsByEntity: {
    job: ["job.status", "job.scheduled_at", "job.completed_at", "job.technician_id", "client.phone", "client.email"],
    invoice: [
      "invoice.status",
      "invoice.balance_due",
      "invoice.paid_at",
      "job.status",
      "client.phone",
      "company.google_review_url",
    ],
    estimate: ["estimate.status", "estimate.sent_at", "estimate.approved_at", "client.phone", "client.email"],
    call: ["call.status", "call.direction", "call.customer_id", "client.phone"],
    sms: ["sms.direction", "sms.read_at", "sms.failed_at", "client.phone"],
    inventory_item: ["inventory.stock_on_hand", "inventory.reorder_point", "inventory.location_id"],
    inspection: ["inspection.status", "inspection.completed_at", "inspection.missing_required_fields"],
    report: ["report.status", "report.ready_at", "report.missing_required_fields"],
  },
  allowedActionsByTriggerFamily: {
    jobs: ["send_sms_from_approved_template", "notify_office", "notify_technician", "create_crm_task", "create_pending_action"],
    invoices_payments: [
      "send_sms_from_approved_template",
      "send_review_link_from_approved_template",
      "notify_office",
      "create_crm_task",
      "create_pending_action",
    ],
    estimates_quotes: ["send_sms_from_approved_template", "notify_office", "create_crm_task", "create_pending_action"],
    calls: ["notify_office", "create_crm_task", "create_pending_action"],
    messaging: ["notify_office", "create_crm_task", "create_pending_action"],
    inventory: ["notify_office", "notify_technician", "create_crm_task"],
    inspections_reports: ["notify_office", "notify_technician", "create_crm_task", "create_pending_action"],
  },
  timingModes: ["immediate", "after_trigger", "before_anchor", "after_anchor"],
  tokenGroups: ["company", "client", "job", "invoice", "estimate", "technician", "office_user"],
  tokenDefinitions: [
    { token: "{{company.name}}", group: "company", label: "Company name" },
    { token: "{{company.phone}}", group: "company", label: "Company phone" },
    { token: "{{company.email}}", group: "company", label: "Company email" },
    { token: "{{company.website}}", group: "company", label: "Company website" },
    { token: "{{company.google_review_url}}", group: "company", label: "Google review URL" },
    { token: "{{company.timezone}}", group: "company", label: "Company timezone" },
    { token: "{{client.name}}", group: "client", label: "Client full name" },
    { token: "{{client.first_name}}", group: "client", label: "Client first name" },
    { token: "{{client.phone}}", group: "client", label: "Client phone" },
    { token: "{{client.email}}", group: "client", label: "Client email" },
    { token: "{{job.id}}", group: "job", label: "Job ID" },
    { token: "{{job.status}}", group: "job", label: "Job status" },
    { token: "{{job.scheduled_at}}", group: "job", label: "Job scheduled time" },
    { token: "{{job.completed_at}}", group: "job", label: "Job completed time" },
    { token: "{{invoice.number}}", group: "invoice", label: "Invoice number" },
    { token: "{{invoice.total}}", group: "invoice", label: "Invoice total" },
    { token: "{{invoice.balance_due}}", group: "invoice", label: "Invoice balance due" },
    { token: "{{invoice.paid_at}}", group: "invoice", label: "Invoice paid time" },
    { token: "{{estimate.number}}", group: "estimate", label: "Estimate number" },
    { token: "{{estimate.total}}", group: "estimate", label: "Estimate total" },
    { token: "{{estimate.status}}", group: "estimate", label: "Estimate status" },
    { token: "{{technician.name}}", group: "technician", label: "Technician name" },
    { token: "{{office_user.name}}", group: "office_user", label: "Office user name" },
  ],
  riskLevels: ["low", "medium", "high"],
};
