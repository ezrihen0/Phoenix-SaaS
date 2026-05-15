import type { BrainMinimalInputV1 } from "./brain-minimal-input.v1";
import type { BrainHomeActionV1 } from "./brain-rules.engine";

export type BrainTemplateBriefV1 = {
  headline: string;
  body: string;
};

export const BRAIN_HOME_DISCLAIMER_V1 =
  "Summaries are generated from your WizField data in this workspace. They are not financial or legal advice. Verify before acting.";

export function assembleBrainTemplateBriefV1(
  minimal: BrainMinimalInputV1,
  actions: BrainHomeActionV1[],
): BrainTemplateBriefV1 {
  if (actions.length === 0) {
    return {
      headline: "Looking clear from this snapshot",
      body: `No urgent office actions were diagnosed from your dashboard sample as of your workspace time. You still have ${minimal.summary.newLeads} new leads, ${minimal.summary.jobsScheduledToday} job(s) scheduled today, and ${minimal.summary.activeJobs} active job(s) in flight.`,
    };
  }

  const top = actions[0];
  const parts: string[] = [];
  parts.push(
    `Today's office snapshot highlights ${actions.length} prioritized area${actions.length === 1 ? "" : "s"}.`,
  );
  parts.push(`Priority focus: ${top.title}.`);
  if (minimal.summary.unpaidInvoices > 0 || minimal.quotes_waiting.length > 0) {
    parts.push(
      `Billing/cash: ${minimal.summary.unpaidInvoices} unpaid invoice(s) across the org; ${minimal.quotes_waiting.length} estimate(s) awaiting approval in the dashboard sample.`,
    );
  }
  parts.push("Use the action cards below—each link opens the module so you can verify details before acting.");

  return {
    headline: "Office intelligence",
    body: parts.join(" "),
  };
}