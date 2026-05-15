import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

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
}
