import { getServerDestination, getServerSession } from "@/lib/auth/server-session";
import { MarketingFunnelShell } from "@/components/marketing-funnel-shell";

import { BillingSuccessActivation } from "./billing-success-activation";

type BillingSuccessPageContext = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function BillingSuccessPage({ searchParams }: BillingSuccessPageContext) {
  await searchParams;
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
      </main>
    </MarketingFunnelShell>
  );
}
