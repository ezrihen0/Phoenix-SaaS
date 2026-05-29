import type { AiChatDetectedMode } from "./ai-chat.types";

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

type ModeRule = {
  mode: AiChatDetectedMode;
  patterns: RegExp[];
};

const MODE_RULES: ModeRule[] = [
  {
    mode: "daily_focus",
    patterns: [
      /\bwhat should i focus on today\b/,
      /\bfocus on today\b/,
      /\bprioritize today\b/,
      /\btoday'?s priority\b/,
      /\bwhat to do today\b/,
    ],
  },
  {
    mode: "money_recovery",
    patterns: [
      /\bwho owes\b/,
      /\bunpaid invoice\b/,
      /\bcollect (money|payment)\b/,
      /\bmoney (owed|recovery)\b/,
      /\bunpaid\b/,
      /\bowe me\b/,
    ],
  },
  {
    mode: "estimate_followup",
    patterns: [
      /\bestimate(s)? need follow[- ]?up\b/,
      /\bquote(s)? (waiting|need)\b/,
      /\bfollow[- ]?up (on )?estimate\b/,
      /\bstale estimate\b/,
      /\bwhich estimates\b/,
    ],
  },
  {
    mode: "call_recovery",
    patterns: [
      /\bmissed calls?\b/,
      /\bmissed call\b/,
      /\bvoicemail\b/,
      /\bcall back\b/,
      /\breturn (the )?call\b/,
      /\brecent calls\b/,
      /\bhave missed\b/,
    ],
  },
  {
    mode: "lead_followup",
    patterns: [
      /\blead(s)? (need|follow)\b/,
      /\bfollow[- ]?up (on )?lead\b/,
      /\bnew lead\b/,
      /\bprospect\b/,
    ],
  },
  {
    mode: "job_operations",
    patterns: [
      /\bjobs? scheduled today\b/,
      /\btoday'?s jobs?\b/,
      /\bjob operations\b/,
      /\bdispatch today\b/,
      /\bschedule today\b/,
    ],
  },
];

/**
 * Lightweight keyword/heuristic mode detection — no model call.
 */
export function detectAiChatMode(userMessage: string): AiChatDetectedMode {
  const text = normalizeMessage(userMessage);
  if (!text) {
    return "general_question";
  }

  for (const rule of MODE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.mode;
    }
  }

  return "general_question";
}

const MODE_PROMPT_APPENDIX: Record<AiChatDetectedMode, string> = {
  daily_focus:
    "OPERATOR MODE: daily_focus — Prioritize a balanced daily briefing using WORKSPACE_CONTEXT counts (jobs today, unpaid invoices, stale estimates, missed calls, leads). Do not invent items.",
  money_recovery:
    "OPERATOR MODE: money_recovery — Lead with unpaid invoice summary and recovery guidance. Only cite invoice facts present in WORKSPACE_CONTEXT.",
  estimate_followup:
    "OPERATOR MODE: estimate_followup — Lead with stale/waiting estimates. Only cite estimate facts present in WORKSPACE_CONTEXT.",
  call_recovery:
    "OPERATOR MODE: call_recovery — Lead with missed/recent calls summary. Never include phone numbers or transcripts.",
  lead_followup:
    "OPERATOR MODE: lead_followup — Lead with recent leads and follow-up needs. Never include phone numbers or emails.",
  job_operations:
    "OPERATOR MODE: job_operations — Lead with today's scheduled jobs and active job counts from WORKSPACE_CONTEXT.",
  general_question:
    "OPERATOR MODE: general_question — Answer the user's question using WORKSPACE_CONTEXT when relevant.",
};

export function buildModeSystemPromptAppendix(mode: AiChatDetectedMode): string {
  return MODE_PROMPT_APPENDIX[mode];
}
