import type { MarketingCampaignKind } from "../database/entities/marketing-campaign.entity";

/** Bump when deterministic slot definitions change (stored in plan_snapshot_json). */
export const MARKETING_CAMPAIGN_TEMPLATE_VERSION = 1;

export type CampaignSlotBlueprint = {
  slot_key: string;
  label: string;
  plan_notes: string;
  /** Position along campaign window [0, 1] for suggested editorial date. */
  progressAlongWindow: number;
};

export function computeSuggestedScheduledAt(
  windowStartsAt: Date,
  windowEndsAt: Date,
  progressAlongWindow: number,
): Date {
  const startMs = windowStartsAt.getTime();
  const range = Math.max(0, windowEndsAt.getTime() - startMs);
  const t = Math.min(1, Math.max(0, progressAlongWindow));
  return new Date(startMs + Math.floor(range * t));
}

export function slotBlueprintsForKind(kind: MarketingCampaignKind): CampaignSlotBlueprint[] {
  switch (kind) {
    case "seasonal_campaign":
      return [
        {
          slot_key: "seasonal_teaser",
          label: "Season opener — awareness",
          plan_notes:
            "Introduce the seasonal angle without hard-selling. Outline value + timing; manual copy per platform in Content Studio.",
          progressAlongWindow: 0.08,
        },
        {
          slot_key: "seasonal_reminder",
          label: "Reminder — educate + urgency",
          plan_notes: "Reinforce why now matters for this season/service. Still manual edits — no auto-publish.",
          progressAlongWindow: 0.38,
        },
        {
          slot_key: "seasonal_last_call",
          label: "Last-call / booking nudge",
          plan_notes: "Stronger CTA aligned with your Marketing Profile defaults. Explicit publish stays Phase 3 only.",
          progressAlongWindow: 0.72,
        },
        {
          slot_key: "seasonal_follow_through",
          label: "Follow-through / proof-adjacent",
          plan_notes:
            "Optional credibility beat (photos/testimonials stay manual). Instagram variants remain deferred for outbound IG.",
          progressAlongWindow: 0.92,
        },
      ];
    case "service_push_campaign":
      return [
        {
          slot_key: "service_problem",
          label: "Problem-aware post",
          plan_notes: "Speak to the pain your primary service solves. Keep claims truthful — manual wording.",
          progressAlongWindow: 0.12,
        },
        {
          slot_key: "service_proof",
          label: "Proof / why us",
          plan_notes: "Completed-work angles belong here — still no CRM media sync in Campaign Builder.",
          progressAlongWindow: 0.48,
        },
        {
          slot_key: "service_cta",
          label: "Conversion CTA",
          plan_notes: "Drive estimates/bookings via Profile CTAs. Scheduling metadata ≠ outbound posting.",
          progressAlongWindow: 0.85,
        },
      ];
    case "trust_credibility_campaign":
      return [
        {
          slot_key: "trust_story",
          label: "Story / credibility spine",
          plan_notes: "Foundational trust narrative. No AI copy — edit all platform tabs manually.",
          progressAlongWindow: 0.15,
        },
        {
          slot_key: "trust_proof",
          label: "Proof point",
          plan_notes: "Technician professionalism, warranties, process — factual only.",
          progressAlongWindow: 0.5,
        },
        {
          slot_key: "trust_reinforce",
          label: "Reinforcement + light CTA",
          plan_notes: "Tie trust back to how to hire you. Publish only through explicit Growth Center jobs.",
          progressAlongWindow: 0.88,
        },
      ];
    case "local_authority_campaign":
      return [
        {
          slot_key: "local_hook",
          label: "Local hook",
          plan_notes:
            "Neighborhood/city-aware framing using your geo inputs — avoid naming customers without consent.",
          progressAlongWindow: 0.12,
        },
        {
          slot_key: "local_density",
          label: "Area expertise cluster",
          plan_notes: "Why your team is credible in this geography — manual specifics.",
          progressAlongWindow: 0.48,
        },
        {
          slot_key: "local_soft_cta",
          label: "Soft local CTA",
          plan_notes: "Invite locals to respond/book — still explicit Phase 3 for outbound publishing.",
          progressAlongWindow: 0.86,
        },
      ];
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
