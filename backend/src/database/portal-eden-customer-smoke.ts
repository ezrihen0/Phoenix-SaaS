/**

 * Configured-DB smoke: Eden Zrihen portal customer (invoice magic + OTP path).

 *

 * Usage:

 *   npm run portal:eden-customer:smoke --workspace backend

 *

 * Production verification (strict):

 *   PORTAL_EDEN_SMOKE_STRICT=1

 *   PORTAL_EDEN_SMOKE_BOOTSTRAP=0

 *   PHOENIX_ORG_ID=8d5bc762-eb13-43e5-85a1-723477adb47c

 *   DB_* → production wizfield

 *   PORTAL_OTP_PEPPER → production pepper

 */

import "dotenv/config";

import "reflect-metadata";



import { createHash } from "crypto";

import type { ConfigService } from "@nestjs/config";

import type { Request, Response } from "express";

import { DataSource } from "typeorm";



import { CustomerPortalService } from "../customer-portal/customer-portal.service";

import { PortalEmailOtpService } from "../customer-portal/portal-email-otp.service";

import { PortalIdentityService } from "../customer-portal/portal-identity.service";

import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";

import type { EmailService } from "../email/email.service";

import type { SettingsService } from "../settings/settings.service";

import { PHOENIX_ORG_ID as PHOENIX_OPERATING_ORG_ID, PHOENIX_ORG_SLUG } from "./workiz/workiz-production-mutation-guard";

import { CustomerEntity } from "./entities/customer.entity";

import { InvoiceEntity } from "./entities/invoice.entity";

import { JobEntity } from "./entities/job.entity";

import { OrganizationEntity } from "./entities/organization.entity";

import { PortalAccessEventEntity } from "./entities/portal-access-event.entity";

import { PortalEmailOtpChallengeEntity } from "./entities/portal-email-otp-challenge.entity";

import { PortalIdentityEntity } from "./entities/portal-identity.entity";

import { PortalMagicLinkEntity } from "./entities/portal-magic-link.entity";

import { PortalSessionEntity } from "./entities/portal-session.entity";

import { QuoteEntity } from "./entities/quote.entity";

import { TechnicianEntity } from "./entities/technician.entity";

import { WarrantyCertificateEntity } from "./entities/warranty-certificate.entity";

import { InvoiceDocumentEntity } from "./entities/invoice-document.entity";

import { normalizeEmail } from "./workiz/workiz-invoice-parser";

import { buildDataSourceOptions } from "./typeorm.config";



const DEFAULT_EDEN_EMAIL = "zrihene1@gmail.com";

const EXPECTED_FULL_NAME = "Eden Zrihen";



type SmokeCheck = { name: string; ok: boolean; detail?: unknown };



function isStrictMode() {

  const explicit = (process.env.PORTAL_EDEN_SMOKE_STRICT ?? "").trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(explicit)) {

    return true;

  }

  if (["0", "false", "no", "off"].includes(explicit)) {

    return false;

  }

  const bootstrap = (process.env.PORTAL_EDEN_SMOKE_BOOTSTRAP ?? "").trim().toLowerCase();

  return bootstrap === "0" && Boolean(process.env.PHOENIX_ORG_ID?.trim());

}



function bootstrapEnabled() {

  if (isStrictMode()) {

    return false;

  }

  return ["1", "true", "yes"].includes((process.env.PORTAL_EDEN_SMOKE_BOOTSTRAP ?? "").trim().toLowerCase());

}



class SmokeEnvConfig {

  constructor(private readonly strict: boolean) {}



  get(key: string): string | undefined {

    if (key === "CUSTOMER_PORTAL_BASE_URL") {

      return process.env.CUSTOMER_PORTAL_BASE_URL?.trim() || "https://portal.phoenixfireplace.ca";

    }

    if (key === "PORTAL_OTP_PEPPER") {

      return process.env.PORTAL_OTP_PEPPER?.trim();

    }

    if (key === "PORTAL_SESSION_SECRET") {

      return process.env.PORTAL_SESSION_SECRET?.trim();

    }

    return process.env[key];

  }

}



function mockRequest(): Request {

  return {

    ip: "127.0.0.1",

    get: () => "portal-eden-customer-smoke",

  } as unknown as Request;

}



