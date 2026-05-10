import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { runtimeJsonColumnType, runtimeTimestampColumnType } from "../database-dialect";

export const automationRiskLevels = ["low", "medium", "high"] as const;
export type AutomationRiskLevel = (typeof automationRiskLevels)[number];

export const automationTemplateStatuses = [
  "available",
  "draft",
  "active",
  "paused",
  "disabled",
  "coming_soon",
  "needs_setup",
  "failed",
] as const;
export type AutomationTemplateStatus = (typeof automationTemplateStatuses)[number];

export const automationRuleModes = ["auto_send", "manual_approval", "always_draft"] as const;
export type AutomationRuleMode = (typeof automationRuleModes)[number];

@Entity({ name: "automation_templates" })
export class AutomationTemplateEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 160, unique: true })
  template_key!: string;

  @Column({ type: "varchar", length: 120 })
  category!: string;

  @Column({ type: "varchar", length: 180 })
  title!: string;

  @Column({ type: "text" })
  description!: string;

  @Column({
    type: "enum",
    enum: automationRiskLevels,
  })
  risk_level!: AutomationRiskLevel;

  @Column({
    type: "enum",
    enum: automationTemplateStatuses,
    default: "available",
  })
  status!: AutomationTemplateStatus;

  @Column({
    type: "enum",
    enum: automationRuleModes,
    default: "manual_approval",
  })
  default_mode!: AutomationRuleMode;

  @Column({ type: runtimeJsonColumnType })
  definition_json!: Record<string, unknown>;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;
}
