import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import type { RequestWithActor } from "../common/request-types";
import { AuthService } from "./auth.service";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const actor = await this.authService.resolveActorFromRequest(request);

    if (!actor) {
      throw new UnauthorizedException({
        error: {
          code: "unauthenticated",
          message: "Sign in to continue.",
        },
      });
    }

    request.actor = actor;
    return true;
  }
}
