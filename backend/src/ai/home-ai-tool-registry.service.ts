import { Injectable } from "@nestjs/common";

import type { ActorContext } from "../common/request-types";
import type { RoleModePermission } from "../auth/permissions";
import {
  HOME_AI_DEFAULT_TOOL_RESULT_LIMIT,
  HOME_AI_TOOL_KEYS,
  type HomeAiToolKey,
} from "./ai.constants";
import { actorCanUseHomeAiTool } from "./home-ai-role-profiles";
import { HomeAiCrmReadService } from "./home-ai-crm-read.service";

export type HomeAiToolDefinition = {
  key: HomeAiToolKey;
  readOnly: true;
  permission: RoleModePermission | RoleModePermission[];
  resultLimit: number;
  openAiTool: {
    type: "function";
    function: {
      name: HomeAiToolKey;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
};

export type HomeAiToolTraceEntry = {
  tool: HomeAiToolKey;
  ok: boolean;
  reasonCode?: string;
  resultCount?: number;
};

const TOOL_DEFINITIONS: HomeAiToolDefinition[] = [
  {
    key: "search_customers",
    readOnly: true,
    permission: "customers.view",
    resultLimit: 10,
    openAiTool: {
      type: "function",
      function: {
        name: "search_customers",
        description: "Search customers in the active organization by name, email, or phone fragment.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Name, email, or phone fragment." },
            limit: { type: "number", description: "Max rows (default 10)." },
          },
          additionalProperties: false,
        },
      },
    },
  },
  {
    key: "get_leads",
    readOnly: true,
    permission: "leads.view",
    resultLimit: HOME_AI_DEFAULT_TOOL_RESULT_LIMIT,
    openAiTool: {
      type: "function",
      function: {
        name: "get_leads",
        description: "List recent leads, optionally filtered by status.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", description: "Lead status filter." },
            limit: { type: "number" },
          },
          additionalProperties: false,
        },
      },
    },
  },
  {
    key: "get_jobs",
    readOnly: true,
    permission: ["jobs.view", "jobs.assigned.view"],
    resultLimit: HOME_AI_DEFAULT_TOOL_RESULT_LIMIT,
    openAiTool: {
      type: "function",
      function: {
        name: "get_jobs",
        description: "List jobs in the active organization, respecting assigned scope for technicians.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", description: "Job status filter." },
            limit: { type: "number" },
          },
          additionalProperties: false,
        },
      },
    },
  },
  {
    key: "get_schedule",
    readOnly: true,
    permission: ["jobs.view", "jobs.assigned.view"],
    resultLimit: 20,
    openAiTool: {
      type: "function",
      function: {
        name: "get_schedule",
        description: "List scheduled jobs for a day (defaults to today in org timezone).",
        parameters: {
          type: "object",
          properties: {
            day: { type: "string", description: "ISO date YYYY-MM-DD." },
            limit: { type: "number" },
          },
          additionalProperties: false,
        },
      },
    },
  },
  {
    key: "get_estimates",
    readOnly: true,
    permission: ["estimates.view", "estimates.assigned.view"],
    resultLimit: HOME_AI_DEFAULT_TOOL_RESULT_LIMIT,
    openAiTool: {
      type: "function",
      function: {
        name: "get_estimates",
        description: "List estimates/quotes with totals and statuses.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string" },
            limit: { type: "number" },
          },
          additionalProperties: false,
        },
      },
    },
  },
  {
    key: "get_invoices",
    readOnly: true,
    permission: ["invoices.view", "invoices.assigned.view"],
    resultLimit: HOME_AI_DEFAULT_TOOL_RESULT_LIMIT,
    openAiTool: {
      type: "function",
      function: {
        name: "get_invoices",
        description: "List invoices with balances and payment statuses. Use only for financial amounts, not historical service-type questions.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string" },
            limit: { type: "number" },
          },
          additionalProperties: false,
        },
      },
    },
  },
  {
    key: "search_service_history",
    readOnly: true,
    permission: ["invoices.view", "invoices.assigned.view"],
    resultLimit: 12,
    openAiTool: {
      type: "function",
      function: {
        name: "search_service_history",
        description:
          "Query persisted Service Intelligence V1 for historical work/service meaning across the full invoice history. "
          + "Use this for WETT inspections, chimney sweeps, gas cleaning, component replacements (pilot, gas valve, blower), "
          + "and documented warranty evidence. Do not use get_invoices or get_jobs for these questions. "
          + "Omit customer filters for company-wide questions. If a customer name is provided and multiple people match, the tool returns ambiguity instead of guessing. "
          + "Results are derived classifications with confidence and review flags. Financial totals are not included.",
        parameters: {
          type: "object",
          properties: {
            customerQuery: {
              type: "string",
              description: "Customer name, email, or phone. Omit for company-wide history. Do not pass I/we/our.",
            },
            customerId: { type: "string", description: "Exact customer UUID after resolving a unique match." },
            system: { type: "string", description: "GAS, WOOD, CHIMNEY, MIXED, OTHER, or UNKNOWN." },
            primaryService: { type: "string", description: "CLEANING, INSPECTION, REPAIR, MAINTENANCE, TRUE_INSTALLATION." },
            serviceDetail: { type: "string", description: "WETT, CHIMNEY_SWEEP, GAS_CLEAN, PART_REPLACEMENT, and other V1 details." },
            component: { type: "string", description: "PILOT_ASSEMBLY, GAS_VALVE, BLOWER_FAN, and other canonical components." },
            workAction: { type: "string", description: "REPLACED, INSTALLED, REPAIRED, SERVICED, CLEANED, UNKNOWN." },
            warrantyStatus: { type: "string", description: "DOCUMENTED_ACTIVE, DOCUMENTED_EXPIRED, EXPLICIT_NO_WARRANTY, NOT_DOCUMENTED." },
            since: { type: "string", description: "Inclusive service-date start, YYYY-MM-DD." },
            until: { type: "string", description: "Inclusive service-date end, YYYY-MM-DD." },
            limit: { type: "number", description: "Max rows to return (default 12). matchCount is the full filtered total." },
          },
          additionalProperties: false,
        },
      },
    },
  },
];

