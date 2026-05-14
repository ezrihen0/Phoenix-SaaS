import Link from "next/link";

import { getServerDestination, getServerSession } from "@/lib/auth/server-session";

type BillingSuccessPageContext = {
  searchParams: Promise<{
    session_id?: string;
  }>;
};

export default async function BillingSuccessPage({ searchParams }: BillingSuccessPageContext) {
  const resolvedSearchParams = await searchParams;
  const sessionId = resolvedSearchParams.session_id?.trim() || null;
  const session = await getServerSession();
  const destination = session ? await getServerDestination() : null;
  const activationComplete = Boolean(destination && destination !== "/pricing");

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-[color:var(--sem-text-primary)] lg:px-10">
      <section className="theme-surface-card rounded-[32px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-8">
        <p className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--sem-accent-primary)]">Billing</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          {activationComplete ? "Your subscription is active." : "We received your subscription flow."}
        </h1>
        <p className="mt-4 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
          {activationComplete
            ? "Webhook confirmation has updated your billing access. You can enter your workspace now."
            : "We are confirming activation. Stripe Checkout returning in the browser does not activate the workspace by itself, and this usually completes shortly after verified webhook synchronization."}
        </p>

        {activationComplete && destination ? (
          <div className="mt-6">
            <Link
              href={destination}
              className="inline-flex rounded-full border border-[color:var(--cmp-border-accent)] bg-[color:var(--sem-accent-primary)] px-5 py-2.5 text-sm font-semibold text-[color:var(--cmp-surface-canvas)] transition hover:opacity-90"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <p className="mt-4 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
            Until activation is confirmed, WizField will keep this workspace on the subscription activation path.
          </p>
        )}

        {sessionId && process.env.NODE_ENV === "development" ? (
          <div className="mt-6 rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">Stripe Checkout session id (development only)</p>
            <p className="mt-2 break-all font-mono text-xs text-[color:var(--sem-text-primary)]">{sessionId}</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
