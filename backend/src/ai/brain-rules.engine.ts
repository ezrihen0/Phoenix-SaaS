import { Injectable } from "@nestjs/common";

import { AI_BRAIN_RULES_ENGINE_VERSION, AI_BRAIN_STALE_LEAD_DAYS_THRESHOLD } from "./ai.constants";
import { BRAIN_UNKNOWN_DATE_SENTINEL_ISO, type BrainMinimalInputV1 } from "./brain-minimal-input.v1";

export type BrainHomeActionV1 = {
  ruleId: string;
  severity: "high" | "medium" | "low";
  title: string;
  groundingLine: string;
  href: string;
  explainBullets: string[];
};

export type BrainRulesEvaluationV1 = {
  rulesEngineVersion: typeof AI_BRAIN_RULES_ENGINE_VERSION;
  rulesFiredOrdered: string[];
  actions: BrainHomeActionV1[];
};

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function daysBetweenIso(asOfIso: string, earlierIso: string): number {
  const a = Date.parse(asOfIso);
  const b = Date.parse(earlierIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return 0;
  }
  return Math.floor((a - b) / (24 * 60 * 60 * 1000));
}

@Injectable()
export class BrainRulesEngine {
  evaluate(minimal: BrainMinimalInputV1): BrainRulesEvaluationV1 {
    const candidates: { rank: number; action: BrainHomeActionV1 }[] = [];

    const hasUnpaid =
      minimal.summary.unpaidInvoices > 0 || minimal.unpaid_invoices.length > 0;
    if (hasUnpaid) {
      const list = minimal.unpaid_invoices;
      const sumListed = list.reduce(
        (sum, row) => sum + (typeof row.amount_cents === "number" ? row.amount_cents : 0),
        0,
      );
      const count = minimal.summary.unpaidInvoices;
      const oldestIso = list.length > 0 ? list[0].issued_at : minimal.as_of;
      const oldestMissing = list.length > 0 && list[0].issued_at === BRAIN_UNKNOWN_DATE_SENTINEL_ISO;
      const age = daysBetweenIso(minimal.as_of, oldestIso);
      const title =
        sumListed > 0
          ? `${fmtMoney(sumListed)} across ${count} unpaid invoice${count === 1 ? "" : "s"} (dashboard sample)`
          : `${count} unpaid invoice${count === 1 ? "" : "s"}`;

      candidates.push({
        rank: 0,
        action: {
          ruleId: "unpaid_invoices",
          severity: "high",
          title,
          groundingLine:
            list.length === 0
              ? "Open Invoices to review balances and payment status."
              : oldestMissing
                ? "Issue date unavailable for the oldest sampled invoice row—verify timing in Invoices."
                : `Oldest shown invoice was issued ${age} day${age === 1 ? "" : "s"} ago.`,
          href: "/invoices",
          explainBullets: [
            "summary.unpaidInvoices",
            "controls.unpaidInvoices (oldest-first sample, up to 4 rows)",
          ],
        },
      });
    }

    if (minimal.quotes_waiting.length > 0) {
      const q = minimal.quotes_waiting[0];
      const age = daysBetweenIso(minimal.as_of, q.sent_at);
      const sentMissing = q.sent_at === BRAIN_UNKNOWN_DATE_SENTINEL_ISO;
      candidates.push({
        rank: 1,
        action: {
          ruleId: "quotes_waiting",
          severity: "high",
          title: `${minimal.quotes_waiting.length} estimate${
            minimal.quotes_waiting.length === 1 ? "" : "s"
          } awaiting customer approval`,
          groundingLine: sentMissing
            ? "Sent timestamp missing on the sampled estimate row—open Estimates for approval timing."
            : `Oldest sent ${age} day${age === 1 ? "" : "s"} ago.`,
          href: `/estimates/${q.id}`,
          explainBullets: [
            "controls.quotesWaitingApproval (status sent, oldest by sent_at in dashboard sample)",
          ],
        },
      });
    }

    const stale = minimal.leads_open.filter(
      (lead) =>
        lead.created_at !== BRAIN_UNKNOWN_DATE_SENTINEL_ISO
        && daysBetweenIso(minimal.as_of, lead.created_at) >= AI_BRAIN_STALE_LEAD_DAYS_THRESHOLD,
    );
    if (stale.length > 0) {
      const oldestLead = stale.reduce((a, b) =>
        daysBetweenIso(minimal.as_of, a.created_at) >= daysBetweenIso(minimal.as_of, b.created_at) ? a : b,
      );
      const maxAge = daysBetweenIso(minimal.as_of, oldestLead.created_at);
      candidates.push({
        rank: 2,
        action: {
          ruleId: "stale_leads",
          severity: "medium",
          title: `${stale.length} lead${stale.length === 1 ? "" : "s"} need follow-up`,
          groundingLine: `Oldest open lead is ${maxAge} days old.`,
          href: "/leads",
          explainBullets: [
            `leads[] non-converted slice (age >= ${AI_BRAIN_STALE_LEAD_DAYS_THRESHOLD} days vs snapshot as_of)`,
          ],
        },
      });
    }

    if (minimal.follow_up_jobs.length > 0) {
      candidates.push({
        rank: 3,
        action: {
          ruleId: "follow_up_jobs",
          severity: "medium",
          title: `${minimal.follow_up_jobs.length} contacted job${
            minimal.follow_up_jobs.length === 1 ? "" : "s"
          } need follow-up`,
          groundingLine: "These jobs are in contacted status and need the next touch.",
          href: "/jobs",
          explainBullets: ["controls.followUpsNeeded (contacted status, dashboard sample)"],
        },
      });
    }

    candidates.sort((a, b) => a.rank - b.rank || a.action.ruleId.localeCompare(b.action.ruleId));
    const rulesFiredOrdered = candidates.map((c) => c.action.ruleId);
    const actions = candidates.slice(0, 5).map((c) => c.action);

    return {
      rulesEngineVersion: AI_BRAIN_RULES_ENGINE_VERSION,
      rulesFiredOrdered,
      actions,
    };
  }
}