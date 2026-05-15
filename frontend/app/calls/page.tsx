import Link from "next/link";
import { ArrowRight, PhoneCall } from "lucide-react";

import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerRoles } from "@/lib/auth/server-session";
import { formatCallSourceLabel, formatVoicemailStatusLabel } from "@/lib/crm/display";
import CallbackTaskControl, { type CallbackTaskAssigneeOption, type CallbackTaskItem } from "./callback-task-control";
import CallRowActions from "./call-row-actions";
import QueueCallbackRequestControl from "./queue-callback-request-control";

type SearchParam = string | string[] | undefined;

const CALL_LIMIT_OPTIONS = [10, 15, 20, 25, 30, 50, 75, 100] as const;

type RecentCallListItem = {
  callbackTasks: CallbackTaskItem[];
  missedCallSms: {
    deliveryStatus: string;
    renderedMessage: string | null;
    provider: string;
    providerMessageId: string | null;
    cooldownApplied: boolean;
    errorCode: string | null;
    errorMessage: string | null;
    createdAt: string;
    sentAt: string | null;
  } | null;
  id: string;
  provider: string;
  providerEventId: string;
  providerCallId: string | null;
  providerConnectionId: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  source: string;
  campaignName: string | null;
  inboundOwnedPhoneNumberId: string | null;
  inboundOwnedPhoneNumberLabel: string | null;
  inboundMarketKey: string | null;
  inboundMarketLabel: string | null;
  callStatus: string;
  processingStatus: string;
  businessHoursStatus: string | null;
  callFlowAction: string | null;
  callFlowRouteTarget: string | null;
  selectedServiceType: string | null;
  selectedIvrDigit: string | null;
  ivrStatus: string | null;
  routeExecutionStatus: string | null;
  routeExecutionDetail: string | null;
  whisperText: string | null;
  whisperStatus: string | null;
  queueStatus: string | null;
  queuePosition: number | null;
  queueEnteredAt: string | null;
  queueExitedAt: string | null;
  queueWaitSeconds: number | null;
  queueCallbackRequested: boolean;
  voicemailTranscription: string | null;
  aiSummary: string | null;
  aiSentiment: string | null;
  aiStatus: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  aiEnrichedAt: string | null;
  matchedClientId: string | null;
  matchedLeadId: string | null;
  matchedClientDisplayName: string | null;
  recordingUrl: string | null;
  providerRecordingId: string | null;
  recordingStatus: string | null;
  voicemailUrl: string | null;
  voicemailStatus: string | null;
  durationSeconds: number | null;
  callStartedAt: string | null;
  callAnsweredAt: string | null;
  callEndedAt: string | null;
  createdAt: string;
};

type CallsPageContext = {
  searchParams: Promise<{
    q?: SearchParam;
    callStatus?: SearchParam;
    limit?: SearchParam;
  }>;
};

