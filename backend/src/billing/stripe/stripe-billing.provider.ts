import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { apiError } from "../../common/api-response";
import type { BillingProviderPort } from "../billing-provider.interface";
import type { BillingCheckoutSessionInput, BillingCheckoutSessionResult } from "../billing-provider.types";
import type { BillingProvider } from "../billing.constants";
import { resolveStripePriceIdForPlan } from "./stripe-price-catalog";
import { StripeClient } from "./stripe.client";

@Injectable()
export class StripeBillingProvider implements BillingProviderPort {
  readonly provider: BillingProvider = "stripe";

  constructor(
    private readonly configService: ConfigService,
    private readonly stripeClient: StripeClient,
  ) {}

  isConfigured(): boolean {
    return this.stripeClient.isConfigured();
  }

  async createCheckoutSession(input: BillingCheckoutSessionInput): Promise<BillingCheckoutSessionResult> {
    const priceId = resolveStripePriceIdForPlan(this.configService, input.planKey);
    if (!priceId) {
      apiError(
        503,
        "stripe_price_not_configured",
        `Stripe price id is not configured for the ${input.planKey} plan.`,
      );
    }

    if (!this.stripeClient.isConfigured()) {
      apiError(503, "stripe_not_configured", "Stripe secret key is not configured on the server.");
    }

    const metadata = {
      billing_account_id: input.billingAccountId,
      organization_id: input.organizationId,
      user_id: input.userId,
      plan_key: input.planKey,
    };

    const session = await this.stripeClient.client.checkout.sessions.create({
      mode: "subscription",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.billingAccountId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata,
      subscription_data: {
        metadata,
      },
      ...(input.existingProviderCustomerId
        ? { customer: input.existingProviderCustomerId }
        : input.userEmail
          ? { customer_email: input.userEmail }
          : {}),
    });

    if (!session.url || !session.id) {
      apiError(
        502,
        "stripe_checkout_session_failed",
        "Stripe did not return a redirect URL for the checkout session.",
      );
    }

    return {
      provider: this.provider,
      sessionId: session.id,
      checkoutUrl: session.url,
    };
  }
}
