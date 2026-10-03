import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CrmModule } from "../crm/crm.module";
import { AuthSessionEntity } from "../database/entities/auth-session.entity";
import { MembershipEntity } from "../database/entities/membership.entity";
import { OrganizationCustomRoleEntity } from "../database/entities/organization-custom-role.entity";
import { OrganizationTeamEntitlementEntity } from "../database/entities/organization-team-entitlement.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import { TeamRbacAuditEventEntity } from "../database/entities/team-rbac-audit-event.entity";
import { UserEntity } from "../database/entities/user.entity";
import { TeamController } from "./team.controller";
import { TeamMemberEditService } from "./team-member-edit.service";
import { TeamService } from "./team.service";

@Module({
  imports: [
    forwardRef(() => AuthModule),
    CrmModule,
    TypeOrmModule.forFeature([
      MembershipEntity,
      ProfileEntity,
      UserEntity,
      OrganizationCustomRoleEntity,
      OrganizationTeamEntitlementEntity,
      TeamRbacAuditEventEntity,
      AuthSessionEntity,
    ]),
  ],
  controllers: [TeamController],
  providers: [TeamService, TeamMemberEditService],
  exports: [TeamService, TeamMemberEditService],
})
export class TeamModule {}
