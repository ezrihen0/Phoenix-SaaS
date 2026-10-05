import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import WarrantyCertificatePreview from "@/components/warranty-certificate-preview";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerRoles } from "@/lib/auth/server-session";
import type { WarrantyDocumentViewModel } from "@/lib/crm/warranty-document.types";

type WarrantyCertificateRecord = {
  id: string;
  related_invoice_id: string | null;
  pdf_url: string;
  document: WarrantyDocumentViewModel | null;
};

export default async function WarrantyCertificateDetailPage({
  params,
}: {
  params: Promise<{ certificateId: string }>;
}) {
  const { certificateId } = await params;
  await requireServerRoles(`/warranty-certificate/${certificateId}`, [
    "owner",
    "office_admin",
    "dispatcher",
    "technician",
  ]);

  let certificate: WarrantyCertificateRecord | null = null;

  try {
    certificate = await serverApiFetch<WarrantyCertificateRecord>(`/api/warranty-certificates/${certificateId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Warranty certificate could not be loaded.";
    if (message.toLowerCase().includes("could not be found")) {
      notFound();
    }
    throw error;
  }

  if (!certificate?.document) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(30,64,175,0.12),transparent_34%),linear-gradient(180deg,#f8fafc,#eef2f7)] text-slate-900 print:bg-white">
      <div className="mx-auto max-w-[1280px] px-5 py-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
        <section className="print:rounded-none print:bg-transparent print:p-0 print:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <Link
              href={certificate.related_invoice_id ? `/invoices/${certificate.related_invoice_id}` : "/invoices"}
              className="theme-control-surface inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[color:var(--sem-text-secondary)] transition hover:text-[color:var(--sem-text-primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <div className="flex flex-wrap gap-3">
              <a href={certificate.pdf_url} target="_blank" rel="noopener noreferrer" className="theme-control-surface rounded-full px-4 py-2 text-sm">
                View PDF
              </a>
              <a href={`${certificate.pdf_url}?download=1`} className="theme-control-surface rounded-full px-4 py-2 text-sm">
                Download PDF
              </a>
            </div>
          </div>

          <div className="mt-6">
            <WarrantyCertificatePreview document={certificate.document} />
          </div>
        </section>
      </div>
    </main>
  );
}
