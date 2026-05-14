import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { OrganizationEntity } from "./organization.entity";
import { UserEntity } from "./user.entity";
import type { MarketingAutomationActionTypeKey } from "../../marketing/marketing-automation.constants";
import { runtimeTimestampColumnType } from "../database-dialect";

@Entity({ name: "marketing_automation_rules" })
export class MarketingAutomationRuleEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "boolean", default: true })
  enabled!: boolean;

  /** JSON array of opportunity_type strings (subset of Phase 4 V1 types). */
  @Column({ type: "text" })
  trigger_opportunity_types_json!: string;

  @Column({ type: "varchar", length: 32 })
  action_type!: MarketingAutomationActionTypeKey;

  /** Draft title/intent/notes templates — bounded JSON object. */
  @Column({ type: "text" })
  action_config_json!: string;

  @Column({ type: "int", default: 0 })
  cooldown_seconds!: number;

  @Column({ type: "varchar", length: 36, nullable: true })
  created_by_user_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  updated_by_user_id!: string | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by_user_id", referencedColumnName: "id" })
  created_by_user?: UserEntity | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "updated_by_user_id", referencedColumnName: "id" })
  updated_by_user?: UserEntity | null;
}
