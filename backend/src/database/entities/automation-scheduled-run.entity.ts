import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { runtimeTimestampColumnType } from "../database-dialect";

export const automationScheduledRunStatuses = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "skipped",
  "expired",
] as const;
export type AutomationScheduledRunStatus = (typeof automationScheduledRunStatuses)[number];

@Entity({ name: "automation_scheduled_runs" })
export class AutomationScheduledRunEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 64 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  rule_id!: string;

  @Column({ type: "varchar", length: 64 })
  trigger_entity_type!: string;

  @Column({ type: "varchar", length: 36 })
  trigger_entity_id!: string;

  @Column({ type: "varchar", length: 120 })
  anchor_field!: string;

  @Column({ type: runtimeTimestampColumnType, precision: 6 })
  scheduled_for!: Date;

  @Column({
    type: "enum",
    enum: automationScheduledRunStatuses,
    default: "pending",
  })
  status!: AutomationScheduledRunStatus;

  @Column({ type: "int", default: 0 })
  attempts!: number;

  @Column({ type: "text", nullable: true })
  last_error!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  idempotency_key!: string | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;
}
