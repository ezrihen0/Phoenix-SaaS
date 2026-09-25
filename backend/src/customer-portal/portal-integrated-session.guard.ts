import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import type { RequestWithPortalSession } from "../common/request-types";
import { PhoenixIntegrationAuthService } from "../integrations/phoenix/phoenix-integration-auth.service";
import { CustomerPortalService } from "./customer-portal.service";

/**
 * Native portal cookie sessions, or Phoenix server-to-server integration auth plus X-Portal-Session.
 * Header-only sessions are never accepted without integration auth.
 */
@Injectable()
export class PortalIntegratedSessionGuard implements CanActivate {
  constructor(
    private readonly customerPortalService: CustomerPortalService,
    private readonly phoenixIntegrationAuthService: PhoenixIntegrationAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPortalSession>();

    const cookieSession = await this.customerPortalService.resolvePortalSessionFromRequest(request);
    if (cookieSession) {
      request.portalSession = cookieSession;
      return true;
    }

    const headerToken = request.get("x-portal-session")?.trim();
    if (!headerToken) {
      throw new UnauthorizedException({
        error: {
          code: "portal_unauthenticated",
          message: "Open your secure portal link to continue.",
        },
      });
    }

    if (!this.phoenixIntegrationAuthService.isIntegrationRequestAuthorized(request)) {
      throw new UnauthorizedException({
        error: {
          code: "portal_session_header_denied",
          message: "Portal session header requires Phoenix integration authentication.",
        },
      });
    }

    const headerSession = await this.customerPortalService.resolvePortalSessionFromOpaqueToken(headerToken);
    if (!headerSession) {
      throw new UnauthorizedException({
        error: {
          code: "portal_unauthenticated",
          message: "Open your secure portal link to continue.",
        },
      });
    }

    request.portalSession = headerSession;
    return true;
  }
}
