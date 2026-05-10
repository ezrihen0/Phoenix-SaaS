"use client";

import { useEffect, useState } from "react";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
  };
};

type AutomationRule = {
  id: string;
  name: string;
  status: "active" | "paused" | "disabled" | "failed";
  enabled: boolean;
  mode: "auto_send" | "manual_approval" | "always_draft";
  rule_version: number;
  trigger_json: Record<string, unknown>;
  action_json: Record<string, unknown>;
  updated_at: string;
};

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
    throw new Error(payload?.error?.message ?? "Automation request failed.");
  }

  return payload?.data as T;
}

function readRuleTrigger(rule: AutomationRule) {
  const key = rule.trigger_json.key ?? `${rule.trigger_json.entity ?? "event"}.${rule.trigger_json.event ?? "selected"}`;
  return String(key);
}

function readRuleAction(rule: AutomationRule) {
  return String(rule.action_json.type ?? rule.action_json.key ?? "action");
}

export function AutomationRuleList() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadRules() {
    setLoading(true);
    setErrorMessage(null);

    try {
      setRules(await automationFetch<AutomationRule[]>("/api/automations/rules"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Automation rules could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function disableRule(ruleId: string) {
    setMessage(null);
    setErrorMessage(null);

    try {
      await automationFetch(`/api/automations/rules/${ruleId}/disable`, {
        method: "POST",
      });
      setMessage("Automation rule disabled.");
      await loadRules();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Automation rule could not be disabled.");
    }
  }

  async function deleteRule(ruleId: string) {
    setMessage(null);
    setErrorMessage(null);

    try {
      await automationFetch(`/api/automations/rules/${ruleId}`, {
        method: "DELETE",
      });
      setMessage("Automation rule deleted.");
      await loadRules();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Automation rule could not be deleted.");
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadRules();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <section className="theme-surface-card rounded-[30px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Active Automations</p>
          <h2 className="mt-2 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Rule workspace</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            Owner-created automations save as active after validation. Disable or delete rules from this workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRules()}
          className="theme-control-surface inline-flex rounded-full border px-4 py-2 text-sm font-medium"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="mt-5 rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4 text-sm text-[color:var(--sem-text-secondary)]">
          Loading automation rules...
        </p>
      ) : null}

      {!loading && rules.length === 0 ? (
        <p className="mt-5 rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4 text-sm text-[color:var(--sem-text-secondary)]">
          No active rules yet. Create a custom automation above to populate this workspace.
        </p>
      ) : null}

      {rules.length > 0 ? (
        <div className="mt-5 space-y-3">
          {rules.map((rule) => (
            <article
              key={rule.id}
              className="rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[color:var(--sem-text-primary)]">{rule.name}</h3>
                  <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">
                    When {readRuleTrigger(rule)} do {readRuleAction(rule)}.
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">
                    Version {rule.rule_version} / {rule.mode} / {rule.status}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="#activity"
                    className="theme-control-surface-soft rounded-full border px-3 py-2 text-xs font-medium"
                  >
                    View Activity
                  </a>
                  <a
                    href="#custom-builder"
                    className="theme-control-surface-soft rounded-full border px-3 py-2 text-xs font-medium"
                  >
                    Edit
                  </a>
                  <button
                    type="button"
                    onClick={() => void disableRule(rule.id)}
                    className="theme-control-surface rounded-full border px-3 py-2 text-xs font-medium"
                  >
                    Disable
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteRule(rule.id)}
                    className="theme-alert-error rounded-full border px-3 py-2 text-xs font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {message ? (
        <p className="theme-status-success mt-4 rounded-[16px] border px-4 py-3 text-sm">{message}</p>
      ) : null}

      {errorMessage ? (
        <p className="theme-alert-error mt-4 rounded-[16px] border px-4 py-3 text-sm">{errorMessage}</p>
      ) : null}
    </section>
  );
}
