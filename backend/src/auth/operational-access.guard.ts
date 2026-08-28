import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import type { RequestWithActor } from "../common/request-types";
import { AuthService } from "./auth.service";

@Injectable()
export class OperationalAccessGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const organizationId = request.actor?.organization_id?.trim();

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
