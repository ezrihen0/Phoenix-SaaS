"use client";

type SegmentOption = {
  key: string;
  label: string;
  helper?: string;
};

type AutomationSentenceSegmentProps = {
  label: string;
  value: string;
  options: SegmentOption[];
  onChange: (value: string) => void;
  /** @deprecated Use default sem-ai styling; "light" retained for legacy sentence builder only */
  variant?: "light" | "dark" | "ai";
};

export function AutomationSentenceSegment({
  label,
  value,
  options,
  onChange,
  variant = "ai",
}: AutomationSentenceSegmentProps) {
  const isLegacyLight = variant === "light";

  return (
    <label className="group relative inline-flex w-full items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={
          isLegacyLight
            ? "theme-selected-card cursor-pointer appearance-none rounded-full border px-4 py-2 pr-9 text-sm font-semibold text-[color:var(--sem-text-primary)] outline-none transition group-hover:border-[color:var(--cmp-border-accent)]"
            : "w-full cursor-pointer appearance-none rounded-xl border border-[color:var(--sem-ai-inspector-border)] bg-[color:color-mix(in_srgb,var(--sem-ai-inspector-bg)_72%,transparent)] px-3 py-2 pr-9 text-xs font-semibold text-[color:var(--sem-ai-grid-text-primary)] outline-none transition group-hover:border-[color:var(--sem-ai-node-border-selected)] focus-visible:border-[color:var(--sem-ai-node-border-selected)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--sem-ai-node-border-selected)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--sem-ai-grid-canvas)] disabled:cursor-not-allowed disabled:opacity-60"
        }
        title={label}
      >
        {options.map((option) => (
          <option
            key={option.key}
            value={option.key}
            className={
              isLegacyLight
                ? undefined
                : "bg-[color:var(--sem-ai-inspector-bg)] text-[color:var(--sem-ai-grid-text-primary)]"
            }
          >
            {option.label}
          </option>
        ))}
      </select>
      <span
        className={`pointer-events-none absolute right-3 text-xs ${
          isLegacyLight ? "text-[color:var(--sem-text-muted)]" : "text-[color:var(--sem-ai-grid-text-muted)]"
        }`}
      >
        ⌄
      </span>
    </label>
  );
}
