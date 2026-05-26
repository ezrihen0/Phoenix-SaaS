"use client";

import { useEffect, useState, type FormEvent } from "react";

import { AutomationSentenceSegment } from "./automation-sentence-segment";
import { TokenSidebar, defaultAutomationTokens } from "./token-sidebar";

export type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
    details?: unknown;
  };
};

export type AutomationRule = {
  id: string;
  name: string;
  status: "active" | "paused" | "disabled" | "failed";
  enabled: boolean;
  mode: "auto_send" | "manual_approval" | "always_draft";
  rule_version: number;
  trigger_json: Record<string, unknown>;
  conditions_json?: Record<string, unknown>[];
  action_json: Record<string, unknown>;
  timing_json?: Record<string, unknown> | null;
  updated_at: string;
};

export type RegistryTrigger = {
  key: string;
  family: string;
  label: string;
  entityType: string;
};

export type RegistryAction = {
  key: string;
  label: string;
  customerFacing: boolean;
  requiresApprovedTemplate: boolean;
};

export type RegistryToken = {
  token: string;
  group: string;
  label: string;
};

export type SuccessRecipe = {
  templateKey: string;
  title: string;
  category: string;
  triggerKey: string;
  actionKey: string;
  requiredConditions: string[];
};

export type AutomationRegistryResponse = {
  triggers: RegistryTrigger[];
  actions: RegistryAction[];
  conditionFieldsByEntity: Record<string, string[]>;
  allowedActionsByTriggerFamily: Record<string, string[]>;
  timingModes: string[];
  tokenGroups: string[];
  tokenDefinitions?: RegistryToken[];
  successRecipes?: SuccessRecipe[];
};

export const fallbackTriggers: RegistryTrigger[] = [
  { key: "invoice.balance_zero", family: "invoices_payments", label: "Invoice balance reaches zero", entityType: "invoice" },
  { key: "job.completed", family: "jobs", label: "Job completed", entityType: "job" },
  { key: "call.missed", family: "calls", label: "Call missed", entityType: "call" },
  { key: "estimate.sent", family: "estimates_quotes", label: "Estimate sent", entityType: "estimate" },
];

export const fallbackActions: RegistryAction[] = [
  { key: "send_review_link_from_approved_template", label: "Send review link from approved template", customerFacing: true, requiresApprovedTemplate: true },
  { key: "send_sms_from_approved_template", label: "Send SMS from approved template", customerFacing: true, requiresApprovedTemplate: true },
  { key: "create_crm_task", label: "Create CRM task", customerFacing: false, requiresApprovedTemplate: false },
  { key: "notify_office", label: "Notify office", customerFacing: false, requiresApprovedTemplate: false },
];

export const fallbackRegistry: AutomationRegistryResponse = {
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

export const conditionLabelMap: Record<string, { label: string; value: string }> = {
  "job.status": { label: "Job is completed", value: "completed" },
  "client.phone": { label: "Client phone exists", value: "exists" },
  "company.google_review_url": { label: "Google review URL exists", value: "exists" },
  "call.customer_id": { label: "Call has matched customer", value: "exists" },
  "estimate.status": { label: "Estimate is sent", value: "sent" },
};

export const reviewBoosterConditionFields = ["job.status", "company.google_review_url"];

export const conditionOptions: Record<string, Array<{ field: string; label: string; value: string }>> = {
  invoice: [
    { field: "job.status", label: "Job status is completed", value: "completed" },
    { field: "client.phone", label: "Client phone exists", value: "exists" },
    { field: "company.google_review_url", label: "Google review URL exists", value: "exists" },
  ],
  job: [
    { field: "job.status", label: "Job status is completed", value: "completed" },
    { field: "client.phone", label: "Client phone exists", value: "exists" },
  ],
  call: [
    { field: "call.customer_id", label: "Call has a matched customer", value: "exists" },
    { field: "client.phone", label: "Client phone exists", value: "exists" },
  ],
  estimate: [
    { field: "estimate.status", label: "Estimate is sent", value: "sent" },
    { field: "client.phone", label: "Client phone exists", value: "exists" },
  ],
};

export const timingOptions = [
  { key: "immediate", label: "Immediately" },
  { key: "manual_approval", label: "Manual approval required" },
  { key: "after_trigger", label: "After a delay" },
];

export async function automationFetch<T>(input: string, init?: RequestInit) {
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
    throw new Error(payload?.error?.message ?? "Automation request failed.");
  }

  return payload?.data as T;
}

