"use client";

import { formatSectionLabel } from "./inspection-labels";
import { inspectionPanelClass, inspectionPanelHeaderClass } from "./inspection-command-shell";

type Section = {
  key: string;
  completion_ratio: number;
  completed: number;
  total: number;
};

type InspectionSectionRailProps = {
  sections: Section[];
  activeSectionKey: string | "all" | null;
  onSelectSection: (sectionKey: string | "all") => void;
};

function sectionButtonClass(active: boolean) {
  if (active) {
    return "theme-selected-card w-full rounded-[18px] border px-3 py-2.5 text-left text-sm font-medium shadow-[0_10px_24px_rgba(0,0,0,0.18)]";
  }
  return "theme-control-surface w-full rounded-[18px] border px-3 py-2.5 text-left text-sm text-[color:var(--sem-text-secondary)] transition hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]";
}

export function InspectionSectionRail({ sections, activeSectionKey, onSelectSection }: InspectionSectionRailProps) {
  return (
    <aside className={`overflow-auto ${inspectionPanelClass()}`}>
      <div className={inspectionPanelHeaderClass()}>
        <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-text-muted)]">Sections</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--sem-text-primary)]">Checklist navigation</h2>
      </div>
      <div className="space-y-2 p-4">
        <button type="button" onClick={() => onSelectSection("all")} className={sectionButtonClass(activeSectionKey === "all")}>
          All checklist items
        </button>
        {sections.map((section) => {
          const active = activeSectionKey === section.key;
          return (
            <button key={section.key} type="button" onClick={() => onSelectSection(section.key)} className={sectionButtonClass(active)}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{formatSectionLabel(section.key)}</span>
                <span className="font-mono text-xs opacity-70">{section.completed}/{section.total}</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-[color:var(--cmp-border-subtle)]">
                <div
                  className={`h-1.5 rounded-full ${active ? "bg-[color:var(--sem-accent-primary)]" : "bg-[color:var(--sem-text-primary)]"}`}
                  style={{ width: `${Math.round(section.completion_ratio * 100)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
