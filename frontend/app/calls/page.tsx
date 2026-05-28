import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Clock3,
  Headphones,
  MessageSquare,
  Mic2,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  ShieldCheck,
  UserRound,
  Voicemail,
} from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";
import { MetricTile } from "@/components/board/metric-tile";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerPermission } from "@/lib/auth/server-session";
import { formatCallSourceLabel, formatVoicemailStatusLabel } from "@/lib/crm/display";
import CallsCopilotSmsDraft from "./calls-copilot-sms-draft";
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
    page?: SearchParam;
    pageSize?: SearchParam;
    call?: SearchParam;
  }>;
};

/** Toggle legacy ledger / hybrid / grid views for fallback and QA. */
const SHOW_LEGACY_CALLS_VIEWS = false;

const callsPanelClass =
  "theme-surface-card rounded-[28px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] shadow-[0_18px_40px_color-mix(in_srgb,var(--sem-board-glow)_72%,transparent)] backdrop-blur-md";
const callsEyebrowClass = "text-[10px] uppercase tracking-[0.34em] text-[color:var(--sem-text-muted)]";

const CALL_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "missed", label: "Missed" },
  { value: "completed", label: "Completed" },
  { value: "answered", label: "Answered" },
  { value: "voicemail", label: "Voicemail" },
  { value: "failed", label: "Failed" },
] as const;

const CALL_PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;

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

function buildCallsQueryString(params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim()) {
      searchParams.set(key, value);
    }
  }

  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
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

function getBookShare(count: number, total: number) {
  if (total <= 0 || count <= 0) {
    return null;
  }

  return `${Math.round((count / total) * 100)}% of book`;
}

function getMovementHint(count: number, activeLabel: string, flatLabel = "Flat") {
  if (count <= 0) {
    return flatLabel;
  }

  return `▲ ${activeLabel}`;
}

function getLatestSignalAge(calls: RecentCallListItem[]) {
  if (calls.length === 0) {
    return null;
  }

  const latestMs = calls.reduce((latest, call) => {
    const parsed = new Date(call.createdAt).getTime();
    return Number.isFinite(parsed) && parsed > latest ? parsed : latest;
  }, 0);

  if (!latestMs) {
    return null;
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - latestMs) / 60_000));

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const hours = Math.floor(diffMinutes / 60);
  return `${hours}h ago`;
}

function getPressureSignal(call: RecentCallListItem) {
  if (needsImmediateRecovery(call)) {
    return {
      label: "High pressure",
      detail: "Missed — callback not in motion",
    };
  }

  if (hasNegativeSentiment(call)) {
    return {
      label: "Sentiment drag",
      detail: call.aiSentiment ?? "Negative AI read",
    };
  }

  if (hasCallbackRecoveryInMotion(call)) {
    return {
      label: "Recovery active",
      detail: call.queueCallbackRequested ? "Callback queued" : "Task in flight",
    };
  }

  if (isUnmatchedCall(call) && (hasVoicemailContext(call) || isMissedOutcome(call))) {
    return {
      label: "Intake gap",
      detail: "Unmatched caller needs routing",
    };
  }

  if (hasVoicemailContext(call)) {
    return {
      label: "Voicemail signal",
      detail: formatVoicemailStatusLabel(call.voicemailStatus ?? "ready"),
    };
  }

  if (call.matchedClientId || call.matchedLeadId) {
    return {
      label: "Matched flow",
      detail: call.matchedClientId ? "Client on file" : "Lead linked",
    };
  }

  return {
    label: "Monitor",
    detail: call.aiSentiment ?? call.aiSummary ?? "No pressure flag",
  };
}

function buildLiveTickerItems(params: {
  totalCount: number;
  urgentRecoveryCount: number;
  callbacksInMotionCount: number;
  negativeSentimentCount: number;
  unmatchedCallerCount: number;
  latestSignalAge: string | null;
}) {
  const items = [
    `Live Call Flow · ${params.totalCount} positions`,
    params.urgentRecoveryCount > 0
      ? `Pressure · ${params.urgentRecoveryCount} watchlist ${params.urgentRecoveryCount === 1 ? "slot" : "slots"}`
      : "Pressure · book clear",
    params.callbacksInMotionCount > 0
      ? `Recovery · ${params.callbacksInMotionCount} in motion`
      : "Recovery · idle",
    params.negativeSentimentCount > 0
      ? `Signal · ${params.negativeSentimentCount} negative reads`
      : "Signal · sentiment stable",
    params.unmatchedCallerCount > 0
      ? `Intake · ${params.unmatchedCallerCount} unmatched`
      : "Intake · matched",
    params.latestSignalAge ? `Last tick · ${params.latestSignalAge}` : "Last tick · awaiting feed",
  ];

  return items;
}

const callsLedgerHeaderCellClass = "border-r border-[color:var(--border-subtle)] px-3 py-3 text-[11px] font-medium uppercase tracking-[0.2em] last:border-r-0";
const callsLedgerNumericClass = "font-[family:var(--font-geist-mono)] tabular-nums tracking-tight";
const callsLedgerBodyCellClass = "border-r border-[color:var(--border-subtle)] px-3 py-3 align-top last:border-r-0";

