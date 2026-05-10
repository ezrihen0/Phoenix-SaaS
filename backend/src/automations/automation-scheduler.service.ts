import { Injectable } from "@nestjs/common";

export type AutomationSchedulerCapabilities = {
  immediateRuns: boolean;
  delayedRuns: boolean;
  anchorBasedRuns: boolean;
  anchorRecalculationRequired: boolean;
  timezoneAware: boolean;
};

export type AutomationScheduledRunDraft = {
  ruleId: string;
  triggerEntityType: string;
  triggerEntityId: string;
  anchorField: string;
  scheduledFor: string;
  timezone: string;
};

@Injectable()
export class AutomationSchedulerService {
  getCapabilities(): AutomationSchedulerCapabilities {
    return {
      immediateRuns: true,
      delayedRuns: true,
      anchorBasedRuns: true,
      anchorRecalculationRequired: true,
      timezoneAware: true,
    };
  }

  createScheduledRunDraft(input: AutomationScheduledRunDraft): AutomationScheduledRunDraft {
    return input;
  }
}
