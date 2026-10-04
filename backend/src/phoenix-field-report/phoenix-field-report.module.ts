import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CrmModule } from "../crm/crm.module";
import { DocumentsPdfModule } from "../documents/pdf/documents-pdf.module";
import { EmailModule } from "../email/email.module";
import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { OrganizationEntity } from "../database/entities/organization.entity";
import { PhoenixFieldHistoricalReportBatchEntity } from "../database/entities/phoenix-field-historical-report-batch.entity";
import { PhoenixFieldHistoricalReportEntryEntity } from "../database/entities/phoenix-field-historical-report-entry.entity";
import { PhoenixFieldHistoricalReportOrgLockEntity } from "../database/entities/phoenix-field-historical-report-org-lock.entity";
import { PhoenixFieldReportAccessGuard } from "./phoenix-field-report-access.guard";
import { PhoenixFieldReportAccessService } from "./phoenix-field-report-access.service";
import { PhoenixFieldReportController } from "./phoenix-field-report.controller";
import { PhoenixFieldReportCustomerMatchService } from "./phoenix-field-report-customer-match";
import { PhoenixFieldReportDraftService } from "./phoenix-field-report-draft.service";
import { PhoenixFieldReportEmailService } from "./phoenix-field-report-email.service";
import { PhoenixFieldReportImportService } from "./phoenix-field-report-import.service";
import { PhoenixFieldReportPdfService } from "./phoenix-field-report-pdf.service";
import { PhoenixFieldReportPreviewService } from "./phoenix-field-report-preview.service";
import { PhoenixFieldReportFinancialsService } from "./phoenix-field-report-financials.service";
import { PhoenixFieldReportService } from "./phoenix-field-report.service";

@Module({
  imports: [
    AuthModule,
    CrmModule,
    EmailModule,
    DocumentsPdfModule,
    TypeOrmModule.forFeature([
      OrganizationEntity,
      CustomerEntity,
      JobEntity,
      InvoiceEntity,
      PhoenixFieldHistoricalReportBatchEntity,
      PhoenixFieldHistoricalReportEntryEntity,
      PhoenixFieldHistoricalReportOrgLockEntity,
    ]),
  ],
  controllers: [PhoenixFieldReportController],
  providers: [
    PhoenixFieldReportAccessService,
    PhoenixFieldReportAccessGuard,
    PhoenixFieldReportDraftService,
    PhoenixFieldReportPreviewService,
    PhoenixFieldReportFinancialsService,
    PhoenixFieldReportCustomerMatchService,
    PhoenixFieldReportImportService,
    PhoenixFieldReportPdfService,
    PhoenixFieldReportEmailService,
    PhoenixFieldReportService,
  ],
})
export class PhoenixFieldReportModule {}
