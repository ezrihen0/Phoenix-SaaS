"use client";

import Link from "next/link";
import { useState } from "react";

import { createStripeCheckoutSession } from "@/lib/billing/client-billing";
import { PLAN_DISPLAY_CATALOG, type BillingPlanKey } from "@/lib/billing/plan-display";

type PricingPlansProps = {
  ownerMode: boolean;
  authenticated: boolean;
  checkoutCancelled: boolean;
  activationMode: boolean;
};

export function PricingPlans({ ownerMode, authenticated, checkoutCancelled, activationMode }: PricingPlansProps) {
  const [busyPlan, setBusyPlan] = useState<BillingPlanKey | null>(null);
  const [message, setMessage] = useState<string | null>(
    checkoutCancelled
      ? activationMode
        ? "Complete your subscription to activate your workspace."
        : "Stripe checkout was cancelled before confirmation. No plan change was activated."
      : null,
  );

  async function startCheckout(planKey: BillingPlanKey) {
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
    <>
      <section className="mt-10 grid gap-5 lg:grid-cols-3">
        {PLAN_DISPLAY_CATALOG.map((plan) => (
          <article
            key={plan.key}
            className="rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.25)]"
          >
            <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--flat-gold)]">{plan.title}</p>
            <p className="mt-3 text-3xl font-semibold text-[#f7df97]">{plan.monthlyPriceLabel}</p>
            {plan.annualPriceLabel ? (
              <p className="mt-1 text-sm text-[color:var(--sem-text-muted)]">or {plan.annualPriceLabel} billed annually</p>
            ) : null}
            <h2 className="mt-4 text-xl font-semibold text-[color:var(--sem-display-headline)]">{plan.coverage}</h2>
            <p className="mt-3 text-sm leading-7 text-[color:var(--sem-text-secondary)]">{plan.body}</p>
            <ul className="mt-4 space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span className="text-[color:var(--flat-gold)]">•</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6">
              {ownerMode ? (
                <button
                  type="button"
                  disabled={busyPlan !== null}
                  onClick={() => void startCheckout(plan.key)}
                  className="inline-flex w-full items-center justify-center rounded-full border border-[color:rgba(212,175,55,0.4)] bg-[color:rgba(212,175,55,0.15)] px-5 py-3 text-sm font-semibold text-[#f7df97] transition hover:border-[color:rgba(212,175,55,0.55)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyPlan === plan.key ? "Redirecting to Stripe…" : activationMode ? "Start Plan" : "Start Stripe checkout"}
                </button>
              ) : authenticated ? (
                <Link
                  href="/settings"
                  className="inline-flex w-full items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] px-5 py-3 text-sm font-medium text-[color:var(--sem-text-primary)] transition hover:text-[color:var(--sem-text-primary)]"
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
                    className="inline-flex w-full items-center justify-center rounded-full border border-[color:var(--cmp-border-subtle)] px-5 py-3 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)]"
                  >
                    Sign in as owner
                  </Link>
                </div>
              )}
            </div>
          </article>
        ))}
      </section>

      {message ? (
        <div className="mt-6 rounded-[20px] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {message}
        </div>
      ) : null}

      <section className="mt-10 overflow-x-auto rounded-[24px] border border-[color:var(--cmp-border-subtle)] bg-white/[0.03]">
        <table className="min-w-full text-left text-sm text-[color:var(--sem-text-secondary)]">
          <thead>
            <tr className="border-b border-[color:var(--cmp-border-subtle)] text-[11px] uppercase tracking-[0.2em] text-[color:var(--sem-text-muted)]">
              <th className="px-4 py-3">Feature</th>
              {PLAN_DISPLAY_CATALOG.map((plan) => (
                <th key={plan.key} className="px-4 py-3">{plan.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Business workspaces", values: ["1", "Up to 3", "Expanded"] },
              { label: "Calls + messaging desk", values: ["Included", "Included", "Included"] },
              { label: "Jobs, estimates, invoices", values: ["Included", "Included", "Included"] },
              { label: "Growth Center", values: ["—", "Included", "Included"] },
            ].map((row) => (
              <tr key={row.label} className="border-b border-white/5">
                <td className="px-4 py-3 font-medium text-[color:var(--sem-text-primary)]">{row.label}</td>
                {row.values.map((value, index) => (
                  <td key={`${row.label}-${index}`} className="px-4 py-3">{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
