"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

import JobQuoteSection, { type JobQuoteRecord } from "@/app/jobs/[jobId]/job-quote-section";
import { getJobStatusLabel, type JobStatus } from "@/lib/crm/statuses";

type ToastTone = "success" | "error" | "warning";

type EstimateCreateWorkspaceProps = {
  jobId: string;
  jobTitle: string;
  jobStatus: JobStatus;
  customerId: string | null;
  customerName: string;
  quote: JobQuoteRecord | null;
};

export default function EstimateCreateWorkspace({
  jobId,
  jobTitle,
  jobStatus,
  customerId,
  customerName,
  quote,
}: EstimateCreateWorkspaceProps) {
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);

  const pushToast = useCallback((message: string, tone: ToastTone = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, 4200);
  }, []);

  const chooserHref = customerId
    ? `/estimates/create?customerId=${encodeURIComponent(customerId)}`
    : "/estimates/create";

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
        {toast ? (
          <div
            className={`fixed right-6 top-6 z-50 max-w-sm rounded-[20px] border px-4 py-3 text-sm shadow-lg ${
              toast.tone === "error"
                ? "border-rose-500/40 bg-rose-950/90 text-rose-100"
                : toast.tone === "warning"
                  ? "border-amber-500/40 bg-amber-950/90 text-amber-100"
                  : "border-emerald-500/40 bg-emerald-950/90 text-emerald-100"
            }`}
          >
            {toast.message}
          </div>
        ) : null}

        <section className="theme-surface-modal rounded-[36px] p-7 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">Estimate Composer</p>
              <h1 className="mt-4 max-w-3xl font-[family:var(--font-flat-display)] text-2xl tracking-tight text-[color:var(--sem-text-primary)] sm:text-3xl lg:text-4xl">
                {customerName}
              </h1>
              <p className="mt-3 text-sm text-[color:var(--sem-text-secondary)]">
                {jobTitle} · {getJobStatusLabel(jobStatus)}
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-[color:var(--sem-text-secondary)]">
                Build or update the estimate for this job. Saving keeps you in this composer; use View Estimate when you want the detail page.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={chooserHref}
                className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to job list
              </Link>
              <Link
                href={`/jobs/${jobId}?tab=quote`}
                className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)]"
              >
                <ExternalLink className="h-4 w-4" />
                Job tab
              </Link>
            </div>
          </div>
        </section>

        <div className="mt-6">
          <JobQuoteSection
            key={`owner-estimate:${jobId}`}
            jobId={jobId}
            quote={quote}
            variant="owner"
            onToast={pushToast}
          />
        </div>
      </div>
    </main>
  );
}
