import { LoaderCircle, PhoneCall } from "lucide-react";

export default function CallsLoading() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
      <section className="theme-surface-modal rounded-[32px] border border-[color:rgba(212,175,55,0.2)] bg-[linear-gradient(170deg,rgba(8,8,8,0.96),rgba(19,19,19,0.9))] p-6 shadow-[0_36px_120px_rgba(0,0,0,0.4)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--flat-gold)]">Calls</p>
            <h1 className="mt-3 flex items-center gap-3 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--text-primary)]">
              <PhoneCall className="h-8 w-8 text-[color:var(--flat-gold)]" />
              Recent Calls
            </h1>
            <div className="mt-3 inline-flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
              <LoaderCircle className="h-4 w-4 animate-spin text-[color:var(--flat-gold)]" />
              Loading the recent calls operations surface...
            </div>
            <div className="mt-3 h-3 w-72 rounded bg-[color:var(--bg-soft)] opacity-45" />
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(255,255,255,0.03)] p-4">
              <div className="h-3 w-28 rounded bg-[color:var(--bg-soft)] opacity-55" />
              <div className="mt-4 h-8 w-14 rounded bg-[color:var(--bg-soft)] opacity-65" />
              <div className="mt-3 h-3 w-full rounded bg-[color:var(--bg-soft)] opacity-40" />
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[color:rgba(255,255,255,0.03)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="h-3 w-24 rounded bg-[color:var(--bg-soft)] opacity-55" />
              <div className="mt-3 h-3 w-56 rounded bg-[color:var(--bg-soft)] opacity-40" />
            </div>
            <div className="h-3 w-24 rounded bg-[color:var(--bg-soft)] opacity-45" />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,0.8fr))_auto]">
            <div className="theme-input-control h-[50px] rounded-[18px] opacity-60" />
            <div className="theme-input-control h-[50px] rounded-[18px] opacity-60" />
            <div className="theme-input-control h-[50px] rounded-[18px] opacity-60" />
            <div className="theme-control-surface h-[50px] rounded-[18px] opacity-60" />
          </div>
        </div>

        <div className="theme-control-surface mt-6 overflow-hidden rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-[linear-gradient(180deg,rgba(20,20,20,0.92),rgba(12,12,12,0.92))]">
          <div className="grid grid-cols-[1.2fr_1.2fr_0.9fr_1fr_1fr_0.8fr_0.9fr_0.9fr_1.1fr] gap-0 border-b border-[color:var(--border-subtle)] bg-[color:rgba(255,255,255,0.03)] px-4 py-3 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            <span>From</span>
            <span>To</span>
            <span>Call Status</span>
            <span>Processing</span>
            <span>Matched Client</span>
            <span>Source</span>
            <span>Recording</span>
            <span>Captured</span>
            <span>Actions</span>
          </div>

          <div className="space-y-0">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="grid grid-cols-[1.2fr_1.2fr_0.9fr_1fr_1fr_0.8fr_0.9fr_0.9fr_1.1fr] items-center gap-4 border-b border-[color:var(--border-subtle)] px-4 py-4 last:border-b-0"
              >
                <div className="h-4 rounded bg-[color:var(--bg-soft)] opacity-70" />
                <div className="h-4 rounded bg-[color:var(--bg-soft)] opacity-60" />
                <div className="h-4 rounded bg-[color:var(--bg-soft)] opacity-60" />
                <div className="h-4 rounded bg-[color:var(--bg-soft)] opacity-50" />
                <div className="h-4 rounded bg-[color:var(--bg-soft)] opacity-60" />
                <div className="h-4 rounded bg-[color:var(--bg-soft)] opacity-50" />
                <div className="h-4 rounded bg-[color:var(--bg-soft)] opacity-50" />
                <div className="h-4 rounded bg-[color:var(--bg-soft)] opacity-50" />
                <div className="flex gap-2">
                  <div className="h-8 flex-1 rounded-[14px] bg-[color:var(--bg-soft)] opacity-60" />
                  <div className="h-8 flex-1 rounded-[14px] bg-[color:var(--bg-soft)] opacity-45" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
