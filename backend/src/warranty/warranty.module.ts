import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CustomerPortalModule } from "../customer-portal/customer-portal.module";
import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import { WarrantyCertificateEntity } from "../database/entities/warranty-certificate.entity";
import { DocumentsPdfModule } from "../documents/pdf/documents-pdf.module";
import { WarrantyCertificatesController } from "./warranty-certificates.controller";
import { WarrantyCertificatesPortalController } from "./warranty-certificates.portal.controller";
import { WarrantyCertificatesService } from "./warranty-certificates.service";
import { WarrantyPdfService } from "./warranty-pdf.service";

@Module({
  imports: [
    AuthModule,
    CustomerPortalModule,
    DocumentsPdfModule,
    TypeOrmModule.forFeature([
      WarrantyCertificateEntity,
      InvoiceEntity,
      JobEntity,
      CustomerEntity,
      OrganizationSettingEntity,
    ]),
  ],
  controllers: [WarrantyCertificatesController, WarrantyCertificatesPortalController],
  providers: [WarrantyCertificatesService, WarrantyPdfService],
  exports: [WarrantyCertificatesService],
})
export class WarrantyModule {}
