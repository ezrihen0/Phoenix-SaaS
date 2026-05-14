type BillingSuccessPageContext = {
  searchParams: Promise<{
    session_id?: string;
  }>;
};

export default async function BillingSuccessPage({ searchParams }: BillingSuccessPageContext) {
  const resolvedSearchParams = await searchParams;
  const sessionId = resolvedSearchParams.session_id?.trim() || null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-[color:var(--sem-text-primary)] lg:px-10">
      <section className="theme-surface-card rounded-[32px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-8">
        <p className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--sem-accent-primary)]">Billing</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Subscription confirmation is processing</h1>
        <p className="mt-4 text-sm leading-7 text-[color:var(--sem-text-secondary)]">
          Stripe Checkout returned successfully, but PhoenixOS will not mark the plan active until verified webhook
          events update the shared billing account. You can return to settings and refresh after webhook delivery is
          configured.
        </p>

        {sessionId ? (
          <div className="mt-6 rounded-[20px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--sem-text-muted)]">Debug session id</p>
            <p className="mt-2 break-all font-mono text-xs text-[color:var(--sem-text-primary)]">{sessionId}</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
