import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import { join } from "path";
import { IsNull, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import { WarrantyCertificateEntity } from "../database/entities/warranty-certificate.entity";
import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import { WarrantyCertificatePdfSnapshot, WarrantyPdfService } from "./warranty-pdf.service";

const ORGANIZATION_SETTINGS_KEY = "default";
const DEFAULT_EXCLUSIONS_TEXT =
  "Excludes misuse, neglect, lack of maintenance, unauthorized modifications, force majeure, and damage caused by third parties or external events.";
const uploadsRoot = join(process.cwd(), "uploads", "warranty-certificates");

type CreateWarrantyCertificateInput = {
  organizationId: string;
  invoiceId: string;
  issuedByUserId: string;
  warrantyType?: string | null;
  coverageText?: string | null;
  exclusionsText?: string | null;
};

type WarrantySnapshotPayload = {
  certificateNumber: string;
  companyName: string;
  companyLogoUrl: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  companyLicense: string | null;
  companyTaxNumber: string | null;
  accentColor: string | null;
  customerId: string;
  customerName: string;
  customerCompany: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddressLines: string[];
  invoiceId: string | null;
  invoiceNumber: string | null;
  jobId: string | null;
  completionDateLabel: string;
  warrantyStartDateLabel: string;
  warrantyEndDateLabel: string;
  warrantyType: string;
  coverageText: string;
  exclusionsText: string;
  lineItems: Array<{
    name: string;
    quantity: string;
    warrantyMonths: number | null;
  }>;
};

@Injectable()
export class WarrantyCertificatesService {
  constructor(
    @InjectRepository(WarrantyCertificateEntity)
    private readonly warrantyCertificatesRepository: Repository<WarrantyCertificateEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoicesRepository: Repository<InvoiceEntity>,
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
    @InjectRepository(OrganizationSettingEntity)
    private readonly organizationSettingsRepository: Repository<OrganizationSettingEntity>,
    private readonly warrantyPdfService: WarrantyPdfService,
    private readonly documentBrandingSnapshotService: DocumentBrandingSnapshotService,
  ) {}

  async generateFromInvoice(input: CreateWarrantyCertificateInput) {
    const organizationId = input.organizationId.trim();
    const invoice = await this.invoicesRepository.findOne({
      where: { id: input.invoiceId, organization_id: organizationId },
      relations: {
        line_items: true,
        payments: true,
      },
    });

    if (!invoice) {
      apiError(404, "invoice_not_found", "The invoice could not be found.");
    }

    const job = await this.jobsRepository.findOne({
      where: { id: invoice.job_id, organization_id: organizationId },
    });
    if (!job) {
      apiError(400, "invoice_job_missing", "The invoice job context is missing.");
    }

    const customer = await this.customersRepository.findOne({
      where: { id: job.customer_id, organization_id: organizationId },
    });
    if (!customer) {
      apiError(400, "invoice_customer_missing", "The invoice customer context is missing.");
    }

    const ledger = this.summarizeInvoiceLedger(invoice);
    if (!(ledger.paidAt || ledger.balanceCents <= 0)) {
      apiError(400, "warranty_invoice_not_paid", "Warranty certificates can be generated only after invoice payment.");
    }

    const existing = await this.warrantyCertificatesRepository.findOne({
      where: {
        organization_id: organizationId,
        related_invoice_id: invoice.id,
      },
    });
    if (existing) {
      return existing;
    }

    const orgSettings = await this.findOrganizationSettings(organizationId);
    const brandingSnapshot = this.documentBrandingSnapshotService.fromOrganizationSettings(orgSettings);
    const createdAt = new Date();
    const startDate = ledger.paidAt ?? invoice.paid_at ?? invoice.issued_at ?? createdAt;
    const maxWarrantyMonths = Math.max(
      1,
      ...((invoice.line_items ?? []).map((line) => line.warranty_months_snapshot ?? 0)),
    );
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + maxWarrantyMonths);

    const certificate = this.warrantyCertificatesRepository.create({
      organization_id: organizationId,
      customer_id: customer.id,
      related_invoice_id: invoice.id,
      related_job_id: job.id,
      warranty_type: this.normalizeString(input.warrantyType) ?? "installation",
      warranty_start_date: startDate,
      warranty_end_date: endDate,
      coverage_text:
        this.normalizeString(input.coverageText)
        ?? brandingSnapshot.warrantyMessage
        ?? "Workmanship and installed components are covered under normal residential use for the stated term.",
      exclusions_text: this.normalizeString(input.exclusionsText) ?? DEFAULT_EXCLUSIONS_TEXT,
      issued_by_user_id: input.issuedByUserId,
      snapshot_company_name: brandingSnapshot.businessName ?? "Service Company",
      snapshot_company_logo_url: brandingSnapshot.logoUrl,
      snapshot_company_phone: brandingSnapshot.phone,
      snapshot_company_email: brandingSnapshot.email,
      snapshot_company_website: brandingSnapshot.website,
      snapshot_company_address: brandingSnapshot.companyAddress,
      snapshot_company_license: brandingSnapshot.businessLicense,
      snapshot_company_tax_number: brandingSnapshot.gstNumber,
      snapshot_accent_color: brandingSnapshot.accentColor,
      snapshot_payload_json: "{}",
      generated_html_snapshot: null,
      generated_pdf_path: null,
    });

    const saved = await this.warrantyCertificatesRepository.save(certificate);
    const snapshot = this.buildSnapshotPayload(saved, invoice, customer, maxWarrantyMonths);
    const pdfBuffer = this.warrantyPdfService.render(this.toPdfSnapshot(snapshot));
    const pdfPath = await this.writePdfBuffer(saved.id, pdfBuffer);
    const htmlSnapshot = this.renderHtmlSnapshot(snapshot);

    saved.snapshot_payload_json = JSON.stringify(snapshot);
    saved.generated_html_snapshot = htmlSnapshot;
    saved.generated_pdf_path = pdfPath;
    return this.warrantyCertificatesRepository.save(saved);
  }

  async getByIdForOrganization(certificateId: string, organizationId: string) {
    const certificate = await this.warrantyCertificatesRepository.findOne({
      where: {
        id: certificateId,
        organization_id: organizationId,
      },
    });

    if (!certificate) {
      apiError(404, "warranty_certificate_not_found", "The warranty certificate could not be found.");
    }

    return certificate;
  }

  async getByInvoiceForOrganization(invoiceId: string, organizationId: string) {
    return this.warrantyCertificatesRepository.findOne({
      where: {
        related_invoice_id: invoiceId,
        organization_id: organizationId,
      },
      order: { created_at: "DESC" },
    });
  }

  async getLatestByCustomerForPortal(organizationId: string, customerId: string, limit = 5) {
    return this.warrantyCertificatesRepository.find({
      where: [
        { organization_id: organizationId, customer_id: customerId },
        { organization_id: IsNull(), customer_id: customerId },
      ],
      order: { created_at: "DESC" },
      take: limit,
    });
  }

  async getByIdForPortal(certificateId: string, organizationId: string, customerId: string) {
    const certificate = await this.warrantyCertificatesRepository.findOne({
      where: [
        { id: certificateId, organization_id: organizationId, customer_id: customerId },
        { id: certificateId, organization_id: IsNull(), customer_id: customerId },
      ],
    });
    if (!certificate) {
      apiError(404, "warranty_certificate_not_found", "The warranty certificate could not be found.");
    }
    return certificate;
  }

  async readPdfBuffer(certificate: WarrantyCertificateEntity) {
    if (certificate.generated_pdf_path) {
      try {
        return await fs.readFile(certificate.generated_pdf_path);
      } catch {
        // fall through to restore from snapshot payload
      }
    }

    const snapshot = this.parseSnapshotPayload(certificate.snapshot_payload_json);
    if (!snapshot) {
      apiError(500, "warranty_snapshot_missing", "Warranty snapshot is missing and PDF cannot be rendered.");
    }

    const pdfBuffer = this.warrantyPdfService.render(this.toPdfSnapshot(snapshot));
    const pdfPath = await this.writePdfBuffer(certificate.id, pdfBuffer);
    certificate.generated_pdf_path = pdfPath;
    await this.warrantyCertificatesRepository.save(certificate);
    return pdfBuffer;
  }

  readPdfStream(certificate: WarrantyCertificateEntity) {
    if (!certificate.generated_pdf_path) {
      apiError(500, "warranty_pdf_missing", "Warranty PDF is not generated yet.");
    }
    return createReadStream(certificate.generated_pdf_path);
  }

  buildResponse(certificate: WarrantyCertificateEntity) {
    const snapshot = this.parseSnapshotPayload(certificate.snapshot_payload_json);
    return {
      id: certificate.id,
      organization_id: certificate.organization_id,
      customer_id: certificate.customer_id,
      related_invoice_id: certificate.related_invoice_id,
      related_job_id: certificate.related_job_id,
      certificate_number: snapshot?.certificateNumber ?? `WAR-${certificate.id.slice(0, 8).toUpperCase()}`,
      warranty_type: certificate.warranty_type,
      warranty_start_date: certificate.warranty_start_date.toISOString(),
      warranty_end_date: certificate.warranty_end_date.toISOString(),
      coverage_text: certificate.coverage_text,
      exclusions_text: certificate.exclusions_text,
      generated_pdf_path: certificate.generated_pdf_path,
      created_at: certificate.created_at.toISOString(),
      pdf_url: `/api/warranty-certificates/${certificate.id}/pdf`,
      portal_pdf_url: `/api/portal/warranty-certificates/${certificate.id}/pdf`,
      snapshot,
    };
  }

  private parseSnapshotPayload(raw: string | null | undefined) {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as WarrantySnapshotPayload;
    } catch {
      return null;
    }
  }

  private toPdfSnapshot(snapshot: WarrantySnapshotPayload): WarrantyCertificatePdfSnapshot {
    return {
      certificateNumber: snapshot.certificateNumber,
      companyName: snapshot.companyName,
      companyPhone: snapshot.companyPhone,
      companyEmail: snapshot.companyEmail,
      companyWebsite: snapshot.companyWebsite,
      companyAddress: snapshot.companyAddress,
      companyLicense: snapshot.companyLicense,
      companyTaxNumber: snapshot.companyTaxNumber,
      accentColor: snapshot.accentColor,
      customerName: snapshot.customerName,
      customerCompany: snapshot.customerCompany,
      customerAddressLines: snapshot.customerAddressLines,
      invoiceNumber: snapshot.invoiceNumber,
      completionDateLabel: snapshot.completionDateLabel,
      warrantyStartDateLabel: snapshot.warrantyStartDateLabel,
      warrantyEndDateLabel: snapshot.warrantyEndDateLabel,
      warrantyType: snapshot.warrantyType,
      coverageText: snapshot.coverageText,
      exclusionsText: snapshot.exclusionsText,
      lineItems: snapshot.lineItems,
    };
  }

  private buildSnapshotPayload(
    certificate: WarrantyCertificateEntity,
    invoice: InvoiceEntity,
    customer: CustomerEntity,
    maxWarrantyMonths: number,
  ): WarrantySnapshotPayload {
    const startLabel = this.formatDate(certificate.warranty_start_date);
    const endLabel = this.formatDate(certificate.warranty_end_date);
    const completionLabel = this.formatDate(invoice.paid_at ?? invoice.issued_at ?? certificate.created_at);
    const customerAddressLines = [
      this.normalizeString(customer.service_address_line_1),
      this.normalizeString(customer.service_address_line_2),
      [customer.service_city, customer.service_state_or_region].filter(Boolean).join(", "),
      this.normalizeString(customer.service_postal_code),
    ].filter((entry): entry is string => Boolean(entry && entry.trim()));

    return {
      certificateNumber: `WAR-${certificate.id.slice(0, 8).toUpperCase()}`,
      companyName: certificate.snapshot_company_name ?? "Service Company",
      companyLogoUrl: certificate.snapshot_company_logo_url,
      companyPhone: certificate.snapshot_company_phone,
      companyEmail: certificate.snapshot_company_email,
      companyWebsite: certificate.snapshot_company_website,
      companyAddress: certificate.snapshot_company_address,
      companyLicense: certificate.snapshot_company_license,
      companyTaxNumber: certificate.snapshot_company_tax_number,
      accentColor: certificate.snapshot_accent_color,
      customerId: customer.id,
      customerName: customer.full_name,
      customerCompany: this.normalizeString(customer.company_name),
      customerEmail: this.normalizeString(customer.email),
      customerPhone: this.normalizeString(customer.phone),
      customerAddressLines,
      invoiceId: invoice.id,
      invoiceNumber: `INV-${invoice.id.slice(0, 8).toUpperCase()}`,
      jobId: invoice.job_id,
      completionDateLabel: completionLabel,
      warrantyStartDateLabel: startLabel,
      warrantyEndDateLabel: endLabel,
      warrantyType: certificate.warranty_type,
      coverageText: certificate.coverage_text,
      exclusionsText: certificate.exclusions_text,
      lineItems: (invoice.line_items ?? []).map((lineItem) => ({
        name: lineItem.name_snapshot,
        quantity: String(lineItem.quantity),
        warrantyMonths: lineItem.warranty_months_snapshot ?? maxWarrantyMonths,
      })),
    };
  }

  private renderHtmlSnapshot(snapshot: WarrantySnapshotPayload) {
    const listMarkup = snapshot.lineItems
      .map((line) => `<li>${this.escapeHtml(line.name)} - Qty ${this.escapeHtml(line.quantity)} - ${this.escapeHtml(typeof line.warrantyMonths === "number" ? `${line.warrantyMonths} months` : "Per policy")}</li>`)
      .join("");
    return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"/><title>${this.escapeHtml(snapshot.certificateNumber)}</title></head>
  <body>
    <h1>${this.escapeHtml(snapshot.companyName)}</h1>
    <h2>Warranty Certificate ${this.escapeHtml(snapshot.certificateNumber)}</h2>
    <p>Customer: ${this.escapeHtml(snapshot.customerName)}</p>
    <p>Invoice: ${this.escapeHtml(snapshot.invoiceNumber ?? "-")}</p>
    <p>Start: ${this.escapeHtml(snapshot.warrantyStartDateLabel)} End: ${this.escapeHtml(snapshot.warrantyEndDateLabel)}</p>
    <p>${this.escapeHtml(snapshot.coverageText)}</p>
    <p>${this.escapeHtml(snapshot.exclusionsText)}</p>
    <ul>${listMarkup}</ul>
  </body>
</html>`;
  }

  private summarizeInvoiceLedger(invoice: InvoiceEntity) {
    const totalCents = invoice.total_cents || invoice.subtotal_cents || invoice.amount_cents;
    let netPaidCents = 0;
    let refundedCents = 0;

    for (const payment of invoice.payments ?? []) {
      if (payment.entry_type === "payment") {
        netPaidCents += payment.amount_cents;
      } else if (payment.entry_type === "refund") {
        netPaidCents -= payment.amount_cents;
        refundedCents += payment.amount_cents;
      } else {
        netPaidCents += payment.amount_cents;
      }
    }

    const balanceCents = totalCents - netPaidCents;
    return {
      totalCents,
      netPaidCents,
      refundedCents,
      balanceCents,
      paidAt: invoice.paid_at ?? (balanceCents <= 0 ? new Date() : null),
    };
  }

  private async writePdfBuffer(certificateId: string, pdfBuffer: Buffer) {
    await fs.mkdir(uploadsRoot, { recursive: true });
    const absolutePath = join(uploadsRoot, `${certificateId}.pdf`);
    await fs.writeFile(absolutePath, pdfBuffer);
    return absolutePath;
  }

  private async findOrganizationSettings(organizationId: string) {
    const keyed = await this.organizationSettingsRepository.findOne({
      where: {
        settings_key: `${organizationId}:${ORGANIZATION_SETTINGS_KEY}`,
        organization_id: organizationId,
      },
    });
    if (keyed) {
      return keyed;
    }
    return this.organizationSettingsRepository.findOne({
      where: {
        settings_key: ORGANIZATION_SETTINGS_KEY,
        organization_id: organizationId,
      },
    });
  }

  private formatDate(value: Date | null | undefined) {
    if (!value) {
      return "-";
    }
    return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  private normalizeString(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : null;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
