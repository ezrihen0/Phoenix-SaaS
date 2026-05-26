"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  Bot,
  ChevronDown,
  Clock3,
  GitBranch,
  HelpCircle,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Workflow,
  Zap,
} from "lucide-react";

import type { SessionRole } from "@/lib/auth/server-session";

import { LegacyAutomationRuleList } from "./automation-rule-list";
import { AutomationSentenceSegment } from "./automation-sentence-segment";
import { LegacySentenceBuilder } from "./sentence-builder";
import {
  type AutomationRegistryResponse,
  type AutomationRule,
  type BuilderState,
  type SuccessRecipe,
  automationFetch,
  buildRulePayload,
  conditionLabelMap,
  conditionOptions,
  createDefaultBuilderState,
  fallbackActions,
  fallbackRegistry,
  fallbackTriggers,
  readActionKey,
  readConditionKey,
  readConditionLabel,
  readDelayKey,
  readDelayLabel,
  readTemplateBody,
  readTemplateKey,
  readTriggerKey,
  registryTokens,
  timingOptions,
} from "./sentence-builder";
import { TokenSidebar } from "./token-sidebar";

export const SHOW_LEGACY_AUTOMATIONS = false;

type NodeId = "trigger" | "condition" | "delay" | "action";

type CanvasNode = {
  id: NodeId;
  type: NodeId;
  title: string;
  x: number;
  y: number;
  accent: "violet" | "amber" | "zinc" | "cyan";
  code: string;
  helper: string;
};

const DEFAULT_NODE_LAYOUT: Array<Omit<CanvasNode, "code" | "helper">> = [
  { id: "trigger", type: "trigger", title: "Trigger Zone", x: 48, y: 120, accent: "violet" },
  { id: "condition", type: "condition", title: "Condition Gate", x: 360, y: 64, accent: "amber" },
  { id: "delay", type: "delay", title: "Temporal Delay", x: 360, y: 280, accent: "zinc" },
  { id: "action", type: "action", title: "Action Dispatch", x: 672, y: 172, accent: "cyan" },
];

const NODE_W = 288;
const NODE_H = 110;
const DRAG_THRESHOLD_PX = 4;

type NodePosition = { x: number; y: number };
type AnchorSide = "left" | "right" | "top" | "bottom";

function initialNodePositions(): Record<NodeId, NodePosition> {
  return Object.fromEntries(
    DEFAULT_NODE_LAYOUT.map((node) => [node.id, { x: node.x, y: node.y }]),
  ) as Record<NodeId, NodePosition>;
}

function nodeAnchor(pos: NodePosition, side: AnchorSide) {
  switch (side) {
    case "left":
      return { x: pos.x, y: pos.y + NODE_H / 2 };
    case "right":
      return { x: pos.x + NODE_W, y: pos.y + NODE_H / 2 };
    case "top":
      return { x: pos.x + NODE_W / 2, y: pos.y };
    case "bottom":
      return { x: pos.x + NODE_W / 2, y: pos.y + NODE_H };
  }
}

