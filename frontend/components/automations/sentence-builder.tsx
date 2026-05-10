"use client";

import { useEffect, useState, type FormEvent } from "react";

import { AutomationSentenceSegment } from "./automation-sentence-segment";
import { TokenSidebar, defaultAutomationTokens } from "./token-sidebar";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
    details?: unknown;
  };
};

type RegistryTrigger = {
  key: string;
  family: string;
  label: string;
  entityType: string;
};

type RegistryAction = {
  key: string;
  label: string;
  customerFacing: boolean;
  requiresApprovedTemplate: boolean;
};

type AutomationRegistryResponse = {
  triggers: RegistryTrigger[];
  actions: RegistryAction[];
  conditionFieldsByEntity: Record<string, string[]>;
  allowedActionsByTriggerFamily: Record<string, string[]>;
  timingModes: string[];
  tokenGroups: string[];
};

const fallbackTriggers: RegistryTrigger[] = [
  { key: "invoice.balance_zero", family: "invoices_payments", label: "invoice balance reaches zero", entityType: "invoice" },
  { key: "job.completed", family: "jobs", label: "job completed", entityType: "job" },
  { key: "call.missed", family: "calls", label: "call missed", entityType: "call" },
  { key: "estimate.sent", family: "estimates_quotes", label: "estimate sent", entityType: "estimate" },
];

const fallbackActions: RegistryAction[] = [
  { key: "send_review_link_from_approved_template", label: "send approved review SMS", customerFacing: true, requiresApprovedTemplate: true },
  { key: "send_sms_from_approved_template", label: "send approved SMS", customerFacing: true, requiresApprovedTemplate: true },
  { key: "create_crm_task", label: "create CRM task", customerFacing: false, requiresApprovedTemplate: false },
  { key: "notify_office", label: "notify office", customerFacing: false, requiresApprovedTemplate: false },
];

const fallbackRegistry: AutomationRegistryResponse = {
  triggers: fallbackTriggers,
  actions: fallbackActions,
  conditionFieldsByEntity: {
    invoice: ["job.status", "client.phone", "company.google_review_url"],
    job: ["job.status", "client.phone"],
    call: ["call.customer_id", "client.phone"],
    estimate: ["estimate.status", "client.phone"],
  },
  allowedActionsByTriggerFamily: {
    invoices_payments: ["send_review_link_from_approved_template", "send_sms_from_approved_template", "notify_office", "create_crm_task"],
    jobs: ["send_sms_from_approved_template", "notify_office", "notify_technician", "create_crm_task"],
    calls: ["notify_office", "create_crm_task"],
    estimates_quotes: ["send_sms_from_approved_template", "notify_office", "create_crm_task"],
  },
  timingModes: ["immediate", "after_trigger", "before_anchor", "after_anchor"],
  tokenGroups: ["company", "client", "job", "invoice", "estimate", "technician", "office_user"],
};

const conditionLabelMap: Record<string, { label: string; value: string }> = {
  "job.status": { label: "job is completed", value: "completed" },
  "client.phone": { label: "client phone exists", value: "exists" },
  "company.google_review_url": { label: "Google review URL exists", value: "exists" },
  "call.customer_id": { label: "call has matched customer", value: "exists" },
  "estimate.status": { label: "estimate is sent", value: "sent" },
};

const reviewBoosterConditionFields = ["job.status", "company.google_review_url"];

const conditionOptions: Record<string, Array<{ field: string; label: string; value: string }>> = {
  invoice: [
    { field: "job.status", label: "job status is completed", value: "completed" },
    { field: "client.phone", label: "client phone exists", value: "exists" },
    { field: "company.google_review_url", label: "Google review URL exists", value: "exists" },
  ],
  job: [
    { field: "job.status", label: "job status is completed", value: "completed" },
    { field: "client.phone", label: "client phone exists", value: "exists" },
  ],
  call: [
    { field: "call.customer_id", label: "call has a matched customer", value: "exists" },
    { field: "client.phone", label: "client phone exists", value: "exists" },
  ],
  estimate: [
    { field: "estimate.status", label: "estimate is sent", value: "sent" },
    { field: "client.phone", label: "client phone exists", value: "exists" },
  ],
};

