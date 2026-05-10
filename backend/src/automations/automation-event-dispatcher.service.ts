import { Injectable } from "@nestjs/common";

import type { AutomationEventContract } from "./automation-event-contract";
import { AutomationEvaluatorService } from "./automation-evaluator.service";

export type AutomationDispatchResult = {
  accepted: boolean;
  event: AutomationEventContract;
  reason: string;
};

@Injectable()
export class AutomationEventDispatcherService {
  constructor(private readonly evaluatorService: AutomationEvaluatorService) {}

  dispatchTrustedEvent(event: AutomationEventContract): AutomationDispatchResult {
    const evaluation = this.evaluatorService.evaluateEventShape(event);

    return {
      accepted: evaluation.accepted,
      event,
      reason: evaluation.reason,
    };
  }
}
