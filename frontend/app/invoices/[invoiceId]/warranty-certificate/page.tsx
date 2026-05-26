import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import WarrantyCertificatePreview from "@/components/warranty-certificate-preview";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerRoles } from "@/lib/auth/server-session";
import {
  type PersistedInvoiceLineItem,
} from "@/lib/crm/invoice-line-model";
import type { JobStatus } from "@/lib/crm/statuses";
import WarrantyCertificateActions from "./warranty-certificate-actions";

type InvoiceLifecycleStatus = "sent" | "partial" | "paid" | "refunded" | "overpaid";

type InvoiceDetailRecord = {
  id: string;
  job_id: string;
  invoice_id: string;
  document_number: string;
  description: string;
  amount_cents: number;
  subtotal_cents?: number;
  tax_rate_bps_snapshot?: number;
  tax_cents?: number;
  total_cents: number;
  amount_paid_cents: number;
  refunded_cents?: number;
  balance_cents: number;
  lifecycle_status: InvoiceLifecycleStatus;
  status: "unpaid" | "paid";
  issued_at: string;
  paid_at: string | null;
  line_items?: PersistedInvoiceLineItem[];
  customer_name: string;
  job_title: string;
  job: {
    id: string;
    title: string;
    status: JobStatus;
    assigned_technician_id: string | null;
  } | null;
  customer: {
    id: string;
    full_name: string;
    company_name: string | null;
    email: string | null;
    phone: string;
    service_address_line_1: string;
    service_address_line_2: string | null;
    service_city: string;
    service_state_or_region: string | null;
    service_postal_code: string;
    notes: string | null;
  } | null;
};

type InvoiceCompanySettings = {
  businessName: string | null;
  displayInitials: string | null;
  companyDescription: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  website: string | null;
  companyEmail: string | null;
  phone: string | null;
};

const defaultCompanySettings: InvoiceCompanySettings = {
  businessName: null,
  displayInitials: null,
  companyDescription: null,
  address: null,
  city: null,
  zip: null,
  website: null,
  companyEmail: null,
  phone: null,
};

function canViewWarrantyCertificate(invoice: InvoiceDetailRecord) {
  return Boolean(invoice.paid_at) || invoice.balance_cents <= 0;
}

export default async function WarrantyCertificatePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;

  await requireServerRoles(`/invoices/${invoiceId}/warranty-certificate`, [
    "owner",
    "office_admin",
    "dispatcher",
    "technician",
  ]);

  let invoice: InvoiceDetailRecord | null = null;

  try {
    invoice = await serverApiFetch<InvoiceDetailRecord>(`/api/invoices/${invoiceId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The invoice could not be loaded.";

    if (message.toLowerCase().includes("could not be found")) {
      notFound();
    }

    throw error;
  }

  if (!invoice) {
    notFound();
  }

  let companySettings = defaultCompanySettings;

  try {
    companySettings = await serverApiFetch<InvoiceCompanySettings>("/api/settings/organization");
  } catch {
    companySettings = defaultCompanySettings;
  }

  const certificateAvailable = canViewWarrantyCertificate(invoice);

  return (
    <main className="min-h-screen bg-[color:var(--cmp-surface-canvas)] text-[color:var(--sem-text-primary)]">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 print:max-w-none print:px-0 print:py-0">
        <section className="theme-surface-modal rounded-[36px] p-7 sm:p-8 print:rounded-none print:bg-transparent print:p-0 print:shadow-none">
          <div className="flex flex-wrap gap-3 print:hidden">
            <Link
              href={`/invoices/${invoice.id}`}
              className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to invoice
            </Link>
          </div>

          <div className="mt-6">
            {certificateAvailable ? (
              <div className="space-y-5">
                <WarrantyCertificateActions
                  invoiceId={invoice.id}
                  customerId={invoice.customer?.id ?? null}
                  disabled={!certificateAvailable}
                />
                <WarrantyCertificatePreview
                  certificateNumber={`WAR-${invoice.id.slice(0, 8).toUpperCase()}`}
                  invoiceNumber={invoice.document_number}
                  issuedAt={invoice.issued_at}
                  paidAt={invoice.paid_at}
                  customerName={invoice.customer?.full_name ?? invoice.customer_name}
                  customerCompanyName={invoice.customer?.company_name ?? null}
                  customerEmail={invoice.customer?.email ?? null}
                  customerPhone={invoice.customer?.phone ?? null}
                  customerAddressLines={[
                    invoice.customer?.service_address_line_1 ?? "",
                    invoice.customer?.service_address_line_2 ?? "",
                    [invoice.customer?.service_city, invoice.customer?.service_state_or_region].filter(Boolean).join(", ")
                      + (invoice.customer?.service_postal_code ? ` ${invoice.customer.service_postal_code}` : ""),
                  ].map((line) => line.trim()).filter(Boolean)}
                  jobTitle={invoice.job?.title ?? invoice.job_title}
                  companySettings={companySettings}
                  lineItems={invoice.line_items ?? []}
                />
              </div>
            ) : (
              <section className="rounded-[32px] border border-amber-200 bg-amber-50 px-6 py-8 text-amber-950 shadow-[0_24px_80px_rgba(120,53,15,0.08)]">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-amber-100 p-2">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-amber-700">Warranty Certificate Blocked</p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight">Invoice payment is still outstanding</h1>
                  </div>
                </div>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-amber-900">
                  This internal warranty certificate preview becomes available only after the invoice is fully paid or the balance reaches zero.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
                  <div className="rounded-[20px] border border-amber-200 bg-white/70 px-4 py-3 text-sm">
                    <p className="text-amber-700">Invoice</p>
                    <p className="mt-1 font-semibold text-amber-950">{invoice.document_number}</p>
                  </div>
                  <div className="rounded-[20px] border border-amber-200 bg-white/70 px-4 py-3 text-sm">
                    <p className="text-amber-700">Current balance</p>
                    <p className="mt-1 font-semibold text-amber-950">${(invoice.balance_cents / 100).toFixed(2)}</p>
                  </div>
                </div>
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
