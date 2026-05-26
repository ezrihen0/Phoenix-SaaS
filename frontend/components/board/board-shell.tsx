import type { ReactNode } from "react";

type BoardShellProps = {
  children: ReactNode;
  className?: string;
  gridOpacity?: "subtle" | "default";
};

export function BoardShell({ children, className = "", gridOpacity = "default" }: BoardShellProps) {
  const gridClass = gridOpacity === "subtle" ? "opacity-10" : "opacity-20";

  return (
    <div className={`relative min-h-screen overflow-hidden bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)] ${className}`.trim()}>
      <div aria-hidden="true" className="absolute inset-0 theme-overlay-atmosphere" />
      <div aria-hidden="true" className={`absolute inset-0 theme-overlay-grid ${gridClass}`} />
      <div className="relative">{children}</div>
    </div>
  );
}
