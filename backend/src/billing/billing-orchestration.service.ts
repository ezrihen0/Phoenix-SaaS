import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { apiError } from "../common/api-response";
import type { BillingAccountEntity } from "../database/entities/billing-account.entity";
import type { BillingPlanKey } from "./billing.constants";
import { BillingProviderRegistryService } from "./billing-provider-registry.service";
import { LanguageStoreEntitlementService } from "./language-store-entitlement.service";
import type { ProviderSubscriptionSnapshot } from "./billing-provider.types";
import { OrganizationBillingService } from "./organization-billing.service";

@Injectable()
export class BillingOrchestrationService {
  private readonly logger = new Logger(BillingOrchestrationService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly organizationBillingService: OrganizationBillingService,
    private readonly billingProviderRegistryService: BillingProviderRegistryService,
    private readonly languageStoreEntitlementService: LanguageStoreEntitlementService,
  ) {}

  isActiveProviderConfigured(): boolean {
    return this.billingProviderRegistryService.isActiveProviderConfigured();
  }

  getActiveProviderName() {
    return this.billingProviderRegistryService.getActiveProviderName();
  }

  getCheckoutUrlsConfigured() {
    return false;
  }

  async createCheckoutSessionForOrganization(input: {
    organizationId: string;
    userId: string;
    userEmail: string | null;
    planKey: BillingPlanKey;
  }) {
    void input;
    apiError(
      410,
      "platform_subscription_billing_disabled",
      "WizField SaaS subscription checkout is disabled for this runtime.",
    );
  }

  async applyProviderSnapshot(snapshot: ProviderSubscriptionSnapshot) {
    const account = await this.resolveBillingAccount(snapshot);
    if (!account) {
      this.logger.warn(
        `No billing account could be resolved for provider=${snapshot.provider} customer=${snapshot.providerCustomerId ?? "?"} subscription=${snapshot.providerSubscriptionId ?? "?"}`,
      );
      return null;
    }

    const patch = buildBillingAccountPatch(snapshot, account);

    return this.dataSource.transaction(async (manager) => {
      await this.organizationBillingService.updateBillingAccountFieldsByIdWithManager(
        manager,
        account.id,
        patch,
      );
      const nextAccount = await this.organizationBillingService.getBillingAccountByIdWithManager(
        manager,
        account.id,
      );
      await this.languageStoreEntitlementService.reconcileBillingAccountWithManager(
        manager,
        nextAccount,
        snapshot,
      );
      return nextAccount;
    });
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

}

function buildBillingAccountPatch(
  snapshot: ProviderSubscriptionSnapshot,
  account: BillingAccountEntity,
) {
  return {
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
}
