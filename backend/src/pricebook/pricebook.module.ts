import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { PricebookBundleItemEntity } from "../database/entities/pricebook-bundle-item.entity";
import { PricebookBundleRequirementEntity } from "../database/entities/pricebook-bundle-requirement.entity";
import { PricebookBundleEntity } from "../database/entities/pricebook-bundle.entity";
import { PricebookCategoryEntity } from "../database/entities/pricebook-category.entity";
import { PricebookItemEntity } from "../database/entities/pricebook-item.entity";
import { PricebookSystemEntity } from "../database/entities/pricebook-system.entity";
import { PricebookController } from "./pricebook.controller";
import { PricebookService } from "./pricebook.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      PricebookItemEntity,
      PricebookCategoryEntity,
      PricebookSystemEntity,
      PricebookBundleEntity,
      PricebookBundleItemEntity,
      PricebookBundleRequirementEntity,
    ]),
  ],
  controllers: [PricebookController],
  providers: [PricebookService],
})
export class PricebookModule {}