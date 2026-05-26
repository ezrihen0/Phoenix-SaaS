"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { AiBrainHomeBriefResponse } from "@/lib/ai/brain-brief-types";

function severityAccentClass(severity: "high" | "medium" | "low") {
  if (severity === "high") {
    return "border-[color:var(--sem-accent-primary)] bg-[color:var(--cmp-surface-card)]";
  }
  if (severity === "medium") {
    return "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-card)]";
  }
  return "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]";
}

export default function HomeIntelligenceStrip({
  brief,
}: {
  brief: AiBrainHomeBriefResponse | null;
}) {
  const homeT = useTranslations("home");
  const commonT = useTranslations("common.actions");
  const [explainIndex, setExplainIndex] = useState<number | null>(null);

  if (!brief) {
    return (
      <section className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">
          {homeT("intelligenceEyebrow")}
        </p>
        <p className="mt-3 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
          {homeT("intelligenceUnavailable")}
        </p>
      </section>
    );
  }

  return (
    <section className="theme-surface-card rounded-[22px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{homeT("liveDashboardSnapshot")}</p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
            Template briefing • deterministic rules • no external model ({brief.wordingMode})
          </p>
        </div>
        <span className="rounded-full border border-[color:var(--cmp-border-subtle)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">
          rules v{brief.rulesEngineVersion}
        </span>
      </div>

      <details className="mt-4 rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-3">
        <summary className="cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
          <span className="text-base font-semibold text-[color:var(--sem-text-primary)]">{brief.briefing.headline}</span>
          <span className="ml-2 text-xs text-[color:var(--sem-text-muted)]">{homeT("tapToExpand")}</span>
        </summary>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--sem-text-secondary)]">{brief.briefing.body}</p>
      </details>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {brief.actions.map((action, index) => (
          <article
            key={`${action.ruleId}-${index}`}
            className={`rounded-[16px] border p-4 ${severityAccentClass(action.severity)}`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--sem-text-muted)]">
              {action.ruleId.replace(/_/g, " ")}
            </p>
            <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">{action.title}</p>
            <p className="mt-1 text-xs text-[color:var(--sem-text-secondary)]">{action.groundingLine}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href={action.href}
                className="theme-control-surface inline-flex rounded-full border border-[color:var(--cmp-border-accent)] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--cmp-hover-surface)]"
              >
                {commonT("open")}
              </Link>
              <button
                type="button"
                className="text-xs font-medium text-[color:var(--sem-accent-primary)] underline-offset-2 hover:underline"
                aria-expanded={explainIndex === index}
                onClick={() => setExplainIndex((current) => (current === index ? null : index))}
              >
                Why we show this
              </button>
            </div>
            {explainIndex === index ? (
              <ul className="mt-3 space-y-1 border-t border-[color:var(--cmp-border-subtle)] pt-3 text-xs text-[color:var(--sem-text-secondary)]">
                {action.explainBullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-[color:var(--sem-text-muted)]">{brief.disclaimer}</p>
    </section>
  );
}
