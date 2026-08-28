import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "WizField — Field-service operating system",
  description:
    "A field-service operating system for owners who are tired of losing calls, jobs, estimates, invoices, and customer history.",
};

export default function LandingPage() {
  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.14),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(191,87,0,0.1),transparent_28%)]" />
      <div className="relative mx-auto max-w-4xl px-6 py-16 lg:px-10 lg:py-24">
        <p className="text-[11px] uppercase tracking-[0.42em] text-[color:var(--flat-gold)]">
          WizField
        </p>
        <h1 className="mt-5 font-[family:var(--font-flat-display)] text-4xl leading-tight tracking-tight text-[color:var(--sem-display-headline)] sm:text-5xl md:text-6xl">
          Stop losing calls, jobs, estimates, invoices, and customer history.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-[color:var(--sem-text-secondary)]">
          WizField is a <strong className="font-medium text-[color:var(--sem-text-primary)]">field-service operating system</strong> for
          owners and teams who run real trucks, real schedules, and real revenue — not a generic CRM bolt-on.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full border border-[color:rgba(212,175,55,0.35)] bg-[linear-gradient(135deg,rgba(212,175,55,0.28),rgba(212,175,55,0.1))] px-6 py-3 text-sm font-medium text-[#f7df97] transition hover:border-[color:rgba(212,175,55,0.5)]"
          >
            Create your workspace
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-soft)] px-6 py-3 text-sm font-medium text-[color:var(--sem-text-primary)] transition hover:border-[color:var(--cmp-border-accent)]"
          >
            Sign in to your workspace
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] px-6 py-3 text-sm font-medium text-[color:var(--sem-text-primary)] transition hover:border-[color:var(--cmp-border-accent)]"
          >
            View pricing and activation
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] px-6 py-3 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)]"
          >
            Request access
          </Link>
        </div>
        <p className="mt-8 max-w-xl text-sm leading-6 text-[color:var(--sem-text-muted)]">
          Self-serve account creation now covers your first workspace. Use{" "}
          <Link href="/signup" className="text-[color:var(--flat-gold)] underline-offset-2 hover:underline">
            Create your workspace
          </Link>
          {" "}to start, or use{" "}
          <Link href="/contact" className="text-[color:var(--flat-gold)] underline-offset-2 hover:underline">
            Contact
          </Link>{" "}
          for assisted onboarding, or{" "}
          <Link href="/login" className="text-[color:var(--flat-gold)] underline-offset-2 hover:underline">
            Sign in
          </Link>{" "}
          if your organization already issued credentials.
        </p>
        <ul className="mt-14 grid gap-6 sm:grid-cols-3">
          {[
            {
              title: "One ledger for the job",
              body: "Leads, jobs, dispatch, estimates, invoices, and history stay attached to the same customer record.",
            },
            {
              title: "Office and field aligned",
              body: "Schedules, status, and findings flow without spreadsheet chaos or lost text threads.",
            },
            {
              title: "Built for operators",
              body: "Fewer dropped handoffs between intake, billing, and follow-up — so revenue does not leak at the edges.",
            },
          ].map(({ title, body }) => (
            <li
              key={title}
              className="rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
            >
              <h2 className="font-[family:var(--font-flat-display)] text-lg text-[color:var(--sem-display-headline)]">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
