"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";

import { CrmApiError, crmApiFetch } from "@/lib/crm/browser-api";
import { financeApiErrorMessage, financeApiErrorSupportRef } from "@/lib/crm/finance-api-errors";
import { resolvePaymentAttempt } from "@/lib/crm/invoice-payment-attempt.mjs";
import { formatCurrencyFromCents } from "@/lib/crm/invoice-line-model";
export { formatPaymentEntryType } from "@/lib/crm/invoice-payment-labels";

export type InvoicePaymentMethod = "cash" | "check" | "card_manual" | "bank_transfer" | "other";

type InvoicePaymentFormProps = {
  invoiceId: string;
  balanceCents: number;
  canRecordPayment: boolean;
  /** Shorter layout for job tab */
  variant?: "default" | "compact";
  notePrefix?: string;
  onPaymentRecorded?: () => void | Promise<void>;
};

function parseAmountDollarsToCents(input: string) {
  const normalized = input.replace(/[^0-9.]/g, "");
  const dollars = Number.parseFloat(normalized);
  if (!Number.isFinite(dollars) || dollars <= 0) {
    return null;
  }

  return Math.round(dollars * 100);
}

function resolvePaymentError(error: unknown, fallback: string) {
  if (error instanceof CrmApiError) {
    return {
      message: financeApiErrorMessage(error.code, error.message || fallback),
      supportRef: financeApiErrorSupportRef(error.code),
    };
  }

  if (error instanceof Error && error.message.trim()) {
    return { message: error.message, supportRef: null };
  }

  return { message: fallback, supportRef: null };
}

export default function InvoicePaymentForm({
  invoiceId,
  balanceCents,
  canRecordPayment,
  variant = "default",
  notePrefix = "Recorded from invoice workflow.",
  onPaymentRecorded,
}: InvoicePaymentFormProps) {
  const router = useRouter();
  const [amountInput, setAmountInput] = useState("");
  const [method, setMethod] = useState<InvoicePaymentMethod>("other");
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorSupportRef, setErrorSupportRef] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const paymentAttemptRef = useRef<{
    fingerprint: string;
    idempotencyKey: string;
    succeeded: boolean;
  } | null>(null);

  const canAcceptPayment = canRecordPayment && balanceCents > 0;

  async function submitPayment(amountCents: number, note: string) {
    if (!canAcceptPayment || isBusy) {
      return;
    }

    if (amountCents <= 0) {
      setErrorMessage("Enter a payment amount greater than zero.");
      setErrorSupportRef(null);
      return;
    }

    if (amountCents > balanceCents) {
      setErrorMessage("Payment cannot exceed the remaining balance.");
      setErrorSupportRef(null);
      return;
    }

    const attempt = resolvePaymentAttempt(
      paymentAttemptRef.current,
      { amountCents, method, note },
      () => crypto.randomUUID(),
    );
    paymentAttemptRef.current = attempt;

    setIsBusy(true);
    setErrorMessage(null);
    setErrorSupportRef(null);
    setSuccessMessage(null);

    try {
      await crmApiFetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: attempt.idempotencyKey,
          entryType: "payment",
          amountCents,
          method,
          note,
        }),
      });
      paymentAttemptRef.current = { ...attempt, succeeded: true };

      setAmountInput("");
      setSuccessMessage("Payment recorded.");
      if (onPaymentRecorded) {
        await onPaymentRecorded();
      } else {
        router.refresh();
      }
    } catch (error) {
      const resolved = resolvePaymentError(error, "The payment could not be recorded.");
      setErrorMessage(resolved.message);
      setErrorSupportRef(resolved.supportRef);
    } finally {
      setIsBusy(false);
    }
  }

  async function recordEnteredAmount() {
    const amountCents = parseAmountDollarsToCents(amountInput);
    if (amountCents === null) {
      setErrorMessage("Enter a valid payment amount.");
      setErrorSupportRef(null);
      return;
    }

    await submitPayment(amountCents, notePrefix);
  }

  async function recordFullBalance() {
    await submitPayment(balanceCents, notePrefix);
  }

  if (!canRecordPayment) {
    return (
      <p className="text-sm text-[color:var(--sem-text-secondary)]">
        Your account cannot record payments on this invoice.
      </p>
    );
  }

  if (balanceCents <= 0) {
    return (
      <p className="text-sm text-[color:var(--sem-text-secondary)]">This invoice has no balance due.</p>
    );
  }

  const isCompact = variant === "compact";

  return (
    <div className={`min-w-0 ${isCompact ? "space-y-3" : "space-y-4"}`}>
      {!isCompact ? (
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Record payment</p>
          <p className="mt-1 text-sm text-[color:var(--sem-text-secondary)]">
            Balance due:{" "}
            <span className="font-semibold text-[color:var(--sem-text-primary)]">
              {formatCurrencyFromCents(balanceCents)}
            </span>
          </p>
        </div>
      ) : null}

      <div className={`grid gap-3 ${isCompact ? "" : "sm:grid-cols-2"}`}>
        <label className="block space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
          <span>Amount</span>
          <input
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            placeholder="0.00"
            disabled={isBusy}
            aria-describedby={errorMessage ? "invoice-payment-error" : undefined}
            className="w-full rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-3 text-[color:var(--sem-text-primary)] outline-none transition focus:border-[color:var(--cmp-focus-ring)] disabled:opacity-60"
          />
        </label>
        <label className="block space-y-2 text-sm text-[color:var(--sem-text-secondary)]">
          <span>Method</span>
          <select
            value={method}
            disabled={isBusy}
            onChange={(event) => setMethod(event.target.value as InvoicePaymentMethod)}
            className="w-full rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] px-4 py-3 text-[color:var(--sem-text-primary)] outline-none transition focus:border-[color:var(--cmp-focus-ring)] disabled:opacity-60"
          >
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="card_manual">Card</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>

      {errorMessage ? (
        <div
          id="invoice-payment-error"
          className="theme-alert-error rounded-[16px] border px-4 py-3 text-sm"
          role="alert"
        >
          <p>{errorMessage}</p>
          {errorSupportRef ? <p className="mt-1 text-xs opacity-80">{errorSupportRef}</p> : null}
        </div>
      ) : null}

      {successMessage ? (
        <div className="theme-alert-success rounded-[16px] border px-4 py-3 text-sm">{successMessage}</div>
      ) : null}

      <div className={`flex flex-col gap-3 ${isCompact ? "" : "sm:flex-row"}`}>
        <button
          type="button"
          disabled={isBusy || !canAcceptPayment}
          onClick={() => {
            void recordEnteredAmount();
          }}
          className="theme-btn-secondary inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          Record payment
        </button>
        <button
          type="button"
          disabled={isBusy || !canAcceptPayment}
          onClick={() => {
            void recordFullBalance();
          }}
          className="theme-btn-primary inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Pay full balance ({formatCurrencyFromCents(balanceCents)})
        </button>
      </div>
    </div>
  );
}
