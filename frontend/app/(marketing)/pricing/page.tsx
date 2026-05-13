import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing — PhoenixOS",
  description: "How PhoenixOS billing aligns with Clover recurring and your organization.",
};

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 lg:px-10 lg:py-20">
      <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--flat-gold)]">Pricing</p>
      <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[#f5ecd2] sm:text-5xl">
        Plans, trials, and founding customers
      </h1>
      <p className="mt-5 text-base leading-7 text-white/65">
        Commercial terms for your rollout are agreed at onboarding. The product&apos;s technical billing model follows the
        locked Gate 13 strategy: hybrid, reconciliation-first Clover recurring under a single merchant, with each
        PhoenixOS organization mapped to one Clover customer and an optional subscription.
      </p>

      <section className="mt-10 space-y-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <h2 className="font-[family:var(--font-flat-display)] text-xl text-[#f5ecd2]">What the product implements</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-white/60">
          <li>
            <strong className="text-white/80">Authoritative writes:</strong> after PhoenixOS-initiated Clover
            subscription create, update, or deactivate, IDs and fields from the API response are stored with{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-xs">last_clover_sync_at</code>.
          </li>
          <li>
            <strong className="text-white/80">Reconciliation:</strong> owner-only{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-xs">POST /api/billing/reconcile</code> can refresh
            state from Clover when merchant credentials and a stored subscription id are configured.
          </li>
          <li>
            <strong className="text-white/80">Single merchant:</strong> one Clover merchant; each organization is a
            Clover customer under that merchant — not per-tenant merchant sprawl.
          </li>
        </ul>
      </section>

      <section className="mt-8 rounded-[28px] border border-[color:rgba(212,175,55,0.22)] bg-[color:rgba(212,175,55,0.06)] p-6 sm:p-8">
        <h2 className="font-[family:var(--font-flat-display)] text-xl text-[#f5ecd2]">Founding customer / trial</h2>
        <p className="mt-3 text-sm leading-7 text-white/65">
          Trial length, founding discounts, and contract minimums are not listed here because they are set with your
          team during onboarding. This page exists so paid acquisition and sales conversations stay aligned with the
          real integration model — not invented list prices on the website.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/contact"
            className="inline-flex rounded-full border border-[color:rgba(212,175,55,0.4)] bg-[color:rgba(212,175,55,0.15)] px-5 py-2.5 text-sm font-medium text-[#f7df97] transition hover:border-[color:rgba(212,175,55,0.55)]"
          >
            Talk to us about access
          </Link>
          <Link href="/landing" className="inline-flex rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/75 transition hover:text-white">
            Back to overview
          </Link>
        </div>
      </section>

      <p className="mt-10 text-xs text-white/40">
        Source: internal Gate 13 billing sync strategy (Clover recurring). No webhook-dependent assumptions for recurring
        lifecycle unless separately proven in sandbox.
      </p>
    </main>
  );
}
