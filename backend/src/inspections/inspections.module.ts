import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CustomerEntity } from "../database/entities/customer.entity";
import { InspectionItemEntity } from "../database/entities/inspection-item.entity";
import { InspectionPhotoEntity } from "../database/entities/inspection-photo.entity";
import { InspectionRequiredFieldEntity } from "../database/entities/inspection-required-field.entity";
import { InspectionEntity } from "../database/entities/inspection.entity";
import { JobEntity } from "../database/entities/job.entity";
import { InspectionsAdminController } from "./inspections.admin.controller";
import { InspectionsAdminService } from "./inspections.admin.service";
import { InspectionWorkflowService } from "./inspection-workflow.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      InspectionEntity,
      InspectionItemEntity,
      InspectionRequiredFieldEntity,
      InspectionPhotoEntity,
      CustomerEntity,
      JobEntity,
    ]),
  ],
  controllers: [InspectionsAdminController],
  providers: [InspectionWorkflowService, InspectionsAdminService],
  exports: [InspectionWorkflowService, InspectionsAdminService],
})
export class InspectionsModule {}
