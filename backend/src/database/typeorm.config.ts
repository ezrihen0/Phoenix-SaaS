import type { ConfigService } from "@nestjs/config";
import type { TypeOrmModuleOptions } from "@nestjs/typeorm";
import type { DataSourceOptions } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";
import { join } from "path";

import { OwnedPhoneNumberEntity } from "../messaging/phone-numbers/owned-phone-number.entity";
import { TxtConversationEntity } from "../messaging/txt/txt-conversation.entity";
import { TxtMessageEntity } from "../messaging/txt/txt-message.entity";
import { getDatabaseDefaults, resolveDatabaseType, type SupportedDatabaseType } from "./database-dialect";
import { AutomationLogEntity } from "./entities/automation-log.entity";
import { AutomationPendingActionEntity } from "./entities/automation-pending-action.entity";
import { AutomationRuleEntity } from "./entities/automation-rule.entity";
import { AutomationRunEntity } from "./entities/automation-run.entity";
import { AutomationScheduledRunEntity } from "./entities/automation-scheduled-run.entity";
import { AutomationSettingEntity } from "./entities/automation-setting.entity";
import { AutomationTemplateEntity } from "./entities/automation-template.entity";
import { BillingAccountEntity } from "./entities/billing-account.entity";
import { BillingAccountSubscriptionItemEntity } from "./entities/billing-account-subscription-item.entity";
import { AiOperatorDraftEntity } from "./entities/ai-operator-draft.entity";
import { AiRecommendationRunEntity } from "./entities/ai-recommendation-run.entity";
import { AuthSessionEntity } from "./entities/auth-session.entity";
import { ControlledAccessGrantEntity } from "./entities/controlled-access-grant.entity";
import { CustomerOutputTranslationRecordEntity } from "./entities/customer-output-translation-record.entity";
import { CrmTaskEntity } from "./entities/crm-task.entity";
import { CustomerEntity } from "./entities/customer.entity";
import { InspectionEntity } from "./entities/inspection.entity";
import { InspectionItemEntity } from "./entities/inspection-item.entity";
import { InspectionPhotoEntity } from "./entities/inspection-photo.entity";
import { InspectionRequiredFieldEntity } from "./entities/inspection-required-field.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { InvoicePaymentEntity } from "./entities/invoice-payment.entity";
import { InventoryItemEntity } from "./entities/inventory-item.entity";
import { InventoryLocationEntity } from "./entities/inventory-location.entity";
import { InventoryMovementEntity } from "./entities/inventory-movement.entity";
import { JobEntity } from "./entities/job.entity";
import { JobNoteEntity } from "./entities/job-note.entity";
import { JobStatusEventEntity } from "./entities/job-status-event.entity";
import { LeadEntity } from "./entities/lead.entity";
import { MembershipEntity } from "./entities/membership.entity";
import { MarketingConnectedChannelEntity } from "./entities/marketing-connected-channel.entity";
import { MarketingAutomationRuleEntity } from "./entities/marketing-automation-rule.entity";
import { MarketingAutomationRunEntity } from "./entities/marketing-automation-run.entity";
import { MarketingCampaignEntity } from "./entities/marketing-campaign.entity";
import { MarketingCampaignItemEntity } from "./entities/marketing-campaign-item.entity";
import { MarketingContentDraftEntity } from "./entities/marketing-content-draft.entity";
import { MarketingOAuthStateEntity } from "./entities/marketing-oauth-state.entity";
import { MarketingPublishAttemptEntity } from "./entities/marketing-publish-attempt.entity";
import { MarketingPublishJobEntity } from "./entities/marketing-publish-job.entity";
import { MarketingContentVariantEntity } from "./entities/marketing-content-variant.entity";
import { MarketingOpportunityEntity } from "./entities/marketing-opportunity.entity";
import { MarketingProfileEntity } from "./entities/marketing-profile.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationBillingEntity } from "./entities/organization-billing.entity";
import { OrganizationEnabledLanguageEntity } from "./entities/organization-enabled-language.entity";
import { OrganizationLanguageEntitlementEntity } from "./entities/organization-language-entitlement.entity";
import { OrganizationSettingEntity } from "./entities/organization-setting.entity";
import { PortalAccessEventEntity } from "./entities/portal-access-event.entity";
import { PortalMagicLinkEntity } from "./entities/portal-magic-link.entity";
import { PortalSessionEntity } from "./entities/portal-session.entity";
import { PricebookBundleEntity } from "./entities/pricebook-bundle.entity";
import { PricebookBundleItemEntity } from "./entities/pricebook-bundle-item.entity";
import { PricebookItemEntity } from "./entities/pricebook-item.entity";
import { ProfileEntity } from "./entities/profile.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { QuoteLineItemEntity } from "./entities/quote-line-item.entity";
import { RecentCallEntity } from "./entities/recent-call.entity";
import { ServiceEntity } from "./entities/service.entity";
import { TechnicianEntity } from "./entities/technician.entity";
import { TranslationUsageLedgerEntity } from "./entities/translation-usage-ledger.entity";
import { UserEntity } from "./entities/user.entity";
import { UserOrganizationLanguagePreferenceEntity } from "./entities/user-organization-language-preference.entity";
import { VoiceFlowEntity } from "./entities/voice-flow.entity";

