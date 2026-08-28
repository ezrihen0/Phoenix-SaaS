import "dotenv/config";
import "reflect-metadata";

import assert from "node:assert/strict";
import { HttpException } from "@nestjs/common";
import { DataSource } from "typeorm";

import { OrganizationBillingService } from "../billing/organization-billing.service";
import { LanguageStoreEntitlementService } from "../billing/language-store-entitlement.service";
import { DocumentPricingService } from "../crm/document-pricing.service";
import { DocumentSnapshotService } from "../crm/document-snapshot.service";
import type { DocumentLineItemInput } from "../crm/validation";
import { CustomerOutputTranslationService } from "../language-store/customer-output-translation.service";
import type { CustomerOutputTranslationProvider } from "../language-store/customer-output-translation.provider";
import { LanguageStoreService } from "../language-store/language-store.service";
import { BillingAccountEntity } from "./entities/billing-account.entity";
import { BillingAccountSubscriptionItemEntity } from "./entities/billing-account-subscription-item.entity";
import { CustomerEntity } from "./entities/customer.entity";
import { CustomerOutputTranslationRecordEntity } from "./entities/customer-output-translation-record.entity";
import { InvoiceEntity } from "./entities/invoice.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { JobEntity } from "./entities/job.entity";
import { OrganizationBillingEntity } from "./entities/organization-billing.entity";
import { OrganizationEnabledLanguageEntity } from "./entities/organization-enabled-language.entity";
import { OrganizationEntity } from "./entities/organization.entity";
import { OrganizationLanguageEntitlementEntity } from "./entities/organization-language-entitlement.entity";
import { PricebookBundleEntity } from "./entities/pricebook-bundle.entity";
import { PricebookBundleItemEntity } from "./entities/pricebook-bundle-item.entity";
import { PricebookItemEntity } from "./entities/pricebook-item.entity";
import { QuoteEntity } from "./entities/quote.entity";
import { QuoteLineItemEntity } from "./entities/quote-line-item.entity";
import { TranslationUsageLedgerEntity } from "./entities/translation-usage-ledger.entity";
import { UserEntity } from "./entities/user.entity";
import { UserOrganizationLanguagePreferenceEntity } from "./entities/user-organization-language-preference.entity";
import { buildDataSourceOptions } from "./typeorm.config";

class ConfigStub {
  get() {
    return undefined;
  }
}

class StableProvider implements CustomerOutputTranslationProvider {
  async translateToEnglish(input: { sourceText: string }) {
    return {
      translatedText: `English: ${input.sourceText}`,
      providerKey: "smoke",
      providerModel: "stable-provider",
      providerRequestId: "stable-request",
    };
  }
}

class AlternateProvider implements CustomerOutputTranslationProvider {
  async translateToEnglish(input: { sourceText: string }) {
    return {
      translatedText: `Alternate English: ${input.sourceText}`,
      providerKey: "smoke",
      providerModel: "alternate-provider",
      providerRequestId: "alternate-request",
    };
  }
}

