import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList, MapPin, UserRound } from "lucide-react";

import { requireServerDestination } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { formatAddress } from "@/lib/crm/display";
import type { Database } from "@/lib/types/database";

import CreateJobForm from "./create-job-form";

type SearchParam = string | string[] | undefined;
type ServiceType = Database["public"]["Enums"]["service_type"];
type CustomerRecord = Database["public"]["Tables"]["customers"]["Row"];
type LeadRecord = Database["public"]["Tables"]["leads"]["Row"];
type TechnicianRecord = Pick<
  Database["public"]["Tables"]["technicians"]["Row"],
  "id" | "display_name" | "phone" | "specialties" | "is_active" | "last_seen_at"
>;

type NewJobSource = {
  kind: "customer" | "lead";
  customerId: string | null;
  leadId: string | null;
  customerLabel: string;
  phone: string;
  email: string | null;
  serviceAddressLine1: string;
  serviceAddressLine2: string | null;
  serviceCity: string;
  serviceStateOrRegion: string | null;
  servicePostalCode: string;
  defaultServiceType: ServiceType;
  defaultInternalNotes: string;
  backHref: string;
  backLabel: string;
  sourceMessage: string;
};

type NewJobPageContext = {
  searchParams: Promise<{
    customerId?: SearchParam;
    leadId?: SearchParam;
  }>;
};

function firstSearchValue(value: SearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

function ErrorPanel({
  eyebrow,
  title,
  message,
}: {
  eyebrow: string;
  title: string;
  message: string;
}) {
  return (
    <main className="min-h-screen bg-[color:var(--flat-canvas)] px-6 py-10 text-white lg:px-10">
      <section className="mx-auto max-w-5xl rounded-[32px] border border-white/10 bg-black/20 p-8 backdrop-blur-xl">
        <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--flat-gold)]">{eyebrow}</p>
        <h1 className="mt-4 font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[#f5ecd2]">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/64">{message}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-white/72 transition hover:border-white/24 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to jobs
          </Link>
          <Link
            href="/customers"
            className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-white/72 transition hover:border-white/24 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to customers
          </Link>
        </div>
      </section>
    </main>
  );
}

