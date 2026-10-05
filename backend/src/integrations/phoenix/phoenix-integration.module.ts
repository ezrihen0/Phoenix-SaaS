import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { CrmModule } from "../../crm/crm.module";
import { CustomerPortalModule } from "../../customer-portal/customer-portal.module";
import { CustomerEntity } from "../../database/entities/customer.entity";
import { JobEntity } from "../../database/entities/job.entity";
import { LeadEntity } from "../../database/entities/lead.entity";
import { PublicBookingSubmissionEntity } from "../../database/entities/public-booking-submission.entity";
import { PhoenixCustomerIntegrationController } from "./phoenix-customer-integration.controller";
import { PhoenixCustomerImportService } from "./phoenix-customer-import.service";
import { PhoenixIntegrationAuthService } from "./phoenix-integration-auth.service";
import { PhoenixPortalIntegrationController } from "./phoenix-portal-integration.controller";
import { PhoenixPortalRequestServiceController } from "./phoenix-portal-request-service.controller";
import { PhoenixRequestServiceIntegrationController } from "./phoenix-request-service-integration.controller";
import { PhoenixRequestServiceIntegrationService } from "./phoenix-request-service-integration.service";

@Module({
  imports: [
    CustomerPortalModule,
    CrmModule,
    TypeOrmModule.forFeature([CustomerEntity, JobEntity, LeadEntity, PublicBookingSubmissionEntity]),
  ],
  controllers: [
    PhoenixPortalIntegrationController,
    PhoenixCustomerIntegrationController,
    PhoenixRequestServiceIntegrationController,
    PhoenixPortalRequestServiceController,
  ],
  providers: [
    PhoenixCustomerImportService,
    PhoenixIntegrationAuthService,
    PhoenixRequestServiceIntegrationService,
  ],
})
export class PhoenixIntegrationModule {}
