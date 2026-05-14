import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { BillingAccountEntity } from "../database/entities/billing-account.entity";
import { OrganizationEntity } from "../database/entities/organization.entity";
import { OrganizationBillingEntity } from "../database/entities/organization-billing.entity";
import {
  type OrganizationBillingStatus,
  type PhoenixPlanKey,
  resolveOrganizationLimitForPlan,
} from "./billing.constants";

type BillingCoverageSummary = {
  organization_id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

export type BillingContext = {
  coverage: OrganizationBillingEntity;
  account: BillingAccountEntity;
  coveredOrganizations: BillingCoverageSummary[];
  coveredOrganizationCount: number;
  organizationLimit: number | null;
  canAddOrganization: boolean;
};

type BillingAccountSeedInput = {
  ownerUserId?: string | null;
  planKey?: PhoenixPlanKey;
  billingStatus?: OrganizationBillingStatus;
  trialStartsAt?: Date | null;
  trialEndsAt?: Date | null;
};

@Injectable()
export class OrganizationBillingService {
  constructor(
    @InjectRepository(BillingAccountEntity)
    private readonly billingAccountsRepository: Repository<BillingAccountEntity>,
    @InjectRepository(OrganizationBillingEntity)
    private readonly billingRepository: Repository<OrganizationBillingEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly organizationsRepository: Repository<OrganizationEntity>,
  ) {}

  async getOrCreateContextForOrganization(
    organizationId: string,
    seed: BillingAccountSeedInput = {},
  ): Promise<BillingContext> {
    const coverage = await this.ensureCoverageForOrganization(organizationId, seed);
    const account = coverage.billing_account;

    if (!account) {
      apiError(500, "billing_account_missing", "Billing account linkage is incomplete for this organization.");
    }

    const coveredOrganizations = await this.listCoveredOrganizations(account.id);
    const organizationLimit = account.organization_limit ?? resolveOrganizationLimitForPlan(account.plan_key);
    const coveredOrganizationCount = coveredOrganizations.length;

    return {
      coverage,
      account,
      coveredOrganizations,
      coveredOrganizationCount,
      organizationLimit,
      canAddOrganization: organizationLimit === null || coveredOrganizationCount < organizationLimit,
    };
  }

  getPublicSummary(context: BillingContext) {
    const { coverage, account } = context;
    const providerCustomerId = account.provider_customer_id ?? account.clover_customer_id;
    const providerSubscriptionId = account.provider_subscription_id ?? account.clover_subscription_id;
    const providerPriceId = account.provider_price_id ?? account.clover_plan_id;
    const lastProviderSyncAt = account.last_provider_sync_at ?? account.last_clover_sync_at;

    return {
      organization_id: coverage.organization_id,
      billing_account_id: account.id,
      plan_key: account.plan_key,
      billing_status: account.billing_status,
      organization_limit: context.organizationLimit,
      covered_organization_count: context.coveredOrganizationCount,
      can_add_organization: context.canAddOrganization,
      covered_organizations: context.coveredOrganizations,
      trial_starts_at: account.trial_starts_at?.toISOString() ?? null,
      trial_ends_at: account.trial_ends_at?.toISOString() ?? null,
      current_period_start: account.current_period_start?.toISOString() ?? null,
      current_period_end: account.current_period_end?.toISOString() ?? null,
      cancel_at_period_end: account.cancel_at_period_end,
      canceled_at: account.canceled_at?.toISOString() ?? null,
      deactivated_at: account.deactivated_at?.toISOString() ?? null,
      billing_provider: account.billing_provider,
      last_provider_sync_at: lastProviderSyncAt?.toISOString() ?? null,
      provider_customer_id_suffix: maskId(providerCustomerId),
      provider_subscription_id_suffix: maskId(providerSubscriptionId),
      provider_price_id: providerPriceId,
      attention_reason: account.attention_reason,
    };
  }

  async updateFromReconciliation(
    organizationId: string,
    patch: Partial<Pick<BillingAccountEntity,
      | "billing_status"
      | "clover_plan_id"
      | "last_clover_sync_at"
      | "attention_reason"
      | "deactivated_at"
    >>,
  ) {
    const context = await this.getOrCreateContextForOrganization(organizationId);
    await this.updateBillingAccount(context.account.id, patch);
  }

  async setAttention(organizationId: string, reason: string | null, status?: OrganizationBillingStatus) {
    const context = await this.getOrCreateContextForOrganization(organizationId);
    await this.updateBillingAccount(
      context.account.id,
      {
        attention_reason: reason,
        ...(status ? { billing_status: status } : {}),
      },
    );
  }

  async updatePlanAndStatus(
    organizationId: string,
    planKey: PhoenixPlanKey,
    billingStatus: OrganizationBillingStatus,
  ) {
    const context = await this.getOrCreateContextForOrganization(organizationId);
    await this.updateBillingAccount(context.account.id, {
      plan_key: planKey,
      billing_status: billingStatus,
      organization_limit: resolveOrganizationLimitForPlan(planKey),
    });
  }

  async updateBillingFields(
    organizationId: string,
    patch: Partial<
      Pick<
        BillingAccountEntity,
        | "clover_customer_id"
        | "clover_subscription_id"
        | "clover_plan_id"
        | "plan_key"
        | "billing_status"
        | "last_clover_sync_at"
        | "attention_reason"
        | "deactivated_at"
        | "canceled_at"
        | "cancel_at_period_end"
      >
    >,
  ) {
    const context = await this.getOrCreateContextForOrganization(organizationId);
    const nextPatch = {
      ...patch,
      organization_limit: patch.plan_key
        ? resolveOrganizationLimitForPlan(patch.plan_key)
        : undefined,
    };
    await this.updateBillingAccount(context.account.id, nextPatch);
  }

  async updateBillingAccountFieldsById(
    billingAccountId: string,
    patch: Partial<
      Pick<
        BillingAccountEntity,
        | "billing_provider"
        | "provider_customer_id"
        | "provider_subscription_id"
        | "provider_price_id"
        | "plan_key"
        | "billing_status"
        | "current_period_start"
        | "current_period_end"
        | "cancel_at_period_end"
        | "canceled_at"
        | "deactivated_at"
        | "attention_reason"
        | "last_provider_sync_at"
        | "last_webhook_at"
      >
    >,
  ) {
    const nextPatch = {
      ...patch,
      organization_limit: patch.plan_key
        ? resolveOrganizationLimitForPlan(patch.plan_key)
        : undefined,
    };
    await this.updateBillingAccount(billingAccountId, nextPatch);
  }

  async getBillingAccountById(billingAccountId: string) {
    const account = await this.billingAccountsRepository.findOne({
      where: { id: billingAccountId.trim() },
    });

    if (!account) {
      apiError(404, "billing_account_not_found", "Billing account could not be found.");
    }

    return account;
  }

  async findBillingAccountByProviderSubscriptionId(providerSubscriptionId: string) {
    return this.billingAccountsRepository.findOne({
      where: { provider_subscription_id: providerSubscriptionId.trim() },
    });
  }

  async findBillingAccountByProviderCustomerId(providerCustomerId: string) {
    return this.billingAccountsRepository.findOne({
      where: { provider_customer_id: providerCustomerId.trim() },
    });
  }

  async createBillingAccountForOrganization(
    organizationId: string,
    seed: BillingAccountSeedInput = {},
  ): Promise<BillingContext> {
    const normalizedOrganizationId = organizationId.trim();
    await this.requireOrganization(normalizedOrganizationId);

    const planKey = seed.planKey ?? "starter";
    const billingStatus = seed.billingStatus ?? "trialing";
    const account = await this.billingAccountsRepository.save(
      this.billingAccountsRepository.create({
        owner_user_id: seed.ownerUserId?.trim() ?? null,
        anchor_organization_id: normalizedOrganizationId,
        plan_key: planKey,
        billing_status: billingStatus,
        organization_limit: resolveOrganizationLimitForPlan(planKey),
        billing_provider: null,
        provider_customer_id: null,
        provider_subscription_id: null,
        provider_price_id: null,
        clover_customer_id: null,
        clover_plan_id: null,
        clover_subscription_id: null,
        trial_starts_at: seed.trialStartsAt ?? null,
        trial_ends_at: seed.trialEndsAt ?? null,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        canceled_at: null,
        deactivated_at: null,
        last_clover_sync_at: null,
        last_provider_sync_at: null,
        last_webhook_at: null,
        attention_reason: null,
      }),
    );

    await this.linkOrganizationToBillingAccount(normalizedOrganizationId, account.id);
    return this.getOrCreateContextForOrganization(normalizedOrganizationId);
  }

  async linkOrganizationToBillingAccount(organizationId: string, billingAccountId: string) {
    const normalizedOrganizationId = organizationId.trim();
    const normalizedBillingAccountId = billingAccountId.trim();
    const [organization, account] = await Promise.all([
      this.requireOrganization(normalizedOrganizationId),
      this.billingAccountsRepository.findOne({ where: { id: normalizedBillingAccountId } }),
    ]);

    if (!account) {
      apiError(404, "billing_account_not_found", "Billing account could not be found.");
    }

    const existing = await this.billingRepository.findOne({
      where: { organization_id: normalizedOrganizationId },
    });

    const coverage = existing ?? this.billingRepository.create({
      organization_id: normalizedOrganizationId,
      organization,
    });

    this.applyAccountSnapshotToCoverage(coverage, account);
    coverage.billing_account_id = account.id;
    coverage.billing_account = account;
    coverage.organization = organization;

    await this.billingRepository.save(coverage);
    return this.getOrCreateContextForOrganization(normalizedOrganizationId);
  }

  async setBillingAccountOwner(billingAccountId: string, ownerUserId: string | null) {
    await this.billingAccountsRepository.update(
      { id: billingAccountId.trim() },
      { owner_user_id: ownerUserId?.trim() ?? null },
    );
  }

  async requireOrganizationSlotAvailable(billingAccountId: string) {
    const account = await this.billingAccountsRepository.findOne({
      where: { id: billingAccountId.trim() },
    });

    if (!account) {
      apiError(404, "billing_account_not_found", "Billing account could not be found.");
    }

    const organizationLimit = account.organization_limit ?? resolveOrganizationLimitForPlan(account.plan_key);
    if (organizationLimit === null) {
      return;
    }

    const coveredCount = await this.billingRepository.count({
      where: { billing_account_id: account.id },
    });

    if (coveredCount >= organizationLimit) {
      apiError(
        403,
        "organization_limit_reached",
        `The ${account.plan_key} plan currently allows up to ${organizationLimit} organization${organizationLimit === 1 ? "" : "s"} on this billing account.`,
      );
    }
  }

  async getBillingAccountIdForOrganization(organizationId: string) {
    const context = await this.getOrCreateContextForOrganization(organizationId);
    return context.account.id;
  }

  private async ensureCoverageForOrganization(
    organizationId: string,
    seed: BillingAccountSeedInput,
  ): Promise<OrganizationBillingEntity> {
    const normalizedOrganizationId = organizationId.trim();
    const existing = await this.billingRepository.findOne({
      where: { organization_id: normalizedOrganizationId },
      relations: {
        organization: true,
        billing_account: true,
      },
    });

    if (existing?.billing_account) {
      return existing;
    }

    const organization = existing?.organization ?? await this.requireOrganization(normalizedOrganizationId);
    const account = await this.createFallbackBillingAccount(normalizedOrganizationId, seed);

    const coverage = existing ?? this.billingRepository.create({
      organization_id: normalizedOrganizationId,
      organization,
    });

    coverage.organization = organization;
    coverage.billing_account_id = account.id;
    coverage.billing_account = account;
    this.applyAccountSnapshotToCoverage(coverage, account);

    return this.billingRepository.save(coverage);
  }

  private async createFallbackBillingAccount(
    organizationId: string,
    seed: BillingAccountSeedInput,
  ) {
    const existingAnchor = await this.billingAccountsRepository.findOne({
      where: { anchor_organization_id: organizationId },
    });

    if (existingAnchor) {
      return existingAnchor;
    }

    const planKey = seed.planKey ?? "starter";
    const billingStatus = seed.billingStatus ?? "trialing";

    return this.billingAccountsRepository.save(
      this.billingAccountsRepository.create({
        owner_user_id: seed.ownerUserId?.trim() ?? null,
        anchor_organization_id: organizationId,
        plan_key: planKey,
        billing_status: billingStatus,
        organization_limit: resolveOrganizationLimitForPlan(planKey),
        billing_provider: null,
        provider_customer_id: null,
        provider_subscription_id: null,
        provider_price_id: null,
        clover_customer_id: null,
        clover_plan_id: null,
        clover_subscription_id: null,
        trial_starts_at: seed.trialStartsAt ?? null,
        trial_ends_at: seed.trialEndsAt ?? null,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        canceled_at: null,
        deactivated_at: null,
        last_clover_sync_at: null,
        last_provider_sync_at: null,
        last_webhook_at: null,
        attention_reason: null,
      }),
    );
  }

  private async updateBillingAccount(
    billingAccountId: string,
    patch: Partial<BillingAccountEntity>,
  ) {
    const accountId = billingAccountId.trim();
    await this.billingAccountsRepository.update({ id: accountId }, patch);
    const next = await this.billingAccountsRepository.findOne({ where: { id: accountId } });
    if (!next) {
      apiError(404, "billing_account_not_found", "Billing account could not be found.");
    }
    await this.syncCoverageCacheForAccount(next);
  }

  private async syncCoverageCacheForAccount(account: BillingAccountEntity) {
    await this.billingRepository.update(
      { billing_account_id: account.id },
      {
        plan_key: account.plan_key,
        billing_status: account.billing_status,
        clover_customer_id: account.clover_customer_id,
        clover_plan_id: account.clover_plan_id,
        clover_subscription_id: account.clover_subscription_id,
        trial_starts_at: account.trial_starts_at,
        trial_ends_at: account.trial_ends_at,
        current_period_start: account.current_period_start,
        current_period_end: account.current_period_end,
        cancel_at_period_end: account.cancel_at_period_end,
        canceled_at: account.canceled_at,
        deactivated_at: account.deactivated_at,
        last_clover_sync_at: account.last_clover_sync_at,
        last_webhook_at: account.last_webhook_at,
        attention_reason: account.attention_reason,
      },
    );
  }

  private async listCoveredOrganizations(billingAccountId: string): Promise<BillingCoverageSummary[]> {
    const coverages = await this.billingRepository.find({
      where: { billing_account_id: billingAccountId },
      relations: {
        organization: true,
      },
      order: {
        created_at: "ASC",
      },
    });

    return coverages
      .filter((coverage) => coverage.organization)
      .map((coverage) => ({
        organization_id: coverage.organization_id,
        name: coverage.organization?.name ?? "Unknown organization",
        slug: coverage.organization?.slug ?? "",
        is_active: Boolean(coverage.organization?.is_active),
      }));
  }

  private applyAccountSnapshotToCoverage(
    coverage: OrganizationBillingEntity,
    account: BillingAccountEntity,
  ) {
    coverage.plan_key = account.plan_key;
    coverage.billing_status = account.billing_status;
    coverage.clover_customer_id = account.clover_customer_id;
    coverage.clover_plan_id = account.clover_plan_id;
    coverage.clover_subscription_id = account.clover_subscription_id;
    coverage.trial_starts_at = account.trial_starts_at;
    coverage.trial_ends_at = account.trial_ends_at;
    coverage.current_period_start = account.current_period_start;
    coverage.current_period_end = account.current_period_end;
    coverage.cancel_at_period_end = account.cancel_at_period_end;
    coverage.canceled_at = account.canceled_at;
    coverage.deactivated_at = account.deactivated_at;
    coverage.last_clover_sync_at = account.last_clover_sync_at;
    coverage.last_webhook_at = account.last_webhook_at;
    coverage.attention_reason = account.attention_reason;
  }

  private async requireOrganization(organizationId: string) {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      apiError(404, "organization_not_found", "Organization could not be found.");
    }

    return organization;
  }
}

function maskId(value: string | null | undefined) {
  if (!value || value.length < 4) {
    return null;
  }
  return `…${value.slice(-4)}`;
}
