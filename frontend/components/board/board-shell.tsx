import type { ReactNode } from "react";

type BoardShellProps = {
  children: ReactNode;
  className?: string;
  gridOpacity?: "subtle" | "default";
};

export function BoardShell({ children, className = "", gridOpacity = "default" }: BoardShellProps) {
  const gridClass = gridOpacity === "subtle" ? "opacity-[0.14]" : "opacity-[0.28]";

  return (
    <div className={`relative min-h-screen overflow-hidden bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)] ${className}`.trim()}>
      <div aria-hidden="true" className="absolute inset-0 theme-overlay-atmosphere" />
      <div aria-hidden="true" className={`absolute inset-0 theme-overlay-grid ${gridClass}`} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--sem-accent-primary)_55%,transparent),color-mix(in_srgb,var(--sem-action-secondary)_45%,transparent),transparent)]"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