@Injectable()
export class HomeAiToolRegistryService {
  constructor(private readonly crmReadService: HomeAiCrmReadService) {}

  listToolDefinitions(): HomeAiToolDefinition[] {
    return TOOL_DEFINITIONS;
  }

  listOpenAiToolsForActor(actor: ActorContext) {
    return TOOL_DEFINITIONS
      .filter((tool) => actorCanUseHomeAiTool(actor, tool.key))
      .map((tool) => tool.openAiTool);
  }

  async executeTool(input: {
    actor: ActorContext;
    organizationId: string;
    toolKey: string;
    args: Record<string, unknown>;
  }): Promise<{ trace: HomeAiToolTraceEntry; payload: Record<string, unknown> }> {
    const toolKey = input.toolKey as HomeAiToolKey;
    if (!HOME_AI_TOOL_KEYS.includes(toolKey)) {
      return {
        trace: { tool: toolKey, ok: false, reasonCode: "unknown_tool" },
        payload: { error: "unknown_tool", message: "Tool is not registered." },
      };
    }

    if (!actorCanUseHomeAiTool(input.actor, toolKey)) {
      return {
        trace: { tool: toolKey, ok: false, reasonCode: "permission_denied" },
        payload: { error: "permission_denied", message: "This account cannot use that tool." },
      };
    }

    const definition = TOOL_DEFINITIONS.find((tool) => tool.key === toolKey)!;
    const limit = Math.min(
      typeof input.args.limit === "number" ? input.args.limit : definition.resultLimit,
      definition.resultLimit,
    );

    let result;
    switch (toolKey) {
      case "search_customers":
        result = await this.crmReadService.searchCustomers(input.actor, input.organizationId, {
          query: typeof input.args.query === "string" ? input.args.query : undefined,
          limit,
        });
        break;
      case "get_leads":
        result = await this.crmReadService.getLeads(input.actor, input.organizationId, {
          status: typeof input.args.status === "string" ? input.args.status : undefined,
          limit,
        });
        break;
      case "get_jobs":
        result = await this.crmReadService.getJobs(input.actor, input.organizationId, {
          status: typeof input.args.status === "string" ? input.args.status : undefined,
          limit,
        });
        break;
      case "get_schedule":
        result = await this.crmReadService.getSchedule(input.actor, input.organizationId, {
          day: typeof input.args.day === "string" ? input.args.day : undefined,
          limit,
        });
        break;
      case "get_estimates":
        result = await this.crmReadService.getEstimates(input.actor, input.organizationId, {
          status: typeof input.args.status === "string" ? input.args.status : undefined,
          limit,
        });
        break;
      case "get_invoices":
        result = await this.crmReadService.getInvoices(input.actor, input.organizationId, {
          status: typeof input.args.status === "string" ? input.args.status : undefined,
          limit,
        });
        break;
      case "search_service_history":
        result = await this.crmReadService.searchServiceHistory(input.actor, input.organizationId, {
          customerId: typeof input.args.customerId === "string" ? input.args.customerId : undefined,
          customerQuery: typeof input.args.customerQuery === "string" ? input.args.customerQuery : undefined,
          system: typeof input.args.system === "string" ? input.args.system : undefined,
          primaryService: typeof input.args.primaryService === "string" ? input.args.primaryService : undefined,
          serviceDetail: typeof input.args.serviceDetail === "string" ? input.args.serviceDetail : undefined,
          component: typeof input.args.component === "string" ? input.args.component : undefined,
          workAction: typeof input.args.workAction === "string" ? input.args.workAction : undefined,
          warrantyStatus: typeof input.args.warrantyStatus === "string" ? input.args.warrantyStatus : undefined,
          since: typeof input.args.since === "string" ? input.args.since : undefined,
          until: typeof input.args.until === "string" ? input.args.until : undefined,
          limit,
        });
        break;
      default:
        result = { ok: false as const, reasonCode: "unknown_tool", message: "Unknown tool." };
    }

    if (!result.ok) {
      return {
        trace: { tool: toolKey, ok: false, reasonCode: result.reasonCode },
        payload: { error: result.reasonCode, message: result.message },
      };
    }

    const count = typeof result.data.count === "number" ? result.data.count : undefined;
    return {
      trace: { tool: toolKey, ok: true, resultCount: count },
      payload: {
        ...result.data,
        recordLinks: result.recordLinks,
      },
    };
  }
}

export function listRegisteredHomeAiToolKeys(): HomeAiToolKey[] {
  return [...HOME_AI_TOOL_KEYS];
}
