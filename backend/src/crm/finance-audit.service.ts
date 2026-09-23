import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";

import {
  FinanceAuditEventEntity,
  type FinanceAuditAction,
} from "../database/entities/finance-audit-event.entity";

@Injectable()
export class FinanceAuditService {
  constructor(
    @InjectRepository(FinanceAuditEventEntity)
    private readonly financeAuditRepository: Repository<FinanceAuditEventEntity>,
  ) {}

  async log(input: {
    organizationId: string;
    actorProfileId: string | null;
    entityType: string;
    entityId: string;
    action: FinanceAuditAction;
    metadata?: Record<string, unknown>;
    manager?: EntityManager;
  }) {
    const repo = input.manager
      ? input.manager.getRepository(FinanceAuditEventEntity)
      : this.financeAuditRepository;

    await repo.save(
      repo.create({
        organization_id: input.organizationId,
        actor_profile_id: input.actorProfileId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        action: input.action,
        metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      }),
    );
  }
}