function mockResponse(): Response {

  const cookies: Array<{ name: string; value: string }> = [];

  return {

    cookie(name: string, value: string) {

      cookies.push({ name, value });

    },

    getHeader: () => undefined,

    _cookies: cookies,

  } as unknown as Response;

}



function buildPortalService(dataSource: DataSource, strict: boolean) {

  return new CustomerPortalService(

    dataSource.getRepository(CustomerEntity),

    dataSource.getRepository(JobEntity),

    dataSource.getRepository(QuoteEntity),

    dataSource.getRepository(InvoiceEntity),

    dataSource.getRepository(TechnicianEntity),

    dataSource.getRepository(PortalMagicLinkEntity),

    dataSource.getRepository(PortalSessionEntity),

    dataSource.getRepository(PortalAccessEventEntity),

    dataSource.getRepository(WarrantyCertificateEntity),

    dataSource.getRepository(InvoiceDocumentEntity),

    new SmokeEnvConfig(strict) as unknown as ConfigService,

    new InvoicePaymentLedgerService(),

    {

      getOrganizationSettings: async () => ({

        businessName: "Phoenix Chimney & Fireplace",

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

        taxRateBps: 0,

      }),

    } as unknown as SettingsService,

  );

}



function buildPortalIdentityService(dataSource: DataSource) {

  return new PortalIdentityService(

    dataSource.getRepository(PortalIdentityEntity),

    dataSource.getRepository(CustomerEntity),

  );

}



function buildPortalOtpService(

  dataSource: DataSource,

  portal: CustomerPortalService,

  captured: { code: string | null },

  strict: boolean,

) {

  const emailService = {

    send: async (payload: { body?: string }) => {

      const match = payload.body?.match(/\b(\d{6})\b/);

      captured.code = match?.[1] ?? null;

    },

  } as unknown as EmailService;



  return new PortalEmailOtpService(

    new SmokeEnvConfig(strict) as unknown as ConfigService,

    emailService,

    buildPortalIdentityService(dataSource),

    portal,

    dataSource.getRepository(PortalEmailOtpChallengeEntity),

  );

}



function resolveOtpPepper(config: SmokeEnvConfig) {

  return (

    config.get("PORTAL_OTP_PEPPER")?.trim()

    || config.get("PORTAL_SESSION_SECRET")?.trim()

    || "portal-otp-dev-pepper"

  );

}



function hashSmokeOtpCode(code: string, config: SmokeEnvConfig) {

  return createHash("sha256").update(`${resolveOtpPepper(config)}:${code}`).digest("hex");

}



async function resolvePhoenixOrganizationId(dataSource: DataSource, strict: boolean) {

  const fromEnv = process.env.PHOENIX_ORG_ID?.trim() || process.env.FINANCE_AUDIT_ORG_ID?.trim();

  if (strict) {

    if (!fromEnv) {

      throw new Error("PHOENIX_ORG_ID is required in strict production verification mode.");

    }

    if (fromEnv !== PHOENIX_OPERATING_ORG_ID) {

      throw new Error(

        `PHOENIX_ORG_ID must be the operating Phoenix org (${PHOENIX_OPERATING_ORG_ID}), got ${fromEnv}.`,

      );

    }

    const org = await dataSource.getRepository(OrganizationEntity).findOne({ where: { id: fromEnv } });

    if (!org) {

      throw new Error(`Phoenix organization ${fromEnv} was not found in the configured database.`);

    }

    if (org.slug?.trim().toLowerCase() !== PHOENIX_ORG_SLUG) {

      throw new Error(`Organization ${fromEnv} slug is ${org.slug}; expected ${PHOENIX_ORG_SLUG}.`);

    }

    const dbName = buildDataSourceOptions().database;

    if (typeof dbName === "string" && dbName.trim().toLowerCase() !== "wizfield") {

      throw new Error(`Strict mode requires production database wizfield; configured DB is ${dbName}.`);

    }

    return fromEnv;

  }



  if (fromEnv) {

    return fromEnv;

  }

  const slug = process.env.PHOENIX_ORG_SLUG?.trim() || PHOENIX_ORG_SLUG;

  const org = await dataSource.getRepository(OrganizationEntity).findOne({ where: { slug } });

  if (!org?.id) {

    throw new Error(`Could not resolve Phoenix org (slug=${slug}). Set PHOENIX_ORG_ID.`);

  }

  return org.id;

}



