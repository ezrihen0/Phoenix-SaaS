import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomInt } from "crypto";
import type { Request, Response } from "express";
import { IsNull, MoreThan, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { PortalEmailOtpChallengeEntity } from "../database/entities/portal-email-otp-challenge.entity";
import { normalizeEmail } from "../database/workiz/workiz-invoice-parser";
import { EmailService } from "../email/email.service";
import { CustomerPortalService } from "./customer-portal.service";
import { normalizePortalRedirectPath } from "./portal-redirect-path";
import { PortalIdentityService } from "./portal-identity.service";

const LOGIN_OTP_TTL_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

@Injectable()
export class PortalEmailOtpService {
  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly portalIdentityService: PortalIdentityService,
    private readonly customerPortalService: CustomerPortalService,
    @InjectRepository(PortalEmailOtpChallengeEntity)
    private readonly challengesRepository: Repository<PortalEmailOtpChallengeEntity>,
  ) {}

  async sendOtp(input: { organizationId: string; email: string; request: Request }) {
    const organizationId = input.organizationId.trim();
    const emailNormalized = normalizeEmail(input.email);
    const generic = {
      accepted: true as const,
      message: "If that email is on file, a sign-in code is on its way.",
    };

    if (!emailNormalized) {
      return generic;
    }

    await this.assertSendRateLimit(organizationId, emailNormalized, input.request);

    const identity = await this.portalIdentityService.findReadyIdentityByEmail(organizationId, emailNormalized);
    if (!identity) {
      return generic;
    }

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + LOGIN_OTP_TTL_MS);

    await this.challengesRepository.save(
      this.challengesRepository.create({
        organization_id: organizationId,
        portal_identity_id: identity.id,
        email_normalized: emailNormalized,
        code_hash: this.hashOtpCode(code),
        expires_at: expiresAt,
        send_attempt_bucket: this.hourBucketKey(),
        verify_attempt_count: 0,
        consumed_at: null,
        client_ip_hash: this.hashClientIp(input.request.ip),
        purpose: "login",
        context_redirect_path: null,
        context_job_id: null,
      }),
    );

    await this.emailService.send({
      to: emailNormalized,
      subject: "Your Phoenix portal sign-in code",
      body: [
        "Use this one-time code to sign in to your Phoenix customer portal:",
        "",
        code,
        "",
        "This code expires in 10 minutes. If you did not request it, you can ignore this email.",
      ].join("\n"),
      html: `<p>Use this one-time code to sign in to your Phoenix customer portal:</p><p style="font-size:24px;font-weight:600;letter-spacing:0.2em">${code}</p><p>This code expires in 10 minutes.</p>`,
    });

    return generic;
  }

  async issueBookingWelcomeCode(input: {
    organizationId: string;
    customerId: string;
    email: string;
    redirectPath: string;
    jobId: string | null;
    request: Request;
  }) {
    const organizationId = input.organizationId.trim();
    const emailNormalized = normalizeEmail(input.email);
    if (!emailNormalized) {
      return { issued: false as const, code: "", expiresAt: new Date(), expiresAtLabel: "" };
    }

    await this.assertSendRateLimit(organizationId, emailNormalized, input.request);

    await this.portalIdentityService.ensurePortalIdentityForCustomer(input.customerId);
    const identity = await this.portalIdentityService.findReadyIdentityByEmail(organizationId, emailNormalized);
    if (!identity || identity.customer_id !== input.customerId.trim()) {
      return { issued: false as const, code: "", expiresAt: new Date(), expiresAtLabel: "" };
    }

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.bookingOtpTtlMs());
    const redirectPath = normalizePortalRedirectPath(input.redirectPath);

    await this.challengesRepository.save(
      this.challengesRepository.create({
        organization_id: organizationId,
        portal_identity_id: identity.id,
        email_normalized: emailNormalized,
        code_hash: this.hashOtpCode(code),
        expires_at: expiresAt,
        send_attempt_bucket: this.hourBucketKey(),
        verify_attempt_count: 0,
        consumed_at: null,
        client_ip_hash: this.hashClientIp(input.request.ip),
        purpose: "booking_welcome",
        context_redirect_path: redirectPath,
        context_job_id: input.jobId?.trim() || null,
      }),
    );

    return {
      issued: true as const,
      code,
      expiresAt,
      expiresAtLabel: expiresAt.toLocaleString("en-CA", {
        timeZone: "America/Edmonton",
        dateStyle: "medium",
        timeStyle: "short",
      }),
    };
  }

  async verifyOtp(input: {
    organizationId: string;
    email: string;
    code: string;
    request: Request;
    response: Response;
    setSessionCookie?: boolean;
  }) {
    const emailNormalized = normalizeEmail(input.email);
    const code = input.code.trim();
    if (!emailNormalized || !/^\d{6}$/.test(code)) {
      apiError(401, "invalid_otp", "The sign-in code is invalid or expired.");
    }

    const identity = await this.portalIdentityService.findReadyIdentityByEmail(
      input.organizationId.trim(),
      emailNormalized,
    );
    if (!identity) {
      apiError(401, "invalid_otp", "The sign-in code is invalid or expired.");
    }

    const challenge = await this.challengesRepository.findOne({
      where: {
        organization_id: input.organizationId.trim(),
        portal_identity_id: identity.id,
        email_normalized: emailNormalized,
        consumed_at: IsNull(),
      },
      order: { created_at: "DESC" },
    });

    if (!challenge || challenge.expires_at <= new Date()) {
      apiError(401, "invalid_otp", "The sign-in code is invalid or expired.");
    }

    if (challenge.verify_attempt_count >= MAX_VERIFY_ATTEMPTS) {
      apiError(429, "otp_verify_rate_limited", "Too many attempts. Request a new code.");
    }

    if (challenge.code_hash !== this.hashOtpCode(code)) {
      challenge.verify_attempt_count += 1;
      await this.challengesRepository.save(challenge);
      apiError(401, "invalid_otp", "The sign-in code is invalid or expired.");
    }

    challenge.consumed_at = new Date();
    await this.challengesRepository.save(challenge);

    this.portalIdentityService.assertIdentityReadyForAuthentication(identity);

    const redirectPath = normalizePortalRedirectPath(challenge.context_redirect_path, "/portal");

    return this.customerPortalService.establishPortalSessionForCustomer({
      organizationId: identity.organization_id,
      customerId: identity.customer_id,
      portalIdentityId: identity.id,
      portalMagicLinkId: null,
      request: input.request,
      response: input.response,
      setSessionCookie: input.setSessionCookie !== false,
      redirectPath,
    });
  }

  private bookingOtpTtlMs() {
    const raw = Number(this.configService.get<string>("PORTAL_BOOKING_OTP_TTL_MINUTES") ?? "15");
    const minutes = Number.isFinite(raw) ? Math.min(15, Math.max(10, Math.round(raw))) : 15;
    return minutes * 60 * 1000;
  }

  private generateCode() {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
  }

  private async assertSendRateLimit(organizationId: string, emailNormalized: string, request: Request) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const emailCount = await this.challengesRepository.count({
      where: {
        organization_id: organizationId,
        email_normalized: emailNormalized,
        created_at: MoreThan(since),
      },
    });
    if (emailCount >= MAX_SENDS_PER_HOUR) {
      apiError(429, "otp_send_rate_limited", "Too many code requests. Try again later.");
    }

    const ipHash = this.hashClientIp(request.ip);
    if (ipHash) {
      const ipCount = await this.challengesRepository.count({
        where: {
          organization_id: organizationId,
          client_ip_hash: ipHash,
          created_at: MoreThan(since),
        },
      });
      if (ipCount >= MAX_SENDS_PER_HOUR * 2) {
        apiError(429, "otp_send_rate_limited", "Too many code requests. Try again later.");
      }
    }
  }

  private hashOtpCode(code: string) {
    const pepper =
      this.configService.get<string>("PORTAL_OTP_PEPPER")?.trim()
      || this.configService.get<string>("PORTAL_SESSION_SECRET")?.trim()
      || "portal-otp-dev-pepper";
    return createHash("sha256").update(`${pepper}:${code}`).digest("hex");
  }

  private hashClientIp(ip: string | undefined) {
    if (!ip?.trim()) {
      return null;
    }
    return createHash("sha256").update(ip.trim()).digest("hex").slice(0, 64);
  }

  private hourBucketKey() {
    const hour = Math.floor(Date.now() / (60 * 60 * 1000));
    return String(hour);
  }
}
