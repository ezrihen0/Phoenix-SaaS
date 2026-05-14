import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { apiError } from "../common/api-response";
import type { BillingAccountEntity } from "../database/entities/billing-account.entity";
import type { PhoenixPlanKey } from "./billing.constants";
import { BillingProviderRegistryService } from "./billing-provider-registry.service";
import type { ProviderSubscriptionSnapshot } from "./billing-provider.types";
import { OrganizationBillingService } from "./organization-billing.service";

@Injectable()
export class BillingOrchestrationService {
  private readonly logger = new Logger(BillingOrchestrationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly organizationBillingService: OrganizationBillingService,
    private readonly billingProviderRegistryService: BillingProviderRegistryService,
  ) {}

  isActiveProviderConfigured(): boolean {
    return this.billingProviderRegistryService.getActiveProvider().isConfigured();
  }

  getActiveProviderName() {
    return this.billingProviderRegistryService.getActiveProvider().provider;
  }

  getStripeCheckoutUrlsConfigured() {
    return Boolean(this.successUrl().trim() && this.cancelUrl().trim());
  }

  async createCheckoutSessionForOrganization(input: {
    organizationId: string;
    userId: string;
    userEmail: string | null;
    planKey: PhoenixPlanKey;
  }) {
    const context = await this.organizationBillingService.getOrCreateContextForOrganization(input.organizationId);
    const provider = this.billingProviderRegistryService.getActiveProvider();

    if (context.account.owner_user_id !== input.userId) {
      await this.organizationBillingService.setBillingAccountOwner(context.account.id, input.userId);
    }

    if (!provider.isConfigured()) {
      apiError(
        503,
        "billing_provider_not_configured",
        `${provider.provider} is not configured on the server yet.`,
      );
    }

    const result = await provider.createCheckoutSession({
      billingAccountId: context.account.id,
      organizationId: input.organizationId,
      userId: input.userId,
      userEmail: input.userEmail,
      planKey: input.planKey,
      existingProviderCustomerId:
        context.account.billing_provider === provider.provider
          ? (context.account.provider_customer_id ?? null)
          : null,
      successUrl: this.successUrl(),
      cancelUrl: this.cancelUrl(),
    });

    return {
      provider: result.provider,
      billing_account_id: context.account.id,
      session_id: result.sessionId,
      url: result.checkoutUrl,
    };
  }

  async applyProviderSnapshot(snapshot: ProviderSubscriptionSnapshot) {
    const account = await this.resolveBillingAccount(snapshot);
    if (!account) {
      this.logger.warn(
        `No billing account could be resolved for provider=${snapshot.provider} customer=${snapshot.providerCustomerId ?? "?"} subscription=${snapshot.providerSubscriptionId ?? "?"}`,
      );
      return null;
    }

    const patch = {
      billing_provider: snapshot.provider,
      provider_customer_id: snapshot.providerCustomerId ?? account.provider_customer_id ?? null,
      provider_subscription_id: snapshot.providerSubscriptionId ?? account.provider_subscription_id ?? null,
      provider_price_id: snapshot.providerPriceId ?? account.provider_price_id ?? null,
      ...(Object.prototype.hasOwnProperty.call(snapshot, "planKey") ? { plan_key: snapshot.planKey ?? undefined } : {}),
      ...(Object.prototype.hasOwnProperty.call(snapshot, "billingStatus")
        ? { billing_status: snapshot.billingStatus ?? undefined }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(snapshot, "currentPeriodStart")
        ? { current_period_start: snapshot.currentPeriodStart ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(snapshot, "currentPeriodEnd")
        ? { current_period_end: snapshot.currentPeriodEnd ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(snapshot, "cancelAtPeriodEnd")
        ? { cancel_at_period_end: snapshot.cancelAtPeriodEnd ?? false }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(snapshot, "canceledAt")
        ? { canceled_at: snapshot.canceledAt ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(snapshot, "deactivatedAt")
        ? { deactivated_at: snapshot.deactivatedAt ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(snapshot, "attentionReason")
        ? { attention_reason: snapshot.attentionReason ?? null }
        : {}),
      last_provider_sync_at: snapshot.lastProviderSyncAt ?? new Date(),
      ...(Object.prototype.hasOwnProperty.call(snapshot, "lastWebhookAt")
        ? { last_webhook_at: snapshot.lastWebhookAt ?? null }
        : {}),
    };

    await this.organizationBillingService.updateBillingAccountFieldsById(account.id, patch);

    return this.organizationBillingService.getBillingAccountById(account.id);
  }

  private async resolveBillingAccount(snapshot: ProviderSubscriptionSnapshot): Promise<BillingAccountEntity | null> {
    if (snapshot.billingAccountId?.trim()) {
      return this.organizationBillingService.getBillingAccountById(snapshot.billingAccountId.trim());
    }

    if (snapshot.providerSubscriptionId?.trim()) {
      const bySubscription = await this.organizationBillingService.findBillingAccountByProviderSubscriptionId(
        snapshot.providerSubscriptionId.trim(),
      );
      if (bySubscription) {
        return bySubscription;
      }
    }

    if (snapshot.providerCustomerId?.trim()) {
      return this.organizationBillingService.findBillingAccountByProviderCustomerId(snapshot.providerCustomerId.trim());
    }

    return null;
  }

  private successUrl() {
    return (
      this.configService.get<string>("STRIPE_CHECKOUT_SUCCESS_URL")?.trim()
      ?? "http://localhost:3000/billing/success?session_id={CHECKOUT_SESSION_ID}"
    );
  }

  private cancelUrl() {
    return (
      this.configService.get<string>("STRIPE_CHECKOUT_CANCEL_URL")?.trim()
      ?? "http://localhost:3000/pricing?checkout=cancelled"
    );
  }
}