export function readTriggerKey(rule: AutomationRule) {
  const trigger = rule.trigger_json;
  const directKey = trigger.key;

  if (typeof directKey === "string" && directKey.trim()) {
    return directKey.trim();
  }

  const entity = trigger.entity ?? trigger.object;
  const event = trigger.event;

  if (typeof entity === "string" && typeof event === "string") {
    return `${entity}.${event}`;
  }

  return "unknown";
}

export function readActionKey(rule: AutomationRule) {
  const action = rule.action_json;
  const registryKey = action.registryActionKey ?? action.key ?? action.type;
  return typeof registryKey === "string" ? registryKey : "unknown";
}

export function readConditionKey(rule: AutomationRule) {
  const conditions = rule.conditions_json ?? [];

  if (conditions.length === 0) {
    return "";
  }

  return conditions
    .map((condition) => (typeof condition.field === "string" ? condition.field : ""))
    .filter(Boolean)
    .join(" · ");
}

export function readConditionLabel(rule: AutomationRule) {
  const conditions = rule.conditions_json ?? [];

  if (conditions.length === 0) {
    return "No condition configured";
  }

  return conditions
    .map((condition) => {
      const field = typeof condition.field === "string" ? condition.field : "";
      return conditionLabelMap[field]?.label ?? field;
    })
    .filter(Boolean)
    .join(" · ");
}

export function readDelayKey(rule: AutomationRule) {
  const mode = rule.timing_json?.mode;
  return typeof mode === "string" && mode.trim() ? mode.trim() : "immediate";
}

export function readDelayLabel(delayKey: string) {
  if (delayKey === "immediate") {
    return "Immediate";
  }

  const option = timingOptions.find((item) => item.key === delayKey);
  return option?.label ?? delayKey.replaceAll("_", " ");
}

export function readTemplateBody(rule: AutomationRule) {
  const body = rule.action_json.templateBody;
  return typeof body === "string" ? body : "";
}

export function readTemplateKey(rule: AutomationRule) {
  const key = rule.action_json.templateKey;
  return typeof key === "string" ? key : "";
}

export function registryTokens(registry: AutomationRegistryResponse) {
  if (registry.tokenDefinitions?.length) {
    return registry.tokenDefinitions.map((token) => ({
      token: token.token,
      label: token.label,
      group: token.group.charAt(0).toUpperCase() + token.group.slice(1),
    }));
  }

  return defaultAutomationTokens;
}

export type BuilderState = {
  name: string;
  triggerKey: string;
  actionKey: string;
  conditionField: string;
  timingMode: string;
  templateKey: string;
  templateBody: string;
};

export function createDefaultBuilderState(registry: AutomationRegistryResponse = fallbackRegistry): BuilderState {
  const trigger = registry.triggers[0] ?? fallbackTriggers[0];
  const allowedActionKeys = registry.allowedActionsByTriggerFamily[trigger.family] ?? [];
  const actionKey = allowedActionKeys[0] ?? fallbackActions[0].key;
  const fields = registry.conditionFieldsByEntity[trigger.entityType] ?? [];

  return {
    name: "New automation rule",
    triggerKey: trigger.key,
    actionKey,
    conditionField: fields[0] ?? "",
    timingMode: "immediate",
    templateKey: "",
    templateBody: "",
  };
}

