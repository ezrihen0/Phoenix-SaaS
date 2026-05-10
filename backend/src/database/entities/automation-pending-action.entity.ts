import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { runtimeJsonColumnType, runtimeTimestampColumnType } from "../database-dialect";

export const automationPendingActionStatuses = [
  "pending",
  "approved",
  "dismissed",
  "edited",
  "sent",
  "failed",
  "expired",
] as const;
export type AutomationPendingActionStatus = (typeof automationPendingActionStatuses)[number];

@Entity({ name: "automation_pending_actions" })
export class AutomationPendingActionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 64 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  rule_id!: string;

  @Column({ type: "varchar", length: 36 })
  run_id!: string;

  @Column({ type: "varchar", length: 80 })
  type!: string;

  @Column({
    type: "enum",
    enum: automationPendingActionStatuses,
    default: "pending",
  })
  status!: AutomationPendingActionStatus;

  @Column({ type: "varchar", length: 64 })
  target_type!: string;

  @Column({ type: "varchar", length: 36 })
  target_id!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  related_entity_type!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  related_entity_id!: string | null;

  @Column({ type: runtimeJsonColumnType, nullable: true })
  preview_json!: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  approved_by_user_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  dismissed_by_user_id!: string | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;
}
