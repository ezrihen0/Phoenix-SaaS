import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { InvoiceLineItemEntity } from "../database/entities/invoice-line-item.entity";
import { InvoicePaymentEntity } from "../database/entities/invoice-payment.entity";
import { JobNoteEntity } from "../database/entities/job-note.entity";
import { JobStatusEventEntity } from "../database/entities/job-status-event.entity";
import { JobEntity } from "../database/entities/job.entity";
import { LeadEntity } from "../database/entities/lead.entity";
import { MembershipEntity } from "../database/entities/membership.entity";
import { PricebookBundleItemEntity } from "../database/entities/pricebook-bundle-item.entity";
import { PricebookBundleEntity } from "../database/entities/pricebook-bundle.entity";
import { PricebookItemEntity } from "../database/entities/pricebook-item.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import { QuoteEntity } from "../database/entities/quote.entity";
import { QuoteLineItemEntity } from "../database/entities/quote-line-item.entity";
import { ServiceEntity } from "../database/entities/service.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";
import { LanguageStoreModule } from "../language-store/language-store.module";
import { CrmController } from "./crm.controller";
import { CrmOfficeDashboardService } from "./crm-office-dashboard.service";
import { DocumentPricingService } from "./document-pricing.service";
import { DocumentSnapshotService } from "./document-snapshot.service";
import { InvoicePaymentLedgerService } from "./invoice-payment-ledger.service";

@Module({
  imports: [
    AuthModule,
    LanguageStoreModule,
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
    ]),
  ],
  controllers: [CrmController],
  providers: [DocumentPricingService, DocumentSnapshotService, InvoicePaymentLedgerService, CrmOfficeDashboardService],
  exports: [CrmOfficeDashboardService],
})
export class CrmModule {}
