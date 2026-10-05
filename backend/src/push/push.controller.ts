import { Body, Controller, Delete, Get, Put, Req, UseGuards } from "@nestjs/common";

import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { requireActorProfile } from "../auth/permissions";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { PushSubscriptionService } from "./push-subscription.service";
import { WebPushConfigService } from "./web-push-config.service";

type PushSubscriptionBody = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

function parsePushSubscriptionBody(body: unknown): {
  endpoint: string;
  p256dh: string;
  auth: string;
} {
  if (!body || typeof body !== "object") {
    apiError(400, "invalid_push_subscription", "Push subscription payload is invalid.");
  }

  const payload = body as PushSubscriptionBody;

  if (typeof payload.endpoint !== "string" || !payload.endpoint.trim()) {
    apiError(400, "invalid_push_subscription", "Push subscription endpoint is required.");
  }

  const p256dh = payload.keys?.p256dh;
  const auth = payload.keys?.auth;

  if (typeof p256dh !== "string" || !p256dh.trim()) {
    apiError(400, "invalid_push_subscription", "Push subscription p256dh key is required.");
  }

  if (typeof auth !== "string" || !auth.trim()) {
    apiError(400, "invalid_push_subscription", "Push subscription auth key is required.");
  }

  return {
    endpoint: payload.endpoint.trim(),
    p256dh: p256dh.trim(),
    auth: auth.trim(),
  };
}

function requireActiveOrganizationId(actor: ReturnType<typeof requireActorProfile>) {
  if (!actor.organization_id) {
    apiError(400, "organization_context_missing", "An active organization is required.");
  }

  return actor.organization_id;
}

@Controller("api/push")
export class PushController {
  constructor(
    private readonly webPushConfigService: WebPushConfigService,
    private readonly pushSubscriptionService: PushSubscriptionService,
  ) {}

  @Get("vapid-public-key")
  getVapidPublicKey() {
    if (!this.webPushConfigService.isEnabled()) {
      return apiSuccess({ enabled: false, publicKey: null });
    }

    return apiSuccess({
      enabled: true,
      publicKey: this.webPushConfigService.getVapidPublicKey(),
    });
  }

  @UseGuards(SessionGuard, OperationalAccessGuard)
  @Put("subscriptions")
  async upsertSubscription(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = requireActorProfile(request.actor);
    const organizationId = requireActiveOrganizationId(actor);

    if (!this.webPushConfigService.isEnabled()) {
      apiError(503, "web_push_disabled", "Push notifications are not enabled on this server.");
    }

    const parsed = parsePushSubscriptionBody(body);
    const userAgent = typeof request.headers["user-agent"] === "string"
      ? request.headers["user-agent"]
      : null;

    const subscription = await this.pushSubscriptionService.upsertSubscription({
      organizationId,
      authUserId: actor.user.id,
      endpoint: parsed.endpoint,
      p256dh: parsed.p256dh,
      auth: parsed.auth,
      userAgent,
    });

    return apiSuccess({
      id: subscription.id,
      endpoint: subscription.endpoint,
    });
  }

  @UseGuards(SessionGuard, OperationalAccessGuard)
  @Delete("subscriptions")
  async deleteSubscription(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = requireActorProfile(request.actor);
    const parsed = parsePushSubscriptionBody(body);

    await this.pushSubscriptionService.deleteByEndpoint(actor.user.id, parsed.endpoint);

    return apiSuccess({ deleted: true });
  }
}
