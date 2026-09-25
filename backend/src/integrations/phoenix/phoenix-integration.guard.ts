import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { PhoenixIntegrationAuthService } from "./phoenix-integration-auth.service";

@Injectable()
export class PhoenixIntegrationGuard implements CanActivate {
  constructor(private readonly phoenixIntegrationAuthService: PhoenixIntegrationAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!this.phoenixIntegrationAuthService.isIntegrationRequestAuthorized(request)) {
      throw new UnauthorizedException({
        error: {
          code: "phoenix_integration_unauthorized",
          message: "Phoenix integration credentials are invalid or missing.",
        },
      });
    }
    return true;
  }
}
