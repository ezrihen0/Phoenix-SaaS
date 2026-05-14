import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import type { BillingPlanKey, BillingProvider, OrganizationBillingStatus } from "../../billing/billing.constants";
import { OrganizationEntity } from "./organization.entity";
import { OrganizationBillingEntity } from "./organization-billing.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "billing_accounts" })
export class BillingAccountEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  owner_user_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true, unique: true })
  anchor_organization_id!: string | null;

  @Column({ type: "varchar", length: 32 })
  plan_key!: BillingPlanKey;

  @Column({ type: "varchar", length: 32 })
  billing_status!: OrganizationBillingStatus;

  @Column({ type: "int", nullable: true })
  organization_limit!: number | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  billing_provider!: BillingProvider | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  provider_customer_id!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  provider_subscription_id!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  provider_price_id!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  clover_customer_id!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  clover_plan_id!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  clover_subscription_id!: string | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  trial_starts_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  trial_ends_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  current_period_start!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  current_period_end!: Date | null;

  @Column({ type: "boolean", default: false })
  cancel_at_period_end!: boolean;

  @Column({ type: "datetime", precision: 6, nullable: true })
  canceled_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  deactivated_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  last_clover_sync_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  last_provider_sync_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  last_webhook_at!: Date | null;

  @Column({ type: "varchar", length: 512, nullable: true })
  attention_reason!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "owner_user_id", referencedColumnName: "id" })
  owner_user?: UserEntity | null;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "anchor_organization_id", referencedColumnName: "id" })
  anchor_organization?: OrganizationEntity | null;

  @OneToMany(() => OrganizationBillingEntity, (coverage) => coverage.billing_account)
  organization_coverages?: OrganizationBillingEntity[];
}
