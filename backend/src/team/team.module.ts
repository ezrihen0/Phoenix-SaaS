import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { MembershipEntity } from "../database/entities/membership.entity";
import { OrganizationCustomRoleEntity } from "../database/entities/organization-custom-role.entity";
import { OrganizationTeamEntitlementEntity } from "../database/entities/organization-team-entitlement.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import { TeamRbacAuditEventEntity } from "../database/entities/team-rbac-audit-event.entity";
import { UserEntity } from "../database/entities/user.entity";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      MembershipEntity,
      ProfileEntity,
      UserEntity,
      OrganizationCustomRoleEntity,
      OrganizationTeamEntitlementEntity,
      TeamRbacAuditEventEntity,
    ]),
  ],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