export default async function NewJobPage({ searchParams }: NewJobPageContext) {
  const resolvedSearchParams = await searchParams;
  const customerId = firstSearchValue(resolvedSearchParams.customerId);
  const leadId = firstSearchValue(resolvedSearchParams.leadId);
  const nextPath = customerId
    ? `/jobs/new?customerId=${encodeURIComponent(customerId)}`
    : leadId
      ? `/jobs/new?leadId=${encodeURIComponent(leadId)}`
      : "/jobs/new";

  await requireServerDestination(nextPath, "/jobs");

  if ((customerId && leadId) || (!customerId && !leadId)) {
    return (
      <ErrorPanel
        eyebrow="Create Job"
        title="Open this flow from a customer or a lead."
        message="The MVP create-job page expects either a customerId or a leadId. Start from the customer module or from the lead panel in the jobs board."
      />
    );
  }

  let technicians: TechnicianRecord[] = [];

  try {
    technicians = await serverApiFetch<TechnicianRecord[]>("/api/technicians");
  } catch {
    return (
      <ErrorPanel
        eyebrow="Create Job"
        title="Technicians could not be loaded."
        message="The create-job form needs the active technician roster before a job can be assigned."
      />
    );
  }

  let source: NewJobSource;

  if (customerId) {
    let customer: CustomerRecord | null = null;

    try {
      const detail = await serverApiFetch<{ customer: CustomerRecord }>(`/api/customers/${customerId}`);
      customer = detail.customer;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The customer record could not be loaded.";

      if (message.toLowerCase().includes("could not be found")) {
        notFound();
      }

      return (
        <ErrorPanel
          eyebrow="Create Job"
          title="The customer record could not be loaded."
          message={message}
        />
      );
    }

    if (!customer) {
      notFound();
    }

    source = {
      kind: "customer",
      customerId: customer.id,
      leadId: null,
      customerLabel: customer.full_name,
      phone: customer.phone,
      email: customer.email,
      serviceAddressLine1: customer.service_address_line_1,
      serviceAddressLine2: customer.service_address_line_2,
      serviceCity: customer.service_city,
      serviceStateOrRegion: customer.service_state_or_region,
      servicePostalCode: customer.service_postal_code,
      defaultServiceType: customer.preferred_service_type ?? "inspection",
      defaultInternalNotes: customer.notes ?? "",
      backHref: `/customers/${customer.id}`,
      backLabel: "Back to customer",
      sourceMessage: "This job will be created for the existing customer record and will appear on the jobs board as a scheduled job.",
    };
  } else {
    let lead: LeadRecord | null = null;

    try {
      lead = await serverApiFetch<LeadRecord>(`/api/leads/${leadId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The lead could not be loaded.";

      if (message.toLowerCase().includes("could not be found")) {
        notFound();
      }

      return (
        <ErrorPanel
          eyebrow="Create Job"
          title="The lead could not be loaded."
          message={message}
        />
      );
    }

    if (!lead) {
      notFound();
    }

    if (lead.converted_job_id || lead.status === "converted") {
      return (
        <ErrorPanel
          eyebrow="Create Job"
          title="This lead is already converted."
          message="A scheduled job already exists for this lead, so the create-job flow is no longer available for it."
        />
      );
    }

    source = {
      kind: "lead",
      customerId: null,
      leadId: lead.id,
      customerLabel: lead.full_name,
      phone: lead.phone,
      email: lead.email,
      serviceAddressLine1: lead.service_address_line_1,
      serviceAddressLine2: lead.service_address_line_2,
      serviceCity: lead.service_city,
      serviceStateOrRegion: lead.service_state_or_region,
      servicePostalCode: lead.service_postal_code,
      defaultServiceType: lead.service_type,
      defaultInternalNotes: lead.description ?? "",
      backHref: "/jobs",
      backLabel: "Back to jobs",
      sourceMessage: "Submitting this form will create a customer record from the lead and then schedule the new job.",
    };
  }

  return (
    <main className="min-h-screen bg-[color:var(--flat-canvas)] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
        <section className="rounded-[36px] border border-[color:rgba(212,175,55,0.18)] bg-[linear-gradient(180deg,rgba(11,11,11,0.96),rgba(18,18,18,0.92))] p-7 shadow-[0_36px_120px_rgba(0,0,0,0.4)] backdrop-blur-2xl sm:p-8">
          <div className="flex flex-wrap gap-3">
            <Link
              href={source.backHref}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-white/72 transition hover:border-white/24 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              {source.backLabel}
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-white/72 transition hover:border-white/24 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to jobs
            </Link>
          </div>

          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--flat-gold)]">Create Job</p>
              <h1 className="mt-4 max-w-3xl font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[#f5ecd2] sm:text-5xl">
                Schedule a new service job from the current CRM record.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62 sm:text-base">
                Use the minimum Phoenix CRM job fields only: customer, service type, address, schedule, assigned technician, and internal notes.
              </p>
            </div>

            <div className="min-w-[240px] rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-sm text-white/68">
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/38">Source Record</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-start gap-3">
                  <UserRound className="mt-0.5 h-4 w-4 text-[color:var(--flat-gold)]" />
                  <span>{source.customerLabel}</span>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 text-[color:var(--flat-gold)]" />
                  <span>
                    {formatAddress(
                      source.serviceAddressLine1,
                      source.serviceAddressLine2,
                      source.serviceCity,
                      source.serviceStateOrRegion,
                      source.servicePostalCode,
                    )}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <ClipboardList className="mt-0.5 h-4 w-4 text-[color:var(--flat-gold)]" />
                  <span>{source.kind === "lead" ? "Lead source" : "Customer source"}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <CreateJobForm source={source} technicians={technicians} />
      </div>
    </main>
  );
}