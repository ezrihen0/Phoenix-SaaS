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
  variant?: "light" | "dark";
};

export function AutomationSentenceSegment({
  label,
  value,
  options,
  onChange,
  variant = "light",
}: AutomationSentenceSegmentProps) {
  const isDark = variant === "dark";

  return (
    <label className="group relative inline-flex w-full items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={
          isDark
            ? "w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 pr-9 text-xs font-semibold text-zinc-100 outline-none transition group-hover:border-white/20"
            : "theme-selected-card cursor-pointer appearance-none rounded-full border px-4 py-2 pr-9 text-sm font-semibold text-[color:var(--sem-text-primary)] outline-none transition group-hover:border-[color:var(--cmp-border-accent)]"
        }
        title={label}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key} className={isDark ? "bg-zinc-950 text-white" : undefined}>
            {option.label}
          </option>
        ))}
      </select>
      <span className={`pointer-events-none absolute right-3 text-xs ${isDark ? "text-zinc-500" : "text-[color:var(--sem-text-muted)]"}`}>⌄</span>
    </label>
  );
}