function curvePath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const midX = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} Q ${midX} ${from.y} ${to.x} ${to.y}`;
}

function straightPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

function canManageAutomations(permissions: string[]) {
  return permissions.includes("automations.manage");
}

function accentClass(accent: CanvasNode["accent"]) {
  return {
    violet: "border-violet-500/40 text-violet-300 shadow-violet-950/20",
    amber: "border-amber-500/40 text-amber-300 shadow-amber-950/20",
    zinc: "border-zinc-500/40 text-zinc-300 shadow-zinc-950/20",
    cyan: "border-cyan-500/40 text-cyan-300 shadow-cyan-950/20",
  }[accent];
}

function nodeBadgeClass(nodeId: NodeId) {
  return {
    trigger: "border-violet-500/40 bg-violet-500/10 text-violet-300",
    condition: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    delay: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
    action: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  }[nodeId];
}

function stopCanvasPointer(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function NodeIcon({ type }: { type: NodeId }) {
  if (type === "trigger") return <Zap className="h-3.5 w-3.5 text-violet-400" />;
  if (type === "condition") return <GitBranch className="h-3.5 w-3.5 text-amber-400" />;
  if (type === "delay") return <Clock3 className="h-3.5 w-3.5 text-zinc-400" />;
  return <Send className="h-3.5 w-3.5 text-cyan-400" />;
}

function formatRuleDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function hydrateBuilderFromRule(rule: AutomationRule): BuilderState {
  const conditions = rule.conditions_json ?? [];
  const firstCondition = conditions[0];
  const conditionField = typeof firstCondition?.field === "string" ? firstCondition.field : "job.status";

  return {
    name: rule.name,
    triggerKey: readTriggerKey(rule),
    actionKey: readActionKey(rule),
    conditionField,
    timingMode: readDelayKey(rule),
    templateKey: readTemplateKey(rule),
    templateBody: readTemplateBody(rule),
  };
}

function applySuccessRecipe(recipe: SuccessRecipe, registry: AutomationRegistryResponse): BuilderState {
  const base = createDefaultBuilderState(registry);
  return {
    ...base,
    name: recipe.title,
    triggerKey: recipe.triggerKey,
    actionKey: recipe.actionKey,
    conditionField: recipe.requiredConditions[0] ?? base.conditionField,
    templateKey: recipe.templateKey,
    templateBody: "",
  };
}

type AutomationWorkflowWorkspaceProps = {
  sessionRole: SessionRole | null;
  permissions: string[];
};

function AutomationWorkflowCanvas({ sessionRole, permissions }: AutomationWorkflowWorkspaceProps) {
  const canManage = canManageAutomations(permissions);
  const [registry, setRegistry] = useState<AutomationRegistryResponse>(fallbackRegistry);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string>("new");
  const [composeMode, setComposeMode] = useState(true);
  const [builder, setBuilder] = useState<BuilderState>(() => createDefaultBuilderState(fallbackRegistry));
  const [nodePositions, setNodePositions] = useState<Record<NodeId, NodePosition>>(initialNodePositions);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [activeNode, setActiveNode] = useState<NodeId>("trigger");
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<NodeId | null>(null);
  const dragRef = useRef<{
    nodeId: NodeId;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const suppressNodeClickRef = useRef(false);
  const registryAppliedRef = useRef(false);
  const [prompt, setPrompt] = useState("");
  const [blueprintNote, setBlueprintNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [listMessage, setListMessage] = useState<string | null>(null);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);

  const selectedRule = useMemo(
    () => (selectedRuleId === "new" ? null : rules.find((rule) => rule.id === selectedRuleId) ?? null),
    [rules, selectedRuleId],
  );

  const selectedTrigger = registry.triggers.find((option) => option.key === builder.triggerKey) ?? registry.triggers[0] ?? fallbackTriggers[0];
  const allowedActionKeys = registry.allowedActionsByTriggerFamily[selectedTrigger.family] ?? [];
  const actionOptions = registry.actions.filter((action) => allowedActionKeys.includes(action.key));
  const selectedAction = actionOptions.find((option) => option.key === builder.actionKey) ?? actionOptions[0] ?? fallbackActions[0];
  const fieldList = registry.conditionFieldsByEntity[selectedTrigger.entityType] ?? [];
  const conditionList = fieldList.length > 0
    ? fieldList.map((field) => ({
      field,
      label: conditionLabelMap[field]?.label ?? field,
      value: conditionLabelMap[field]?.value ?? "exists",
    }))
    : conditionOptions[selectedTrigger.entityType] ?? [];

  const tokens = registryTokens(registry);
  const activeCount = rules.filter((rule) => rule.enabled && rule.status === "active").length;
  const disabledCount = rules.filter((rule) => !rule.enabled || rule.status === "disabled").length;

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    setRulesError(null);

    try {
      const nextRules = await automationFetch<AutomationRule[]>("/api/automations/rules");
      setRules(nextRules);
      setSelectedRuleId((current) => {
        if (current !== "new" && !nextRules.some((rule) => rule.id === current)) {
          return nextRules[0]?.id ?? "new";
        }

        return current;
      });
    } catch (error) {
      setRulesError(error instanceof Error ? error.message : "Automation rules could not be loaded.");
      setRules([]);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void automationFetch<AutomationRegistryResponse>("/api/automations/builder-options")
        .then((nextRegistry) => {
          setRegistry(nextRegistry);

          if (!registryAppliedRef.current) {
            setBuilder(createDefaultBuilderState(nextRegistry));
            registryAppliedRef.current = true;
          }
        })
        .catch(() => setRegistry(fallbackRegistry));
      void loadRules();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadRules]);

  useEffect(() => {
    if (!selectedRule) {
      return;
    }

    setBuilder(hydrateBuilderFromRule(selectedRule));
    setComposeMode(false);
    setActiveNode("trigger");
    setSaveMessage(null);
    setSaveError(null);
  }, [selectedRuleId, selectedRule]);

  const triggerLabel = selectedTrigger.label;
  const conditionDisplay = composeMode
    ? (conditionList.find((item) => item.field === builder.conditionField)?.label ?? "No condition configured")
    : (selectedRule ? readConditionLabel(selectedRule) : "No condition configured");
  const conditionKeyDisplay = composeMode
    ? (builder.conditionField || "none")
    : (selectedRule ? readConditionKey(selectedRule) || "none" : "none");
  const delayKeyDisplay = builder.timingMode;
  const delayLabel = readDelayLabel(builder.timingMode);
  const actionLabel = selectedAction.label;

  const nodes: CanvasNode[] = DEFAULT_NODE_LAYOUT.map((node) => {
    const position = nodePositions[node.id];

    if (node.id === "trigger") {
      return {
        ...node,
        x: position.x,
        y: position.y,
        code: `EVENT: ${builder.triggerKey || "NOT_SELECTED"}`,
        helper: triggerLabel,
      };
    }

    if (node.id === "condition") {
      return {
        ...node,
        x: position.x,
        y: position.y,
        code: conditionKeyDisplay ? `IF: ${conditionKeyDisplay}` : "IF: none",
        helper: conditionDisplay,
      };
    }

    if (node.id === "delay") {
      return {
        ...node,
        x: position.x,
        y: position.y,
        code: `DELAY: ${delayKeyDisplay.toUpperCase()}`,
        helper: delayLabel,
      };
    }

    return {
      ...node,
      x: position.x,
      y: position.y,
      code: `DISPATCH: ${builder.actionKey || "NOT_SELECTED"}`,
      helper: actionLabel,
    };
  });

  const connectorPaths = useMemo(() => {
    const trigger = nodePositions.trigger;
    const condition = nodePositions.condition;
    const delay = nodePositions.delay;
    const action = nodePositions.action;

    return {
      triggerToCondition: curvePath(
        nodeAnchor(trigger, "right"),
        nodeAnchor(condition, "left"),
      ),
      conditionToDelay: straightPath(
        nodeAnchor(condition, "bottom"),
        nodeAnchor(delay, "top"),
      ),
      conditionToAction: curvePath(
        nodeAnchor(condition, "right"),
        { x: nodeAnchor(action, "left").x, y: nodeAnchor(action, "left").y - 28 },
      ),
      delayToAction: curvePath(
        nodeAnchor(delay, "right"),
        { x: nodeAnchor(action, "left").x, y: nodeAnchor(action, "left").y + 28 },
      ),
    };
  }, [nodePositions]);

  const activeNodeData = nodes.find((node) => node.id === activeNode);
  const rulePayload = buildRulePayload(registry, builder);
  const inspectorReadOnly = !composeMode || !canManage;

  function startNewWorkflow() {
    setSelectedRuleId("new");
    setComposeMode(true);
    setBuilder(createDefaultBuilderState(registry));
    setActiveNode("trigger");
    setSaveMessage(null);
    setSaveError(null);
  }

  function handleNodeDragStart(nodeId: NodeId, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    const originX = nodePositions[nodeId].x;
    const originY = nodePositions[nodeId].y;

    dragRef.current = {
      nodeId,
      startX,
      startY,
      originX,
      originY,
      moved: false,
    };
    setDraggingNodeId(nodeId);

    function onPointerMove(moveEvent: PointerEvent) {
      const drag = dragRef.current;

      if (!drag || drag.nodeId !== nodeId) {
        return;
      }

      const dx = (moveEvent.clientX - startX) / zoom;
      const dy = (moveEvent.clientY - startY) / zoom;

      if (!drag.moved && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
        drag.moved = true;
      }

      setNodePositions((current) => ({
        ...current,
        [nodeId]: {
          x: originX + dx,
          y: originY + dy,
        },
      }));
    }

    function onPointerUp() {
      if (dragRef.current?.moved) {
        suppressNodeClickRef.current = true;
      }

      dragRef.current = null;
      setDraggingNodeId(null);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function handleNodeSelect(nodeId: NodeId) {
    if (suppressNodeClickRef.current) {
      suppressNodeClickRef.current = false;
      return;
    }

    setActiveNode(nodeId);
  }

  function handleViewportPanStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest("[data-automation-node]")) {
      return;
    }

    if (target.closest("[data-automation-inspector]")) {
      return;
    }

    if (target.closest("[data-automation-token-rail]")) {
      return;
    }

    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    const originX = panOffset.x;
    const originY = panOffset.y;

    panRef.current = {
      startX,
      startY,
      originX,
      originY,
    };
    setIsPanning(true);

    function onPointerMove(moveEvent: PointerEvent) {
      const pan = panRef.current;

      if (!pan) {
        return;
      }

      setPanOffset({
        x: originX + (moveEvent.clientX - startX),
        y: originY + (moveEvent.clientY - startY),
      });
    }

    function onPointerUp() {
      panRef.current = null;
      setIsPanning(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function selectRule(ruleId: string) {
    setSelectedRuleId(ruleId);
    setComposeMode(false);
    setSaveMessage(null);
    setSaveError(null);
  }

  function applyRecipe(recipe: SuccessRecipe) {
    setSelectedRuleId("new");
    setComposeMode(true);
    setBuilder(applySuccessRecipe(recipe, registry));
    setActiveNode("trigger");
  }

  function handleBlueprintSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!prompt.trim()) {
      return;
    }

    const normalized = prompt.trim().toLowerCase();

    if (normalized.includes("task")) {
      setBuilder((current) => ({ ...current, actionKey: "create_crm_task" }));
      setActiveNode("action");
    } else if (normalized.includes("office") || normalized.includes("notify")) {
      setBuilder((current) => ({ ...current, actionKey: "notify_office" }));
      setActiveNode("action");
    } else if (normalized.includes("sms") || normalized.includes("review")) {
      setBuilder((current) => ({
        ...current,
        actionKey: normalized.includes("review")
          ? "send_review_link_from_approved_template"
          : "send_sms_from_approved_template",
      }));
      setActiveNode("action");
    }

    setBlueprintNote("Local visual preview only — changes are not saved until you use Save active rule.");
    setPrompt("");
  }

  async function handleSaveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    try {
      const created = await automationFetch<AutomationRule>("/api/automations/rules", {
        method: "POST",
        body: JSON.stringify(rulePayload),
      });
      setSaveMessage("Rule saved and activated after server validation.");
      await loadRules();

      if (created?.id) {
        setSelectedRuleId(created.id);
        setComposeMode(false);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Automation could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function disableRule(ruleId: string) {
    if (!canManage) {
      return;
    }

    setBusyRuleId(ruleId);
    setListMessage(null);
    setRulesError(null);

    try {
      await automationFetch(`/api/automations/rules/${ruleId}/disable`, { method: "POST" });
      setListMessage("Automation rule disabled.");
      await loadRules();
    } catch (error) {
      setRulesError(error instanceof Error ? error.message : "Automation rule could not be disabled.");
    } finally {
      setBusyRuleId(null);
    }
  }

  async function deleteRule(ruleId: string) {
    if (!canManage) {
      return;
    }

    setBusyRuleId(ruleId);
    setListMessage(null);
    setRulesError(null);

    try {
      await automationFetch(`/api/automations/rules/${ruleId}`, { method: "DELETE" });
      setListMessage("Automation rule deleted.");

      if (selectedRuleId === ruleId) {
        startNewWorkflow();
      }

      await loadRules();
    } catch (error) {
      setRulesError(error instanceof Error ? error.message : "Automation rule could not be deleted.");
    } finally {
      setBusyRuleId(null);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(229,231,235,0.14)_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-950/20 via-transparent to-cyan-950/20" />

      <div className="relative z-10 flex min-h-[calc(100vh-4rem)] flex-col">
        <div className="border-b border-white/10 bg-zinc-950/80 px-4 py-4 backdrop-blur-md lg:px-6">
          <div className="mx-auto flex max-w-[96rem] flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-300">
                <Workflow className="h-3.5 w-3.5" />
                CRM operational automations
              </p>
              <h1 className="mt-2 font-[family:var(--font-flat-display)] text-3xl tracking-tight text-white sm:text-4xl">
                AI Workflow Automation Command Center
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-400">
                Build rule-based workflows for follow-ups, reminders, and customer communication. Distinct from{" "}
                <Link href="/marketing/automations" className="font-medium text-cyan-300 underline-offset-2 hover:underline">
                  Growth Center Automations
                </Link>
                , which handle opportunity-linked marketing drafts only.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/marketing/automations"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/80 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-white/20"
              >
                <Sparkles className="h-4 w-4 text-fuchsia-400" />
                Growth Center
              </Link>
              {canManage ? (
                <button
                  type="button"
                  onClick={startNewWorkflow}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100"
                >
                  <Plus className="h-4 w-4" />
                  New workflow
                </button>
              ) : null}
            </div>
          </div>

          <div className="mx-auto mt-4 grid max-w-[96rem] gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Active rules", value: activeCount, helper: "enabled + active status" },
              { label: "Disabled rules", value: disabledCount, helper: "disabled or paused" },
              { label: "Total rules", value: rules.length, helper: "organization rule library" },
              { label: "Registry triggers", value: registry.triggers.length, helper: "builder-options triggers" },
            ].map((metric) => (
              <article key={metric.label} className="rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{metric.label}</p>
                <p className="mt-1 font-[family:var(--font-geist-mono)] text-2xl font-semibold text-white">{metric.value}</p>
                <p className="mt-1 text-[11px] text-zinc-500">{metric.helper}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="relative flex flex-1 flex-col xl:flex-row">
          <aside className="w-full shrink-0 border-b border-white/10 bg-zinc-950/85 p-4 backdrop-blur-md xl:w-[320px] xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Workflow library</p>
                <h2 className="mt-1 text-sm font-semibold text-zinc-100">Saved CRM rules</h2>
              </div>
              <button
                type="button"
                onClick={() => void loadRules()}
                className="rounded-lg border border-white/10 p-2 text-zinc-400 transition hover:bg-white/5 hover:text-white"
                title="Refresh rules"
              >
                <RefreshCw className={`h-4 w-4 ${rulesLoading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {rulesError ? (
              <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{rulesError}</p>
            ) : null}

            {listMessage ? (
              <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{listMessage}</p>
            ) : null}

            <div className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto xl:max-h-[calc(100vh-18rem)]">
              {rulesLoading ? (
                <p className="text-sm text-zinc-500">Loading rules...</p>
              ) : null}

              {!rulesLoading && rules.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-zinc-400">
                  No saved rules yet. Create a workflow to populate this library.
                </p>
              ) : null}

              {rules.map((rule) => {
                const isActive = selectedRuleId === rule.id;

                return (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => selectRule(rule.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${isActive ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/10 bg-black/20 hover:border-white/20"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-zinc-100">{rule.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${rule.enabled && rule.status === "active" ? "bg-emerald-400/15 text-emerald-300" : "bg-zinc-700 text-zinc-300"}`}>
                        {rule.status}
                      </span>
                    </div>
                    <p className="mt-2 font-[family:var(--font-geist-mono)] text-[10px] text-zinc-500">
                      {readTriggerKey(rule)} → {readActionKey(rule)}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      v{rule.rule_version} · {rule.mode} · {formatRuleDate(rule.updated_at)}
                    </p>

                    {canManage ? (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void disableRule(rule.id);
                          }}
                          disabled={busyRuleId === rule.id}
                          className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:bg-white/5 disabled:opacity-60"
                        >
                          Disable
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteRule(rule.id);
                          }}
                          disabled={busyRuleId === rule.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-100 disabled:opacity-60"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {registry.successRecipes?.length ? (
              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Starter recipes</p>
                <div className="mt-2 space-y-2">
                  {registry.successRecipes.map((recipe) => (
                    <button
                      key={recipe.templateKey}
                      type="button"
                      onClick={() => applyRecipe(recipe)}
                      disabled={!canManage}
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left text-xs text-zinc-300 transition hover:border-violet-400/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <p className="font-semibold text-zinc-100">{recipe.title}</p>
                      <p className="mt-1 font-[family:var(--font-geist-mono)] text-[10px] text-zinc-500">{recipe.triggerKey}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

          <div className="relative min-h-[520px] flex-1 overflow-hidden">
            <div className="absolute left-4 right-4 top-4 z-20 flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="min-w-[260px] rounded-2xl border border-white/10 bg-zinc-900/85 px-4 py-3 shadow-2xl backdrop-blur-md">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                  Live rule selector
                </div>
                <div className="relative">
                  <select
                    value={selectedRuleId}
                    onChange={(event) => {
                      const value = event.target.value;

                      if (value === "new") {
                        startNewWorkflow();
                        return;
                      }

                      selectRule(value);
                    }}
                    className="w-full appearance-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-semibold text-zinc-100 outline-none focus:border-cyan-500/50"
                  >
                    <option value="new" className="bg-zinc-950">New workflow draft</option>
                    {rules.map((rule) => (
                      <option key={rule.id} value={rule.id} className="bg-zinc-950">
                        {rule.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-zinc-500" />
                </div>
              </div>

              <form onSubmit={handleBlueprintSubmit} className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/85 px-4 py-3 shadow-2xl backdrop-blur-md">
                <Sparkles className="h-5 w-5 shrink-0 text-fuchsia-400" />
                <input
                  type="text"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Local blueprint hint only — e.g. switch action to CRM task..."
                  className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                  disabled={!canManage}
                />
                <button
                  type="submit"
                  disabled={!canManage}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Bot className="h-3.5 w-3.5" />
                  Generate Blueprint
                </button>
              </form>

              <div className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-zinc-900/85 p-1.5 shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setZoom(Math.min(zoom + 0.1, 1.3))} className="rounded-xl p-2 text-zinc-400 transition hover:bg-white/5 hover:text-white">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setZoom(Math.max(zoom - 0.1, 0.7))} className="rounded-xl p-2 text-zinc-400 transition hover:bg-white/5 hover:text-white">
                    <Minimize2 className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-2 font-[family:var(--font-geist-mono)] text-[10px] text-zinc-500">{Math.round(zoom * 100)}%</span>
                </div>
                <span className="px-2 text-[10px] text-zinc-600">Drag nodes to move · drag empty canvas to pan</span>
              </div>
            </div>

            {blueprintNote ? (
              <p className="absolute left-4 right-4 top-[5.5rem] z-20 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-xs text-fuchsia-100">
                {blueprintNote}
              </p>
            ) : null}

            <div
              className={`absolute inset-0 touch-none pt-28 ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
              onPointerDown={handleViewportPanStart}
            >
              <div
                className="relative min-h-[560px] w-full origin-top-left touch-none"
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                  transformOrigin: "0 0",
                }}
              >
                <svg className="pointer-events-none absolute inset-0 h-full w-full min-h-[560px] min-w-[980px]">
                  <defs>
                    <marker id="automation-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 1 L 10 5 L 0 9 z" fill="#71717a" />
                    </marker>
                  </defs>
                  <path d={connectorPaths.triggerToCondition} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="4 4" markerEnd="url(#automation-arrow)" />
                  <path d={connectorPaths.conditionToAction} fill="none" stroke="#f59e0b" strokeWidth="2" markerEnd="url(#automation-arrow)" />
                  <path d={connectorPaths.conditionToDelay} fill="none" stroke="#52525b" strokeWidth="2" markerEnd="url(#automation-arrow)" />
                  <path d={connectorPaths.delayToAction} fill="none" stroke="#06b6d4" strokeWidth="2" markerEnd="url(#automation-arrow)" />
                </svg>

                {nodes.map((node) => {
                  const isSelected = activeNode === node.id;

                  return (
                    <article
                      key={node.id}
                      data-automation-node
                      style={{ left: node.x, top: node.y }}
                      onPointerDown={(event) => handleNodeDragStart(node.id, event)}
                      onClick={() => handleNodeSelect(node.id)}
                      className={`absolute w-72 touch-none select-none rounded-2xl border bg-zinc-950/90 p-4 shadow-2xl backdrop-blur-md ${accentClass(node.accent)} ${isSelected ? "ring-2 ring-white/40" : ""} ${draggingNodeId === node.id ? "cursor-grabbing" : "cursor-grab"}`}
                    >
                      <div className="flex items-center justify-between border-b border-white/5 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-white/5 p-1 text-zinc-400">
                            <NodeIcon type={node.type} />
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{node.title}</span>
                        </div>
                        <div className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-emerald-400" : "bg-white/30"}`} />
                      </div>
                      <div className="mt-3 break-all rounded-lg border border-white/5 bg-black/40 p-2.5 font-[family:var(--font-geist-mono)] text-[11px] leading-relaxed text-zinc-200">
                        {node.code}
                      </div>
                      <div className="mt-2 text-[10px] leading-relaxed text-zinc-500">{node.helper}</div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="pointer-events-none absolute right-4 top-28 z-30 flex w-[min(400px,calc(100%-2rem))] max-h-[calc(100%-8rem)] flex-col gap-3 overflow-y-auto pb-4">
              <form
                onSubmit={handleSaveRule}
                data-automation-inspector
                onPointerDown={stopCanvasPointer}
                className="pointer-events-auto rounded-2xl border border-white/10 bg-zinc-950/90 p-4 shadow-2xl backdrop-blur-md"
              >
                <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Workflow className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="text-xs font-semibold text-zinc-200">Node Inspector</span>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${nodeBadgeClass(activeNode)}`}>
                    <NodeIcon type={activeNode} />
                    {activeNode}
                  </span>
                </div>

                <div className="mt-3 space-y-3">
                  {activeNode === "trigger" ? (
                    <>
                      <div>
                        <label className="font-[family:var(--font-geist-mono)] text-[10px] uppercase tracking-wider text-zinc-500">Workflow name</label>
                        <input
                          type="text"
                          value={builder.name}
                          onChange={(event) => setBuilder((current) => ({ ...current, name: event.target.value }))}
                          readOnly={inspectorReadOnly}
                          className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-zinc-500 disabled:opacity-70"
                        />
                      </div>
                      <div>
                        <label className="font-[family:var(--font-geist-mono)] text-[10px] uppercase tracking-wider text-zinc-500">Trigger</label>
                        {inspectorReadOnly ? (
                          <input readOnly value={builder.triggerKey} className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-[family:var(--font-geist-mono)] text-xs text-zinc-200" />
                        ) : (
                          <div className="mt-1">
                            <AutomationSentenceSegment
                              variant="dark"
                              label="Trigger"
                              value={builder.triggerKey}
                              options={registry.triggers.map((option) => ({ key: option.key, label: option.label }))}
                              onChange={(nextValue) => {
                                const nextTrigger = registry.triggers.find((option) => option.key === nextValue) ?? selectedTrigger;
                                const nextFields = registry.conditionFieldsByEntity[nextTrigger.entityType] ?? [];
                                const nextAllowedActions = registry.allowedActionsByTriggerFamily[nextTrigger.family] ?? [];
                                setBuilder((current) => ({
                                  ...current,
                                  triggerKey: nextTrigger.key,
                                  conditionField: nextFields[0] ?? current.conditionField,
                                  actionKey: nextAllowedActions[0] ?? current.actionKey,
                                }));
                              }}
                            />
                          </div>
                        )}
                        <p className="mt-1.5 font-[family:var(--font-geist-mono)] text-[10px] text-zinc-500">{builder.triggerKey}</p>
                      </div>
                    </>
                  ) : null}

                  {activeNode === "condition" ? (
                    <>
                      <div>
                        <label className="font-[family:var(--font-geist-mono)] text-[10px] uppercase tracking-wider text-zinc-500">Condition</label>
                        {inspectorReadOnly ? (
                          <input readOnly value={conditionKeyDisplay} className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-[family:var(--font-geist-mono)] text-xs text-zinc-200" />
                        ) : (
                          <div className="mt-1">
                            <AutomationSentenceSegment
                              variant="dark"
                              label="Condition"
                              value={builder.conditionField}
                              options={conditionList.map((option) => ({ key: option.field, label: option.label }))}
                              onChange={(value) => setBuilder((current) => ({ ...current, conditionField: value }))}
                            />
                          </div>
                        )}
                        <p className="mt-1.5 font-[family:var(--font-geist-mono)] text-[10px] text-zinc-500">{conditionKeyDisplay}</p>
                      </div>
                      <p className="rounded-lg border border-white/5 bg-black/30 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-400">{conditionDisplay}</p>
                    </>
                  ) : null}

                  {activeNode === "delay" ? (
                    <>
                      <div>
                        <label className="font-[family:var(--font-geist-mono)] text-[10px] uppercase tracking-wider text-zinc-500">Delay / timing</label>
                        {inspectorReadOnly ? (
                          <input readOnly value={delayKeyDisplay} className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-[family:var(--font-geist-mono)] text-xs text-zinc-200" />
                        ) : (
                          <div className="mt-1">
                            <AutomationSentenceSegment
                              variant="dark"
                              label="Timing"
                              value={builder.timingMode}
                              options={timingOptions}
                              onChange={(value) => setBuilder((current) => ({ ...current, timingMode: value }))}
                            />
                          </div>
                        )}
                        <p className="mt-1.5 font-[family:var(--font-geist-mono)] text-[10px] text-zinc-500">{delayKeyDisplay}</p>
                      </div>
                      <p className="rounded-lg border border-white/5 bg-black/30 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-400">{delayLabel}</p>
                    </>
                  ) : null}

                  {activeNode === "action" ? (
                    <>
                      <div>
                        <label className="font-[family:var(--font-geist-mono)] text-[10px] uppercase tracking-wider text-zinc-500">Action</label>
                        {inspectorReadOnly ? (
                          <input readOnly value={builder.actionKey} className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-[family:var(--font-geist-mono)] text-xs text-zinc-200" />
                        ) : (
                          <div className="mt-1">
                            <AutomationSentenceSegment
                              variant="dark"
                              label="Action"
                              value={builder.actionKey}
                              options={actionOptions.map((option) => ({ key: option.key, label: option.label }))}
                              onChange={(value) => setBuilder((current) => ({ ...current, actionKey: value }))}
                            />
                          </div>
                        )}
                        <p className="mt-1.5 font-[family:var(--font-geist-mono)] text-[10px] text-zinc-500">{builder.actionKey}</p>
                      </div>

                      {selectedAction.requiresApprovedTemplate ? (
                        <>
                          <div>
                            <label className="font-[family:var(--font-geist-mono)] text-[10px] uppercase tracking-wider text-zinc-500">Approved template key</label>
                            <input
                              type="text"
                              value={builder.templateKey}
                              onChange={(event) => setBuilder((current) => ({ ...current, templateKey: event.target.value }))}
                              readOnly={inspectorReadOnly}
                              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-[family:var(--font-geist-mono)] text-xs text-zinc-200 outline-none focus:border-emerald-500/60"
                            />
                          </div>
                          <div>
                            <label className="font-[family:var(--font-geist-mono)] text-[10px] uppercase tracking-wider text-zinc-500">Message template body</label>
                            <textarea
                              value={builder.templateBody}
                              onChange={(event) => setBuilder((current) => ({ ...current, templateBody: event.target.value }))}
                              readOnly={inspectorReadOnly}
                              rows={3}
                              className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs leading-relaxed text-zinc-200 outline-none focus:border-emerald-500/60"
                            />
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>

                <div className="mt-3 rounded-lg border border-white/5 bg-black/30 px-2.5 py-2">
                  <div className="font-[family:var(--font-geist-mono)] text-[10px] text-zinc-400">{activeNodeData?.code}</div>
                  <div className="mt-0.5 text-[10px] text-zinc-500">{activeNodeData?.helper}</div>
                </div>

                <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-[11px] text-zinc-500">
                  <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
                  <span>
                    {composeMode && canManage
                      ? "Create mode uses the existing POST /api/automations/rules payload. Saved rules become active after server validation."
                      : "Inspect mode hydrates from the selected saved rule. Rule updates via PUT are not wired in this slice."}
                  </span>
                </div>

                {saveMessage ? (
                  <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{saveMessage}</p>
                ) : null}

                {saveError ? (
                  <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{saveError}</p>
                ) : null}

                {canManage && composeMode ? (
                  <button
                    type="submit"
                    disabled={saving}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Save active rule
                  </button>
                ) : null}

                {!canManage ? (
                  <p className="mt-4 text-xs text-zinc-500">
                    Read-only workspace{sessionRole ? ` (${sessionRole})` : ""}. Rule changes require automations.manage permission.
                  </p>
                ) : null}
              </form>

              {activeNode === "action" && selectedAction.requiresApprovedTemplate ? (
                <div
                  data-automation-token-rail
                  onPointerDown={stopCanvasPointer}
                  className="pointer-events-auto"
                >
                  <TokenSidebar
                    variant="dark"
                    tokens={tokens}
                    onInsert={(token) => {
                      if (inspectorReadOnly) {
                        return;
                      }

                      setBuilder((current) => ({
                        ...current,
                        templateBody: `${current.templateBody}${current.templateBody.endsWith(" ") ? "" : " "}${token}`,
                      }));
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegacyAutomationsPageContent({ sessionRole, permissions }: AutomationWorkflowWorkspaceProps) {
  void sessionRole;
  void permissions;

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="theme-surface-modal overflow-hidden rounded-[34px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-raised)] p-7 sm:p-8">
          <h1 className="font-[family:var(--font-flat-display)] text-4xl tracking-tight">CRM automations</h1>
          <p className="mt-4 text-sm text-[color:var(--sem-text-secondary)]">Legacy automation workspace.</p>
        </section>
        <section id="custom-builder" className="theme-surface-modal rounded-[30px] border p-6">
          <LegacySentenceBuilder />
        </section>
        <LegacyAutomationRuleList />
      </div>
    </main>
  );
}

export function AutomationWorkflowWorkspace(props: AutomationWorkflowWorkspaceProps) {
  if (SHOW_LEGACY_AUTOMATIONS) {
    return <LegacyAutomationsPageContent {...props} />;
  }

  return <AutomationWorkflowCanvas {...props} />;
}

export { AutomationWorkflowCanvas };
