import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import type { BillingAccountEntity } from "../database/entities/billing-account.entity";
import { BillingAccountSubscriptionItemEntity } from "../database/entities/billing-account-subscription-item.entity";
import { OrganizationBillingEntity } from "../database/entities/organization-billing.entity";
import { OrganizationLanguageEntitlementEntity } from "../database/entities/organization-language-entitlement.entity";
import {
  projectLanguageEntitlement,
  resolveStripeSubscriptionItem,
  type BillingSubscriptionItemKind,
} from "./language-store-entitlement.helpers";
import type { ProviderSubscriptionSnapshot } from "./billing-provider.types";

@Injectable()
export class LanguageStoreEntitlementService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(OrganizationBillingEntity)
    private readonly organizationBillingRepository: Repository<OrganizationBillingEntity>,
    @InjectRepository(BillingAccountSubscriptionItemEntity)
    private readonly billingAccountSubscriptionItemsRepository: Repository<BillingAccountSubscriptionItemEntity>,
    @InjectRepository(OrganizationLanguageEntitlementEntity)
    private readonly organizationLanguageEntitlementsRepository: Repository<OrganizationLanguageEntitlementEntity>,
  ) {}

  async reconcileBillingAccount(account: BillingAccountEntity, snapshot: ProviderSubscriptionSnapshot) {
    if (Array.isArray(snapshot.subscriptionItems)) {
      await this.syncSubscriptionItems(account, snapshot);
    } else if (snapshot.providerSubscriptionId?.trim() && snapshot.billingStatus === "deactivated") {
      await this.markSubscriptionItemsInactive(
        account.id,
        snapshot.provider,
        snapshot.providerSubscriptionId.trim(),
        snapshot.lastProviderSyncAt ?? new Date(),
      );
    }

    await this.projectOrganizationEntitlements(account);
  }

  private async syncSubscriptionItems(account: BillingAccountEntity, snapshot: ProviderSubscriptionSnapshot) {
    const subscriptionItems = snapshot.subscriptionItems ?? [];
    const providerSubscriptionId = snapshot.providerSubscriptionId?.trim() ?? null;
    const providerOrganizationId = snapshot.organizationId?.trim() ?? null;
    const syncedAt = snapshot.lastProviderSyncAt ?? new Date();

    const existingItems = await this.billingAccountSubscriptionItemsRepository.find({
      where: {
        billing_account_id: account.id,
        provider: snapshot.provider,
      },
    });
    const existingByProviderItemId = new Map(
      existingItems.map((item) => [item.provider_subscription_item_id, item] as const),
    );

    const seenProviderItemIds = new Set<string>();
    for (const item of subscriptionItems) {
      const providerSubscriptionItemId = item.providerSubscriptionItemId.trim();
      if (!providerSubscriptionItemId) {
        continue;
      }

      seenProviderItemIds.add(providerSubscriptionItemId);
      const resolved = resolveStripeSubscriptionItem(this.configService, item.providerPriceId);
      if (!resolved) {
        continue;
      }

      const existing = existingByProviderItemId.get(providerSubscriptionItemId);
      const nextAllocatedOrganizationId = resolveAllocatedOrganizationId({
        itemKind: resolved.item_kind,
        existingAllocatedOrganizationId: existing?.allocated_organization_id ?? null,
        providerOrganizationId,
      });

      const entity = existing ?? this.billingAccountSubscriptionItemsRepository.create({
        billing_account_id: account.id,
        provider: snapshot.provider,
        provider_subscription_item_id: providerSubscriptionItemId,
      });

      entity.billing_account_id = account.id;
      entity.provider = snapshot.provider;
      entity.provider_subscription_id = providerSubscriptionId;
      entity.provider_subscription_item_id = providerSubscriptionItemId;
      entity.provider_price_id = item.providerPriceId?.trim() ?? null;
      entity.item_kind = resolved.item_kind;
      entity.plan_key = resolved.plan_key;
      entity.allocated_organization_id = nextAllocatedOrganizationId;
      entity.quantity = Math.max(0, item.quantity);
      entity.is_active = item.quantity > 0;
      entity.current_period_start = snapshot.currentPeriodStart ?? account.current_period_start ?? null;
      entity.current_period_end = snapshot.currentPeriodEnd ?? account.current_period_end ?? null;
      entity.last_provider_sync_at = syncedAt;

      await this.billingAccountSubscriptionItemsRepository.save(entity);
    }

    const staleItems = existingItems.filter((item) =>
      item.provider_subscription_id === providerSubscriptionId && !seenProviderItemIds.has(item.provider_subscription_item_id));

    if (staleItems.length > 0) {
      for (const item of staleItems) {
        item.is_active = false;
        item.quantity = 0;
        item.last_provider_sync_at = syncedAt;
      }
      await this.billingAccountSubscriptionItemsRepository.save(staleItems);
    }
  }

  private async markSubscriptionItemsInactive(
    billingAccountId: string,
    provider: ProviderSubscriptionSnapshot["provider"],
    providerSubscriptionId: string,
    syncedAt: Date,
  ) {
    const existingItems = await this.billingAccountSubscriptionItemsRepository.find({
      where: {
        billing_account_id: billingAccountId,
        provider,
        provider_subscription_id: providerSubscriptionId,
        is_active: true,
      },
    });

    if (existingItems.length === 0) {
      return;
    }

    for (const item of existingItems) {
      item.is_active = false;
      item.quantity = 0;
      item.last_provider_sync_at = syncedAt;
    }

    await this.billingAccountSubscriptionItemsRepository.save(existingItems);
  }

  private async projectOrganizationEntitlements(account: BillingAccountEntity) {
    const coverages = await this.organizationBillingRepository.find({
      where: { billing_account_id: account.id },
      order: { created_at: "ASC" },
    });
    const organizationIds = coverages.map((coverage) => coverage.organization_id);

    const activeSubscriptionItems = await this.billingAccountSubscriptionItemsRepository.find({
      where: {
        billing_account_id: account.id,
        is_active: true,
      },
    });

    const activeItemsByOrganization = new Map<string, Array<{ item_kind: BillingSubscriptionItemKind; quantity: number }>>();
    for (const item of activeSubscriptionItems) {
      if (!item.allocated_organization_id) {
        continue;
      }
      const existing = activeItemsByOrganization.get(item.allocated_organization_id) ?? [];
      existing.push({
        item_kind: item.item_kind,
        quantity: item.quantity,
      });
      activeItemsByOrganization.set(item.allocated_organization_id, existing);
    }

    for (const coverage of coverages) {
      const projected = projectLanguageEntitlement({
        planKey: account.plan_key,
        billingStatus: account.billing_status,
        activeItems: activeItemsByOrganization.get(coverage.organization_id) ?? [],
      });

      const entity = await this.organizationLanguageEntitlementsRepository.findOne({
        where: { organization_id: coverage.organization_id },
      }) ?? this.organizationLanguageEntitlementsRepository.create({
        organization_id: coverage.organization_id,
      });

      entity.billing_account_id = account.id;
      entity.source_plan_key = projected.source_plan_key;
      entity.billing_status = projected.billing_status;
      entity.language_store_enabled = projected.language_store_enabled;
      entity.included_additional_language_slots = projected.included_additional_language_slots;
      entity.addon_additional_language_slots = projected.addon_additional_language_slots;
      entity.total_additional_language_slots = projected.total_additional_language_slots;
      entity.included_translation_units = projected.included_translation_units;
      entity.addon_translation_units = projected.addon_translation_units;
      entity.total_translation_units = projected.total_translation_units;
      entity.last_reconciled_at = new Date();

      await this.organizationLanguageEntitlementsRepository.save(entity);
    }

    if (organizationIds.length === 0) {
      await this.organizationLanguageEntitlementsRepository.delete({ billing_account_id: account.id });
      return;
    }

    const staleRows = await this.organizationLanguageEntitlementsRepository.find({
      where: {
        billing_account_id: account.id,
      },
    });
    const staleOrganizationIds = staleRows
      .map((row) => row.organization_id)
      .filter((organizationId) => !organizationIds.includes(organizationId));

    if (staleOrganizationIds.length > 0) {
      await this.organizationLanguageEntitlementsRepository.delete({
        organization_id: In(staleOrganizationIds),
      });
    }
  }
}

function resolveAllocatedOrganizationId(input: {
  itemKind: BillingSubscriptionItemKind;
  existingAllocatedOrganizationId: string | null;
  providerOrganizationId: string | null;
}) {
  if (input.itemKind === "base_plan") {
    return null;
  }

  return input.existingAllocatedOrganizationId ?? input.providerOrganizationId ?? null;
}
