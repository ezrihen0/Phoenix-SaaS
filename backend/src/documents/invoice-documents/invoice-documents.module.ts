import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { CustomerPortalModule } from "../../customer-portal/customer-portal.module";
import { InvoiceDocumentEntity } from "../../database/entities/invoice-document.entity";
import { InvoiceEntity } from "../../database/entities/invoice.entity";
import { JobEntity } from "../../database/entities/job.entity";
import { InvoiceDocumentsPortalController } from "./invoice-documents.portal.controller";
import { InvoiceDocumentsService } from "./invoice-documents.service";
import { InvoiceNativeDocumentService } from "./invoice-native-document.service";

@Module({
  imports: [
    CustomerPortalModule,
    TypeOrmModule.forFeature([
      InvoiceDocumentEntity,
      InvoiceEntity,
      JobEntity,
    ]),
  ],
  controllers: [InvoiceDocumentsPortalController],
  providers: [InvoiceDocumentsService, InvoiceNativeDocumentService],
  exports: [InvoiceDocumentsService, InvoiceNativeDocumentService],
})
export class InvoiceDocumentsModule {}
