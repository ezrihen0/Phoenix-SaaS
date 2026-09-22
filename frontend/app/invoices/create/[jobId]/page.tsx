import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireServerPermission } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import type { JobStatus } from "@/lib/crm/statuses";

import InvoiceCreateWorkspace from "./invoice-create-workspace";
import type { JobInvoiceRecord } from "@/app/jobs/[jobId]/job-invoice-section";

type RelatedValue<T> = T | T[] | null;

type CustomerRecord = {
  id: string;
  full_name: string;
};

type QuoteRecord = {
  id: string;
};

type InvoiceRecord = JobInvoiceRecord;

type JobDetailRecord = {
  id: string;
  customer_id: string | null;
  title: string;
  status: JobStatus;
  customer: RelatedValue<CustomerRecord>;
  quote: RelatedValue<QuoteRecord>;
  invoice: RelatedValue<InvoiceRecord>;
};

type InvoiceCreateJobPageContext = {
  params: Promise<{
    jobId: string;
  }>;
};

function relationValue<T>(value: RelatedValue<T> | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function InvoiceCreateJobPage({ params }: InvoiceCreateJobPageContext) {
  const { jobId } = await params;
  await requireServerPermission(`/invoices/create/${jobId}`, "invoices.manage");

  let job: JobDetailRecord | null = null;

  try {
    job = await serverApiFetch<JobDetailRecord>(`/api/jobs/${jobId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The job could not be loaded.";

    if (message.toLowerCase().includes("could not be found")) {
      notFound();
    }

    return (
      <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
        <section className="theme-surface-modal mx-auto max-w-5xl rounded-[32px] border border-[color:var(--cmp-border-subtle)] p-8">
          <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">Invoice Composer</p>
          <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight">The job could not be loaded.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--sem-text-secondary)]">{message}</p>
          <Link
            href="/invoices/create"
            className="theme-btn-secondary mt-8 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to invoice setup
          </Link>
        </section>
      </main>
    );
  }

  if (!job) {
    notFound();
  }

  const customer = relationValue(job.customer);
  const quote = relationValue(job.quote);
  const invoice = relationValue(job.invoice);

  return (
    <InvoiceCreateWorkspace
      jobId={job.id}
      jobTitle={job.title}
      jobStatus={job.status}
      customerId={job.customer_id}
      customerName={customer?.full_name ?? "Customer"}
      invoice={invoice}
      quoteId={quote?.id ?? null}
    />
  );
}
