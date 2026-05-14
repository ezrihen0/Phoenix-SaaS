import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { HttpException } from "@nestjs/common";
import { DataSource } from "typeorm";

import { OrganizationBillingService } from "../billing/organization-billing.service";
import { buildDataSourceOptions } from "./typeorm.config";
import { BillingAccountEntity } from "./entities/billing-account.entity";
import { CustomerOutputTranslationRecordEntity } from "./entities/customer-output-translation-record.entity";
import { OrganizationBillingEntity } from "./entities/organization-billing.entity";
import { OrganizationEnabledLanguageEntity } from "./entities/organization-enabled-language.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationLanguageEntitlementEntity } from "./entities/organization-language-entitlement.entity";
import { TranslationUsageLedgerEntity } from "./entities/translation-usage-ledger.entity";
import { UserEntity } from "./entities/user.entity";
import { UserOrganizationLanguagePreferenceEntity } from "./entities/user-organization-language-preference.entity";
import { GeminiCustomerOutputTranslationProvider } from "../language-store/customer-output-translation.gemini-provider";
import {
  calculateTranslationUnits,
  CustomerOutputTranslationService,
} from "../language-store/customer-output-translation.service";
import type { CustomerOutputTranslationProvider } from "../language-store/customer-output-translation.provider";
import { LanguageStoreService } from "../language-store/language-store.service";

class SmokeTranslationProvider implements CustomerOutputTranslationProvider {
  async translateToEnglish(input: { sourceText: string }) {
    return {
      translatedText: `English: ${input.sourceText}`,
      providerKey: "smoke",
      providerModel: "smoke-provider",
      providerRequestId: "smoke-request",
    };
  }
}

class EmptyConfigService {
  get() {
    return undefined;
  }
}

