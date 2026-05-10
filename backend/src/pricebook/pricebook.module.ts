import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { PricebookBundleItemEntity } from "../database/entities/pricebook-bundle-item.entity";
import { PricebookBundleEntity } from "../database/entities/pricebook-bundle.entity";
import { PricebookItemEntity } from "../database/entities/pricebook-item.entity";
import { PricebookController } from "./pricebook.controller";
import { PricebookService } from "./pricebook.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      PricebookItemEntity,
      PricebookBundleEntity,
      PricebookBundleItemEntity,
    ]),
  ],
  controllers: [PricebookController],
  providers: [PricebookService],
})
export class PricebookModule {}