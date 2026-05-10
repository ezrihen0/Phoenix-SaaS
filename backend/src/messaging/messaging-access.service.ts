import { Injectable } from "@nestjs/common";

import { actorHasPermission } from "../auth/permissions";
import { apiError } from "../common/api-response";
import type { ActorContext, RequestWithActor } from "../common/request-types";

@Injectable()
export class MessagingAccessService {
  canViewGlobalInbox(actor: ActorContext | null | undefined) {
    return actorHasPermission(actor, "messaging.view");
  }

  canViewConversation(actor: ActorContext | null | undefined) {
    return this.canViewGlobalInbox(actor);
  }

  canSendMessage(actor: ActorContext | null | undefined) {
    return actorHasPermission(actor, "messaging.send");
  }

  canMarkRead(actor: ActorContext | null | undefined) {
    return actorHasPermission(actor, "messaging.send");
  }

  requireGlobalInboxAccess(request: RequestWithActor) {
    if (!this.canViewGlobalInbox(request.actor)) {
      apiError(403, "forbidden", "Only office roles can access the messaging inbox.");
    }
  }

  requireConversationAccess(request: RequestWithActor) {
    if (!this.canViewConversation(request.actor)) {
      apiError(403, "forbidden", "Only office roles can access TXT messaging conversations.");
    }
  }

  requireSendAccess(request: RequestWithActor) {
    if (!this.canSendMessage(request.actor)) {
      apiError(403, "forbidden", "Only office roles can send TXT messages.");
    }
  }

  requireMarkReadAccess(request: RequestWithActor) {
    if (!this.canMarkRead(request.actor)) {
      apiError(403, "forbidden", "Only office roles can update TXT message read state.");
    }
  }

}