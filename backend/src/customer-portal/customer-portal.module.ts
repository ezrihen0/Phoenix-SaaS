import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { PortalAccessEventEntity } from "../database/entities/portal-access-event.entity";
import { PortalMagicLinkEntity } from "../database/entities/portal-magic-link.entity";
import { PortalSessionEntity } from "../database/entities/portal-session.entity";
import { QuoteEntity } from "../database/entities/quote.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";
import { WarrantyCertificateEntity } from "../database/entities/warranty-certificate.entity";
import { InvoiceDocumentEntity } from "../database/entities/invoice-document.entity";
import { InvoicePaymentEntity } from "../database/entities/invoice-payment.entity";
import { InvoicePaymentLedgerService } from "../crm/invoice-payment-ledger.service";
import { PhoenixIntegrationAuthService } from "../integrations/phoenix/phoenix-integration-auth.service";
import { PhoenixIntegrationGuard } from "../integrations/phoenix/phoenix-integration.guard";
import { CustomerPortalAuthController } from "./customer-portal.auth.controller";
import { CustomerPortalPhoenixAuthController } from "./customer-portal.phoenix-auth.controller";
import { CustomerPortalReadController } from "./customer-portal.read.controller";
import { CustomerPortalStaffController } from "./customer-portal.staff.controller";
import { CustomerPortalService } from "./customer-portal.service";
import { PortalIntegratedSessionGuard } from "./portal-integrated-session.guard";
import { PortalSessionGuard } from "./portal-session.guard";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      CustomerEntity,
      JobEntity,
      QuoteEntity,
      InvoiceEntity,
      TechnicianEntity,
      PortalMagicLinkEntity,
      PortalSessionEntity,
      PortalAccessEventEntity,
      WarrantyCertificateEntity,
      InvoiceDocumentEntity,
      InvoicePaymentEntity,
    ]),
  ],
  controllers: [
    CustomerPortalAuthController,
    CustomerPortalPhoenixAuthController,
    CustomerPortalReadController,
    CustomerPortalStaffController,
  ],
  providers: [
    CustomerPortalService,
    PortalSessionGuard,
    PortalIntegratedSessionGuard,
    PhoenixIntegrationAuthService,
    PhoenixIntegrationGuard,
    InvoicePaymentLedgerService,
  ],
  exports: [
    CustomerPortalService,
    PortalSessionGuard,
    PortalIntegratedSessionGuard,
    PhoenixIntegrationAuthService,
    PhoenixIntegrationGuard,
  ],
})
export class CustomerPortalModule {}
