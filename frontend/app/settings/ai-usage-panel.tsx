"use client";



import { useTranslations } from "next-intl";



export type AiUsageChatRecentRun = {

  runId: string;

  createdAt: string;

  status: string;

  detectedMode: string | null;

  latencyMs: number | null;

  estimatedCostUsd: number | null;

  feedback: "useful" | "not_useful" | null;

};



export type AiUsageGeneralAiChatSummary = {

  chatRunsThisMonth: number;

  topDetectedMode: string | null;

  estimatedCostUsd: number;

  successCount: number;

  failedCount: number;

  feedbackUsefulCount: number;

  feedbackNotUsefulCount: number;

  recentRuns: AiUsageChatRecentRun[];

};



export type AiUsageSummaryPayload = {

  periodStart: string;

  periodEnd: string;

  totalRuns: number;

  topActionKey: string | null;

  topActionRuns: number;

  estimatedCostUsd: number;

  successCount: number;

  failedCount: number;

  businessOutcomesTracked: number;

  generalAiChat: AiUsageGeneralAiChatSummary;

};



type AiUsagePanelProps = {

  usage: AiUsageSummaryPayload | null;

  usageLoadError: string | null;

};



function formatPeriodDate(value: string | null) {

  if (!value) {

    return "—";

  }



  try {

    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  } catch {

    return value;

  }

}



function formatActionKey(actionKey: string | null) {

  if (!actionKey) {

    return "—";

  }



  return actionKey.replace(/_/g, " ");

}



function formatCostUsd(value: number) {

  if (!Number.isFinite(value) || value <= 0) {

    return "$0.00";

  }



  return new Intl.NumberFormat(undefined, {

    style: "currency",

    currency: "USD",

    minimumFractionDigits: 2,

    maximumFractionDigits: 4,

  }).format(value);

}



function formatMode(mode: string | null) {

  if (!mode) {

    return "—";

  }

  return mode.replace(/_/g, " ");

}



