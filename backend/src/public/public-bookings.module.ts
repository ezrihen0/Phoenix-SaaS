import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { CustomerEntity } from "../database/entities/customer.entity";
import { LeadEntity } from "../database/entities/lead.entity";
import { OrganizationEntity } from "../database/entities/organization.entity";
import { PublicBookingSubmissionEntity } from "../database/entities/public-booking-submission.entity";
import { PublicBookingsController } from "./public-bookings.controller";
import { PublicBookingsService } from "./public-bookings.service";

@Module({
  imports: [TypeOrmModule.forFeature([
    CustomerEntity,
    LeadEntity,
    OrganizationEntity,
    PublicBookingSubmissionEntity,
  ])],
  controllers: [PublicBookingsController],
  providers: [PublicBookingsService],
})
export class PublicBookingsModule {}
