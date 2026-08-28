"use client";

export function LeadsCommandHeader() {
  return (
    <header className="border-b border-[color:var(--cmp-border-subtle)] pb-6">
      <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">Demand Inbox</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--text-primary)]">Leads</h1>
      <p className="mt-1 max-w-xl text-sm text-[color:var(--text-secondary)]">
        New opportunities coming into your business
      </p>
    </header>
  );
}
