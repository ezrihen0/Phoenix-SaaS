import { Injectable } from "@nestjs/common";

import type { AutomationEventContract } from "./automation-event-contract";

export type AutomationEvaluationResult = {
  accepted: boolean;
  reason: string;
};

@Injectable()
export class AutomationEvaluatorService {
  evaluateEventShape(event: AutomationEventContract): AutomationEvaluationResult {
    if (!event.organizationId || !event.event || !event.entityType || !event.entityId) {
      return {
        accepted: false,
        reason: "Automation event is missing required routing fields.",
      };
    }

    return {
      accepted: true,
      reason: "Automation event shape is valid for registry evaluation.",
    };
  }
}
