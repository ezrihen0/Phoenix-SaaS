import { LoaderCircle, PhoneCall } from "lucide-react";

import { BoardShell } from "@/components/board/board-shell";

const callsPanelClass =
  "theme-surface-card rounded-[28px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] shadow-[0_18px_40px_color-mix(in_srgb,var(--sem-board-glow)_72%,transparent)] backdrop-blur-md";

export default function CallsLoading() {
  return (
    <BoardShell gridOpacity="subtle">
      <main className="mx-auto max-w-[1760px] px-5 py-6 lg:px-8">
        <header className={`${callsPanelClass} px-6 py-5`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="h-3 w-40 rounded bg-[color:var(--cmp-surface-soft)] opacity-55" />
              <h1 className="mt-4 flex items-center gap-3 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)]">
                <PhoneCall className="h-8 w-8 text-[color:var(--sem-accent-primary)]" />
                Recovery Command Desk
              </h1>
              <div className="mt-3 inline-flex items-center gap-2 text-sm text-[color:var(--sem-text-secondary)]">
                <LoaderCircle className="h-4 w-4 animate-spin text-[color:var(--sem-accent-primary)]" />
                Loading recovery queue...
              </div>
            </div>
          </div>
          <div className="mt-5 h-14 rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] opacity-70" />
        </header>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className={`${callsPanelClass} p-4`}>
              <div className="h-10 w-10 rounded-2xl bg-[color:var(--cmp-surface-soft)] opacity-60" />
              <div className="mt-4 h-3 w-28 rounded bg-[color:var(--cmp-surface-soft)] opacity-55" />
              <div className="mt-3 h-8 w-16 rounded bg-[color:var(--cmp-surface-soft)] opacity-65" />
            </div>
          ))}
        </div>

        <div className={`${callsPanelClass} mt-5 p-4`}>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.62fr)_auto]">
            <div className="theme-input-control h-[50px] rounded-[18px] opacity-60" />
            <div className="theme-input-control h-[50px] rounded-[18px] opacity-60" />
            <div className="theme-input-control h-[50px] rounded-[18px] opacity-60" />
            <div className="theme-control-surface h-[50px] rounded-[18px] opacity-60" />
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className={`${callsPanelClass} min-h-[420px] p-4`}>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-20 rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] opacity-70" />
              ))}
            </div>
          </div>
          <div className={`${callsPanelClass} min-h-[420px] p-4`}>
            <div className="h-6 w-40 rounded bg-[color:var(--cmp-surface-soft)] opacity-55" />
            <div className="mt-4 h-32 rounded-[22px] bg-[color:var(--cmp-surface-soft)] opacity-45" />
            <div className="mt-4 h-24 rounded-[22px] bg-[color:var(--cmp-surface-soft)] opacity-40" />
          </div>
        </div>
      </main>
    </BoardShell>
  );
}
