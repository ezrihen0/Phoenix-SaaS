import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import DocumentApprovalActions from "@/components/document-approval-actions";
import DocumentPreview from "@/components/document-preview";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerRoles } from "@/lib/auth/server-session";
import {
  type PersistedQuoteLineItem,
} from "@/lib/crm/quote-line-model";

type EstimateStatus = "draft" | "sent" | "approved" | "rejected";
type EstimateLifecycleStatus = "draft" | "sent" | "approved" | "void" | "converted";

type EstimateDetailRecord = {
  id: string;
  estimate_id: string;
  document_number: string;
  job_id: string;
  customer_id: string;
  customer_name: string;
  job_title: string;
  lifecycle_status: EstimateLifecycleStatus;
  description: string;
  price_cents: number;
  subtotal_cents: number;
  tax_rate_bps_snapshot: number | null;
  tax_cents: number | null;
  total_cents: number;
  status: EstimateStatus;
  sent_at: string | null;
  approval_requested_at: string | null;
  approved_at: string | null;
  signature_requested_at: string | null;
  signature_requested?: boolean;
  signed_at: string | null;
  signed_by_name: string | null;
  is_locked: boolean;
  line_items: PersistedQuoteLineItem[];
};

type EstimateDetailPageProps = {
  params: Promise<{
    estimateId: string;
  }>;
};

function formatLifecycleStatus(status: EstimateLifecycleStatus) {
  if (status === "void") {
    return "Voided";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatPersistedStatus(status: EstimateStatus) {
  if (status === "rejected") {
    return "Rejected";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function EstimateDetailPage({ params }: EstimateDetailPageProps) {
  await requireServerRoles("/estimates", ["owner", "office_admin", "technician"]);
  const { estimateId } = await params;

  let estimate: EstimateDetailRecord | null = null;
  let loadError: string | null = null;

  try {
    estimate = await serverApiFetch<EstimateDetailRecord>(`/api/estimates/${estimateId}`);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "The estimate could not be loaded.";
  }

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 print:max-w-none print:px-0 print:py-0">
        <section className="theme-surface-modal rounded-[32px] p-7 sm:p-8 print:rounded-none print:bg-transparent print:p-0 print:shadow-none">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/estimates"
              className="theme-control-surface inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)] print:hidden"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to estimates
            </Link>
            {estimate ? (
              <>
                <Link
                  href={`/customers/${estimate.customer_id}`}
                  className="theme-control-surface inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)] print:hidden"
                >
                  Customer
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href={`/jobs/${estimate.job_id}`}
                  className="theme-control-surface inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)] print:hidden"
                >
                  Job
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            ) : null}
          </div>

          <p className="mt-6 text-[11px] uppercase tracking-[0.28em] text-[color:var(--sem-accent-primary)]">Estimate Detail</p>
          <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-5xl">
            {estimate?.document_number ?? `Estimate #${estimateId.slice(0, 8)}`}
          </h1>

          {loadError ? (
            <div className="theme-alert-error mt-6 rounded-[20px] border px-4 py-3 text-sm">
              {loadError}
            </div>
          ) : null}

          {!loadError && !estimate ? (
            <div className="theme-control-surface mt-6 rounded-[20px] border px-4 py-4 text-sm text-[color:var(--sem-text-secondary)]">
              Estimate not found.
            </div>
          ) : null}

          {estimate ? (
            <div className="mt-8">
              <DocumentPreview
                documentKind="estimate"
                documentNumber={estimate.document_number}
                description={estimate.description}
                primaryStatusLabel="Lifecycle"
                primaryStatusValue={formatLifecycleStatus(estimate.lifecycle_status)}
                issuedLabel="Sent"
                issuedAt={estimate.sent_at}
                secondaryDateLabel="Approved"
                secondaryDateValue={estimate.approved_at}
                customerName={estimate.customer_name}
                customerCompanyName={null}
                customerEmail={null}
                customerPhone={null}
                customerAddressLines={estimate.job_title ? [estimate.job_title] : []}
                lineItems={estimate.line_items ?? []}
                subtotalCents={estimate.subtotal_cents}
                taxRateBpsSnapshot={estimate.tax_rate_bps_snapshot}
                taxCents={estimate.tax_cents ?? 0}
                totalCents={estimate.total_cents}
                compatibilityTotalLabel="Stored Price"
                compatibilityTotalCents={estimate.price_cents}
              />

              <DocumentApprovalActions
                documentKind="estimate"
                documentId={estimate.id}
                approvalRequestedAt={estimate.approval_requested_at}
                approvedAt={estimate.approved_at}
                signatureRequestedAt={estimate.signature_requested_at}
                signedAt={estimate.signed_at}
                signedByName={estimate.signed_by_name}
                isLocked={estimate.is_locked}
              />

              <section className="theme-surface-card mt-6 rounded-[28px] border border-[color:var(--cmp-border-subtle)] p-5 print:hidden">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--sem-text-muted)]">Snapshot Status</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3 text-sm">
                    <p className="text-[color:var(--sem-text-secondary)]">Lifecycle</p>
                    <p className="mt-2 font-semibold text-[color:var(--sem-text-primary)]">{formatLifecycleStatus(estimate.lifecycle_status)}</p>
                  </div>
                  <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3 text-sm">
                    <p className="text-[color:var(--sem-text-secondary)]">Stored status</p>
                    <p className="mt-2 font-semibold text-[color:var(--sem-text-primary)]">{formatPersistedStatus(estimate.status)}</p>
                  </div>
                  <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3 text-sm">
                    <p className="text-[color:var(--sem-text-secondary)]">Approved</p>
                    <p className="mt-2 font-semibold text-[color:var(--sem-text-primary)]">{estimate.approved_at ? "Yes" : "No"}</p>
                  </div>
                  <div className="rounded-[18px] border border-[color:var(--cmp-border-subtle)] px-4 py-3 text-sm">
                    <p className="text-[color:var(--sem-text-secondary)]">Locked</p>
                    <p className="mt-2 font-semibold text-[color:var(--sem-text-primary)]">{estimate.is_locked ? "Yes" : "No"}</p>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
