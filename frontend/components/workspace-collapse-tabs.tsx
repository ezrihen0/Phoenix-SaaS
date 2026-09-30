"use client";

import { type ElementType, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type WorkspaceTabOption<T extends string> = {
  id: T;
  label: string;
  icon: ElementType;
  count?: number | null;
  showCount?: boolean;
};

type WorkspaceCollapseTabsProps<T extends string> = {
  tabs: WorkspaceTabOption<T>[];
  activeTab: T | null;
  onToggle: (tab: T) => void;
  children: (tabId: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  panelClassName?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function shouldShowCount<T extends string>(tab: WorkspaceTabOption<T>) {
  if (tab.showCount === false) {
    return false;
  }

  return typeof tab.count === "number";
}

export function WorkspaceCollapseTabs<T extends string>({
  tabs,
  activeTab,
  onToggle,
  children,
  className = "",
  headerClassName = "",
  panelClassName = "",
}: WorkspaceCollapseTabsProps<T>) {
  return (
    <div className={cx("space-y-2", className)}>
      {tabs.map((tab) => {
        const expanded = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <section
            key={tab.id}
            className="overflow-hidden rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)]"
          >
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => onToggle(tab.id)}
              className={cx(
                "flex w-full items-center gap-3 px-4 py-3 text-left transition",
                expanded
                  ? "bg-[color:var(--cmp-selected-surface)]/40 text-[color:var(--sem-accent-primary)]"
                  : "text-[color:var(--sem-text-secondary)] hover:bg-[color:var(--cmp-surface-soft)] hover:text-[color:var(--sem-text-primary)]",
                headerClassName,
              )}
            >
              <span
                className={cx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                  expanded
                    ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-surface-card)]"
                    : "border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)]/80",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{tab.label}</span>
              </span>
              {shouldShowCount(tab) ? (
                <span className="rounded-full bg-[color:var(--cmp-surface-card)] px-2 py-0.5 text-xs font-medium text-[color:var(--sem-text-secondary)]">
                  {tab.count}
                </span>
              ) : null}
              <ChevronDown
                className={cx(
                  "h-4 w-4 shrink-0 text-[color:var(--sem-text-muted)] transition",
                  expanded && "rotate-180",
                )}
              />
            </button>

            {expanded ? (
              <div
                className={cx(
                  "border-t border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-canvas)]/40 p-4 sm:p-5",
                  panelClassName,
                )}
              >
                {children(tab.id)}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
