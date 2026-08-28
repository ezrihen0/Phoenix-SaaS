"use client";

import type { HomeAiQuickPrompt } from "@/lib/ai/home-ai-types";

export function HomeQuickPrompts({
  prompts,
  disabled,
  onSelect,
}: {
  prompts: HomeAiQuickPrompt[];
  disabled?: boolean;
  onSelect: (message: string) => void;
}) {
  if (prompts.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {prompts.map((prompt) => (
        <button
          key={prompt.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(prompt.message)}
          className="theme-btn-secondary rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {prompt.label}
        </button>
      ))}
    </div>
  );
}
