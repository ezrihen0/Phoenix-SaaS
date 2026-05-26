import type { Metadata } from "next";
import Link from "next/link";

import { getServerDestination, getServerSession } from "@/lib/auth/server-session";

import { PricingPlans } from "./pricing-plans";

export const metadata: Metadata = {
  title: "Pricing — WizField",
  description: "Shared billing-account plans for Stripe Checkout and multi-business WizField entitlements.",
};

type PricingPageContext = {
  searchParams: Promise<{
    checkout?: string;
  }>;
};

export default async function PricingPage({ searchParams }: PricingPageContext) {
  const resolvedSearchParams = await searchParams;
  const session = await getServerSession();
  const authenticated = Boolean(session?.user?.id);
  const destination = authenticated ? await getServerDestination() : null;
  const activationMode = destination === "/pricing";
  const ownerMode = session?.profile?.role === "owner" && Boolean(session.active_organization?.id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 lg:px-10 lg:py-20">
      <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--flat-gold)]">Pricing</p>
      <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[#f5ecd2] sm:text-5xl">
        {activationMode ? "Your workspace is ready." : "Shared billing-account plans"}
      </h1>
      <p className="mt-5 text-base leading-7 text-white/65">
        {activationMode
          ? "Activate your subscription to start running your business with WizField. Your account and first workspace are already prepared, but live CRM access stays locked until billing is confirmed."
          : "WizField uses one shared billing account per payer, and one subscription can cover multiple businesses under the same entitlement. Stripe Checkout is the active subscription checkout path; tenant invoice payments remain separate from WizField platform billing."}
      </p>

      <section className="mt-10 space-y-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <h2 className="font-[family:var(--font-flat-display)] text-xl text-[#f5ecd2]">
          {activationMode ? "What happens next" : "What the product implements"}
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-white/60">
          <li>
            <strong className="text-white/80">Shared payer authority:</strong>{" "}
            your subscription and payer identity live on one WizField billing profile—the same profile Stripe Checkout updates when payment succeeds.
          </li>
          <li>
            <strong className="text-white/80">Checkout:</strong> owner-authenticated Stripe Checkout Sessions create the
            hosted subscription flow without collecting raw card details inside WizField.
          </li>
          <li>
            <strong className="text-white/80">Webhook activation:</strong> WizField waits for verified Stripe webhook
            events before local billing state is treated as active.
          </li>
          <li>
            <strong className="text-white/80">Business-count entitlements:</strong> Starter covers 1 business, Pro
            covers up to 3 businesses, and Business can cover more businesses under the same shared account.
          </li>
        </ul>
      </section>

      <PricingPlans
        ownerMode={ownerMode}
        authenticated={authenticated}
        checkoutCancelled={resolvedSearchParams.checkout === "cancelled"}
        activationMode={activationMode}
      />

      <section className="mt-8 rounded-[28px] border border-[color:rgba(212,175,55,0.22)] bg-[color:rgba(212,175,55,0.06)] p-6 sm:p-8">
        <h2 className="font-[family:var(--font-flat-display)] text-xl text-[#f5ecd2]">
          {activationMode ? "Activation notes" : "Founding customer / rollout notes"}
        </h2>
        <p className="mt-3 text-sm leading-7 text-white/65">
          {activationMode
            ? "Choose a plan and complete Stripe Checkout to activate this workspace. If checkout is interrupted, return here and continue from the same activation page."
            : "Choose a plan and complete Stripe Checkout to activate this workspace. Activation usually completes within a minute after payment via verified webhook sync."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {activationMode ? null : (
            <Link
              href="/contact"
              className="inline-flex rounded-full border border-[color:rgba(212,175,55,0.4)] bg-[color:rgba(212,175,55,0.15)] px-5 py-2.5 text-sm font-medium text-[#f7df97] transition hover:border-[color:rgba(212,175,55,0.55)]"
            >
              Talk to us about access
            </Link>
          )}
          <Link href="/landing" className="inline-flex rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/75 transition hover:text-white">
            {activationMode ? "Back to overview" : "Back to overview"}
          </Link>
        </div>
      </section>

      <p className="mt-10 text-xs text-white/40">
        Activation is confirmed by verified Stripe webhook processing, not by a success-page redirect alone.
      </p>
    </main>
  );
}
