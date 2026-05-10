import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import type { RequestWithPortalSession } from "../common/request-types";
import { CustomerPortalService } from "./customer-portal.service";

@Injectable()
export class PortalSessionGuard implements CanActivate {
  constructor(private readonly customerPortalService: CustomerPortalService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPortalSession>();
    const portalSession = await this.customerPortalService.resolvePortalSessionFromRequest(request);

    if (!portalSession) {
      throw new UnauthorizedException({
        error: {
          code: "portal_unauthenticated",
          message: "Open your secure portal link to continue.",
        },
      });
    }

    request.portalSession = portalSession;
    return true;
  }
}
