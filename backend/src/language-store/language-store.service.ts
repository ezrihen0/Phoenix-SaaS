import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { OrganizationBillingService } from "../billing/organization-billing.service";
import { OrganizationEnabledLanguageEntity } from "../database/entities/organization-enabled-language.entity";
import { OrganizationLanguageEntitlementEntity } from "../database/entities/organization-language-entitlement.entity";
import { UserOrganizationLanguagePreferenceEntity } from "../database/entities/user-organization-language-preference.entity";
import {
  getLanguageCatalogEntry,
  isLanguageStoreCatalogCode,
  languageStoreCatalog,
  languageStoreDefaultLanguageCode,
  languageStorePlanBaselines,
  type LanguageCatalogEntry,
  type LanguageStorePlanBaseline,
} from "./language-store.constants";

export type OrganizationLanguageFoundationSnapshot = {
  organization_id: string;
  billing_account_id: string;
  plan_key: string;
  billing_status: string;
  language_store_enabled: boolean;
  included_additional_language_slots: number;
  addon_additional_language_slots: number;
  total_additional_language_slots: number;
  included_translation_units: number;
  addon_translation_units: number;
  total_translation_units: number;
  enabled_languages: LanguageCatalogEntry[];
};

export type UserOrganizationLanguagePreferenceSnapshot = {
  organization_id: string;
  user_id: string;
  stored_language_code: string | null;
  effective_language_code: string;
  effective_language: LanguageCatalogEntry;
  enabled_languages: LanguageCatalogEntry[];
  fallback_to_default: boolean;
  fallback_reason: string | null;
};

export type LanguageStoreCardState = "active" | "available" | "locked" | "slot_full";

export type ProductSurfaceLanguageCard = LanguageCatalogEntry & {
  state: LanguageStoreCardState;
  can_activate: boolean;
  can_deactivate: boolean;
  locked_reason: string | null;
};

export type LanguageStoreProductSurfaceSnapshot = {
  organization_id: string;
  billing_account_id: string;
  plan_key: string;
  billing_status: string;
  language_store_enabled: boolean;
  can_manage_languages: boolean;
  active_additional_language_count: number;
  remaining_additional_language_slots: number;
  included_additional_language_slots: number;
  addon_additional_language_slots: number;
  total_additional_language_slots: number;
  included_translation_units: number;
  addon_translation_units: number;
  total_translation_units: number;
  languages: ProductSurfaceLanguageCard[];
  prompt: {
    kind: "upgrade" | "add_on" | "billing_attention" | null;
    title: string | null;
    message: string | null;
  };
};

type ProductSurfaceInput = {
  organizationId: string;
  canManageLanguages: boolean;
};

type ActivateOrganizationLanguageInput = ProductSurfaceInput & {
  actorUserId: string;
  languageCode: string;
};

type DeactivateOrganizationLanguageInput = ProductSurfaceInput & {
  languageCode: string;
};

type SaveUserOrganizationLanguagePreferenceInput = {
  organizationId: string;
  userId: string;
  languageCode: string;
};

@Injectable()
export class LanguageStoreService {
  constructor(
    private readonly organizationBillingService: OrganizationBillingService,
    @InjectRepository(OrganizationEnabledLanguageEntity)
    private readonly organizationEnabledLanguagesRepository: Repository<OrganizationEnabledLanguageEntity>,
    @InjectRepository(OrganizationLanguageEntitlementEntity)
    private readonly organizationLanguageEntitlementsRepository: Repository<OrganizationLanguageEntitlementEntity>,
    @InjectRepository(UserOrganizationLanguagePreferenceEntity)
    private readonly userOrganizationLanguagePreferencesRepository: Repository<UserOrganizationLanguagePreferenceEntity>,
  ) {}

  listCatalog() {
    return [...languageStoreCatalog];
  }

  getPlanBaseline(planKey: keyof typeof languageStorePlanBaselines): LanguageStorePlanBaseline {
    return languageStorePlanBaselines[planKey];
  }

