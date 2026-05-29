import { Injectable } from "@nestjs/common";

import type { AiChatSmartContextV1 } from "./ai-chat-context.types";
import { buildModeSystemPromptAppendix, detectAiChatMode } from "./ai-chat-mode";
import type {
  AiChatAllowedTargetHref,
  AiChatDetectedMode,
  AiChatGroundingItem,
  AiChatRecommendation,
  AiChatRecommendationPriority,
} from "./ai-chat.types";
import { AI_CHAT_ALLOWED_TARGET_HREFS } from "./ai-chat.types";

export { detectAiChatMode, buildModeSystemPromptAppendix };

const MAX_RECOMMENDATIONS = 5;
const STALE_LEAD_DAYS = 3;

type CandidateRecommendation = {
  rank: number;
  modes: AiChatDetectedMode[];
  item: AiChatRecommendation;
};

function daysBetweenIso(asOfIso: string, earlierIso: string | null): number | null {
  if (!earlierIso) {
    return null;
  }
  const a = Date.parse(asOfIso);
  const b = Date.parse(earlierIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return null;
  }
  return Math.floor((a - b) / (24 * 60 * 60 * 1000));
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function isAllowedChatTargetHref(href: string): href is AiChatAllowedTargetHref {
  return (AI_CHAT_ALLOWED_TARGET_HREFS as readonly string[]).includes(href);
}

function countMissedCalls(context: AiChatSmartContextV1): number {
  return context.recent_and_missed_calls.filter((row) => row.is_missed).length;
}

function countStaleLeads(context: AiChatSmartContextV1): number {
  return context.recent_leads.filter((lead) => {
    const age = daysBetweenIso(context.as_of, lead.created_at);
    return age != null && age >= STALE_LEAD_DAYS && lead.status !== "converted";
  }).length;
}

function oldestEstimateWaitingDays(context: AiChatSmartContextV1): number | null {
  let oldest: number | null = null;
  for (const row of context.stale_estimates) {
    const days = daysBetweenIso(context.as_of, row.waiting_since);
    if (days != null && (oldest == null || days > oldest)) {
      oldest = days;
    }
  }
  return oldest;
}

@Injectable()
export class AiChatSmartOutputEngine {
  buildGrounding(context: AiChatSmartContextV1, mode: AiChatDetectedMode): AiChatGroundingItem[] {
    const items: AiChatGroundingItem[] = [];
    const summary = context.dashboard_summary;

    if (summary.unpaid_invoices > 0) {
      items.push({
        source: "invoice",
        label: `${summary.unpaid_invoices} unpaid ${pluralize(summary.unpaid_invoices, "invoice")} in this workspace`,
      });
    }

    const estimateCount = context.stale_estimates.length;
    if (estimateCount > 0) {
      const oldestDays = oldestEstimateWaitingDays(context);
      const label =
        oldestDays != null
          ? `Oldest estimate waiting ${oldestDays} ${pluralize(oldestDays, "day")}`
          : `${estimateCount} ${pluralize(estimateCount, "estimate")} awaiting follow-up`;
      items.push({ source: "estimate", label });
    }

    if (summary.jobs_scheduled_today > 0) {
      items.push({
        source: "job",
        label: `${summary.jobs_scheduled_today} ${pluralize(summary.jobs_scheduled_today, "job")} scheduled today`,
      });
    }

    const missedCount = countMissedCalls(context);
    if (missedCount > 0) {
      items.push({
        source: "call",
        label: `${missedCount} recent missed ${pluralize(missedCount, "call")}`,
      });
    }

    const staleLeads = countStaleLeads(context);
    if (staleLeads > 0) {
      items.push({
        source: "lead",
        label: `${staleLeads} ${pluralize(staleLeads, "lead")} need follow-up`,
      });
    }

    if (summary.new_leads > 0 && mode === "lead_followup") {
      items.push({
        source: "lead",
        label: `${summary.new_leads} new ${pluralize(summary.new_leads, "lead")} in dashboard summary`,
      });
    }

    if (summary.active_jobs > 0 && (mode === "job_operations" || mode === "daily_focus")) {
      items.push({
        source: "dashboard",
        label: `${summary.active_jobs} active ${pluralize(summary.active_jobs, "job")} in this workspace`,
      });
    }

    return items.slice(0, MAX_RECOMMENDATIONS);
  }

  buildRecommendations(context: AiChatSmartContextV1, mode: AiChatDetectedMode): AiChatRecommendation[] {
    const candidates: CandidateRecommendation[] = [];
    const summary = context.dashboard_summary;
    const missedCount = countMissedCalls(context);
    const staleLeads = countStaleLeads(context);

    if (summary.unpaid_invoices > 0 || context.unpaid_invoices.length > 0) {
      const count = summary.unpaid_invoices || context.unpaid_invoices.length;
      candidates.push({
        rank: 0,
        modes: ["money_recovery", "daily_focus"],
        item: {
          title: "Review unpaid invoices",
          reason: `${count} open ${pluralize(count, "invoice")} in your workspace snapshot.`,
          priority: "high",
          targetHref: "/invoices",
        },
      });
    }

    if (context.stale_estimates.length > 0) {
      const count = context.stale_estimates.length;
      candidates.push({
        rank: 1,
        modes: ["estimate_followup", "daily_focus"],
        item: {
          title: "Follow up on estimates",
          reason: `${count} ${pluralize(count, "estimate")} waiting for customer action.`,
          priority: "high",
          targetHref: "/estimates",
        },
      });
    }

    if (missedCount > 0) {
      candidates.push({
        rank: 2,
        modes: ["call_recovery", "daily_focus"],
        item: {
          title: "Return missed calls",
          reason: `${missedCount} missed or voicemail ${pluralize(missedCount, "call")} in recent activity.`,
          priority: "high",
          targetHref: "/calls",
        },
      });
    }

    if (summary.jobs_scheduled_today > 0 || context.todays_jobs.length > 0) {
      const count = summary.jobs_scheduled_today || context.todays_jobs.length;
      candidates.push({
        rank: 3,
        modes: ["job_operations", "daily_focus"],
        item: {
          title: "Review today's jobs",
          reason: `${count} ${pluralize(count, "job")} scheduled for today.`,
          priority: "medium",
          targetHref: "/jobs",
        },
      });
    }

    if (staleLeads > 0 || summary.new_leads > 0) {
      const count = staleLeads || summary.new_leads;
      candidates.push({
        rank: 4,
        modes: ["lead_followup", "daily_focus"],
        item: {
          title: "Work the lead queue",
          reason:
            staleLeads > 0
              ? `${staleLeads} ${pluralize(staleLeads, "lead")} may need follow-up.`
              : `${summary.new_leads} new ${pluralize(summary.new_leads, "lead")} on the dashboard.`,
          priority: "medium",
          targetHref: "/leads",
        },
      });
    }

    if (mode === "daily_focus" && candidates.length === 0) {
      candidates.push({
        rank: 10,
        modes: ["daily_focus"],
        item: {
          title: "Open your Home dashboard",
          reason: "No urgent items in the workspace snapshot — review Home for the full picture.",
          priority: "low",
          targetHref: "/home",
        },
      });
    }

    const modeBoost = (candidate: CandidateRecommendation): number => {
      if (candidate.modes.includes(mode)) {
        return 0;
      }
      if (mode === "general_question") {
        return 1;
      }
      return 2;
    };

    candidates.sort((left, right) => {
      const boostDiff = modeBoost(left) - modeBoost(right);
      if (boostDiff !== 0) {
        return boostDiff;
      }
      return left.rank - right.rank;
    });

    const seen = new Set<string>();
    const result: AiChatRecommendation[] = [];

    for (const candidate of candidates) {
      if (!isAllowedChatTargetHref(candidate.item.targetHref)) {
        continue;
      }
      if (seen.has(candidate.item.targetHref)) {
        continue;
      }
      seen.add(candidate.item.targetHref);
      result.push(candidate.item);
      if (result.length >= MAX_RECOMMENDATIONS) {
        break;
      }
    }

    return result;
  }

  listContextCategoriesUsed(context: AiChatSmartContextV1): string[] {
    const categories: string[] = ["organization", "actor", "dashboard_summary"];

    if (context.unpaid_invoices.length > 0) {
      categories.push("unpaid_invoices");
    }
    if (context.stale_estimates.length > 0) {
      categories.push("stale_estimates");
    }
    if (context.todays_jobs.length > 0) {
      categories.push("todays_jobs");
    }
    if (context.recent_leads.length > 0) {
      categories.push("recent_leads");
    }
    if (context.recent_and_missed_calls.length > 0) {
      categories.push("recent_and_missed_calls");
    }

    return categories;
  }
}
