import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { DocumentsPdfModule } from "../documents/pdf/documents-pdf.module";
import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { InvoiceLineItemEntity } from "../database/entities/invoice-line-item.entity";
import { InvoicePaymentEntity } from "../database/entities/invoice-payment.entity";
import { JobEntity } from "../database/entities/job.entity";
import { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import { SettingsModule } from "../settings/settings.module";
import { InvoiceCustomerFacingSnapshotService } from "./invoice-customer-facing-snapshot.service";
import { InvoicePaymentLedgerService } from "./invoice-payment-ledger.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoicePdfViewModelService } from "./invoice-pdf-view-model.service";
import { PortalNativeInvoicePdfService } from "./portal-native-invoice-pdf.service";

@Module({
  imports: [
    SettingsModule,
    DocumentsPdfModule,
    TypeOrmModule.forFeature([
      InvoiceEntity,
      InvoiceLineItemEntity,
      InvoicePaymentEntity,
      JobEntity,
      CustomerEntity,
      OrganizationSettingEntity,
    ]),
  ],
  providers: [
    InvoicePaymentLedgerService,
    InvoiceCustomerFacingSnapshotService,
    InvoicePdfViewModelService,
    InvoicePdfService,
    PortalNativeInvoicePdfService,
  ],
  exports: [PortalNativeInvoicePdfService],
})
export class CrmPortalPdfModule {}
