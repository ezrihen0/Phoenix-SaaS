import { In, type EntityManager } from "typeorm";

import { MembershipEntity } from "../database/entities/membership.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";

export async function ensureTechnicianForOrganizationMembership(
  manager: EntityManager,
  input: {
    organizationId: string;
    userId: string;
    displayName: string;
    phone: string | null;
  },
) {
  const techniciansRepository = manager.getRepository(TechnicianEntity);
  const existing = await techniciansRepository.findOne({
    where: {
      organization_id: input.organizationId,
      auth_user_id: input.userId,
    },
  });

  const displayName = input.displayName.trim() || "Technician";

  if (existing) {
    existing.is_active = true;
    existing.display_name = displayName;
    if (input.phone !== undefined) {
      existing.phone = input.phone;
    }
    return techniciansRepository.save(existing);
  }

  return techniciansRepository.save(
    techniciansRepository.create({
      organization_id: input.organizationId,
      auth_user_id: input.userId,
      display_name: displayName,
      phone: input.phone,
      specialties: [],
      is_active: true,
      last_seen_at: null,
    }),
  );
}

export async function deactivateTechnicianForOrganizationMembership(
  manager: EntityManager,
  input: {
    organizationId: string;
    userId: string;
  },
) {
  const techniciansRepository = manager.getRepository(TechnicianEntity);
  const existing = await techniciansRepository.findOne({
    where: {
      organization_id: input.organizationId,
      auth_user_id: input.userId,
    },
  });

  if (!existing || !existing.is_active) {
    return existing;
  }

  existing.is_active = false;
  return techniciansRepository.save(existing);
}

/** Ensures roster rows exist for active members with the given system roles (e.g. technician). */
export async function ensureTechnicianRosterForSystemRoleMemberships(
  manager: EntityManager,
  input: {
    organizationId: string;
    systemRoles: readonly string[];
  },
) {
  if (input.systemRoles.length === 0) {
    return;
  }

  const membershipsRepository = manager.getRepository(MembershipEntity);
  const profilesRepository = manager.getRepository(ProfileEntity);

  const memberships = await membershipsRepository.find({
    where: {
      organization_id: input.organizationId,
      status: "active",
      role: In([...input.systemRoles]),
    },
    relations: {
      user: true,
    },
  });

  const activeMemberships = memberships.filter((membership) => membership.user?.is_active === true);
  if (activeMemberships.length === 0) {
    return;
  }

  const userIds = Array.from(new Set(activeMemberships.map((membership) => membership.user_id)));
  const profiles = await profilesRepository.find({
    where: {
      auth_user_id: In(userIds),
    },
  });
  const profileByUserId = new Map(profiles.map((profile) => [profile.auth_user_id, profile] as const));

  for (const membership of activeMemberships) {
    const profile = profileByUserId.get(membership.user_id);
    const displayName =
      profile?.full_name?.trim() || membership.user?.email?.trim() || "Technician";

    await ensureTechnicianForOrganizationMembership(manager, {
      organizationId: input.organizationId,
      userId: membership.user_id,
      displayName,
      phone: profile?.phone ?? null,
    });
  }
}
