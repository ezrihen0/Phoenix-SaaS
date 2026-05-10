import { Injectable } from "@nestjs/common";

export type AutomationExecutionReadiness = {
  customerFacingRequiresTemplate: boolean;
  idempotencyRequired: boolean;
  killSwitchCheckRequired: boolean;
};

@Injectable()
export class AutomationExecutorService {
  getExecutionReadiness(): AutomationExecutionReadiness {
    return {
      customerFacingRequiresTemplate: true,
      idempotencyRequired: true,
      killSwitchCheckRequired: true,
    };
  }
}
