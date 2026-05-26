"use client";

import { useState } from "react";

import { WalletCards } from "lucide-react";

import { createStripeCheckoutSession } from "@/lib/billing/client-billing";

export type BillingSummaryPayload = {
  billing: {
    organization_id: string;
    billing_account_id: string;
    plan_key: string;
    billing_status: string;
    organization_limit: number | null;
    covered_organization_count: number;
    can_add_organization: boolean;
    covered_organizations: Array<{
      organization_id: string;
      name: string;
      slug: string;
      is_active: boolean;
    }>;
    trial_starts_at: string | null;
    trial_ends_at: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    canceled_at: string | null;
    deactivated_at: string | null;
    billing_provider: string | null;
    last_provider_sync_at: string | null;
    provider_customer_id_suffix: string | null;
    provider_subscription_id_suffix: string | null;
    provider_price_id: string | null;
    attention_reason: string | null;
  };
  active_provider: string;
  provider_checkout_configured: boolean;
  checkout_urls_configured: boolean;
  webhook_verification_configured: boolean;
  stripe_price_env_configured?: {
    starter: boolean;
    pro: boolean;
    business: boolean;
  };
};

type BillingPanelProps = {
  initial: BillingSummaryPayload | null;
  loadError: string | null;
};

const planOptions = ["starter", "pro", "business"] as const;

