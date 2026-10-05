import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { OrganizationSettingEntity } from "../database/entities/organization-setting.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([OrganizationSettingEntity, TechnicianEntity]),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
