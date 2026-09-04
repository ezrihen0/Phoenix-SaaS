"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ShieldCheck, Tag } from "lucide-react";

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
  platform_billing_enabled?: boolean;
  active_provider: string | null;
  provider_checkout_configured: boolean;
  checkout_urls_configured: boolean;
  webhook_verification_configured: boolean;
  checkout_disabled_reason?: string;
};

type BillingPanelProps = {
  initial: BillingSummaryPayload | null;
  loadError: string | null;
};

type ApiEnvelope<T> = {
  data?: T;
  error?: { message?: string };
};

type RedeemCouponResponse = {
  coupon_code: string;
  message: string;
  billing: BillingSummaryPayload["billing"];
};

async function billingFetch<T>(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "The billing request could not be completed.");
  }

  return payload?.data as T;
}

type BillingStatusPresentation = {
  tone: "healthy" | "attention" | "waiting" | "retry";
  title: string;
  body: string;
};

function getBillingStatusPresentation(
  billingStatus: string,
  attentionReason: string | null,
  cancelAtPeriodEnd: boolean,
  lastProviderSyncAt: string | null,
): BillingStatusPresentation {
  if (billingStatus === "past_due") {
    return {
      tone: "retry",
      title: "Access attention required",
      body: attentionReason
        ? `Billing status requires owner attention: ${attentionReason}.`
        : "Billing status requires owner attention before access should be restored.",
    };
  }

  if (billingStatus === "canceled") {
    return {
      tone: "retry",
      title: cancelAtPeriodEnd ? "Access ending" : "Access canceled",
      body: cancelAtPeriodEnd
        ? "This billing account is set to end at the close of the current period."
        : "This shared billing account is no longer marked active for workspace access.",
    };
  }

  if (billingStatus === "deactivated") {
    return {
      tone: "retry",
      title: "Billing account deactivated",
      body: "Workspace access is blocked until this local billing account is reactivated.",
    };
  }

  if (billingStatus === "unknown") {
    return {
      tone: "waiting",
      title: "Waiting for local access confirmation",
      body: lastProviderSyncAt
        ? "Local billing state has provider history but is not currently marked active or trialing."
        : "No active or trialing access state has been recorded yet.",
    };
  }

  if (billingStatus === "trialing") {
    return {
      tone: "healthy",
      title: "Trial in progress",
      body: "This billing account is in a trial window. CRM access follows the current trial entitlement until the trial ends or converts to paid billing.",
    };
  }

  if (attentionReason) {
    return {
      tone: "attention",
      title: "Billing attention required",
      body: `Status: ${billingStatus} — ${attentionReason}`,
    };
  }

  return {
    tone: "healthy",
    title: `Billing status: ${billingStatus}`,
    body: "Workspace access is controlled by local billing state and controlled access grants.",
  };
}

