import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";

export const platformCapabilities = [
  "organizations.create_standalone",
  "organizations.create_unlimited",
] as const;

export type PlatformCapability = (typeof platformCapabilities)[number];

const platformCapabilitySet = new Set<string>(platformCapabilities);

export function isPlatformCapability(value: unknown): value is PlatformCapability {
  return typeof value === "string" && platformCapabilitySet.has(value);
}

export function hasPlatformCapability(
  actor: Pick<ActorContext, "platform_capabilities"> | null | undefined,
  capability: PlatformCapability,
): boolean {
  return actor?.platform_capabilities?.includes(capability) ?? false;
}

export function requirePlatformCapability(
  actor: ActorContext | null | undefined,
  capability: PlatformCapability,
  code: string,
  message: string,
): ActorContext {
  if (!actor) {
    apiError(401, "unauthenticated", "Sign in to continue.");
  }

  if (!hasPlatformCapability(actor, capability)) {
    apiError(403, code, message);
  }

  return actor;
}

export function canCreateOrganization(actor: ActorContext): boolean {
  if (hasPlatformCapability(actor, "organizations.create_standalone")) {
    return actor.permissions.includes("organizations.manage")
      || actor.role === "owner";
  }

  return actor.permissions.includes("organizations.manage");
}
