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
        description: "List invoices with balances and statuses.",
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