async function main() {
  assert.equal(calculateTranslationUnits(0), 0);
  assert.equal(calculateTranslationUnits(1), 1);
  assert.equal(calculateTranslationUnits(1000), 1);
  assert.equal(calculateTranslationUnits(1001), 2);

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  const organizationsRepository = dataSource.getRepository(OrganizationEntity);
  const usersRepository = dataSource.getRepository(UserEntity);
  const enabledLanguagesRepository = dataSource.getRepository(OrganizationEnabledLanguageEntity);
  const entitlementsRepository = dataSource.getRepository(OrganizationLanguageEntitlementEntity);
  const recordsRepository = dataSource.getRepository(CustomerOutputTranslationRecordEntity);
  const ledgerRepository = dataSource.getRepository(TranslationUsageLedgerEntity);

  const organizationBillingService = new OrganizationBillingService(
    dataSource.getRepository(BillingAccountEntity),
    dataSource.getRepository(OrganizationBillingEntity),
    organizationsRepository,
  );
  const languageStoreService = new LanguageStoreService(
    organizationBillingService,
    enabledLanguagesRepository,
    entitlementsRepository,
    dataSource.getRepository(UserOrganizationLanguagePreferenceEntity),
  );

  const translationService = new CustomerOutputTranslationService(
    dataSource,
    languageStoreService,
    organizationBillingService,
    new SmokeTranslationProvider(),
    recordsRepository,
    ledgerRepository,
  );

  const owner = await usersRepository.save(
    usersRepository.create({
      email: `translation-smoke-${Date.now()}@local.test`,
      password_hash: "smoke",
      is_active: true,
    }),
  );

  const organizationA = await organizationsRepository.save(
    organizationsRepository.create({
      name: `Translation Smoke Org A ${Date.now()}`,
      slug: `translation-smoke-a-${Date.now()}`,
      is_active: true,
    }),
  );
  const organizationB = await organizationsRepository.save(
    organizationsRepository.create({
      name: `Translation Smoke Org B ${Date.now()}`,
      slug: `translation-smoke-b-${Date.now()}`,
      is_active: true,
    }),
  );
  let billingAccountId: string | null = null;

  try {
    const billingContextA = await organizationBillingService.createBillingAccountForOrganization(
      organizationA.id,
      {
        ownerUserId: owner.id,
        planKey: "pro",
        billingStatus: "active",
      },
    );
    billingAccountId = billingContextA.account.id;

    await organizationBillingService.updateBillingAccountFieldsById(billingContextA.account.id, {
      current_period_start: new Date("2026-05-01T00:00:00.000Z"),
      current_period_end: new Date("2026-05-31T23:59:59.000Z"),
    });
    await organizationBillingService.linkOrganizationToBillingAccount(organizationB.id, billingContextA.account.id);

    await entitlementsRepository.save([
      entitlementsRepository.create({
        organization_id: organizationA.id,
        billing_account_id: billingContextA.account.id,
        source_plan_key: "pro",
        billing_status: "active",
        language_store_enabled: true,
        included_additional_language_slots: 2,
        addon_additional_language_slots: 0,
        total_additional_language_slots: 2,
        included_translation_units: 250,
        addon_translation_units: 0,
        total_translation_units: 250,
        last_reconciled_at: new Date(),
      }),
      entitlementsRepository.create({
        organization_id: organizationB.id,
        billing_account_id: billingContextA.account.id,
        source_plan_key: "pro",
        billing_status: "active",
        language_store_enabled: true,
        included_additional_language_slots: 2,
        addon_additional_language_slots: 0,
        total_additional_language_slots: 2,
        included_translation_units: 250,
        addon_translation_units: 0,
        total_translation_units: 250,
        last_reconciled_at: new Date(),
      }),
    ]);

    await enabledLanguagesRepository.save([
      enabledLanguagesRepository.create({
        organization_id: organizationA.id,
        language_code: "es",
        activated_by_user_id: owner.id,
        deactivated_at: null,
      }),
      enabledLanguagesRepository.create({
        organization_id: organizationB.id,
        language_code: "pl",
        activated_by_user_id: owner.id,
        deactivated_at: null,
      }),
    ]);

    const longSpanishSource = "a".repeat(1001);
    const generatedA = await translationService.generateDraft({
      organizationId: organizationA.id,
      actorUserId: owner.id,
      surfaceKey: "estimate_line_item_description",
      sourceLanguageCode: "es",
      sourceText: longSpanishSource,
    });

    assert.equal(generatedA.record.status, "draft");
    assert.equal(generatedA.record.units_consumed, 2);
    assert.equal(generatedA.usage.consumed_translation_units, 2);
    assert.equal(generatedA.usage.remaining_translation_units, 248);

    const finalizedA = await translationService.finalizeDraft({
      organizationId: organizationA.id,
      actorUserId: owner.id,
      recordId: generatedA.record.id,
    });

    assert.equal(finalizedA.record.status, "final");
    assert.equal(finalizedA.usage.consumed_translation_units, 2);

    const generatedB = await translationService.generateDraft({
      organizationId: organizationB.id,
      actorUserId: owner.id,
      surfaceKey: "invoice_line_item_name",
      sourceLanguageCode: "pl",
      sourceText: "piec kominowy",
    });

    assert.equal(generatedB.record.status, "draft");
    assert.equal(generatedB.usage.consumed_translation_units, 1);
    assert.equal(generatedB.usage.remaining_translation_units, 249);

    const persistedARecordCount = await recordsRepository.count({
      where: { organization_id: organizationA.id },
    });
    const persistedBRecordCount = await recordsRepository.count({
      where: { organization_id: organizationB.id },
    });
    const persistedALedgerCount = await ledgerRepository.count({
      where: { organization_id: organizationA.id },
    });
    const persistedBLedgerCount = await ledgerRepository.count({
      where: { organization_id: organizationB.id },
    });

    assert.equal(persistedARecordCount, 1);
    assert.equal(persistedBRecordCount, 1);
    assert.equal(persistedALedgerCount, 1);
    assert.equal(persistedBLedgerCount, 1);

    const missingProviderService = new CustomerOutputTranslationService(
      dataSource,
      languageStoreService,
      organizationBillingService,
      new GeminiCustomerOutputTranslationProvider(new EmptyConfigService() as any),
      recordsRepository,
      ledgerRepository,
    );

    let missingProviderFailedSafely = false;
    try {
      await missingProviderService.generateDraft({
        organizationId: organizationA.id,
        actorUserId: owner.id,
        surfaceKey: "manual_line_text",
        sourceLanguageCode: "es",
        sourceText: "limpieza de chimenea",
      });
    } catch (error) {
      assert.ok(error instanceof HttpException);
      const response = error.getResponse() as {
        error?: {
          code?: string;
        };
      };
      assert.equal(response?.error?.code, "translation_provider_not_configured");
      missingProviderFailedSafely = true;
    }

    assert.equal(missingProviderFailedSafely, true);

    console.log("Language Store translation engine smoke passed.");
  } finally {
    await recordsRepository.delete({ organization_id: organizationA.id });
    await recordsRepository.delete({ organization_id: organizationB.id });
    await ledgerRepository.delete({ organization_id: organizationA.id });
    await ledgerRepository.delete({ organization_id: organizationB.id });
    await enabledLanguagesRepository.delete({ organization_id: organizationA.id });
    await enabledLanguagesRepository.delete({ organization_id: organizationB.id });
    await entitlementsRepository.delete({ organization_id: organizationA.id });
    await entitlementsRepository.delete({ organization_id: organizationB.id });
    await dataSource.getRepository(OrganizationBillingEntity).delete({ organization_id: organizationA.id });
    await dataSource.getRepository(OrganizationBillingEntity).delete({ organization_id: organizationB.id });
    if (billingAccountId) {
      await dataSource.getRepository(BillingAccountEntity).delete({ id: billingAccountId });
    }
    await organizationsRepository.delete({ id: organizationA.id });
    await organizationsRepository.delete({ id: organizationB.id });
    await usersRepository.delete({ id: owner.id });
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
