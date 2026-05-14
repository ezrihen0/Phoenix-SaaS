import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { DataSource } from "typeorm";

import { LanguageStoreEntitlementService } from "../billing/language-store-entitlement.service";
import { OrganizationBillingService } from "../billing/organization-billing.service";
import { buildDataSourceOptions } from "./typeorm.config";
import { BillingAccountEntity } from "./entities/billing-account.entity";
import { BillingAccountSubscriptionItemEntity } from "./entities/billing-account-subscription-item.entity";
import { OrganizationBillingEntity } from "./entities/organization-billing.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationLanguageEntitlementEntity } from "./entities/organization-language-entitlement.entity";
import { UserEntity } from "./entities/user.entity";

class ConfigStub {
  constructor(private readonly values: Record<string, string>) {}

  get(key: string) {
    return this.values[key];
  }
}

async function main() {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  const config = new ConfigStub({
    STRIPE_PRICE_STARTER: "price_starter",
    STRIPE_PRICE_PRO: "price_pro",
    STRIPE_PRICE_BUSINESS: "price_business",
    STRIPE_PRICE_LANGUAGE_SLOT_PACK: "price_lang_slot",
    STRIPE_PRICE_TRANSLATION_USAGE_PACK: "price_translation_pack",
  }) as any;

  const entitlementsRepository = dataSource.getRepository(OrganizationLanguageEntitlementEntity);
  const billingItemsRepository = dataSource.getRepository(BillingAccountSubscriptionItemEntity);
  const organizationsRepository = dataSource.getRepository(OrganizationEntity);
  const billingAccountsRepository = dataSource.getRepository(BillingAccountEntity);
  const billingRepository = dataSource.getRepository(OrganizationBillingEntity);
  const usersRepository = dataSource.getRepository(UserEntity);

  const languageStoreEntitlementService = new LanguageStoreEntitlementService(
    config,
    billingRepository,
    billingItemsRepository,
    entitlementsRepository,
  );
  const organizationBillingService = new OrganizationBillingService(
    billingAccountsRepository,
    billingRepository,
    organizationsRepository,
    languageStoreEntitlementService,
  );

  const suffix = Date.now().toString();
  const owner = await usersRepository.save(
    usersRepository.create({
      email: `entitlement-smoke-${suffix}@local.test`,
      password_hash: "smoke",
      is_active: true,
    }),
  );

  const organizationA = await organizationsRepository.save(
    organizationsRepository.create({
      name: `Entitlement Smoke Org A ${suffix}`,
      slug: `entitlement-smoke-a-${suffix}`,
      is_active: true,
    }),
  );
  const organizationB = await organizationsRepository.save(
    organizationsRepository.create({
      name: `Entitlement Smoke Org B ${suffix}`,
      slug: `entitlement-smoke-b-${suffix}`,
      is_active: true,
    }),
  );
  let billingAccountId: string | null = null;

  try {
    const contextA = await organizationBillingService.createBillingAccountForOrganization(
      organizationA.id,
      {
        ownerUserId: owner.id,
        planKey: "pro",
        billingStatus: "active",
      },
    );
    billingAccountId = contextA.account.id;

    const baselineEntitlementA = await entitlementsRepository.findOne({
      where: { organization_id: organizationA.id },
    });
    assert.ok(baselineEntitlementA);
    assert.equal(baselineEntitlementA.total_additional_language_slots, 2);
    assert.equal(baselineEntitlementA.total_translation_units, 250);

    await organizationBillingService.linkOrganizationToBillingAccount(organizationB.id, contextA.account.id);

    const baselineEntitlementB = await entitlementsRepository.findOne({
      where: { organization_id: organizationB.id },
    });
    assert.ok(baselineEntitlementB);
    assert.equal(baselineEntitlementB.total_additional_language_slots, 2);
    assert.equal(baselineEntitlementB.total_translation_units, 250);

    await languageStoreEntitlementService.reconcileBillingAccount(contextA.account, {
      provider: "stripe",
      providerSubscriptionId: "sub_entitlement_smoke",
      providerPriceId: "price_pro",
      billingStatus: "active",
      currentPeriodStart: new Date("2026-05-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-05-31T23:59:59.000Z"),
      lastProviderSyncAt: new Date("2026-05-14T00:00:00.000Z"),
      subscriptionItems: [
        {
          providerSubscriptionItemId: "si_plan",
          providerPriceId: "price_pro",
          quantity: 1,
        },
        {
          providerSubscriptionItemId: "si_slot_a",
          providerPriceId: "price_lang_slot",
          quantity: 1,
          allocatedOrganizationId: organizationA.id,
        },
        {
          providerSubscriptionItemId: "si_translation_b",
          providerPriceId: "price_translation_pack",
          quantity: 1,
          allocatedOrganizationId: organizationB.id,
        },
      ],
    });

    const savedItems = await billingItemsRepository.find({
      where: { billing_account_id: contextA.account.id },
      order: { provider_subscription_item_id: "ASC" },
    });

    assert.equal(savedItems.find((item) => item.provider_subscription_item_id === "si_slot_a")?.allocated_organization_id, organizationA.id);
    assert.equal(savedItems.find((item) => item.provider_subscription_item_id === "si_translation_b")?.allocated_organization_id, organizationB.id);

    const finalEntitlementA = await entitlementsRepository.findOne({
      where: { organization_id: organizationA.id },
    });
    const finalEntitlementB = await entitlementsRepository.findOne({
      where: { organization_id: organizationB.id },
    });

    assert.ok(finalEntitlementA);
    assert.ok(finalEntitlementB);
    assert.equal(finalEntitlementA.total_additional_language_slots, 3);
    assert.equal(finalEntitlementA.total_translation_units, 250);
    assert.equal(finalEntitlementB.total_additional_language_slots, 2);
    assert.equal(finalEntitlementB.total_translation_units, 500);

    await languageStoreEntitlementService.reconcileBillingAccount(contextA.account, {
      provider: "stripe",
      providerSubscriptionId: "sub_entitlement_smoke",
      providerPriceId: "price_pro",
      billingStatus: "active",
      currentPeriodStart: new Date("2026-05-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-05-31T23:59:59.000Z"),
      lastProviderSyncAt: new Date("2026-05-15T00:00:00.000Z"),
      subscriptionItems: [
        {
          providerSubscriptionItemId: "si_plan",
          providerPriceId: "price_pro",
          quantity: 1,
        },
        {
          providerSubscriptionItemId: "si_slot_a",
          providerPriceId: "price_lang_slot",
          quantity: 1,
          allocatedOrganizationId: organizationB.id,
        },
      ],
    });

    const reprojectedItems = await billingItemsRepository.find({
      where: { billing_account_id: contextA.account.id },
      order: { provider_subscription_item_id: "ASC" },
    });
    const reassignedSlot = reprojectedItems.find((item) => item.provider_subscription_item_id === "si_slot_a");
    const staleTranslationPack = reprojectedItems.find((item) => item.provider_subscription_item_id === "si_translation_b");

    assert.equal(reassignedSlot?.allocated_organization_id, organizationB.id);
    assert.equal(reassignedSlot?.is_active, true);
    assert.equal(staleTranslationPack?.is_active, false);
    assert.equal(staleTranslationPack?.quantity, 0);

    const reprojectedEntitlementA = await entitlementsRepository.findOne({
      where: { organization_id: organizationA.id },
    });
    const reprojectedEntitlementB = await entitlementsRepository.findOne({
      where: { organization_id: organizationB.id },
    });

    assert.ok(reprojectedEntitlementA);
    assert.ok(reprojectedEntitlementB);
    assert.equal(reprojectedEntitlementA.total_additional_language_slots, 2);
    assert.equal(reprojectedEntitlementA.total_translation_units, 250);
    assert.equal(reprojectedEntitlementB.total_additional_language_slots, 3);
    assert.equal(reprojectedEntitlementB.total_translation_units, 250);

    console.log("Language Store entitlement reprojection smoke passed.");
  } finally {
    if (billingAccountId) {
      await billingItemsRepository.delete({ billing_account_id: billingAccountId });
      await entitlementsRepository.delete({ billing_account_id: billingAccountId });
      await billingRepository.delete({ billing_account_id: billingAccountId });
      await billingAccountsRepository.delete({ id: billingAccountId });
    }
    await organizationsRepository.delete({ id: organizationA.id });
    await organizationsRepository.delete({ id: organizationB.id });
    await usersRepository.delete({ id: owner.id });
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
