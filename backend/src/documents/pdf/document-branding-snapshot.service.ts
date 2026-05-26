import { Injectable } from "@nestjs/common";

import type { OrganizationSettingEntity } from "../../database/entities/organization-setting.entity";
import type { DocumentBrandingSnapshot } from "./pdf-render.types";

@Injectable()
export class DocumentBrandingSnapshotService {
  fromOrganizationSettings(settings: OrganizationSettingEntity | null): DocumentBrandingSnapshot {
    return {
      businessName: this.normalizeString(settings?.business_name),
      displayInitials: this.normalizeString(settings?.display_initials),
      phone: this.normalizeString(settings?.phone),
      email: this.normalizeString(settings?.company_email),
      website: this.normalizeString(settings?.website),
      logoUrl: this.normalizeString(settings?.logo_url),
      accentColor: this.normalizeString(settings?.accent_color),
      paymentInstructions: this.normalizeString(settings?.payment_instructions),
      businessLicense: this.normalizeString(settings?.business_license),
      gstNumber: this.normalizeString(settings?.gst_number),
      warrantyMessage: this.normalizeString(settings?.warranty_message),
      invoicePdfFooter: this.normalizeString(settings?.invoice_pdf_footer),
      companyAddress: this.buildCompanyAddress(settings),
    };
  }

  parseInvoiceSnapshot(raw: string | null | undefined): Omit<DocumentBrandingSnapshot, "companyAddress"> | null {
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<Omit<DocumentBrandingSnapshot, "companyAddress">>;
      return {
        businessName: this.normalizeString(parsed.businessName ?? null),
        displayInitials: this.normalizeString(parsed.displayInitials ?? null),
        phone: this.normalizeString(parsed.phone ?? null),
        email: this.normalizeString(parsed.email ?? null),
        website: this.normalizeString(parsed.website ?? null),
        logoUrl: this.normalizeString(parsed.logoUrl ?? null),
        accentColor: this.normalizeString(parsed.accentColor ?? null),
        paymentInstructions: this.normalizeString(parsed.paymentInstructions ?? null),
        businessLicense: this.normalizeString(parsed.businessLicense ?? null),
        gstNumber: this.normalizeString(parsed.gstNumber ?? null),
        warrantyMessage: this.normalizeString(parsed.warrantyMessage ?? null),
        invoicePdfFooter: this.normalizeString(parsed.invoicePdfFooter ?? null),
      };
    } catch {
      return null;
    }
  }

  toInvoiceSnapshot(settings: OrganizationSettingEntity | null): Omit<DocumentBrandingSnapshot, "companyAddress"> {
    const snapshot = this.fromOrganizationSettings(settings);
    return {
      businessName: snapshot.businessName,
      displayInitials: snapshot.displayInitials,
      phone: snapshot.phone,
      email: snapshot.email,
      website: snapshot.website,
      logoUrl: snapshot.logoUrl,
      accentColor: snapshot.accentColor,
      paymentInstructions: snapshot.paymentInstructions,
      businessLicense: snapshot.businessLicense,
      gstNumber: snapshot.gstNumber,
      warrantyMessage: snapshot.warrantyMessage,
      invoicePdfFooter: snapshot.invoicePdfFooter,
    };
  }

  private buildCompanyAddress(settings: OrganizationSettingEntity | null) {
    if (!settings) {
      return null;
    }

    const parts = [
      this.normalizeString(settings.address),
      this.normalizeString(settings.city),
      this.normalizeString(settings.zip),
    ].filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }

  private normalizeString(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : null;
  }
}
