import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

import { runtimeJsonColumnType, runtimeTimestampColumnType } from "../database-dialect";

export const automationLogLevels = ["info", "warning", "error", "system"] as const;
export type AutomationLogLevel = (typeof automationLogLevels)[number];

@Entity({ name: "automation_logs" })
export class AutomationLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 64 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  rule_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  run_id!: string | null;

  @Column({
    type: "enum",
    enum: automationLogLevels,
    default: "info",
  })
  level!: AutomationLogLevel;

  @Column({ type: "text" })
  message!: string;

  @Column({ type: runtimeJsonColumnType, nullable: true })
  metadata_json!: Record<string, unknown> | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;
}
