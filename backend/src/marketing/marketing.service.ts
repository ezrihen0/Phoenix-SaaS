import { Injectable } from "@nestjs/common";

import { MarketingChannelsService } from "./marketing-channels.service";
import { MarketingContentService } from "./marketing-content.service";
import { MarketingOpportunityService } from "./marketing-opportunity.service";
import { MarketingProfileService } from "./marketing-profile.service";

export type MarketingFoundationResponse = {
  phase: "phase_4_crm_intelligence";
  organization: {
    id: string;
    name: string | null;
    slug: string | null;
  };
  capabilities: {
    can_manage_channels: boolean;
    can_enqueue_publishing: boolean;
    can_refresh_opportunities: boolean;
  };
  profile_saved: boolean;
  profile_hint_complete: boolean;
  drafts: {
    draft: number;
    needs_review: number;
    approved: number;
    scheduled_metadata_next_14d: number;
  };
  opportunities: {
    open_count: number;
  };
  recommended_next_action: {
    opportunity_type: string | null;
    opportunity_id: string | null;
    headline: string;
    subheadline: string;
    href: string | null;
  } | null;
  recent_drafts: Array<{
    id: string;
    title: string;
    workflow_state: string;
    updated_at: string;
  }>;
  summaryCards: Array<{
    label: string;
    value: string;
    helper: string;
  }>;
  publishing_disclaimer: string;
  protectedBoundaries: string[];
};

@Injectable()
export class MarketingService {
  constructor(
    private readonly profileService: MarketingProfileService,
    private readonly contentService: MarketingContentService,
    private readonly channelsService: MarketingChannelsService,
    private readonly opportunityService: MarketingOpportunityService,
  ) {}

  async buildFoundationResponse(input: {
    organizationId: string;
    organizationName: string | null;
    organizationSlug: string | null;
    role: string | null;
  }): Promise<MarketingFoundationResponse> {
    const organizationId = input.organizationId;

    const countsPromise = this.contentService.getOrgDraftCounts(organizationId);
    const scheduledPromise = this.contentService.countScheduledSoon(organizationId);
    const profileSavedPromise = this.profileService.exists(organizationId);
    const profileRecordPromise = this.profileService.loadProfileRecord(organizationId);
    const recentPromise = this.contentService.recentDraftSnapshots(organizationId, 5);
    const connectedChannelsPromise = this.channelsService.countConnectedPublishingTargets(organizationId);
    const opportunityOpenPromise = this.opportunityService.countOpenForOrganization(organizationId);
    const opportunityRowsPromise = this.opportunityService.loadOpenSuggestedForRecommendation(organizationId);

    const counts = await countsPromise;
    const scheduledSoon = await scheduledPromise;
    const profileSaved = await profileSavedPromise;
    const profileRecord = await profileRecordPromise;
    const recentSnapshots = await recentPromise;
    const connectedChannels = await connectedChannelsPromise;
    const opportunityOpenCount = await opportunityOpenPromise;
    const opportunityRows = await opportunityRowsPromise;

    const profileHintComplete =
      Boolean(profileSaved) && this.profileService.profileCompletenessApprox(profileRecord);

    const role = input.role;

    const canPublish = role === "owner" || role === "admin" || role === "office_admin";

    const recommendedNext = this.opportunityService.recommendNextAction(opportunityRows);

    return {
      phase: "phase_4_crm_intelligence",
      organization: {
        id: organizationId,
        name: input.organizationName,
        slug: input.organizationSlug,
      },
      capabilities: {
        can_manage_channels: role === "owner" || role === "admin",
        can_enqueue_publishing: canPublish,
        can_refresh_opportunities: canPublish,
      },
      profile_saved: profileSaved,
      profile_hint_complete: profileHintComplete,
      drafts: {
        draft: counts.draft,
        needs_review: counts.needs_review,
        approved: counts.approved,
        scheduled_metadata_next_14d: scheduledSoon,
      },
      opportunities: {
        open_count: opportunityOpenCount,
      },
      recommended_next_action: recommendedNext,
      recent_drafts: recentSnapshots.map((draft) => ({
        id: draft.id,
        title: draft.title,
        workflow_state: draft.workflow_state,
        updated_at: draft.updated_at,
      })),
      summaryCards: [
        {
          label: "Connected Channels",
          value: `${connectedChannels}`,
          helper:
            "Google Business Profile and Facebook Page OAuth targets count toward live publishing readiness. Instagram stays deferred until V1.5.",
        },
        {
          label: "Needs review",
          value: `${counts.needs_review}`,
          helper: "Drafts awaiting reviewer approval before they are marked ready.",
        },
        {
          label: "Calendar metadata slots",
          value: `${scheduledSoon}`,
          helper:
            "Editorial placeholders on drafts. Execution time always comes from explicit publish jobs (`publish_job.scheduled_at` in UTC).",
        },
        {
          label: "Open opportunities",
          value: `${opportunityOpenCount}`,
          helper:
            "CRM-backed suggestions from recent jobs and inspections. Refresh lists explicitly or open Opportunities — dispatchers can review but cannot refresh or convert.",
        },
      ],
      publishing_disclaimer:
        "Publishing creates explicit Growth Center jobs (`publish_job.scheduled_at`). Draft calendar metadata (`draft.scheduled_at`) never silently posts.",
      protectedBoundaries: [
        "Marketing records stay organization scoped",
        "Session-derived organization context drives every marketing query",
        "Instagram variants remain seeded while outbound IG publishing waits for V1.5",
        "Dispatcher roles cannot enqueue publishes, mutate OAuth integrations, refresh opportunities, dismiss, archive, or convert to drafts",
      ],
    };
  }
}