export function buildRulePayload(
  registry: AutomationRegistryResponse,
  state: BuilderState,
) {
  const selectedTrigger = registry.triggers.find((option) => option.key === state.triggerKey) ?? registry.triggers[0] ?? fallbackTriggers[0];
  const allowedActionKeys = registry.allowedActionsByTriggerFamily[selectedTrigger.family] ?? [];
  const actionOptions = registry.actions.filter((action) => allowedActionKeys.includes(action.key));
  const selectedAction = actionOptions.find((option) => option.key === state.actionKey) ?? actionOptions[0] ?? fallbackActions[0];
  const fieldList = registry.conditionFieldsByEntity[selectedTrigger.entityType] ?? [];
  const conditionList = fieldList.length > 0
    ? fieldList.map((field) => ({
      field,
      label: conditionLabelMap[field]?.label ?? field,
      value: conditionLabelMap[field]?.value ?? "exists",
    }))
    : conditionOptions[selectedTrigger.entityType] ?? [];
  const selectedCondition = conditionList.find((option) => option.field === state.conditionField) ?? conditionList[0] ?? null;
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

  const tokens = registryTokens(registry);
  const action: Record<string, unknown> = {
    type: selectedAction.key === "send_review_link_from_approved_template" ? "send_sms" : selectedAction.key,
    registryActionKey: selectedAction.key,
    target: selectedAction.customerFacing ? "client" : "office",
  };

  if (selectedAction.requiresApprovedTemplate) {
    action.templateKey = state.templateKey;
    action.templateBody = state.templateBody;
    action.requiredTokens = tokens
      .map((token) => token.token)
      .filter((token) => state.templateBody.includes(token));
  }

  return {
    templateKey: selectedAction.key === "send_review_link_from_approved_template"
      ? "review_request_after_paid_invoice_sms"
      : null,
    organizationId: "default",
    name: state.name,
    status: "active",
    mode: selectedAction.requiresApprovedTemplate || state.timingMode === "manual_approval" ? "manual_approval" : "auto_send",
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
      mode: state.timingMode === "manual_approval" ? "immediate" : state.timingMode,
    },
    approval: {
      mode: selectedAction.requiresApprovedTemplate || state.timingMode === "manual_approval" ? "manual_approval" : "auto_send",
    },
  };
}

export function LegacySentenceBuilder({
  onCreated,
}: {
  onCreated?: () => void;
}) {
  const [registry, setRegistry] = useState<AutomationRegistryResponse>(fallbackRegistry);
  const [builder, setBuilder] = useState<BuilderState>(() => createDefaultBuilderState(fallbackRegistry));
  const { name, triggerKey, actionKey, conditionField, timingMode, templateKey, templateBody } = builder;
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
          setBuilder(createDefaultBuilderState(nextRegistry));
        })
        .catch(() => {
          setRegistry(fallbackRegistry);
        });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  const rulePayload = buildRulePayload(registry, {
    name,
    triggerKey,
    actionKey,
    conditionField,
    timingMode,
    templateKey,
    templateBody,
  });

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
      onCreated?.();
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
          onChange={(event) => setBuilder((current) => ({ ...current, name: event.target.value }))}
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

              setBuilder((current) => ({
                ...current,
                triggerKey: nextTrigger.key,
                conditionField: nextFields[0] ?? "",
                actionKey: nextAllowedActions[0] ?? current.actionKey,
              }));
            }}
          />
          <span className="font-semibold tracking-[0.18em] text-[color:var(--sem-accent-primary)]">ONLY IF</span>
          <AutomationSentenceSegment
            label="Conditions"
            value={selectedCondition?.field ?? ""}
            options={conditionList.map((option) => ({ key: option.field, label: option.label }))}
            onChange={(value) => setBuilder((current) => ({ ...current, conditionField: value }))}
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
            onChange={(value) => setBuilder((current) => ({ ...current, actionKey: value }))}
          />
          <span className="font-semibold tracking-[0.18em] text-[color:var(--sem-accent-primary)]">WITH</span>
          <AutomationSentenceSegment
            label="Timing and approval"
            value={timingMode}
            options={timingOptions}
            onChange={(value) => setBuilder((current) => ({ ...current, timingMode: value }))}
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
                onChange={(event) => setBuilder((current) => ({ ...current, templateKey: event.target.value }))}
                className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="text-[color:var(--sem-text-secondary)]">Action message preview</span>
              <textarea
                value={templateBody}
                onChange={(event) => setBuilder((current) => ({ ...current, templateBody: event.target.value }))}
                rows={5}
                className="theme-control-surface w-full rounded-[16px] border px-4 py-3 text-[color:var(--sem-text-primary)] outline-none"
              />
            </label>
          </div>
          <TokenSidebar
            tokens={defaultAutomationTokens}
            onInsert={(token) => setBuilder((current) => ({
              ...current,
              templateBody: `${current.templateBody}${current.templateBody.endsWith(" ") ? "" : " "}${token}`,
            }))}
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

export function SentenceBuilder(props: { onCreated?: () => void }) {
  return <LegacySentenceBuilder {...props} />;
}
