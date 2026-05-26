"use client";

import type { ReactNode } from "react";

import { BoardShell } from "@/components/board/board-shell";

export const INSPECTION_SHELL_MAX = "max-w-[1600px]";

export function inspectionPanelClass(extra = "") {
  return [
    "rounded-[28px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)]",
    "shadow-[0_30px_90px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)] backdrop-blur-xl",
    extra,
  ].join(" ").trim();
}

export function inspectionPanelHeaderClass() {
  return "border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-5 py-4";
}

export function inspectionBadgeClass() {
  return "rounded-xl border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-3 py-1.5 font-mono text-xs text-[color:var(--sem-text-secondary)] shadow-sm";
}

export function inspectionOpsZoneClass() {
  return "space-y-5 bg-[color:var(--cmp-surface-soft)] p-5 lg:p-6";
}

type InspectionCommandShellProps = {
  children: ReactNode;
};

export function InspectionCommandShell({ children }: InspectionCommandShellProps) {
  return (
    <BoardShell gridOpacity="subtle">
      <div className={`relative mx-auto ${INSPECTION_SHELL_MAX} px-5 py-6 lg:px-8`}>
        <div className="theme-surface-modal overflow-hidden rounded-[36px] border border-[color:var(--cmp-border-subtle)] shadow-[0_28px_80px_rgba(15,23,42,0.08)]">
          {children}
        </div>
      </div>
    </BoardShell>
  );
}

type InspectionCommandHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon?: ReactNode;
  actions?: ReactNode;
  badges?: ReactNode;
  backLink?: ReactNode;
  sticky?: boolean;
};

export function InspectionCommandHeader({
  eyebrow,
  title,
  subtitle,
  icon,
  actions,
  badges,
  backLink,
  sticky = false,
}: InspectionCommandHeaderProps) {
  return (
    <header
      className={[
        "border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--sem-board-glass)] px-6 py-5 backdrop-blur-md lg:px-8",
        sticky ? "sticky top-0 z-10" : "",
      ].join(" ")}
    >
      {backLink ? <div className="mb-3">{backLink}</div> : null}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {icon ? (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-soft)] text-[color:var(--sem-accent-primary)] shadow-[0_0_18px_color-mix(in_srgb,var(--sem-accent-primary)_22%,transparent)]">
                {icon}
              </span>
            ) : null}
            <p className="text-xs uppercase tracking-[0.34em] text-[color:var(--sem-accent-primary)]">{eyebrow}</p>
          </div>
          <h1 className="mt-3 font-[family:var(--font-flat-display)] text-3xl tracking-tight text-[color:var(--sem-display-headline)] md:text-4xl">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--sem-text-secondary)]">{subtitle}</p>
          {badges ? <div className="mt-4 flex flex-wrap items-center gap-2">{badges}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

type InspectionLightPanelProps = {
  eyebrow?: string;
  title: string;
  hint?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function InspectionLightPanel({ eyebrow, title, hint, icon, children, className = "" }: InspectionLightPanelProps) {
  return (
    <section className={inspectionPanelClass(className)}>
      <div className={inspectionPanelHeaderClass()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            {eyebrow ? <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">{eyebrow}</p> : null}
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--sem-text-primary)]">{title}</h2>
            {hint ? <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">{hint}</p> : null}
          </div>
          {icon ? <span className="text-[color:var(--sem-text-muted)]">{icon}</span> : null}
        </div>
      </div>
      <div className="p-4 lg:p-5">{children}</div>
    </section>
  );
}