export function BillingPanel({ initial, loadError }: BillingPanelProps) {
  const [payload] = useState<BillingSummaryPayload | null>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<(typeof planOptions)[number]>("starter");

  async function startCheckout() {
    setBusy(true);
    setMessage(null);

    try {
      const session = await createStripeCheckoutSession(selectedPlan);
      window.location.assign(session.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Stripe checkout could not be started.");
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
        <p className="text-sm text-[color:var(--sem-text-secondary)]">{loadError}</p>
      </section>
    );
  }

  if (!payload) {
    return (
      <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
        <p className="text-sm text-[color:var(--sem-text-secondary)]">Billing summary is not available.</p>
      </section>
    );
  }

  const { billing } = payload;
  const planEnv = payload.stripe_price_env_configured;
  const selectedPlanConfigured = Boolean(planEnv?.[selectedPlan]);
  const checkoutReady = payload.provider_checkout_configured && payload.checkout_urls_configured;
  const activeProvider = billing.billing_provider ?? payload.active_provider;

  const needsAttention =
    billing.billing_status === "unknown"
    || billing.billing_status === "past_due"
    || Boolean(billing.attention_reason);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-[30px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)]">
      <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">WizField billing</p>
      <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-display-headline)]">Shared billing account</h2>
      <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
        The active workspace belongs to a shared WizField billing account. One subscription can cover multiple
        businesses according to the current plan entitlement, while tenant invoice payments stay separate.
      </p>

      {needsAttention ? (
        <div className="mt-4 rounded-[18px] border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">Billing attention</p>
          <p className="mt-1 text-amber-100/90">
            Status: {billing.billing_status}
            {billing.attention_reason ? ` — ${billing.attention_reason}` : ""}
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-[18px] border border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)] px-4 py-3">
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Plan health</p>
          <h4 className="mt-2 text-lg font-semibold text-[color:var(--sem-display-headline)]">Billing status: {billing.billing_status}</h4>
          <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            Checkout and plan changes remain controlled through the existing Stripe flow.
          </p>
        </div>
      )}

      <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
        <div className="theme-control-surface-soft rounded-[16px] border px-4 py-3">
          <dt className="text-[color:var(--sem-text-muted)]">Plan</dt>
          <dd className="mt-1 font-semibold capitalize text-[color:var(--sem-text-primary)]">{billing.plan_key}</dd>
        </div>
        <div className="theme-control-surface-soft rounded-[16px] border px-4 py-3">
          <dt className="text-[color:var(--sem-text-muted)]">Businesses covered</dt>
          <dd className="mt-1 font-semibold text-[color:var(--sem-text-primary)]">
            {billing.covered_organization_count}
            {billing.organization_limit === null ? " / unlimited" : ` / ${billing.organization_limit}`}
          </dd>
        </div>
        <div className="theme-control-surface-soft rounded-[16px] border px-4 py-3">
          <dt className="text-[color:var(--sem-text-muted)]">Billing status</dt>
          <dd className="mt-1 font-semibold text-[color:var(--sem-text-primary)]">{billing.billing_status}</dd>
        </div>
        <div className="theme-control-surface-soft rounded-[16px] border px-4 py-3">
          <dt className="text-[color:var(--sem-text-muted)]">Active provider</dt>
          <dd className="mt-1 font-semibold capitalize text-[color:var(--sem-text-primary)]">{activeProvider}</dd>
        </div>
        <div className="theme-control-surface-soft rounded-[16px] border px-4 py-3">
          <dt className="text-[color:var(--sem-text-muted)]">Trial window</dt>
          <dd className="mt-1 text-[color:var(--sem-text-primary)]">
            {billing.trial_starts_at || billing.trial_ends_at
              ? `${billing.trial_starts_at ?? "—"} → ${billing.trial_ends_at ?? "—"}`
              : "Not set"}
          </dd>
        </div>
        <div className="theme-control-surface-soft rounded-[16px] border px-4 py-3">
          <dt className="text-[color:var(--sem-text-muted)]">Last provider sync</dt>
          <dd className="mt-1 text-[color:var(--sem-text-primary)]">{billing.last_provider_sync_at ?? "—"}</dd>
        </div>
        <div className="theme-control-surface-soft rounded-[16px] border px-4 py-3">
          <dt className="text-[color:var(--sem-text-muted)]">Provider customer (suffix)</dt>
          <dd className="mt-1 font-mono text-xs text-[color:var(--sem-text-primary)]">{billing.provider_customer_id_suffix ?? "—"}</dd>
        </div>
        <div className="theme-control-surface-soft rounded-[16px] border px-4 py-3">
          <dt className="text-[color:var(--sem-text-muted)]">Provider subscription (suffix)</dt>
          <dd className="mt-1 font-mono text-xs text-[color:var(--sem-text-primary)]">{billing.provider_subscription_id_suffix ?? "—"}</dd>
        </div>
      </dl>

      <div className="mt-4 rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-4">
        <p className="text-sm font-semibold text-[color:var(--sem-text-primary)]">Covered businesses</p>
        <p className="mt-1 text-xs text-[color:var(--sem-text-muted)]">
          {billing.can_add_organization
            ? "This billing account can cover another business under the current entitlement."
            : "This billing account is at its current business limit."}
        </p>
        <ul className="mt-3 space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
          {billing.covered_organizations.map((organization) => (
            <li key={organization.organization_id} className="flex items-center justify-between gap-3">
              <span className="truncate">{organization.name}</span>
              <span className="text-xs uppercase tracking-[0.16em] text-[color:var(--sem-text-muted)]">
                {organization.is_active ? "Active" : "Inactive"}
              </span>
            </li>
          ))}
        </ul>
      </div>
      </section>

      <aside className="space-y-5">
        <div className="rounded-[30px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)]">
          <WalletCards className="h-8 w-8 text-[color:var(--sem-accent-primary)]" />
          <h4 className="mt-4 text-xl font-semibold text-[color:var(--sem-display-headline)]">Stripe checkout</h4>
          <p className="mt-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            Launch Stripe Checkout for the shared billing account. Covered businesses inherit the same plan after verified
            Stripe webhook events update the local billing account.
          </p>

          {!checkoutReady ? (
            <p className="mt-3 text-sm text-[color:var(--sem-text-muted)]">
              Stripe checkout is not fully configured on the server yet. Set `STRIPE_SECRET_KEY` and ensure the success
              / cancel redirect URLs are configured for this environment.
            </p>
          ) : null}

          {!payload.webhook_verification_configured ? (
            <p className="mt-2 text-xs text-amber-200/80">
              Stripe webhook signature verification is not configured yet. A Checkout success redirect alone does not
              activate the plan.
            </p>
          ) : null}

          <div className="mt-4 space-y-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[color:var(--sem-text-muted)]">Plan for checkout</span>
              <select
                value={selectedPlan}
                onChange={(event) => setSelectedPlan(event.target.value as (typeof planOptions)[number])}
                className="theme-control-surface-soft rounded-[14px] border px-3 py-2 text-sm capitalize text-[color:var(--sem-text-primary)]"
              >
                {planOptions.map((key) => (
                  <option key={key} value={key} disabled={planEnv ? !planEnv[key] : false}>
                    {key}
                    {planEnv && !planEnv[key] ? " (env missing)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !checkoutReady || !selectedPlanConfigured}
              onClick={() => void startCheckout()}
              className="w-full rounded-2xl border border-[color:var(--cmp-border-accent)] bg-[color:var(--sem-accent-primary)] px-4 py-3 text-sm font-semibold text-[color:var(--cmp-surface-canvas)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Redirecting…" : "Start Stripe checkout"}
            </button>
          </div>

          <p className="mt-5 text-xs leading-6 text-[color:var(--sem-text-muted)]">
            In-app Stripe plan change and cancellation controls are intentionally not exposed in this pass.
          </p>

          {message ? <p className="mt-3 text-sm text-[color:var(--sem-text-secondary)]">{message}</p> : null}
        </div>
      </aside>
    </div>
  );
}
