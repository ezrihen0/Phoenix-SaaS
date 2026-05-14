import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

import type { BillingProvider, BillingPlanKey } from "../../billing/billing.constants";
import type { BillingSubscriptionItemKind } from "../../billing/language-store-entitlement.helpers";
import { BillingAccountEntity } from "./billing-account.entity";
import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "billing_account_subscription_items" })
@Unique("ux_billing_account_subscription_items_provider_item", ["provider", "provider_subscription_item_id"])
export class BillingAccountSubscriptionItemEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  billing_account_id!: string;

  @Column({ type: "varchar", length: 32 })
  provider!: BillingProvider;

  @Column({ type: "varchar", length: 128, nullable: true })
  provider_subscription_id!: string | null;

  @Column({ type: "varchar", length: 128 })
  provider_subscription_item_id!: string;

  @Column({ type: "varchar", length: 128, nullable: true })
  provider_price_id!: string | null;

  @Column({ type: "varchar", length: 64 })
  item_kind!: BillingSubscriptionItemKind;

  @Column({ type: "varchar", length: 32, nullable: true })
  plan_key!: BillingPlanKey | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  allocated_organization_id!: string | null;

  @Column({ type: "int", default: 1 })
  quantity!: number;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "datetime", precision: 6, nullable: true })
  current_period_start!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  current_period_end!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  last_provider_sync_at!: Date | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => BillingAccountEntity, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "billing_account_id", referencedColumnName: "id" })
  billing_account?: BillingAccountEntity;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "allocated_organization_id", referencedColumnName: "id" })
  allocated_organization?: OrganizationEntity | null;
}
