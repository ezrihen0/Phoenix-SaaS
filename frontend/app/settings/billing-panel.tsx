"use client";

import { useEffect, useState } from "react";

import { crmApiFetch } from "@/lib/crm/browser-api";

export type BillingSummaryPayload = {
  billing: {
    organization_id: string;
    plan_key: string;
    billing_status: string;
    trial_starts_at: string | null;
    trial_ends_at: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    canceled_at: string | null;
    deactivated_at: string | null;
    last_clover_sync_at: string | null;
    clover_customer_id_suffix: string | null;
    clover_subscription_id_suffix: string | null;
    attention_reason: string | null;
  };
  clover_reconcile_configured: boolean;
  clover_ecommerce_configured?: boolean;
  billing_tokenization_configured?: boolean;
  clover_plan_env_configured?: {
    starter: boolean;
    pro: boolean;
    business: boolean;
  };
  reconciled?: boolean;
};

type TokenizationConfigPayload = {
  configured: boolean;
  merchant_id: string;
  api_access_key: string;
  ecommerce_scl_base_url: string;
  environment: string;
};

type BillingPanelProps = {
  initial: BillingSummaryPayload | null;
  loadError: string | null;
};

const planOptions = ["starter", "pro", "business"] as const;

export function BillingPanel({ initial, loadError }: BillingPanelProps) {
  const [payload, setPayload] = useState<BillingSummaryPayload | null>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tokenization, setTokenization] = useState<TokenizationConfigPayload | null>(null);

  const [subscribePlan, setSubscribePlan] = useState<(typeof planOptions)[number]>("starter");
  const [changePlanTarget, setChangePlanTarget] = useState<(typeof planOptions)[number]>("pro");
  const [cardToken, setCardToken] = useState("");
  const [billingEmail, setBillingEmail] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await crmApiFetch<TokenizationConfigPayload>("/api/billing/tokenization-config");
        setTokenization(cfg);
      } catch {
        setTokenization(null);
      }
    })();
  }, []);

  async function reloadSummary() {
    const next = await crmApiFetch<BillingSummaryPayload>("/api/billing/summary");
    setPayload(next);
  }

  async function reconcile() {
    setBusy(true);
    setMessage(null);
    try {
      const next = await crmApiFetch<BillingSummaryPayload>("/api/billing/reconcile", { method: "POST" });
      setPayload(next);
      setMessage(next.reconciled ? "Billing state refreshed from Clover." : "Clover did not return subscription data.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reconcile failed.");
    } finally {
      setBusy(false);
    }
  }

  async function subscribe() {
    setBusy(true);
    setMessage(null);
    try {
      await crmApiFetch<{ billing: BillingSummaryPayload["billing"] }>("/api/billing/subscribe", {
        method: "POST",
        body: JSON.stringify({
          plan_key: subscribePlan,
          source: cardToken.trim(),
          ...(billingEmail.trim() ? { email: billingEmail.trim() } : {}),
        }),
      });
      await reloadSummary();
      setCardToken("");
      setMessage("Subscription created in Clover and local billing was updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Subscribe failed.");
    } finally {
      setBusy(false);
    }
  }

  async function changePlan() {
    setBusy(true);
    setMessage(null);
    try {
      await crmApiFetch<{ billing: BillingSummaryPayload["billing"] }>("/api/billing/change-plan", {
        method: "POST",
        body: JSON.stringify({ plan_key: changePlanTarget }),
      });
      await reloadSummary();
      setMessage("Plan change completed in Clover (old subscription deactivated, new subscription created).");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Plan change failed.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSubscription() {
    setBusy(true);
    setMessage(null);
    try {
      await crmApiFetch<{ billing: BillingSummaryPayload["billing"] }>("/api/billing/cancel-subscription", {
        method: "POST",
      });
      await reloadSummary();
      setMessage("Subscription was deactivated in Clover.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cancel failed.");
    } finally {
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

  const { billing, clover_reconcile_configured } = payload;
  const cloverEcommerceConfigured = payload.clover_ecommerce_configured ?? false;
  const billingTokenizationConfigured = payload.billing_tokenization_configured ?? false;
  const planEnv = payload.clover_plan_env_configured;
  const lifecycleReady = clover_reconcile_configured && cloverEcommerceConfigured;
  const subscribePlanConfigured = Boolean(planEnv?.[subscribePlan]);
  const changePlanTargetConfigured = Boolean(planEnv?.[changePlanTarget]);

  const needsAttention =
    billing.billing_status === "unknown"
    || billing.billing_status === "past_due"
    || Boolean(billing.attention_reason);

  return (
    <section className="theme-surface-card rounded-[28px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-6">
      <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">PhoenixOS SaaS billing</p>
      <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">Clover subscription (organization)</h2>
      <p className="mt-2 text-sm leading-6 text-[color:var(--sem-text-secondary)]">
        This workspace bills the active organization to PhoenixOS via Clover recurring plans. Tenant invoice payments are separate.
      </p>

      {needsAttention ? (
        <div className="mt-4 rounded-[18px] border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">Billing attention</p>
          <p className="mt-1 text-amber-100/90">
            Status: {billing.billing_status}
            {billing.attention_reason ? ` — ${billing.attention_reason}` : ""}
          </p>
        </div>
      ) : null}

      <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
        <div className="theme-control-surface-soft rounded-[16px] border px-4 py-3">
          <dt className="text-[color:var(--sem-text-muted)]">Plan</dt>
          <dd className="mt-1 font-semibold capitalize text-[color:var(--sem-text-primary)]">{billing.plan_key}</dd>
        </div>
        <div className="theme-control-surface-soft rounded-[16px] border px-4 py-3">
          <dt className="text-[color:var(--sem-text-muted)]">Billing status</dt>
          <dd className="mt-1 font-semibold text-[color:var(--sem-text-primary)]">{billing.billing_status}</dd>
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
          <dt className="text-[color:var(--sem-text-muted)]">Last Clover sync</dt>
          <dd className="mt-1 text-[color:var(--sem-text-primary)]">{billing.last_clover_sync_at ?? "—"}</dd>
        </div>
        <div className="theme-control-surface-soft rounded-[16px] border px-4 py-3">
          <dt className="text-[color:var(--sem-text-muted)]">Clover customer (suffix)</dt>
          <dd className="mt-1 font-mono text-xs text-[color:var(--sem-text-primary)]">{billing.clover_customer_id_suffix ?? "—"}</dd>
        </div>
        <div className="theme-control-surface-soft rounded-[16px] border px-4 py-3">
          <dt className="text-[color:var(--sem-text-muted)]">Clover subscription (suffix)</dt>
          <dd className="mt-1 font-mono text-xs text-[color:var(--sem-text-primary)]">{billing.clover_subscription_id_suffix ?? "—"}</dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !clover_reconcile_configured}
          onClick={() => void reconcile()}
          className="rounded-full border border-[color:var(--cmp-border-accent)] bg-[color:var(--sem-accent-primary)] px-5 py-2 text-sm font-semibold text-[color:var(--cmp-surface-canvas)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Syncing…" : "Sync from Clover"}
        </button>
        {!clover_reconcile_configured ? (
          <span className="text-xs text-[color:var(--sem-text-muted)]">
            Set CLOVER_MERCHANT_ID and CLOVER_ACCESS_TOKEN on the server to enable reconcile.
          </span>
        ) : null}
      </div>

      <div className="mt-10 border-t border-[color:var(--cmp-border-subtle)] pt-8">
        <h3 className="text-lg font-semibold text-[color:var(--sem-text-primary)]">Lifecycle (Clover)</h3>
        <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
          Start, change, or cancel the organization subscription. Plan labels in PhoenixOS update only after Clover returns success. Never paste raw card numbers here — only a Clover card token (
          <span className="font-mono text-xs">clv_…</span>
          ) from Clover tokenization or sandbox tools.
        </p>

        {!lifecycleReady ? (
          <p className="mt-3 text-sm text-[color:var(--sem-text-muted)]">
            Configure CLOVER_MERCHANT_ID, CLOVER_ACCESS_TOKEN (recurring), and an ecommerce bearer (CLOVER_ECOMMERCE_ACCESS_TOKEN or
            CLOVER_ACCESS_TOKEN). Set each
            {" "}
            <span className="font-mono text-xs">CLOVER_PLAN_ID_*</span>
            {" "}
            you intend to sell. For Clover.js tokenization, also set CLOVER_ECOMMERCE_PUBLIC_KEY.
          </p>
        ) : null}

        {tokenization?.configured ? (
          <div className="mt-4 rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-black/20 px-4 py-3 text-xs text-[color:var(--sem-text-secondary)]">
            <p className="font-semibold text-[color:var(--sem-text-primary)]">Tokenization bootstrap (owner-only)</p>
            <p className="mt-2 font-mono break-all">merchant_id: {tokenization.merchant_id}</p>
            <p className="mt-1 font-mono break-all">api_access_key (public): {tokenization.api_access_key}</p>
            <p className="mt-1">
              SCL base: {tokenization.ecommerce_scl_base_url} · {tokenization.environment}
            </p>
          </div>
        ) : tokenization && !tokenization.configured ? (
          <p className="mt-3 text-xs text-[color:var(--sem-text-muted)]">
            Tokenization config is incomplete (need merchant id and CLOVER_ECOMMERCE_PUBLIC_KEY). You can still paste a token if the server accepts ecommerce API calls.
          </p>
        ) : null}

        {!billingTokenizationConfigured ? (
          <p className="mt-2 text-xs text-amber-200/80">
            Summary flag billing_tokenization_configured is false until the public ecommerce key is set; Clover.js in the browser needs that key alongside merchant id.
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--sem-text-muted)]">Clover card token</span>
            <input
              type="password"
              autoComplete="off"
              value={cardToken}
              onChange={(event) => setCardToken(event.target.value)}
              placeholder="clv_…"
              className="theme-control-surface-soft rounded-[14px] border px-3 py-2 font-mono text-xs text-[color:var(--sem-text-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--sem-text-muted)]">Billing email (optional, new customers)</span>
            <input
              type="email"
              value={billingEmail}
              onChange={(event) => setBillingEmail(event.target.value)}
              className="theme-control-surface-soft rounded-[14px] border px-3 py-2 text-sm text-[color:var(--sem-text-primary)]"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--sem-text-muted)]">Plan for new subscription</span>
            <select
              value={subscribePlan}
              onChange={(event) => setSubscribePlan(event.target.value as (typeof planOptions)[number])}
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
            disabled={busy || !lifecycleReady || !subscribePlanConfigured || !cardToken.trim()}
            onClick={() => void subscribe()}
            className="rounded-full border border-[color:var(--cmp-border-accent)] bg-[color:var(--sem-accent-primary)] px-5 py-2 text-sm font-semibold text-[color:var(--cmp-surface-canvas)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start subscription
          </button>
        </div>

        <div className="mt-8 flex flex-wrap items-end gap-4 border-t border-[color:var(--cmp-border-subtle)] pt-6">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--sem-text-muted)]">Change plan to</span>
            <select
              value={changePlanTarget}
              onChange={(event) => setChangePlanTarget(event.target.value as (typeof planOptions)[number])}
              className="theme-control-surface-soft rounded-[14px] border px-3 py-2 text-sm capitalize text-[color:var(--sem-text-primary)]"
            >
              {planOptions.map((key) => (
                <option key={key} value={key} disabled={planEnv ? !planEnv[key] : false}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={
              busy
              || !lifecycleReady
              || !changePlanTargetConfigured
              || changePlanTarget === billing.plan_key
            }
            onClick={() => void changePlan()}
            className="rounded-full border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] px-5 py-2 text-sm font-semibold text-[color:var(--sem-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Change plan
          </button>
        </div>

        <div className="mt-6">
          <button
            type="button"
            disabled={busy || !lifecycleReady || !billing.clover_subscription_id_suffix}
            onClick={() => void cancelSubscription()}
            className="rounded-full border border-red-500/50 bg-red-500/15 px-5 py-2 text-sm font-semibold text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel subscription
          </button>
        </div>
      </div>

      {message ? <p className="mt-3 text-sm text-[color:var(--sem-text-secondary)]">{message}</p> : null}
    </section>
  );
}