export function AiUsagePanel({ usage, usageLoadError }: AiUsagePanelProps) {

  const t = useTranslations("settings.aiUsage");

  const chat = usage?.generalAiChat;



  return (

    <section className="sem-ai-inspector-surface rounded-2xl p-5">

      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-ai-grid-text-muted)]">

        {t("eyebrow")}

      </p>

      <h2 className="mt-1 text-lg font-semibold text-[color:var(--sem-ai-grid-text-primary)]">{t("title")}</h2>

      <p className="mt-2 text-sm text-[color:var(--sem-ai-grid-text-secondary)]">{t("description")}</p>



      <div className="mt-4 space-y-4">

        {usage && !usageLoadError ? (

          <>

            <p className="text-xs text-[color:var(--sem-ai-grid-text-muted)]">

              {t("billingPeriod")}

              {": "}

              {formatPeriodDate(usage.periodStart)}

              {" → "}

              {formatPeriodDate(usage.periodEnd)}

            </p>



            {chat ? (

              <div className="space-y-3">

                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">

                  {t("chatMetrics.sectionTitle")}

                </p>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">

                  <div className="theme-control-surface-soft rounded-xl border px-3 py-2.5">

                    <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">

                      {t("chatMetrics.chatsThisMonth")}

                    </p>

                    <p className="mt-1 font-[family:var(--font-geist-mono)] text-lg font-semibold text-[color:var(--sem-ai-grid-text-primary)]">

                      {chat.chatRunsThisMonth}

                    </p>

                  </div>

                  <div className="theme-control-surface-soft rounded-xl border px-3 py-2.5">

                    <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">

                      {t("chatMetrics.topMode")}

                    </p>

                    <p className="mt-1 text-sm font-semibold capitalize text-[color:var(--sem-ai-grid-text-primary)]">

                      {formatMode(chat.topDetectedMode)}

                    </p>

                  </div>

                  <div className="theme-control-surface-soft rounded-xl border px-3 py-2.5">

                    <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">

                      {t("chatMetrics.estimatedCost")}

                    </p>

                    <p className="mt-1 font-[family:var(--font-geist-mono)] text-lg font-semibold text-[color:var(--sem-ai-grid-text-primary)]">

                      {formatCostUsd(chat.estimatedCostUsd)}

                    </p>

                  </div>

                  <div className="theme-control-surface-soft rounded-xl border px-3 py-2.5">

                    <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">

                      {t("chatMetrics.successCount")}

                    </p>

                    <p className="mt-1 font-[family:var(--font-geist-mono)] text-lg font-semibold text-[color:var(--sem-ai-grid-text-primary)]">

                      {chat.successCount}

                    </p>

                  </div>

                  <div className="theme-control-surface-soft rounded-xl border px-3 py-2.5">

                    <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">

                      {t("chatMetrics.failedCount")}

                    </p>

                    <p className="mt-1 font-[family:var(--font-geist-mono)] text-lg font-semibold text-[color:var(--sem-ai-grid-text-primary)]">

                      {chat.failedCount}

                    </p>

                  </div>

                  <div className="theme-control-surface-soft rounded-xl border px-3 py-2.5">

                    <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">

                      {t("chatMetrics.feedback")}

                    </p>

                    <p className="mt-1 text-sm text-[color:var(--sem-ai-grid-text-primary)]">

                      {t("chatMetrics.feedbackCounts", {

                        useful: chat.feedbackUsefulCount,

                        notUseful: chat.feedbackNotUsefulCount,

                      })}

                    </p>

                  </div>

                </div>



                {chat.recentRuns.length > 0 ? (

                  <div className="theme-control-surface-soft rounded-xl border px-3 py-2.5">

                    <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">

                      {t("chatMetrics.recentRuns")}

                    </p>

                    <ul className="mt-2 space-y-2">

                      {chat.recentRuns.map((run) => (

                        <li

                          key={run.runId}

                          className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--cmp-border-subtle)] pt-2 text-xs first:border-t-0 first:pt-0"

                        >

                          <span className="font-[family:var(--font-geist-mono)] text-[color:var(--sem-ai-grid-text-muted)]">

                            {formatPeriodDate(run.createdAt)}

                          </span>

                          <span className="capitalize text-[color:var(--sem-ai-grid-text-secondary)]">

                            {formatMode(run.detectedMode)}

                            {" · "}

                            {run.status}

                            {run.feedback ? ` · ${run.feedback.replace(/_/g, " ")}` : ""}

                          </span>

                        </li>

                      ))}

                    </ul>

                  </div>

                ) : null}

              </div>

            ) : null}



            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">

              {t("metrics.allActionsTitle")}

            </p>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">

              <div className="theme-control-surface-soft rounded-xl border px-3 py-2.5">

                <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">

                  {t("metrics.totalRuns")}

                </p>

                <p className="mt-1 font-[family:var(--font-geist-mono)] text-lg font-semibold text-[color:var(--sem-ai-grid-text-primary)]">

                  {usage.totalRuns}

                </p>

              </div>

              <div className="theme-control-surface-soft rounded-xl border px-3 py-2.5">

                <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">

                  {t("metrics.topAction")}

                </p>

                <p className="mt-1 text-sm font-semibold capitalize text-[color:var(--sem-ai-grid-text-primary)]">

                  {formatActionKey(usage.topActionKey)}

                </p>

                {usage.topActionKey ? (

                  <p className="mt-1 font-[family:var(--font-geist-mono)] text-xs text-[color:var(--sem-ai-grid-text-muted)]">

                    {t("metrics.topActionRuns", { count: usage.topActionRuns })}

                  </p>

                ) : null}

              </div>

              <div className="theme-control-surface-soft rounded-xl border px-3 py-2.5">

                <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--sem-ai-grid-text-muted)]">

                  {t("metrics.estimatedCost")}

                </p>

                <p className="mt-1 font-[family:var(--font-geist-mono)] text-lg font-semibold text-[color:var(--sem-ai-grid-text-primary)]">

                  {formatCostUsd(usage.estimatedCostUsd)}

                </p>

                <p className="mt-1 text-[11px] text-[color:var(--sem-ai-grid-text-muted)]">{t("metrics.costDisclaimer")}</p>

              </div>

            </div>

          </>

        ) : (

          <p className="text-sm text-[color:var(--sem-ai-grid-text-secondary)]">

            {usageLoadError ?? t("unavailable")}

          </p>

        )}

      </div>

    </section>

  );

}