  async getOrganizationLanguageFoundationSnapshot(
    organizationId: string,
  ): Promise<OrganizationLanguageFoundationSnapshot> {
    const context = await this.organizationBillingService.getOrCreateContextForOrganization(organizationId);
    const entitlement = await this.organizationLanguageEntitlementsRepository.findOne({
      where: {
        organization_id: organizationId,
      },
    });
    const planBaseline = this.getPlanBaseline(context.account.plan_key);
    const enabledLanguages = await this.listEnabledLanguages(organizationId);

    return {
      organization_id: organizationId,
      billing_account_id: context.account.id,
      plan_key: context.account.plan_key,
      billing_status: context.account.billing_status,
      language_store_enabled: entitlement?.language_store_enabled ?? planBaseline.enabled,
      included_additional_language_slots:
        entitlement?.included_additional_language_slots ?? planBaseline.included_additional_language_slots,
      addon_additional_language_slots: entitlement?.addon_additional_language_slots ?? 0,
      total_additional_language_slots:
        entitlement?.total_additional_language_slots ?? planBaseline.included_additional_language_slots,
      included_translation_units: entitlement?.included_translation_units ?? planBaseline.included_translation_units,
      addon_translation_units: entitlement?.addon_translation_units ?? 0,
      total_translation_units: entitlement?.total_translation_units ?? planBaseline.included_translation_units,
      enabled_languages: enabledLanguages,
    };
  }

  async listEnabledLanguagesForOrganization(organizationId: string) {
    return this.listEnabledLanguages(organizationId);
  }

  async getUserOrganizationLanguagePreference(
    organizationId: string,
    userId: string,
  ): Promise<UserOrganizationLanguagePreferenceSnapshot> {
    const enabledLanguages = await this.listEnabledLanguages(organizationId);
    const enabledLanguageCodes = new Set(enabledLanguages.map((language) => language.code));
    const preference = await this.userOrganizationLanguagePreferencesRepository.findOne({
      where: {
        organization_id: organizationId,
        user_id: userId,
      },
    });

    const storedLanguageCode = preference?.language_code ?? null;
    const shouldFallback = Boolean(
      storedLanguageCode
      && storedLanguageCode !== languageStoreDefaultLanguageCode
      && !enabledLanguageCodes.has(storedLanguageCode),
    );
    const effectiveLanguageCode = shouldFallback
      ? languageStoreDefaultLanguageCode
      : storedLanguageCode ?? languageStoreDefaultLanguageCode;
    const effectiveLanguage = getLanguageCatalogEntry(effectiveLanguageCode) ?? getDefaultLanguageCatalogEntry();

    return {
      organization_id: organizationId,
      user_id: userId,
      stored_language_code: storedLanguageCode,
      effective_language_code: effectiveLanguageCode,
      effective_language: effectiveLanguage,
      enabled_languages: enabledLanguages,
      fallback_to_default: shouldFallback,
      fallback_reason: shouldFallback
        ? "The previously selected language is not enabled for the active workspace. English is being used instead."
        : null,
    };
  }

  async saveUserOrganizationLanguagePreference(
    input: SaveUserOrganizationLanguagePreferenceInput,
  ): Promise<UserOrganizationLanguagePreferenceSnapshot> {
    const enabledLanguages = await this.listEnabledLanguages(input.organizationId);
    const enabledLanguageCodes = new Set(enabledLanguages.map((language) => language.code));
    const languageCode = input.languageCode.trim().toLowerCase();

    if (!isLanguageStoreCatalogCode(languageCode) || !enabledLanguageCodes.has(languageCode)) {
      apiError(
        403,
        "language_store_preference_forbidden",
        "Only languages enabled for the active workspace can be selected.",
      );
    }

    const existing = await this.userOrganizationLanguagePreferencesRepository.findOne({
      where: {
        organization_id: input.organizationId,
        user_id: input.userId,
      },
    });

    const entity = existing ?? this.userOrganizationLanguagePreferencesRepository.create({
      organization_id: input.organizationId,
      user_id: input.userId,
    });
    entity.language_code = languageCode;

    await this.userOrganizationLanguagePreferencesRepository.save(entity);
    return this.getUserOrganizationLanguagePreference(input.organizationId, input.userId);
  }

