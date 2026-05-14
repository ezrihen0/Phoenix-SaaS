import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { JobEntity } from "../database/entities/job.entity";
import { MarketingAutomationRuleEntity } from "../database/entities/marketing-automation-rule.entity";
import { MarketingAutomationRunEntity } from "../database/entities/marketing-automation-run.entity";
import { MarketingCampaignEntity } from "../database/entities/marketing-campaign.entity";
import { MarketingCampaignItemEntity } from "../database/entities/marketing-campaign-item.entity";
import { MarketingConnectedChannelEntity } from "../database/entities/marketing-connected-channel.entity";
import { MarketingContentDraftEntity } from "../database/entities/marketing-content-draft.entity";
import { MarketingContentVariantEntity } from "../database/entities/marketing-content-variant.entity";
import { MarketingOAuthStateEntity } from "../database/entities/marketing-oauth-state.entity";
import { MarketingOpportunityEntity } from "../database/entities/marketing-opportunity.entity";
import { MarketingProfileEntity } from "../database/entities/marketing-profile.entity";
import { MarketingPublishAttemptEntity } from "../database/entities/marketing-publish-attempt.entity";
import { MarketingPublishJobEntity } from "../database/entities/marketing-publish-job.entity";
import { InspectionEntity } from "../database/entities/inspection.entity";

import { MarketingAnalyticsController } from "./marketing-analytics.controller";
import { MarketingAnalyticsService } from "./marketing-analytics.service";
import { MarketingAutomationController } from "./marketing-automation.controller";
import { MarketingAutomationEvaluationService } from "./marketing-automation-evaluation.service";
import { MarketingAutomationService } from "./marketing-automation.service";
import { MarketingCampaignController } from "./marketing-campaign.controller";
import { MarketingCampaignService } from "./marketing-campaign.service";
import { MarketingChannelsController } from "./marketing-channels.controller";
import { MarketingChannelsService } from "./marketing-channels.service";
import { MarketingContentService } from "./marketing-content.service";
import { MarketingController } from "./marketing.controller";
import { MarketingOAuthCallbackService } from "./marketing-oauth-callback.service";
import { MarketingOAuthPublicController } from "./marketing-oauth-public.controller";
import { MarketingOpportunityDetectionService } from "./marketing-opportunity-detection.service";
import { MarketingOpportunityService } from "./marketing-opportunity.service";
import { MarketingProfileService } from "./marketing-profile.service";
import { MarketingPublishController } from "./marketing-publish.controller";
import { MarketingPublishDispatcherService } from "./marketing-publish-dispatcher.service";
import { MarketingPublishExecutorService } from "./marketing-publish-executor.service";
import { MarketingPublishService } from "./marketing-publish.service";
import { MarketingSecretsCryptoService } from "./marketing-secrets-crypto.service";
import { MarketingService } from "./marketing.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      MarketingProfileEntity,
      MarketingConnectedChannelEntity,
      MarketingCampaignEntity,
      MarketingCampaignItemEntity,
      MarketingOAuthStateEntity,
      MarketingPublishJobEntity,
      MarketingPublishAttemptEntity,
      MarketingContentDraftEntity,
      MarketingContentVariantEntity,
      MarketingOpportunityEntity,
      MarketingAutomationRuleEntity,
      MarketingAutomationRunEntity,
      JobEntity,
      InspectionEntity,
    ]),
  ],
  controllers: [
    MarketingController,
    MarketingOAuthPublicController,
    MarketingChannelsController,
    MarketingCampaignController,
    MarketingAutomationController,
    MarketingAnalyticsController,
    MarketingPublishController,
  ],
  providers: [
    MarketingSecretsCryptoService,
    MarketingChannelsService,
    MarketingOAuthCallbackService,
    MarketingPublishExecutorService,
    MarketingPublishDispatcherService,
    MarketingPublishService,
    MarketingProfileService,
    MarketingContentService,
    MarketingOpportunityDetectionService,
    MarketingAutomationEvaluationService,
    MarketingAutomationService,
    MarketingAnalyticsService,
    MarketingOpportunityService,
    MarketingCampaignService,
    MarketingService,
  ],
})
export class MarketingModule {}
