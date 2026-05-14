import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { MarketingConnectedChannelEntity } from "../database/entities/marketing-connected-channel.entity";
import { MarketingContentDraftEntity } from "../database/entities/marketing-content-draft.entity";
import { MarketingContentVariantEntity } from "../database/entities/marketing-content-variant.entity";
import { MarketingOAuthStateEntity } from "../database/entities/marketing-oauth-state.entity";
import { MarketingProfileEntity } from "../database/entities/marketing-profile.entity";
import { MarketingPublishAttemptEntity } from "../database/entities/marketing-publish-attempt.entity";
import { MarketingPublishJobEntity } from "../database/entities/marketing-publish-job.entity";

import { MarketingChannelsController } from "./marketing-channels.controller";
import { MarketingChannelsService } from "./marketing-channels.service";
import { MarketingContentService } from "./marketing-content.service";
import { MarketingController } from "./marketing.controller";
import { MarketingOAuthCallbackService } from "./marketing-oauth-callback.service";
import { MarketingOAuthPublicController } from "./marketing-oauth-public.controller";
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
      MarketingOAuthStateEntity,
      MarketingPublishJobEntity,
      MarketingPublishAttemptEntity,
      MarketingContentDraftEntity,
      MarketingContentVariantEntity,
    ]),
  ],
  controllers: [
    MarketingController,
    MarketingOAuthPublicController,
    MarketingChannelsController,
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
    MarketingService,
  ],
})
export class MarketingModule {}
