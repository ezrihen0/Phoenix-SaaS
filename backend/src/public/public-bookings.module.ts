import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { LeadEntity } from "../database/entities/lead.entity";
import { OrganizationEntity } from "../database/entities/organization.entity";
import { PublicBookingsController } from "./public-bookings.controller";
import { PublicBookingsService } from "./public-bookings.service";

@Module({
  imports: [TypeOrmModule.forFeature([LeadEntity, OrganizationEntity])],
  controllers: [PublicBookingsController],
  providers: [PublicBookingsService],
})
export class PublicBookingsModule {}
