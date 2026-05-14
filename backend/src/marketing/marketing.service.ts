import { Injectable } from "@nestjs/common";

import { MarketingContentService } from "./marketing-content.service";
import { MarketingProfileService } from "./marketing-profile.service";

export type MarketingFoundationResponse = {
  phase: "phase_2_content_studio";
  organization: {
    id: string;
    name: string | null;
    slug: string | null;
  };
  profile_saved: boolean;
  profile_hint_complete: boolean;
  drafts: {
    draft: number;
    needs_review: number;
    approved: number;
    scheduled_metadata_next_14d: number;
  };
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
  ) {}

  async buildFoundationResponse(input: {
    organizationId: string;
    organizationName: string | null;
    organizationSlug: string | null;
  }): Promise<MarketingFoundationResponse> {
    const organizationId = input.organizationId;

    const countsPromise = this.contentService.getOrgDraftCounts(organizationId);
    const scheduledPromise = this.contentService.countScheduledSoon(organizationId);
    const profileSavedPromise = this.profileService.exists(organizationId);
    const profileRecordPromise = this.profileService.loadProfileRecord(organizationId);
    const recentPromise = this.contentService.recentDraftSnapshots(organizationId, 5);

    const counts = await countsPromise;
    const scheduledSoon = await scheduledPromise;
    const profileSaved = await profileSavedPromise;
    const profileRecord = await profileRecordPromise;
    const recentSnapshots = await recentPromise;

    const profileHintComplete =
      Boolean(profileSaved) && this.profileService.profileCompletenessApprox(profileRecord);

    return {
      phase: "phase_2_content_studio",
      organization: {
        id: organizationId,
        name: input.organizationName,
        slug: input.organizationSlug,
      },
      profile_saved: profileSaved,
      profile_hint_complete: profileHintComplete,
      drafts: {
        draft: counts.draft,
        needs_review: counts.needs_review,
        approved: counts.approved,
        scheduled_metadata_next_14d: scheduledSoon,
      },
      recent_drafts: recentSnapshots.map((draft) => ({
        id: draft.id,
        title: draft.title,
        workflow_state: draft.workflow_state,
        updated_at: draft.updated_at,
      })),
      summaryCards: [
        {
          label: "Connected Channels",
          value: "0",
          helper: "Channel OAuth stays outside Phase 2. Content Studio drafts remain offline until publishing phases ship.",
        },
        {
          label: "Needs review",
          value: `${counts.needs_review}`,
          helper: "Drafts awaiting reviewer approval before they are marked ready.",
        },
        {
          label: "Calendar metadata slots",
          value: `${scheduledSoon}`,
          helper: "Upcoming placeholders inside the Growth Center calendar. Scheduling does not post to any external channel.",
        },
        {
          label: "Opportunities Detected",
          value: "0",
          helper: "CRM-backed opportunity routing remains in a future Growth Center milestone.",
        },
      ],
      publishing_disclaimer:
        "Phase 2 never publishes to Google, Facebook, or Instagram. Scheduling is metadata-only until publishing is separately authorized.",
      protectedBoundaries: [
        "Marketing records stay organization scoped",
        "Session-derived organization context drives every marketing query",
        "No delegated publish jobs or automated authoring endpoints ship in Phase 2",
      ],
    };
  }
}
