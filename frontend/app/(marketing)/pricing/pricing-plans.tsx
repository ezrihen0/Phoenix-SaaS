"use client";

import Link from "next/link";
import { useState } from "react";

import { createStripeCheckoutSession } from "@/lib/billing/client-billing";

type PricingPlansProps = {
  ownerMode: boolean;
  authenticated: boolean;
  checkoutCancelled: boolean;
};

const plans = [
  {
    key: "starter",
    title: "Starter",
    coverage: "Covers 1 business",
    body: "Best for a single service brand under one shared PhoenixOS billing account.",
  },
  {
    key: "pro",
    title: "Pro",
    coverage: "Covers up to 3 businesses",
    body: "Designed for owners running a few brands or geographic business entities under one payer.",
  },
  {
    key: "business",
    title: "Business",
    coverage: "Covers more businesses",
    body: "Use when the current local entitlement model needs effectively uncapped shared-account coverage.",
  },
] as const;

export function PricingPlans({ ownerMode, authenticated, checkoutCancelled }: PricingPlansProps) {
  const [busyPlan, setBusyPlan] = useState<(typeof plans)[number]["key"] | null>(null);
  const [message, setMessage] = useState<string | null>(
    checkoutCancelled ? "Stripe checkout was cancelled before confirmation. No plan change was activated." : null,
  );

  async function startCheckout(planKey: (typeof plans)[number]["key"]) {
    setBusyPlan(planKey);
    setMessage(null);

    try {
      const session = await createStripeCheckoutSession(planKey);
      window.location.assign(session.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Stripe checkout could not be started.");
      setBusyPlan(null);
    }
  }

  return (
    <section className="mt-10 grid gap-5 lg:grid-cols-3">
      {plans.map((plan) => (
        <article
          key={plan.key}
          className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.25)]"
        >
          <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--flat-gold)]">{plan.title}</p>
          <h2 className="mt-3 text-2xl font-semibold text-[#f5ecd2]">{plan.coverage}</h2>
          <p className="mt-4 text-sm leading-7 text-white/65">{plan.body}</p>

          <div className="mt-6">
            {ownerMode ? (
              <button
                type="button"
                disabled={busyPlan !== null}
                onClick={() => void startCheckout(plan.key)}
                className="inline-flex w-full items-center justify-center rounded-full border border-[color:rgba(212,175,55,0.4)] bg-[color:rgba(212,175,55,0.15)] px-5 py-3 text-sm font-semibold text-[#f7df97] transition hover:border-[color:rgba(212,175,55,0.55)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyPlan === plan.key ? "Redirecting to Stripe…" : "Start Stripe checkout"}
              </button>
            ) : authenticated ? (
              <Link
                href="/settings"
                className="inline-flex w-full items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white/80 transition hover:text-white"
              >
                Owner session required
              </Link>
            ) : (
              <div className="flex flex-col gap-3">
                <Link
                  href="/signup"
                  className="inline-flex w-full items-center justify-center rounded-full border border-[color:rgba(212,175,55,0.4)] bg-[color:rgba(212,175,55,0.15)] px-5 py-3 text-sm font-semibold text-[#f7df97] transition hover:border-[color:rgba(212,175,55,0.55)]"
                >
                  Sign up first
                </Link>
                <Link
                  href="/login?next=/pricing"
                  className="inline-flex w-full items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm text-white/75 transition hover:text-white"
                >
                  Sign in as owner
                </Link>
              </div>
            )}
          </div>
        </article>
      ))}

      {message ? (
        <div className="lg:col-span-3 rounded-[24px] border border-amber-500/35 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
          {message}
        </div>
      ) : null}
    </section>
  );
}
