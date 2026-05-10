import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { InventoryItemEntity } from "../database/entities/inventory-item.entity";
import { InventoryLocationEntity } from "../database/entities/inventory-location.entity";
import { InventoryMovementEntity } from "../database/entities/inventory-movement.entity";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      InventoryItemEntity,
      InventoryLocationEntity,
      InventoryMovementEntity,
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}