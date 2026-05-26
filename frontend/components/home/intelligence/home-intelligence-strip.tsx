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
  variant = "default",
}: {
  brief: AiBrainHomeBriefResponse | null;
  variant?: "default" | "executive";
}) {
  const homeT = useTranslations("home");
  const commonT = useTranslations("common.actions");
  const [explainIndex, setExplainIndex] = useState<number | null>(null);
  const compactActions = variant === "executive";
  const panelClass =
    "theme-surface-card rounded-[22px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_18px_55px_color-mix(in_srgb,var(--bg-canvas)_72%,transparent)] backdrop-blur-md";

  if (!brief) {
    return (
      <section className={panelClass}>
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
    <section className={panelClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">{homeT("intelligenceEyebrow")}</p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">
            {homeT("intelligenceMeta", { mode: brief.wordingMode })}
          </p>
        </div>
        <span className="theme-badge rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]">
          rules v{brief.rulesEngineVersion}
        </span>
      </div>

      <details className="theme-control-surface-soft mt-4 rounded-[16px] border px-4 py-3">
        <summary className="cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
          <span className="text-base font-semibold text-[color:var(--sem-text-primary)]">{brief.briefing.headline}</span>
          <span className="ml-2 text-xs text-[color:var(--sem-text-muted)]">{homeT("tapToExpand")}</span>
        </summary>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--sem-text-secondary)]">{brief.briefing.body}</p>
      </details>

      <div className={`mt-4 grid gap-3 md:grid-cols-2 ${compactActions ? "xl:grid-cols-1" : "xl:grid-cols-3"}`}>
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
                className="theme-btn-primary inline-flex rounded-full px-3 py-1.5 text-xs font-medium"
              >
                {commonT("open")}
              </Link>
              <button
                type="button"
                className="text-xs font-medium text-[color:var(--sem-accent-primary)] underline-offset-2 hover:underline"
                aria-expanded={explainIndex === index}
                onClick={() => setExplainIndex((current) => (current === index ? null : index))}
              >
                {homeT("explainAction")}
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