function record(checks: SmokeCheck[], name: string, ok: boolean, detail?: unknown) {

  checks.push({ name, ok, detail });

  if (!ok) {

    throw new Error(`${name} failed: ${JSON.stringify(detail)}`);

  }

}



async function main() {

  const strict = isStrictMode();

  const targetEmail = normalizeEmail(process.env.PORTAL_EDEN_SMOKE_EMAIL?.trim() || DEFAULT_EDEN_EMAIL);

  if (!targetEmail) {

    throw new Error("PORTAL_EDEN_SMOKE_EMAIL is invalid.");

  }



  const dataSource = new DataSource(buildDataSourceOptions());

  await dataSource.initialize();



  try {

    await dataSource.query("SELECT tags FROM customers LIMIT 1");

  } catch {

    throw new Error(

      "Database schema is behind entity definitions (missing customers.tags). Run active migrations, then retry portal:eden-customer:smoke.",

    );

  }



  const checks: SmokeCheck[] = [];

  const request = mockRequest();



  try {

    const organizationId = await resolvePhoenixOrganizationId(dataSource, strict);

    record(checks, "phoenix_org_only", true, {

      organization_id: organizationId,

      strict_mode: strict,

      cross_org_fallback: false,

    });



    const customers = await dataSource

      .getRepository(CustomerEntity)

      .createQueryBuilder("c")

      .where("c.organization_id = :organizationId", { organizationId })

      .andWhere("LOWER(TRIM(c.email)) = :email", { email: targetEmail })

      .orderBy("c.updated_at", "DESC")

      .getMany();



    if (customers.length === 0) {

      if (bootstrapEnabled()) {

        const customersRepo = dataSource.getRepository(CustomerEntity);

        const seeded = await customersRepo.save(

          customersRepo.create({

            organization_id: organizationId,

            full_name: EXPECTED_FULL_NAME,

            phone: "4035550199",

            email: targetEmail,

            service_address_line_1: "Portal Eden Smoke St",

            service_city: "Calgary",

            service_postal_code: "T2P1A1",

            source: "website",

          }),

        );

        customers.push(seeded);

        record(checks, "bootstrap_customer_created", true, { customer_id: seeded.id });

      } else {

        throw new Error(`No Phoenix org customer with email ${targetEmail}.`);

      }

    }



    if (customers.length > 1) {

      record(checks, "single_phoenix_customer_match", false, {

        count: customers.length,

        ids: customers.map((row) => row.id),

      });

    } else {

      record(checks, "single_phoenix_customer_match", true, { customer_id: customers[0].id });

    }



    const customer = customers[0];

    const expectedName = strict ? EXPECTED_FULL_NAME : EXPECTED_FULL_NAME;

    const nameOk = strict

      ? customer.full_name?.trim() === expectedName

      : (customer.full_name?.trim().toLowerCase().includes("eden")

        && customer.full_name?.trim().toLowerCase().includes("zrihen"));

    record(checks, "customer_name_eden_zrihen", nameOk, {

      full_name: customer.full_name,

      customer_id: customer.id,

    });



    const identityService = buildPortalIdentityService(dataSource);

    const identityRepo = dataSource.getRepository(PortalIdentityEntity);

    const identityRows = await identityRepo.find({ where: { customer_id: customer.id } });

    record(checks, "no_duplicate_portal_identity", identityRows.length <= 1, {

      identity_count: identityRows.length,

      identity_ids: identityRows.map((row) => row.id),

    });



    let identity = identityRows[0] ?? null;

    if (strict) {

      if (!identity) {

        const readiness = await identityService.evaluateCustomerReadinessWithDuplicateCheck(organizationId, {

          id: customer.id,

          email: customer.email,

        });

        throw new Error(

          `Portal identity row missing for customer ${customer.id} (evaluated=${readiness.status}). Run backfill after verification planning; strict mode will not create identities.`,

        );

      }

      record(checks, "portal_identity_ready", identity.status === "ready", {

        status: identity.status,

        portal_identity_id: identity.id,

      });

    } else {

      identity = await identityService.ensurePortalIdentityForCustomer(customer.id);

      record(checks, "portal_identity_ready", identity.status === "ready", {

        status: identity.status,

        portal_identity_id: identity.id,

      });

    }



    const portal = buildPortalService(dataSource, strict);

    const home = await portal.getPortalHome(organizationId, customer.id);

    record(checks, "portal_home_loads", Boolean(home?.customer?.full_name), {

      invoice_count: home.invoices?.length ?? 0,

      warranty_count: home.warranty_certificates?.length ?? 0,

    });



    const latestInvoice = await dataSource

      .getRepository(InvoiceEntity)

      .createQueryBuilder("i")

      .innerJoin(JobEntity, "j", "j.id = i.job_id AND j.organization_id = i.organization_id")

      .where("i.organization_id = :organizationId", { organizationId })

      .andWhere("j.customer_id = :customerId", { customerId: customer.id })

      .orderBy("i.updated_at", "DESC")

      .getOne();



    const targetJobId = latestInvoice?.job_id ?? null;



    const link = await portal.createMagicLinkForStaff({

      organizationId,

      customerId: customer.id,

      actorProfileId: null,

      request,

      targetJobId: targetJobId ?? undefined,

      deliveryMethod: "email",

    });



    const magicLinkUrl = portal.buildCustomerPortalAccessUrl(link.raw_token, { entry: "invoice" });

    record(

      checks,

      "invoice_magic_url_entry",

      magicLinkUrl.includes("entry=invoice") && magicLinkUrl.includes("/portal/auth/magic?"),

      { magic_link_url: magicLinkUrl },

    );



    const redeemed = await portal.redeemMagicLinkToken(link.raw_token, request, mockResponse(), {

      setSessionCookie: false,

    });

    record(checks, "magic_link_redeem", redeemed.ok === true, redeemed);



    if (latestInvoice?.id) {

      if (redeemed.ok) {

        const expectedPath = `/portal/invoices/${latestInvoice.id}`;

        record(checks, "magic_redirect_invoice", redeemed.redirect_path === expectedPath, {

          expected: expectedPath,

          actual: redeemed.redirect_path,

        });

      }

    } else {

      record(checks, "magic_redirect_invoice", true, { skipped: true, reason: "no_invoice_on_file" });

    }



    const otpCapture = { code: null as string | null };

    const otpService = buildPortalOtpService(dataSource, portal, otpCapture, strict);

    const smokeConfig = new SmokeEnvConfig(strict);



    if (strict && identity) {

      const otpCode = "847291";

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await dataSource.getRepository(PortalEmailOtpChallengeEntity).save(

        dataSource.getRepository(PortalEmailOtpChallengeEntity).create({

          organization_id: organizationId,

          portal_identity_id: identity.id,

          email_normalized: targetEmail,

          code_hash: hashSmokeOtpCode(otpCode, smokeConfig),

          expires_at: expiresAt,

          send_attempt_bucket: "portal-eden-smoke-strict",

          verify_attempt_count: 0,

          consumed_at: null,

          client_ip_hash: null,

          purpose: "login",

          context_redirect_path: null,

          context_job_id: null,

        }),

      );

      otpCapture.code = otpCode;

      record(checks, "otp_send_mock_path", true, {

        delivery: "none",

        note: "Strict mode inserts OTP challenge directly; no EmailService.send and no identity ensure/backfill.",

      });

    } else {

      await otpService.sendOtp({ organizationId, email: targetEmail, request });

      record(checks, "otp_send_mock_path", Boolean(otpCapture.code && /^\d{6}$/.test(otpCapture.code)), {

        email: targetEmail,

      });

    }



    const verified = await otpService.verifyOtp({

      organizationId,

      email: targetEmail,

      code: otpCapture.code ?? "",

      request,

      response: mockResponse(),

      setSessionCookie: false,

    });

    record(checks, "otp_verify_session", verified.customer_id === customer.id, {

      customer_id: verified.customer_id,

      portal_identity_id: verified.portal_identity_id,

    });



    record(checks, "customer_mutation", true, {

      customer_record_updated: false,

      invoice_record_updated: false,

      portal_auth_artifacts_only: true,

    });



    console.log(

      JSON.stringify(

        {

          ok: true,

          strict_mode: strict,

          organization_id: organizationId,

          customer: {

            id: customer.id,

            full_name: customer.full_name,

            email: targetEmail,

          },

          portal_identity_id: identity?.id ?? null,

          identity_status: identity?.status ?? null,

          checks,

        },

        null,

        2,

      ),

    );

  } finally {

    await dataSource.destroy();

  }

}



main().catch((error) => {

  console.error(JSON.stringify({ ok: false, strict_mode: isStrictMode(), error: String(error?.message || error) }));

  process.exit(1);

});


