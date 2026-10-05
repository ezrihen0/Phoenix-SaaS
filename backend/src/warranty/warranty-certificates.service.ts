import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import { join } from "path";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import { WarrantyCertificateEntity } from "../database/entities/warranty-certificate.entity";
import { resolveInvoiceDisplayNumber } from "../crm/invoice-display-number";
import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import {
  buildViewModelFromSnapshot,
  planWarrantyIssue,
  resolveWarrantyCoverageStart,
  warrantyPdfFilename,
  warrantyPdfRendererForSnapshot,
  type WarrantyDocumentViewModel,
  type WarrantyIssueInput,
  type WarrantyStoredSnapshot,
} from "./warranty-document-view-model";
import { WarrantyCertificatePdfSnapshot, WarrantyPdfService } from "./warranty-pdf.service";

const ORGANIZATION_SETTINGS_KEY = "default";
const uploadsRoot = join(process.cwd(), "uploads", "warranty-certificates");

type CreateWarrantyCertificateInput = {
  organizationId: string;
  invoiceId: string;
  issuedByUserId: string;
  warrantyType?: string | null;
  coverageText?: string | null;
  exclusionsText?: string | null;
};

type WarrantySnapshotPayload = WarrantyStoredSnapshot;

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

    const now = new Date();
    const plan = planWarrantyIssue(this.buildIssueInput({
      invoice,
      customer,
      jobTitle: job.title,
      branding: this.documentBrandingSnapshotService.fromOrganizationSettings(
        await this.findOrganizationSettings(organizationId),
      ),
      warrantyType: input.warrantyType,
      coverageText: input.coverageText,
      exclusionsText: input.exclusionsText,
      now,
      frozen: true,
      balanceCents: ledger.balanceCents,
    }));
    const snapshot: WarrantySnapshotPayload = {
      ...plan.snapshot,
      customerId: customer.id,
      invoiceId: invoice.id,
      jobId: job.id,
    };

    const certificate = this.warrantyCertificatesRepository.create({
      organization_id: organizationId,
      customer_id: customer.id,
      related_invoice_id: invoice.id,
      related_job_id: job.id,
      warranty_type: plan.viewModel.warrantyType,
      warranty_start_date: plan.startDate,
      warranty_end_date: plan.columnEndDate,
      coverage_text: plan.viewModel.coverageText,
      exclusions_text: plan.viewModel.exclusionsText,
      issued_by_user_id: input.issuedByUserId,
      snapshot_company_name: plan.viewModel.companyName,
      snapshot_company_logo_url: plan.viewModel.companyLogoUrl,
      snapshot_company_phone: plan.viewModel.companyPhone,
      snapshot_company_email: plan.viewModel.companyEmail,
      snapshot_company_website: plan.viewModel.companyWebsite,
      snapshot_company_address: plan.viewModel.companyAddress,
      snapshot_company_license: plan.viewModel.companyLicense,
      snapshot_company_tax_number: plan.viewModel.companyTaxNumber,
      snapshot_accent_color: plan.viewModel.accentColor,
      snapshot_payload_json: JSON.stringify(snapshot),
      generated_html_snapshot: this.renderHtmlSnapshot(plan.viewModel),
      generated_pdf_path: null,
    });

    const saved = await this.warrantyCertificatesRepository.save(certificate);
    const pdfBuffer = this.warrantyPdfService.renderDocument(plan.viewModel);
    saved.generated_pdf_path = await this.writePdfBuffer(saved.id, pdfBuffer);
    return this.warrantyCertificatesRepository.save(saved);
  }

  async resolveDocumentForInvoice(organizationId: string, invoiceId: string) {
    const existing = await this.getByInvoiceForOrganization(invoiceId, organizationId);
    if (existing) {
      return this.documentFromCertificate(existing);
    }

    const invoice = await this.invoicesRepository.findOne({
      where: { id: invoiceId, organization_id: organizationId },
      relations: { line_items: true, payments: true },
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

    return planWarrantyIssue(this.buildIssueInput({
      invoice,
      customer,
      jobTitle: job.title,
      branding: this.documentBrandingSnapshotService.fromOrganizationSettings(
        await this.findOrganizationSettings(organizationId),
      ),
      warrantyType: null,
      coverageText: null,
      exclusionsText: null,
      now: new Date(),
      frozen: false,
      balanceCents: ledger.balanceCents,
    })).viewModel;
  }

  pdfFilename(certificate: WarrantyCertificateEntity) {
    const snapshot = this.parseSnapshotPayload(certificate.snapshot_payload_json);
    const certificateNumber = snapshot?.certificateNumber
      ?? `WAR-${certificate.id.slice(0, 8).toUpperCase()}`;
    return warrantyPdfFilename(certificateNumber);
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
      where: { organization_id: organizationId, customer_id: customerId },
      order: { created_at: "DESC" },
      take: limit,
    });
  }

  async getByIdForPortal(certificateId: string, organizationId: string, customerId: string) {
    const certificate = await this.warrantyCertificatesRepository.findOne({
      where: { id: certificateId, organization_id: organizationId, customer_id: customerId },
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

    const pdfBuffer = warrantyPdfRendererForSnapshot(snapshot) === "document-v2"
      ? this.warrantyPdfService.renderDocument(this.documentFromCertificate(certificate))
      : this.warrantyPdfService.renderLegacy(this.toPdfSnapshot(snapshot));
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
      document: this.tryDocument(certificate),
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
      warrantyEndDateLabel: snapshot.warrantyEndDateLabel ?? "-",
      warrantyType: snapshot.warrantyType,
      coverageText: snapshot.coverageText,
      exclusionsText: snapshot.exclusionsText,
      lineItems: snapshot.lineItems,
    };
  }

  private tryDocument(certificate: WarrantyCertificateEntity) {
    const snapshot = this.parseSnapshotPayload(certificate.snapshot_payload_json);
    if (!snapshot) {
      return null;
    }
    return buildViewModelFromSnapshot(snapshot, {
      now: new Date(),
      warrantyEnd: certificate.warranty_end_date,
    });
  }

  private documentFromCertificate(certificate: WarrantyCertificateEntity): WarrantyDocumentViewModel {
    const document = this.tryDocument(certificate);
    if (!document) {
      apiError(500, "warranty_snapshot_missing", "Warranty snapshot is missing and PDF cannot be rendered.");
    }
    return document;
  }

  private buildIssueInput(input: {
    invoice: InvoiceEntity;
    customer: CustomerEntity;
    jobTitle: string | null;
    branding: ReturnType<DocumentBrandingSnapshotService["fromOrganizationSettings"]>;
    warrantyType?: string | null;
    coverageText?: string | null;
    exclusionsText?: string | null;
    now: Date;
    frozen: boolean;
    balanceCents: number;
  }): WarrantyIssueInput {
    const startDate = resolveWarrantyCoverageStart({
      paidAt: input.invoice.paid_at,
      balanceCents: input.balanceCents,
      now: input.now,
    });
    const completionDate = input.invoice.paid_at ?? input.invoice.issued_at ?? startDate;
    const customerAddressLines = [
      this.normalizeString(input.customer.service_address_line_1),
      this.normalizeString(input.customer.service_address_line_2),
      [input.customer.service_city, input.customer.service_state_or_region].filter(Boolean).join(", "),
      this.normalizeString(input.customer.service_postal_code),
    ].filter((entry): entry is string => Boolean(entry && entry.trim()));

    return {
      invoiceId: input.invoice.id,
      invoiceNumber: resolveInvoiceDisplayNumber(input.invoice),
      jobTitle: input.jobTitle,
      warrantyType: input.warrantyType ?? null,
      coverageText: input.coverageText ?? null,
      exclusionsText: input.exclusionsText ?? null,
      startDate,
      completionDate,
      customerName: input.customer.full_name,
      customerCompany: input.customer.company_name,
      customerEmail: input.customer.email,
      customerPhone: input.customer.phone,
      customerAddressLines,
      companyName: input.branding.businessName,
      companyLogoUrl: input.branding.logoUrl,
      companyPhone: input.branding.phone,
      companyEmail: input.branding.email,
      companyWebsite: input.branding.website,
      companyAddress: input.branding.companyAddress,
      companyLicense: input.branding.businessLicense,
      companyTaxNumber: input.branding.gstNumber,
      accentColor: input.branding.accentColor,
      warrantyMessage: input.branding.warrantyMessage,
      now: input.now,
      frozen: input.frozen,
      lineItems: [...(input.invoice.line_items ?? [])]
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((lineItem) => ({
          name: lineItem.name_snapshot,
          description: lineItem.description_snapshot,
          quantity: String(lineItem.quantity),
          warrantyMonths: lineItem.warranty_months_snapshot,
          sortOrder: lineItem.sort_order,
        })),
    };
  }

  private renderHtmlSnapshot(model: WarrantyDocumentViewModel) {
    const listMarkup = model.lineItems
      .map((line) => `<li>${this.escapeHtml(line.name)} - Qty ${this.escapeHtml(line.quantity)} - ${this.escapeHtml(line.termLabel ?? model.emptyTermLabel)}${line.expiryLabel ? ` - ${this.escapeHtml(line.expiryLabel)}` : ""}</li>`)
      .join("");
    return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"/><title>${this.escapeHtml(model.certificateNumber)}</title></head>
  <body>
    <h1>${this.escapeHtml(model.companyName)}</h1>
    <h2>Warranty Certificate ${this.escapeHtml(model.certificateNumber)}</h2>
    <p>Customer: ${this.escapeHtml(model.customerName)}</p>
    <p>Property: ${this.escapeHtml(model.propertyLabel)}</p>
    <p>Invoice: ${this.escapeHtml(model.invoiceNumber ?? "-")}</p>
    <p>Start: ${this.escapeHtml(model.effectiveDateLabel)} End: ${this.escapeHtml(model.expirationDateLabel ?? model.emptyTermLabel)}</p>
    <p>${this.escapeHtml(model.coverageText)}</p>
    <p>${this.escapeHtml(model.exclusionsText)}</p>
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
