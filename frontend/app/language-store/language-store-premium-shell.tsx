"use client";

import type { ReactNode } from "react";

type LanguageStorePremiumShellProps = {
  children: ReactNode;
};

export function LanguageStorePremiumShell({ children }: LanguageStorePremiumShellProps) {
  return (
    <div className="sem-ai-grid-canvas relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <div aria-hidden="true" className="sem-ai-grid-dot-layer pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="sem-ai-grid-glow-layer pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="sem-ai-grid-vignette-layer pointer-events-none absolute inset-0" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
