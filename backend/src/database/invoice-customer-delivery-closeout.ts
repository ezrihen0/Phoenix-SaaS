/**
 * Hermetic closeout: real SMTP sample + magic-link URL sanity (no secrets logged).
 * Usage: node -r ts-node/register src/database/invoice-customer-delivery-closeout.ts
 */
import "dotenv/config";

import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { DataSource } from "typeorm";

import { CustomerPortalService } from "../customer-portal/customer-portal.service";
import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";
import { DocumentBrandingSnapshotService } from "../documents/pdf/document-branding-snapshot.service";
import { EmailService } from "../email/email.service";
import {
  buildInvoiceCustomerHtmlEmail,
  buildInvoiceCustomerPlainTextEmail,
} from "../email/invoice-customer-email.template";
import type { SettingsService } from "../settings/settings.service";
import { CustomerEntity } from "./entities/customer.entity";
import { InvoiceDocumentEntity } from "./entities/invoice-document.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationSettingEntity } from "./entities/organization-setting.entity";
import { PortalAccessEventEntity } from "./entities/portal-access-event.entity";
import { PortalMagicLinkEntity } from "./entities/portal-magic-link.entity";
import { PortalSessionEntity } from "./entities/portal-session.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { TechnicianEntity } from "./entities/technician.entity";
import { WarrantyCertificateEntity } from "./entities/warranty-certificate.entity";
import { buildCustomerPortalAccessUrl, resolveCustomerPortalBaseUrl } from "../customer-portal/customer-portal-url";
import { buildDataSourceOptions } from "./typeorm.config";

const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";
const ORGANIZATION_SETTINGS_KEY = "default";

function buildPortalService(dataSource: DataSource) {
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
    new ConfigService(),
    new InvoicePaymentLedgerService(),
    {} as SettingsService,
  );
}

async function main() {
  const to =
    process.env.INVOICE_DELIVERY_CLOSEOUT_TO?.trim()
    || process.env.PHOENIX_OWNER_EMAIL?.trim()
    || "";

  if (!to) {
    throw new Error("Set INVOICE_DELIVERY_CLOSEOUT_TO or PHOENIX_OWNER_EMAIL.");
  }

  const configService = new ConfigService();
  const emailService = new EmailService(configService);
  if (!emailService.isConfigured()) {
    throw new Error("Email service is not configured.");
  }

  const customerPortalBaseUrl = resolveCustomerPortalBaseUrl(configService);
  if (/localhost|127\.0\.0\.1/i.test(customerPortalBaseUrl)) {
    throw new Error("CUSTOMER_PORTAL_BASE_URL (or PHOENIX_PORTAL_PUBLIC_BASE_URL) must be production HTTPS for closeout.");
  }

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const settingsRepo = dataSource.getRepository(OrganizationSettingEntity);
    const fixtureRows = await dataSource.query(
      `SELECT c.organization_id AS organization_id, c.id AS customer_id, j.id AS job_id, i.id AS invoice_id, i.document_number
       FROM customers c
       INNER JOIN jobs j ON j.customer_id = c.id AND j.organization_id = c.organization_id
       INNER JOIN invoices i ON i.job_id = j.id AND i.organization_id = c.organization_id
       WHERE c.organization_id IS NOT NULL
       ORDER BY CASE WHEN c.organization_id = ? THEN 0 ELSE 1 END, i.updated_at DESC
       LIMIT 1`,
      [PHOENIX_ORG_ID],
    ) as Array<{
      organization_id: string;
      customer_id: string;
      job_id: string;
      invoice_id: string;
      document_number: string | null;
    }>;

    const fixture = fixtureRows[0];
    if (!fixture?.customer_id || !fixture.job_id || !fixture.organization_id) {
      throw new Error("No invoice fixture found for closeout.");
    }

    const orgSettings =
      (await settingsRepo.findOne({
        where: {
          organization_id: fixture.organization_id,
          settings_key: `${fixture.organization_id}:${ORGANIZATION_SETTINGS_KEY}`,
        },
      }))
      ?? (await settingsRepo.findOne({
        where: {
          organization_id: fixture.organization_id,
          settings_key: ORGANIZATION_SETTINGS_KEY,
        },
      }));

    const portal = buildPortalService(dataSource);
    const mockRequest = {
      ip: "127.0.0.1",
      get: () => "invoice-delivery-closeout",
    } as unknown as Request;

    const portalLink = await portal.createMagicLinkForStaff({
      organizationId: fixture.organization_id,
      customerId: fixture.customer_id,
      actorProfileId: null,
      request: mockRequest,
      targetJobId: fixture.job_id,
      deliveryMethod: "email",
    });

    const magicLinkUrl = buildCustomerPortalAccessUrl(configService, portalLink.raw_token, { entry: "invoice" });
    if (!magicLinkUrl.includes("/portal/auth/magic?") || !magicLinkUrl.includes("entry=invoice")) {
      throw new Error(`Unexpected invoice magic link URL shape: ${magicLinkUrl}`);
    }
    const branding = new DocumentBrandingSnapshotService().fromOrganizationSettings(orgSettings);
    const invoiceNumber = fixture.document_number?.trim() || "CLOSEOUT-VERIFY";
    const messagePlain = [
      "Hi there,",
      "",
      "This is a controlled Invoice Customer Delivery closeout message.",
      "",
      "Please use the button below to verify secure invoice access.",
    ].join("\n");

    const redirectPath = await portal.resolveMagicLinkRedirectPath({
      organizationId: fixture.organization_id,
      customerId: fixture.customer_id,
      targetJobId: fixture.job_id,
    });
    const expectedRedirectPath = `/portal/invoices/${fixture.invoice_id}`;
    if (redirectPath !== expectedRedirectPath) {
      throw new Error(`Unexpected redirect_path: ${redirectPath}`);
    }

    const sendResult = await emailService.send({
      to,
      subject: `[WizField Closeout] Your Invoice from ${branding.businessName ?? "Phoenix Fireplace"}`,
      body: buildInvoiceCustomerPlainTextEmail({
        branding,
        invoiceNumber,
        messagePlain,
        magicLinkUrl,
      }),
      html: buildInvoiceCustomerHtmlEmail({
        branding,
        invoiceNumber,
        messagePlain,
        magicLinkUrl,
      }),
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          smtp: {
            messageId: sendResult.messageId,
            sentAt: sendResult.sentAt.toISOString(),
            recipientMasked: to.replace(/^(.).+(@.+)$/, "$1***$2"),
            htmlIncluded: true,
            attachmentCount: 0,
          },
          magicLink: {
            customerPortalBaseUrl,
            redirectPathVerified: redirectPath,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
});