export function BillingPanel({ initial, loadError }: BillingPanelProps) {
  const router = useRouter();
  const [payload, setPayload] = useState<BillingSummaryPayload | null>(initial);
  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccess, setCouponSuccess] = useState<string | null>(null);
  const [couponSubmitting, setCouponSubmitting] = useState(false);

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
  const activeProvider = payload.platform_billing_enabled
    ? (billing.billing_provider ?? payload.active_provider ?? "None")
    : "None";
  const statusPresentation = getBillingStatusPresentation(
    billing.billing_status,
    billing.attention_reason,
    billing.cancel_at_period_end,
    billing.last_provider_sync_at,
  );
  const statusPanelClassName =
    statusPresentation.tone === "healthy"
      ? "border-[color:var(--cmp-border-accent)] bg-[color:var(--cmp-selected-surface)]"
      : statusPresentation.tone === "waiting"
        ? "border-sky-500/35 bg-sky-500/10"
        : "border-amber-500/40 bg-amber-500/10";
  const statusTitleClassName =
    statusPresentation.tone === "healthy"
      ? "text-[color:var(--sem-display-headline)]"
      : statusPresentation.tone === "waiting"
        ? "text-sky-100"
        : "text-amber-100";
  const statusBodyClassName =
    statusPresentation.tone === "healthy"
      ? "text-[color:var(--sem-text-secondary)]"
      : statusPresentation.tone === "waiting"
        ? "text-sky-100/90"
        : "text-amber-100/90";

  async function handleRedeemCoupon(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedCode = couponCode.trim();
    if (!trimmedCode) {
      setCouponError("Enter a coupon code.");
      setCouponSuccess(null);
      return;
    }

    setCouponSubmitting(true);
    setCouponError(null);
    setCouponSuccess(null);

    try {
      const result = await billingFetch<RedeemCouponResponse>("/api/billing/redeem-coupon", {
        method: "POST",
        body: JSON.stringify({ code: trimmedCode }),
      });

      setPayload((current) =>
        current
          ? {
              ...current,
              billing: result.billing,
            }
          : current,
      );
      setCouponCode("");
      setCouponSuccess(result.message);
      router.refresh();
    } catch (error) {
      setCouponError(error instanceof Error ? error.message : "The coupon could not be applied.");
    } finally {
      setCouponSubmitting(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-[30px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)]">
      <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">WizField billing</p>
      <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-display-headline)]">Shared billing account</h2>
      <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
        The active workspace belongs to a shared WizField billing account. One access profile can cover multiple
        businesses according to the current plan entitlement, while tenant invoice payments stay separate.
      </p>

      <div className={`mt-4 rounded-[18px] border px-4 py-3 ${statusPanelClassName}`}>
        <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">
          {statusPresentation.tone === "healthy" ? "Plan health" : "Billing status"}
        </p>
        <h4 className={`mt-2 text-lg font-semibold ${statusTitleClassName}`}>{statusPresentation.title}</h4>
        <p className={`mt-2 text-sm leading-6 ${statusBodyClassName}`}>{statusPresentation.body}</p>
      </div>

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
          <dt className="text-[color:var(--sem-text-muted)]">Payment provider</dt>
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
          <dt className="text-[color:var(--sem-text-muted)]">SaaS checkout</dt>
          <dd className="mt-1 font-semibold text-[color:var(--sem-text-primary)]">Disabled</dd>
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
          <Tag className="h-8 w-8 text-[color:var(--sem-accent-primary)]" />
          <h4 className="mt-4 text-xl font-semibold text-[color:var(--sem-display-headline)]">Promotional access</h4>
          <p className="mt-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            Apply a Phoenix owner coupon to unlock Business plan features such as inventory management and automations.
          </p>

          <form className="mt-4 space-y-3" onSubmit={handleRedeemCoupon}>
            <label className="block text-xs uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">
              Coupon code
              <input
                className="theme-control-surface mt-2 w-full rounded-[14px] border px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--sem-text-primary)]"
                value={couponCode}
                onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                placeholder="PHOENIXFIREPLACE0"
                autoComplete="off"
                spellCheck={false}
                disabled={couponSubmitting}
              />
            </label>
            <button
              type="submit"
              className="theme-button-primary w-full rounded-[14px] px-4 py-2 text-sm font-semibold disabled:opacity-60"
              disabled={couponSubmitting}
            >
              {couponSubmitting ? "Applying…" : "Apply coupon"}
            </button>
          </form>

          {couponError ? (
            <p className="mt-3 text-sm text-amber-200">{couponError}</p>
          ) : null}
          {couponSuccess ? (
            <p className="mt-3 text-sm text-[color:var(--sem-accent-primary)]">{couponSuccess}</p>
          ) : null}
        </div>

        <div className="rounded-[30px] border border-[color:var(--sem-board-border)] bg-[color:var(--sem-board-glass)] p-5 shadow-[0_24px_70px_color-mix(in_srgb,var(--sem-board-glow)_55%,transparent)]">
          <ShieldCheck className="h-8 w-8 text-[color:var(--sem-accent-primary)]" />
          <h4 className="mt-4 text-xl font-semibold text-[color:var(--sem-display-headline)]">Workspace access</h4>
          <p className="mt-3 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
            SaaS subscription checkout is disabled for the active WizField runtime. Covered businesses inherit the current
            local plan and access state from this shared billing account.
          </p>

          <div className="mt-4 rounded-[18px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Current runtime</p>
            <p className="mt-2 text-sm font-semibold text-[color:var(--sem-text-primary)]">
              No payment provider configured
            </p>
            <p className="mt-2 text-xs leading-5 text-[color:var(--sem-text-muted)]">
              {payload.checkout_disabled_reason ?? "Operational access does not require Stripe configuration or subscription state."}
            </p>
          </div>

          <p className="mt-5 text-xs leading-6 text-[color:var(--sem-text-muted)]">
            CRM invoices and tenant customer payments remain separate operating records and are not processed here.
          </p>
        </div>
      </aside>
    </div>
  );
}
