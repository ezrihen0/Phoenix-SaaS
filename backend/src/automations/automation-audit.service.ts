import { Injectable } from "@nestjs/common";

export type AutomationAuditRequirement = {
  eventLogged: boolean;
  runLogged: boolean;
  skipLogged: boolean;
  failureLogged: boolean;
  approvalLogged: boolean;
  sendLogged: boolean;
};

@Injectable()
export class AutomationAuditService {
  getAuditRequirements(): AutomationAuditRequirement {
    return {
      eventLogged: true,
      runLogged: true,
      skipLogged: true,
      failureLogged: true,
      approvalLogged: true,
      sendLogged: true,
    };
  }
}
