import Link from "next/link";
import type { ReactNode } from "react";

const NAV_LINKS = [
  { href: "/landing", label: "Overview" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
] as const;

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--flat-canvas)] text-white">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4 lg:px-10">
          <Link
            href="/landing"
            className="font-[family:var(--font-flat-display)] text-lg tracking-tight text-[#f5ecd2] transition hover:text-[color:var(--flat-gold)]"
          >
            WizField
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm text-white/70">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="transition hover:text-[color:var(--flat-gold)]"
              >
                {label}
              </Link>
            ))}
          </nav>
          <Link
            href="/login"
            className="rounded-full border border-[color:rgba(212,175,55,0.35)] bg-[color:rgba(212,175,55,0.12)] px-4 py-2 text-sm font-medium text-[#f7df97] transition hover:border-[color:rgba(212,175,55,0.5)]"
          >
            Sign in
          </Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-white/10 px-6 py-8 text-sm text-white/50 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p>WizField — field-service operations, not generic CRM.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/terms" className="hover:text-white/80">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-white/80">
              Privacy
            </Link>
            <Link href="/contact" className="hover:text-white/80">
              Contact
            </Link>
            <Link href="/login" className="hover:text-white/80">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
