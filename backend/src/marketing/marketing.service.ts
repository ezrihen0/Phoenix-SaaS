import { Injectable } from "@nestjs/common";

export type MarketingFoundationResponse = {
  phase: "phase_1_foundation";
  organization: {
    id: string;
    name: string | null;
    slug: string | null;
  };
  summaryCards: Array<{
    label: string;
    value: string;
    helper: string;
  }>;
  laterPhases: string[];
  protectedBoundaries: string[];
};

@Injectable()
export class MarketingService {
  getFoundationResponse(input: {
    organizationId: string;
    organizationName: string | null;
    organizationSlug: string | null;
  }): MarketingFoundationResponse {
    return {
      phase: "phase_1_foundation",
      organization: {
        id: input.organizationId,
        name: input.organizationName,
        slug: input.organizationSlug,
      },
      summaryCards: [
        {
          label: "Connected Channels",
          value: "0",
          helper: "Publishing integrations remain outside the Phase 1 foundation slice.",
        },
        {
          label: "Drafts Awaiting Approval",
          value: "0",
          helper: "Content creation starts only after the foundation phase is complete.",
        },
        {
          label: "Scheduled This Week",
          value: "0",
          helper: "Scheduling is reserved for later approved phases.",
        },
        {
          label: "Opportunities Detected",
          value: "0",
          helper: "CRM-powered opportunity detection is not active in Phase 1.",
        },
      ],
      laterPhases: [
        "Content Studio",
        "AI generation",
        "Publishing integrations",
        "CRM intelligence",
        "Campaign Builder",
        "Autopilot",
        "Analytics",
        "Monetization",
      ],
      protectedBoundaries: [
        "App and module wiring",
        "Organization-owned entity registration",
        "Authenticated office route surface",
      ],
    };
  }
}
