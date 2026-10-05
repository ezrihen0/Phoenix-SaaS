import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { Repository } from "typeorm";

import { WebPushSubscriptionEntity } from "../database/entities/web-push-subscription.entity";

export type PushSubscriptionUpsertInput = {
  organizationId: string;
  authUserId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

@Injectable()
export class PushSubscriptionService {
  constructor(
    @InjectRepository(WebPushSubscriptionEntity)
    private readonly subscriptionsRepository: Repository<WebPushSubscriptionEntity>,
  ) {}

  async upsertSubscription(input: PushSubscriptionUpsertInput): Promise<WebPushSubscriptionEntity> {
    const existing = await this.subscriptionsRepository.findOne({
      where: { endpoint: input.endpoint },
    });

    if (existing) {
      existing.organization_id = input.organizationId;
      existing.auth_user_id = input.authUserId;
      existing.p256dh = input.p256dh;
      existing.auth = input.auth;
      existing.user_agent = input.userAgent;
      existing.disabled_at = null;
      return this.subscriptionsRepository.save(existing);
    }

    return this.subscriptionsRepository.save(
      this.subscriptionsRepository.create({
        id: randomUUID(),
        organization_id: input.organizationId,
        auth_user_id: input.authUserId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent,
        last_success_at: null,
        disabled_at: null,
      }),
    );
  }

  async deleteByEndpoint(authUserId: string, endpoint: string): Promise<void> {
    await this.subscriptionsRepository.delete({
      auth_user_id: authUserId,
      endpoint,
    });
  }
}
