import { Module } from "@nestjs/common";

import { CustomerPortalModule } from "../../customer-portal/customer-portal.module";
import { PhoenixPortalIntegrationController } from "./phoenix-portal-integration.controller";

@Module({
  imports: [CustomerPortalModule],
  controllers: [PhoenixPortalIntegrationController],
})
export class PhoenixIntegrationModule {}
