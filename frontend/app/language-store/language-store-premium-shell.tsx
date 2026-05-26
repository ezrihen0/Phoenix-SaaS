"use client";

import type { ReactNode } from "react";

type LanguageStorePremiumShellProps = {
  children: ReactNode;
};

export function LanguageStorePremiumShell({ children }: LanguageStorePremiumShellProps) {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-slate-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-950/25 via-transparent to-cyan-950/20" />
      <div className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-fuchsia-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
