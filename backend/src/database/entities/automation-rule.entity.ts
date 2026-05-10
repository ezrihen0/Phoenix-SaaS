import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { runtimeJsonColumnType, runtimeTimestampColumnType } from "../database-dialect";
import { automationRuleModes, type AutomationRuleMode } from "./automation-template.entity";

export const automationRuleStatuses = ["active", "paused", "disabled", "failed"] as const;
export type AutomationRuleStatus = (typeof automationRuleStatuses)[number];

@Entity({ name: "automation_rules" })
export class AutomationRuleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 64 })
  organization_id!: string;

  @Column({ type: "varchar", length: 160, nullable: true })
  template_key!: string | null;

  @Column({ type: "varchar", length: 180 })
  name!: string;

  @Column({
    type: "enum",
    enum: automationRuleStatuses,
    default: "active",
  })
  status!: AutomationRuleStatus;

  @Column({ type: "boolean", default: true })
  enabled!: boolean;

  @Column({
    type: "enum",
    enum: automationRuleModes,
    default: "manual_approval",
  })
  mode!: AutomationRuleMode;

  @Column({ type: runtimeJsonColumnType })
  trigger_json!: Record<string, unknown>;

  @Column({ type: runtimeJsonColumnType })
  conditions_json!: Record<string, unknown>[];

  @Column({ type: runtimeJsonColumnType })
  action_json!: Record<string, unknown>;

  @Column({ type: runtimeJsonColumnType, nullable: true })
  timing_json!: Record<string, unknown> | null;

  @Column({ type: runtimeJsonColumnType, nullable: true })
  approval_json!: Record<string, unknown> | null;

  @Column({ type: "int", default: 1 })
  rule_version!: number;

  @Column({ type: "varchar", length: 36, nullable: true })
  created_by_user_id!: string | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;
}
