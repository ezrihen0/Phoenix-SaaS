import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

import { EmailService } from "../email/email.service";
import {
  buildBookingConfirmationPortalAccessHtml,
  buildBookingConfirmationPortalAccessPlain,
} from "../email/booking-confirmation-portal-access.template";
import { SettingsService } from "../settings/settings.service";
import { PortalEmailOtpService } from "./portal-email-otp.service";
import { buildPortalJobRedirectPath } from "./portal-redirect-path";

export type BookingConfirmationInput = {
  organizationId: string;
  customerId: string;
  customerName: string;
  email: string | null;
  serviceSummary: string;
  addressLine: string;
  scheduledSummary: string | null;
  jobId?: string | null;
  request: Request;
};

export type BookingPortalAccessResult = {
  status: "code_sent" | "skipped_not_ready" | "skipped_no_email" | "email_failed";
  expiresAt: string | null;
};

@Injectable()
export class PortalBookingConfirmationService {
  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
    private readonly portalEmailOtpService: PortalEmailOtpService,
  ) {}

  async sendBookingConfirmationWithPortalAccess(
    input: BookingConfirmationInput,
  ): Promise<BookingPortalAccessResult> {
    const email = input.email?.trim() || "";
    if (!email) {
      return { status: "skipped_no_email", expiresAt: null };
    }

    const redirectPath = buildPortalJobRedirectPath(input.jobId);
    let accessCode: string | null = null;
    let codeExpiresAtLabel: string | null = null;
    let codeExpiresAtIso: string | null = null;
    let portalAccessStatus: BookingPortalAccessResult["status"] = "skipped_not_ready";

    try {
      const issued = await this.portalEmailOtpService.issueBookingWelcomeCode({
        organizationId: input.organizationId,
        customerId: input.customerId,
        email,
        redirectPath,
        jobId: input.jobId ?? null,
        request: input.request,
      });
      if (issued.issued) {
        accessCode = issued.code;
        codeExpiresAtLabel = issued.expiresAtLabel;
        codeExpiresAtIso = issued.expiresAt.toISOString();
        portalAccessStatus = "code_sent";
      }
    } catch {
      return { status: "email_failed", expiresAt: null };
    }

    const orgSettings = await this.settingsService.getOrganizationSettings(input.organizationId);
    const portalBase =
      this.configService.get<string>("CUSTOMER_PORTAL_BASE_URL")?.trim()
      || this.configService.get<string>("PHOENIX_PORTAL_PUBLIC_BASE_URL")?.trim()
      || "https://portal.phoenixfireplace.ca";
    const loginUrl = new URL("/portal/login", portalBase.replace(/\/+$/, ""));
    loginUrl.searchParams.set("email", email);

    const subject = accessCode
      ? "Your Phoenix booking is confirmed — portal access code inside"
      : "Your Phoenix booking is confirmed";

    try {
      await this.emailService.send({
        to: email,
        subject,
        body: buildBookingConfirmationPortalAccessPlain({
          businessName: orgSettings.businessName?.trim() || "Phoenix Chimney & Fireplace",
          customerName: input.customerName,
          serviceSummary: input.serviceSummary,
          addressLine: input.addressLine,
          scheduledSummary: input.scheduledSummary,
          portalLoginUrl: loginUrl.toString(),
          accessCode,
          codeExpiresAtLabel,
        }),
        html: buildBookingConfirmationPortalAccessHtml({
          businessName: orgSettings.businessName?.trim() || "Phoenix Chimney & Fireplace",
          customerName: input.customerName,
          serviceSummary: input.serviceSummary,
          addressLine: input.addressLine,
          scheduledSummary: input.scheduledSummary,
          portalLoginUrl: loginUrl.toString(),
          accessCode,
          codeExpiresAtLabel,
        }),
      });
    } catch {
      return { status: "email_failed", expiresAt: null };
    }

    return {
      status: portalAccessStatus,
      expiresAt: portalAccessStatus === "code_sent" ? codeExpiresAtIso : null,
    };
  }
}
