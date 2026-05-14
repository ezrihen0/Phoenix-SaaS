import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import type { BillingPlanKey, OrganizationBillingStatus } from "../../billing/billing.constants";
import { BillingAccountEntity } from "./billing-account.entity";
import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "organization_language_entitlements" })
export class OrganizationLanguageEntitlementEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  billing_account_id!: string;

  @Column({ type: "varchar", length: 32 })
  source_plan_key!: BillingPlanKey;

  @Column({ type: "varchar", length: 32 })
  billing_status!: OrganizationBillingStatus;

  @Column({ type: "boolean", default: false })
  language_store_enabled!: boolean;

  @Column({ type: "int", default: 0 })
  included_additional_language_slots!: number;

  @Column({ type: "int", default: 0 })
  addon_additional_language_slots!: number;

  @Column({ type: "int", default: 0 })
  total_additional_language_slots!: number;

  @Column({ type: "int", default: 0 })
  included_translation_units!: number;

  @Column({ type: "int", default: 0 })
  addon_translation_units!: number;

  @Column({ type: "int", default: 0 })
  total_translation_units!: number;

  @Column({ type: "datetime", precision: 6, nullable: true })
  last_reconciled_at!: Date | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => BillingAccountEntity, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "billing_account_id", referencedColumnName: "id" })
  billing_account?: BillingAccountEntity;
}
