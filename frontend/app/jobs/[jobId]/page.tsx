import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireServerDestination } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { buildAddressQuery, buildGoogleMapsSearchUrl } from "@/lib/crm/display";
import type { Database } from "@/lib/types/database";

import JobDetailWorkspace from "./job-detail-workspace";

type RelatedValue<T> = T | T[] | null;

type CustomerRecord = Pick<
  Database["public"]["Tables"]["customers"]["Row"],
  "id" | "full_name" | "phone" | "email"
>;

type TechnicianRecord = Pick<
  Database["public"]["Tables"]["technicians"]["Row"],
  "id" | "display_name" | "phone" | "specialties" | "is_active"
>;

type ServiceRecord = Pick<
  Database["public"]["Tables"]["services"]["Row"],
  "id" | "name" | "service_type" | "duration_minutes" | "default_price_cents"
>;

type QuoteRecord = {
  id: string;
  description: string;
  price_cents: number;
  subtotal_cents?: number;
  tax_rate_bps_snapshot?: number;
  tax_cents?: number;
  total_cents?: number;
  status: "draft" | "sent" | "approved" | "rejected";
  sent_at: string | null;
  approved_at: string | null;
  signed_at?: string | null;
};

type InvoiceRecord = {
  id: string;
  description: string;
  amount_cents: number;
  subtotal_cents?: number;
  tax_rate_bps_snapshot?: number;
  tax_cents?: number;
  total_cents?: number;
  status: "unpaid" | "paid";
  lifecycle_status?: "sent" | "partial" | "paid" | "refunded" | "overpaid";
  amount_paid_cents?: number;
  refunded_cents?: number;
  balance_cents?: number;
  issued_at: string;
  paid_at: string | null;
};

type JobNoteRecord = {
  id: number;
  job_id: string;
  author_profile_id: string | null;
  author_name: string | null;
  findings: string | null;
  recommendations: string | null;
  photo_urls: string[];
  created_at: string;
  updated_at: string;
};

type JobDetailRecord = Pick<
  Database["public"]["Tables"]["jobs"]["Row"],
  | "id"
  | "customer_id"
  | "assigned_technician_id"
  | "title"
  | "description"
  | "requested_service_type"
  | "status"
  | "service_address_line_1"
  | "service_address_line_2"
  | "service_city"
  | "service_state_or_region"
  | "service_postal_code"
  | "scheduled_for"
  | "scheduled_window"
  | "cancellation_reason"
  | "cancelled_at"
  | "cancelled_by"
  | "created_at"
  | "updated_at"
> & {
  customer: RelatedValue<CustomerRecord>;
  service: RelatedValue<ServiceRecord>;
  technician: RelatedValue<TechnicianRecord>;
  quote: RelatedValue<QuoteRecord>;
  invoice: RelatedValue<InvoiceRecord>;
  notes: JobNoteRecord[];
};

type JobDetailPageContext = {
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

async function requireOfficeAdminJobDetailRoute(nextPath: string) {
  return requireServerDestination(nextPath, "/jobs");
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
      <section className="theme-surface-modal mx-auto max-w-5xl rounded-[32px] border border-[color:var(--cmp-border-subtle)] p-8">
        <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--sem-accent-primary)]">Job Detail</p>
        <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[color:var(--sem-text-primary)]">
          The job detail page could not be loaded.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--sem-text-secondary)]">{message}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/jobs"
            className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to jobs
          </Link>
        </div>
      </section>
    </main>
  );
}

export default async function JobDetailPage({ params }: JobDetailPageContext) {
  const { jobId } = await params;
  await requireOfficeAdminJobDetailRoute(`/jobs/${jobId}`);

  let job: JobDetailRecord | null = null;

  try {
    job = await serverApiFetch<JobDetailRecord>(`/api/jobs/${jobId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The job detail page could not be loaded.";

    if (message.toLowerCase().includes("could not be found")) {
      notFound();
    }

    return <ErrorPanel message={message} />;
  }

  if (!job) {
    notFound();
  }

  const technician = relationValue(job.technician);
  let technicians: TechnicianRecord[] = [];

  try {
    technicians = await serverApiFetch<TechnicianRecord[]>("/api/technicians");
  } catch {
    return <ErrorPanel message="The technician roster could not be loaded." />;
  }

  const assignmentTechniciansMap = new Map<string, TechnicianRecord>();

  for (const assignmentTechnician of technicians) {
    assignmentTechniciansMap.set(assignmentTechnician.id, assignmentTechnician);
  }

  if (technician && !assignmentTechniciansMap.has(technician.id)) {
    assignmentTechniciansMap.set(technician.id, technician);
  }

  const assignmentTechnicians = Array.from(assignmentTechniciansMap.values()).sort((left, right) =>
    left.display_name.localeCompare(right.display_name),
  );

  const googleMapsUrl = buildGoogleMapsSearchUrl(
    buildAddressQuery(
      job.service_address_line_1,
      job.service_address_line_2,
      job.service_city,
      job.service_state_or_region,
      job.service_postal_code,
    ),
  );

  return (
    <JobDetailWorkspace
      initialJob={job}
      assignmentTechnicians={assignmentTechnicians}
      googleMapsUrl={googleMapsUrl}
    />
  );
}
