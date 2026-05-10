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
};

export function AutomationSentenceSegment({
  label,
  value,
  options,
  onChange,
}: AutomationSentenceSegmentProps) {
  return (
    <label className="group relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="theme-selected-card cursor-pointer appearance-none rounded-full border px-4 py-2 pr-9 text-sm font-semibold text-[color:var(--sem-text-primary)] outline-none transition group-hover:border-[color:var(--cmp-border-accent)]"
        title={label}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 text-xs text-[color:var(--sem-text-muted)]">⌄</span>
    </label>
  );
}
