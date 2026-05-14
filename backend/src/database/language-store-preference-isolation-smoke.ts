import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { HttpException } from "@nestjs/common";
import { DataSource } from "typeorm";

import { LanguageStoreEntitlementService } from "../billing/language-store-entitlement.service";
import { OrganizationBillingService } from "../billing/organization-billing.service";
import { OrganizationEnabledLanguageEntity } from "./entities/organization-enabled-language.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationLanguageEntitlementEntity } from "./entities/organization-language-entitlement.entity";
import { UserEntity } from "./entities/user.entity";
import { UserOrganizationLanguagePreferenceEntity } from "./entities/user-organization-language-preference.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { BillingAccountEntity } from "./entities/billing-account.entity";
import { BillingAccountSubscriptionItemEntity } from "./entities/billing-account-subscription-item.entity";
import { OrganizationBillingEntity } from "./entities/organization-billing.entity";
import { LanguageStoreService } from "../language-store/language-store.service";

class EmptyConfigService {
  get() {
    return undefined;
  }
}

async function main() {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  const organizationsRepository = dataSource.getRepository(OrganizationEntity);
  const usersRepository = dataSource.getRepository(UserEntity);
  const enabledLanguagesRepository = dataSource.getRepository(OrganizationEnabledLanguageEntity);
  const preferencesRepository = dataSource.getRepository(UserOrganizationLanguagePreferenceEntity);
  const entitlementsRepository = dataSource.getRepository(OrganizationLanguageEntitlementEntity);
  const languageStoreEntitlementService = new LanguageStoreEntitlementService(
    new EmptyConfigService() as any,
    dataSource.getRepository(OrganizationBillingEntity),
    dataSource.getRepository(BillingAccountSubscriptionItemEntity),
    entitlementsRepository,
  );
  const organizationBillingService = new OrganizationBillingService(
    dataSource.getRepository(BillingAccountEntity),
    dataSource.getRepository(OrganizationBillingEntity),
    organizationsRepository,
    languageStoreEntitlementService,
  );
  const languageStoreService = new LanguageStoreService(
    organizationBillingService,
    enabledLanguagesRepository,
    entitlementsRepository,
    preferencesRepository,
  );

  const token = Date.now().toString();
  const user = await usersRepository.save(
    usersRepository.create({
      email: `language-preference-smoke-${token}@local.test`,
      password_hash: "smoke",
      is_active: true,
    }),
  );

  const organizationA = await organizationsRepository.save(
    organizationsRepository.create({
      name: `Preference Smoke Org A ${token}`,
      slug: `preference-smoke-a-${token}`,
      is_active: true,
    }),
  );
  const organizationB = await organizationsRepository.save(
    organizationsRepository.create({
      name: `Preference Smoke Org B ${token}`,
      slug: `preference-smoke-b-${token}`,
      is_active: true,
    }),
  );

  try {
    await enabledLanguagesRepository.save([
      enabledLanguagesRepository.create({
        organization_id: organizationA.id,
        language_code: "es",
        activated_by_user_id: user.id,
        deactivated_at: null,
      }),
      enabledLanguagesRepository.create({
        organization_id: organizationB.id,
        language_code: "pl",
        activated_by_user_id: user.id,
        deactivated_at: null,
      }),
    ]);

    const defaultSnapshotA = await languageStoreService.getUserOrganizationLanguagePreference(
      organizationA.id,
      user.id,
    );
    assert.equal(defaultSnapshotA.stored_language_code, null);
    assert.equal(defaultSnapshotA.effective_language_code, "en");
    assert.equal(defaultSnapshotA.fallback_to_default, false);

    const savedSnapshotA = await languageStoreService.saveUserOrganizationLanguagePreference({
      organizationId: organizationA.id,
      userId: user.id,
      languageCode: "es",
    });
    const savedSnapshotB = await languageStoreService.saveUserOrganizationLanguagePreference({
      organizationId: organizationB.id,
      userId: user.id,
      languageCode: "pl",
    });

    assert.equal(savedSnapshotA.stored_language_code, "es");
    assert.equal(savedSnapshotA.effective_language_code, "es");
    assert.equal(savedSnapshotA.fallback_to_default, false);
    assert.equal(savedSnapshotB.stored_language_code, "pl");
    assert.equal(savedSnapshotB.effective_language_code, "pl");
    assert.equal(savedSnapshotB.fallback_to_default, false);

    let crossOrgWriteRejected = false;
    try {
      await languageStoreService.saveUserOrganizationLanguagePreference({
        organizationId: organizationA.id,
        userId: user.id,
        languageCode: "pl",
      });
    } catch (error) {
      assert.ok(error instanceof HttpException);
      const response = error.getResponse() as {
        error?: {
          code?: string;
        };
      };
      assert.equal(response?.error?.code, "language_store_preference_forbidden");
      crossOrgWriteRejected = true;
    }
    assert.equal(crossOrgWriteRejected, true);

    await enabledLanguagesRepository.update(
      {
        organization_id: organizationA.id,
        language_code: "es",
      },
      {
        deactivated_at: new Date(),
      },
    );

    const fallbackSnapshotA = await languageStoreService.getUserOrganizationLanguagePreference(
      organizationA.id,
      user.id,
    );
    const retainedSnapshotB = await languageStoreService.getUserOrganizationLanguagePreference(
      organizationB.id,
      user.id,
    );

    assert.equal(fallbackSnapshotA.stored_language_code, "es");
    assert.equal(fallbackSnapshotA.effective_language_code, "en");
    assert.equal(fallbackSnapshotA.fallback_to_default, true);
    assert.ok(fallbackSnapshotA.fallback_reason);
    assert.equal(retainedSnapshotB.stored_language_code, "pl");
    assert.equal(retainedSnapshotB.effective_language_code, "pl");
    assert.equal(retainedSnapshotB.fallback_to_default, false);

    console.log("Language Store preference isolation smoke passed.");
  } finally {
    await preferencesRepository.delete({ organization_id: organizationA.id });
    await preferencesRepository.delete({ organization_id: organizationB.id });
    await enabledLanguagesRepository.delete({ organization_id: organizationA.id });
    await enabledLanguagesRepository.delete({ organization_id: organizationB.id });
    await organizationsRepository.delete({ id: organizationA.id });
    await organizationsRepository.delete({ id: organizationB.id });
    await usersRepository.delete({ id: user.id });
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