function extractErrorCode(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse() as { error?: { code?: string; message?: string } };
    return response?.error?.code ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function expectApiError(
  expectedCodes: string[],
  run: () => Promise<unknown>,
) {
  try {
    await run();
    assert.fail("Expected API rejection but call succeeded.");
  } catch (error) {
    const code = extractErrorCode(error);
    assert.ok(expectedCodes.includes(code), `Expected ${expectedCodes.join(", ")}, received ${code}`);
  }
}

function createCustomerInput(organizationId: string, token: string) {
  return {
    organization_id: organizationId,
    external_client_number: null,
    full_name: `Snapshot Safety Customer ${token}`,
    email: `${token}@local.test`,
    company_name: null,
    service_address_line_1: "100 Main Street",
    service_address_line_2: null,
    service_city: "Denver",
    service_state_or_region: "CO",
    service_postal_code: "80014",
    phone: "555-0100",
    legacy_created_at: null,
    source: "website" as const,
    preferred_service_type: "inspection" as const,
    notes: null,
  };
}

function createJobInput(organizationId: string, customerId: string, token: string) {
  return {
    organization_id: organizationId,
    customer_id: customerId,
    service_id: null,
    assigned_technician_id: null,
    title: `Snapshot Safety Job ${token}`,
    description: null,
    lead_source: "website" as const,
    requested_service_type: "inspection" as const,
    job_type: "inspection" as const,
    status: "scheduled" as const,
    service_address_line_1: "100 Main Street",
    service_address_line_2: null,
    service_city: "Denver",
    service_state_or_region: "CO",
    service_postal_code: "80014",
    scheduled_for: null,
    scheduled_window: null,
    requested_at: new Date(),
    on_the_way_at: null,
    started_at: null,
    completed_at: null,
    paid_at: null,
    cancellation_reason: null,
    cancelled_at: null,
    cancelled_by: null,
    created_by_auth_user_id: null,
    updated_by_auth_user_id: null,
  };
}

async function main() {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  const organizationsRepository = dataSource.getRepository(OrganizationEntity);
  const usersRepository = dataSource.getRepository(UserEntity);
  const customersRepository = dataSource.getRepository(CustomerEntity);
  const jobsRepository = dataSource.getRepository(JobEntity);
  const quotesRepository = dataSource.getRepository(QuoteEntity);
  const invoicesRepository = dataSource.getRepository(InvoiceEntity);
  const quoteLineItemsRepository = dataSource.getRepository(QuoteLineItemEntity);
  const invoiceLineItemsRepository = dataSource.getRepository(InvoiceLineItemEntity);
  const enabledLanguagesRepository = dataSource.getRepository(OrganizationEnabledLanguageEntity);
  const entitlementsRepository = dataSource.getRepository(OrganizationLanguageEntitlementEntity);
  const translationRecordsRepository = dataSource.getRepository(CustomerOutputTranslationRecordEntity);
  const translationLedgerRepository = dataSource.getRepository(TranslationUsageLedgerEntity);
  const billingAccountsRepository = dataSource.getRepository(BillingAccountEntity);
  const billingAccountItemsRepository = dataSource.getRepository(BillingAccountSubscriptionItemEntity);
  const organizationBillingRepository = dataSource.getRepository(OrganizationBillingEntity);
  const preferencesRepository = dataSource.getRepository(UserOrganizationLanguagePreferenceEntity);

  const languageStoreEntitlementService = new LanguageStoreEntitlementService(
    new ConfigStub() as any,
    organizationBillingRepository,
    dataSource.getRepository(BillingAccountSubscriptionItemEntity),
    entitlementsRepository,
  );
  const organizationBillingService = new OrganizationBillingService(
    billingAccountsRepository,
    organizationBillingRepository,
    organizationsRepository,
    languageStoreEntitlementService,
  );
  const languageStoreService = new LanguageStoreService(
    organizationBillingService,
    enabledLanguagesRepository,
    entitlementsRepository,
    preferencesRepository,
  );
  const translationService = new CustomerOutputTranslationService(
    dataSource,
    languageStoreService,
    organizationBillingService,
    new StableProvider(),
    translationRecordsRepository,
    translationLedgerRepository,
  );
  const alternateTranslationService = new CustomerOutputTranslationService(
    dataSource,
    languageStoreService,
    organizationBillingService,
    new AlternateProvider(),
    translationRecordsRepository,
    translationLedgerRepository,
  );
  const documentSnapshotService = new DocumentSnapshotService(
    invoiceLineItemsRepository,
    quoteLineItemsRepository,
    dataSource.getRepository(PricebookItemEntity),
    dataSource.getRepository(PricebookBundleEntity),
    dataSource.getRepository(PricebookBundleItemEntity),
    new DocumentPricingService(),
    translationService,
  );

  const token = Date.now().toString();
  const owner = await usersRepository.save(
    usersRepository.create({
      email: `snapshot-safety-smoke-${token}@local.test`,
      password_hash: "smoke",
      is_active: true,
    }),
  );

  const organizationA = await organizationsRepository.save(
    organizationsRepository.create({
      name: `Snapshot Safety Org A ${token}`,
      slug: `snapshot-safety-a-${token}`,
      is_active: true,
    }),
  );
  const organizationB = await organizationsRepository.save(
    organizationsRepository.create({
      name: `Snapshot Safety Org B ${token}`,
      slug: `snapshot-safety-b-${token}`,
      is_active: true,
    }),
  );

  let billingAccountId: string | null = null;
  let quoteAId: string | null = null;
  let quoteBId: string | null = null;
  let invoiceAId: string | null = null;

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

    const customerA = await customersRepository.save(
      customersRepository.create(createCustomerInput(organizationA.id, `${token}-a`)),
    );
    const secondCustomerA = await customersRepository.save(
      customersRepository.create(createCustomerInput(organizationA.id, `${token}-b`)),
    );
    const jobA = await jobsRepository.save(
      jobsRepository.create(createJobInput(organizationA.id, customerA.id, `${token}-a`)),
    );
    const jobB = await jobsRepository.save(
      jobsRepository.create(createJobInput(organizationA.id, secondCustomerA.id, `${token}-b`)),
    );

    const quoteA = await quotesRepository.save(
      quotesRepository.create({
        job_id: jobA.id,
        organization_id: organizationA.id,
        description: "Quote A",
        price_cents: 15000,
        subtotal_cents: 15000,
        tax_rate_bps_snapshot: 0,
        tax_cents: 0,
        total_cents: 15000,
        status: "draft",
        sent_at: null,
        approved_at: null,
        approval_requested_at: null,
        signature_requested_at: null,
        signed_at: null,
        signed_by_name: null,
      }),
    );
    quoteAId = quoteA.id;
    const invoiceA = await invoicesRepository.save(
      invoicesRepository.create({
        job_id: jobA.id,
        organization_id: organizationA.id,
        description: "Invoice A",
        amount_cents: 15000,
        subtotal_cents: 15000,
        tax_rate_bps_snapshot: 0,
        tax_cents: 0,
        total_cents: 15000,
        status: "unpaid",
        issued_at: new Date("2026-05-14T00:00:00.000Z"),
        paid_at: null,
        approval_requested_at: null,
        approved_at: null,
        signature_requested_at: null,
        signed_at: null,
        signed_by_name: null,
      }),
    );
    invoiceAId = invoiceA.id;
    const quoteB = await quotesRepository.save(
      quotesRepository.create({
        job_id: jobB.id,
        organization_id: organizationA.id,
        description: "Quote B",
        price_cents: 5000,
        subtotal_cents: 5000,
        tax_rate_bps_snapshot: 0,
        tax_cents: 0,
        total_cents: 5000,
        status: "draft",
        sent_at: null,
        approved_at: null,
        approval_requested_at: null,
        signature_requested_at: null,
        signed_at: null,
        signed_by_name: null,
      }),
    );
    quoteBId = quoteB.id;

    const quoteNameDraft = await translationService.generateDraft({
      organizationId: organizationA.id,
      actorUserId: owner.id,
      surfaceKey: "estimate_line_item_name",
      sourceLanguageCode: "es",
      sourceText: "Limpieza de chimenea",
      attachment: {
        documentKind: "quote",
        documentId: quoteA.id,
        documentLineKey: "quote-line-1",
        fieldKey: "name",
      },
    });
    const quoteNameFinal = await translationService.finalizeDraft({
      organizationId: organizationA.id,
      actorUserId: owner.id,
      recordId: quoteNameDraft.record.id,
      finalText: "Chimney Cleaning",
    });
    const quoteDescriptionDraft = await translationService.generateDraft({
      organizationId: organizationA.id,
      actorUserId: owner.id,
      surfaceKey: "estimate_line_item_description",
      sourceLanguageCode: "es",
      sourceText: "Servicio completo de limpieza",
      attachment: {
        documentKind: "quote",
        documentId: quoteA.id,
        documentLineKey: "quote-line-1",
        fieldKey: "description",
      },
    });
    const quoteDescriptionFinal = await translationService.finalizeDraft({
      organizationId: organizationA.id,
      actorUserId: owner.id,
      recordId: quoteDescriptionDraft.record.id,
      finalText: "Full cleaning service",
    });

    const invoiceNameDraft = await translationService.generateDraft({
      organizationId: organizationA.id,
      actorUserId: owner.id,
      surfaceKey: "invoice_line_item_name",
      sourceLanguageCode: "es",
      sourceText: "Reparacion de tapa",
      attachment: {
        documentKind: "invoice",
        documentId: invoiceA.id,
        documentLineKey: "invoice-line-1",
        fieldKey: "name",
      },
    });
    const invoiceNameFinal = await translationService.finalizeDraft({
      organizationId: organizationA.id,
      actorUserId: owner.id,
      recordId: invoiceNameDraft.record.id,
      finalText: "Cap Repair",
    });
    const invoiceDescriptionDraft = await translationService.generateDraft({
      organizationId: organizationA.id,
      actorUserId: owner.id,
      surfaceKey: "invoice_line_item_description",
      sourceLanguageCode: "es",
      sourceText: "Ajuste y sellado completo",
      attachment: {
        documentKind: "invoice",
        documentId: invoiceA.id,
        documentLineKey: "invoice-line-1",
        fieldKey: "description",
      },
    });
    const invoiceDescriptionFinal = await translationService.finalizeDraft({
      organizationId: organizationA.id,
      actorUserId: owner.id,
      recordId: invoiceDescriptionDraft.record.id,
      finalText: "Full adjustment and sealing",
    });

    const quoteDrafts = await documentSnapshotService.buildLineDrafts(
      [
        {
          kind: "manual",
          documentLineKey: "quote-line-1",
          name: "Limpieza de chimenea",
          description: "Servicio completo de limpieza",
          quantity: "1",
          unitPriceCents: 15000,
          sortOrder: 0,
          nameTranslationRecordId: quoteNameFinal.record.id,
          descriptionTranslationRecordId: quoteDescriptionFinal.record.id,
        } satisfies DocumentLineItemInput,
      ],
      {
        organizationId: organizationA.id,
        documentKind: "quote",
        documentId: quoteA.id,
      },
    );
    const invoiceDrafts = await documentSnapshotService.buildLineDrafts(
      [
        {
          kind: "manual",
          documentLineKey: "invoice-line-1",
          name: "Reparacion de tapa",
          description: "Ajuste y sellado completo",
          quantity: "1",
          unitPriceCents: 15000,
          sortOrder: 0,
          nameTranslationRecordId: invoiceNameFinal.record.id,
          descriptionTranslationRecordId: invoiceDescriptionFinal.record.id,
        } satisfies DocumentLineItemInput,
      ],
      {
        organizationId: organizationA.id,
        documentKind: "invoice",
        documentId: invoiceA.id,
      },
    );

    await documentSnapshotService.replaceQuoteLineItems(quoteA.id, quoteDrafts);
    await documentSnapshotService.replaceInvoiceLineItems(invoiceA.id, invoiceDrafts);

    const persistedQuoteLine = await quoteLineItemsRepository.findOne({
      where: {
        quote_id: quoteA.id,
        document_line_key: "quote-line-1",
      },
    });
    const persistedInvoiceLine = await invoiceLineItemsRepository.findOne({
      where: {
        invoice_id: invoiceA.id,
        document_line_key: "invoice-line-1",
      },
    });

    assert.ok(persistedQuoteLine);
    assert.ok(persistedInvoiceLine);
    assert.equal(persistedQuoteLine.name_snapshot, "Chimney Cleaning");
    assert.equal(persistedQuoteLine.description_snapshot, "Full cleaning service");
    assert.equal(persistedInvoiceLine.name_snapshot, "Cap Repair");
    assert.equal(persistedInvoiceLine.description_snapshot, "Full adjustment and sealing");

    const draftOnlyRecord = await translationService.generateDraft({
      organizationId: organizationA.id,
      actorUserId: owner.id,
      surfaceKey: "estimate_line_item_name",
      sourceLanguageCode: "es",
      sourceText: "Borrador solamente",
      attachment: {
        documentKind: "quote",
        documentId: quoteA.id,
        documentLineKey: "quote-line-draft",
        fieldKey: "name",
      },
    });

    await expectApiError(["translation_record_not_found"], () =>
      documentSnapshotService.buildLineDrafts(
        [
          {
            kind: "manual",
            documentLineKey: "quote-line-draft",
            name: "Borrador solamente",
            description: null,
            quantity: "1",
            unitPriceCents: 1000,
            sortOrder: 1,
            nameTranslationRecordId: draftOnlyRecord.record.id,
          } satisfies DocumentLineItemInput,
        ],
        {
          organizationId: organizationA.id,
          documentKind: "quote",
          documentId: quoteA.id,
        },
      ));

    const foreignOrgDraft = await translationService.generateDraft({
      organizationId: organizationB.id,
      actorUserId: owner.id,
      surfaceKey: "estimate_line_item_name",
      sourceLanguageCode: "pl",
      sourceText: "Czyszczenie komina",
      attachment: {
        documentKind: "quote",
        documentId: quoteA.id,
        documentLineKey: "quote-line-foreign-org",
        fieldKey: "name",
      },
    });
    const foreignOrgFinal = await translationService.finalizeDraft({
      organizationId: organizationB.id,
      actorUserId: owner.id,
      recordId: foreignOrgDraft.record.id,
      finalText: "Foreign org translation",
    });

    await expectApiError(["translation_record_not_found"], () =>
      documentSnapshotService.buildLineDrafts(
        [
          {
            kind: "manual",
            documentLineKey: "quote-line-foreign-org",
            name: "Czyszczenie komina",
            description: null,
            quantity: "1",
            unitPriceCents: 1000,
            sortOrder: 2,
            nameTranslationRecordId: foreignOrgFinal.record.id,
          } satisfies DocumentLineItemInput,
        ],
        {
          organizationId: organizationA.id,
          documentKind: "quote",
          documentId: quoteA.id,
        },
      ));

    const otherQuoteDraft = await translationService.generateDraft({
      organizationId: organizationA.id,
      actorUserId: owner.id,
      surfaceKey: "estimate_line_item_name",
      sourceLanguageCode: "es",
      sourceText: "Otro documento",
      attachment: {
        documentKind: "quote",
        documentId: quoteB.id,
        documentLineKey: "quote-line-1",
        fieldKey: "name",
      },
    });
    const otherQuoteFinal = await translationService.finalizeDraft({
      organizationId: organizationA.id,
      actorUserId: owner.id,
      recordId: otherQuoteDraft.record.id,
      finalText: "Other document translation",
    });

    await expectApiError(["translation_record_not_found"], () =>
      documentSnapshotService.buildLineDrafts(
        [
          {
            kind: "manual",
            documentLineKey: "quote-line-1",
            name: "Otro documento",
            description: null,
            quantity: "1",
            unitPriceCents: 1000,
            sortOrder: 3,
            nameTranslationRecordId: otherQuoteFinal.record.id,
          } satisfies DocumentLineItemInput,
        ],
        {
          organizationId: organizationA.id,
          documentKind: "quote",
          documentId: quoteA.id,
        },
      ));

    await expectApiError(["translation_record_not_found"], () =>
      documentSnapshotService.buildLineDrafts(
        [
          {
            kind: "manual",
            documentLineKey: "quote-line-1",
            name: "Servicio completo de limpieza",
            description: null,
            quantity: "1",
            unitPriceCents: 1000,
            sortOrder: 4,
            nameTranslationRecordId: quoteDescriptionFinal.record.id,
          } satisfies DocumentLineItemInput,
        ],
        {
          organizationId: organizationA.id,
          documentKind: "quote",
          documentId: quoteA.id,
        },
      ));

    await expectApiError(["translation_record_source_mismatch"], () =>
      documentSnapshotService.buildLineDrafts(
        [
          {
            kind: "manual",
            documentLineKey: "quote-line-1",
            name: "Texto cambiado despues",
            description: null,
            quantity: "1",
            unitPriceCents: 1000,
            sortOrder: 5,
            nameTranslationRecordId: quoteNameFinal.record.id,
          } satisfies DocumentLineItemInput,
        ],
        {
          organizationId: organizationA.id,
          documentKind: "quote",
          documentId: quoteA.id,
        },
      ));

    await alternateTranslationService.finalizeDraft({
      organizationId: organizationA.id,
      actorUserId: owner.id,
      recordId: (await alternateTranslationService.generateDraft({
        organizationId: organizationA.id,
        actorUserId: owner.id,
        surfaceKey: "estimate_line_item_name",
        sourceLanguageCode: "es",
        sourceText: "Limpieza de chimenea",
        attachment: {
          documentKind: "quote",
          documentId: quoteA.id,
          documentLineKey: "quote-line-1",
          fieldKey: "name",
        },
      })).record.id,
      finalText: "Later translation should not rewrite snapshot",
    });

    await languageStoreService.saveUserOrganizationLanguagePreference({
      organizationId: organizationA.id,
      userId: owner.id,
      languageCode: "es",
    });
    await languageStoreService.deactivateOrganizationLanguage({
      organizationId: organizationA.id,
      canManageLanguages: true,
      languageCode: "es",
    });

    const fallbackPreference = await languageStoreService.getUserOrganizationLanguagePreference(
      organizationA.id,
      owner.id,
    );
    assert.equal(fallbackPreference.effective_language_code, "en");
    assert.equal(fallbackPreference.fallback_to_default, true);

    const quoteLineAfterChanges = await quoteLineItemsRepository.findOne({
      where: {
        quote_id: quoteA.id,
        document_line_key: "quote-line-1",
      },
    });
    const invoiceLineAfterChanges = await invoiceLineItemsRepository.findOne({
      where: {
        invoice_id: invoiceA.id,
        document_line_key: "invoice-line-1",
      },
    });

    assert.ok(quoteLineAfterChanges);
    assert.ok(invoiceLineAfterChanges);
    assert.equal(quoteLineAfterChanges.name_snapshot, "Chimney Cleaning");
    assert.equal(quoteLineAfterChanges.description_snapshot, "Full cleaning service");
    assert.equal(invoiceLineAfterChanges.name_snapshot, "Cap Repair");
    assert.equal(invoiceLineAfterChanges.description_snapshot, "Full adjustment and sealing");

    console.log("Document snapshot translation safety smoke passed.");
  } finally {
    if (quoteAId) {
      await quoteLineItemsRepository.delete({ quote_id: quoteAId });
    }
    if (quoteBId) {
      await quoteLineItemsRepository.delete({ quote_id: quoteBId });
    }
    if (invoiceAId) {
      await invoiceLineItemsRepository.delete({ invoice_id: invoiceAId });
    }
    if (quoteAId) {
      await quotesRepository.delete({ id: quoteAId });
    }
    if (quoteBId) {
      await quotesRepository.delete({ id: quoteBId });
    }
    if (invoiceAId) {
      await invoicesRepository.delete({ id: invoiceAId });
    }
    await translationLedgerRepository.delete({ organization_id: organizationA.id });
    await translationLedgerRepository.delete({ organization_id: organizationB.id });
    await translationRecordsRepository.delete({ organization_id: organizationA.id });
    await translationRecordsRepository.delete({ organization_id: organizationB.id });
    await preferencesRepository.delete({ organization_id: organizationA.id });
    await preferencesRepository.delete({ organization_id: organizationB.id });
    await enabledLanguagesRepository.delete({ organization_id: organizationA.id });
    await enabledLanguagesRepository.delete({ organization_id: organizationB.id });
    await entitlementsRepository.delete({ organization_id: organizationA.id });
    await entitlementsRepository.delete({ organization_id: organizationB.id });
    await jobsRepository.delete({ organization_id: organizationA.id });
    await customersRepository.delete({ organization_id: organizationA.id });
    await organizationBillingRepository.delete({ organization_id: organizationA.id });
    await organizationBillingRepository.delete({ organization_id: organizationB.id });
    if (billingAccountId) {
      await billingAccountItemsRepository.delete({ billing_account_id: billingAccountId });
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
