import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import type { OrganizationBillingStatus, PhoenixPlanKey } from "./billing.constants";
import { OrganizationBillingEntity } from "../database/entities/organization-billing.entity";

@Injectable()
export class OrganizationBillingService {
  constructor(
    @InjectRepository(OrganizationBillingEntity)
    private readonly billingRepository: Repository<OrganizationBillingEntity>,
  ) {}

  /**
   * Ensures a row exists. New organizations without a migration backfill get
   * business + active so existing behavior is preserved until billing is tightened per org.
   */
  async getOrCreateProfile(organizationId: string): Promise<OrganizationBillingEntity> {
    const existing = await this.billingRepository.findOne({
      where: { organization_id: organizationId },
    });

    if (existing) {
      return existing;
    }

    const created = this.billingRepository.create({
      organization_id: organizationId,
      plan_key: "business",
      billing_status: "active",
      clover_customer_id: null,
      clover_plan_id: null,
      clover_subscription_id: null,
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      deactivated_at: null,
      last_clover_sync_at: null,
      last_webhook_at: null,
      attention_reason: null,
    });

    return this.billingRepository.save(created);
  }

  getPublicSummary(row: OrganizationBillingEntity) {
    return {
      organization_id: row.organization_id,
      plan_key: row.plan_key,
      billing_status: row.billing_status,
      trial_starts_at: row.trial_starts_at?.toISOString() ?? null,
      trial_ends_at: row.trial_ends_at?.toISOString() ?? null,
      current_period_start: row.current_period_start?.toISOString() ?? null,
      current_period_end: row.current_period_end?.toISOString() ?? null,
      cancel_at_period_end: row.cancel_at_period_end,
      canceled_at: row.canceled_at?.toISOString() ?? null,
      deactivated_at: row.deactivated_at?.toISOString() ?? null,
      last_clover_sync_at: row.last_clover_sync_at?.toISOString() ?? null,
      clover_customer_id_suffix: maskId(row.clover_customer_id),
      clover_subscription_id_suffix: maskId(row.clover_subscription_id),
      attention_reason: row.attention_reason,
    };
  }

  async updateFromReconciliation(
    organizationId: string,
    patch: Partial<Pick<OrganizationBillingEntity,
      | "billing_status"
      | "clover_plan_id"
      | "last_clover_sync_at"
      | "attention_reason"
      | "deactivated_at"
    >>,
  ) {
    await this.billingRepository.update({ organization_id: organizationId }, patch);
  }

  async setAttention(organizationId: string, reason: string | null, status?: OrganizationBillingStatus) {
    await this.billingRepository.update(
      { organization_id: organizationId },
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
    await this.billingRepository.update(
      { organization_id: organizationId },
      { plan_key: planKey, billing_status: billingStatus },
    );
  }

  async updateBillingFields(
    organizationId: string,
    patch: Partial<
      Pick<
        OrganizationBillingEntity,
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
    await this.billingRepository.update({ organization_id: organizationId }, patch);
  }
}

function maskId(value: string | null | undefined) {
  if (!value || value.length < 4) {
    return null;
  }
  return `…${value.slice(-4)}`;
}
