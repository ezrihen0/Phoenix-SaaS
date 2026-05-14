import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";

@Injectable()
export class StripeClient {
  private stripeInstance: InstanceType<typeof Stripe> | null = null;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.secretKey());
  }

  get client(): InstanceType<typeof Stripe> {
    const secretKey = this.secretKey();
    if (!secretKey) {
      throw new Error("Stripe secret key is not configured.");
    }

    if (!this.stripeInstance) {
      this.stripeInstance = new Stripe(secretKey);
    }

    return this.stripeInstance;
  }

  constructWebhookEvent(payload: Buffer, signature: string) {
    const webhookSecret = this.webhookSecret();
    if (!webhookSecret) {
      throw new Error("Stripe webhook secret is not configured.");
    }

    return this.client.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  private secretKey() {
    return this.configService.get<string>("STRIPE_SECRET_KEY")?.trim() ?? "";
  }

  private webhookSecret() {
    return this.configService.get<string>("STRIPE_WEBHOOK_SECRET")?.trim() ?? "";
  }
}
