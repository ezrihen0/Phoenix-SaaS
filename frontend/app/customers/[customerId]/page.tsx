import { notFound } from "next/navigation";

import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireOfficeCrmRoute } from "@/lib/auth/server-session";
import type { InspectionListRow } from "@/lib/inspections/browser-api";
import type { Database } from "@/lib/types/database";

import CustomerProfileWorkspace from "./customer-profile-workspace";

type CustomerRecord = Database["public"]["Tables"]["customers"]["Row"];
type RelatedValue<T> = T | T[] | null;
type TechnicianRecord = Pick<
  Database["public"]["Tables"]["technicians"]["Row"],
  "id" | "display_name" | "phone" | "is_active"
>;
type CustomerJobSummary = Pick<
  Database["public"]["Tables"]["jobs"]["Row"],
  | "id"
  | "customer_id"
  | "title"
  | "description"
  | "requested_service_type"
  | "status"
  | "scheduled_for"
  | "scheduled_window"
  | "created_at"
  | "updated_at"
> & {
  technician: RelatedValue<TechnicianRecord>;
};

type InvoiceListItem = {
  id: string;
  job_id: string;
  document_number: string;
  total_cents: number;
  amount_paid_cents: number;
  refunded_cents?: number;
  balance_cents: number;
  lifecycle_status: "sent" | "partial" | "paid" | "refunded" | "overpaid";
  status: "unpaid" | "paid";
  issued_at: string;
  customer_name: string;
  job_title: string;
};

type EstimateListItem = {
  id: string;
  job_id: string;
  customer_id: string;
  customer_name: string;
  job_title: string;
  document_number: string;
  lifecycle_status: "draft" | "sent" | "approved" | "void" | "converted";
  description: string;
  price_cents: number;
  status: "draft" | "sent" | "approved" | "rejected";
  sent_at: string | null;
  approved_at: string | null;
};

type CustomerDetailPageContext = {
  params: Promise<{
    customerId: string;
  }>;
};

export default async function CustomerDetailPage({ params }: CustomerDetailPageContext) {
  const { customerId } = await params;
  const session = await requireOfficeCrmRoute(`/customers/${customerId}`);
  const canMintPortalMagicLink = session.permissions.includes("customers.manage");

  let customer: CustomerRecord | null = null;
  let relatedJobs: CustomerJobSummary[] = [];
  let invoices: InvoiceListItem[] = [];
  let estimates: EstimateListItem[] = [];
  let inspections: InspectionListRow[] = [];
  let loadError: string | null = null;

  try {
    const detail = await serverApiFetch<{
      customer: CustomerRecord;
      relatedJobs: CustomerJobSummary[];
    }>(`/api/customers/${customerId}`);

    customer = detail.customer;
    relatedJobs = detail.relatedJobs ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "The customer detail page could not be loaded.";

    if (message.toLowerCase().includes("could not be found")) {
      notFound();
    }

    loadError = message;
  }

  if (!customer) {
    notFound();
  }

  const queryCustomerId = encodeURIComponent(customer.id);
  const [invoiceResult, estimateResult, inspectionResult] = await Promise.allSettled([
    serverApiFetch<InvoiceListItem[]>(`/api/invoices?customerId=${queryCustomerId}`),
    serverApiFetch<EstimateListItem[]>(`/api/estimates?customerId=${queryCustomerId}`),
    serverApiFetch<InspectionListRow[]>(`/api/inspections?customerId=${queryCustomerId}`),
  ]);
  const relatedLoadErrors: string[] = [];

  if (invoiceResult.status === "fulfilled") {
    invoices = invoiceResult.value;
  } else {
    relatedLoadErrors.push(invoiceResult.reason instanceof Error ? invoiceResult.reason.message : "Customer invoices could not be loaded.");
  }

  if (estimateResult.status === "fulfilled") {
    estimates = estimateResult.value;
  } else {
    relatedLoadErrors.push(estimateResult.reason instanceof Error ? estimateResult.reason.message : "Customer estimates could not be loaded.");
  }

  if (inspectionResult.status === "fulfilled") {
    inspections = inspectionResult.value;
  } else {
    relatedLoadErrors.push(inspectionResult.reason instanceof Error ? inspectionResult.reason.message : "Customer inspections could not be loaded.");
  }

  if (relatedLoadErrors.length) {
    loadError = [loadError, ...relatedLoadErrors].filter(Boolean).join(" ");
  }

  return (
    <CustomerProfileWorkspace
      customer={customer}
      relatedJobs={relatedJobs}
      invoices={invoices}
      estimates={estimates}
      inspections={inspections}
      loadError={loadError}
      canMintPortalMagicLink={canMintPortalMagicLink}
    />
  );
}
