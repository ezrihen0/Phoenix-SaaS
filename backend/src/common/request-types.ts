import type { Request } from "express";

import type { MembershipEntity } from "../database/entities/membership.entity";
import type { OrganizationEntity } from "../database/entities/organization.entity";
import type { ProfileEntity } from "../database/entities/profile.entity";
import type { PortalSessionEntity } from "../database/entities/portal-session.entity";
import type { TechnicianEntity } from "../database/entities/technician.entity";
import type { UserEntity } from "../database/entities/user.entity";
import type { PlatformCapability } from "../platform/platform-operator.policy";

export type ActorContext = {
  user: UserEntity;
  profile: ProfileEntity | null;
  technician: TechnicianEntity | null;
  memberships: MembershipEntity[];
  membership: MembershipEntity | null;
  organization: OrganizationEntity | null;
  membership_id: string | null;
  organization_id: string | null;
  role: string | null;
  permissions: string[];
  platform_capabilities: PlatformCapability[];
};

export type RequestWithActor = Request & {
  actor?: ActorContext;
};

export type PortalSessionContext = {
  customer_id: string;
  session: PortalSessionEntity;
  is_preview: boolean;
  is_read_only: boolean;
};

export type RequestWithPortalSession = Request & {
  portalSession?: PortalSessionContext;
};
