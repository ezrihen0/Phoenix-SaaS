import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { AiRecommendationRunEntity } from "../database/entities/ai-recommendation-run.entity";

@Injectable()
export class AiAuditService {
  constructor(
    @InjectRepository(AiRecommendationRunEntity)
    private readonly runsRepo: Repository<AiRecommendationRunEntity>,
  ) {}

  async persistRun(row: Partial<AiRecommendationRunEntity>): Promise<AiRecommendationRunEntity> {
    const entity = this.runsRepo.create(row as AiRecommendationRunEntity);
    return this.runsRepo.save(entity);
  }

  /**
   * Records product telemetry feedback on a chat run (org-scoped).
   * Returns false when the run is missing or already has feedback.
   */
  async recordChatFeedback(input: {
    runId: string;
    organizationId: string;
    actionKey: string;
    feedback: string;
  }): Promise<boolean> {
    const existing = await this.runsRepo.findOne({
      where: {
        id: input.runId,
        organization_id: input.organizationId,
        action_key: input.actionKey,
      },
      select: { id: true, outcome_key: true },
    });

    if (!existing) {
      return false;
    }

    if (existing.outcome_key != null && existing.outcome_key.trim() !== "") {
      apiError(409, "ai_chat_feedback_already_recorded", "Feedback was already recorded for this chat run.");
    }

    const result = await this.runsRepo.update(
      {
        id: input.runId,
        organization_id: input.organizationId,
        action_key: input.actionKey,
      },
      { outcome_key: input.feedback },
    );

    return (result.affected ?? 0) > 0;
  }
}
