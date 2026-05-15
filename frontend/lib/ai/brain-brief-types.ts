/** Mirrors `AiBrainHomeBriefResponse` from the backend Brain V1 route. */

export type BrainHomeBriefAction = {
  ruleId: string;
  severity: "high" | "medium" | "low";
  title: string;
  groundingLine: string;
  href: string;
  explainBullets: string[];
};

export type AiBrainHomeBriefResponse = {
  runId: string;
  briefing: {
    headline: string;
    body: string;
  };
  disclaimer: string;
  actions: BrainHomeBriefAction[];
  wordingMode: "template_v1";
  model: { skipped: true; reasonCode: string };
  digest: string;
  rulesEngineVersion: string;
  traceSchemaVersion: string;
};