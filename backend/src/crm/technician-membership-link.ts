import type { EntityManager } from "typeorm";

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