  async getProductSurfaceSnapshot(
    input: ProductSurfaceInput,
  ): Promise<LanguageStoreProductSurfaceSnapshot> {
    const foundation = await this.getOrganizationLanguageFoundationSnapshot(input.organizationId);
    const enabledLanguageCodes = new Set(foundation.enabled_languages.map((language) => language.code));
    const activeAdditionalLanguageCount = foundation.enabled_languages.filter((language) =>
      language.code !== languageStoreDefaultLanguageCode && language.consumes_paid_slot).length;
    const remainingAdditionalLanguageSlots = Math.max(
      foundation.total_additional_language_slots - activeAdditionalLanguageCount,
      0,
    );
    const billingAllowsChanges = foundation.billing_status === "active" || foundation.billing_status === "trialing";

    const languages = this.listCatalog().map((language) => {
      const isActive = enabledLanguageCodes.has(language.code);
      if (language.code === languageStoreDefaultLanguageCode) {
        return {
          ...language,
          state: "active" as const,
          can_activate: false,
          can_deactivate: false,
          locked_reason: "English is always available and does not consume a paid slot.",
        };
      }

      if (isActive) {
        return {
          ...language,
          state: "active" as const,
          can_activate: false,
          can_deactivate: input.canManageLanguages,
          locked_reason: null,
        };
      }

      if (!foundation.language_store_enabled) {
        return {
          ...language,
          state: "locked" as const,
          can_activate: false,
          can_deactivate: false,
          locked_reason: "Upgrade this workspace to a plan that includes Language Store.",
        };
      }

      if (!billingAllowsChanges) {
        return {
          ...language,
          state: "locked" as const,
          can_activate: false,
          can_deactivate: false,
          locked_reason: "Billing must be active or trialing before additional languages can be changed.",
        };
      }

      if (language.consumes_paid_slot && remainingAdditionalLanguageSlots <= 0) {
        return {
          ...language,
          state: "slot_full" as const,
          can_activate: false,
          can_deactivate: false,
          locked_reason: "All additional language slots are currently in use.",
        };
      }

      return {
        ...language,
        state: "available" as const,
        can_activate: input.canManageLanguages,
        can_deactivate: false,
        locked_reason: input.canManageLanguages ? null : "Only owners and admins can activate organization languages.",
      };
    });

    return {
      organization_id: foundation.organization_id,
      billing_account_id: foundation.billing_account_id,
      plan_key: foundation.plan_key,
      billing_status: foundation.billing_status,
      language_store_enabled: foundation.language_store_enabled,
      can_manage_languages: input.canManageLanguages,
      active_additional_language_count: activeAdditionalLanguageCount,
      remaining_additional_language_slots: remainingAdditionalLanguageSlots,
      included_additional_language_slots: foundation.included_additional_language_slots,
      addon_additional_language_slots: foundation.addon_additional_language_slots,
      total_additional_language_slots: foundation.total_additional_language_slots,
      included_translation_units: foundation.included_translation_units,
      addon_translation_units: foundation.addon_translation_units,
      total_translation_units: foundation.total_translation_units,
      languages,
      prompt: buildPrompt({
        languageStoreEnabled: foundation.language_store_enabled,
        billingStatus: foundation.billing_status,
        remainingAdditionalLanguageSlots,
      }),
    };
  }

