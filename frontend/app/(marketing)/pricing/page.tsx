import type { Metadata } from "next";
import Link from "next/link";

import { getServerDestination, getServerSession } from "@/lib/auth/server-session";

import { PricingPlans } from "./pricing-plans";

export const metadata: Metadata = {
  title: "Pricing — WizField",
  description: "Shared WizField access plans and multi-business entitlement tiers.",
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
    <main className="mx-auto max-w-6xl px-6 py-16 lg:px-10 lg:py-20">
      <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--flat-gold)]">Pricing</p>
      <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-display-headline)] sm:text-5xl">
        {activationMode ? "Your workspace is ready." : "Shared billing-account plans"}
      </h1>
      <p className="mt-5 text-base leading-7 text-[color:var(--sem-text-secondary)]">
        {activationMode
          ? "Your account and first workspace are ready. WizField operational access is handled directly in the product while SaaS subscription billing remains disabled."
          : "WizField uses one shared access profile per payer, and one entitlement can cover multiple businesses. Tenant invoice payments remain separate from WizField platform access."}
      </p>

      <section className="mt-10 space-y-4 rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-white/[0.04] p-6 sm:p-8">
        <h2 className="font-[family:var(--font-flat-display)] text-xl text-[color:var(--sem-display-headline)]">
          {activationMode ? "What happens next" : "What the product implements"}
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
          <li>
            <strong className="text-[color:var(--sem-text-primary)]">Shared payer authority:</strong>{" "}
            plan ownership and business coverage live on one WizField billing profile for the account owner.
          </li>
          <li>
            <strong className="text-[color:var(--sem-text-primary)]">Access:</strong> live workspace access is controlled by local billing state and controlled access grants.
          </li>
          <li>
            <strong className="text-[color:var(--sem-text-primary)]">No SaaS checkout:</strong> subscription checkout and webhook activation are disabled for the active product runtime.
          </li>
          <li>
            <strong className="text-[color:var(--sem-text-primary)]">Business-count entitlements:</strong> Starter covers 1 business, Pro
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
        <h2 className="font-[family:var(--font-flat-display)] text-xl text-[color:var(--sem-display-headline)]">
          {activationMode ? "Activation notes" : "Founding customer / rollout notes"}
        </h2>
        <p className="mt-3 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
          {activationMode
            ? "Open the workspace to continue setup. No Stripe configuration or subscription sync is required for operational use."
            : "Current rollout access is handled by WizField directly. SaaS subscription billing can be reconsidered later without affecting CRM invoices."}
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
          <Link href="/landing" className="inline-flex rounded-full border border-[color:var(--cmp-border-subtle)] px-5 py-2.5 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)]">
            {activationMode ? "Back to overview" : "Back to overview"}
          </Link>
        </div>
      </section>

      <p className="mt-10 text-xs leading-6 text-[color:var(--sem-text-muted)]">
        CRM invoices and customer payments are tenant operating records. They are not WizField SaaS subscription billing.
      </p>
    </main>
  );
}
