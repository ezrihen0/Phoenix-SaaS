import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { BillingModule } from "../billing/billing.module";
import { AuthSessionEntity } from "../database/entities/auth-session.entity";
import { MembershipEntity } from "../database/entities/membership.entity";
import { OrganizationEntity } from "../database/entities/organization.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";
import { UserEntity } from "../database/entities/user.entity";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionGuard } from "./session.guard";

@Module({
  imports: [
    forwardRef(() => BillingModule),
    TypeOrmModule.forFeature([
      UserEntity,
      ProfileEntity,
      TechnicianEntity,
      OrganizationEntity,
      MembershipEntity,
      AuthSessionEntity,
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