const RECOVERY_QUEUE_TIER_LABELS = [
  "Missed / hot",
  "Voicemail with intent",
  "Matched customer",
  "Unknown caller",
  "Answered / completed",
] as const;

function hasVoicemailIntent(call: RecentCallListItem) {
  return Boolean(call.aiSummary || call.voicemailTranscription || call.selectedServiceType);
}

function getRecoveryQueuePriority(call: RecentCallListItem) {
  if (needsImmediateRecovery(call)) {
    return 0;
  }

  if (hasVoicemailContext(call) && hasVoicemailIntent(call)) {
    return 1;
  }

  if (call.matchedClientId || call.matchedLeadId) {
    return 2;
  }

  if (isUnmatchedCall(call)) {
    return 3;
  }

  return 4;
}

function sortRecoveryQueue(calls: RecentCallListItem[]) {
  return [...calls].sort((left, right) => {
    const priorityDelta = getRecoveryQueuePriority(left) - getRecoveryQueuePriority(right);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function isAiReviewCandidate(call: RecentCallListItem) {
  return Boolean(
    call.aiSummary
    || call.missedCallSms
    || (call.voicemailTranscription && !hasResolvedCallbackTask(call))
    || hasNegativeSentiment(call),
  );
}

function getCallAgeLabel(call: RecentCallListItem) {
  const parsed = new Date(call.createdAt).getTime();

  if (!Number.isFinite(parsed)) {
    return "—";
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - parsed) / 60_000));

  if (diffMinutes < 1) {
    return "now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const hours = Math.floor(diffMinutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

function getCallIntentLabel(call: RecentCallListItem) {
  return call.aiSummary
    ?? call.selectedServiceType
    ?? call.voicemailTranscription
    ?? formatCallSourceLabel(call.source);
}

function buildRecoveryScript(call: RecentCallListItem) {
  const name = getCallDisplayName(call);
  const intent = getCallIntentLabel(call);

  if (needsImmediateRecovery(call)) {
    return `Hi ${name.split(" ")[0]}, this is your service team. We missed your call about ${intent.toLowerCase()}. I can help get that scheduled — was this urgent or are you looking for something this week?`;
  }

  if (hasVoicemailContext(call)) {
    return `Hi ${name.split(" ")[0]}, thanks for the voicemail about ${intent.toLowerCase()}. I reviewed the message and wanted to follow up personally.`;
  }

  return `Hi ${name.split(" ")[0]}, following up on your recent call about ${intent.toLowerCase()}.`;
}

function countRecoveryLane(calls: RecentCallListItem[], matcher: (call: RecentCallListItem) => boolean) {
  return calls.filter(matcher).length;
}

type SelectedCallFocusPanelProps = {
  selectedCall: RecentCallListItem;
  canManageCrmFromCalls: boolean;
  callbackTaskAssignees: CallbackTaskAssigneeOption[];
  hasMessagingSendPermission: boolean;
  backHref?: string;
};

function SelectedCallFocusPanel({
  selectedCall,
  canManageCrmFromCalls,
  callbackTaskAssignees,
  hasMessagingSendPermission,
  backHref,
}: SelectedCallFocusPanelProps) {
  const formattedCreatedAt = formatDateTime(selectedCall.createdAt);
  const operationalState = getOperationalState(selectedCall);
  const pressureSignal = getPressureSignal(selectedCall);
  const resolvedCallbackTask = hasResolvedCallbackTask(selectedCall);
  const recoveryInMotion = hasCallbackRecoveryInMotion(selectedCall);
  const showCallbackTaskControl = shouldShowCallbackTaskControl(selectedCall);
  const showQueueCallbackControl = shouldShowQueueCallbackControl(selectedCall);
  const inboundMappingState = getInboundMappingState(selectedCall);
  const inboundNumberLabel = getInboundNumberLabel(selectedCall);
  const inboundMarketLabel = getInboundMarketLabel(selectedCall);
  const voiceHybridHint = telnyxVoiceIntakeHybridHint(selectedCall);

  return (
    <section className={`${callsPanelClass} p-5`}>
      {backHref ? (
        <Link href={backHref} className="mb-4 inline-flex items-center gap-2 text-sm text-[color:var(--sem-accent-primary)] lg:hidden">
          <ArrowRight className="h-4 w-4 rotate-180" />
          Back to queue
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={callsEyebrowClass}>Selected call</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">{getCallDisplayName(selectedCall)}</h2>
          <p className={`mt-1 text-sm text-[color:var(--sem-text-secondary)] ${callsLedgerNumericClass}`}>{selectedCall.fromNumber ?? "Unknown"} · {formattedCreatedAt}</p>
        </div>
        <span className={operationalState.badgeClass}>{operationalState.label}</span>
      </div>

      <div className="mt-5 space-y-4 rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Call intent</p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-primary)]">{getCallIntentLabel(selectedCall)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Callback urgency</p>
          <p className="mt-2 text-sm font-medium text-[color:var(--sem-text-primary)]">{pressureSignal.label}</p>
          <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">{pressureSignal.detail} · {getCallAgeLabel(selectedCall)} elapsed</p>
          <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">{operationalState.nextAction}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Opportunity</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedCall.matchedClientId ? <span className="theme-status-success inline-flex rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">Client match</span> : null}
            {selectedCall.matchedLeadId ? <span className="theme-status-warning inline-flex rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">Lead match</span> : null}
            {isUnmatchedCall(selectedCall) ? <span className="inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">Unmatched</span> : null}
            {inboundMarketLabel ? <span className="text-xs text-[color:var(--sem-text-secondary)]">{inboundMarketLabel}</span> : null}
          </div>
          <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">{inboundNumberLabel} · {formatCallSourceLabel(selectedCall.source)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">AI recommendation</p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            {selectedCall.aiSummary ?? selectedCall.voicemailTranscription ?? "No AI summary yet — operator review still required."}
          </p>
          {selectedCall.aiSentiment ? (
            <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">Sentiment: {selectedCall.aiSentiment}</p>
          ) : null}
          {voiceHybridHint ? <p className="mt-2 text-xs text-[color:var(--sem-text-secondary)]">{voiceHybridHint}</p> : null}
        </div>
      </div>

      <div className="mt-5 rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-4">
        <p className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Recovery script</p>
        <p className="mt-3 text-sm leading-7 text-[color:var(--sem-text-secondary)]">{buildRecoveryScript(selectedCall)}</p>
      </div>

      <div className="mt-5 border-t border-[color:var(--cmp-border-subtle)] pt-5">
        <p className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Operator actions</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {showQueueCallbackControl ? (
            <QueueCallbackRequestControl
              recentCallId={selectedCall.id}
              queueStatus={selectedCall.queueStatus}
              queueCallbackRequested={selectedCall.queueCallbackRequested}
              callbackTasks={selectedCall.callbackTasks}
            />
          ) : null}
          <CallRowActions
            canManageCrm={canManageCrmFromCalls}
            callId={selectedCall.id}
            matchedClientId={selectedCall.matchedClientId}
            matchedLeadId={selectedCall.matchedLeadId}
            fromNumber={selectedCall.fromNumber}
            source={selectedCall.source}
            createdAt={formattedCreatedAt}
            campaignName={selectedCall.campaignName}
          />
        </div>
        {showCallbackTaskControl ? (
          <div className="mt-3">
            <CallbackTaskControl
              recentCallId={selectedCall.id}
              callbackTasks={selectedCall.callbackTasks}
              assignees={callbackTaskAssignees}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-[22px] border border-dashed border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-panel)] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">AI workbench</p>
            <span className="inline-flex rounded-full border border-dashed border-[color:var(--cmp-border-accent)] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[color:var(--sem-text-secondary)]">
              Review required
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-[color:var(--sem-text-muted)]">
            AI assists operators. Nothing sends until a human reviews and approves.
          </p>
          <div className="mt-4 space-y-3">
            <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-3">
              <div className="flex items-start gap-3">
                <MessageSquare className="mt-0.5 h-4 w-4 text-[color:var(--sem-text-muted)]" />
                <div>
                  <p className="text-sm font-medium text-[color:var(--sem-text-primary)]">SMS draft review</p>
                  <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">Edit and approve before send.</p>
                </div>
              </div>
              <div className="mt-3">
                <CallsCopilotSmsDraft recentCallId={selectedCall.id} hasMessagingSendPermission={hasMessagingSendPermission} />
              </div>
            </div>
            <div className="rounded-[18px] border border-dashed border-[color:var(--cmp-border-subtle)] p-3 opacity-80">
              <div className="flex items-start gap-3">
                <Mic2 className="mt-0.5 h-4 w-4 text-[color:var(--sem-text-muted)]" />
                <div>
                  <p className="text-sm font-medium text-[color:var(--sem-text-primary)]">Voice intake</p>
                  <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">Future Telnyx assistant lane — operator supervises, no autonomous action.</p>
                </div>
              </div>
            </div>
            <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] p-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-[color:var(--sem-text-muted)]" />
                <div>
                  <p className="text-sm font-medium text-[color:var(--sem-text-primary)]">Outcome tracking</p>
                  <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">
                    {resolvedCallbackTask
                      ? "Callback resolved."
                      : recoveryInMotion && selectedCall.queueCallbackRequested
                        ? "Callback queued — awaiting completion."
                        : operationalState.nextAction}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">
                    Mapping: {inboundMappingState.label}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function CallsPage({ searchParams }: CallsPageContext) {
  const session = await requireServerPermission("/calls", "calls.view");

  const resolvedSearchParams = await searchParams;
  const callsRole = session.profile?.role;
  const canManageCrmFromCalls = callsRole === "owner" || callsRole === "office_admin";
  const q = (firstValue(resolvedSearchParams.q) ?? "").trim();
  const callStatus = (firstValue(resolvedSearchParams.callStatus) ?? "").trim();
  const selectedCallId = (firstValue(resolvedSearchParams.call) ?? "").trim();
  const requestedLimit = Number(firstValue(resolvedSearchParams.limit) ?? "100");
  const limit = CALL_LIMIT_OPTIONS.includes(requestedLimit as (typeof CALL_LIMIT_OPTIONS)[number])
    ? requestedLimit
    : 100;
  const pageValue = Number.parseInt((firstValue(resolvedSearchParams.page) ?? "1").trim(), 10);
  const pageSizeValue = Number.parseInt((firstValue(resolvedSearchParams.pageSize) ?? "10").trim(), 10);
  const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const pageSize = CALL_PAGE_SIZE_OPTIONS.includes(pageSizeValue as (typeof CALL_PAGE_SIZE_OPTIONS)[number])
    ? pageSizeValue
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
  const totalCount = calls.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedCalls = calls.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const sortedPagedCalls = sortRecoveryQueue(pagedCalls);
  const selectedCall = sortedPagedCalls.find((call) => call.id === selectedCallId) ?? sortedPagedCalls[0] ?? null;
  const aiReviewCount = calls.filter(isAiReviewCandidate).length;
  const paginationBase = {
    q: q || null,
    callStatus: callStatus || null,
    limit: String(limit),
    pageSize: String(pageSize),
    call: selectedCall?.id ?? null,
  };
  const previousPageHref = buildCallsQueryString({ ...paginationBase, page: String(Math.max(1, currentPage - 1)) });
  const nextPageHref = buildCallsQueryString({ ...paginationBase, page: String(Math.min(totalPages, currentPage + 1)) });
  const latestSignalAge = getLatestSignalAge(calls);
  const recoveryWatchlist = calls.filter(needsImmediateRecovery).slice(0, 6);
  const liveTickerItems = buildLiveTickerItems({
    totalCount,
    urgentRecoveryCount,
    callbacksInMotionCount,
    negativeSentimentCount,
    unmatchedCallerCount,
    latestSignalAge,
  });
  const urgentBookShare = getBookShare(urgentRecoveryCount, totalCount);
  const motionBookShare = getBookShare(callbacksInMotionCount, totalCount);
  const matchedBookShare = getBookShare(matchedOpportunityCount, totalCount);

  return (
    <BoardShell gridOpacity="subtle">
      <main className="mx-auto max-w-[1760px] px-5 py-6 pb-24 lg:px-8 lg:pb-8">
        <header className={`${callsPanelClass} px-6 py-5`}>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className={callsEyebrowClass}>Call Center · Revenue Recovery</p>
              <h1 className="mt-2 flex items-center gap-3 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] sm:text-5xl">
                <PhoneCall className="h-8 w-8 text-[color:var(--sem-accent-primary)]" />
                Recovery Command Desk
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">
                Missed revenue first, voicemail review, matched opportunities, and operator-approved AI drafts — without losing the action stack.
              </p>
              <p className={`mt-3 text-xs uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)] ${callsLedgerNumericClass}`}>
                {urgentRecoveryCount} hot · {callbacksInMotionCount} in motion · {voicemailReviewCount} voicemail · {totalCount} loaded
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-4 py-2 text-sm text-[color:var(--sem-text-secondary)]">
                <Headphones className="h-4 w-4" />
                Operator desk
              </span>
              <Link
                href="/home"
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] hover:text-[color:var(--sem-text-primary)]"
              >
                Back to home
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--cmp-border-subtle)] px-4 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-[color:var(--sem-text-secondary)]">Recovery tape</p>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--sem-text-muted)]">
                {latestSignalAge ? `Last signal ${latestSignalAge}` : "Awaiting feed"}
              </p>
            </div>
            <div className="overflow-x-auto px-4 py-3">
              <div className="flex min-w-max items-center gap-4 text-xs text-[color:var(--sem-text-secondary)]">
                {liveTickerItems.map((item, index) => (
                  <span key={item} className="inline-flex items-center gap-4 whitespace-nowrap">
                    {index > 0 ? <span aria-hidden="true" className="text-[color:var(--sem-text-muted)]">|</span> : null}
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </header>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            icon={PhoneMissed}
            label="Missed / hot"
            value={urgentRecoveryCount}
            helper={urgentBookShare ?? "No open missed pressure"}
          />
          <MetricTile
            icon={Clock3}
            label="Recovery in motion"
            value={callbacksInMotionCount}
            helper={motionBookShare ?? "Callback queue idle"}
          />
          <MetricTile
            icon={Voicemail}
            label="Voicemail review"
            value={voicemailReviewCount}
            helper={`${missedCallSmsCount} SMS touchpoints`}
          />
          <MetricTile
            icon={Bot}
            label="AI review queue"
            value={aiReviewCount}
            helper="Operator approval required"
          />
        </div>

        {!canManageCrmFromCalls ? (
          <div className="theme-alert-info mt-5 rounded-[22px] border px-4 py-3 text-sm">
            CRM follow-up actions stay read-only for your role on this screen. Queue callbacks and SMS remain available, while customer, lead, and job actions require office admin access.
          </div>
        ) : null}

        <form className={`${callsPanelClass} mt-5 p-4`} method="GET">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={callsEyebrowClass}>Queue filter</p>
              <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">Narrow the recovery queue before selecting the next caller.</p>
            </div>
            <p className={`text-xs uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)] ${callsLedgerNumericClass}`}>{calls.length} in view</p>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.62fr)_auto]">
            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">Caller scan</span>
              <input
                name="q"
                defaultValue={q}
                placeholder="Caller, destination, or matched client"
                className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm outline-none placeholder:text-[color:var(--sem-text-muted)]"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">State filter</span>
              <select
                name="callStatus"
                defaultValue={callStatus}
                className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm outline-none"
              >
                {CALL_STATUS_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">Page depth</span>
              <select
                name="pageSize"
                defaultValue={String(pageSize)}
                className="theme-input-control w-full rounded-[18px] px-4 py-3 text-sm outline-none"
              >
                {CALL_PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option} per page</option>
                ))}
              </select>
            </label>
            <input type="hidden" name="limit" value={String(limit)} />
            <div className="flex items-end">
              <button
                type="submit"
                className="theme-btn-secondary inline-flex w-full items-center justify-center rounded-[18px] px-5 py-3 text-sm transition"
              >
                Apply filter
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
            No positions match the current scan filters.
          </div>
        ) : (
          <>
            {!SHOW_LEGACY_CALLS_VIEWS ? (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { icon: PhoneMissed, label: "Missed / hot", count: countRecoveryLane(calls, needsImmediateRecovery) },
                    { icon: Voicemail, label: "Voicemail lane", count: countRecoveryLane(calls, (call) => hasVoicemailContext(call) && hasVoicemailIntent(call)) },
                    { icon: PhoneIncoming, label: "Matched flow", count: matchedOpportunityCount },
                    { icon: Bot, label: "AI review", count: aiReviewCount },
                  ].map((lane) => {
                    const LaneIcon = lane.icon;

                    return (
                      <div key={lane.label} className="rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <LaneIcon className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                            <p className="text-xs font-medium text-[color:var(--sem-text-primary)]">{lane.label}</p>
                          </div>
                          <p className={`text-lg font-semibold text-[color:var(--sem-display-headline)] ${callsLedgerNumericClass}`}>{lane.count}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
                  <section className={`${callsPanelClass} overflow-hidden ${selectedCall ? "hidden lg:block" : ""}`}>
                    <div className="border-b border-[color:var(--cmp-border-subtle)] px-5 py-4">
                      <p className={callsEyebrowClass}>Recovery queue</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--sem-display-headline)]">Prioritized caller scan</h2>
                      <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">
                        Missed hot → voicemail intent → matched → unknown → answered.
                      </p>
                    </div>
                    <div className="space-y-2 p-3">
                      {sortedPagedCalls.map((call, index) => {
                        const priority = getRecoveryQueuePriority(call);
                        const showTierHeader = index === 0 || getRecoveryQueuePriority(sortedPagedCalls[index - 1]!) !== priority;
                        const callHref = buildCallsQueryString({ ...paginationBase, page: String(currentPage), call: call.id });
                        const isSelected = selectedCall?.id === call.id;
                        const operationalState = getOperationalState(call);
                        const pressureSignal = getPressureSignal(call);
                        const aiReview = isAiReviewCandidate(call);

                        return (
                          <div key={call.id}>
                            {showTierHeader ? (
                              <p className="px-2 pb-2 pt-3 text-[10px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">
                                {RECOVERY_QUEUE_TIER_LABELS[priority]}
                              </p>
                            ) : null}
                            <Link
                              href={callHref}
                              className={[
                                "block rounded-[20px] border px-4 py-3 transition",
                                isSelected
                                  ? "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-surface-soft)] ring-1 ring-[color:var(--sem-accent-primary)]"
                                  : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] hover:border-[color:var(--cmp-border-accent)]",
                                operationalState.surfaceClass,
                              ].join(" ")}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[color:var(--sem-text-primary)]">{getCallDisplayName(call)}</p>
                                  <p className="mt-1 truncate text-xs text-[color:var(--sem-text-secondary)]">{getCallIntentLabel(call)}</p>
                                </div>
                                <span className={`shrink-0 text-[11px] ${callsLedgerNumericClass} text-[color:var(--sem-text-muted)]`}>{getCallAgeLabel(call)}</span>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className={operationalState.badgeClass}>{operationalState.label}</span>
                                <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">{pressureSignal.label}</span>
                                {hasVoicemailContext(call) ? <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">VM</span> : null}
                                {call.matchedClientId || call.matchedLeadId ? <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">Matched</span> : null}
                                {aiReview ? (
                                  <span className="inline-flex rounded-full border border-dashed border-[color:var(--cmp-border-accent)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--sem-text-secondary)]">
                                    Review required
                                  </span>
                                ) : null}
                              </div>
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <aside className={`${selectedCall ? "block" : "hidden lg:block"} lg:sticky lg:top-4 lg:max-h-[calc(100vh-1.5rem)] lg:self-start lg:overflow-y-auto`}>
                    {selectedCall ? (
                      <SelectedCallFocusPanel
                        selectedCall={selectedCall}
                        canManageCrmFromCalls={canManageCrmFromCalls}
                        callbackTaskAssignees={callbackTaskAssignees}
                        hasMessagingSendPermission={session.permissions.includes("messaging.send")}
                        backHref={buildCallsQueryString({ ...paginationBase, page: String(currentPage) })}
                      />
                    ) : null}
                  </aside>
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-3">
                  <section className={`${callsPanelClass} p-5`}>
                    <p className={callsEyebrowClass}>Operator load</p>
                    <h3 className="mt-2 text-xl font-semibold text-[color:var(--sem-display-headline)]">Callback assignees</h3>
                    <div className="mt-4 space-y-3">
                      {callbackTaskAssignees.length > 0 ? (
                        callbackTaskAssignees.slice(0, 4).map((assignee) => (
                          <div key={assignee.id} className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-3">
                            <div className="flex items-center gap-2">
                              <UserRound className="h-4 w-4 text-[color:var(--sem-accent-primary)]" />
                              <div>
                                <p className="text-sm font-medium text-[color:var(--sem-text-primary)]">{assignee.fullName}</p>
                                <p className="text-xs text-[color:var(--sem-text-muted)]">Available for callback ownership</p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[color:var(--sem-text-muted)]">No assignees loaded — callback ownership still available per call.</p>
                      )}
                    </div>
                  </section>

                  <section className={`${callsPanelClass} p-5 xl:col-span-1`}>
                    <p className={callsEyebrowClass}>AI pipeline</p>
                    <h3 className="mt-2 text-xl font-semibold text-[color:var(--sem-display-headline)]">Assist-only lane</h3>
                    <div className="mt-4 space-y-3">
                      {sortedPagedCalls.filter(isAiReviewCandidate).slice(0, 3).map((call) => (
                        <Link
                          key={`ai-${call.id}`}
                          href={buildCallsQueryString({ ...paginationBase, page: String(currentPage), call: call.id })}
                          className="block rounded-[18px] border border-dashed border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-panel)] p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-[color:var(--sem-text-primary)]">{getCallDisplayName(call)}</p>
                              <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">{call.aiSummary ? "Summary ready" : call.missedCallSms ? "SMS draft pending review" : "Transcript pending review"}</p>
                            </div>
                            <span className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">Review</span>
                          </div>
                        </Link>
                      ))}
                      {sortedPagedCalls.filter(isAiReviewCandidate).length === 0 ? (
                        <p className="text-sm text-[color:var(--sem-text-muted)]">No AI-assisted drafts awaiting review on this page.</p>
                      ) : null}
                    </div>
                  </section>

                  <section className={`${callsPanelClass} p-5`}>
                    <p className={callsEyebrowClass}>Desk posture</p>
                    <h3 className="mt-2 text-xl font-semibold text-[color:var(--sem-display-headline)]">Recovery health</h3>
                    <div className="mt-4 space-y-3 text-sm text-[color:var(--sem-text-secondary)]">
                      <p>{matchedBookShare ?? "No matched share"} · {unmatchedCallerCount} unmatched callers in feed.</p>
                      <p>{negativeSentimentCount} negative AI reads · {missedCallSmsCount} automated SMS touchpoints logged.</p>
                      <p className="text-xs text-[color:var(--sem-text-muted)]">Operators own every outbound action. AI surfaces drafts and summaries only.</p>
                    </div>
                  </section>
                </div>
              </>
            ) : null}

            {SHOW_LEGACY_CALLS_VIEWS ? (
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
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">Desk view</p>
                <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                  Working Ledger for position scan, Hybrid for callback depth, Grid for quick tape read.
                </p>
              </div>
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">Calls display mode</legend>
                <label
                  htmlFor="calls-display-ledger"
                  className="calls-display-chip cursor-pointer rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] transition"
                >
                  Working Ledger
                </label>
                <label
                  htmlFor="calls-display-hybrid"
                  className="calls-display-chip cursor-pointer rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] transition"
                >
                  Hybrid depth
                </label>
                <label
                  htmlFor="calls-display-grid"
                  className="calls-display-chip cursor-pointer rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] transition"
                >
                  Grid tape
                </label>
              </fieldset>
            </div>

            {recoveryWatchlist.length > 0 ? (
              <div className="mt-6 rounded-[24px] border border-[color:rgba(248,113,113,0.24)] bg-[color:rgba(120,18,18,0.08)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-[color:#fecaca]">Recovery Watchlist</p>
                    <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                      Highest-pressure positions requiring immediate next move.
                    </p>
                  </div>
                  <p className={`text-xs uppercase tracking-[0.18em] text-[color:#fecaca] ${callsLedgerNumericClass}`}>
                    {recoveryWatchlist.length} of {urgentRecoveryCount} open
                  </p>
                </div>
                <div className="mt-4 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                  {recoveryWatchlist.map((call) => {
                    const pressure = getPressureSignal(call);
                    const operationalState = getOperationalState(call);

                    return (
                      <article
                        key={`watch-${call.id}`}
                        className="rounded-[18px] border border-[color:rgba(248,113,113,0.22)] bg-[color:rgba(120,18,18,0.12)] px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[color:var(--text-primary)]">{getCallDisplayName(call)}</p>
                            <p className={`mt-1 truncate text-[11px] text-[color:var(--text-secondary)] ${callsLedgerNumericClass}`}>
                              {call.fromNumber ?? "Unknown"} · {formatDateTime(call.createdAt)}
                            </p>
                          </div>
                          <span className={`shrink-0 text-[10px] uppercase tracking-[0.16em] text-[color:#fecaca] ${callsLedgerNumericClass}`}>
                            {pressure.label}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-[color:var(--text-secondary)]">{operationalState.nextAction}</p>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="calls-display-panels mt-6">
              <div className="calls-display-panel calls-display-panel-ledger">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">Working Ledger</p>
                    <p className="mt-1 text-sm text-[color:var(--text-secondary)]">Live positions table — scan caller, pressure signal, and next move.</p>
                  </div>
                  <p className={`text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)] ${callsLedgerNumericClass}`}>
                    Page {currentPage}/{totalPages} · {pagedCalls.length} rows
                  </p>
                </div>
                <div className="theme-control-surface overflow-x-auto rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]">
                  <table className="min-w-full table-fixed text-left text-xs leading-4">
                    <colgroup>
                      <col className="w-[18%]" />
                      <col className="w-[14%]" />
                      <col className="w-[16%]" />
                      <col className="w-[14%]" />
                      <col className="w-[12%]" />
                      <col className="w-[26%]" />
                    </colgroup>
                    <thead className="border-b border-[color:var(--border-subtle)] bg-[color:rgba(255,255,255,0.03)] text-[color:var(--text-secondary)]">
                      <tr>
                        <th className={callsLedgerHeaderCellClass}>Caller</th>
                        <th className={callsLedgerHeaderCellClass}>State</th>
                        <th className={callsLedgerHeaderCellClass}>Signal</th>
                        <th className={callsLedgerHeaderCellClass}>Source</th>
                        <th className={callsLedgerHeaderCellClass}>Time</th>
                        <th className={callsLedgerHeaderCellClass}>Next Move</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedCalls.map((call) => {
                        const formattedCreatedAt = formatDateTime(call.createdAt);
                        const operationalState = getOperationalState(call);
                        const pressureSignal = getPressureSignal(call);
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
                            <td className={`${callsLedgerBodyCellClass} text-[color:var(--text-primary)]`}>
                              <div className="min-w-0">
                                {call.matchedClientId && call.matchedClientDisplayName && canManageCrmFromCalls ? (
                                  <Link
                                    href={`/customers/${call.matchedClientId}`}
                                    className="block truncate font-medium text-[color:var(--flat-gold)] transition hover:text-[color:var(--text-primary)]"
                                    title="Open matched customer"
                                  >
                                    {getCallDisplayName(call)}
                                  </Link>
                                ) : (
                                  <span className="block truncate font-medium">{getCallDisplayName(call)}</span>
                                )}
                                <div className={`mt-1 truncate text-[11px] text-[color:var(--text-secondary)] ${callsLedgerNumericClass}`}>
                                  {call.fromNumber ?? "Unknown"}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {call.matchedClientId ? <span className="inline-flex rounded-full border border-[color:rgba(52,211,153,0.24)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[color:#a7f3d0]">Client</span> : null}
                                  {call.matchedLeadId ? <span className="inline-flex rounded-full border border-[color:rgba(56,189,248,0.24)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[color:#bae6fd]">Lead</span> : null}
                                </div>
                              </div>
                            </td>
                            <td className={callsLedgerBodyCellClass}>
                              <div className="space-y-2">
                                <span className={operationalState.badgeClass}>{operationalState.label}</span>
                                <div>
                                  <span className={callStatusBadgeClass(call.callStatus)}>{call.callStatus}</span>
                                </div>
                              </div>
                            </td>
                            <td className={`${callsLedgerBodyCellClass} text-[color:var(--text-secondary)]`}>
                              <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Pressure</p>
                              <p className="mt-1 font-medium text-[color:var(--text-primary)]">{pressureSignal.label}</p>
                              <p className="mt-1 text-[11px]">{pressureSignal.detail}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {hasVoicemail ? <span className="inline-flex rounded-full border border-[color:rgba(192,132,252,0.24)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[color:#e9d5ff]">VM</span> : null}
                                {hasSmsContext ? <span className="inline-flex rounded-full border border-[color:rgba(125,211,252,0.24)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[color:#bae6fd]">SMS</span> : null}
                                {negativeSentiment ? <span className="inline-flex rounded-full border border-[color:rgba(248,113,113,0.24)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[color:#fecaca]">−AI</span> : null}
                              </div>
                              {voiceHybridHint ? (
                                <p className="mt-2 text-[11px]">{voiceHybridHint}</p>
                              ) : null}
                            </td>
                            <td className={`${callsLedgerBodyCellClass} text-[color:var(--text-secondary)]`}>
                              <div>{formatCallSourceLabel(call.source)}</div>
                              {call.campaignName ? <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">{call.campaignName}</div> : null}
                              <div className={`mt-1 text-[11px] text-[color:var(--text-muted)] ${callsLedgerNumericClass}`}>{inboundNumberLabel}</div>
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
                            <td className={`${callsLedgerBodyCellClass} text-[color:var(--text-secondary)]`}>
                              <p className={`text-[11px] text-[color:var(--text-primary)] ${callsLedgerNumericClass}`}>{formattedCreatedAt}</p>
                              <p className={`mt-2 text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-muted)] ${callsLedgerNumericClass}`}>
                                {formatDuration(call.durationSeconds) ?? "—"} duration
                              </p>
                            </td>
                            <td className={`${callsLedgerBodyCellClass} text-[color:var(--text-secondary)]`}>
                              <div className="font-medium text-[color:var(--text-primary)]">{operationalState.nextAction}</div>
                              <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">{call.aiSummary ?? call.recordingStatus ?? "Pending review"}</div>
                              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                                {activeCallbackTask ? <span>Task active</span> : null}
                                {recoveryInMotion && call.queueCallbackRequested ? <span>Queued</span> : null}
                                {resolvedCallbackTask ? <span>Resolved</span> : null}
                              </div>
                              <div className="mt-3 flex min-w-[14rem] flex-col gap-2">
                                <div className="flex flex-nowrap items-center gap-2">
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
                                <CallsCopilotSmsDraft recentCallId={call.id} hasMessagingSendPermission={session.permissions.includes("messaging.send")} />
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
                  {pagedCalls.map((call) => {
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
                        className={`theme-control-surface rounded-[28px] border bg-[color:var(--cmp-surface-card)] px-5 py-4 shadow-[0_18px_36px_color-mix(in_srgb,var(--bg-canvas)_55%,transparent)] ${operationalState.surfaceClass}`}
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
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">State</p>
                              <div className="mt-2">
                                <span className={callStatusBadgeClass(call.callStatus)}>{call.callStatus}</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Source</p>
                              <p className="mt-2">{formatCallSourceLabel(call.source)}</p>
                              <p className={`mt-2 text-[color:var(--text-muted)] ${callsLedgerNumericClass}`}>{inboundNumberLabel}</p>
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
                              <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Time</p>
                              <p className={`mt-2 ${callsLedgerNumericClass}`}>{formatDuration(call.durationSeconds) ?? "—"}</p>
                            </div>
                          </div>

                          <div className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(255,255,255,0.02)] px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                            <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Signal · Next Move</p>
                            <div className="mt-3 grid gap-2">
                              <p><span className="text-[color:var(--text-muted)]">Tick:</span> <span className={callsLedgerNumericClass}>{formattedCreatedAt}</span></p>
                              <p><span className="text-[color:var(--text-muted)]">Pressure:</span> {getPressureSignal(call).label}</p>
                              <p>Summary: {call.aiSummary ?? call.recordingStatus ?? "Pending review"}</p>
                              {voiceHybridHint ? <p className="text-[color:var(--text-secondary)]">{voiceHybridHint}</p> : null}
                              <p>Next move: {resolvedCallbackTask ? "Callback resolved." : recoveryInMotion && call.queueCallbackRequested ? "Callback queued" : operationalState.nextAction}</p>
                            </div>
                            <CallsCopilotSmsDraft recentCallId={call.id} hasMessagingSendPermission={session.permissions.includes("messaging.send")} />
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>

              <div className="calls-display-panel calls-display-panel-grid">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {pagedCalls.map((call) => {
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
                        className={`theme-control-surface flex h-full flex-col rounded-[28px] border bg-[color:var(--cmp-surface-card)] p-5 shadow-[0_18px_36px_color-mix(in_srgb,var(--bg-canvas)_55%,transparent)] ${operationalState.surfaceClass}`}
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
                          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Signal · Next Move</p>
                          <p className="mt-2 font-medium text-[color:var(--text-primary)]">{operationalState.nextAction}</p>
                          <p className="mt-2">{getPressureSignal(call).label} · {call.aiSummary ?? call.recordingStatus ?? "Pending review"}</p>
                          {voiceHybridHint ? <p className="mt-2 text-xs text-[color:var(--text-secondary)]">{voiceHybridHint}</p> : null}
                          <p className="mt-3 text-xs text-[color:var(--text-muted)]">{call.aiSentiment ?? (resolvedCallbackTask ? "Callback resolved" : recoveryInMotion && call.queueCallbackRequested ? "Callback queued" : "No follow-up flag")}</p>
                          <CallsCopilotSmsDraft recentCallId={call.id} hasMessagingSendPermission={session.permissions.includes("messaging.send")} />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
              </>
            ) : null}
          </>
        )}

        {totalCount > 0 ? (
          <div className={`${callsPanelClass} mt-6 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]`}>
            <p className={callsLedgerNumericClass}>
              Tape {String((currentPage - 1) * pageSize + 1).padStart(2, "0")}–{String(Math.min(currentPage * pageSize, totalCount)).padStart(2, "0")} of {String(totalCount).padStart(2, "0")} positions
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={previousPageHref}
                aria-disabled={currentPage <= 1}
                className={`theme-control-surface rounded-full border px-4 py-2 text-xs ${currentPage <= 1 ? "pointer-events-none opacity-40" : ""}`}
              >
                Previous
              </Link>
              <span className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                Page {currentPage} of {totalPages}
              </span>
              <Link
                href={nextPageHref}
                aria-disabled={currentPage >= totalPages}
                className={`theme-control-surface rounded-full border px-4 py-2 text-xs ${currentPage >= totalPages ? "pointer-events-none opacity-40" : ""}`}
              >
                Next
              </Link>
            </div>
          </div>
        ) : null}
      </main>
    </BoardShell>
  );
}
