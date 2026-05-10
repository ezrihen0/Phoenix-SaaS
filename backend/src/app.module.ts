import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AutomationsModule } from "./automations/automations.module";
import { AuthModule } from "./auth/auth.module";
import { AuthService } from "./auth/auth.service";
import { getDatabaseDefaults, resolveDatabaseType } from "./database/database-dialect";
import { AutomationLogEntity } from "./database/entities/automation-log.entity";
import { AutomationPendingActionEntity } from "./database/entities/automation-pending-action.entity";
import { AutomationRuleEntity } from "./database/entities/automation-rule.entity";
import { AutomationRunEntity } from "./database/entities/automation-run.entity";
import { AutomationScheduledRunEntity } from "./database/entities/automation-scheduled-run.entity";
import { AutomationSettingEntity } from "./database/entities/automation-setting.entity";
import { AutomationTemplateEntity } from "./database/entities/automation-template.entity";
import { CrmModule } from "./crm/crm.module";
import { CrmTaskEntity } from "./database/entities/crm-task.entity";
import { CustomerPortalModule } from "./customer-portal/customer-portal.module";
import { AuthSessionEntity } from "./database/entities/auth-session.entity";
import { CustomerEntity } from "./database/entities/customer.entity";
import { InspectionEntity } from "./database/entities/inspection.entity";
import { InspectionItemEntity } from "./database/entities/inspection-item.entity";
import { InspectionPhotoEntity } from "./database/entities/inspection-photo.entity";
import { InspectionRequiredFieldEntity } from "./database/entities/inspection-required-field.entity";
import { InvoiceEntity } from "./database/entities/invoice.entity";
import { InvoiceLineItemEntity } from "./database/entities/invoice-line-item.entity";
import { InvoicePaymentEntity } from "./database/entities/invoice-payment.entity";
import { InventoryItemEntity } from "./database/entities/inventory-item.entity";
import { InventoryLocationEntity } from "./database/entities/inventory-location.entity";
import { InventoryMovementEntity } from "./database/entities/inventory-movement.entity";
import { JobNoteEntity } from "./database/entities/job-note.entity";
import { JobStatusEventEntity } from "./database/entities/job-status-event.entity";
import { JobEntity } from "./database/entities/job.entity";
import { LeadEntity } from "./database/entities/lead.entity";
import { PortalAccessEventEntity } from "./database/entities/portal-access-event.entity";
import { PortalMagicLinkEntity } from "./database/entities/portal-magic-link.entity";
import { PortalSessionEntity } from "./database/entities/portal-session.entity";
import { ProfileEntity } from "./database/entities/profile.entity";
import { OrganizationSettingEntity } from "./database/entities/organization-setting.entity";
import { PricebookBundleItemEntity } from "./database/entities/pricebook-bundle-item.entity";
import { PricebookBundleEntity } from "./database/entities/pricebook-bundle.entity";
import { PricebookItemEntity } from "./database/entities/pricebook-item.entity";
import { QuoteEntity } from "./database/entities/quote.entity";
import { QuoteLineItemEntity } from "./database/entities/quote-line-item.entity";
import { RecentCallEntity } from "./database/entities/recent-call.entity";
import { ServiceEntity } from "./database/entities/service.entity";
import { TechnicianEntity } from "./database/entities/technician.entity";
import { UserEntity } from "./database/entities/user.entity";
import { InspectionsModule } from "./inspections/inspections.module";
import { InventoryModule } from "./inventory/inventory.module";
import { MessagingModule } from "./messaging/messaging.module";
import { PricebookModule } from "./pricebook/pricebook.module";
import { PublicBookingsModule } from "./public/public-bookings.module";
import { SearchModule } from "./search/search.module";
import { SettingsModule } from "./settings/settings.module";
import { TelephonyModule } from "./telephony/telephony.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseType = resolveDatabaseType(configService.get<string>("DB_TYPE"));
        const defaults = getDatabaseDefaults(databaseType);

        return {
          type: databaseType,
          host: configService.get<string>("DB_HOST") ?? "127.0.0.1",
          port: Number(configService.get<string>("DB_PORT") ?? defaults.port),
          username: configService.get<string>("DB_USERNAME") ?? defaults.username,
          password: configService.get<string>("DB_PASSWORD") ?? defaults.password,
          database: configService.get<string>("DB_NAME") ?? "phoenix_crm",
          entities: [
            UserEntity,
            ProfileEntity,
            TechnicianEntity,
            ServiceEntity,
            CustomerEntity,
            LeadEntity,
            JobEntity,
            QuoteEntity,
            InvoiceEntity,
            InvoiceLineItemEntity,
            InvoicePaymentEntity,
            InventoryItemEntity,
            InventoryLocationEntity,
            InventoryMovementEntity,
            QuoteLineItemEntity,
            JobNoteEntity,
            JobStatusEventEntity,
            AuthSessionEntity,
            InspectionEntity,
            InspectionPhotoEntity,
            InspectionItemEntity,
            InspectionRequiredFieldEntity,
            PortalMagicLinkEntity,
            PortalSessionEntity,
            PortalAccessEventEntity,
            OrganizationSettingEntity,
            AutomationTemplateEntity,
            AutomationRuleEntity,
            AutomationRunEntity,
            AutomationLogEntity,
            AutomationPendingActionEntity,
            AutomationScheduledRunEntity,
            AutomationSettingEntity,
            CrmTaskEntity,
            RecentCallEntity,
            PricebookItemEntity,
            PricebookBundleEntity,
            PricebookBundleItemEntity,
          ],
          synchronize: true,
          logging: false,
        };
      },
    }),
    AuthModule,
    CrmModule,
    SearchModule,
    SettingsModule,
    PublicBookingsModule,
    InspectionsModule,
    CustomerPortalModule,
    MessagingModule,
    InventoryModule,
    PricebookModule,
    TelephonyModule,
    AutomationsModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly authService: AuthService) {}

  async onModuleInit() {
    await this.authService.ensureBootstrapAdmin();
  }
}
