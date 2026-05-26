import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";

export type OrganizationSettingsResponse = {
  businessName: string | null;
  displayInitials: string | null;
  companyDescription: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  website: string | null;
  companyEmail: string | null;
  phone: string | null;
  timezone?: string | null;
  googleReviewUrl?: string | null;
  defaultSmsNumber?: string | null;
  businessHours?: string | null;
  invoiceEmailSubject?: string | null;
  invoiceEmailBody?: string | null;
  invoiceSmsBody?: string | null;
  invoicePdfFooter?: string | null;
  logoUrl?: string | null;
  accentColor?: string | null;
  paymentInstructions?: string | null;
  businessLicense?: string | null;
  gstNumber?: string | null;
  warrantyMessage?: string | null;
  defaultDueDays?: number | null;
  taxRateBps: number;
};

export type OrganizationSettingsUpdateInput = {
  businessName: string | null;
  displayInitials: string | null;
  phone: string | null;
  companyEmail: string | null;
  website: string | null;
  timezone: string | null | undefined;
  googleReviewUrl: string | null | undefined;
  defaultSmsNumber: string | null | undefined;
  businessHours: string | null | undefined;
  invoiceEmailSubject?: string | null | undefined;
  invoiceEmailBody?: string | null | undefined;
  invoiceSmsBody?: string | null | undefined;
  invoicePdfFooter?: string | null | undefined;
  logoUrl?: string | null | undefined;
  accentColor?: string | null | undefined;
  paymentInstructions?: string | null | undefined;
  businessLicense?: string | null | undefined;
  gstNumber?: string | null | undefined;
  warrantyMessage?: string | null | undefined;
  defaultDueDays?: number | null | undefined;
};

const ORGANIZATION_SETTINGS_KEY = "default";

@Injectable()
export class SettingsService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(OrganizationSettingEntity)
    private readonly organizationSettingsRepository: Repository<OrganizationSettingEntity>,
  ) {}

  async getOrganizationSettings(organizationId: string): Promise<OrganizationSettingsResponse> {
    const settings = await this.organizationSettingsRepository.findOne({
      where: {
        settings_key: this.buildOrganizationSettingsKey(organizationId),
        organization_id: organizationId,
      },
    });

    if (!settings) {
      return {
        businessName: null,
        displayInitials: null,
        companyDescription: null,
        address: null,
        city: null,
        zip: null,
        website: null,
        companyEmail: null,
        phone: null,
        timezone: null,
        googleReviewUrl: null,
        defaultSmsNumber: null,
        businessHours: null,
        invoiceEmailSubject: null,
        invoiceEmailBody: null,
        invoiceSmsBody: null,
        invoicePdfFooter: null,
        logoUrl: null,
        accentColor: null,
        paymentInstructions: null,
        businessLicense: null,
        gstNumber: null,
        warrantyMessage: null,
        defaultDueDays: null,
        taxRateBps: this.readNumber("ORG_TAX_RATE_BPS", 0),
      };
    }

    return this.buildOrganizationSettingsResponse(settings);
  }

  async updateOrganizationSettings(
    organizationId: string,
    input: OrganizationSettingsUpdateInput,
  ): Promise<OrganizationSettingsResponse> {
    const existing = await this.organizationSettingsRepository.findOne({
      where: {
        settings_key: this.buildOrganizationSettingsKey(organizationId),
        organization_id: organizationId,
      },
    });

    const settings = existing ?? this.organizationSettingsRepository.create({
      settings_key: this.buildOrganizationSettingsKey(organizationId),
      organization_id: organizationId,
      company_description: null,
      address: null,
      city: null,
      zip: null,
    });

    settings.business_name = input.businessName;
    settings.display_initials = input.displayInitials;
    settings.phone = input.phone;
    settings.company_email = input.companyEmail;
    settings.website = input.website;
    if (input.timezone !== undefined) {
      settings.timezone = input.timezone;
    }

    if (input.googleReviewUrl !== undefined) {
      settings.google_review_url = input.googleReviewUrl;
    }

    if (input.defaultSmsNumber !== undefined) {
      settings.default_sms_number = input.defaultSmsNumber;
    }

    if (input.businessHours !== undefined) {
      settings.business_hours = input.businessHours;
    }
    if (input.invoiceEmailSubject !== undefined) {
      settings.invoice_email_subject = input.invoiceEmailSubject;
    }
    if (input.invoiceEmailBody !== undefined) {
      settings.invoice_email_body = input.invoiceEmailBody;
    }
    if (input.invoiceSmsBody !== undefined) {
      settings.invoice_sms_body = input.invoiceSmsBody;
    }
    if (input.invoicePdfFooter !== undefined) {
      settings.invoice_pdf_footer = input.invoicePdfFooter;
    }
    if (input.logoUrl !== undefined) {
      settings.logo_url = input.logoUrl;
    }
    if (input.accentColor !== undefined) {
      settings.accent_color = input.accentColor;
    }
    if (input.paymentInstructions !== undefined) {
      settings.payment_instructions = input.paymentInstructions;
    }
    if (input.businessLicense !== undefined) {
      settings.business_license = input.businessLicense;
    }
    if (input.gstNumber !== undefined) {
      settings.gst_number = input.gstNumber;
    }
    if (input.warrantyMessage !== undefined) {
      settings.warranty_message = input.warrantyMessage;
    }
    if (input.defaultDueDays !== undefined) {
      settings.default_due_days = input.defaultDueDays;
    }

    const savedSettings = await this.organizationSettingsRepository.save(settings);
    return this.buildOrganizationSettingsResponse(savedSettings);
  }

  private buildOrganizationSettingsResponse(settings: OrganizationSettingEntity): OrganizationSettingsResponse {
    return {
      businessName: settings.business_name,
      displayInitials: settings.display_initials,
      companyDescription: settings.company_description,
      address: settings.address,
      city: settings.city,
      zip: settings.zip,
      website: settings.website,
      companyEmail: settings.company_email,
      phone: settings.phone,
      timezone: settings.timezone,
      googleReviewUrl: settings.google_review_url,
      defaultSmsNumber: settings.default_sms_number,
      businessHours: settings.business_hours,
      invoiceEmailSubject: settings.invoice_email_subject,
      invoiceEmailBody: settings.invoice_email_body,
      invoiceSmsBody: settings.invoice_sms_body,
      invoicePdfFooter: settings.invoice_pdf_footer,
      logoUrl: settings.logo_url,
      accentColor: settings.accent_color,
      paymentInstructions: settings.payment_instructions,
      businessLicense: settings.business_license,
      gstNumber: settings.gst_number,
      warrantyMessage: settings.warranty_message,
      defaultDueDays: settings.default_due_days,
      taxRateBps: this.readNumber("ORG_TAX_RATE_BPS", 0),
    };
  }

  private readNumber(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    if (typeof raw !== "string") {
      return fallback;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private buildOrganizationSettingsKey(organizationId: string) {
    return `${organizationId}:${ORGANIZATION_SETTINGS_KEY}`;
  }
}
