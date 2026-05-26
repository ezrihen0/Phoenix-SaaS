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
      className="scroll-mt-24 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 backdrop-blur-md"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{t("panels.boundaries")}</p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-100">{t("reviewBoundaries")}</h2>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 text-emerald-200">
            <ShieldCheck className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">{t("boundaries.supportedTitle")}</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            {supportedKeys.map((key) => (
              <li key={key} className="flex gap-2">
                <span className="text-emerald-400">·</span>
                <span>{t(`boundaries.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-zinc-700 bg-zinc-900/40 p-4">
          <div className="flex items-center gap-2 text-zinc-300">
            <ShieldAlert className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">{t("boundaries.notSupportedTitle")}</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-zinc-400">
            {notSupportedKeys.map((key) => (
              <li key={key} className="flex gap-2">
                <span className="text-zinc-600">·</span>
                <span>{t(`boundaries.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/estimates"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-zinc-600"
        >
          {t("boundaries.estimatesLink")}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/invoices"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-zinc-600"
        >
          {t("boundaries.invoicesLink")}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
