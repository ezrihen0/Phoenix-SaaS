"use client";

import { formatSectionLabel } from "./inspection-labels";

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

export function InspectionSectionRail({ sections, activeSectionKey, onSelectSection }: InspectionSectionRailProps) {
  return (
    <aside className="overflow-auto rounded-[24px] border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">Sections</p>
      <div className="mt-3 space-y-2">
        <button
          type="button"
          onClick={() => onSelectSection("all")}
          className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${activeSectionKey === "all" ? "border-zinc-900 bg-zinc-950 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300"}`}
        >
          All checklist items
        </button>
        {sections.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => onSelectSection(section.key)}
            className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${activeSectionKey === section.key ? "border-zinc-900 bg-zinc-950 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span>{formatSectionLabel(section.key)}</span>
              <span className="font-mono text-xs opacity-70">{section.completed}/{section.total}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-zinc-200">
              <div
                className={`h-1.5 rounded-full ${activeSectionKey === section.key ? "bg-white" : "bg-zinc-900"}`}
                style={{ width: `${Math.round(section.completion_ratio * 100)}%` }}
              />
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
