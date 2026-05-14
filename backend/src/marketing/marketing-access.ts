import type { ActorContext, RequestWithActor } from "../common/request-types";
import { apiError } from "../common/api-response";

export function isMarketingOfficeRole(role: string | null | undefined) {
  return role === "owner" || role === "admin" || role === "office_admin" || role === "dispatcher";
}

export function requireMarketingOfficeActor(request: RequestWithActor): ActorContext & {
  organization_id: string;
} {
  const actor = request.actor;

  if (!actor?.user) {
    apiError(401, "marketing_session_required", "A valid session is required to access the Growth Center.");
  }

  if (!isMarketingOfficeRole(actor.role)) {
    apiError(403, "marketing_access_forbidden", "This account cannot access the Growth Center.");
  }

  if (!actor.organization_id) {
    apiError(403, "marketing_organization_required", "An active organization is required to access the Growth Center.");
  }

  return actor as ActorContext & { organization_id: string };
}

export function assertMarketingDispatcherCannotMutate(actor: ActorContext) {
  if (actor.role === "dispatcher") {
    apiError(
      403,
      "marketing_dispatcher_forbidden",
      "Dispatcher sessions cannot modify Growth Center publishing or channel integrations.",
    );
  }
}

export function assertMarketingChannelAdmin(actor: ActorContext) {
  assertMarketingDispatcherCannotMutate(actor);

  if (actor.role !== "owner" && actor.role !== "admin") {
    apiError(
      403,
      "marketing_channel_admin_required",
      "Only organization owners or admins can manage Growth Center channel connections.",
    );
  }
}

export function assertMarketingPublisher(actor: ActorContext) {
  assertMarketingDispatcherCannotMutate(actor);

  if (actor.role !== "owner" && actor.role !== "admin" && actor.role !== "office_admin") {
    apiError(
      403,
      "marketing_publish_forbidden",
      "Only owners, admins, or office admins can enqueue Growth Center publishing jobs.",
    );
  }
}