function firstValue(value: SearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatDuration(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return null;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function callStatusBadgeClass(status: string) {
  const normalized = status.trim().toLowerCase();

  if (normalized.includes("completed") || normalized.includes("answered")) {
    return "theme-status-success inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]";
  }

  if (normalized.includes("missed") || normalized.includes("failed") || normalized.includes("voicemail")) {
    return "theme-status-error inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]";
  }

  return "theme-status-warning inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]";
}

function formatRegistryLabel(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Phase 1.5B P4 — one-line hybrid CRM signal for Telnyx AI Assistant (audit detail in `ai_recommendation_runs`). */
function telnyxVoiceIntakeHybridHint(call: RecentCallListItem): string | null {
  const provider = (call.aiProvider ?? "").trim();
  if (provider !== "telnyx_ai_assistant") {
    return null;
  }
  if (call.matchedLeadId) {
    return "Hybrid CRM: lead linked from voice intake";
  }
  return "Hybrid CRM: no lead linked — review if intake ran";
}

function getInboundNumberLabel(call: RecentCallListItem) {
  return call.inboundOwnedPhoneNumberLabel ?? call.toNumber ?? "Unknown destination";
}

function getInboundMarketLabel(call: RecentCallListItem) {
  return call.inboundMarketLabel ?? formatRegistryLabel(call.inboundMarketKey);
}

function getInboundMappingState(call: RecentCallListItem) {
  if (call.inboundOwnedPhoneNumberId) {
    return {
      label: "Registry mapped",
      className: "border-[color:rgba(52,211,153,0.24)] bg-[color:rgba(6,78,59,0.22)] text-[color:#a7f3d0]",
    };
  }

  if (call.source === "unknown") {
    return {
      label: "Unmapped number",
      className: "border-[color:rgba(248,113,113,0.24)] bg-[color:rgba(127,29,29,0.24)] text-[color:#fecaca]",
    };
  }

  return {
    label: "Legacy DID map",
    className: "border-[color:rgba(251,191,36,0.24)] bg-[color:rgba(120,53,15,0.24)] text-[color:#fde68a]",
  };
}

function hasActiveCallbackTask(call: RecentCallListItem) {
  return call.callbackTasks.some((task) => task.status === "open" || task.status === "in_progress");
}

function hasCompletedCallbackTask(call: RecentCallListItem) {
  return call.callbackTasks.some((task) => task.status === "completed");
}

function hasResolvedCallbackTask(call: RecentCallListItem) {
  return !hasActiveCallbackTask(call) && hasCompletedCallbackTask(call);
}

function hasCallbackRecoveryInMotion(call: RecentCallListItem) {
  return !hasResolvedCallbackTask(call) && Boolean(
    call.queueStatus
    || call.queueCallbackRequested
    || hasActiveCallbackTask(call)
  );
}

function hasVoicemailContext(call: RecentCallListItem) {
  return Boolean(
    call.voicemailUrl
    || call.voicemailTranscription
    || (call.voicemailStatus && call.voicemailStatus !== "pending"),
  );
}

function hasNegativeSentiment(call: RecentCallListItem) {
  return (call.aiSentiment ?? "").trim().toLowerCase() === "negative";
}

function isMissedOutcome(call: RecentCallListItem) {
  const normalized = call.callStatus.trim().toLowerCase();
  return normalized.includes("missed") || normalized.includes("failed");
}

function isUnmatchedCall(call: RecentCallListItem) {
  return !call.matchedClientId && !call.matchedLeadId;
}

function needsImmediateRecovery(call: RecentCallListItem) {
  return isMissedOutcome(call) && !hasResolvedCallbackTask(call) && !hasCallbackRecoveryInMotion(call);
}

function shouldShowQueueCallbackControl(call: RecentCallListItem) {
  return !hasResolvedCallbackTask(call) && (
    needsImmediateRecovery(call)
    || Boolean(call.queueStatus)
    || call.queueCallbackRequested
    || call.callFlowAction === "dispatcher_queue"
    || call.callFlowAction === "callback_queue"
  );
}

function shouldShowCallbackTaskControl(call: RecentCallListItem) {
  return Boolean(
    call.callbackTasks.length > 0
    || needsImmediateRecovery(call)
    || call.queueStatus
    || call.queueCallbackRequested
    || call.callFlowAction === "dispatcher_queue"
    || call.callFlowAction === "callback_queue",
  );
}

function getOperationalState(call: RecentCallListItem) {
  if (hasCallbackRecoveryInMotion(call)) {
    return {
      label: "Recovery in motion",
      badgeClass: "inline-flex rounded-full border border-[color:rgba(212,175,55,0.32)] bg-[color:rgba(212,175,55,0.12)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--flat-gold)]",
      surfaceClass: "border-[color:rgba(212,175,55,0.18)] bg-[color:rgba(212,175,55,0.04)]",
      nextAction: "Check callback ownership.",
    };
  }

  if (hasResolvedCallbackTask(call)) {
    return {
      label: "Callback completed",
      badgeClass: "inline-flex rounded-full border border-[color:rgba(52,211,153,0.3)] bg-[color:rgba(6,78,59,0.28)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:#a7f3d0]",
      surfaceClass: "border-[color:rgba(52,211,153,0.14)] bg-[color:rgba(6,78,59,0.08)]",
      nextAction: "Callback resolved.",
    };
  }

  if (needsImmediateRecovery(call)) {
    return {
      label: "Needs callback",
      badgeClass: "inline-flex rounded-full border border-[color:rgba(248,113,113,0.35)] bg-[color:rgba(127,29,29,0.3)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:#fecaca]",
      surfaceClass: "border-[color:rgba(248,113,113,0.24)] bg-[color:rgba(120,18,18,0.08)]",
      nextAction: shouldShowQueueCallbackControl(call) ? "Queue callback first." : "Create callback task.",
    };
  }

  if (isUnmatchedCall(call) && (hasVoicemailContext(call) || hasNegativeSentiment(call) || isMissedOutcome(call))) {
    return {
      label: "Unmatched caller",
      badgeClass: "inline-flex rounded-full border border-[color:rgba(251,191,36,0.3)] bg-[color:rgba(120,53,15,0.28)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:#fde68a]",
      surfaceClass: "border-[color:rgba(251,191,36,0.18)] bg-[color:rgba(120,53,15,0.06)]",
      nextAction: "Confirm lead or customer path.",
    };
  }

  if (call.matchedClientId) {
    return {
      label: "Matched client",
      badgeClass: "inline-flex rounded-full border border-[color:rgba(52,211,153,0.3)] bg-[color:rgba(6,78,59,0.28)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:#a7f3d0]",
      surfaceClass: "border-[color:rgba(52,211,153,0.12)]",
      nextAction: "Review service history.",
    };
  }

  if (call.matchedLeadId) {
    return {
      label: "Lead match",
      badgeClass: "inline-flex rounded-full border border-[color:rgba(56,189,248,0.3)] bg-[color:rgba(12,74,110,0.3)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:#bae6fd]",
      surfaceClass: "border-[color:rgba(56,189,248,0.14)]",
      nextAction: "Open lead context.",
    };
  }

  if (hasVoicemailContext(call)) {
    return {
      label: "Voicemail ready",
      badgeClass: "inline-flex rounded-full border border-[color:rgba(192,132,252,0.3)] bg-[color:rgba(88,28,135,0.28)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:#e9d5ff]",
      surfaceClass: "border-[color:rgba(192,132,252,0.14)]",
      nextAction: "Review voicemail context.",
    };
  }

  return {
    label: "Monitor",
    badgeClass: "inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(255,255,255,0.03)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)]",
    surfaceClass: "border-[color:var(--cmp-border-subtle)]",
    nextAction: "Check next best action.",
  };
}

function getCallDisplayName(call: RecentCallListItem) {
  return call.matchedClientDisplayName ?? call.fromNumber ?? "Unknown caller";
}

function getCallSecondaryLine(call: RecentCallListItem) {
  if (call.matchedClientDisplayName) {
    return call.fromNumber ?? "Unknown number";
  }

  return call.toNumber ?? "Unknown destination";
}

const callsLedgerHeaderCellClass = "border-r border-[color:var(--border-subtle)] px-3 py-3 text-[11px] last:border-r-0";
const callsLedgerBodyCellClass = "border-r border-[color:var(--border-subtle)] px-3 py-3 align-top last:border-r-0";

export default async function CallsPage({ searchParams }: CallsPageContext) {
  const session = await requireServerRoles("/calls", ["owner", "office_admin", "dispatcher"]);

  const resolvedSearchParams = await searchParams;
  const canManageCrmFromCalls = session.profile?.role === "office_admin";
  const q = (firstValue(resolvedSearchParams.q) ?? "").trim();
  const callStatus = (firstValue(resolvedSearchParams.callStatus) ?? "").trim();
  const requestedLimit = Number(firstValue(resolvedSearchParams.limit) ?? "10");
  const limit = CALL_LIMIT_OPTIONS.includes(requestedLimit as (typeof CALL_LIMIT_OPTIONS)[number])
    ? requestedLimit
    : 10;

  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (callStatus) query.set("callStatus", callStatus);
  query.set("limit", String(limit));

  let calls: RecentCallListItem[] = [];
  let callbackTaskAssignees: CallbackTaskAssigneeOption[] = [];
  let errorMessage: string | null = null;

  try {
    [calls, callbackTaskAssignees] = await Promise.all([
      serverApiFetch<RecentCallListItem[]>(`/api/recent-calls${query.size ? `?${query.toString()}` : ""}`),
      serverApiFetch<CallbackTaskAssigneeOption[]>("/api/telephony/callback-task-assignees"),
    ]);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "The recent calls feed could not be loaded.";
  }

  const urgentRecoveryCount = calls.filter(needsImmediateRecovery).length;
  const callbacksInMotionCount = calls.filter((call) => call.queueCallbackRequested || hasActiveCallbackTask(call)).length;
  const voicemailReviewCount = calls.filter(hasVoicemailContext).length;
  const matchedOpportunityCount = calls.filter((call) => Boolean(call.matchedClientId || call.matchedLeadId)).length;
  const missedCallSmsCount = calls.filter((call) => Boolean(call.missedCallSms)).length;
  const unmatchedCallerCount = calls.filter(isUnmatchedCall).length;
  const negativeSentimentCount = calls.filter(hasNegativeSentiment).length;

  return (
    <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
      <section className="theme-surface-modal rounded-[32px] border border-[color:rgba(212,175,55,0.2)] bg-[linear-gradient(170deg,rgba(8,8,8,0.96),rgba(19,19,19,0.9))] p-6 shadow-[0_36px_120px_rgba(0,0,0,0.4)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--flat-gold)]">Calls</p>
            <h1 className="mt-3 flex items-center gap-3 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--text-primary)]">
              <PhoneCall className="h-8 w-8 text-[color:var(--flat-gold)]" />
              Recent Calls
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[color:var(--text-secondary)]">
              Revenue-recovery workspace for inbound call intake. Prioritize missed callers, confirm callback motion, and route the next best customer, lead, job, or SMS action without losing context.
            </p>
            <p className="mt-3 text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
              {urgentRecoveryCount} immediate recoveries • {callbackTaskAssignees.length} callback assignees available • {negativeSentimentCount} negative AI signals
            </p>
          </div>

          <Link
            href="/home"
            className="theme-btn-secondary inline-flex items-center gap-2 rounded-[18px] px-4 py-3 text-sm transition"
          >
            Back to home
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[24px] border border-[color:rgba(248,113,113,0.24)] bg-[color:rgba(120,18,18,0.08)] p-4">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[color:#fecaca]">Immediate Recovery</p>
            <p className="mt-3 text-3xl font-semibold text-[color:var(--text-primary)]">{urgentRecoveryCount}</p>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">Missed calls with no callback task in motion.</p>
          </article>
          <article className="rounded-[24px] border border-[color:rgba(212,175,55,0.18)] bg-[color:rgba(212,175,55,0.04)] p-4">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--flat-gold)]">Callbacks In Motion</p>
            <p className="mt-3 text-3xl font-semibold text-[color:var(--text-primary)]">{callbacksInMotionCount}</p>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">Recovery already queued or actively assigned.</p>
          </article>
          <article className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(255,255,255,0.03)] p-4">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">Context To Review</p>
            <p className="mt-3 text-3xl font-semibold text-[color:var(--text-primary)]">{voicemailReviewCount}</p>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">Voicemail-rich calls and {missedCallSmsCount} SMS touchpoints.</p>
          </article>
          <article className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(255,255,255,0.03)] p-4">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">Conversion Paths</p>
            <p className="mt-3 text-3xl font-semibold text-[color:var(--text-primary)]">{matchedOpportunityCount}</p>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">Matched opportunities with {unmatchedCallerCount} callers still needing intake.</p>
          </article>
        </div>

        {!canManageCrmFromCalls ? (
          <div className="mt-6 rounded-[24px] border border-[color:rgba(56,189,248,0.2)] bg-[color:rgba(12,74,110,0.14)] px-4 py-3 text-sm text-[color:#dbeafe]">
            CRM follow-up actions stay read-only for your role on this screen. Queue callbacks and SMS remain available, while customer, lead, and job actions require office admin access.
          </div>
        ) : null}

        <form className="mt-6 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(255,255,255,0.03)] p-4" method="GET">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">Working Set</p>
              <p className="mt-2 text-sm text-[color:var(--text-secondary)]">Filter the board before moving into ledger, hybrid, or grid review.</p>
            </div>
            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{calls.length} calls in view</p>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.62fr)_auto]">
            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Search</span>
              <input
                name="q"
                defaultValue={q}
                placeholder="Caller, destination, or matched client"
                className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm outline-none placeholder:text-[color:var(--text-muted)]"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Call Status</span>
              <input
                name="callStatus"
                defaultValue={callStatus}
                placeholder="missed, answered, voicemail"
                className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm outline-none placeholder:text-[color:var(--text-muted)]"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Window</span>
              <select
                name="limit"
                defaultValue={String(limit)}
                className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm outline-none"
              >
                {CALL_LIMIT_OPTIONS.map((value) => (
                  <option key={value} value={value}>{value} / page</option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="theme-btn-secondary inline-flex w-full items-center justify-center rounded-[18px] px-5 py-3 text-sm transition"
              >
                Filter
              </button>
            </div>
          </div>
        </form>

        {errorMessage ? (
          <div className="theme-alert-error mt-6 rounded-[20px] border px-4 py-3 text-sm">
            {errorMessage}
          </div>
        ) : calls.length === 0 ? (
          <div className="theme-control-surface-soft mt-6 rounded-[24px] border border-dashed px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
            No recent calls match the current search and filters.
          </div>
        ) : (
          <>
            <style
              dangerouslySetInnerHTML={{
                __html: `
                  .calls-display-panel { display: none; }
                  .calls-display-chip {
                    border-color: transparent;
                    color: var(--text-secondary);
                  }
                  .calls-display-chip:hover {
                    color: var(--text-primary);
                  }
                  #calls-display-ledger:checked ~ .calls-display-toolbar label[for="calls-display-ledger"],
                  #calls-display-hybrid:checked ~ .calls-display-toolbar label[for="calls-display-hybrid"],
                  #calls-display-grid:checked ~ .calls-display-toolbar label[for="calls-display-grid"] {
                    border-color: var(--cmp-border-subtle);
                    background: rgba(255,255,255,0.05);
                    color: var(--text-primary);
                    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
                  }
                  #calls-display-ledger:checked ~ .calls-display-panels .calls-display-panel-ledger,
                  #calls-display-hybrid:checked ~ .calls-display-panels .calls-display-panel-hybrid,
                  #calls-display-grid:checked ~ .calls-display-panels .calls-display-panel-grid {
                    display: block;
                  }
                `,
              }}
            />

            <input id="calls-display-ledger" className="sr-only" type="radio" name="calls-display-mode" defaultChecked />
            <input id="calls-display-hybrid" className="sr-only" type="radio" name="calls-display-mode" />
            <input id="calls-display-grid" className="sr-only" type="radio" name="calls-display-mode" />

            <div className="calls-display-toolbar mt-6 flex flex-col gap-4 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(255,255,255,0.03)] p-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">Display</p>
                <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                  Ledger for active queue work, Hybrid for callback context, and Grid for quick call review.
                </p>
              </div>
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">Calls display mode</legend>
                <label
                  htmlFor="calls-display-ledger"
                  className="calls-display-chip cursor-pointer rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] transition"
                >
                  Ledger
                </label>
                <label
                  htmlFor="calls-display-hybrid"
                  className="calls-display-chip cursor-pointer rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] transition"
                >
                  Hybrid
                </label>
                <label
                  htmlFor="calls-display-grid"
                  className="calls-display-chip cursor-pointer rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] transition"
                >
                  Grid
                </label>
              </fieldset>
            </div>

            <div className="calls-display-panels mt-6">
              <div className="calls-display-panel calls-display-panel-ledger">
                <div className="theme-control-surface overflow-x-auto rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(12,12,12,0.92))]">
                  <table className="min-w-full table-fixed text-left text-xs leading-4">
                    <colgroup>
                      <col className="w-[16%]" />
                      <col className="w-[20%]" />
                      <col className="w-[11%]" />
                      <col className="w-[10%]" />
                      <col className="w-[11%]" />
                      <col className="w-[10%]" />
                      <col className="w-[11%]" />
                      <col className="w-[11%]" />
                    </colgroup>
                    <thead className="border-b border-[color:var(--border-subtle)] bg-[color:rgba(255,255,255,0.03)] text-[color:var(--text-secondary)]">
                      <tr>
                        <th className={callsLedgerHeaderCellClass}>Actions</th>
                        <th className={callsLedgerHeaderCellClass}>Customer / Caller Name</th>
                        <th className={callsLedgerHeaderCellClass}>Call Status</th>
                        <th className={callsLedgerHeaderCellClass}>Phone</th>
                        <th className={callsLedgerHeaderCellClass}>Source</th>
                        <th className={callsLedgerHeaderCellClass}>Date / Time</th>
                        <th className={callsLedgerHeaderCellClass}>Duration</th>
                        <th className={callsLedgerHeaderCellClass}>Recovery Context</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calls.map((call) => {
                        const formattedCreatedAt = formatDateTime(call.createdAt);
                        const operationalState = getOperationalState(call);
                        const activeCallbackTask = hasActiveCallbackTask(call);
                        const resolvedCallbackTask = hasResolvedCallbackTask(call);
                        const recoveryInMotion = hasCallbackRecoveryInMotion(call);
                        const hasVoicemail = hasVoicemailContext(call);
                        const hasSmsContext = Boolean(call.missedCallSms);
                        const negativeSentiment = hasNegativeSentiment(call);
                        const showCallbackTaskControl = shouldShowCallbackTaskControl(call);
                        const showQueueCallbackControl = shouldShowQueueCallbackControl(call);
                        const inboundMappingState = getInboundMappingState(call);
                        const inboundNumberLabel = getInboundNumberLabel(call);
                        const inboundMarketLabel = getInboundMarketLabel(call);

                        const voiceHybridHint = telnyxVoiceIntakeHybridHint(call);

                        return (
                          <tr key={call.id} className={`border-b border-[color:var(--border-subtle)] transition last:border-b-0 ${operationalState.surfaceClass}`}>
                            <td className={`${callsLedgerBodyCellClass} align-middle`}>
                              <div className="flex min-w-[14rem] flex-col gap-2">
                                <div className="flex flex-nowrap items-center justify-center gap-2">
                                  {showQueueCallbackControl ? (
                                    <QueueCallbackRequestControl
                                      recentCallId={call.id}
                                      queueStatus={call.queueStatus}
                                      queueCallbackRequested={call.queueCallbackRequested}
                                      callbackTasks={call.callbackTasks}
                                    />
                                  ) : null}
                                  <CallRowActions
                                    canManageCrm={canManageCrmFromCalls}
                                    callId={call.id}
                                    matchedClientId={call.matchedClientId}
                                    matchedLeadId={call.matchedLeadId}
                                    fromNumber={call.fromNumber}
                                    source={call.source}
                                    createdAt={formattedCreatedAt}
                                    campaignName={call.campaignName}
                                  />
                                </div>
                                {showCallbackTaskControl ? (
                                  <CallbackTaskControl
                                    recentCallId={call.id}
                                    callbackTasks={call.callbackTasks}
                                    assignees={callbackTaskAssignees}
                                  />
                                ) : null}
                              </div>
                            </td>
                            <td className={`${callsLedgerBodyCellClass} text-[color:var(--text-primary)]`}>
                              <div className="min-w-0">
                                <div className="mb-2 flex flex-wrap gap-1.5">
                                  <span className={operationalState.badgeClass}>{operationalState.label}</span>
                                  {call.matchedClientId ? <span className="inline-flex rounded-full border border-[color:rgba(52,211,153,0.24)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[color:#a7f3d0]">Client</span> : null}
                                  {call.matchedLeadId ? <span className="inline-flex rounded-full border border-[color:rgba(56,189,248,0.24)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[color:#bae6fd]">Lead</span> : null}
                                  {hasVoicemail ? <span className="inline-flex rounded-full border border-[color:rgba(192,132,252,0.24)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[color:#e9d5ff]">Voicemail</span> : null}
                                  {hasSmsContext ? <span className="inline-flex rounded-full border border-[color:rgba(125,211,252,0.24)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[color:#bae6fd]">SMS touchpoint</span> : null}
                                </div>
                                {call.matchedClientId && call.matchedClientDisplayName && canManageCrmFromCalls ? (
                                  <Link
                                    href={`/customers/${call.matchedClientId}`}
                                    className="block truncate text-[color:var(--flat-gold)] transition hover:text-[color:var(--text-primary)]"
                                    title="Open matched customer"
                                  >
                                    {getCallDisplayName(call)}
                                  </Link>
                                ) : (
                                  <span className="block truncate font-medium">{getCallDisplayName(call)}</span>
                                )}
                                <div className="truncate text-[11px] text-[color:var(--text-secondary)]">{getCallSecondaryLine(call)}</div>
                              </div>
                            </td>
                            <td className={callsLedgerBodyCellClass}>
                              <span className={callStatusBadgeClass(call.callStatus)}>{call.callStatus}</span>
                            </td>
                            <td className={`${callsLedgerBodyCellClass} text-[color:var(--text-secondary)]`}>{call.fromNumber ?? "Unknown"}</td>
                            <td className={`${callsLedgerBodyCellClass} text-[color:var(--text-secondary)]`}>
                              <div>{formatCallSourceLabel(call.source)}</div>
                              {call.campaignName ? <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">{call.campaignName}</div> : null}
                              <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">{inboundNumberLabel}</div>
                              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.16em]">
                                {inboundMarketLabel ? (
                                  <span className="inline-flex rounded-full border border-[color:rgba(125,211,252,0.2)] bg-[color:rgba(12,74,110,0.2)] px-2 py-1 text-[color:#bae6fd]">
                                    {inboundMarketLabel}
                                  </span>
                                ) : null}
                                <span className={`inline-flex rounded-full border px-2 py-1 ${inboundMappingState.className}`}>
                                  {inboundMappingState.label}
                                </span>
                              </div>
                            </td>
                            <td className={`${callsLedgerBodyCellClass} text-[11px] text-[color:var(--text-secondary)]`}>{formattedCreatedAt}</td>
                            <td className={`${callsLedgerBodyCellClass} text-[color:var(--text-secondary)]`}>{formatDuration(call.durationSeconds) ?? "-"}</td>
                            <td className={`${callsLedgerBodyCellClass} text-[color:var(--text-secondary)]`}>
                              <div className="font-medium text-[color:var(--text-primary)]">{operationalState.nextAction}</div>
                              <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">{call.aiSummary ?? call.recordingStatus ?? "Pending review"}</div>
                              {voiceHybridHint ? (
                                <div className="mt-1 text-[11px] text-[color:var(--text-secondary)]">{voiceHybridHint}</div>
                              ) : null}
                              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                                {activeCallbackTask ? <span>Callback task active</span> : null}
                                {recoveryInMotion && call.queueCallbackRequested ? <span>Callback queued</span> : null}
                                {resolvedCallbackTask ? <span>Callback resolved</span> : null}
                                {negativeSentiment ? <span>Negative AI sentiment</span> : null}
                                {!activeCallbackTask && !recoveryInMotion ? <span>{call.aiSentiment ?? formatVoicemailStatusLabel(call.voicemailStatus ?? "pending")}</span> : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="calls-display-panel calls-display-panel-hybrid">
                <div className="space-y-3">
                  {calls.map((call) => {
                    const formattedCreatedAt = formatDateTime(call.createdAt);
                    const operationalState = getOperationalState(call);
                    const resolvedCallbackTask = hasResolvedCallbackTask(call);
                    const recoveryInMotion = hasCallbackRecoveryInMotion(call);
                    const hasVoicemail = hasVoicemailContext(call);
                    const hasSmsContext = Boolean(call.missedCallSms);
                    const negativeSentiment = hasNegativeSentiment(call);
                    const showCallbackTaskControl = shouldShowCallbackTaskControl(call);
                    const showQueueCallbackControl = shouldShowQueueCallbackControl(call);
                    const inboundMappingState = getInboundMappingState(call);
                    const inboundNumberLabel = getInboundNumberLabel(call);
                    const inboundMarketLabel = getInboundMarketLabel(call);

                    const voiceHybridHint = telnyxVoiceIntakeHybridHint(call);

                    return (
                      <article
                        key={call.id}
                        className={`theme-control-surface rounded-[28px] border bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(12,12,12,0.92))] px-5 py-4 shadow-[0_18px_36px_rgba(0,0,0,0.22)] ${operationalState.surfaceClass}`}
                      >
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_minmax(230px,0.8fr)] xl:items-start">
                          <div className="space-y-3">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-1">
                                {showQueueCallbackControl ? (
                                  <QueueCallbackRequestControl
                                    recentCallId={call.id}
                                    queueStatus={call.queueStatus}
                                    queueCallbackRequested={call.queueCallbackRequested}
                                    callbackTasks={call.callbackTasks}
                                  />
                                ) : null}
                                <CallRowActions
                                  canManageCrm={canManageCrmFromCalls}
                                  callId={call.id}
                                  matchedClientId={call.matchedClientId}
                                  matchedLeadId={call.matchedLeadId}
                                  fromNumber={call.fromNumber}
                                  source={call.source}
                                  createdAt={formattedCreatedAt}
                                  campaignName={call.campaignName}
                                />
                              </div>
                              {showCallbackTaskControl ? (
                                <CallbackTaskControl
                                  recentCallId={call.id}
                                  callbackTasks={call.callbackTasks}
                                  assignees={callbackTaskAssignees}
                                />
                              ) : null}
                            </div>
                            <div>
                              <span className={operationalState.badgeClass}>{operationalState.label}</span>
                              <p className="text-lg font-semibold text-[color:var(--text-primary)]">{getCallDisplayName(call)}</p>
                              <p className="mt-1 text-sm text-[color:var(--text-secondary)]">{getCallSecondaryLine(call)}</p>
                              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                                {hasVoicemail ? <span>Voicemail ready</span> : null}
                                {hasSmsContext ? <span>SMS touchpoint</span> : null}
                                {negativeSentiment ? <span>Negative AI sentiment</span> : null}
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 text-sm text-[color:var(--text-secondary)]">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Status</p>
                              <div className="mt-2">
                                <span className={callStatusBadgeClass(call.callStatus)}>{call.callStatus}</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Source</p>
                              <p className="mt-2">{formatCallSourceLabel(call.source)}</p>
                              <p className="mt-2 text-[color:var(--text-muted)]">{inboundNumberLabel}</p>
                              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.16em]">
                                {inboundMarketLabel ? (
                                  <span className="inline-flex rounded-full border border-[color:rgba(125,211,252,0.2)] bg-[color:rgba(12,74,110,0.2)] px-2 py-1 text-[color:#bae6fd]">
                                    {inboundMarketLabel}
                                  </span>
                                ) : null}
                                <span className={`inline-flex rounded-full border px-2 py-1 ${inboundMappingState.className}`}>
                                  {inboundMappingState.label}
                                </span>
                              </div>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Duration</p>
                              <p className="mt-2">{formatDuration(call.durationSeconds) ?? "-"}</p>
                            </div>
                          </div>

                          <div className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(255,255,255,0.02)] px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Context</p>
                            <div className="mt-3 grid gap-2">
                              <p>Time: {formattedCreatedAt}</p>
                              <p>Summary: {call.aiSummary ?? call.recordingStatus ?? "Pending review"}</p>
                              {voiceHybridHint ? <p className="text-[color:var(--text-secondary)]">{voiceHybridHint}</p> : null}
                              <p>Next action: {resolvedCallbackTask ? "Callback resolved." : recoveryInMotion && call.queueCallbackRequested ? "Callback queued" : operationalState.nextAction}</p>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>

              <div className="calls-display-panel calls-display-panel-grid">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {calls.map((call) => {
                    const formattedCreatedAt = formatDateTime(call.createdAt);
                    const operationalState = getOperationalState(call);
                    const resolvedCallbackTask = hasResolvedCallbackTask(call);
                    const recoveryInMotion = hasCallbackRecoveryInMotion(call);
                    const hasVoicemail = hasVoicemailContext(call);
                    const hasSmsContext = Boolean(call.missedCallSms);
                    const negativeSentiment = hasNegativeSentiment(call);
                    const showCallbackTaskControl = shouldShowCallbackTaskControl(call);
                    const showQueueCallbackControl = shouldShowQueueCallbackControl(call);
                    const inboundMappingState = getInboundMappingState(call);
                    const inboundNumberLabel = getInboundNumberLabel(call);
                    const inboundMarketLabel = getInboundMarketLabel(call);

                    const voiceHybridHint = telnyxVoiceIntakeHybridHint(call);

                    return (
                      <article
                        key={call.id}
                        className={`theme-control-surface flex h-full flex-col rounded-[28px] border bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(12,12,12,0.92))] p-5 shadow-[0_18px_36px_rgba(0,0,0,0.22)] ${operationalState.surfaceClass}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-1">
                              {showQueueCallbackControl ? (
                                <QueueCallbackRequestControl
                                  recentCallId={call.id}
                                  queueStatus={call.queueStatus}
                                  queueCallbackRequested={call.queueCallbackRequested}
                                  callbackTasks={call.callbackTasks}
                                />
                              ) : null}
                              <CallRowActions
                                canManageCrm={canManageCrmFromCalls}
                                callId={call.id}
                                matchedClientId={call.matchedClientId}
                                matchedLeadId={call.matchedLeadId}
                                fromNumber={call.fromNumber}
                                source={call.source}
                                createdAt={formattedCreatedAt}
                                campaignName={call.campaignName}
                              />
                            </div>
                            {showCallbackTaskControl ? (
                              <CallbackTaskControl
                                recentCallId={call.id}
                                callbackTasks={call.callbackTasks}
                                assignees={callbackTaskAssignees}
                              />
                            ) : null}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={operationalState.badgeClass}>{operationalState.label}</span>
                            <span className={callStatusBadgeClass(call.callStatus)}>{call.callStatus}</span>
                          </div>
                        </div>

                        <div className="mt-5">
                          <p className="text-xl font-semibold text-[color:var(--text-primary)]">{getCallDisplayName(call)}</p>
                          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{getCallSecondaryLine(call)}</p>
                          <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                            {hasVoicemail ? <span>Voicemail</span> : null}
                            {hasSmsContext ? <span>SMS touchpoint</span> : null}
                            {negativeSentiment ? <span>Negative AI</span> : null}
                          </div>
                        </div>

                        <div className="mt-5 grid gap-3 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(255,255,255,0.02)] px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                          <div className="flex items-center justify-between gap-3">
                            <span>Source</span>
                            <span className="text-[color:var(--text-primary)]">{formatCallSourceLabel(call.source)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Called Line</span>
                            <span className="text-right text-[color:var(--text-primary)]">{inboundNumberLabel}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Number Mapping</span>
                            <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${inboundMappingState.className}`}>
                              {inboundMappingState.label}
                            </span>
                          </div>
                          {inboundMarketLabel ? (
                            <div className="flex items-center justify-between gap-3">
                              <span>Market</span>
                              <span className="text-[color:var(--text-primary)]">{inboundMarketLabel}</span>
                            </div>
                          ) : null}
                          <div className="flex items-center justify-between gap-3">
                            <span>Duration</span>
                            <span className="text-[color:var(--text-primary)]">{formatDuration(call.durationSeconds) ?? "-"}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Time</span>
                            <span className="text-[color:var(--text-primary)]">{formattedCreatedAt}</span>
                          </div>
                        </div>

                        <div className="mt-5 border-t border-[color:var(--cmp-border-subtle)] pt-4 text-sm text-[color:var(--text-secondary)]">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Recovery Context</p>
                          <p className="mt-2 font-medium text-[color:var(--text-primary)]">{operationalState.nextAction}</p>
                          <p className="mt-2">{call.aiSummary ?? call.recordingStatus ?? "Pending review"}</p>
                          {voiceHybridHint ? <p className="mt-2 text-xs text-[color:var(--text-secondary)]">{voiceHybridHint}</p> : null}
                          <p className="mt-3 text-xs text-[color:var(--text-muted)]">{call.aiSentiment ?? (resolvedCallbackTask ? "Callback resolved" : recoveryInMotion && call.queueCallbackRequested ? "Callback queued" : "No follow-up flag")}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
