"use client";

import Link from "next/link";
import { ArrowUpRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

export function CustomerTranslationBoundaryPanel() {
  const t = useTranslations("languageStore");

  const supportedKeys = ["supported1", "supported2", "supported3", "supported4"] as const;
  const notSupportedKeys = ["notSupported1", "notSupported2", "notSupported3", "notSupported4", "notSupported5"] as const;

  return (
    <section
      id="translation-boundaries"
      className="sem-ai-inspector-surface scroll-mt-24 rounded-2xl p-5"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--sem-ai-grid-text-muted)]">{t("panels.boundaries")}</p>
      <h2 className="mt-1 text-lg font-semibold text-[color:var(--sem-ai-grid-text-primary)]">{t("reviewBoundaries")}</h2>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="theme-status-success rounded-xl border p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">{t("boundaries.supportedTitle")}</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-[color:var(--sem-ai-grid-text-secondary)]">
            {supportedKeys.map((key) => (
              <li key={key} className="flex gap-2">
                <span className="text-[color:var(--sem-state-success)]">·</span>
                <span>{t(`boundaries.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="theme-control-surface-soft rounded-xl border p-4">
          <div className="flex items-center gap-2 text-[color:var(--sem-ai-grid-text-secondary)]">
            <ShieldAlert className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">{t("boundaries.notSupportedTitle")}</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-[color:var(--sem-ai-grid-text-muted)]">
            {notSupportedKeys.map((key) => (
              <li key={key} className="flex gap-2">
                <span>·</span>
                <span>{t(`boundaries.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/estimates"
          className="theme-control-surface inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition hover:border-[color:var(--cmp-border-accent)]"
        >
          {t("boundaries.estimatesLink")}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/invoices"
          className="theme-control-surface inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition hover:border-[color:var(--cmp-border-accent)]"
        >
          {t("boundaries.invoicesLink")}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
