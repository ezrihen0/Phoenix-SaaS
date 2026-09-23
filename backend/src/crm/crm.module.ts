import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CustomerEntity } from "../database/entities/customer.entity";
import { CustomerPortalModule } from "../customer-portal/customer-portal.module";
import { DocumentsPdfModule } from "../documents/pdf/documents-pdf.module";
import { InvoiceDocumentsModule } from "../documents/invoice-documents/invoice-documents.module";
import { EmailModule } from "../email/email.module";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { InvoiceLineItemEntity } from "../database/entities/invoice-line-item.entity";
import { InvoicePaymentEntity } from "../database/entities/invoice-payment.entity";
import { JobNoteEntity } from "../database/entities/job-note.entity";
import { JobStatusEventEntity } from "../database/entities/job-status-event.entity";
import { JobEntity } from "../database/entities/job.entity";
import { LeadEntity } from "../database/entities/lead.entity";
import { MembershipEntity } from "../database/entities/membership.entity";
import { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import { OrganizationInvoiceSequenceEntity } from "../database/entities/organization-invoice-sequence.entity";
import { PricebookBundleItemEntity } from "../database/entities/pricebook-bundle-item.entity";
import { PricebookBundleEntity } from "../database/entities/pricebook-bundle.entity";
import { PricebookItemEntity } from "../database/entities/pricebook-item.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import { QuoteEntity } from "../database/entities/quote.entity";
import { QuoteLineItemEntity } from "../database/entities/quote-line-item.entity";
import { ServiceEntity } from "../database/entities/service.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";
import { LanguageStoreModule } from "../language-store/language-store.module";
import { MessagingModule } from "../messaging/messaging.module";
import { CrmController } from "./crm.controller";
import { CrmOfficeDashboardService } from "./crm-office-dashboard.service";
import { CustomerLedgerService } from "./customer-ledger.service";
import { CustomerDeletionService } from "./customer-deletion.service";
import { JobsService } from "./jobs.service";
import { DocumentPricingService } from "./document-pricing.service";
import { MoneyEngineService } from "./money-engine.service";
import { EstimateInvoiceConversionService } from "./estimate-invoice-conversion.service";
import { DocumentSnapshotService } from "./document-snapshot.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoicePaymentLedgerService } from "./invoice-payment-ledger.service";
import { InvoicePaymentRecordingService } from "./invoice-payment-recording.service";
import { InvoiceCustomerFacingSnapshotService } from "./invoice-customer-facing-snapshot.service";
import { InvoiceNumberingService } from "./invoice-numbering.service";
import { InvoiceSendPipelineService } from "./invoice-send-pipeline.service";
import { InvoicePdfViewModelService } from "./invoice-pdf-view-model.service";
import { FinanceInvoicePresentationService } from "./finance-invoice-presentation.service";
import { FinanceAuditService } from "./finance-audit.service";
import { FinanceAuditEventEntity } from "../database/entities/finance-audit-event.entity";

@Module({
  imports: [
    AuthModule,
    LanguageStoreModule,
    EmailModule,
    MessagingModule,
    CustomerPortalModule,
    DocumentsPdfModule,
    InvoiceDocumentsModule,
    TypeOrmModule.forFeature([
      ProfileEntity,
      TechnicianEntity,
      ServiceEntity,
      CustomerEntity,
      LeadEntity,
      MembershipEntity,
      JobEntity,
      QuoteEntity,
      InvoiceEntity,
      InvoiceLineItemEntity,
      InvoicePaymentEntity,
      QuoteLineItemEntity,
      JobNoteEntity,
      JobStatusEventEntity,
      PricebookItemEntity,
      PricebookBundleEntity,
      PricebookBundleItemEntity,
      OrganizationSettingEntity,
      OrganizationInvoiceSequenceEntity,
      FinanceAuditEventEntity,
    ]),
  ],
  controllers: [CrmController],
  providers: [
    MoneyEngineService,
    DocumentPricingService,
    DocumentSnapshotService,
    EstimateInvoiceConversionService,
    InvoicePaymentLedgerService,
    InvoicePaymentRecordingService,
    InvoiceCustomerFacingSnapshotService,
    InvoiceNumberingService,
    InvoiceSendPipelineService,
    InvoicePdfViewModelService,
    FinanceInvoicePresentationService,
    FinanceAuditService,
    CrmOfficeDashboardService,
    CustomerLedgerService,
    CustomerDeletionService,
    InvoicePdfService,
    JobsService,
  ],
  exports: [
    CrmOfficeDashboardService,
    CustomerLedgerService,
    JobsService,
    FinanceInvoicePresentationService,
    InvoicePaymentLedgerService,
    FinanceAuditService,
  ],
})
export class CrmModule {}