  async activateOrganizationLanguage(
    input: ActivateOrganizationLanguageInput,
  ): Promise<LanguageStoreProductSurfaceSnapshot> {
    assertLanguageCanBeManaged(input.languageCode);

    const snapshot = await this.getProductSurfaceSnapshot(input);
    const existing = await this.organizationEnabledLanguagesRepository.findOne({
      where: {
        organization_id: input.organizationId,
        language_code: input.languageCode,
      },
    });

    if (existing?.deactivated_at === null) {
      return snapshot;
    }

    assertLanguageActivationAllowed(snapshot, input.languageCode);

    const entity = existing ?? this.organizationEnabledLanguagesRepository.create({
      organization_id: input.organizationId,
      language_code: input.languageCode,
    });
    entity.activated_by_user_id = input.actorUserId;
    entity.deactivated_at = null;

    await this.organizationEnabledLanguagesRepository.save(entity);
    return this.getProductSurfaceSnapshot(input);
  }

  async deactivateOrganizationLanguage(
    input: DeactivateOrganizationLanguageInput,
  ): Promise<LanguageStoreProductSurfaceSnapshot> {
    assertLanguageCanBeManaged(input.languageCode);

    const existing = await this.organizationEnabledLanguagesRepository.findOne({
      where: {
        organization_id: input.organizationId,
        language_code: input.languageCode,
        deactivated_at: IsNull(),
      },
    });

    if (!existing) {
      return this.getProductSurfaceSnapshot(input);
    }

    existing.deactivated_at = new Date();
    await this.organizationEnabledLanguagesRepository.save(existing);
    return this.getProductSurfaceSnapshot(input);
  }

  private async listEnabledLanguages(organizationId: string) {
    const rows = await this.organizationEnabledLanguagesRepository.find({
      where: {
        organization_id: organizationId,
        deactivated_at: IsNull(),
      },
      order: {
        created_at: "ASC",
      },
    });

    const mapped = rows
      .map((row) => getLanguageCatalogEntry(row.language_code))
      .filter((language): language is LanguageCatalogEntry => Boolean(language));

    return [getDefaultLanguageCatalogEntry(), ...mapped.filter((language) => language.code !== languageStoreDefaultLanguageCode)];
  }
}

function getDefaultLanguageCatalogEntry() {
  return getLanguageCatalogEntry(languageStoreDefaultLanguageCode) ?? languageStoreCatalog[0];
}

function buildPrompt(input: {
  languageStoreEnabled: boolean;
  billingStatus: string;
  remainingAdditionalLanguageSlots: number;
}) {
  if (input.billingStatus !== "active" && input.billingStatus !== "trialing") {
    return {
      kind: "billing_attention" as const,
      title: "Billing attention required",
      message: "Language activation changes are paused until the workspace billing state is active or trialing again.",
    };
  }

  if (!input.languageStoreEnabled) {
    return {
      kind: "upgrade" as const,
      title: "Upgrade to unlock Language Store",
      message: "Starter does not include additional worker languages. Upgrade to Pro or Business to activate them.",
    };
  }

  if (input.remainingAdditionalLanguageSlots <= 0) {
    return {
      kind: "add_on" as const,
      title: "All language slots are in use",
      message: "Add a Language Slot Pack or deactivate an existing language to free capacity for another worker language.",
    };
  }

  return {
    kind: null,
    title: null,
    message: null,
  };
}

function assertLanguageCanBeManaged(languageCode: string) {
  if (!isLanguageStoreCatalogCode(languageCode) || languageCode === languageStoreDefaultLanguageCode) {
    apiError(
      400,
      "language_store_language_not_manageable",
      "Only supported non-default organization languages can be activated or deactivated.",
    );
  }
}

function assertLanguageActivationAllowed(
  snapshot: LanguageStoreProductSurfaceSnapshot,
  languageCode: string,
) {
  if (!snapshot.can_manage_languages) {
    apiError(
      403,
      "language_store_manage_forbidden",
      "Only owners and admins can activate organization languages.",
    );
  }

  const card = snapshot.languages.find((language) => language.code === languageCode);
  if (!card || !card.can_activate) {
    apiError(
      403,
      "language_store_activation_forbidden",
      card?.locked_reason ?? "This language cannot be activated for the current workspace state.",
    );
  }
}
