import { getServerDestination, getServerSession } from "@/lib/auth/server-session";
import { MarketingFunnelShell } from "@/components/marketing-funnel-shell";

import { BillingSuccessActivation } from "./billing-success-activation";

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
    <MarketingFunnelShell>
      <main className="mx-auto max-w-2xl px-6 py-16 text-[color:var(--sem-text-primary)] lg:px-10">
        <BillingSuccessActivation
          initialActivationComplete={activationComplete}
          initialDestination={destination}
        />

        {sessionId && process.env.NODE_ENV === "development" ? (
          <div className="mt-6 rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-black/30 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">Stripe Checkout session id (development only)</p>
            <p className="mt-2 break-all font-mono text-xs text-[color:var(--sem-text-primary)]">{sessionId}</p>
          </div>
        ) : null}
      </main>
    </MarketingFunnelShell>
  );
}
