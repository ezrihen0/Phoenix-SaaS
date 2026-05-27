import Link from "next/link";
import type { ReactNode } from "react";

const NAV_LINKS = [
  { href: "/landing", label: "Overview" },
  { href: "/pricing", label: "Pricing" },
  { href: "/signup", label: "Sign up" },
  { href: "/contact", label: "Contact" },
] as const;

type MarketingFunnelShellProps = {
  children: ReactNode;
};

export function MarketingFunnelShell({ children }: MarketingFunnelShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--sem-canvas-base)] text-[color:var(--sem-text-primary)]">
      <header className="border-b border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4 lg:px-10">
          <Link
            href="/landing"
            className="font-[family:var(--font-flat-display)] text-lg tracking-tight text-[color:var(--sem-display-headline)] transition hover:text-[color:var(--sem-accent-primary)]"
          >
            WizField
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm text-[color:var(--sem-text-secondary)]">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="transition hover:text-[color:var(--sem-accent-primary)]"
              >
                {label}
              </Link>
            ))}
          </nav>
          <Link
            href="/login"
            className="rounded-full border border-[color:var(--cmp-border-accent)] bg-[color:color-mix(in_srgb,var(--sem-accent-primary)_14%,transparent)] px-4 py-2 text-sm font-medium text-[color:var(--sem-accent-primary)] transition hover:border-[color:var(--cmp-border-accent)]"
          >
            Sign in
          </Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-[color:var(--cmp-border-subtle)] px-6 py-8 text-sm text-[color:var(--sem-text-muted)] lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p>WizField — field-service operations, not generic CRM.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/terms" className="transition hover:text-[color:var(--sem-text-primary)]">Terms</Link>
            <Link href="/privacy" className="transition hover:text-[color:var(--sem-text-primary)]">Privacy</Link>
            <Link href="/contact" className="transition hover:text-[color:var(--sem-text-primary)]">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
