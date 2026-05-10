import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { runtimeJsonColumnType, runtimeTimestampColumnType } from "../database-dialect";

export const automationRunStatuses = [
  "queued",
  "scheduled",
  "running",
  "pending_approval",
  "completed",
  "failed",
  "cancelled",
  "skipped",
] as const;
export type AutomationRunStatus = (typeof automationRunStatuses)[number];

@Entity({ name: "automation_runs" })
export class AutomationRunEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 64 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  rule_id!: string;

  @Column({ type: "int", default: 1 })
  rule_version!: number;

  @Column({ type: "varchar", length: 36, nullable: true })
  event_id!: string | null;

  @Column({ type: "varchar", length: 64 })
  trigger_entity_type!: string;

  @Column({ type: "varchar", length: 36 })
  trigger_entity_id!: string;

  @Column({
    type: "enum",
    enum: automationRunStatuses,
    default: "queued",
  })
  status!: AutomationRunStatus;

  @Column({ type: runtimeJsonColumnType, nullable: true })
  rule_snapshot_json!: Record<string, unknown> | null;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  started_at!: Date | null;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  completed_at!: Date | null;

  @Column({ type: "text", nullable: true })
  failure_reason!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  idempotency_key!: string | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;
}
