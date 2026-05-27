"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { getClientDestination } from "@/lib/auth/client-auth";

type BillingSuccessActivationProps = {
  initialActivationComplete: boolean;
  initialDestination: string | null;
};

const POLL_INTERVAL_MS = 5000;

export function BillingSuccessActivation({
  initialActivationComplete,
  initialDestination,
}: BillingSuccessActivationProps) {
  const router = useRouter();
  const [activationComplete, setActivationComplete] = useState(initialActivationComplete);
  const [destination, setDestination] = useState(initialDestination);
  const [isPolling, setIsPolling] = useState(!initialActivationComplete);

  useEffect(() => {
    if (activationComplete) {
      return;
    }

    let cancelled = false;

    async function pollActivation() {
      try {
        const response = await getClientDestination();
        const nextDestination = response.destination;

        if (cancelled) {
          return;
        }

        if (nextDestination && nextDestination !== "/pricing") {
          setActivationComplete(true);
          setDestination(nextDestination);
          setIsPolling(false);
          router.replace(nextDestination);
          router.refresh();
        }
      } catch {
        // Keep polling — webhook may still be in flight.
      }
    }

    const intervalId = window.setInterval(() => {
      void pollActivation();
    }, POLL_INTERVAL_MS);

    void pollActivation();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activationComplete, router]);

  return (
    <section className="rounded-[32px] border border-[color:var(--cmp-border-subtle)] bg-white/[0.04] p-8 shadow-[0_36px_120px_rgba(0,0,0,0.35)]">
      <p className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--flat-gold)]">Billing</p>
      <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)]">
        {activationComplete ? "Your subscription is active." : "Confirming your subscription…"}
      </h1>
      <p className="mt-4 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
        {activationComplete
          ? "Webhook confirmation has updated your billing access. You can enter your workspace now."
          : "Stripe Checkout returned successfully. WizField activates your workspace after verified webhook synchronization — this usually completes within a minute."}
      </p>

      {!activationComplete && isPolling ? (
        <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-[color:var(--cmp-border-subtle)] bg-black/30 px-4 py-2 text-sm text-[color:var(--sem-text-secondary)]">
          <LoaderCircle className="h-4 w-4 animate-spin text-[color:var(--flat-gold)]" />
          Checking activation status every few seconds…
        </div>
      ) : null}

      {activationComplete && destination ? (
        <div className="mt-6">
          <Link
            href={destination}
            className="inline-flex rounded-full border border-[color:rgba(212,175,55,0.4)] bg-[color:rgba(212,175,55,0.15)] px-5 py-2.5 text-sm font-semibold text-[#f7df97] transition hover:border-[color:rgba(212,175,55,0.55)]"
          >
            Go to Dashboard
          </Link>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/pricing"
            className="inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] px-5 py-2.5 text-sm text-[color:var(--sem-text-primary)] transition hover:text-[color:var(--sem-text-primary)]"
          >
            Return to pricing
          </Link>
          <Link
            href="/settings"
            className="inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] px-5 py-2.5 text-sm text-[color:var(--sem-text-primary)] transition hover:text-[color:var(--sem-text-primary)]"
          >
            Open settings
          </Link>
        </div>
      )}
    </section>
  );
}
