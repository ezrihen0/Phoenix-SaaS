import { Injectable } from "@nestjs/common";

import { CrmOfficeDashboardService } from "../crm/crm-office-dashboard.service";
import { AI_PHASE0_TOOL_OFFICE_DASHBOARD } from "./ai.constants";

@Injectable()
export class AiToolRegistryService {
  constructor(private readonly crmOfficeDashboardService: CrmOfficeDashboardService) {}

  resolveRegisteredTool(toolIdNormalized: string) {
    if (toolIdNormalized === AI_PHASE0_TOOL_OFFICE_DASHBOARD) {
      return AI_PHASE0_TOOL_OFFICE_DASHBOARD;
    }
    return null;
  }

  async executeRegisteredTool(toolId: string, organizationId: string) {
    if (toolId === AI_PHASE0_TOOL_OFFICE_DASHBOARD) {
      return this.crmOfficeDashboardService.loadOfficeDashboardSnapshot(organizationId);
    }

    throw new Error(`Unregistered AI tool routed to executor: ${toolId}`);
  }
}
