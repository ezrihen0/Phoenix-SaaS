import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  StripeWebhookEventReceiptEntity,
  type StripeWebhookReceiptStatus,
} from "../../database/entities/stripe-webhook-event-receipt.entity";

export type StripeWebhookReceiptBeginInput = {
  stripeEventId: string;
  eventType: string;
  stripeEventCreated: number;
  billingAccountId?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
};

export type StripeWebhookReceiptBeginResult =
  | { action: "process"; receipt: StripeWebhookEventReceiptEntity }
  | { action: "duplicate"; receipt: StripeWebhookEventReceiptEntity }
  | { action: "stale"; receipt: StripeWebhookEventReceiptEntity | null };

@Injectable()
export class StripeWebhookReceiptService {
  private readonly logger = new Logger(StripeWebhookReceiptService.name);

  constructor(
    @InjectRepository(StripeWebhookEventReceiptEntity)
    private readonly receiptsRepository: Repository<StripeWebhookEventReceiptEntity>,
  ) {}

  async beginProcessing(input: StripeWebhookReceiptBeginInput): Promise<StripeWebhookReceiptBeginResult> {
    const existing = await this.receiptsRepository.findOne({
      where: { stripe_event_id: input.stripeEventId.trim() },
    });

    if (existing?.processing_status === "processed" || existing?.processing_status === "ignored") {
      return { action: "duplicate", receipt: existing };
    }

    if (existing?.processing_status === "processing") {
      return { action: "duplicate", receipt: existing };
    }

    const stale = await this.isStaleEvent(input);
    if (stale) {
      const ignored = existing
        ? await this.markReceipt(existing.id, "ignored", "Stale Stripe event ignored.")
        : await this.createReceipt(input, "ignored", "Stale Stripe event ignored.");
      this.logger.warn(
        `Ignoring stale Stripe event ${input.stripeEventId} (${input.eventType}) for subscription=${input.providerSubscriptionId ?? "?"}`,
      );
      return { action: "stale", receipt: ignored };
    }

    if (existing) {
      existing.processing_status = "processing";
      existing.error_summary = null;
      existing.processed_at = null;
      existing.event_type = input.eventType;
      existing.stripe_event_created = String(input.stripeEventCreated);
      existing.billing_account_id = input.billingAccountId?.trim() ?? null;
      existing.provider_customer_id = input.providerCustomerId?.trim() ?? null;
      existing.provider_subscription_id = input.providerSubscriptionId?.trim() ?? null;
      return {
        action: "process",
        receipt: await this.receiptsRepository.save(existing),
      };
    }

    return {
      action: "process",
      receipt: await this.createReceipt(input, "processing"),
    };
  }

  async markProcessed(receiptId: string, billingAccountId?: string | null) {
    await this.markReceipt(receiptId, "processed", null, billingAccountId);
  }

  async markFailed(receiptId: string, errorSummary: string) {
    await this.markReceipt(receiptId, "failed", errorSummary);
  }

  async markIgnored(receiptId: string, reason: string) {
    await this.markReceipt(receiptId, "ignored", reason);
  }

  private async isStaleEvent(input: StripeWebhookReceiptBeginInput) {
    const eventCreated = String(input.stripeEventCreated);
    const subscriptionId = input.providerSubscriptionId?.trim();
    const billingAccountId = input.billingAccountId?.trim();

    if (subscriptionId) {
      const latest = await this.receiptsRepository
        .createQueryBuilder("receipt")
        .where("receipt.provider_subscription_id = :subscriptionId", { subscriptionId })
        .andWhere("receipt.processing_status IN (:...statuses)", { statuses: ["processed"] })
        .orderBy("receipt.stripe_event_created", "DESC")
        .getOne();

      if (latest && BigInt(latest.stripe_event_created) > BigInt(eventCreated)) {
        return true;
      }
    }

    if (billingAccountId) {
      const latest = await this.receiptsRepository
        .createQueryBuilder("receipt")
        .where("receipt.billing_account_id = :billingAccountId", { billingAccountId })
        .andWhere("receipt.processing_status IN (:...statuses)", { statuses: ["processed"] })
        .orderBy("receipt.stripe_event_created", "DESC")
        .getOne();

      if (latest && BigInt(latest.stripe_event_created) > BigInt(eventCreated)) {
        return true;
      }
    }

    return false;
  }

  private async createReceipt(
    input: StripeWebhookReceiptBeginInput,
    status: StripeWebhookReceiptStatus,
    errorSummary: string | null = null,
  ) {
    return this.receiptsRepository.save(
      this.receiptsRepository.create({
        stripe_event_id: input.stripeEventId.trim(),
        event_type: input.eventType,
        stripe_event_created: String(input.stripeEventCreated),
        billing_account_id: input.billingAccountId?.trim() ?? null,
        provider_customer_id: input.providerCustomerId?.trim() ?? null,
        provider_subscription_id: input.providerSubscriptionId?.trim() ?? null,
        processing_status: status,
        error_summary: errorSummary,
        processed_at: status === "processed" || status === "ignored" ? new Date() : null,
      }),
    );
  }

  private async markReceipt(
    receiptId: string,
    status: StripeWebhookReceiptStatus,
    errorSummary: string | null,
    billingAccountId?: string | null,
  ) {
    await this.receiptsRepository.update(
      { id: receiptId.trim() },
      {
        processing_status: status,
        error_summary: errorSummary,
        processed_at: status === "processed" || status === "ignored" ? new Date() : null,
        ...(billingAccountId?.trim() ? { billing_account_id: billingAccountId.trim() } : {}),
      },
    );

    const receipt = await this.receiptsRepository.findOne({ where: { id: receiptId.trim() } });
    if (!receipt) {
      throw new Error(`Stripe webhook receipt ${receiptId} not found.`);
    }
    return receipt;
  }
}