const timingOptions = [
  { key: "immediate", label: "immediately" },
  { key: "manual_approval", label: "manual approval required" },
  { key: "after_trigger", label: "after a delay" },
];

async function automationFetch<T>(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Automation could not be saved.");
  }

  return payload?.data as T;
}

export function SentenceBuilder() {
  const [name, setName] = useState("Review Request After Payment");
  const [registry, setRegistry] = useState<AutomationRegistryResponse>(fallbackRegistry);
  const [triggerKey, setTriggerKey] = useState("invoice.balance_zero");
  const [actionKey, setActionKey] = useState("send_review_link_from_approved_template");
  const [conditionField, setConditionField] = useState("job.status");
  const [timingMode, setTimingMode] = useState("immediate");
  const [templateKey, setTemplateKey] = useState("review_request_sms");
  const [templateBody, setTemplateBody] = useState(
    "Hi {{client.first_name}}, thank you for choosing {{company.name}}. If you were happy with our service, please leave us a Google review here: {{company.google_review_url}}",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedTrigger = registry.triggers.find((option) => option.key === triggerKey) ?? registry.triggers[0] ?? fallbackTriggers[0];
  const allowedActionKeys = registry.allowedActionsByTriggerFamily[selectedTrigger.family] ?? [];
  const actionOptions = registry.actions.filter((action) => allowedActionKeys.includes(action.key));
  const selectedAction = actionOptions.find((option) => option.key === actionKey) ?? actionOptions[0] ?? fallbackActions[0];
  const fieldList = registry.conditionFieldsByEntity[selectedTrigger.entityType] ?? [];
  const conditionList = fieldList.length > 0
    ? fieldList.map((field) => ({
      field,
      label: conditionLabelMap[field]?.label ?? field,
      value: conditionLabelMap[field]?.value ?? "exists",
    }))
    : conditionOptions[selectedTrigger.entityType] ?? [];
  const selectedCondition = conditionList.find((option) => option.field === conditionField) ?? conditionList[0] ?? null;
  const selectedConditions = selectedAction.key === "send_review_link_from_approved_template" && selectedTrigger.key === "invoice.balance_zero"
    ? [
      selectedCondition?.field,
      ...reviewBoosterConditionFields,
    ]
      .filter((field): field is string => Boolean(field))
      .filter((field, index, fields) => fields.indexOf(field) === index)
      .map((field) => conditionList.find((option) => option.field === field))
      .filter((condition): condition is { field: string; label: string; value: string } => Boolean(condition))
    : selectedCondition
      ? [selectedCondition]
      : [];

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void automationFetch<AutomationRegistryResponse>("/api/automations/builder-options")
        .then((nextRegistry) => {
          setRegistry(nextRegistry);
        })
        .catch(() => {
          setRegistry(fallbackRegistry);
        });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  const action: Record<string, unknown> = {
    type: selectedAction.key === "send_review_link_from_approved_template" ? "send_sms" : selectedAction.key,
    registryActionKey: selectedAction.key,
    target: selectedAction.customerFacing ? "client" : "office",
  };

  if (selectedAction.requiresApprovedTemplate) {
    action.templateKey = templateKey;
    action.templateBody = templateBody;
    action.requiredTokens = defaultAutomationTokens
      .map((token) => token.token)
      .filter((token) => templateBody.includes(token));
  }

  const rulePayload = {
    templateKey: selectedAction.key === "send_review_link_from_approved_template"
      ? "review_request_after_paid_invoice_sms"
      : null,
    organizationId: "default",
    name,
    status: "active",
    mode: selectedAction.requiresApprovedTemplate || timingMode === "manual_approval" ? "manual_approval" : "auto_send",
    trigger: {
      key: selectedTrigger.key,
      object: selectedTrigger.entityType,
      event: selectedTrigger.key.split(".").slice(1).join("."),
    },
    conditions: selectedConditions.map((condition) => ({
      field: condition.field,
      operator: condition.value === "exists" ? "exists" : "equals",
      value: condition.value === "exists" ? true : condition.value,
    })),
    action,
    timing: {
      mode: timingMode === "manual_approval" ? "immediate" : timingMode,
    },
    approval: {
      mode: selectedAction.requiresApprovedTemplate || timingMode === "manual_approval" ? "manual_approval" : "auto_send",
    },
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      await automationFetch("/api/automations/rules", {
        method: "POST",
        body: JSON.stringify(rulePayload),
      });
      setMessage("Automation saved. Because validation passed, this rule is active immediately.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Automation could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      <label className="block space-y-2 text-sm">
        <span className="text-[color:var(--sem-text-secondary)]">Automation name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
        />
      </label>

      <div className="rounded-[26px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
        <p className="flex flex-wrap items-center gap-2 text-sm leading-8 text-[color:var(--sem-text-secondary)]">
          <span className="font-semibold tracking-[0.18em] text-[color:var(--sem-accent-primary)]">WHEN</span>
          <AutomationSentenceSegment
            label="Object and event"
            value={triggerKey}
            options={registry.triggers.map((option) => ({ key: option.key, label: option.label }))}
            onChange={(nextValue) => {
              const nextTrigger = registry.triggers.find((option) => option.key === nextValue) ?? selectedTrigger;
              const nextFields = registry.conditionFieldsByEntity[nextTrigger.entityType] ?? [];
              const nextAllowedActions = registry.allowedActionsByTriggerFamily[nextTrigger.family] ?? [];

              setTriggerKey(nextTrigger.key);
              setConditionField(nextFields[0] ?? "");
              setActionKey(nextAllowedActions[0] ?? actionKey);
            }}
          />
          <span className="font-semibold tracking-[0.18em] text-[color:var(--sem-accent-primary)]">ONLY IF</span>
          <AutomationSentenceSegment
            label="Conditions"
            value={selectedCondition?.field ?? ""}
            options={conditionList.map((option) => ({ key: option.field, label: option.label }))}
            onChange={setConditionField}
          />
          {selectedConditions
            .filter((condition) => condition.field !== selectedCondition?.field)
            .map((condition) => (
              <span key={condition.field} className="inline-flex items-center gap-2">
                <span className="font-semibold tracking-[0.18em] text-[color:var(--sem-accent-primary)]">AND</span>
                <span className="theme-selected-card rounded-full border px-4 py-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">
                  {condition.label}
                </span>
              </span>
            ))}
          <span className="font-semibold tracking-[0.18em] text-[color:var(--sem-accent-primary)]">DO</span>
          <AutomationSentenceSegment
            label="Action"
            value={selectedAction.key}
            options={actionOptions.map((option) => ({ key: option.key, label: option.label }))}
            onChange={setActionKey}
          />
          <span className="font-semibold tracking-[0.18em] text-[color:var(--sem-accent-primary)]">WITH</span>
          <AutomationSentenceSegment
            label="Timing and approval"
            value={timingMode}
            options={timingOptions}
            onChange={setTimingMode}
          />
        </p>
      </div>

      {selectedAction.requiresApprovedTemplate ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_0.75fr]">
          <div className="space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="text-[color:var(--sem-text-secondary)]">Approved template key</span>
              <input
                value={templateKey}
                onChange={(event) => setTemplateKey(event.target.value)}
                className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="text-[color:var(--sem-text-secondary)]">Action message preview</span>
              <textarea
                value={templateBody}
                onChange={(event) => setTemplateBody(event.target.value)}
                rows={5}
                className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
              />
            </label>
          </div>
          <TokenSidebar
            tokens={defaultAutomationTokens}
            onInsert={(token) => setTemplateBody((current) => `${current}${current.endsWith(" ") ? "" : " "}${token}`)}
          />
        </div>
      ) : null}

      <details className="rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4 text-xs text-[color:var(--sem-text-secondary)]">
        <summary className="cursor-pointer font-medium text-[color:var(--sem-text-primary)]">Structured rule JSON</summary>
        <pre className="mt-3 overflow-auto whitespace-pre-wrap">{JSON.stringify(rulePayload, null, 2)}</pre>
      </details>

      {message ? (
        <p className="theme-status-success rounded-[16px] border px-4 py-3 text-sm">{message}</p>
      ) : null}

      {errorMessage ? (
        <p className="theme-alert-error rounded-[16px] border px-4 py-3 text-sm">{errorMessage}</p>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center justify-center rounded-full bg-[color:var(--cmp-action-primary)] px-5 py-3 text-sm font-semibold text-[color:var(--sem-text-inverse)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save active automation"}
      </button>
    </form>
  );
}
