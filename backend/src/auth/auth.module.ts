import { Module, forwardRef } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";

import { BillingModule } from "../billing/billing.module";
import { AuthSessionEntity } from "../database/entities/auth-session.entity";
import { ControlledAccessGrantEntity } from "../database/entities/controlled-access-grant.entity";
import { PlatformOperatorGrantEntity } from "../database/entities/platform-operator-grant.entity";
import { MembershipEntity } from "../database/entities/membership.entity";
import { OrganizationEntity } from "../database/entities/organization.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";
import { UserEntity } from "../database/entities/user.entity";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GlobalOperationalAccessGuard } from "./global-operational-access.guard";
import { OperationalAccessGuard } from "./operational-access.guard";
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
      ControlledAccessGrantEntity,
      PlatformOperatorGrantEntity,
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionGuard,
    OperationalAccessGuard,
    GlobalOperationalAccessGuard,
    {
      provide: APP_GUARD,
      useExisting: GlobalOperationalAccessGuard,
    },
  ],
  exports: [AuthService, SessionGuard, OperationalAccessGuard, GlobalOperationalAccessGuard],
})
export class AuthModule {}
