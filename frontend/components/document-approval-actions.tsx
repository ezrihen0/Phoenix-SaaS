"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Lock, PenLine, ShieldCheck, Unlock } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";

type DocumentApprovalActionsProps = {
  documentKind: "invoice" | "estimate";
  documentId: string;
  approvalRequestedAt: string | null;
  approvedAt: string | null;
  signatureRequestedAt: string | null;
  signedAt: string | null;
  signedByName: string | null;
  isLocked: boolean;
  canOpenLockedDocument?: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[16px] border border-[color:var(--cmp-border-subtle)] px-4 py-3 text-sm">
      <span className="text-[color:var(--sem-text-secondary)]">{label}</span>
      <span className="font-medium text-[color:var(--sem-text-primary)]">{value}</span>
    </div>
  );
}

export default function DocumentApprovalActions({
  documentKind,
  documentId,
  approvalRequestedAt,
  approvedAt,
  signatureRequestedAt,
  signedAt,
  signedByName,
  isLocked,
  canOpenLockedDocument = false,
}: DocumentApprovalActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signerName, setSignerName] = useState(signedByName ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const endpointBase = documentKind === "invoice" ? "invoices" : "estimates";

  async function submitAction(action: "request-approval" | "approve" | "request-signature" | "sign" | "open") {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (
      action === "open"
      && !window.confirm("Opening this invoice clears its approval and signature. The customer will need to sign again. Continue?")
    ) {
      return;
    }

    setIsSubmitting(true);

    try {
      await crmApiFetch(`/api/${endpointBase}/${documentId}/${action}`, {
        method: "POST",
        body: action === "sign" ? JSON.stringify({ signedByName: signerName.trim() }) : undefined,
      });

      setSuccessMessage(
        action === "request-approval"
          ? "Approval request saved."
          : action === "approve"
            ? "Document approved."
            : action === "request-signature"
              ? "Signature request saved."
              : action === "open"
                ? "Document opened. Approval and signature were cleared."
                : "Document signed.",
      );
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The document action could not be completed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isBusy = isSubmitting || isPending;

  return (
    <section className="theme-surface-card mt-6 rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5 print:hidden">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Approval & Signature</p>
          <h2 className="mt-2 text-xl font-semibold text-[color:var(--sem-text-primary)]">Internal document controls</h2>
          <p className="mt-2 max-w-2xl text-sm text-[color:var(--sem-text-secondary)]">
            Approval and signature state attaches to the persisted document snapshot. Once approved or signed, customer-facing financial content is locked.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--cmp-border-subtle)] px-4 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--sem-text-secondary)]">
          <Lock className="h-3.5 w-3.5" />
          {isLocked ? "Document locked" : "Document unlocked"}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DetailRow label="Approval requested" value={formatDateTime(approvalRequestedAt)} />
        <DetailRow label="Approved" value={formatDateTime(approvedAt)} />
        <DetailRow label="Signature requested" value={formatDateTime(signatureRequestedAt)} />
        <DetailRow label="Signed" value={signedAt ? `${formatDateTime(signedAt)}${signedByName ? ` by ${signedByName}` : ""}` : "-"} />
      </div>

      {errorMessage ? (
        <div className="theme-alert-error mt-4 rounded-[18px] border px-4 py-3 text-sm">{errorMessage}</div>
      ) : null}

      {successMessage ? (
        <div className="theme-alert-success mt-4 rounded-[18px] border px-4 py-3 text-sm">{successMessage}</div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        {!approvalRequestedAt ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              void submitAction("request-approval");
            }}
            className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Request approval
          </button>
        ) : null}

        {!approvedAt ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              void submitAction("approve");
            }}
            className="theme-btn-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Approve document
          </button>
        ) : null}

        {!signatureRequestedAt ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              void submitAction("request-signature");
            }}
            className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
            Request signature
          </button>
        ) : null}

        {documentKind === "invoice" && isLocked && canOpenLockedDocument ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              void submitAction("open");
            }}
            className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
            Open document
          </button>
        ) : null}
      </div>

      {!signedAt ? (
        <div className="mt-5 flex flex-col gap-3 rounded-[20px] border border-[color:var(--cmp-border-subtle)] p-4 lg:flex-row lg:items-end">
          <label className="flex-1 text-sm text-[color:var(--sem-text-secondary)]">
            <span className="block pb-2">Signer name</span>
            <input
              value={signerName}
              onChange={(event) => setSignerName(event.target.value)}
              className="w-full rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-transparent px-4 py-3 text-sm text-[color:var(--sem-text-primary)] outline-none transition focus:border-[color:var(--cmp-focus-ring)]"
              placeholder="Enter signer name"
            />
          </label>
          <button
            type="button"
            disabled={isBusy || !signerName.trim()}
            onClick={() => {
              void submitAction("sign");
            }}
            className="theme-btn-primary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
            Sign document
          </button>
        </div>
      ) : null}
    </section>
  );
}