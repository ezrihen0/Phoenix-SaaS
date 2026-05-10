import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { PortalAccessEventEntity } from "../database/entities/portal-access-event.entity";
import { PortalMagicLinkEntity } from "../database/entities/portal-magic-link.entity";
import { PortalSessionEntity } from "../database/entities/portal-session.entity";
import { QuoteEntity } from "../database/entities/quote.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";
import { CustomerPortalAuthController } from "./customer-portal.auth.controller";
import { CustomerPortalReadController } from "./customer-portal.read.controller";
import { CustomerPortalService } from "./customer-portal.service";
import { PortalSessionGuard } from "./portal-session.guard";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerEntity,
      JobEntity,
      QuoteEntity,
      InvoiceEntity,
      TechnicianEntity,
      PortalMagicLinkEntity,
      PortalSessionEntity,
      PortalAccessEventEntity,
    ]),
  ],
  controllers: [CustomerPortalAuthController, CustomerPortalReadController],
  providers: [CustomerPortalService, PortalSessionGuard],
  exports: [CustomerPortalService, PortalSessionGuard],
})
export class CustomerPortalModule {}
