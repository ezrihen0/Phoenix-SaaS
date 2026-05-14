import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { MarketingContentDraftEntity } from "../database/entities/marketing-content-draft.entity";
import { MarketingContentVariantEntity } from "../database/entities/marketing-content-variant.entity";
import { MarketingProfileEntity } from "../database/entities/marketing-profile.entity";
import { MarketingContentService } from "./marketing-content.service";
import { MarketingController } from "./marketing.controller";
import { MarketingProfileService } from "./marketing-profile.service";
import { MarketingService } from "./marketing.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      MarketingProfileEntity,
      MarketingContentDraftEntity,
      MarketingContentVariantEntity,
    ]),
  ],
  controllers: [MarketingController],
  providers: [MarketingService, MarketingProfileService, MarketingContentService],
})
export class MarketingModule {}
