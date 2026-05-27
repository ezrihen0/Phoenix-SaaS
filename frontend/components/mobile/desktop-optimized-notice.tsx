"use client";

import { Monitor } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  getMobileModulePolicy,
  getMobileModulePolicyReason,
} from "@/lib/navigation/mobile-module-policy";

type DesktopOptimizedNoticeProps = {
  href: string;
};

export function DesktopOptimizedNotice({ href }: DesktopOptimizedNoticeProps) {
  const t = useTranslations("shell.mobile");
  const policy = getMobileModulePolicy(href);

  if (policy === "core") {
    return null;
  }

  return (
    <section
      aria-live="polite"
      className="mb-4 rounded-[18px] border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] px-4 py-3 lg:hidden"
    >
      <div className="flex items-start gap-3">
        <div className="theme-status-warning flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border">
          <Monitor className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">
            {policy === "desktopOnly" ? t("desktopOnlyTitle") : t("limitedTitle")}
          </p>
          <p className="mt-1 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            {getMobileModulePolicyReason(href)}
          </p>
          <p className="mt-2 text-xs text-[color:var(--sem-text-muted)]">{t("continueAnyway")}</p>
        </div>
      </div>
    </section>
  );
}
