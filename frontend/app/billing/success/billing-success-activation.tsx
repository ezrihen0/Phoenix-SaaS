"use client";

import Link from "next/link";

type BillingSuccessActivationProps = {
  initialActivationComplete: boolean;
  initialDestination: string | null;
};

export function BillingSuccessActivation({
  initialActivationComplete,
  initialDestination,
}: BillingSuccessActivationProps) {
  const destination = initialActivationComplete && initialDestination ? initialDestination : "/home";

  return (
    <section className="rounded-[32px] border border-[color:var(--cmp-border-subtle)] bg-white/[0.04] p-8 shadow-[0_36px_120px_rgba(0,0,0,0.35)]">
      <p className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--flat-gold)]">Workspace access</p>
      <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)]">
        Subscription checkout is not active.
      </h1>
      <p className="mt-4 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
        WizField no longer uses this page to activate workspaces. Phoenix operational access is handled directly by
        local workspace state and controlled access grants, without Stripe configuration or webhook synchronization.
      </p>

      <div className="mt-6">
        <Link
          href={destination}
          className="inline-flex rounded-full border border-[color:rgba(212,175,55,0.4)] bg-[color:rgba(212,175,55,0.15)] px-5 py-2.5 text-sm font-semibold text-[#f7df97] transition hover:border-[color:rgba(212,175,55,0.55)]"
        >
          Go to Dashboard
        </Link>
      </div>
    </section>
  );
}
