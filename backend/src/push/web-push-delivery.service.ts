import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import webpush from "web-push";
import { IsNull, Repository } from "typeorm";

import { WebPushSubscriptionEntity } from "../database/entities/web-push-subscription.entity";
import type { TechnicianJobPushMessage } from "./job-technician-push.classifier";
import { WebPushConfigService } from "./web-push-config.service";

@Injectable()
export class WebPushDeliveryService {
  private readonly logger = new Logger(WebPushDeliveryService.name);
  private vapidConfigured = false;

  constructor(
    private readonly webPushConfigService: WebPushConfigService,
    @InjectRepository(WebPushSubscriptionEntity)
    private readonly subscriptionsRepository: Repository<WebPushSubscriptionEntity>,
  ) {}

  private ensureVapidConfigured() {
    if (this.vapidConfigured) {
      return true;
    }

    if (!this.webPushConfigService.isConfiguredForSend()) {
      return false;
    }

    webpush.setVapidDetails(
      this.webPushConfigService.getVapidSubject(),
      this.webPushConfigService.getVapidPublicKey()!,
      this.webPushConfigService.getVapidPrivateKey()!,
    );
    this.vapidConfigured = true;
    return true;
  }

  async sendToUserSubscriptions(
    organizationId: string,
    authUserId: string,
    message: TechnicianJobPushMessage,
  ): Promise<void> {
    if (!this.ensureVapidConfigured()) {
      return;
    }

    const subscriptions = await this.subscriptionsRepository.find({
      where: {
        organization_id: organizationId,
        auth_user_id: authUserId,
        disabled_at: IsNull(),
      },
    });

    if (subscriptions.length === 0) {
      return;
    }

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: message.url,
    });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            payload,
          );
          subscription.last_success_at = new Date();
          await this.subscriptionsRepository.save(subscription);
        } catch (error) {
          const statusCode =
            typeof error === "object"
            && error !== null
            && "statusCode" in error
            && typeof (error as { statusCode: unknown }).statusCode === "number"
              ? (error as { statusCode: number }).statusCode
              : null;

          if (statusCode === 404 || statusCode === 410) {
            subscription.disabled_at = new Date();
            await this.subscriptionsRepository.save(subscription);
            return;
          }

          this.logger.warn(
            `web_push_send_failed user=${authUserId} endpoint=${subscription.endpoint.slice(0, 48)}…`,
          );
        }
      }),
    );
  }
}
