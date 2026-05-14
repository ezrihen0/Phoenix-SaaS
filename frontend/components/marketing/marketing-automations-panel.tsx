"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  MARKETING_AUTOMATION_OPPORTUNITY_TYPES,
  createMarketingAutomationRule,
  deleteMarketingAutomationRule,
  fetchMarketingAutomationRules,
  fetchMarketingAutomationRuns,
  fetchMarketingOpportunities,
  patchMarketingAutomationRule,
  previewMarketingAutomationRule,
  type MarketingAutomationRulePayload,
  type MarketingAutomationRunPayload,
} from "@/lib/marketing/client-marketing";

type MarketingAutomationsPanelProps = {
  canMutateAutomations: boolean;
};

function formatTriggerLabel(key: string): string {
  return key.replace(/_/g, " ");
}

function parseActionConfigJson(raw: string): Record<string, unknown> {
  if (!raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return {};
}

export function MarketingAutomationsPanel({ canMutateAutomations }: MarketingAutomationsPanelProps) {
  const [rules, setRules] = useState<MarketingAutomationRulePayload[]>([]);
  const [runs, setRuns] = useState<MarketingAutomationRunPayload[]>([]);
  const [runTotal, setRunTotal] = useState(0);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editEnabled, setEditEnabled] = useState(true);
  const [editTriggers, setEditTriggers] = useState<Record<string, boolean>>({});
  const [editAction, setEditAction] = useState<"suggest_only" | "auto_create_draft">("suggest_only");
  const [editCooldown, setEditCooldown] = useState(0);
  const [editActionConfigJson, setEditActionConfigJson] = useState("{}");
  const [saving, setSaving] = useState(false);

  const [previewOppId, setPreviewOppId] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewResult, setPreviewResult] = useState<string | null>(null);

  const selectedRule = useMemo(
    () => (selectedRuleId ? rules.find((r) => r.id === selectedRuleId) ?? null : null),
    [rules, selectedRuleId],
  );

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    setError(null);
    try {
      const payload = await fetchMarketingAutomationRules();
      setRules(payload.rules);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Automation rules could not be loaded.");
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const loadRuns = useCallback(async (ruleId?: string) => {
    setRunsLoading(true);
    setError(null);
    try {
      const payload = await fetchMarketingAutomationRuns({
        limit: 40,
        offset: 0,
        rule_id: ruleId,
      });
      setRuns(payload.runs);
      setRunTotal(payload.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Automation runs could not be loaded.");
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  useEffect(() => {
    setSelectedRuleId((prev) => (prev && !rules.some((r) => r.id === prev) ? null : prev));
  }, [rules]);

  useEffect(() => {
    void loadRuns(selectedRuleId ?? undefined);
  }, [loadRuns, selectedRuleId]);

  const resetFormFromRule = (rule: MarketingAutomationRulePayload | null) => {
    if (!rule) {
      setEditName("");
      setEditDescription("");
      setEditEnabled(true);
      setEditTriggers(Object.fromEntries(MARKETING_AUTOMATION_OPPORTUNITY_TYPES.map((t) => [t, false])));
      setEditAction("suggest_only");
      setEditCooldown(0);
      setEditActionConfigJson("{}");
      return;
    }

    setEditName(rule.name);
    setEditDescription(rule.description ?? "");
    setEditEnabled(rule.enabled);
    const nextTriggers: Record<string, boolean> = Object.fromEntries(
      MARKETING_AUTOMATION_OPPORTUNITY_TYPES.map((t) => [t, false]),
    );
    for (const t of rule.trigger_opportunity_types) {
      if (typeof t === "string") {
        nextTriggers[t] = true;
      }
    }
    setEditTriggers(nextTriggers);
    setEditAction(rule.action_type === "auto_create_draft" ? "auto_create_draft" : "suggest_only");
    setEditCooldown(rule.cooldown_seconds ?? 0);
    setEditActionConfigJson(JSON.stringify(rule.action_config ?? {}, null, 2));
  };

  const startCreate = () => {
    setCreating(true);
    setSelectedRuleId(null);
    resetFormFromRule(null);
  };

  const selectRule = (id: string) => {
    setCreating(false);
    setSelectedRuleId(id);
    const rule = rules.find((r) => r.id === id);
    if (rule) {
      resetFormFromRule(rule);
    }
  };

  const buildTriggerList = (): string[] =>
    MARKETING_AUTOMATION_OPPORTUNITY_TYPES.filter((t) => editTriggers[t]).map((t) => t);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const triggers = buildTriggerList();
      const actionConfig = parseActionConfigJson(editActionConfigJson);
      if (creating) {
        await createMarketingAutomationRule({
          name: editName.trim(),
          description: editDescription.trim() || null,
          enabled: editEnabled,
          trigger_opportunity_types: triggers,
          action_type: editAction,
          action_config: actionConfig,
          cooldown_seconds: editCooldown,
        });
      } else if (selectedRuleId) {
        await patchMarketingAutomationRule(selectedRuleId, {
          name: editName.trim(),
          description: editDescription.trim() || null,
          enabled: editEnabled,
          trigger_opportunity_types: triggers,
          action_type: editAction,
          action_config: actionConfig,
          cooldown_seconds: editCooldown,
        });
      }

      await loadRules();
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save automation rule.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this automation rule? This cannot be undone.")) {
      return;
    }
    try {
      await deleteMarketingAutomationRule(id);
      if (selectedRuleId === id) {
        setSelectedRuleId(null);
        resetFormFromRule(null);
      }

      await loadRules();
      await loadRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const onPreview = async () => {
    const ruleId = selectedRule?.id ?? selectedRuleId;
    const oppId = previewOppId.trim();
    if (!ruleId) {
      setPreviewResult("Select a rule first.");
      return;
    }
    if (!oppId) {
      setPreviewResult("Enter an opportunity id.");
      return;
    }

    setPreviewBusy(true);
    setPreviewResult(null);
    try {
      const result = await previewMarketingAutomationRule(ruleId, oppId);
      setPreviewResult(JSON.stringify(result, null, 2));
    } catch (e) {
      setPreviewResult(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setPreviewBusy(false);
    }
  };

  const onLoadFirstOpenOpportunity = async () => {
    try {
      const list = await fetchMarketingOpportunities({ limit: 5, offset: 0 });
      const first = list.opportunities[0];
      if (first?.id) {
        setPreviewOppId(first.id);
      } else {
        setPreviewResult("No open opportunities returned — refresh detection or enter an id manually.");
      }
    } catch (e) {
      setPreviewResult(e instanceof Error ? e.message : "Could not load opportunities.");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">
          Rules run only when Phase 4 opportunity detection upserts a matching signal. Actions are{" "}
          <span className="font-semibold text-[color:var(--sem-text-primary)]">suggest-only</span> or{" "}
          <span className="font-semibold text-[color:var(--sem-text-primary)]">auto-create draft</span> inside Content
          Studio — nothing publishes automatically.
        </p>
        {canMutateAutomations ? (
          <button
            type="button"
            className="theme-control-surface-soft inline-flex rounded-full border px-4 py-2 text-xs font-semibold"
            onClick={() => startCreate()}
          >
            New rule
          </button>
        ) : null}
      </div>

      {error ? <div className="theme-alert-error rounded-[16px] border px-4 py-3 text-sm">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Rules</p>
          {rulesLoading ? (
            <p className="mt-4 text-sm text-[color:var(--sem-text-muted)]">Loading…</p>
          ) : rules.length === 0 ? (
            <p className="mt-4 text-sm text-[color:var(--sem-text-secondary)]">No automation rules yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {rules.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => selectRule(r.id)}
                    className={[
                      "w-full rounded-[16px] border px-4 py-3 text-left transition",
                      r.id === selectedRuleId ? "theme-selected-card" : "theme-control-surface-soft",
                    ].join(" ")}
                  >
                    <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">{r.name}</p>
                    <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">
                      {r.enabled ? "Enabled" : "Paused"} · {r.action_type.replace(/_/g, " ")}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">
            {creating ? "Create rule" : selectedRule ? "Edit rule" : "Select or create a rule"}
          </p>

          {!canMutateAutomations ? (
            <p className="mt-4 text-sm text-[color:var(--sem-text-secondary)]">
              Only owners, admins, or office admins can change automation rules.
            </p>
          ) : null}

          {canMutateAutomations && (creating || selectedRule) ? (
            <div className="mt-5 space-y-4">
              <label className="block text-xs font-medium text-[color:var(--sem-text-muted)]">
                Name
                <input
                  className="theme-control-surface-soft mt-1 w-full rounded-[14px] border px-3 py-2 text-sm"
                  value={editName}
                  onChange={(ev) => setEditName(ev.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-[color:var(--sem-text-muted)]">
                Description
                <textarea
                  className="theme-control-surface-soft mt-1 min-h-[72px] w-full rounded-[14px] border px-3 py-2 text-sm"
                  value={editDescription}
                  onChange={(ev) => setEditDescription(ev.target.value)}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-[color:var(--sem-text-primary)]">
                <input type="checkbox" checked={editEnabled} onChange={(ev) => setEditEnabled(ev.target.checked)} />
                Enabled
              </label>

              <div>
                <p className="text-xs font-medium text-[color:var(--sem-text-muted)]">Trigger on opportunity types</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {MARKETING_AUTOMATION_OPPORTUNITY_TYPES.map((t) => (
                    <label key={t} className="flex items-center gap-2 text-xs text-[color:var(--sem-text-secondary)]">
                      <input
                        type="checkbox"
                        checked={Boolean(editTriggers[t])}
                        onChange={(ev) => setEditTriggers((prev) => ({ ...prev, [t]: ev.target.checked }))}
                      />
                      {formatTriggerLabel(t)}
                    </label>
                  ))}
                </div>
              </div>

              <label className="block text-xs font-medium text-[color:var(--sem-text-muted)]">
                Action
                <select
                  className="theme-control-surface-soft mt-1 w-full rounded-[14px] border px-3 py-2 text-sm"
                  value={editAction}
                  onChange={(ev) =>
                    setEditAction(ev.target.value === "auto_create_draft" ? "auto_create_draft" : "suggest_only")
                  }
                >
                  <option value="suggest_only">Suggest only (audit trail)</option>
                  <option value="auto_create_draft">Auto create draft</option>
                </select>
              </label>

              <label className="block text-xs font-medium text-[color:var(--sem-text-muted)]">
                Cooldown (seconds between successful matches for this rule)
                <input
                  type="number"
                  min={0}
                  className="theme-control-surface-soft mt-1 w-full rounded-[14px] border px-3 py-2 text-sm"
                  value={editCooldown}
                  onChange={(ev) => setEditCooldown(Number.parseInt(ev.target.value, 10) || 0)}
                />
              </label>

              <label className="block text-xs font-medium text-[color:var(--sem-text-muted)]">
                Action config (JSON: title_prefix, intent_override, notes_template)
                <textarea
                  className="theme-control-surface-soft mt-1 min-h-[120px] w-full rounded-[14px] border px-3 py-2 font-mono text-xs"
                  value={editActionConfigJson}
                  onChange={(ev) => setEditActionConfigJson(ev.target.value)}
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  className="inline-flex rounded-full border border-transparent bg-[color:var(--sem-accent-primary)] px-4 py-2 text-xs font-semibold text-[color:var(--sem-text-inverse)] disabled:opacity-50"
                  onClick={() => void onSave()}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                {selectedRule ? (
                  <button
                    type="button"
                    className="theme-control-surface-soft rounded-full border px-4 py-2 text-xs font-semibold"
                    onClick={() => void onDelete(selectedRule.id)}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Dry-run preview</p>
        <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
          Evaluates the selected rule against an opportunity without writing runs or drafts.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block min-w-[220px] flex-1 text-xs font-medium text-[color:var(--sem-text-muted)]">
            Opportunity id
            <input
              className="theme-control-surface-soft mt-1 w-full rounded-[14px] border px-3 py-2 text-sm"
              value={previewOppId}
              onChange={(ev) => setPreviewOppId(ev.target.value)}
              placeholder="UUID from Opportunities"
            />
          </label>
          <button
            type="button"
            className="theme-control-surface-soft rounded-full border px-4 py-2 text-xs font-semibold"
            onClick={() => void onLoadFirstOpenOpportunity()}
          >
            Use first open opportunity
          </button>
          <button
            type="button"
            disabled={previewBusy || !canMutateAutomations}
            className="inline-flex rounded-full border border-transparent bg-[color:var(--sem-accent-primary)] px-4 py-2 text-xs font-semibold text-[color:var(--sem-text-inverse)] disabled:opacity-50"
            onClick={() => void onPreview()}
          >
            {previewBusy ? "Running…" : "Preview"}
          </button>
        </div>
        {!canMutateAutomations ? (
          <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">Preview requires publisher access.</p>
        ) : null}
        {previewResult ? (
          <pre className="theme-control-surface-soft mt-4 max-h-64 overflow-auto rounded-[16px] border p-3 text-xs">{previewResult}</pre>
        ) : null}
      </div>

      <div className="theme-surface-card rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">
            Recent runs
            {selectedRuleId ? " (filtered to selected rule)" : ""}
          </p>
          <span className="text-xs text-[color:var(--sem-text-muted)]">
            Showing {runs.length} of {runTotal}
          </span>
        </div>
        {runsLoading ? (
          <p className="mt-4 text-sm text-[color:var(--sem-text-muted)]">Loading runs…</p>
        ) : runs.length === 0 ? (
          <p className="mt-4 text-sm text-[color:var(--sem-text-secondary)]">No runs recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-[color:var(--sem-text-muted)]">
                <tr className="border-b border-[color:var(--cmp-border-subtle)]">
                  <th className="py-2 pr-2 font-medium">When</th>
                  <th className="py-2 pr-2 font-medium">Outcome</th>
                  <th className="py-2 pr-2 font-medium">Draft</th>
                  <th className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-[color:var(--cmp-border-subtle)] last:border-none">
                    <td className="py-3 pr-2 align-top text-[color:var(--sem-text-secondary)]">{run.created_at}</td>
                    <td className="py-3 pr-2 align-top font-medium text-[color:var(--sem-text-primary)]">
                      {run.outcome}
                      {run.skip_reason ? (
                        <span className="mt-1 block text-[10px] font-normal text-[color:var(--sem-text-muted)]">
                          {run.skip_reason}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-2 align-top text-[color:var(--sem-text-secondary)]">
                      {run.marketing_content_draft_id ?? "—"}
                    </td>
                    <td className="py-3 align-top text-[color:var(--sem-text-muted)]">
                      {run.error_detail ? run.error_detail.slice(0, 120) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
