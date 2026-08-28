import { EntityManager, In } from "typeorm";

import { apiError } from "../common/api-response";
import { MembershipEntity } from "../database/entities/membership.entity";
import { OrganizationTeamEntitlementEntity } from "../database/entities/organization-team-entitlement.entity";
import { DEFAULT_MAX_USERS, resolveMaxUsers } from "./team-entitlements";

const seatOccupyingStatuses = ["active", "invited"] as const;

export async function assertOrganizationSeatAvailable(
  organizationId: string,
  manager: EntityManager,
) {
  await manager.query(
    "SELECT organization_id FROM organization_team_entitlements WHERE organization_id = ? FOR UPDATE",
    [organizationId],
  );

  const entitlementsRepository = manager.getRepository(OrganizationTeamEntitlementEntity);
  const entitlement = await entitlementsRepository.findOne({
    where: { organization_id: organizationId },
  }) ?? await entitlementsRepository.save(
    entitlementsRepository.create({
      organization_id: organizationId,
      max_users: DEFAULT_MAX_USERS,
    }),
  );

  const activeCount = await manager.getRepository(MembershipEntity).count({
    where: {
      organization_id: organizationId,
      status: In([...seatOccupyingStatuses]),
    },
  });

  const maxUsers = resolveMaxUsers(entitlement);
  if (activeCount >= maxUsers) {
    apiError(
      403,
      "team_user_limit_reached",
      `Your organization has reached its ${maxUsers}-user limit.`,
    );
  }
}
