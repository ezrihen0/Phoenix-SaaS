import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import type { RequestWithActor } from "../common/request-types";
import { AuthService } from "./auth.service";
import { requiresOperationalAccess } from "./operational-access.policy";

@Injectable()
export class GlobalOperationalAccessGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const path = request.path ?? request.url ?? "";

    if (!requiresOperationalAccess(path)) {
      return true;
    }

    const actor = request.actor ?? (await this.authService.resolveActorFromRequest(request));
    if (!actor) {
      return true;
    }

    request.actor = actor;

    const organizationId = actor.organization_id?.trim();
    if (!organizationId) {
      throw new ForbiddenException({
        error: {
          code: "organization_context_missing",
          message: "An active organization is required.",
        },
      });
    }

    const eligible = await this.authService.isOrganizationOperationallyEligible(organizationId);
    if (!eligible) {
      throw new ForbiddenException({
        error: {
          code: "operational_access_ineligible",
          message: "Activate your workspace to access operational features.",
        },
      });
    }

    return true;
  }
}
