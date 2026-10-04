import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

import type { RequestWithActor } from "../common/request-types";
import { PhoenixFieldReportAccessService } from "./phoenix-field-report-access.service";

@Injectable()
export class PhoenixFieldReportAccessGuard implements CanActivate {
  constructor(private readonly accessService: PhoenixFieldReportAccessService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    if (!request.actor) {
      return false;
    }

    this.accessService.assertActorMayAccess(request.actor);
    return true;
  }
}
