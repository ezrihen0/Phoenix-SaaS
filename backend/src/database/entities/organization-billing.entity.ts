import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import type { OrganizationBillingStatus, PhoenixPlanKey } from "../../billing/billing.constants";
import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "organization_billing" })
export class OrganizationBillingEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  organization_id!: string;

  @OneToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id" })
  organization!: OrganizationEntity;

  @Column({ type: "varchar", length: 64, nullable: true })
  clover_customer_id!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  clover_plan_id!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  clover_subscription_id!: string | null;

  @Column({ type: "varchar", length: 32 })
  plan_key!: PhoenixPlanKey;

  @Column({ type: "varchar", length: 32 })
  billing_status!: OrganizationBillingStatus;

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
  last_webhook_at!: Date | null;

  @Column({ type: "varchar", length: 512, nullable: true })
  attention_reason!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;
}
