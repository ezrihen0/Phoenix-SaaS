import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import type { ProfileEntity } from "../database/entities/profile.entity";
import { profileRoles, type ProfileRole } from "../crm/constants";

export type RoleModeRole = ProfileRole;

export const roleModePermissions = [
  "system.roles.manage",
  "organizations.manage",
  "dashboard.office.view",
  "search.global",
  "calls.view",
  "calls.dial",
  "calls.callbacks.manage",
  "calls.settings.manage",
  "messaging.view",
  "messaging.send",
  "jobs.view",
  "jobs.create",
  "jobs.update",
  "jobs.status.update",
  "jobs.notes.create",
  "jobs.assigned.view",
  "jobs.assigned.status.update",
  "customers.view",
  "customers.manage",
  "leads.view",
  "leads.manage",
  "estimates.view",
  "estimates.manage",
  "estimates.assigned.view",
  "invoices.view",
  "invoices.manage",
  "invoices.payment.manage",
  "invoices.assigned.view",
  "pricebook.view",
  "pricebook.manage",
  "inventory.view",
  "inventory.manage",
  "inventory.assigned.view",
  "settings.view",
  "settings.manage",
  "automations.view",
  "automations.manage",
  "automations.approve",
  "automations.settings.manage",
  "inspections.admin",
  "billing.manage",
] as const;

export type RoleModePermission = (typeof roleModePermissions)[number];

export type ActorWithProfile = ActorContext & { profile: ProfileEntity };

const roleSet = new Set<string>(profileRoles);

const allPermissions = new Set<RoleModePermission>(roleModePermissions);

const ownerPermissions = allPermissions;

const adminPermissions = withoutPermissions(allPermissions, [
  "system.roles.manage",
  "organizations.manage",
  "billing.manage",
]);

const officeAdminPermissions = withoutPermissions(allPermissions, [
  "system.roles.manage",
  "organizations.manage",
  "jobs.assigned.view",
  "jobs.assigned.status.update",
  "estimates.assigned.view",
  "invoices.assigned.view",
  "inventory.assigned.view",
  "automations.manage",
  "automations.settings.manage",
  "billing.manage",
]);

const rolePermissionMap: Record<RoleModeRole, ReadonlySet<RoleModePermission>> = {
  owner: ownerPermissions,
  admin: adminPermissions,
  office_admin: officeAdminPermissions,
  dispatcher: new Set<RoleModePermission>([
    "dashboard.office.view",
    "calls.view",
    "calls.dial",
    "calls.callbacks.manage",
    "messaging.view",
    "messaging.send",
    "jobs.view",
    "jobs.create",
    "jobs.status.update",
    "jobs.notes.create",
    "customers.view",
    "leads.view",
    "leads.manage",
    "estimates.view",
    "invoices.view",
    "inventory.view",
    "automations.view",
    "automations.approve",
  ]),
  csr: new Set<RoleModePermission>([
    "calls.view",
    "calls.dial",
    "calls.callbacks.manage",
    "messaging.view",
    "messaging.send",
    "jobs.view",
    "jobs.create",
    "jobs.notes.create",
    "customers.view",
    "customers.manage",
    "leads.view",
    "leads.manage",
    "estimates.view",
    "invoices.view",
  ]),
  technician: new Set<RoleModePermission>([
    "jobs.assigned.view",
    "jobs.assigned.status.update",
    "jobs.notes.create",
    "estimates.assigned.view",
    "invoices.assigned.view",
    "inventory.assigned.view",
  ]),
  viewer: new Set<RoleModePermission>([
    "dashboard.office.view",
    "jobs.view",
    "customers.view",
    "leads.view",
    "estimates.view",
    "invoices.view",
    "pricebook.view",
    "inventory.view",
  ]),
};

function withoutPermissions(
  source: ReadonlySet<RoleModePermission>,
  excluded: RoleModePermission[],
) {
  return new Set([...source].filter((permission) => !excluded.includes(permission)));
}

export function normalizeRole(role: unknown): RoleModeRole | null {
  if (typeof role !== "string") {
    return null;
  }

  const normalized = role.trim().toLowerCase();
  return roleSet.has(normalized) ? normalized as RoleModeRole : null;
}

export function readActorRole(actor: ActorContext | null | undefined) {
  return normalizeRole(actor?.membership?.role ?? actor?.role ?? actor?.profile?.role);
}

export function roleHasPermission(
  role: unknown,
  permission: RoleModePermission,
) {
  const normalizedRole = normalizeRole(role);
  return normalizedRole ? rolePermissionMap[normalizedRole].has(permission) : false;
}

export function actorHasPermission(
  actor: ActorContext | null | undefined,
  permission: RoleModePermission,
) {
  return roleHasPermission(readActorRole(actor), permission);
}

export function listPermissionsForRole(role: unknown): RoleModePermission[] {
  const normalizedRole = normalizeRole(role);
  return normalizedRole ? [...rolePermissionMap[normalizedRole]] : [];
}

export function requireActorProfile(
  actor: ActorContext | null | undefined,
  code = "actor_profile_missing",
  message = "The authenticated user does not have a Phoenix Fireplace CRM profile yet.",
): ActorWithProfile {
  if (!actor?.profile) {
    apiError(403, code, message);
  }

  return actor as ActorWithProfile;
}

export function requirePermission(
  actor: ActorContext | null | undefined,
  permission: RoleModePermission,
  code = "forbidden",
  message = "This action is not available for the current account.",
) {
  const actorWithProfile = requireActorProfile(actor);

  if (!actorHasPermission(actorWithProfile, permission)) {
    apiError(403, code, message);
  }

  return actorWithProfile;
}

export function canAccessAssignedJob(
  actor: ActorContext | null | undefined,
  assignedTechnicianId: string | null | undefined,
) {
  const technicianId = actor?.technician?.id ?? null;
  return Boolean(technicianId && assignedTechnicianId && technicianId === assignedTechnicianId);
}

export function canAccessJobResource(
  actor: ActorContext | null | undefined,
  assignedTechnicianId: string | null | undefined,
) {
  return actorHasPermission(actor, "jobs.view") || (
    actorHasPermission(actor, "jobs.assigned.view")
    && canAccessAssignedJob(actor, assignedTechnicianId)
  );
}

export function canAccessEstimateResource(
  actor: ActorContext | null | undefined,
  assignedTechnicianId: string | null | undefined,
) {
  return actorHasPermission(actor, "estimates.view") || (
    actorHasPermission(actor, "estimates.assigned.view")
    && canAccessAssignedJob(actor, assignedTechnicianId)
  );
}

export function canAccessInvoiceResource(
  actor: ActorContext | null | undefined,
  assignedTechnicianId: string | null | undefined,
) {
  return actorHasPermission(actor, "invoices.view") || (
    actorHasPermission(actor, "invoices.assigned.view")
    && canAccessAssignedJob(actor, assignedTechnicianId)
  );
}