type ConfigLookup = Pick<ConfigService, "get">;

export const typeOrmEntities = [
  UserEntity,
  BillingAccountEntity,
  BillingAccountSubscriptionItemEntity,
  CustomerOutputTranslationRecordEntity,
  ProfileEntity,
  TechnicianEntity,
  TranslationUsageLedgerEntity,
  ServiceEntity,
  CustomerEntity,
  LeadEntity,
  MarketingProfileEntity,
  MarketingConnectedChannelEntity,
  MarketingCampaignEntity,
  MarketingCampaignItemEntity,
  MarketingAutomationRuleEntity,
  MarketingAutomationRunEntity,
  MarketingOAuthStateEntity,
  MarketingPublishJobEntity,
  MarketingPublishAttemptEntity,
  MarketingContentDraftEntity,
  MarketingContentVariantEntity,
  MarketingOpportunityEntity,
  OrganizationEntity,
  OrganizationBillingEntity,
  OrganizationEnabledLanguageEntity,
  OrganizationLanguageEntitlementEntity,
  MembershipEntity,
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
  ControlledAccessGrantEntity,
  AiRecommendationRunEntity,
  AiOperatorDraftEntity,
  InspectionEntity,
  InspectionPhotoEntity,
  InspectionItemEntity,
  InspectionRequiredFieldEntity,
  PortalMagicLinkEntity,
  PortalSessionEntity,
  PortalAccessEventEntity,
  OrganizationSettingEntity,
  UserOrganizationLanguagePreferenceEntity,
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
  OwnedPhoneNumberEntity,
  VoiceFlowEntity,
  TxtConversationEntity,
  TxtMessageEntity,
];

function readBooleanFlag(value: string | undefined, fallback: boolean) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function buildBaseTypeOrmOptions(readEnv: (key: string) => string | undefined): DataSourceOptions {
  const databaseType: SupportedDatabaseType = resolveDatabaseType(readEnv("DB_TYPE"));
  const defaults = getDatabaseDefaults(databaseType);

  const baseOptions = {
    host: readEnv("DB_HOST") ?? "127.0.0.1",
    port: Number(readEnv("DB_PORT") ?? defaults.port),
    username: readEnv("DB_USERNAME") ?? defaults.username,
    password: readEnv("DB_PASSWORD") ?? defaults.password,
    database: readEnv("DB_NAME") ?? "wizfield",
    entities: typeOrmEntities,
    migrations: [
      join(__dirname, "migrations", "active", "*.ts"),
      join(__dirname, "migrations", "active", "*.js"),
    ],
    migrationsTableName: "typeorm_migrations",
    synchronize: readBooleanFlag(readEnv("DB_SYNCHRONIZE"), false),
    migrationsRun: readBooleanFlag(readEnv("DB_MIGRATIONS_RUN"), false),
    logging: readBooleanFlag(readEnv("DB_LOGGING"), false),
  };

  if (databaseType === "postgres") {
    return {
      type: "postgres",
      ...baseOptions,
    } satisfies PostgresConnectionOptions;
  }

  return {
    type: "mysql",
    ...baseOptions,
  } satisfies MysqlConnectionOptions;
}

export function buildTypeOrmModuleOptions(configService: ConfigLookup): TypeOrmModuleOptions {
  return buildBaseTypeOrmOptions((key) => configService.get<string>(key)) as TypeOrmModuleOptions;
}

export function buildDataSourceOptions(): DataSourceOptions {
  return buildBaseTypeOrmOptions((key) => process.env[key]);
}
