import type { EntityManager } from "typeorm";

import { TechnicianEntity } from "../database/entities/technician.entity";

export type EnsureTechnicianOptions = {
  allowCreate?: boolean;
  allowReactivate?: boolean;
};

export async function ensureTechnicianForOrganizationMembership(
  manager: EntityManager,
  input: {
    organizationId: string;
    userId: string;
    displayName: string;
    phone: string | null;
  },
  options: EnsureTechnicianOptions = {},
) {
  const allowCreate = options.allowCreate === true;
  const allowReactivate = options.allowReactivate === true;
  const techniciansRepository = manager.getRepository(TechnicianEntity);
  const existing = await techniciansRepository.findOne({
    where: {
      organization_id: input.organizationId,
      auth_user_id: input.userId,
    },
  });

  const displayName = input.displayName.trim() || "Technician";

  if (existing) {
    let shouldSave = false;

    if (existing.display_name !== displayName) {
      existing.display_name = displayName;
      shouldSave = true;
    }

    if ((existing.phone ?? null) !== input.phone) {
      existing.phone = input.phone;
      shouldSave = true;
    }

    if (allowReactivate && !existing.is_active) {
      existing.is_active = true;
      shouldSave = true;
    }

    if (shouldSave) {
      return techniciansRepository.save(existing);
    }

    return existing;
  }

  if (!allowCreate) {
    return null;
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
