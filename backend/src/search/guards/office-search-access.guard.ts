import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

import { actorHasPermission } from "../../auth/permissions";
import type { RequestWithActor } from "../../common/request-types";
import { SEARCH_ERROR_CODES } from "../search.constants";

@Injectable()
export class OfficeSearchAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    if (!actorHasPermission(request.actor, "search.global")) {
      throw new ForbiddenException({
        error: {
          code: SEARCH_ERROR_CODES.forbidden,
          message: "Global search is available to office users only.",
        },
      });
    }

    return true;
  }
}
