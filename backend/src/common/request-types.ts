import type { Request } from "express";

import type { ProfileEntity } from "../database/entities/profile.entity";
import type { PortalSessionEntity } from "../database/entities/portal-session.entity";
import type { TechnicianEntity } from "../database/entities/technician.entity";
import type { UserEntity } from "../database/entities/user.entity";

export type ActorContext = {
  user: UserEntity;
  profile: ProfileEntity | null;
  technician: TechnicianEntity | null;
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
