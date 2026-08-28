import { notFound } from "next/navigation";

import { requireOfficeCrmRoute } from "@/lib/auth/server-session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import type { JobTypeValue } from "@/lib/crm/job-field-display";
import type { ServiceCatalogRow } from "@/lib/crm/jobs-new-api";
import type { Database } from "@/lib/types/database";

import JobsNewWorkspace, {
  type JobsNewInitialSource,
  type TechnicianOption,
} from "./jobs-new-workspace";

type SearchParam = string | string[] | undefined;
type CustomerRecord = Database["public"]["Tables"]["customers"]["Row"];
type LeadRecord = Database["public"]["Tables"]["leads"]["Row"];

type NewJobPageContext = {
  searchParams: Promise<{
    customerId?: SearchParam;
    leadId?: SearchParam;
  }>;
};

function firstSearchValue(value: SearchParam) {
  return Array.isArray(value) ? value[0] : value;
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

  const session = await requireOfficeCrmRoute(nextPath);
  const permissions = session.permissions ?? [];
  const canManageCustomers = permissions.includes("customers.manage");

  if (customerId && leadId) {
    return (
      <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
        <section className="mx-auto max-w-3xl rounded-[32px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-8">
          <h1 className="text-2xl font-semibold">Choose only one source</h1>
          <p className="mt-3 text-sm text-[color:var(--sem-text-secondary)]">
            Open this page with either customerId or leadId, not both.
          </p>
        </section>
      </main>
    );
  }

  let technicians: TechnicianOption[] = [];
  let services: ServiceCatalogRow[] = [];
  let initialSource: JobsNewInitialSource | null = null;
  let bootstrapError: string | null = null;

  try {
    const [techniciansResponse, servicesResponse] = await Promise.all([
      serverApiFetch<TechnicianOption[]>("/api/technicians"),
      serverApiFetch<ServiceCatalogRow[]>("/api/services"),
    ]);

    technicians = techniciansResponse;
    services = servicesResponse;
  } catch (error) {
    bootstrapError = error instanceof Error ? error.message : "The intake workspace could not be loaded.";
  }

  if (!bootstrapError && customerId) {
    try {
      const detail = await serverApiFetch<{ customer: CustomerRecord }>(`/api/customers/${customerId}`);
      const customer = detail.customer;

      initialSource = {
        kind: "customer",
        customerId: customer.id,
        leadId: null,
        fullName: customer.full_name,
        phone: customer.phone,
        email: customer.email ?? "",
        serviceAddressLine1: customer.service_address_line_1,
        serviceAddressLine2: customer.service_address_line_2 ?? "",
        serviceCity: customer.service_city,
        serviceStateOrRegion: customer.service_state_or_region ?? "",
        servicePostalCode: customer.service_postal_code,
        defaultJobType: (customer.preferred_service_type === "inspection"
          ? "inspection"
          : "installation_repair") as JobTypeValue,
        defaultInternalNotes: customer.notes ?? "",
        defaultCustomerConcern: "",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "The customer record could not be loaded.";

      if (message.toLowerCase().includes("could not be found")) {
        notFound();
      }

      bootstrapError = message;
    }
  }

  if (!bootstrapError && leadId) {
    try {
      const lead = await serverApiFetch<LeadRecord>(`/api/leads/${leadId}`);

      if (lead.converted_job_id || lead.status === "converted") {
        bootstrapError = "This lead has already been converted into a job.";
      } else {
        initialSource = {
          kind: "lead",
          customerId: null,
          leadId: lead.id,
          fullName: lead.full_name,
          phone: lead.phone,
          email: lead.email ?? "",
          serviceAddressLine1: lead.service_address_line_1,
          serviceAddressLine2: lead.service_address_line_2 ?? "",
          serviceCity: lead.service_city,
          serviceStateOrRegion: lead.service_state_or_region ?? "",
          servicePostalCode: lead.service_postal_code,
          defaultJobType: (lead.service_type === "inspection"
            ? "inspection"
            : "installation_repair") as JobTypeValue,
          defaultInternalNotes: "",
          defaultCustomerConcern: lead.description ?? "",
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The lead could not be loaded.";

      if (message.toLowerCase().includes("could not be found")) {
        notFound();
      }

      bootstrapError = message;
    }
  }

  if (bootstrapError) {
    return (
      <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] px-6 py-10 text-[color:var(--sem-text-primary)] lg:px-10">
        <section className="mx-auto max-w-3xl rounded-[32px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-panel)] p-8">
          <h1 className="text-2xl font-semibold">New job intake unavailable</h1>
          <p className="mt-3 text-sm text-[color:var(--sem-text-secondary)]">{bootstrapError}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <JobsNewWorkspace
        technicians={technicians}
        services={services}
        canManageCustomers={canManageCustomers}
        initialSource={initialSource}
      />
    </main>
  );
}
